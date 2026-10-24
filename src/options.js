// The menu of retirement options, from all-annuity to all-drawdown and everything between.
import { annuityIncome, describeSpec } from './annuity.js';
import { incomeTax, TAX_2026 } from './tax.js';
import { withDefaults } from './simulate.js';

const SIXTY_FORTY = { equity: 0.6, bonds: 0.4 };
const dd = (strategy, rate, extra = {}) => ({ strategy, rate, mix: SIXTY_FORTY, fee: 0.006, ...extra });
// Tax-free cash (and other savings) left invested alongside an annuity, drawn at 4%.
const SIDE_POT = dd('fixedReal', 0.04);

const SPECS = {
  singleLevel: { life: 'single', escalation: { kind: 'level' } },
  singleLevelG10: { life: 'single', guaranteeYears: 10, escalation: { kind: 'level' } },
  singleLevelVP: { life: 'single', valueProtectionPct: 1, escalation: { kind: 'level' } },
  single3: { life: 'single', guaranteeYears: 5, escalation: { kind: 'fixed', rate: 0.03 } },
  singleRPI: { life: 'single', guaranteeYears: 5, escalation: { kind: 'rpi' } },
  singleCPI: { life: 'single', guaranteeYears: 5, escalation: { kind: 'cpi' } },
  singleLPI: { life: 'single', guaranteeYears: 5, escalation: { kind: 'lpi', cap: 0.05 } },
  joint50Level: { life: 'joint', survivorPct: 0.5, escalation: { kind: 'level' } },
  joint100Level: { life: 'joint', survivorPct: 1, escalation: { kind: 'level' } },
  joint50RPI: { life: 'joint', survivorPct: 0.5, guaranteeYears: 5, escalation: { kind: 'rpi' } },
  joint66CPI: { life: 'joint', survivorPct: 2 / 3, guaranteeYears: 5, escalation: { kind: 'cpi' } },
  joint100CPI: { life: 'joint', survivorPct: 1, guaranteeYears: 5, escalation: { kind: 'cpi' } },
};

function annuityOption(id, spec, group = 'Annuity') {
  return { id, group, name: describeSpec(spec), annuities: [{ spec, share: 1 }], drawdown: SIDE_POT };
}

// Gross annuity income needed (paid to the main person) so that, with State Pensions and
// other income, the household's net income covers essential spending after State Pension age.
export function essentialGap(household) {
  const h = withDefaults(household);
  const P = h.person, Q = h.partner;
  const other = (x) => x ? x.otherIncome.reduce((a, o) => a + o.amount, 0) : 0;
  const base1 = P.statePension + other(P), base2 = Q ? Q.statePension + other(Q) : 0;
  const net = (a) => base1 + a - incomeTax(base1 + a) + base2 - incomeTax(base2);
  if (net(0) >= h.essentialSpending) return { gross: 0, survivorPct: 0, coveredByStatePension: true };
  let lo = 0, hi = h.essentialSpending * 2;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (net(m) < h.essentialSpending) lo = m; else hi = m; }
  let survivorPct = 0;
  if (Q) {
    // Survivor (the partner) needs essentialSpending x survivorSpendingRatio from their own State Pension + share.
    const need = h.essentialSpending * h.survivorSpendingRatio;
    const netQ = (s) => base2 + s * hi - incomeTax(base2 + s * hi);
    survivorPct = [0, 0.5, 2 / 3, 1].find((s) => netQ(s) >= need) ?? 1;
  }
  return { gross: hi, survivorPct, coveredByStatePension: false };
}

export function layeredOption(household, { escalation = { kind: 'cpi' }, discretionary = dd('guardrails', 0.05) } = {}) {
  const h = withDefaults(household);
  const gap = essentialGap(h);
  const spec = h.partner
    ? { life: 'joint', survivorPct: gap.survivorPct || 0.5, guaranteeYears: 5, escalation }
    : { life: 'single', guaranteeYears: 5, escalation };
  return {
    id: `layered-${escalation.kind}`,
    group: 'Layered: State Pension + annuity floor + discretionary drawdown',
    name: `Floor: ${describeSpec(spec)} covers essentials; rest in ${discretionary.strategy} drawdown`,
    annuities: gap.gross > 0 ? [{ spec, targetGrossIncome: gap.gross }] : [],
    drawdown: { ...discretionary, bridgeToStatePension: true },
    floor: gap,
  };
}

export function defaultOptions(household) {
  const h = withDefaults(household);
  const couple = !!h.partner;
  const o = [];
  // 1. Annuities, whole pension pot.
  o.push(annuityOption('ann-single-level', SPECS.singleLevel));
  o.push(annuityOption('ann-single-level-g10', SPECS.singleLevelG10));
  o.push(annuityOption('ann-single-level-vp', SPECS.singleLevelVP));
  o.push(annuityOption('ann-single-3pc', SPECS.single3));
  o.push(annuityOption('ann-single-rpi', SPECS.singleRPI));
  o.push(annuityOption('ann-single-cpi', SPECS.singleCPI));
  o.push(annuityOption('ann-single-lpi', SPECS.singleLPI));
  if (couple) {
    o.push(annuityOption('ann-joint50-level', SPECS.joint50Level));
    o.push(annuityOption('ann-joint100-level', SPECS.joint100Level));
    o.push(annuityOption('ann-joint50-rpi', SPECS.joint50RPI));
    o.push(annuityOption('ann-joint66-cpi', SPECS.joint66CPI));
    o.push(annuityOption('ann-joint100-cpi', SPECS.joint100CPI));
  }
  // 2. Drawdown, whole pot.
  o.push({ id: 'dd-4pc', group: 'Drawdown', name: '4% rule, 60/40, rising with inflation', drawdown: dd('fixedReal', 0.04) });
  o.push({ id: 'dd-3.5pc', group: 'Drawdown', name: '3.5% fixed real, 60/40', drawdown: dd('fixedReal', 0.035) });
  o.push({ id: 'dd-guardrails', group: 'Drawdown', name: 'Guardrails from 5%, 60/40', drawdown: dd('guardrails', 0.05) });
  o.push({ id: 'dd-dynamic', group: 'Drawdown', name: 'Ceiling/floor from 4.5%, 60/40', drawdown: dd('dynamic', 0.045) });
  o.push({ id: 'dd-4pc-slowdown', group: 'Drawdown', name: '4.5% early, easing 1%/yr from 75', drawdown: dd('fixedReal', 0.045, { profile: { type: 'slowdown', fromAge: 75, declinePerYear: 0.01, floor: 0.7 } }) });
  // 3. Partial annuity blends.
  const blendSpec = couple ? SPECS.joint66CPI : SPECS.singleCPI;
  for (const share of [0.25, 0.5, 0.75]) {
    o.push({ id: `blend-${share * 100}`, group: 'Blend', name: `${share * 100}% in ${describeSpec(blendSpec)}, rest 4% drawdown`, annuities: [{ spec: blendSpec, share }], drawdown: dd('fixedReal', 0.04) });
  }
  // 4. Annuity as the "bond" half: 40% annuity + 100% equities, against plain 60/40.
  o.push({ id: 'annuity-as-bonds', group: 'Annuity instead of bonds', name: `40% ${describeSpec(blendSpec)} + equities-only drawdown at 4%`, annuities: [{ spec: blendSpec, share: 0.4 }], drawdown: dd('fixedReal', 0.04, { mix: { equity: 1, bonds: 0 } }) });
  // 5. Layered floor-and-upside.
  if (h.essentialSpending > 0) {
    o.push(layeredOption(h, { escalation: { kind: 'cpi' } }));
    o.push(layeredOption(h, { escalation: { kind: 'level' } }));
  }
  return o;
}

export { SPECS, TAX_2026 };
