// Parking money for one to five years: easy-access savings or a money market fund, a cash ISA,
// a short conventional gilt held to maturity, and a short index-linked gilt. Returns before tax,
// after tax (for a given rate on savings income) and after inflation.
// Simplifications: savings interest is taxed in full (the personal savings allowance is ignored);
// index-linked returns use the quoted real yield plus an RPI assumption (CPI plus about 1 point
// until RPI is aligned with CPIH in 2030), and their small coupons' tax is ignored.
import { GILTS, LINKERS, giltHolding, settlementDate } from './gilts.js';

const YEAR = 365.25 * 864e5;
const rpiFor = (cpi, years) => {
  const pre = Math.max(0, Math.min(years, (Date.UTC(2030, 1, 1) - Date.now()) / YEAR));
  return cpi + (pre * 0.009 + (years - pre) * 0.001) / years;
};

export function parkingOptions({ amount = 10000, years = 2, taxRate = 0.4, inflation = 0.03, savingsRate = 0.04 } = {}) {
  const settle = settlementDate(new Date());
  const real = (n) => (1 + n) / (1 + inflation) - 1;
  const row = (o) => ({ ...o, real: real(o.net), end: amount * Math.pow(1 + o.net, years), endReal: amount * Math.pow((1 + o.net) / (1 + inflation), years) });
  const out = [];
  out.push(row({ id: 'savings', name: 'Easy-access savings or money market fund', detail: `${(savingsRate * 100).toFixed(2)}% variable`, gross: savingsRate, net: savingsRate * (1 - taxRate), certainty: 'Rate can change at any time', access: 'Any time' }));
  out.push(row({ id: 'isa', name: 'Cash ISA', detail: 'same rate, no tax (limit £20,000 a year; £12,000 in cash for under-65s from April 2027)', gross: savingsRate, net: savingsRate, certainty: 'Rate can change at any time', access: 'Any time' }));
  // Conventional gilt maturing closest to the horizon; among close ones, the best after tax.
  const target = settle.getTime() + years * YEAR;
  const near = GILTS.filter((g) => Math.abs(Date.parse(g.maturity) - target) < 0.6 * YEAR && Date.parse(g.maturity) > settle.getTime() + 0.25 * YEAR);
  const pool = near.length ? near : [...GILTS].filter((g) => Date.parse(g.maturity) > settle.getTime()).sort((a, b) => Math.abs(Date.parse(a.maturity) - target) - Math.abs(Date.parse(b.maturity) - target)).slice(0, 1);
  const best = pool.map((g) => ({ g, h: giltHolding(g, amount, { settle, taxRate }) })).sort((a, b) => b.h.netYield - a.h.netYield)[0];
  if (best) out.push(row({ id: 'gilt', name: 'Short gilt, held to maturity', detail: `${best.g.name.replace('Treasury ', '')} at ${best.g.price.toFixed(2)}, matures ${best.g.maturity}`, gross: best.h.yield, net: best.h.netYield, certainty: 'Fixed in pounds if held to maturity', access: 'Sell any day at the market price', gilt: best.g }));
  // Index-linked gilt closest to the horizon.
  const lk = [...LINKERS].filter((g) => Date.parse(g.maturity) > settle.getTime() + 0.25 * YEAR).sort((a, b) => Math.abs(Date.parse(a.maturity) - target) - Math.abs(Date.parse(b.maturity) - target))[0];
  if (lk) {
    const yrs = (Date.parse(lk.maturity) - settle.getTime()) / YEAR, rpi = rpiFor(inflation, yrs);
    const nominal = (1 + lk.realYield) * (1 + rpi) - 1;
    out.push(row({ id: 'linker', name: 'Short index-linked gilt', detail: `${lk.name.replace('Treasury Index-Linked ', 'IL ')}, real yield ${(lk.realYield * 100).toFixed(2)}% plus RPI, matures ${lk.maturity}`, gross: nominal, net: nominal - lk.coupon * taxRate, certainty: 'Fixed after inflation (RPI) if held to maturity', access: 'Sell any day at the market price', linker: lk, rpi }));
  }
  return out;
}
