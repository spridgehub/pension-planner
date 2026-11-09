// Markets pages: equity indices and commodities seen from a UK investor's seat.
// Monthly history from data/assets.json (scripts/fetch-assets.js); research figures (valuations,
// AI concentration, published forecasts) hand-entered with sources in data/markets-research.json.
// Every return here is in pounds unless `ccy: 'local'` is asked for.
import assets from '../data/assets.json' with { type: 'json' };
import research from '../data/markets-research.json' with { type: 'json' };
import { makeRng } from './rng.js';

export const MARKETS = assets;
export const RESEARCH = research;
export const ASSETS = Object.fromEntries(assets.assets.map((a) => [a.id, a]));

const monthIndex = (m) => { const [y, mo] = m.split('-').map(Number); return y * 12 + mo - 1; };
const monthKey = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
export const addMonths = (m, n) => monthKey(monthIndex(m) + n);
export const LAST_MONTH = assets.assets.reduce((mx, a) => { const l = addMonths(a.first, a.px.length - 1); return l > mx ? l : mx; }, '0000-00');

function lookup(block, m) {
  const i = monthIndex(m) - monthIndex(block.first);
  return i >= 0 && i < block.v.length ? block.v[i] : null;
}
const fxAt = (ccy, m) => (ccy === 'GBP' ? 1 : lookup(assets.fx[ccy], m));
const cpiAt = (m) => lookup(assets.cpi, m);

// Monthly index level for an asset. Options:
//   ccy:   'GBP' (default) converts at month-end sterling rates; 'local' leaves it alone.
//   total: add dividends (true total return where available, else the asset's average yield).
//   real:  deflate by UK CPI (a UK investor spends pounds).
export function series(id, { ccy = 'GBP', total = true, real = false, from = null } = {}) {
  const a = ASSETS[id];
  const months = [], values = [];
  const trOk = total && a.tr;
  const drift = total && !trOk ? Math.pow(1 + a.divYield, 1 / 12) : 1;
  let acc = 1;
  for (let i = 0; i < a.px.length; i++) {
    const m = addMonths(a.first, i);
    if (from && m < from) continue;
    let v = trOk ? a.tr[i] : a.px[i];
    if (v == null) continue;
    if (!trOk && total && months.length) acc *= drift;
    v *= acc;
    if (ccy === 'GBP') { const f = fxAt(a.ccy, m); if (f == null) continue; v /= f; }
    if (real) { const c = cpiAt(m); if (c == null) continue; v /= c; }
    months.push(m); values.push(v);
  }
  return { id, months, values };
}

// First month with data in pounds for every listed asset.
export function commonStart(ids, opts = {}) {
  return ids.map((id) => series(id, opts).months[0]).sort().pop();
}

const returnsOf = (values) => values.slice(1).map((v, i) => v / values[i] - 1);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)); };
const quantile = (sorted, q) => { const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };

// Headline statistics for one series between two months (inclusive).
export function stats(s, from = s.months[0], to = s.months[s.months.length - 1]) {
  const i0 = s.months.findIndex((m) => m >= from);
  let i1 = s.months.length - 1;
  while (i1 > 0 && s.months[i1] > to) i1--;
  const v = s.values.slice(i0, i1 + 1), months = s.months.slice(i0, i1 + 1);
  if (v.length < 13) return null;
  const years = (v.length - 1) / 12;
  const r = returnsOf(v);
  let peak = v[0], peakI = 0, maxDD = 0, ddStart = 0, ddTrough = 0, longest = 0, uwStart = null;
  for (let i = 0; i < v.length; i++) {
    if (v[i] >= peak) {
      if (uwStart != null) longest = Math.max(longest, i - uwStart);
      peak = v[i]; peakI = i; uwStart = null;
    } else {
      if (uwStart == null) uwStart = peakI;
      const dd = v[i] / peak - 1;
      if (dd < maxDD) { maxDD = dd; ddStart = peakI; ddTrough = i; }
    }
  }
  const stillUnder = uwStart != null ? v.length - 1 - uwStart : 0;
  let recovered = null;
  for (let i = ddTrough; i < v.length; i++) if (v[i] >= v[ddStart]) { recovered = i; break; }
  const yr = [];
  for (let i = 12; i < v.length; i++) yr.push(v[i] / v[i - 12] - 1);
  return {
    from: months[0], to: months[months.length - 1], years,
    cagr: Math.pow(v[v.length - 1] / v[0], 1 / years) - 1,
    total: v[v.length - 1] / v[0] - 1,
    vol: sd(r) * Math.sqrt(12),
    maxDD, ddPeak: months[ddStart], ddTrough: months[ddTrough],
    ddRecoveredMonths: recovered != null ? recovered - ddStart : null,
    longestUnderwaterMonths: Math.max(longest, stillUnder),
    worst12: Math.min(...yr), best12: Math.max(...yr),
    lossYears: yr.filter((x) => x < 0).length / yr.length,
  };
}

// Annualised returns over every rolling window of `years` (monthly starts).
export function rolling(s, years) {
  const n = years * 12, out = [];
  for (let i = 0; i + n < s.values.length; i++) out.push({ start: s.months[i], r: Math.pow(s.values[i + n] / s.values[i], 1 / years) - 1 });
  if (!out.length) return null;
  const rs = out.map((x) => x.r).sort((a, b) => a - b);
  return { years, windows: out, worst: rs[0], best: rs[rs.length - 1], median: quantile(rs, 0.5), p10: quantile(rs, 0.1), p90: quantile(rs, 0.9), lossShare: rs.filter((x) => x < 0).length / rs.length };
}

export function drawdowns(s) {
  let peak = -Infinity;
  return { months: s.months, values: s.values.map((v) => { peak = Math.max(peak, v); return v / peak - 1; }) };
}

// Monthly returns of several series, aligned on shared months from `from`.
function aligned(ids, opts, from) {
  const ss = ids.map((id) => series(id, opts));
  const sets = ss.map((s) => new Map(s.months.map((m, i) => [m, s.values[i]])));
  const months = ss[0].months.filter((m) => m >= from && sets.every((x) => x.has(m)));
  return { months, rets: sets.map((st) => returnsOf(months.map((m) => st.get(m)))) };
}
export function correlation(ids, { years = 10, ...opts } = {}) {
  const { rets } = aligned(ids, opts, addMonths(LAST_MONTH, -12 * years));
  return ids.map((_, i) => ids.map((__, j) => {
    const a = rets[i], b = rets[j], ma = mean(a), mb = mean(b);
    let num = 0, da = 0, db = 0;
    for (let k = 0; k < a.length; k++) { num += (a[k] - ma) * (b[k] - mb); da += (a[k] - ma) ** 2; db += (b[k] - mb) ** 2; }
    return num / Math.sqrt(da * db);
  }));
}
// Sensitivity of `id` to `factor` (monthly, in pounds): beta, correlation and the share of the
// asset's swings that move with the factor (R squared).
export function beta(id, factor = 'sox', { years = 10, ...opts } = {}) {
  const { rets: [a, f] } = aligned([id, factor], opts, addMonths(LAST_MONTH, -12 * years));
  const ma = mean(a), mf = mean(f);
  let cov = 0, vf = 0, va = 0;
  for (let k = 0; k < a.length; k++) { cov += (a[k] - ma) * (f[k] - mf); vf += (f[k] - mf) ** 2; va += (a[k] - ma) ** 2; }
  const corr = cov / Math.sqrt(vf * va);
  return { beta: cov / vf, corr, r2: corr * corr, n: a.length };
}

// Return of each asset over a dated episode (month-end to month-end), in pounds.
export const EPISODES = [
  { id: 'dotcom', label: 'Dot-com bust', from: '2000-03', to: '2002-09', note: 'Tech bubble bursts; Nasdaq falls about 80% in dollars' },
  { id: 'gfc', label: 'Financial crisis', from: '2007-10', to: '2009-02', note: 'Banks fail; global recession' },
  { id: 'euro', label: 'Euro crisis', from: '2011-04', to: '2011-09', note: 'Sovereign debt scare; US downgrade' },
  { id: 'covid', label: 'Covid crash', from: '2020-01', to: '2020-03', note: 'Lockdowns; fastest bear market on record' },
  { id: 'rates', label: '2022 rate shock', from: '2021-12', to: '2022-09', note: 'Inflation and rate rises hit tech and bonds' },
  { id: 'tariffs', label: 'DeepSeek and tariffs', from: '2025-01', to: '2025-04', note: 'Cheap Chinese AI model, then US tariffs' },
];
export function episodeReturn(id, ep, opts = {}) {
  const s = series(id, opts);
  const a = s.months.indexOf(ep.from), b = s.months.indexOf(ep.to);
  return a < 0 || b < 0 ? null : s.values[b] / s.values[a] - 1;
}

// AI stress test. Two estimates of what a fall in AI stocks would do to each index:
//   direct: the index's weight in AI-linked companies times the shock, with the rest unchanged;
//   history: the index's 10-year beta to US chip stocks (SOX, in pounds) times the shock, which
//   captures knock-on selling and suppliers but also anything else that moved with chips.
export function aiStress(id, shock) {
  const w = research.aiConcentration?.[id]?.weight ?? null;
  const b = beta(id, 'sox', { years: 10 });
  return { weight: w, direct: w != null ? w * shock : null, history: b.beta * shock, beta: b.beta, r2: b.r2 };
}

// Valuation-implied long-run real return: the cyclically adjusted earnings yield (1 / CAPE),
// a well-tested if rough guide to the next 10 years of real returns in local currency.
export function valuationReturn(id) {
  const v = research.valuation?.[id];
  if (!v) return null;
  const pe = v.cape ?? v.pe;
  return pe ? { real: 1 / pe, basis: v.cape ? 'CAPE' : 'P/E', pe } : null;
}

// S&P 500 CAPE history (Shiller) and the 10-year real return that followed each reading.
export function capeVsNext10() {
  const s = series('spx', { ccy: 'local', total: true, real: false });
  const out = [];
  const c = assets.cape;
  for (let i = 0; i < c.v.length; i++) {
    const m = addMonths(c.first, i), pe = c.v[i];
    if (!pe) continue;
    const a = s.months.indexOf(m), b = s.months.indexOf(addMonths(m, 120));
    // Nominal dollar total return: the data holds UK CPI, not US CPI.
    out.push({ month: m, cape: pe, next10: a >= 0 && b >= 0 ? Math.pow(s.values[b] / s.values[a], 0.1) - 1 : null });
  }
  return out;
}
export function latestCape() {
  const c = assets.cape;
  for (let i = c.v.length - 1; i >= 0; i--) if (c.v[i]) return { month: addMonths(c.first, i), cape: c.v[i] };
  return null;
}

// Block bootstrap of an asset's own real monthly returns in pounds, optionally re-centred on a
// chosen real annual return (e.g. the valuation estimate). Returns percentiles of £1 by year.
export function projection(id, { years = 10, n = 2000, block = 12, centre = null, from = null, seed = 7 } = {}) {
  const s = series(id, { real: true, from });
  let r = returnsOf(s.values).map((x) => Math.log(1 + x));
  const histAnnual = Math.exp(mean(r) * 12) - 1;
  if (centre != null) { const shift = Math.log(1 + centre) / 12 - mean(r); r = r.map((x) => x + shift); }
  const rng = makeRng(seed);
  const T = years * 12, paths = [];
  for (let p = 0; p < n; p++) {
    const path = [1]; let lv = 0;
    while (path.length <= T) {
      const st = Math.floor(rng.uniform() * (r.length - block));
      for (let k = 0; k < block && path.length <= T; k++) { lv += r[st + k]; path.push(Math.exp(lv)); }
    }
    paths.push(path);
  }
  const byYear = [];
  for (let y = 0; y <= years; y++) {
    const xs = paths.map((p) => p[y * 12]).sort((a, b) => a - b);
    byYear.push({ year: y, p5: quantile(xs, 0.05), p10: quantile(xs, 0.1), p25: quantile(xs, 0.25), p50: quantile(xs, 0.5), p75: quantile(xs, 0.75), p90: quantile(xs, 0.9), p95: quantile(xs, 0.95) });
  }
  const end = paths.map((p) => p[T]);
  return {
    byYear,
    lossChance: end.filter((x) => x < 1).length / n,
    halfChance: end.filter((x) => x < 0.5).length / n,
    medianAnnual: Math.pow(byYear[years].p50, 1 / years) - 1,
    histAnnual,
  };
}

// A fixed-weight mix rebalanced every month (or never), in pounds.
export function mix(weights, { from, real = false, rebalance = 'annual' } = {}) {
  const ids = Object.keys(weights).filter((k) => weights[k] > 0);
  const tot = ids.reduce((s, k) => s + weights[k], 0);
  const ss = ids.map((id) => series(id, { real }));
  const sets = ss.map((s) => new Map(s.months.map((m, i) => [m, s.values[i]])));
  const start = from ?? commonStart(ids, { real });
  const months = ss[0].months.filter((m) => m >= start && sets.every((x) => x.has(m)));
  let hold = ids.map((k) => weights[k] / tot);
  const values = [1];
  for (let i = 1; i < months.length; i++) {
    hold = hold.map((h, j) => h * sets[j].get(months[i]) / sets[j].get(months[i - 1]));
    const v = hold.reduce((s, h) => s + h, 0);
    values.push(v);
    if (rebalance === 'monthly' || (rebalance === 'annual' && months[i].endsWith('-12'))) hold = ids.map((k) => v * weights[k] / tot);
  }
  return { id: 'mix', months, values };
}

export const latestPrice = (id) => {
  const a = ASSETS[id];
  const m = addMonths(a.first, a.px.length - 1);
  return { local: a.last.price ?? a.px[a.px.length - 1], gbp: (a.last.price ?? a.px[a.px.length - 1]) / fxAt(a.ccy, m), asOf: a.last.time, ccy: a.ccy };
};
