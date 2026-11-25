// Tech stocks page: the big AI and software names, from five years of daily closes in dollars
// (assets.json `stocks`, fetched by scripts/fetch-assets.js). Moves, volatility over several
// look-back periods, and the ranges that volatility implies. Prices only (no dividends; these
// companies pay little).
import assets from '../data/assets.json' with { type: 'json' };

const S = assets.stocks ?? { dates: [], list: [] };
export const STOCK_DATES = S.dates;
export const STOCKS = S.list.filter((x) => x.group !== 'Benchmark');
export const BENCHMARKS = S.list.filter((x) => x.group === 'Benchmark');
const BY = Object.fromEntries(S.list.map((x) => [x.symbol, x]));
export const stock = (sym) => BY[sym];
export const VOL_PERIODS = [[21, '1 month'], [63, '3 months'], [126, '6 months'], [252, '1 year'], [756, '3 years'], [1260, '5 years']];
const DAYS_YEAR = 252;

export function prices(sym) {
  const x = BY[sym];
  const v = x.px.slice(), d = S.dates.slice();
  return { dates: d, values: v };
}
const logRets = (v) => v.slice(1).map((p, i) => Math.log(p / v[i]));
const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };

// Annualised volatility (standard deviation of daily returns x sqrt(252)) over the last `days`.
export function realisedVol(sym, days) {
  const v = BY[sym].px.filter((x) => x != null);
  if (v.length < days + 1) return null;
  return sd(logRets(v.slice(-days - 1))) * Math.sqrt(DAYS_YEAR);
}
// Rolling volatility over the last `span` trading days, each point measured on the `window` before it.
export function rollingVol(sym, window = 21, span = 252) {
  const v = BY[sym].px, r = logRets(v), out = [];
  for (let i = r.length - span; i < r.length; i++) {
    if (i - window + 1 < 0) { out.push(null); continue; }
    out.push(sd(r.slice(i - window + 1, i + 1)) * Math.sqrt(DAYS_YEAR));
  }
  return { dates: S.dates.slice(-span), values: out };
}
const ret = (v, days) => (v.length > days ? v[v.length - 1] / v[v.length - 1 - days] - 1 : null);
const annual = (v, days) => (v.length > days ? Math.pow(v[v.length - 1] / v[v.length - 1 - days], DAYS_YEAR / days) - 1 : null);

// Calendar-month returns over the last `n` months (the current month to date last).
export function monthlyMoves(sym, n = 12) {
  const v = BY[sym].px, d = S.dates;
  const ends = [];
  for (let i = 0; i < d.length; i++) if (i === d.length - 1 || d[i + 1].slice(0, 7) !== d[i].slice(0, 7)) ends.push(i);
  const out = [];
  for (let k = ends.length - n; k < ends.length; k++) {
    if (k < 1) continue;
    out.push({ month: d[ends[k]].slice(0, 7), r: v[ends[k]] / v[ends[k - 1]] - 1, partial: k === ends.length - 1 });
  }
  return out;
}

function beta(sym, bench = '^NDX', days = 252) {
  const a = logRets(BY[sym].px.slice(-days - 1)), b = logRets(BY[bench].px.slice(-days - 1));
  const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
  let cov = 0, vb = 0, va = 0;
  for (let i = 0; i < a.length; i++) { cov += (a[i] - ma) * (b[i] - mb); vb += (b[i] - mb) ** 2; va += (a[i] - ma) ** 2; }
  return { beta: cov / vb, corr: cov / Math.sqrt(va * vb) };
}

// Everything the page shows for one stock.
export function stockStats(sym) {
  const x = BY[sym], v = x.px, d = S.dates;
  const last = v[v.length - 1];
  const yr = v.slice(-DAYS_YEAR - 1);
  let peak = yr[0], maxDD = 0, ddFrom = 0, ddTo = 0, pk = 0;
  yr.forEach((p, i) => { if (p > peak) { peak = p; pk = i; } const dd = p / peak - 1; if (dd < maxDD) { maxDD = dd; ddFrom = pk; ddTo = i; } });
  const off = d.length - yr.length;
  const ytdStart = d.findIndex((t) => t.slice(0, 4) === d[d.length - 1].slice(0, 4)) - 1;
  const r = logRets(yr);
  const worstDay = Math.min(...r), bestDay = Math.max(...r);
  const vols = Object.fromEntries(VOL_PERIODS.map(([n]) => [n, realisedVol(sym, n)]));
  const b = BY['^NDX'] && sym !== '^NDX' ? beta(sym) : { beta: 1, corr: 1 };
  return {
    symbol: sym, name: x.name, group: x.group, price: last, asOf: x.time ?? d[d.length - 1],
    r1m: ret(v, 21), r3m: ret(v, 63), r6m: ret(v, 126), r12m: ret(v, DAYS_YEAR), ytd: ytdStart >= 0 ? last / v[ytdStart] - 1 : null,
    r3y: annual(v, 756), r5y: annual(v, Math.min(1260, v.length - 1)),
    high52: Math.max(...yr), low52: Math.min(...yr), fromHigh: last / Math.max(...yr) - 1,
    maxDD12: maxDD, ddFrom: d[off + ddFrom], ddTo: d[off + ddTo],
    worstDay: Math.exp(worstDay) - 1, worstDayDate: d[off + 1 + r.indexOf(worstDay)], bestDay: Math.exp(bestDay) - 1, bestDayDate: d[off + 1 + r.indexOf(bestDay)],
    bigDays: r.filter((x2) => Math.abs(x2) > 0.05).length,
    vols, volTrend: vols[21] && vols[252] ? vols[21] / vols[252] : null,
    beta: b.beta, corr: b.corr,
  };
}

// The range a volatility implies over `months` ahead, assuming log-normal moves with no drift:
// one move either side covers about 2 in 3 outcomes, two moves about 19 in 20. A yardstick for the
// size of swings, not a forecast of direction.
export function impliedRange(price, vol, months) {
  const s = vol * Math.sqrt(months / 12);
  return { lo1: price * Math.exp(-s), hi1: price * Math.exp(s), lo2: price * Math.exp(-2 * s), hi2: price * Math.exp(2 * s), down1: Math.exp(-s) - 1, up1: Math.exp(s) - 1 };
}
// How often the stock actually stayed inside its one-move range over past `months`-long spells,
// measured with the volatility known at the start of each spell: a check on the yardstick.
export function rangeHitRate(sym, months = 3, volDays = 252) {
  const v = BY[sym].px, r = logRets(v), n = Math.round(months * 21);
  let inside = 0, total = 0;
  for (let i = volDays; i + n < v.length; i += 5) {
    const vol = sd(r.slice(i - volDays, i)) * Math.sqrt(DAYS_YEAR), s = vol * Math.sqrt(months / 12);
    const mv = Math.log(v[i + n] / v[i]);
    total++; if (Math.abs(mv) <= s) inside++;
  }
  return total ? inside / total : null;
}
