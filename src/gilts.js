// Gilt calculator: UK conventional gilts held outside a pension or ISA.
//
// Conventions (DMO): coupons paid semi-annually on the maturity day and six months either side;
// quoted (clean) prices exclude accrued interest; the buyer pays clean + accrued (dirty).
// Yields are semi-annual, as quoted. Ex-dividend periods are ignored.
//
// Tax: coupons are savings income, taxed at the holder's rate after the personal allowance,
// the starting rate for savings (£5,000, reduced by non-savings income above the allowance)
// and the personal savings allowance (£1,000 basic, £500 higher, £0 additional). The gain from
// buying below 100 and holding to redemption is free of Capital Gains Tax. So low-coupon gilts
// suit capital growth, and high-coupon gilts suit income that fits inside those allowances.
import gilts from '../data/gilts-2026-10-24.json' with { type: 'json' };
import { TAX_2026 } from './tax.js';

export const GILTS = gilts.gilts.map((g) => ({ ...g, ticker: g.ticker ?? g.name.replace('Treasury ', 'T ') }));
export const GILT_PRICES_AS_OF = gilts.asOf;
export const GILT_SOURCE = gilts.source;
export const LOW_COUPON = 0.02;   // below this a gilt's return is mostly tax-free gain
export const HIGH_COUPON = 0.035; // at or above this it is mostly taxable income

const DAY = 864e5;
const d = (s) => (s instanceof Date ? s : new Date(s + 'T00:00:00Z'));
const iso = (t) => new Date(t).toISOString().slice(0, 10);
function addMonths(date, n) {
  const x = new Date(date), day = x.getUTCDate();
  x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return x;
}

// UK settlement is T+1 business day.
export function settlementDate(trade = new Date()) {
  const x = new Date(Date.UTC(trade.getUTCFullYear(), trade.getUTCMonth(), trade.getUTCDate()));
  do { x.setUTCDate(x.getUTCDate() + 1); } while ([0, 6].includes(x.getUTCDay()));
  return x;
}

// All coupon dates after `from` up to maturity, plus the coupon date before `from`.
export function couponDates(g, from) {
  const mat = d(g.maturity);
  const out = [];
  let k = 0, c = mat;
  while (c > from) { out.unshift(c); k++; c = addMonths(mat, -6 * k); }
  return { previous: c, next: out };
}

export function accrued(g, settle) {
  const { previous, next } = couponDates(g, settle);
  if (!next.length) return 0;
  return (g.coupon * 100 / 2) * (settle - previous) / (next[0] - previous);
}

// Dirty price per £100 nominal at a semi-annual yield.
export function dirtyPrice(g, y, settle) {
  const { previous, next } = couponDates(g, settle);
  if (!next.length) return 100;
  const f = (next[0] - settle) / (next[0] - previous);
  const v = 1 / (1 + y / 2), c = g.coupon * 100 / 2;
  let p = 0;
  next.forEach((_, i) => { p += c * Math.pow(v, f + i); });
  return p + 100 * Math.pow(v, f + next.length - 1);
}
export const cleanPrice = (g, y, settle) => dirtyPrice(g, y, settle) - accrued(g, settle);

export function yieldFromClean(g, clean, settle) {
  let lo = -0.05, hi = 0.3;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (cleanPrice(g, m, settle) > clean) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// Modified duration: % price change for a 1% move in yield.
export function modifiedDuration(g, y, settle) {
  const h = 0.0001;
  return (dirtyPrice(g, y - h, settle) - dirtyPrice(g, y + h, settle)) / (2 * h * dirtyPrice(g, y, settle));
}

// Tax-free room for savings income this tax year, given other (non-savings) taxable income.
export function savingsAllowance(nonSavingsIncome, t = TAX_2026) {
  const pa = t.personalAllowance;
  const unusedPA = Math.max(0, pa - nonSavingsIncome);
  const startingRate = Math.max(0, 5000 - Math.max(0, nonSavingsIncome - pa));
  const band = nonSavingsIncome + unusedPA + startingRate > pa + t.basicBand ? 'higher' : 'basic';
  const psa = band === 'basic' ? 1000 : nonSavingsIncome > t.additionalThreshold ? 0 : 500;
  return { unusedPA, startingRate, psa, total: unusedPA + startingRate + psa, band };
}

// Tax on a year's gilt interest on top of other income (approximation: interest above the
// tax-free room is taxed at the rate band it falls in).
export function taxOnInterest(interest, nonSavingsIncome, t = TAX_2026) {
  const room = savingsAllowance(nonSavingsIncome, t).total;
  const taxable = Math.max(0, interest - room);
  const topOfBasic = t.personalAllowance + t.basicBand;
  const start = nonSavingsIncome + room;
  const inBasic = Math.max(0, Math.min(taxable, topOfBasic - start));
  return inBasic * t.rates.basic + (taxable - inBasic) * t.rates.higher;
}

// Buy `amount` (£, including accrued) of a gilt. Returns the holding and every cash flow.
// Tax on coupons: either a flat marginal `taxRate`, or computed per tax year from `otherIncome`.
export function giltHolding(g, amount, { settle = settlementDate(), taxRate = null, otherIncome = null, yieldShift = 0 } = {}) {
  const y0 = yieldFromClean(g, g.price, settle);
  const dirty = g.price + accrued(g, settle);
  const nominal = amount / dirty * 100;
  const coupon = nominal * g.coupon / 2;
  const { next } = couponDates(g, settle);
  const flows = next.map((t, i) => ({ date: iso(t), gross: coupon, redemption: i === next.length - 1 ? nominal : 0 }));
  // tax per UK tax year (6 April to 5 April)
  const taxYear = (s) => { const x = d(s); return x.getUTCMonth() > 3 || (x.getUTCMonth() === 3 && x.getUTCDate() >= 6) ? x.getUTCFullYear() : x.getUTCFullYear() - 1; };
  const byYear = {};
  for (const f of flows) (byYear[taxYear(f.date)] ??= []).push(f);
  for (const [, fs] of Object.entries(byYear)) {
    const total = fs.reduce((a, f) => a + f.gross, 0);
    const tax = otherIncome != null ? taxOnInterest(total, otherIncome) : total * (taxRate ?? 0);
    for (const f of fs) { f.tax = total ? tax * f.gross / total : 0; f.net = f.gross - f.tax; f.taxYear = `${taxYear(f.date)}/${String(taxYear(f.date) + 1).slice(2)}`; }
  }
  const grossIncome = flows.reduce((a, f) => a + f.gross, 0);
  const netIncome = flows.reduce((a, f) => a + f.net, 0);
  const years = (d(g.maturity) - settle) / (365.25 * DAY);
  // after-tax yield: IRR of -amount, net coupons, redemption
  const irr = (() => {
    let lo = -0.5, hi = 0.5;
    const pv = (r) => flows.reduce((a, f) => a + (f.net + f.redemption) / Math.pow(1 + r / 2, 2 * (d(f.date) - settle) / (365.25 * DAY)), 0);
    for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (pv(m) > amount) lo = m; else hi = m; }
    return (lo + hi) / 2;
  })();
  return {
    gilt: g, settle: iso(settle), amount, nominal, dirty, cleanPrice: g.price, accrued: accrued(g, settle),
    yield: y0, duration: modifiedDuration(g, y0, settle), years,
    couponEvery6Months: coupon, flows, grossIncome, netIncome,
    taxFreeGain: nominal - amount + accrued(g, settle) * nominal / 100, // redemption minus clean cost
    redemption: nominal, maturity: g.maturity,
    netYield: irr,
  };
}

// Capital value (clean, £) over time if the yield moves by `shiftBp` straight after buying and
// stays there. Every path ends at the nominal: held to maturity, the moves wash out.
export function valuePath(h, shiftBp = 0, { points = 60 } = {}) {
  const g = h.gilt, s = d(h.settle), mat = d(g.maturity);
  const y = h.yield + shiftBp / 10000;
  const out = [];
  for (let i = 0; i <= points; i++) {
    const t = new Date(s.getTime() + (mat - s) * i / points);
    const clean = i === points ? 100 : cleanPrice(g, y, t);
    out.push({ date: iso(t), value: h.nominal * clean / 100 });
  }
  return out;
}

// What the holding is worth at `horizon` (ISO date) under each yield move, with the net
// coupons received by then, against what was paid.
export function rateScenarios(h, horizon, shifts = [-200, -150, -100, -50, 0, 50, 100, 150, 200]) {
  const g = h.gilt, t = d(horizon) > d(g.maturity) ? d(g.maturity) : d(horizon);
  const received = h.flows.filter((f) => d(f.date) <= t);
  const income = received.reduce((a, f) => a + f.net, 0);
  const years = Math.max(1 / 365, (t - d(h.settle)) / (365.25 * DAY));
  return shifts.map((bp) => {
    const y = h.yield + bp / 10000;
    const atMaturity = t >= d(g.maturity);
    const capital = atMaturity ? h.nominal : h.nominal * cleanPrice(g, y, t) / 100;
    const valueNow = h.nominal * cleanPrice(g, y, d(h.settle)) / 100;
    const total = capital + income;
    return { bp, yield: y, valueNow, changeNow: valueNow - h.nominal * g.price / 100, capital, income, total,
      gain: total - h.amount, annualised: Math.pow(total / h.amount, 1 / years) - 1 };
  });
}

// Size a holding of `g` so its coupons fill this year's tax-free savings room.
export function incomePlan(g, nonSavingsIncome, settle = settlementDate()) {
  const room = savingsAllowance(nonSavingsIncome);
  const nominal = room.total / g.coupon;
  const dirty = g.price + accrued(g, settle);
  return { ...room, nominal, cost: nominal * dirty / 100, every6Months: room.total / 2 };
}

// ---- earlier API (used by insights and tests) ----
export const SAMPLE_GILTS = GILTS.filter((g) => ['TN28', 'TG28', 'TG29', 'TG30'].includes(g.ticker));
export const PRICES_AS_OF = GILT_PRICES_AS_OF.slice(0, 10);
export function giltAfterTax(g, marginalRate, settle = settlementDate()) {
  const s = d(typeof settle === 'string' ? settle : iso(settle));
  const h = giltHolding(g, 10000, { settle: s, taxRate: marginalRate });
  const coupons = h.grossIncome;
  const gain = h.nominal - h.amount;
  return { ...g, years: h.years, grossYield: h.yield, netYield: h.netYield, grossEquivalent: h.netYield / (1 - marginalRate),
    taxFreeShareOfReturn: Math.max(0, gain / (gain + coupons)) };
}
