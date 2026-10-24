// Starting conditions. Each historical start year is tagged by the long gilt yield that year
// and the previous year's inflation, so outcomes can be compared for retirements that began
// in conditions like today's.
import { HISTORY } from './economy.js';

const BY_YEAR = Object.fromEntries(HISTORY.map((r) => [r.year, r]));

export function conditions(year) {
  const r = BY_YEAR[year], p = BY_YEAR[year - 1];
  return { longYield: r?.longYield ?? null, inflation: (p ?? r)?.inflation ?? null };
}

export const REGIMES = {
  all: { label: 'All of history', short: 'All years', test: () => true },
  likeToday: { label: 'Starts like today: long gilt yields of 4.5%+ with inflation of 2–6%', short: 'Like today', test: (c) => c.longYield >= 0.045 && c.inflation >= 0.02 && c.inflation <= 0.06 },
  highInflation: { label: 'High inflation: prices rising more than 6% a year', short: 'High inflation', test: (c) => c.inflation > 0.06 },
  lowRates: { label: 'Low rates: long gilt yields under 3%', short: 'Low rates', test: (c) => c.longYield != null && c.longYield < 0.03 },
};

export function regimeYears(key, fromYear = 1900, toYear = 2025) {
  const test = REGIMES[key].test;
  return HISTORY.filter((r) => r.year >= fromYear && r.year <= toYear && test(conditions(r.year))).map((r) => r.year);
}

// Which regime today falls into, from live gilt yield and CPI.
export function todaysRegime(now) {
  const c = { longYield: now.latest.gilt10.value, inflation: now.latest.cpi.value };
  return Object.keys(REGIMES).find((k) => k !== 'all' && REGIMES[k].test(c)) ?? 'all';
}
