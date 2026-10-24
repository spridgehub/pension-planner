// Annuity pricing on a monthly grid.
//
// Price = PV of expected payments + PV of death benefits, discounted at the basis yield,
// using a unisex annuitant mortality basis (ONS rates x a fitted multiplier) because UK
// annuity rates cannot differ by sex. The basis is calibrated to published market rates
// (scripts/calibrate.js) and can be re-anchored to real quotes (quotes.js).
import { qx } from './mortality.js';

// spec = {
//   life: 'single' | 'joint', survivorPct: 0.5,        // spouse's share after annuitant dies
//   guaranteeYears: 0..30, valueProtectionPct: 0..1,   // value protection is single-life only here
//   escalation: { kind: 'level'|'fixed'|'rpi'|'cpi'|'lpi', rate: 0.03, cap: 0.05 },
//   timing: 'advance' | 'arrears'                     // monthly payments
// }
export const DEFAULT_SPEC = { life: 'single', survivorPct: 0.5, guaranteeYears: 0, valueProtectionPct: 0, escalation: { kind: 'level' }, timing: 'advance' };

export function normaliseSpec(spec) {
  return { ...DEFAULT_SPEC, ...spec, escalation: { ...DEFAULT_SPEC.escalation, ...(spec.escalation || {}) } };
}

// RPI is being aligned with CPIH from February 2030 (UKSA reform), which removes most of
// the RPI-CPI wedge. Before then RPI runs roughly 0.8% above CPI.
export function rpiWedge(year) {
  return year < 2030 ? 0.008 : 0.001;
}

// E[clamp(X, 0, cap)] for X ~ N(mu, sd): expected limited-price-indexation increase.
function expectedClamped(mu, sd, cap) {
  const phi = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const a = (0 - mu) / sd, b = (cap - mu) / sd;
  // E[X; 0<X<cap] + cap * P(X>cap)
  return mu * (Phi(b) - Phi(a)) + sd * (phi(a) - phi(b)) + cap * (1 - Phi(b));
}
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

// Expected escalation index for each policy year under the pricing basis.
export function pricedEscalation(esc, basis, years, startYear) {
  const idx = [1];
  for (let t = 1; t <= years; t++) {
    const y = startYear + t;
    const cpi = basis.cpiPriced;
    const rpi = cpi + rpiWedge(y);
    let g;
    switch (esc.kind) {
      case 'level': g = 0; break;
      case 'fixed': g = esc.rate ?? 0.03; break;
      case 'rpi': g = rpi; break;
      case 'cpi': g = cpi; break;
      case 'lpi': g = expectedClamped(rpi, 0.015, esc.cap ?? 0.05); break;
      default: throw new Error(`unknown escalation ${esc.kind}`);
    }
    idx.push(idx[t - 1] * (1 + g));
  }
  return idx;
}

// Monthly survival (geometric within each year of age).
function monthlySurvival(age, startYear, months, basis) {
  const S = new Float64Array(months + 1);
  S[0] = 1;
  const opts = { multiplier: basis.mortalityMultiplier, longTermImprovement: basis.longTermImprovement ?? 0.01 };
  for (let m = 0; m < months; m++) {
    const yr = Math.floor(m / 12);
    const q = qx('unisex', age + yr, startYear + yr, opts);
    S[m + 1] = S[m] * Math.pow(1 - q, 1 / 12);
  }
  return S;
}

const MAX_YEARS = 70;

// Present values per £1 a year of starting income, plus the death-benefit term for value protection.
function valuation(spec, lives, basis) {
  const s = normaliseSpec(spec);
  const startYear = basis.startYear ?? 2026;
  const M = MAX_YEARS * 12;
  const S1 = monthlySurvival(lives.age, startYear, M, basis);
  const S2 = s.life === 'joint' ? monthlySurvival(lives.spouseAge, startYear, M, basis) : null;
  const esc = pricedEscalation(s.escalation, basis, MAX_YEARS, startYear);
  const v = Math.pow(1 + basis.nominalYield, -1 / 12);
  const g = s.guaranteeYears * 12;
  const first = s.timing === 'arrears' ? 1 : 0;
  let income = 0;
  for (let m = first; m < M + first; m++) {
    const sm = Math.min(m, M);
    let p = S1[sm];
    if (S2) p += s.survivorPct * (1 - S1[sm]) * S2[sm];
    if (m < g) p = 1;
    income += (esc[Math.floor(m / 12)] / 12) * p * Math.pow(v, m);
  }
  // For value protection we need, per month of death, the payments made so far.
  let deaths = null;
  if (s.valueProtectionPct > 0) {
    deaths = [];
    let paid = 0;
    for (let m = 0; m < M; m++) {
      if (m >= first) paid += esc[Math.floor(m / 12)] / 12;
      deaths.push({ prob: S1[m] - S1[m + 1], disc: Math.pow(v, m + 0.5), paid });
    }
  }
  return { income: income * (1 + (basis.expenseLoad ?? 0)), deaths, spec: s };
}

// Starting annual income bought by `purchase`.
export function annuityIncome(purchase, spec, lives, basis) {
  const val = valuation(spec, lives, basis);
  let income = purchase / val.income;
  if (val.deaths) {
    // price(I) = I * A + sum P(die m) v^m max(0, VP*P - I*paid_m): monotone in I, so bisect.
    const vp = val.spec.valueProtectionPct * purchase;
    const price = (I) => I * val.income + val.deaths.reduce((acc, d) => acc + d.prob * d.disc * Math.max(0, vp - I * d.paid), 0);
    let lo = 0, hi = income;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (price(mid) > purchase) hi = mid; else lo = mid; }
    income = lo;
  }
  return income * (basis.quoteAdjust?.(val.spec) ?? 1);
}

// Cost to buy a given starting income.
export function annuityCost(targetIncome, spec, lives, basis) {
  return targetIncome / annuityIncome(1, spec, lives, basis);
}

export function describeSpec(spec) {
  const s = normaliseSpec(spec);
  const esc = { level: 'Level', fixed: `${((s.escalation.rate ?? 0.03) * 100).toFixed(0)}% a year`, rpi: 'RPI-linked', cpi: 'CPI-linked', lpi: `RPI capped ${((s.escalation.cap ?? 0.05) * 100).toFixed(0)}%` }[s.escalation.kind];
  const life = s.life === 'joint' ? `Joint ${Math.round(s.survivorPct * 100)}%` : 'Single life';
  const extras = [];
  if (s.guaranteeYears) extras.push(`${s.guaranteeYears}-yr guarantee`);
  if (s.valueProtectionPct) extras.push(`${Math.round(s.valueProtectionPct * 100)}% value protection`);
  return [life, esc, ...extras].join(', ');
}
