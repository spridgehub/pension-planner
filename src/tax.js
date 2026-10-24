// UK (rest of UK, not Scotland) income tax on pension income, 2026/27 onwards.
// Thresholds are frozen until 5 April 2031 (Budget 2025), then assumed to rise with CPI.
export const TAX_2026 = {
  personalAllowance: 12570,
  taperStart: 100000,
  basicBand: 37700,          // taxable income taxed at 20%
  additionalThreshold: 125140,
  rates: { basic: 0.2, higher: 0.4, additional: 0.45 },
  lastFrozenYear: 2030,      // 2030/31
  lumpSumAllowance: 268275,
};

// `index` scales thresholds: 1 while frozen, then cumulative CPI since they unfroze.
export function incomeTax(gross, index = 1, t = TAX_2026) {
  if (gross <= 0) return 0;
  let pa = t.personalAllowance * index;
  const taperStart = t.taperStart * index;
  if (gross > taperStart) pa = Math.max(0, pa - (gross - taperStart) / 2);
  const ti = Math.max(0, gross - pa);
  const brb = t.basicBand * index, art = t.additionalThreshold * index;
  return t.rates.basic * Math.min(ti, brb)
    + t.rates.higher * Math.max(0, Math.min(ti, art) - brb)
    + t.rates.additional * Math.max(0, ti - art);
}

export function marginalRate(gross, index = 1) {
  return (incomeTax(gross + 100, index) - incomeTax(gross, index)) / 100;
}
