// Standard households and a short list of strategies to race against each other.
import { describeSpec } from './annuity.js';
import { layeredOption, essentialGap } from './options.js';
import { withDefaults, buildPaths, simulateOption } from './simulate.js';

export const PERSONAS = [
  {
    id: 'modest', title: 'The modest pot', blurb: 'Single, 66, a workplace pension and a full State Pension',
    household: { person: { age: 66, sex: 'female', statePensionAge: 66 }, partner: null, pensionPot: 100000, otherSavings: 10000, essentialSpending: 16000 },
  },
  {
    id: 'couple', title: 'The typical couple', blurb: 'Retiring at 65 and 63, one main pension pot',
    household: { person: { age: 65, sex: 'male', statePensionAge: 67 }, partner: { age: 63, sex: 'female', statePensionAge: 67 }, pensionPot: 250000, otherSavings: 15000, essentialSpending: 25000 },
  },
  {
    id: 'comfortable', title: 'The comfortable couple', blurb: '66 and 64, a larger pot and some ISA savings',
    household: { person: { age: 66, sex: 'male', statePensionAge: 66 }, partner: { age: 64, sex: 'female', statePensionAge: 67 }, pensionPot: 550000, otherSavings: 60000, essentialSpending: 32000 },
  },
  {
    id: 'early', title: 'The early retiree', blurb: 'Single, stopping work at 60, seven years before State Pension',
    household: { person: { age: 60, sex: 'male', statePensionAge: 67 }, partner: null, pensionPot: 900000, otherSavings: 40000, essentialSpending: 30000 },
  },
];

export const POT_SIZES = [100000, 250000, 500000, 750000, 1000000];

const MIX = { equity: 0.6, bonds: 0.4 };
const dd = (strategy, rate, extra = {}) => ({ strategy, rate, mix: MIX, fee: 0.006, ...extra });

export function strategySet(household) {
  const h = withDefaults(household);
  const couple = !!h.partner;
  const level = couple ? { life: 'joint', survivorPct: 0.5, escalation: { kind: 'level' } } : { life: 'single', guaranteeYears: 5, escalation: { kind: 'level' } };
  const cpi = couple ? { life: 'joint', survivorPct: 2 / 3, guaranteeYears: 5, escalation: { kind: 'cpi' } } : { life: 'single', guaranteeYears: 5, escalation: { kind: 'cpi' } };
  const side = dd('fixedReal', 0.04);
  const list = [
    { id: 'level-annuity', short: 'Level annuity', name: `All in: ${describeSpec(level)}`, tagline: 'Highest certain income on day one. Inflation eats it.', annuities: [{ spec: level, share: 1 }], drawdown: side },
    { id: 'cpi-annuity', short: 'Inflation-linked annuity', name: `All in: ${describeSpec(cpi)}`, tagline: 'Lower start, but it keeps its spending power for life.', annuities: [{ spec: cpi, share: 1 }], drawdown: side },
    { id: 'four-percent', short: '4% rule', name: 'Drawdown: 4% of the pot, rising with prices, 60/40', tagline: 'The classic rule. Steady income until the pot runs dry.', drawdown: dd('fixedReal', 0.04) },
    { id: 'guardrails', short: 'Guardrails', name: 'Drawdown: start at 5%, cut 10% in bad times, raise 10% in good', tagline: 'Spend more when markets let you, trim when they do not.', drawdown: dd('guardrails', 0.05) },
    { id: 'half-half', short: 'Half and half', name: `50% in ${describeSpec(cpi)}, 50% drawdown at 4%`, tagline: 'Split the difference between certainty and growth.', annuities: [{ spec: cpi, share: 0.5 }], drawdown: dd('fixedReal', 0.04) },
    { id: 'annuity-for-bonds', short: 'Annuity instead of bonds', name: `40% in ${describeSpec(cpi)}, the rest 100% equities at 4%`, tagline: 'Let the annuity be the safe part, and let the rest grow.', annuities: [{ spec: cpi, share: 0.4 }], drawdown: dd('fixedReal', 0.04, { mix: { equity: 1, bonds: 0 } }) },
  ];
  if (h.essentialSpending > 0 && !essentialGap(h).coveredByStatePension) {
    const l = layeredOption(h, { escalation: { kind: 'cpi' } });
    list.push({ ...l, id: 'floor-upside', short: 'Floor and upside', name: l.name, tagline: 'Annuity covers essentials, everything else invested for the good life.' });
  } else {
    list.push({ id: 'floor-upside', short: 'Floor and upside', name: 'State Pension already covers essentials; guardrails on the whole pot', tagline: 'State Pension is the floor. The pot is all upside.', drawdown: { ...dd('guardrails', 0.05), bridgeToStatePension: true } });
  }
  return list;
}

// Likely and prudent income at a reference age for each pot size and strategy.
export function potMatrix(household, scenarios, basis, { pots = POT_SIZES, refAge, settings } = {}) {
  const base = withDefaults(household);
  const age = refAge ?? Math.max(base.person.age + 10, 75);
  const paths = buildPaths(base, scenarios, { lifetimesPerScenario: 1 });
  return pots.map((pot) => {
    const h = { ...household, pensionPot: pot };
    return {
      pot,
      cells: strategySet(h).map((o) => {
        const s = simulateOption(o, h, paths, basis, settings).summary;
        const y = s.byYear.find((b) => b.age === age);
        return { id: o.id, short: o.short, likely: y?.income.likely, prudent: y?.income.prudent, upside: y?.income.upside, shortfall: s.pShortfallAfterStatePension, legacy: s.legacy.likely };
      }),
    };
  });
}
