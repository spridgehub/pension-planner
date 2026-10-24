// Gilts held outside a pension or ISA (e.g. from tax-free cash or savings).
//
// The coupon is taxed as income but the gain from buying below par and holding to
// redemption is free of Capital Gains Tax. Low-coupon gilts priced below 100 return mostly
// as tax-free gain, so a higher-rate taxpayer can get a far better after-tax return than
// from a savings account or a high-coupon gilt at the same gross yield.

// Indicative clean prices (giltcalculator.co.uk snapshot, 15 Oct 2026). Replace with live
// prices from a broker or the DMO before relying on them.
export const SAMPLE_GILTS = [
  { name: 'Treasury 0.125% 2028', ticker: 'TN28', coupon: 0.00125, maturity: '2028-01-31', price: 94.80 },
  { name: 'Treasury 1.625% 2028', ticker: 'TG28', coupon: 0.01625, maturity: '2028-10-22', price: 94.13 },
  { name: 'Treasury 0.5% 2029', ticker: 'TG29', coupon: 0.005, maturity: '2029-01-31', price: 90.89 },
  { name: 'Treasury 0.375% 2030', ticker: 'TG30', coupon: 0.00375, maturity: '2030-10-22', price: 83.94 },
];
export const PRICES_AS_OF = '2026-10-15';

const years = (from, to) => (new Date(to) - new Date(from)) / (365.25 * 864e5);

// Semi-annual coupons; yields are annual-equivalent. Clean price ≈ dirty here (accrued ignored).
function cashflows(g, settle) {
  const T = years(settle, g.maturity);
  const flows = [];
  for (let t = T; t > 0; t -= 0.5) flows.push({ t, coupon: (g.coupon * 100) / 2 });
  flows.sort((a, b) => a.t - b.t);
  flows[flows.length - 1].redemption = 100;
  return { T, flows };
}

function irr(price, flows, couponTax = 0) {
  const pv = (y) => flows.reduce((a, f) => a + (f.coupon * (1 - couponTax) + (f.redemption ?? 0)) / Math.pow(1 + y, f.t), 0);
  let lo = -0.5, hi = 0.5;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (pv(m) > price) lo = m; else hi = m; }
  return lo;
}

// For a marginal income tax rate: gross yield, net yield, and the savings-account rate you'd
// need to match it after tax ("gross equivalent").
export function giltAfterTax(g, marginalRate, settle = '2026-10-24') {
  const { T, flows } = cashflows(g, settle);
  const gross = irr(g.price, flows, 0);
  const net = irr(g.price, flows, marginalRate);
  const taxFreeShare = (100 - g.price) / (100 - g.price + flows.reduce((a, f) => a + f.coupon, 0));
  return { ...g, years: T, grossYield: gross, netYield: net, grossEquivalent: net / (1 - marginalRate), taxFreeShareOfReturn: Math.max(0, taxFreeShare) };
}

// Ladder: buy enough of each gilt to produce `amountPerYear` at each maturity (e.g. to bridge
// years before State Pension age). Returns cost and the matching savings-account cost.
export function giltLadder(targets, gilts = SAMPLE_GILTS, marginalRate = 0.2, savingsRate = 0.04, settle = '2026-10-24') {
  const rows = targets.map(({ gilt, amount }) => {
    const g = gilts.find((x) => x.ticker === gilt);
    const a = giltAfterTax(g, marginalRate, settle);
    const nominal = amount / 100;                       // £100 nominal redeems for £100
    const cost = nominal * g.price;
    const netSavings = savingsRate * (1 - marginalRate);
    const savingsCost = amount / Math.pow(1 + netSavings, a.years);
    return { ...a, amount, cost, savingsCost, saving: savingsCost - cost };
  });
  return { rows, cost: rows.reduce((s, r) => s + r.cost, 0), savingsCost: rows.reduce((s, r) => s + r.savingsCost, 0) };
}
