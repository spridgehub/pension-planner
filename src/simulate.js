// Household cash-flow engine. Runs one retirement option over many (economy, lifetime) paths.
//
// Everything is annual, payments at the start of each year. "Real" means in today's money,
// deflated by the scenario's own CPI path. All options for a household are evaluated on the
// same scenarios and the same sampled lifetimes, so differences come from the options alone.
import { annuityIncome, normaliseSpec, rpiWedge } from './annuity.js';
import { survivalCurve, sampleDeathYear } from './mortality.js';
import { makeStrategy, spendingMultiplier } from './drawdown.js';
import { incomeTax, TAX_2026 } from './tax.js';
import { uprating, FULL_NEW_STATE_PENSION_2026 } from './statePension.js';
import { portfolioReturn } from './economy.js';
import { makeRng } from './rng.js';

const START_YEAR = 2026;

// household = {
//   person:  { age, sex, health, statePension (a year, today's money), statePensionAge, otherIncome: [{ amount, indexed, survivorPct }] },
//   partner: same shape or null,
//   pensionPot, otherSavings,          // otherSavings: ISA / cash outside the pension, tax-free withdrawals
//   tfcPct: 0.25,                      // tax-free cash taken at the start and kept invested alongside
//   essentialSpending, survivorSpendingRatio: 0.7,  // net, today's money; ratio applies after first death
// }
export function withDefaults(h) {
  const person = (p) => p && ({ sex: 'male', health: 'average', statePension: FULL_NEW_STATE_PENSION_2026, statePensionAge: 67, otherIncome: [], ...p });
  return { tfcPct: 0.25, otherSavings: 0, essentialSpending: 0, survivorSpendingRatio: 0.7, ...h, person: person(h.person), partner: person(h.partner) };
}

// Paths: economic scenarios paired with lifetimes. With few scenarios (historical replay)
// each one is paired with several lifetimes so longevity risk is still sampled.
export function buildPaths(household, scenarios, { lifetimesPerScenario, seed = 11, fixedLifetimeToAge } = {}) {
  const h = withDefaults(household);
  const rng = makeRng(seed);
  const S1 = survivalCurve(h.person, START_YEAR, 80);
  const S2 = h.partner ? survivalCurve(h.partner, START_YEAR, 80) : null;
  const k = lifetimesPerScenario ?? (scenarios.length >= 500 ? 1 : Math.ceil(2000 / scenarios.length));
  const paths = [];
  for (const sc of scenarios) {
    for (let j = 0; j < k; j++) {
      const d1 = fixedLifetimeToAge ? fixedLifetimeToAge - h.person.age : sampleDeathYear(S1, rng.uniform());
      const d2 = h.partner ? (fixedLifetimeToAge ? fixedLifetimeToAge - h.partner.age : sampleDeathYear(S2, rng.uniform())) : 0;
      paths.push({ scenario: sc, d1, d2 });
    }
  }
  return paths;
}

// option = {
//   id, name,
//   annuities: [{ spec, share | purchase | targetNetIncome }],   // share of pension pot after tax-free cash
//   drawdown: { strategy, rate, mix: { equity, bonds, cash }, fee, profile, bridgeToStatePension } | null,
// }
export function prepareOption(option, household, basis) {
  const h = withDefaults(household);
  const tfc = Math.min(h.pensionPot * h.tfcPct, TAX_2026.lumpSumAllowance);
  let pension = h.pensionPot - tfc;
  const lives = { age: h.person.age, spouseAge: h.partner?.age ?? h.person.age - 3 };
  const bought = [];
  for (const a of option.annuities ?? []) {
    const spec = normaliseSpec(a.spec);
    const per1 = annuityIncome(1, spec, lives, basis);
    let purchase = a.purchase ?? (a.share != null ? a.share * (h.pensionPot - tfc) : 0);
    if (a.targetGrossIncome != null) purchase = a.targetGrossIncome / per1;
    purchase = Math.min(purchase, pension);
    pension -= purchase;
    bought.push({ spec, purchase, income: purchase * per1 });
  }
  return {
    option, household: h, annuities: bought,
    pensionPot: pension,                      // taxable drawdown pot
    freePot: tfc + h.otherSavings,            // tax-free pot (tax-free cash + ISA/savings)
    tfc,
  };
}

function escalationStep(spec, inflation, calendarYear, t) {
  const e = spec.escalation;
  if (t === 0) return 1;
  switch (e.kind) {
    case 'level': return 1;
    case 'fixed': return 1 + (e.rate ?? 0.03);
    case 'cpi': return 1 + Math.max(0, inflation);
    case 'rpi': return 1 + Math.max(0, inflation + rpiWedge(calendarYear));
    case 'lpi': return 1 + Math.min(e.cap ?? 0.05, Math.max(0, inflation + rpiWedge(calendarYear)));
  }
  return 1;
}

// Run one prepared option along one path. Returns per-year arrays (null once both have died).
export function runPath(prep, path, settings = {}) {
  const { household: h, option } = prep;
  const P = h.person, Q = h.partner;
  const sc = path.scenario.path;
  const H = Math.min(sc.length, settings.horizon ?? sc.length);
  const lastAlive = Math.max(path.d1, Q ? path.d2 : 0);
  const spPolicy = settings.statePensionUprating ?? 'tripleLock';
  const dd = option.drawdown;
  const fee = dd?.fee ?? 0.006;
  const strategy = dd ? makeStrategy(dd) : null;

  let price = 1, taxIndex = 1, spIndex = 1;
  let pension = prep.pensionPot, free = prep.freePot;
  const startPot = pension + free;
  let prevW = 0, lastReturn = 0, lastInflation = 0;
  const ann = prep.annuities.map((a) => ({ ...a, index: 1, paid: 0 }));
  const other = [P, Q].filter(Boolean).flatMap((x, who) => x.otherIncome.map((o) => ({ ...o, who, index: 1 })));

  const net = [], gross = [], pot = [], floorGap = [];
  let legacy = 0, depletedYear = null, shortfall = false, shortfallPostSPA = false, worstReal = Infinity;
  const spaYear = Math.max(P.statePensionAge - P.age, Q ? Q.statePensionAge - Q.age : 0);

  for (let t = 0; t < H; t++) {
    const year = START_YEAR + t;
    const a1 = t < path.d1, a2 = Q ? t < path.d2 : false;
    const row = sc[t];
    if (t > 0) {
      const inf = sc[t - 1].inflation;
      price *= 1 + inf;
      spIndex *= 1 + uprating(inf, spPolicy);
      if (year - 1 > TAX_2026.lastFrozenYear) taxIndex *= 1 + inf;
      for (const o of other) if (o.indexed) o.index *= 1 + inf;
    }
    for (const a of ann) a.index *= escalationStep(a.spec, t > 0 ? sc[t - 1].inflation : 0, year, t);

    // Value protection: lump sum to the estate in the year the annuitant dies.
    if (t === path.d1) for (const a of ann) if (a.spec.valueProtectionPct > 0) legacy += Math.max(0, a.spec.valueProtectionPct * a.purchase - a.paid) / price;

    if (!a1 && !a2) {
      // Both gone: remaining guaranteed payments and the pot go to the estate.
      if (t === lastAlive) {
        for (const a of ann) {
          if (a.spec.guaranteeYears > t) {
            let rem = 0, idx = a.index;
            for (let s = t; s < a.spec.guaranteeYears; s++) rem += a.income * idx; // nominal, near-term
            legacy += rem / price;
          }
        }
        legacy += (pension + free) / price;
      }
      net.push(null); gross.push(null); pot.push(null); floorGap.push(null);
      continue;
    }

    // Guaranteed income by recipient (0 = person, 1 = partner).
    const inc = [0, 0];
    if (a1 && P.age + t >= P.statePensionAge) inc[0] += P.statePension * spIndex;
    if (a2 && Q.age + t >= Q.statePensionAge) inc[1] += Q.statePension * spIndex;
    for (const o of other) {
      const alive = o.who === 0 ? a1 : a2;
      if (alive) inc[o.who] += o.amount * o.index;
      else if (o.survivorPct && (o.who === 0 ? a2 : a1)) inc[1 - o.who] += o.amount * o.index * o.survivorPct;
    }
    for (const a of ann) {
      let pay = 0, to = a1 ? 0 : 1;
      if (t < a.spec.guaranteeYears) pay = a.income * a.index;
      else if (a1) pay = a.income * a.index;
      else if (a.spec.life === 'joint' && a2) pay = a.income * a.index * a.spec.survivorPct;
      if (pay > 0) { inc[to] += pay; a.paid += pay; }
    }

    // Drawdown withdrawal.
    let w = 0;
    const potNow = pension + free;
    if (strategy && potNow > 0) {
      const st = { pot: potNow, prev: prevW, lastInflation, lastReturn };
      let target = t === 0 || prevW === 0 ? strategy.first(st) : strategy.next(st);
      prevW = target;
      target *= spendingMultiplier(P.age + t, dd.profile);
      if (dd.bridgeToStatePension) {
        if (a1 && P.age + t < P.statePensionAge) target += P.statePension * spIndex;
        if (a2 && Q.age + t < Q.statePensionAge) target += Q.statePension * spIndex;
      }
      w = Math.min(target, potNow);
      if (w < target - 1 && depletedYear === null) depletedYear = t;
    } else if (strategy && startPot > 0 && depletedYear === null) depletedYear = t;

    const fromFree = potNow > 0 ? w * (free / potNow) : 0;
    const fromPension = w - fromFree;
    free -= fromFree; pension -= fromPension;
    const owner = a1 ? 0 : 1;
    inc[owner] += fromPension;

    const tax = incomeTax(inc[0], taxIndex) + incomeTax(inc[1], taxIndex);
    const g = inc[0] + inc[1] + fromFree;
    const n = g - tax;
    const real = n / price;
    const need = h.essentialSpending * (a1 && (a2 || !Q) ? 1 : (Q ? h.survivorSpendingRatio : 1));
    if (real < need - 1) { shortfall = true; if (t >= spaYear) shortfallPostSPA = true; }
    worstReal = Math.min(worstReal, real);
    net.push(real); gross.push(g / price); floorGap.push(real - need);

    // Investment growth over the year.
    const r = dd ? portfolioReturn(row, dd.mix ?? { equity: 0.6 }) - fee : 0;
    pension = Math.max(0, pension * (1 + r));
    free = Math.max(0, free * (1 + r));
    pot.push((pension + free) / (price * (1 + row.inflation)));
    lastReturn = r; lastInflation = row.inflation;
  }
  if (lastAlive >= H) legacy += (pension + free) / (price * (1 + sc[H - 1].inflation));
  return { net, gross, pot, floorGap, legacy, depletedYear, shortfall, shortfallPostSPA, worstReal, lastAlive };
}

const pct = (sorted, p) => {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
export const PERCENTILES = { prudent: 0.1, cautious: 0.25, likely: 0.5, good: 0.75, upside: 0.9 };

export function summariseRuns(prep, runs, household) {
  const h = withDefaults(household);
  const H = Math.max(...runs.map((r) => r.net.length));
  const byYear = [];
  for (let t = 0; t < H; t++) {
    const inc = runs.map((r) => r.net[t]).filter((v) => v != null).sort((a, b) => a - b);
    const pot = runs.map((r) => r.pot[t]).filter((v) => v != null).sort((a, b) => a - b);
    if (inc.length < runs.length * 0.01) break;
    const q = (arr) => Object.fromEntries(Object.entries(PERCENTILES).map(([k, p]) => [k, pct(arr, p)]));
    byYear.push({ age: h.person.age + t, alive: inc.length / runs.length, income: q(inc), pot: q(pot) });
  }
  const sorted = (f) => runs.map(f).sort((a, b) => a - b);
  const q = (arr) => Object.fromEntries(Object.entries(PERCENTILES).map(([k, p]) => [k, pct(arr, p)]));
  const lifetime = sorted((r) => r.net.reduce((a, v) => a + (v ?? 0), 0));
  const hasPot = prep.pensionPot + prep.freePot > 0 && prep.option.drawdown;
  return {
    id: prep.option.id,
    name: prep.option.name,
    annuities: prep.annuities.map((a) => ({ spec: a.spec, purchase: a.purchase, income: a.income })),
    investedAtStart: prep.pensionPot + prep.freePot,
    tfc: prep.tfc,
    firstYearIncome: q(sorted((r) => r.net[0])),
    byYear,
    lifetimeIncome: q(lifetime),
    legacy: { ...q(sorted((r) => r.legacy)), mean: runs.reduce((a, r) => a + r.legacy, 0) / runs.length, pZero: runs.filter((r) => r.legacy < 1).length / runs.length },
    pShortfall: runs.filter((r) => r.shortfall).length / runs.length,
    pShortfallAfterStatePension: runs.filter((r) => r.shortfallPostSPA).length / runs.length,
    pDepleted: hasPot ? runs.filter((r) => r.depletedYear !== null && r.depletedYear < r.lastAlive).length / runs.length : 0,
    worstIncome: q(sorted((r) => r.worstReal)),
  };
}

export function simulateOption(option, household, paths, basis, settings) {
  const prep = prepareOption(option, household, basis);
  const runs = paths.map((p) => runPath(prep, p, settings));
  return { prep, runs, summary: summariseRuns(prep, runs, household) };
}
