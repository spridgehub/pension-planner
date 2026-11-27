// Commodity shares for the Commodities page: miners, royalty companies and oil majors, each set
// against the commodity it depends on. Writes data/commodity-stocks.json.
//   Yahoo Finance: five years of daily closes for each share, its commodity and GBPUSD (London
//   shares are converted to dollars so the share-to-commodity ratio is not distorted by sterling).
//   stockanalysis.com: valuation snapshot (P/E, forward P/E, EV/EBITDA, P/B, dividend and FCF yield),
//   refreshed at most once every 20 hours.
// Keeps previous data for anything that fails.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUT = new URL('../data/commodity-stocks.json', import.meta.url);
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT)) : null;
// Yahoo throttles browser-like user agents; stockanalysis.com wants one.
const UA_YAHOO = { 'User-Agent': 'Mozilla/5.0 (Macintosh) pension-planner/0.3' };
const UA_WEB = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130 Safari/537.36' };
const get = async (url, json = true) => {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: url.includes('yahoo.com') ? UA_YAHOO : UA_WEB }); if (!r.ok) throw new Error(`${r.status} ${url}`); return json ? r.json() : r.text(); } catch (e) { if (i === 2) throw e; await new Promise((s) => setTimeout(s, 1500 * (i + 1))); }
  }
};

// symbol, name, group, commodity, stockanalysis path, listing note
const LIST = [
  ['GDX', 'Gold miners fund (VanEck GDX)', 'Gold and silver', 'gold', 'etf/gdx', 'US fund'],
  ['NEM', 'Newmont', 'Gold and silver', 'gold', 'stocks/nem', 'US'],
  ['AEM', 'Agnico Eagle', 'Gold and silver', 'gold', 'stocks/aem', 'US'],
  ['EDV.L', 'Endeavour Mining', 'Gold and silver', 'gold', 'quote/lon/EDV', 'London'],
  ['FRES.L', 'Fresnillo', 'Gold and silver', 'silver', 'quote/lon/FRES', 'London'],
  ['PAAS', 'Pan American Silver', 'Gold and silver', 'silver', 'stocks/paas', 'US'],
  ['SIL', 'Silver miners fund (Global X SIL)', 'Gold and silver', 'silver', 'etf/sil', 'US fund'],
  ['FNV', 'Franco-Nevada (royalties)', 'Royalties', 'gold', 'stocks/fnv', 'US'],
  ['WPM', 'Wheaton Precious Metals (streams)', 'Royalties', 'gold', 'stocks/wpm', 'US'],
  ['SBSW', 'Sibanye Stillwater', 'Platinum', 'platinum', 'stocks/sbsw', 'US (ADR)'],
  ['FCX', 'Freeport-McMoRan', 'Copper and diversified', 'copper', 'stocks/fcx', 'US'],
  ['ANTO.L', 'Antofagasta', 'Copper and diversified', 'copper', 'quote/lon/ANTO', 'London'],
  ['GLEN.L', 'Glencore', 'Copper and diversified', 'copper', 'quote/lon/GLEN', 'London'],
  ['RIO.L', 'Rio Tinto', 'Copper and diversified', 'copper', 'quote/lon/RIO', 'London'],
  ['AAL.L', 'Anglo American', 'Copper and diversified', 'copper', 'quote/lon/AAL', 'London'],
  ['BHP', 'BHP', 'Copper and diversified', 'copper', 'stocks/bhp', 'US (ADR)'],
  ['SHEL.L', 'Shell', 'Oil', 'brent', 'quote/lon/SHEL', 'London'],
  ['BP.L', 'BP', 'Oil', 'brent', 'quote/lon/BP', 'London'],
  ['XOM', 'ExxonMobil', 'Oil', 'brent', 'stocks/xom', 'US'],
  ['CVX', 'Chevron', 'Oil', 'brent', 'stocks/cvx', 'US'],
  ['XLE', 'US energy fund (XLE)', 'Oil', 'brent', 'etf/xle', 'US fund'],
];
const COMMOD = { gold: ['GC=F', 'Gold'], silver: ['SI=F', 'Silver'], platinum: ['PL=F', 'Platinum'], copper: ['HG=F', 'Copper'], brent: ['BZ=F', 'Brent crude'] };

async function daily(symbol) {
  const p1 = Math.floor(Date.now() / 1000) - Math.round(5.05 * 365.25 * 86400);
  const d = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=9999999999&interval=1d`);
  const r = d.chart.result[0], off = r.meta.gmtoffset ?? 0, c = r.indicators.quote[0].close;
  const map = new Map();
  r.timestamp.forEach((t, i) => { if (c[i] != null && c[i] > 0) map.set(new Date((t + off + 43200) * 1000).toISOString().slice(0, 10), c[i]); });
  return { map, ccy: r.meta.currency, now: r.meta.regularMarketPrice, time: new Date(r.meta.regularMarketTime * 1000).toISOString() };
}
const logr = (v) => v.slice(1).map((x, i) => Math.log(x / v[i]));
const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };

// Commodity and FX series; a shared calendar of US trading days from gold futures.
const fx = await daily('GBPUSD=X');
const com = {};
for (const [k, [sym]] of Object.entries(COMMOD)) com[k] = await daily(sym);
const ffill = (map, dates) => { let last = null; return dates.map((d) => { if (map.has(d)) last = map.get(d); return last; }); };

async function valuation(path) {
  const h = await get(`https://stockanalysis.com/${path}/${path.startsWith('etf/') ? '' : 'statistics/'}`, false);
  const t = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const num = (label) => { const m = t.match(new RegExp(label.replace(/[/()]/g, '\\$&') + ' (-?[\\d.,]+)(%?)')); if (!m) return null; const v = parseFloat(m[1].replace(/,/g, '')); return m[2] ? v / 100 : v; };
  return { pe: num('PE Ratio'), fwdPe: num('Forward PE'), evEbitda: num('EV / EBITDA'), pb: num('PB Ratio'), divYield: num('Dividend Yield'), fcfYield: num('FCF Yield') };
}
const freshVals = prev?.valuationsFetched && Date.now() - Date.parse(prev.valuationsFetched) < 20 * 3600e3;

const out = { fetched: new Date().toISOString(), valuationsFetched: freshVals ? prev.valuationsFetched : new Date().toISOString(), commodities: {}, stocks: [], stale: [] };
for (const [k, [sym, name]] of Object.entries(COMMOD)) out.commodities[k] = { symbol: sym, name };

for (const [symbol, name, group, commodity, path, listing] of LIST) {
  const old = prev?.stocks.find((x) => x.symbol === symbol);
  try {
    const s = await daily(symbol);
    const dates = [...s.map.keys()].sort();
    const london = s.ccy === 'GBp' || s.ccy === 'GBX' || s.ccy === 'GBP';
    const toUsd = (d, v) => (london ? (s.ccy === 'GBP' ? v : v / 100) * (fx.map.get(d) ?? null) : v);
    const fxF = ffill(fx.map, dates), cF = ffill(com[commodity].map, dates);
    const usd = dates.map((d, i) => (london ? (s.ccy === 'GBP' ? s.map.get(d) : s.map.get(d) / 100) * fxF[i] : s.map.get(d)));
    const ok = dates.map((_, i) => usd[i] > 0 && cF[i] > 0);
    const D = dates.filter((_, i) => ok[i]), P = usd.filter((_, i) => ok[i]), C = cF.filter((_, i) => ok[i]), L = dates.map((d) => s.map.get(d)).filter((_, i) => ok[i]);
    const n = P.length;
    const ret = (v, k) => (v.length > k ? v[v.length - 1] / v[v.length - 1 - k] - 1 : null);
    const ratio = P.map((p, i) => p / C[i]);
    const r5 = ratio.slice(-1260), now = r5[r5.length - 1];
    const pct = r5.filter((x) => x < now).length / r5.length;
    const avg = r5.reduce((a, b) => a + b, 0) / r5.length;
    const a1 = logr(P.slice(-253)), b1 = logr(C.slice(-253));
    const ma = a1.reduce((x, y) => x + y, 0) / a1.length, mb = b1.reduce((x, y) => x + y, 0) / b1.length;
    let cov = 0, vb = 0; for (let i = 0; i < a1.length; i++) { cov += (a1[i] - ma) * (b1[i] - mb); vb += (b1[i] - mb) ** 2; }
    let val = old?.val ?? null;
    if (!freshVals || !val) { try { val = await valuation(path); } catch (e) { console.error(`valuation ${symbol}: ${e.message}`); } }
    const wk = (arr) => arr.filter((_, i) => (arr.length - 1 - i) % 5 === 0);
    out.stocks.push({ symbol, name, group, commodity, listing, ccy: s.ccy, price: s.now ?? L[n - 1], time: s.time, asOf: D[n - 1],
      r1m: ret(P, 21), r3m: ret(P, 63), r12m: ret(P, 252), r3y: P.length > 756 ? Math.pow(P[n - 1] / P[n - 757], 1 / 3) - 1 : null,
      c1m: ret(C, 21), c3m: ret(C, 63), c12m: ret(C, 252),
      local12m: ret(L, 252),
      beta: cov / vb, vol: sd(a1) * Math.sqrt(252), cvol: sd(b1) * Math.sqrt(252),
      ratioPct: pct, ratioVsAvg: now / avg - 1, ratioFrom: D[Math.max(0, n - r5.length)],
      ratioWeekly: wk(r5).map((x) => +(x / avg).toPrecision(4)), dateWeekly: wk(D.slice(-r5.length)),
      priceWeekly: wk(P.slice(-253)).map((x) => +x.toPrecision(5)), comWeekly: wk(C.slice(-253)).map((x) => +x.toPrecision(5)),
      val });
    process.stdout.write(`${symbol} `);
  } catch (e) {
    console.error(`\n${symbol}: ${e.message}${old ? '; keeping previous' : ''}`);
    if (old) out.stocks.push(old);
    out.stale.push(symbol);
  }
}
if (out.stocks.length < 12) throw new Error(`only ${out.stocks.length} commodity shares`);
writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(`\ncommodity-stocks ${out.stocks.length}${out.stale.length ? `; stale ${out.stale.join(', ')}` : ''}`);
