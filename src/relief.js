// Pension tax relief, 2026/27 (rest of UK income tax; Scottish rates not modelled).
// How much more someone can pay into pensions this tax year with tax relief and without an annual
// allowance charge, what it saves in tax (and National Insurance through salary sacrifice), and the
// traps: the personal allowance taper (£100,000 to £125,140), the High Income Child Benefit Charge,
// the tapered annual allowance and the Money Purchase Annual Allowance.
//
// Rules (HMRC, PTM):
// - Relief on personal contributions is limited to 100% of relevant UK earnings, or £3,600 gross
//   if earnings are lower. Relief at source schemes add 20% even for non-taxpayers.
// - Annual allowance £60,000 for total inputs (personal gross + employer, incl. salary sacrifice).
//   Tapered by £1 for every £2 of adjusted income over £260,000 (to £10,000 at £360,000), but only
//   if threshold income is over £200,000. Threshold income deducts gross personal contributions and
//   adds back salary sacrificed; adjusted income adds employer contributions.
// - Unused allowance from the three previous years can be carried forward, after this year's is
//   used up, if the person was a member of a registered scheme in those years.
// - Once a pension has been flexibly accessed, money purchase inputs are capped at £10,000 (MPAA)
//   with no carry forward.
import { incomeTax, TAX_2026 } from './tax.js';

export const PENSION_2026 = {
  annualAllowance: 60000, taperedMin: 10000, thresholdIncome: 200000, adjustedIncome: 260000,
  mpaa: 10000, noEarningsCap: 3600,
  ni: { primaryThreshold: 12570, upperEarningsLimit: 50270, main: 0.08, upper: 0.02 },
  hicbc: { start: 60000, end: 80000 },
  prior: [{ year: '2023/24', allowance: 60000 }, { year: '2024/25', allowance: 60000 }, { year: '2025/26', allowance: 60000 }],
};

export function employeeNI(earnings, t = PENSION_2026.ni) {
  return t.main * Math.max(0, Math.min(earnings, t.upperEarningsLimit) - t.primaryThreshold)
    + t.upper * Math.max(0, earnings - t.upperEarningsLimit);
}
// High Income Child Benefit Charge: 1% of the benefit for every £200 of adjusted net income over £60,000.
export function hicbc(ani, childBenefit, t = PENSION_2026.hicbc) {
  if (!childBenefit || ani <= t.start) return 0;
  return childBenefit * Math.min(1, (ani - t.start) / (t.end - t.start));
}

export function annualAllowance(thresholdIncome, adjustedIncome, p = PENSION_2026) {
  if (thresholdIncome <= p.thresholdIncome || adjustedIncome <= p.adjustedIncome) return p.annualAllowance;
  return Math.max(p.taperedMin, p.annualAllowance - (adjustedIncome - p.adjustedIncome) / 2);
}

// h: { earnings, otherIncome, sacrifice, employer, personal (gross so far this year), childBenefit,
//      mpaa (flexibly accessed), prior: [{ allowance, used, member }], method: 'personal' | 'sacrifice' }
export function reliefPosition(h, p = PENSION_2026) {
  const earnings = Math.max(0, h.earnings || 0), other = Math.max(0, h.otherIncome || 0);
  const sac0 = Math.max(0, h.sacrifice || 0), employer = Math.max(0, h.employer || 0), personal0 = Math.max(0, h.personal || 0);
  const method = h.method === 'sacrifice' ? 'sacrifice' : 'personal';
  const carry = h.mpaa ? 0 : (h.prior ?? []).reduce((a, y) => a + (y.member === false ? 0 : Math.max(0, (y.allowance ?? p.annualAllowance) - (y.used ?? 0))), 0);

  // The position after an extra contribution x by the chosen method.
  const at = (x) => {
    const sac = sac0 + (method === 'sacrifice' ? x : 0), personal = personal0 + (method === 'personal' ? x : 0);
    const net = earnings - sac + other;                       // net income before relief-at-source deductions
    const ani = net - personal;                               // adjusted net income (PA taper, HICBC)
    const threshold = net - personal + sac;                   // salary sacrificed is added back
    const adjusted = net + employer + sac;                    // employer inputs, incl. sacrifice, added
    const aa = h.mpaa ? p.mpaa : annualAllowance(threshold, adjusted, p);
    const inputs = employer + sac + personal;
    const tax = incomeTax(ani) + hicbc(ani, h.childBenefit);
    const ni = employeeNI(earnings - sac);
    return { x, net, ani, threshold, adjusted, aa, inputs, room: aa + carry - inputs, tax, ni };
  };
  const now = at(0);
  // Personal contributions only get relief up to 100% of relevant UK earnings (or £3,600).
  const reliefCap = method === 'personal' ? Math.max(0, Math.max(earnings - sac0, p.noEarningsCap) - personal0) : Math.max(0, earnings - sac0 - p.ni.primaryThreshold);
  // Largest extra contribution that stays inside the allowance (the allowance can grow as x lowers
  // threshold income, so search rather than subtract).
  let lo = 0, hi = Math.max(0, reliefCap);
  if (at(hi).room < 0) { for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (at(m).room >= 0) lo = m; else hi = m; } hi = lo; }
  const maxRelieved = Math.max(0, Math.floor(hi));

  const saving = (x) => {
    const a = at(x);
    const taxSaved = now.tax - a.tax, niSaved = now.ni - a.ni;
    const basic = method === 'personal' ? Math.max(taxSaved, TAX_2026.rates.basic * Math.min(x, reliefCap)) : taxSaved;  // RAS adds 20% even for non-taxpayers
    const over = Math.max(0, -a.room);
    const charge = over > 0 ? incomeTax(a.ani + over) - incomeTax(a.ani) : 0;  // annual allowance charge at marginal rates
    return { x, taxSaved: basic, niSaved, charge, netCost: x - basic - niSaved + charge, ...a };
  };
  // Relief rate on each slice of contribution, for the chart.
  const step = Math.max(500, Math.ceil(Math.max(maxRelieved * 1.25, 5000) / 40 / 500) * 500);
  const slices = [];
  for (let x = 0; x < Math.max(maxRelieved * 1.25, 5000); x += step) {
    const a = saving(x), b = saving(x + step);
    slices.push({ from: x, to: x + step, rate: (b.taxSaved + b.niSaved - b.charge - (a.taxSaved + a.niSaved - a.charge)) / step, inside: x + step <= maxRelieved + 1 });
  }
  // Personal allowance trap: contributions that bring adjusted net income back to £100,000.
  const paTrap = now.ani > TAX_2026.taperStart ? Math.min(now.ani, TAX_2026.additionalThreshold) - TAX_2026.taperStart : 0;
  const cbTrap = h.childBenefit && now.ani > p.hicbc.start ? Math.min(now.ani, p.hicbc.end) - p.hicbc.start : 0;
  return { method, now, carry, reliefCap, maxRelieved, saving, slices, paTrap, cbTrap, tapered: now.aa < p.annualAllowance && !h.mpaa };
}
