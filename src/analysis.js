// Higher-level analyses built on the simulator.
import { annuityIncome, describeSpec } from './annuity.js';
import { survivalCurve } from './mortality.js';
import { historicalScenarios } from './economy.js';
import { buildPaths, prepareOption, runPath, simulateOption, withDefaults } from './simulate.js';
import { defaultOptions } from './options.js';

// Compare every option on one shared set of paths.
export { summarise as summariseHistory } from './economy.js';

export function compareOptions(household, scenarios, basis, { options, settings, pathOptions } = {}) {
  const paths = buildPaths(household, scenarios, pathOptions);
  const list = options ?? defaultOptions(household);
  return { paths: paths.length, results: list.map((o) => ({ ...simulateOption(o, household, paths, basis, settings).summary, group: o.group, floor: o.floor })) };
}

// The highest starting withdrawal rate (fixed in real terms) for which the money lasts as
// long as the household does in `confidence` of paths. Returns rate and first-year amount.
export function sustainableWithdrawal(household, scenarios, basis, { confidence = 0.9, mix = { equity: 0.6, bonds: 0.4 }, fee = 0.006, paths } = {}) {
  const ps = paths ?? buildPaths(household, scenarios);
  const failRate = (rate) => {
    const prep = prepareOption({ id: 'swr', drawdown: { strategy: 'fixedReal', rate, mix, fee } }, household, basis);
    let fails = 0;
    for (const p of ps) {
      const r = runPath(prep, p);
      if (r.depletedYear !== null && r.depletedYear < r.lastAlive) fails++;
    }
    return { fails: fails / ps.length, pot: prep.pensionPot + prep.freePot };
  };
  let lo = 0.01, hi = 0.12, pot = 0;
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2;
    const r = failRate(mid);
    pot = r.pot;
    if (r.fails <= 1 - confidence) lo = mid; else hi = mid;
  }
  return { confidence, rate: lo, firstYear: lo * pot };
}

// 100-year backtest: every historical start year, both lives assumed to reach `toAge`.
export function historicalBacktest(option, household, basis, { toAge = 95, fromYear = 1900 } = {}) {
  const h = withDefaults(household);
  const horizon = toAge - Math.min(h.person.age, h.partner?.age ?? Infinity);
  const scenarios = historicalScenarios({ fromYear, horizon }).filter((s) => s.complete);
  const prep = prepareOption(option, h, basis);
  return scenarios.map((sc) => {
    const r = runPath(prep, { scenario: sc, d1: toAge - h.person.age, d2: h.partner ? toAge - h.partner.age : 0 });
    const inc = r.net.filter((v) => v != null);
    return {
      startYear: sc.startYear,
      firstIncome: inc[0],
      minIncome: Math.min(...inc),
      finalIncome: inc[inc.length - 1],
      depletedAge: r.depletedYear !== null ? h.person.age + r.depletedYear : null,
      endPot: r.pot[inc.length - 1] ?? 0,
      income: inc,
      pot: r.pot.slice(0, inc.length),
    };
  });
}

// Level vs inflation-linked: what you give up at the start, and when (if ever) it pays back.
export function inflationProtection(household, basis, { purchase, life = 'single', survivorPct = 0.5, guaranteeYears = 5, inflationRates = [0.02, 0.03, 0.04, 0.05] } = {}) {
  const h = withDefaults(household);
  const lives = { age: h.person.age, spouseAge: h.partner?.age ?? h.person.age - 3 };
  const amount = purchase ?? h.pensionPot * (1 - h.tfcPct);
  const S = survivalCurve(h.person, 2026, 60);
  const kinds = [
    { kind: 'level' },
    { kind: 'fixed', rate: 0.03 },
    { kind: 'lpi', cap: 0.05 },
    { kind: 'cpi' },
    { kind: 'rpi' },
  ];
  const products = kinds.map((escalation) => {
    const spec = { life, survivorPct, guaranteeYears, escalation };
    return { spec, name: describeSpec(spec), income: annuityIncome(amount, spec, lives, basis) };
  });
  const level = products[0];
  const scenarios = inflationRates.map((inf) => {
    const rows = products.map((p) => {
      const g = { level: 0, fixed: 0.03, lpi: Math.min(inf + 0.001, 0.05), cpi: inf, rpi: inf + 0.003 }[p.spec.escalation.kind];
      let cumP = 0, cumL = 0, cumPR = 0, cumLR = 0, crossAge = null, payNominal = null, payReal = null;
      const real = {};
      for (let t = 0; t < 50; t++) {
        const pay = p.income * Math.pow(1 + g, t), lev = level.income;
        const defl = Math.pow(1 + inf, t);
        if (crossAge === null && pay > lev) crossAge = h.person.age + t;
        cumP += pay; cumL += lev; cumPR += pay / defl; cumLR += lev / defl;
        if (payNominal === null && cumP >= cumL && t > 0 && p !== level) payNominal = h.person.age + t;
        if (payReal === null && cumPR >= cumLR && t > 0 && p !== level) payReal = h.person.age + t;
        if ([0, 10, 20, 25, 30].includes(t)) real[h.person.age + t] = pay / defl;
      }
      const alive = (age) => (age == null ? null : S[Math.min(S.length - 1, age - h.person.age)]);
      return { name: p.name, startIncome: p.income, crossAge, breakEvenNominalAge: payNominal, breakEvenRealAge: payReal, pAliveAtBreakEvenReal: alive(payReal), real };
    });
    return { inflation: inf, rows };
  });
  return { purchase: amount, products, scenarios, costOfProtection: products.map((p) => ({ name: p.name, startIncome: p.income, vsLevel: p.income / level.income - 1 })) };
}

// Timeline/Bengen-style "safe max": for each historical start year, the highest starting
// withdrawal (fixed in real terms) that would have lasted until `toAge`.
export function safeMaxByStartYear(household, basis, { toAge = 95, fromYear = 1900, mix = { equity: 0.6, bonds: 0.4 }, fee = 0.006 } = {}) {
  const h = withDefaults(household);
  const horizon = toAge - Math.min(h.person.age, h.partner?.age ?? Infinity);
  const scenarios = historicalScenarios({ fromYear, horizon }).filter((s) => s.complete);
  return scenarios.map((sc) => {
    const path = { scenario: sc, d1: toAge - h.person.age, d2: h.partner ? toAge - h.partner.age : 0 };
    let lo = 0.005, hi = 0.2;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      const r = runPath(prepareOption({ id: 'smax', drawdown: { strategy: 'fixedReal', rate: mid, mix, fee } }, h, basis), path);
      if (r.depletedYear === null || r.depletedYear >= r.lastAlive) lo = mid; else hi = mid;
    }
    return { startYear: sc.startYear, rate: lo };
  });
}
