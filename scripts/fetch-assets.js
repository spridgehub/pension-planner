// Fetch monthly history for the Markets pages into data/assets.json:
//   Yahoo Finance chart API: index and futures month-end closes in local currency.
//   Bank of England IADB: month-end sterling spot rates (USD, JPY, HKD) since 1975.
//   Yahoo FX crosses for the currencies the BoE does not publish (KRW, TWD, INR).
//   ONS CPI index (D7BT) monthly since 1988; earlier months interpolated from the annual
//   UK CPI already in data/uk-history.json.
//   Shiller's S&P 500 data (datahub mirror): price, dividends and CAPE monthly since 1871.
//   Gold monthly average since 1833 (datahub mirror of World Bank / Bundesbank data).
// Run with `npm run refresh:assets` (or `npm run refresh`, which does everything).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh) pension-planner/0.3' };
const get = async (url, kind = 'text') => {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return kind === 'json' ? res.json() : res.text();
    } catch (e) { if (i === 2) throw e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
};
const ym = (d) => d.toISOString().slice(0, 7);

// Monthly bars, or daily bars reduced to the last close of each month (futures: Yahoo's monthly
// futures bars skip about one month in seven).
async function yahoo(symbol, interval = '1mo') {
  const d = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=9999999999&interval=${interval}`, 'json');
  const r = d.chart.result[0];
  const close = r.indicators.adjclose?.[0]?.adjclose ?? r.indicators.quote[0].close;
  const out = {};
  // Bars are stamped at the start of the month in exchange time; shift by the exchange offset
  // (London, Seoul and Tokyo month starts fall on the previous day in UTC). The offset is today's, so
  // add 12 hours to absorb daylight saving.
  const off = r.meta.gmtoffset ?? 0;
  r.timestamp.forEach((t, i) => { if (close[i] != null && close[i] > 0) out[ym(new Date((t + off + 43200) * 1000))] = close[i]; });
  return { months: out, last: { price: r.meta.regularMarketPrice, time: new Date(r.meta.regularMarketTime * 1000).toISOString() } };
}

async function boeFx() {
  const codes = { XUMLUSS: 'USD', XUMLJYS: 'JPY', XUMLHDS: 'HKD' };
  const csv = await get('https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/1970&Dateto=now'
    + `&SeriesCodes=${Object.keys(codes).join(',')}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`);
  const [head, ...lines] = csv.trim().split(/\r?\n/);
  const cols = head.split(',').slice(1).map((c) => codes[c]);
  const fx = { USD: {}, JPY: {}, HKD: {} };
  for (const l of lines) {
    const v = l.split(',');
    const m = ym(new Date(v[0] + ' UTC'));
    cols.forEach((c, i) => { const x = parseFloat(v[i + 1]); if (isFinite(x)) fx[c][m] = x; });
  }
  return fx;
}

async function onsCpi() {
  const d = await get('https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7bt/mm23/data', 'json');
  const out = {};
  for (const m of d.months) out[`${m.year}-${String(new Date(`${m.month} 1, 2000`).getMonth() + 1).padStart(2, '0')}`] = parseFloat(m.value);
  return out;
}

// Monthly UK CPI index: ONS from 1988, chained back with annual inflation spread evenly.
function ukCpi(ons) {
  const rows = JSON.parse(readFileSync(new URL('../data/uk-history.json', import.meta.url))).rows;
  const infl = Object.fromEntries(rows.map((r) => [r.year, r.inflation]));
  const out = { ...ons };
  let level = ons['1988-01'];
  for (let y = 1987; y >= 1830; y--) {
    const a = infl[y + 1] ?? infl[y] ?? 0.02;   // inflation over the year that follows this January
    const g = Math.pow(1 + a, 1 / 12);
    for (let m = 12; m >= 1; m--) { level /= g; out[`${y}-${String(m).padStart(2, '0')}`] = level; }
  }
  // Carry the last ONS print forward to the current month so recent prices are not dropped.
  const keys = Object.keys(ons).sort();
  let k = keys[keys.length - 1];
  const now = ym(new Date());
  while (k < now) { const [y, m] = k.split('-').map(Number); const n = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; out[n] = out[k]; k = n; }
  return Object.fromEntries(Object.entries(out).sort());
}

async function shiller() {
  const csv = await get('https://raw.githubusercontent.com/datasets/s-and-p-500/main/data/data.csv');
  const [, ...lines] = csv.trim().split(/\r?\n/);
  const price = {}, div = {}, cape = {}, earn = {};
  for (const l of lines) {
    const [date, p, d, e, , , , , , pe10] = l.split(',');
    const m = date.slice(0, 7);
    price[m] = +p;
    if (+d > 0) div[m] = +d;
    if (+e > 0) earn[m] = +e;
    if (+pe10 > 0) cape[m] = +pe10;
  }
  return { price, div, cape, earn };
}

async function gold() {
  const csv = await get('https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv');
  const out = {};
  for (const l of csv.trim().split(/\r?\n/).slice(1)) { const [m, p] = l.split(','); if (+p > 0) out[m] = +p; }
  return out;
}

// Assets: local-currency symbol, currency, and an approximate long-run dividend yield used to
// estimate total return where only a price index exists (stated on the page).
const ASSETS = [
  { id: 'spx', name: 'S&P 500', group: 'equity', region: 'US', symbol: '^GSPC', tr: '^SP500TR', ccy: 'USD', divYield: 0.02 },
  { id: 'ndx', name: 'Nasdaq-100', group: 'equity', region: 'US', symbol: '^NDX', ccy: 'USD', divYield: 0.009 },
  { id: 'ftse', name: 'FTSE 100', group: 'equity', region: 'UK', symbol: '^FTSE', ccy: 'GBP', divYield: 0.037 },
  { id: 'nikkei', name: 'Nikkei 225', group: 'equity', region: 'Japan', symbol: '^N225', ccy: 'JPY', divYield: 0.016 },
  { id: 'kospi', name: 'KOSPI', group: 'equity', region: 'Korea', symbol: '^KS11', ccy: 'KRW', divYield: 0.018 },
  { id: 'hsi', name: 'Hang Seng', group: 'equity', region: 'Hong Kong', symbol: '^HSI', ccy: 'HKD', divYield: 0.034 },
  { id: 'taiex', name: 'Taiwan TAIEX', group: 'equity', region: 'Taiwan', symbol: '^TWII', ccy: 'TWD', divYield: 0.03 },
  { id: 'nifty', name: 'Nifty 50', group: 'equity', region: 'India', symbol: '^NSEI', ccy: 'INR', divYield: 0.013 },
  { id: 'sox', name: 'US chip stocks (SOX)', group: 'ai', region: 'US', symbol: '^SOX', ccy: 'USD', divYield: 0.01 },
  { id: 'gold', name: 'Gold', group: 'commodity', symbol: 'GC=F', ccy: 'USD', divYield: 0, unit: 'oz' },
  { id: 'silver', name: 'Silver', group: 'commodity', symbol: 'SI=F', ccy: 'USD', divYield: 0, unit: 'oz' },
  { id: 'platinum', name: 'Platinum', group: 'commodity', symbol: 'PL=F', ccy: 'USD', divYield: 0, unit: 'oz' },
  { id: 'copper', name: 'Copper', group: 'commodity', symbol: 'HG=F', ccy: 'USD', divYield: 0, unit: 'lb' },
  { id: 'brent', name: 'Brent crude', group: 'commodity', symbol: 'BZ=F', ccy: 'USD', divYield: 0, unit: 'bbl' },
];
const YFX = { KRW: 'GBPKRW=X', TWD: 'GBPTWD=X', INR: 'GBPINR=X' };

const [boe, ons, sh, gd] = await Promise.all([boeFx(), onsCpi(), shiller(), gold()]);
const fx = { GBP: null, ...boe };
for (const [c, s] of Object.entries(YFX)) fx[c] = (await yahoo(s, '1d')).months;
// Yahoo fills the current, unfinished month: extend BoE series with Yahoo's latest spot.
for (const [c, s] of Object.entries({ USD: 'GBPUSD=X', JPY: 'GBPJPY=X', HKD: 'GBPHKD=X' })) {
  const y = await yahoo(s);
  for (const [m, v] of Object.entries(y.months)) if (fx[c][m] == null) fx[c][m] = v;
}

const months = (from) => { const out = []; let [y, m] = from.split('-').map(Number); const end = ym(new Date()); for (;;) { const k = `${y}-${String(m).padStart(2, '0')}`; if (k > end) break; out.push(k); m++; if (m > 12) { m = 1; y++; } } return out; };
// Last good file: if one Yahoo series fails, keep its previous data rather than drop the asset.
const prevPath = new URL('../data/assets.json', import.meta.url);
const prev = existsSync(prevPath) ? JSON.parse(readFileSync(prevPath)) : null;
const stale = [];
const assets = [];
for (const a of ASSETS) {
  let y;
  try { y = await yahoo(a.symbol, a.group === 'commodity' ? '1d' : '1mo'); } catch (e) {
    const old = prev?.assets.find((x) => x.id === a.id);
    if (!old) throw e;
    console.error(`\n${a.id}: ${e.message}; keeping data to ${old.last?.time?.slice(0, 10)}`);
    stale.push(a.id); assets.push(old); continue;
  }
  let px = y.months, start = Object.keys(px).sort()[0], note = null;
  if (a.id === 'gold') {
    // Long monthly averages before the futures series; futures month-ends after.
    px = { ...Object.fromEntries(Object.entries(gd).filter(([m]) => m < start)), ...px };
    note = 'Monthly average price before Sep 2000, COMEX futures month-end after';
  }
  let tr = null;
  if (a.tr) {
    tr = (await yahoo(a.tr)).months;
    // Before 1988, chain S&P total return from Shiller price plus dividends.
    const trStart = Object.keys(tr).sort()[0];
    const ms = Object.keys(sh.price).filter((m) => m <= trStart).sort();
    const back = {}; let lvl = tr[trStart];
    back[trStart] = lvl;
    for (let i = ms.length - 1; i > 0; i--) {
      const m = ms[i], p = ms[i - 1];
      const r = (sh.price[m] + (sh.div[p] ?? 0) / 12) / sh.price[p];
      lvl /= r; back[p] = lvl;
    }
    tr = { ...back, ...tr };
    px = { ...Object.fromEntries(Object.entries(sh.price).filter(([m]) => m < start)), ...px };
    note = 'Shiller monthly averages before 1985; total return chained from Shiller dividends before 1988';
  }
  // Dense monthly arrays from the first month; Yahoo skips some months, so carry the last close.
  const first = Object.keys(px).sort()[0];
  const ffill = (o) => { let last = null; return months(first).map((m) => { if (o[m] != null) last = +o[m].toPrecision(6); return last; }); };
  const dense = ffill(px);
  assets.push({ ...a, note, first, last: y.last, px: dense, tr: tr ? ffill(tr) : null });
  process.stdout.write(`${a.id} ${first} (${dense.length}, ${dense.length - Object.keys(px).length} filled)  `);
}

// Live roll-forward inputs: the close on (or just before) each research date, and the latest price,
// for every index and AI-linked company named in data/markets-research.json.
const research = JSON.parse(readFileSync(new URL('../data/markets-research.json', import.meta.url)));
const want = {};   // ticker -> set of dates
const need = (t, d) => { if (t && d && /^\d{4}-\d{2}-\d{2}$/.test(d)) (want[t] ??= new Set()).add(d); };
for (const a of ASSETS.filter((x) => x.group === 'equity')) {
  need(a.symbol, research.valuation?.[a.id]?.asOf);
  const ai = research.aiConcentration?.[a.id];
  if (ai?.constituents) { need(a.symbol, ai.asOf); for (const c of ai.constituents) for (const t of c.tickers ?? [c.ticker]) need(t, ai.asOf); }
}
async function daily(symbol, fromDate) {
  const p1 = Math.floor(new Date(fromDate + 'T00:00:00Z') / 1000) - 14 * 86400;
  const d = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=9999999999&interval=1d`, 'json');
  const r = d.chart.result[0], off = r.meta.gmtoffset ?? 0, close = r.indicators.quote[0].close;
  const days = r.timestamp.map((t, i) => [new Date((t + off + 43200) * 1000).toISOString().slice(0, 10), close[i]]).filter(([, c]) => c != null);
  return { days, now: r.meta.regularMarketPrice ?? days[days.length - 1][1], nowTime: new Date(r.meta.regularMarketTime * 1000).toISOString() };
}
const live = { fetched: new Date().toISOString(), quotes: {}, at: {} };
for (const [t, dates] of Object.entries(want)) {
  const ds = [...dates].sort();
  try {
    const q = await daily(t, ds[0]);
    live.quotes[t] = { now: q.now, time: q.nowTime };
    for (const dt of ds) { const hit = [...q.days].reverse().find(([day]) => day <= dt); if (hit) live.at[`${t}@${dt}`] = hit[1]; }
  } catch (e) {
    console.error(`live ${t}: ${e.message}; keeping previous`);
    if (prev?.live?.quotes?.[t]) live.quotes[t] = prev.live.quotes[t];
    for (const dt of ds) if (prev?.live?.at?.[`${t}@${dt}`] != null) live.at[`${t}@${dt}`] = prev.live.at[`${t}@${dt}`];
    stale.push(t);
  }
}

const series = (obj, from) => { const ks = months(from); return ks.map((k) => (obj[k] != null ? +obj[k].toPrecision(6) : null)); };
// Yahoo's early FX history is patchy: start after the last gap longer than two months, then carry
// a rate forward over any single missing month.
function fxClean(v, first) {
  let start = 0, run = 0;
  v.forEach((x, i) => { if (x == null) { run++; if (run > 2) start = i + 1; } else run = 0; });
  const out = v.slice(start);
  for (let i = 1; i < out.length; i++) if (out[i] == null) out[i] = out[i - 1];
  return { first: months(first)[start], v: out };
}
const cpi = ukCpi(ons);
const fxFirst = Object.fromEntries(Object.entries(fx).filter(([, v]) => v).map(([c, v]) => [c, Object.keys(v).sort()[0]]));

const out = {
  fetched: new Date().toISOString(),
  sources: {
    yahoo: 'Yahoo Finance chart API, month-end closes (indices in local currency, COMEX/NYMEX/ICE front-month futures in USD)',
    boe: 'Bank of England month-end spot rates XUMLUSS, XUMLJYS, XUMLHDS',
    ons: 'ONS CPI index 00: all items 2015=100 (D7BT); before 1988 chained from annual UK CPI',
    shiller: 'Robert Shiller, U.S. Stock Markets 1871-Present (datahub.io/core/s-and-p-500)',
    gold: 'Monthly gold price since 1833 (datahub.io/core/gold-prices)',
  },
  assets,
  fx: Object.fromEntries(Object.entries(fx).filter(([, v]) => v).map(([c, v]) => [c, fxClean(series(v, fxFirst[c]), fxFirst[c])])),
  cpi: { first: '1900-01', v: series(cpi, '1900-01') },
  cape: { first: '1881-01', v: series(sh.cape, '1881-01') },
  live,
  stale,
};
writeFileSync(new URL('../data/assets.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`\nassets.json ${(JSON.stringify(out).length / 1024).toFixed(0)} KB; live quotes ${Object.keys(live.quotes).length}${stale.length ? `; STALE: ${stale.join(', ')}` : ''}`);
