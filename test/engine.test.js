import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../src/index.js';

const basis = E.MARKET_BASIS;
const market = JSON.parse(readFileSync(new URL('../data/market-rates-2026-10-22.json', import.meta.url)));
const close = (a, b, tol) => assert.ok(Math.abs(a / b - 1) < tol, `${a} vs ${b}`);

test('income tax matches HMRC 2026/27 figures', () => {
  assert.equal(E.incomeTax(12570), 0);
  assert.equal(Math.round(E.incomeTax(50270)), 7540);
  assert.equal(Math.round(E.incomeTax(100000)), 27432);
  assert.equal(Math.round(E.incomeTax(125140)), 42516);
});

test('ONS mortality gives sensible life expectancy', () => {
  const m = E.longevitySummary({ age: 65, sex: 'male' });
  const f = E.longevitySummary({ age: 65, sex: 'female' });
  assert.ok(m.lifeExpectancy > 84 && m.lifeExpectancy < 88, String(m.lifeExpectancy));
  assert.ok(f.lifeExpectancy > m.lifeExpectancy + 1.5);
  assert.ok(m.oneInTen > m.lifeExpectancy + 7);
});

test('calibrated basis reproduces the market table within 3%', () => {
  for (const row of market.rows) market.ages.forEach((age, i) => close(E.annuityIncome(market.purchase, row.spec, { age, spouseAge: age - 3 }, basis), row.income[i], 0.03));
});

test('every protective feature costs starting income', () => {
  const lives = { age: 65, spouseAge: 62 };
  const inc = (spec) => E.annuityIncome(100000, spec, lives, basis);
  const level = inc({ escalation: { kind: 'level' } });
  assert.ok(inc({ guaranteeYears: 10, escalation: { kind: 'level' } }) < level);
  assert.ok(inc({ valueProtectionPct: 1, escalation: { kind: 'level' } }) < level);
  assert.ok(inc({ life: 'joint', survivorPct: 0.5, escalation: { kind: 'level' } }) < level);
  assert.ok(inc({ life: 'joint', survivorPct: 1, escalation: { kind: 'level' } }) < inc({ life: 'joint', survivorPct: 0.5, escalation: { kind: 'level' } }));
  assert.ok(inc({ escalation: { kind: 'rpi' } }) < inc({ escalation: { kind: 'lpi', cap: 0.05 } }));
  assert.ok(inc({ escalation: { kind: 'lpi', cap: 0.05 } }) < level);
});

test('annuityCost inverts annuityIncome', () => {
  const spec = { life: 'single', escalation: { kind: 'cpi' } };
  close(E.annuityCost(E.annuityIncome(250000, spec, { age: 67 }, basis), spec, { age: 67 }, basis), 250000, 1e-9);
});

test('fixed-real drawdown with zero returns lasts exactly 25 years at 4%', () => {
  const flat = { label: 'flat', path: Array.from({ length: 40 }, () => ({ inflation: 0, equity: 0, bonds: 0, cash: 0 })) };
  const h = { person: { age: 65, statePension: 0 }, pensionPot: 100000, tfcPct: 0 };
  const prep = E.prepareOption({ id: 'x', drawdown: { strategy: 'fixedReal', rate: 0.04, fee: 0 } }, h, basis);
  const r = E.runPath(prep, { scenario: flat, d1: 40, d2: 0 });
  assert.equal(r.depletedYear, 25);
});

test('level annuity loses real value with inflation, CPI annuity holds it', () => {
  const inflating = { label: 'inf', path: Array.from({ length: 30 }, () => ({ inflation: 0.03, equity: 0, bonds: 0, cash: 0 })) };
  const h = { person: { age: 65, statePension: 0 }, pensionPot: 100000, tfcPct: 0 };
  const run = (kind) => E.runPath(E.prepareOption({ id: kind, annuities: [{ spec: { escalation: { kind } }, share: 1 }] }, h, basis), { scenario: inflating, d1: 30, d2: 0 });
  const lev = run('level'), cpi = run('cpi');
  close(lev.gross[20], lev.gross[0] / Math.pow(1.03, 20), 1e-9);
  close(cpi.gross[20], cpi.gross[0], 1e-9);
});

test('value protection pays the estate on early death', () => {
  const flat = { label: 'flat', path: Array.from({ length: 30 }, () => ({ inflation: 0, equity: 0, bonds: 0, cash: 0 })) };
  const h = { person: { age: 65, statePension: 0 }, pensionPot: 100000, tfcPct: 0 };
  const prep = E.prepareOption({ id: 'vp', annuities: [{ spec: { valueProtectionPct: 1, escalation: { kind: 'level' } }, share: 1 }] }, h, basis);
  const r = E.runPath(prep, { scenario: flat, d1: 2, d2: 0 });
  close(r.legacy, 100000 - 2 * prep.annuities[0].income, 1e-9);
});

test('layered floor covers essential spending after State Pension age', () => {
  const h = { person: { age: 67, sex: 'male' }, partner: { age: 67, sex: 'female' }, pensionPot: 500000, essentialSpending: 30000 };
  const gap = E.essentialGap(h);
  assert.ok(gap.gross > 0);
  const sp = E.FULL_NEW_STATE_PENSION_2026;
  const net = sp + gap.gross - E.incomeTax(sp + gap.gross) + sp - E.incomeTax(sp);
  close(net, 30000, 1e-4);
});

test('historical backtest covers about a century of start years', () => {
  const bt = E.historicalBacktest({ id: 'd', drawdown: { strategy: 'fixedReal', rate: 0.03, mix: { equity: 0.6 } } }, { person: { age: 65 }, pensionPot: 100000, tfcPct: 0 }, basis, { toAge: 95 });
  assert.ok(bt.length >= 90);
  assert.equal(bt[0].startYear, 1900);
});

test('quote anchoring reproduces the quoted rate', () => {
  const spec = { life: 'single', escalation: { kind: 'level' } };
  const q = { spec, purchase: 100000, lives: { age: 66 }, annualIncome: 8500, provider: 'Test' };
  const anchored = E.anchorBasis(basis, [q]);
  close(E.annuityIncome(100000, spec, { age: 66 }, anchored), 8500, 1e-9);
  assert.equal(E.parseQuoteText('Aviva  £8,512.40 a year\nJust £712.10 per month')[1].annualIncome, 712.1 * 12);
});

test('low-coupon gilt beats high coupon after tax for a higher-rate payer', () => {
  const [low, high] = ['TN28', 'TG28'].map((t) => E.giltAfterTax(E.SAMPLE_GILTS.find((g) => g.ticker === t), 0.4));
  assert.ok(low.taxFreeShareOfReturn > 0.8);
  assert.ok(low.netYield / low.grossYield > high.netYield / high.grossYield);
});

test('regimes: today classifies from live data and conditioned futures open in matching years', () => {
  assert.ok(Object.keys(E.REGIMES).includes(E.todaysRegime(E.MARKET_NOW)));
  const years = E.regimeYears('likeToday');
  assert.ok(years.length > 10);
  const sc = E.bootstrapScenarios({ n: 50, horizon: 20, startYears: years });
  const starts = new Set(years.map((y) => JSON.stringify(E.HISTORY.find((r) => r.year === y))));
  for (const s of sc) assert.ok(starts.has(JSON.stringify(s.path[0])));
});

test('live basis moves annuity rates with gilt yields', () => {
  const now = JSON.parse(JSON.stringify(E.MARKET_NOW));
  now.latest.gilt20.value += 0.01;
  const spec = { escalation: { kind: 'level' } };
  assert.ok(E.annuityIncome(100000, spec, { age: 65 }, E.liveBasis(E.MARKET_BASIS, now)) > E.annuityIncome(100000, spec, { age: 65 }, E.liveBasis()));
});

test('gilt pricing reproduces quoted yields from clean prices', () => {
  const settle = E.settlementDate(new Date('2026-10-24T20:00:00Z'));
  for (const g of E.GILTS.filter((x) => x.maturity > '2027-06-01')) {
    assert.ok(Math.abs(E.yieldFromClean(g, g.price, settle) - g.quotedYield) < 0.0006, `${g.name}`);
  }
});

test('gilt holding: semi-annual coupons, pull to par, rate moves wash out at maturity', () => {
  const settle = E.settlementDate(new Date('2026-10-24T20:00:00Z'));
  const g = E.GILTS.find((x) => x.ticker === 'TG30');
  const h = E.giltHolding(g, 50000, { settle, taxRate: 0.4 });
  close(h.couponEvery6Months, h.nominal * g.coupon / 2, 1e-12);
  assert.equal(h.flows.length, 8);
  close(h.flows[0].net, h.flows[0].gross * 0.6, 1e-9);
  for (const bp of [-100, 0, 100]) close(E.valuePath(h, bp).at(-1).value, h.nominal, 1e-9);
  const [down, flat, up] = E.rateScenarios(h, '2028-10-26', [-50, 0, 50]);
  assert.ok(down.valueNow > flat.valueNow && flat.valueNow > up.valueNow);
  assert.ok(h.netYield > 0.04 && h.netYield < h.yield);
});

test('pensioner savings room: unused allowance + starting rate + PSA', () => {
  const r = E.savingsAllowance(12548);
  assert.deepEqual([Math.round(r.unusedPA), r.startingRate, r.psa, Math.round(r.total)], [22, 5000, 1000, 6022]);
  assert.equal(E.savingsAllowance(14570).startingRate, 3000);
  const g = E.GILTS.find((x) => x.ticker === 'TS29');
  const plan = E.incomePlan(g, 12548);
  close(plan.nominal * g.coupon, plan.total, 1e-9);
  assert.ok(E.taxOnInterest(plan.total, 12548) < 0.01);
  close(E.taxOnInterest(plan.total + 1000, 12548), 200, 1e-6);
});
