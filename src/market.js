// Today's market, and how it compares with history.
import { market, marketNow } from './data.js';
import { HISTORY } from './economy.js';

export const MARKET_NOW = marketNow;

// Annuity prices move with long gilt yields. Shift the calibrated basis by the change in the
// 20-year gilt yield and implied inflation since the calibration date.
export function liveBasis(basis = market, now = marketNow) {
  const c = basis.curveAtCalibration;
  if (!c || !now?.latest) return basis;
  const dy = now.latest.gilt20.value - c.gilt20;
  const di = now.latest.implied20.value - c.implied20;
  return { ...basis, nominalYield: basis.nominalYield + dy, cpiPriced: basis.cpiPriced + di, live: { dy, di, asOf: now.latest.gilt20.date } };
}

// Share of history (from `fromYear`) with a value below `value`.
export function historyPercentile(field, value, fromYear = 1900) {
  const xs = HISTORY.filter((r) => r.year >= fromYear && r[field] != null).map((r) => r[field]);
  return xs.filter((x) => x < value).length / xs.length;
}

export function lastYearAbove(field, value) {
  const r = [...HISTORY].reverse().find((x) => x[field] != null && x[field] >= value);
  return r?.year ?? null;
}

// Published market-average annuity income for a healthy 65-year-old per £100,000
// (single life, level), for context. Source: uktaxdrag.co.uk citing market averages.
export const ANNUITY_HISTORY = [
  { date: '2008-08', income: 7750 },
  { date: '2020-07', income: 4710 },
  { date: '2024-12', income: 7120 },
  { date: '2026-07', income: 7750 },
];
