// Thought starters: small what-ifs computed for a household, each with a change to try.
import { annuityIncome } from './annuity.js';
import { HISTORY } from './economy.js';
import { withDefaults, buildPaths, simulateOption } from './simulate.js';
import { sustainableWithdrawal, safeMaxByStartYear } from './analysis.js';
import { REGIMES, conditions } from './regimes.js';
import { ANNUITY_HISTORY } from './market.js';
import { giltAfterTax, SAMPLE_GILTS } from './gilts.js';
import { strategySet } from './scenarios.js';

const gbp = (v) => '£' + Math.round(v).toLocaleString('en-GB');
const pc = (v, d = 0) => (v * 100).toFixed(d) + '%';

export function insights(household, scenarios, basis, { fee = 0.006, toAge = 95 } = {}) {
  const h = withDefaults(household);
  const P = h.person, Q = h.partner;
  const lives = { age: P.age, spouseAge: Q?.age ?? P.age - 3 };
  const purchase = h.pensionPot * (1 - h.tfcPct);
  const out = [];
  const sub = scenarios.slice(0, 600);
  const paths = buildPaths(h, sub, { lifetimesPerScenario: 1 });

  // 1. Starting conditions.
  const sm = safeMaxByStartYear(h, basis, { toAge });
  const group = (k) => sm.filter((x) => REGIMES[k].test(conditions(x.startYear)));
  const like = group('likeToday'), low = group('lowRates');
  const ok = (g) => g.filter((x) => x.rate >= 0.04).length;
  if (like.length && low.length) {
    out.push({
      id: 'conditions', kicker: 'Starting conditions',
      headline: `The 4% rule lasted to ${toAge} in ${ok(like)} of ${like.length} retirements that began like today, and ${ok(low)} of ${low.length} that began with low rates.`,
      body: 'High gilt yields at the start have historically meant better returns ahead for a balanced portfolio. The same yields make annuities pay more. The samples are small and the windows overlap, so treat this as a tilt in the odds, not a promise.',
      tryIt: { label: 'Simulate futures that start like today', regime: 'likeToday' },
    });
  }

  // 2. Annuity rates against recent history.
  const per100 = annuityIncome(100000, { life: 'single', escalation: { kind: 'level' } }, { age: 65 }, basis);
  const y2020 = ANNUITY_HISTORY.find((a) => a.date === '2020-07').income;
  out.push({
    id: 'rates', kicker: 'Annuity rates',
    headline: `£100,000 buys a 65-year-old about ${gbp(per100)} a year today. In July 2020 the market average was ${gbp(y2020)}.`,
    body: `That is ${pc(per100 / y2020 - 1)} more income for the same money, because annuities are priced off long gilt yields. If yields fall back, so do annuity rates. Locking in part of the pot now removes that risk for the part you lock in.`,
    tryIt: { label: 'Look at the inflation-linked annuity', strategy: 'cpi-annuity' },
  });

  // 3. Charges.
  const swr = (f) => sustainableWithdrawal(h, sub, basis, { confidence: 0.9, fee: f, paths }).firstYear;
  const hi = swr(fee), lo = swr(0.0025);
  if (lo > hi) {
    out.push({
      id: 'fees', kicker: 'Charges',
      headline: `Cutting charges from ${pc(fee, 2)} to 0.25% a year lets you spend about ${gbp(lo - hi)} more every year, with the same confidence.`,
      body: `At 90% confidence the pot supports ${gbp(hi)} a year at ${pc(fee, 2)} in charges and ${gbp(lo)} at 0.25%. Over a 25-year retirement that adds up to roughly ${gbp((lo - hi) * 25)} in today's money.`,
      tryIt: { label: 'Use 0.25% charges', fee: 0.0025 },
    });
  }

  // 4. Two more years.
  const cpiSpec = Q ? { life: 'joint', survivorPct: 2 / 3, guaranteeYears: 5, escalation: { kind: 'cpi' } } : { life: 'single', guaranteeYears: 5, escalation: { kind: 'cpi' } };
  const now = annuityIncome(purchase, cpiSpec, lives, basis);
  const later = annuityIncome(purchase, cpiSpec, { age: P.age + 2, spouseAge: lives.spouseAge + 2 }, basis);
  out.push({
    id: 'wait', kicker: 'Timing',
    headline: `Retiring two years later, with the same pot, raises an inflation-linked annuity from ${gbp(now)} to ${gbp(later)} a year for life.`,
    body: 'Each year you wait, rates rise because the income has fewer years to run. That is before two more years of contributions, two more years of growth, and two fewer years the pot has to fund.',
    tryIt: { label: 'Try retiring two years later', ageDelta: 2 },
  });

  // 5. Inflation shock.
  const seventies = HISTORY.filter((r) => r.year >= 1972 && r.year < 1982).reduce((a, r) => a / (1 + r.inflation), 1);
  out.push({
    id: 'inflation', kicker: 'Inflation',
    headline: `A level income bought in 1972 had lost ${pc(1 - seventies)} of its spending power ten years later.`,
    body: `Even at today's ${pc(0.035, 1)} CPI, a level income loses about half its value over 20 years. An inflation-linked annuity starts around 30% lower but never shrinks. The question is how much of your income you need to protect.`,
    tryIt: { label: 'Show futures with high inflation', regime: 'highInflation' },
  });

  // 6. Annuity as the safe half.
  const set = strategySet(h);
  const runs = Object.fromEntries(['four-percent', 'annuity-for-bonds'].map((id) => [id, simulateOption(set.find((o) => o.id === id), h, paths, basis).summary]));
  const at = (s, age) => s.byYear.find((y) => y.age === age)?.income;
  const age85 = Math.max(85, P.age + 10);
  const a = at(runs['four-percent'], age85), b = at(runs['annuity-for-bonds'], age85);
  if (a && b) {
    out.push({
      id: 'bonds', kicker: 'The safe half',
      headline: `Swapping the bond half of a 60/40 portfolio for an annuity changes the 1-in-10 bad outcome at ${age85} from ${gbp(a.prudent)} to ${gbp(b.prudent)}.`,
      body: `An annuity pays mortality credits that a gilt fund cannot, and in 2022 gilts fell about 25%. The price is flexibility and legacy: the likely amount left at death goes from ${gbp(runs['four-percent'].legacy.likely)} to ${gbp(runs['annuity-for-bonds'].legacy.likely)}.`,
      tryIt: { label: 'Highlight annuity instead of bonds', strategy: 'annuity-for-bonds' },
    });
  }

  // 7. Survivor.
  if (Q) {
    const single = annuityIncome(purchase, { life: 'single', escalation: { kind: 'level' } }, lives, basis);
    const joint = annuityIncome(purchase, { life: 'joint', survivorPct: 1, escalation: { kind: 'level' } }, lives, basis);
    out.push({
      id: 'survivor', kicker: 'If one of you dies',
      headline: `A single-life annuity pays ${gbp(single - joint)} a year more than a 100% joint one, until the day it stops completely.`,
      body: `On the first death the household also loses one State Pension (${gbp(h.person.statePension)} a year). Joint cover at 50%, 66% or 100% decides how big the drop is for the one left.`,
      tryIt: { label: 'See the joint-life options', deepDive: 'annuities' },
    });
  }

  // 8. Gilts for the bridge.
  const g = giltAfterTax(SAMPLE_GILTS.find((x) => x.ticker === 'TG30'), 0.4);
  out.push({
    id: 'gilts', kicker: 'Tax',
    headline: `For a higher-rate taxpayer, a low-coupon gilt yielding ${pc(g.grossYield, 1)} is worth the same as a savings account paying ${pc(g.grossEquivalent, 1)}.`,
    body: 'Most of its return is a tax-free gain. Held outside a pension, gilts like this can fund the years before State Pension age from the tax-free cash.',
    tryIt: { label: 'Open the gilt calculator', deepDive: 'gilts' },
  });
  return out;
}
