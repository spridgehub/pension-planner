// Mortality from the ONS 2022-based England life tables (principal projection).
// The table is period qx by calendar year to 2072; walking the diagonal (age+1, year+1)
// gives each person's cohort rates. Beyond 2072 rates keep improving at `longTermImprovement`.
import { ons } from './data.js';

// Rough multipliers on population mortality. ONS rates are for everyone; people with
// pension savings tend to live longer than average, smokers and people in poor health less.
export const HEALTH = {
  poor: { multiplier: 1.7, label: 'Serious health conditions' },
  belowAverage: { multiplier: 1.3, label: 'Some health conditions / smoker' },
  average: { multiplier: 1.0, label: 'Average (ONS population)' },
  good: { multiplier: 0.85, label: 'Good health' },
  excellent: { multiplier: 0.7, label: 'Excellent health, affluent' },
};

const FIRST_YEAR = ons.years[0];
const LAST_YEAR = ons.years[ons.years.length - 1];

export function qx(sex, age, year, { multiplier = 1, longTermImprovement = 0.01 } = {}) {
  if (age > ons.maxAge) return 1;
  const a = Math.max(ons.minAge, Math.floor(age));
  const y = Math.min(Math.max(year, FIRST_YEAR), LAST_YEAR);
  const rate = (s) => ons[s][a - ons.minAge][y - FIRST_YEAR];
  let q = sex === 'unisex' ? (rate('male') + rate('female')) / 2 : rate(sex);
  if (year > LAST_YEAR) q *= Math.pow(1 - longTermImprovement, year - LAST_YEAR);
  return Math.min(1, q * multiplier);
}

// Annual survival curve: S[t] = P(alive t years from now), S[0] = 1.
export function survivalCurve(person, startYear = 2026, years = 70) {
  const m = person.multiplier ?? HEALTH[person.health ?? 'average'].multiplier;
  const opts = { multiplier: m, longTermImprovement: person.longTermImprovement ?? 0.01 };
  const S = [1];
  for (let t = 0; t < years; t++) S.push(S[t] * (1 - qx(person.sex, person.age + t, startYear + t, opts)));
  return S;
}

// Curtate expectation plus a half year (deaths spread through the year).
export function lifeExpectancy(S) {
  let e = 0;
  for (let t = 1; t < S.length; t++) e += S[t];
  return e + 0.5;
}

// Age at which the chance of still being alive falls to p (e.g. 0.1 → "1 in 10 live beyond").
export function ageAtSurvival(S, age, p) {
  for (let t = 1; t < S.length; t++) {
    if (S[t] <= p) {
      const f = (S[t - 1] - p) / (S[t - 1] - S[t]);
      return age + t - 1 + f;
    }
  }
  return age + S.length - 1;
}

export function longevitySummary(person, startYear = 2026) {
  const S = survivalCurve(person, startYear);
  const at = (x) => (x - person.age >= 0 && x - person.age < S.length ? S[x - person.age] : 0);
  return {
    lifeExpectancy: person.age + lifeExpectancy(S),
    median: ageAtSurvival(S, person.age, 0.5),
    oneInFour: ageAtSurvival(S, person.age, 0.25),
    oneInTen: ageAtSurvival(S, person.age, 0.1),
    oneInTwenty: ageAtSurvival(S, person.age, 0.05),
    pAlive: { 75: at(75), 80: at(80), 85: at(85), 90: at(90), 95: at(95), 100: at(100) },
    curve: S,
  };
}

// For a couple: P(at least one alive) and second-death ages.
export function jointSummary(p1, p2, startYear = 2026) {
  const S1 = survivalCurve(p1, startYear);
  const S2 = survivalCurve(p2, startYear);
  const either = S1.map((s, t) => s + S2[t] - s * S2[t]);
  return {
    curve: either,
    lastSurvivorMedianYears: ageAtSurvival(either, 0, 0.5),
    lastSurvivorOneInTenYears: ageAtSurvival(either, 0, 0.1),
    lifeExpectancyYears: lifeExpectancy(either),
  };
}

// Draw a whole-year lifetime: the person is alive for years 0..T-1 and dies during year T-1..T.
export function sampleDeathYear(S, u) {
  for (let t = 1; t < S.length; t++) if (S[t] < u) return t;
  return S.length;
}
