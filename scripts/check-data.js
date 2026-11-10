// Sanity checks run before anything is published (scripts/daily.sh, scripts/research.sh).
// Exit 1 with a list of problems if the data looks wrong; warnings print but pass.
//   node scripts/check-data.js            check everything
//   node scripts/check-data.js research   check only data/markets-research.json
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d));
const daysAgo = (d) => (Date.now() - new Date(d)) / 864e5;
const between = (x, lo, hi) => typeof x === 'number' && isFinite(x) && x >= lo && x <= hi;
const EQUITIES = ['spx', 'ndx', 'ftse', 'nikkei', 'kospi', 'hsi', 'taiex', 'nifty'];

function checkResearch() {
  let r;
  try { r = read('data/markets-research.json'); } catch (e) { err(`markets-research.json does not parse: ${e.message}`); return; }
  if (!isDate(r.retrieved)) err('research.retrieved must be YYYY-MM-DD');
  for (const id of EQUITIES) {
    const v = r.valuation?.[id];
    if (!v) { err(`valuation.${id} missing`); continue; }
    if (!isDate(v.asOf)) err(`valuation.${id}.asOf must be YYYY-MM-DD`);
    else if (daysAgo(v.asOf) > 200) warn(`valuation.${id} is ${Math.round(daysAgo(v.asOf))} days old`);
    if (v.cape != null && !between(v.cape, 4, 90)) err(`valuation.${id}.cape ${v.cape} out of range`);
    if (v.pe != null && !between(v.pe, 3, 120)) err(`valuation.${id}.pe ${v.pe} out of range`);
    if (v.fwdPe != null && !between(v.fwdPe, 2, 90)) err(`valuation.${id}.fwdPe ${v.fwdPe} out of range`);
    if (v.divYield != null && !between(v.divYield, 0, 0.12)) err(`valuation.${id}.divYield ${v.divYield} should be a fraction`);
    if (v.cape == null && v.pe == null) err(`valuation.${id} needs cape or pe`);
    const a = r.aiConcentration?.[id];
    if (!a) { err(`aiConcentration.${id} missing`); continue; }
    if (a.weight != null && !between(a.weight, 0, 0.9)) err(`aiConcentration.${id}.weight ${a.weight} should be a fraction`);
    if (a.constituents) {
      if (!isDate(a.asOf)) err(`aiConcentration.${id}.asOf must be YYYY-MM-DD when constituents are given`);
      const sum = a.constituents.reduce((s, c) => s + (c.weight || 0), 0);
      if (Math.abs(sum - a.weight) > 0.01) err(`aiConcentration.${id}: constituents sum ${sum.toFixed(3)} but weight ${a.weight}`);
      for (const c of a.constituents) {
        if (!c.ticker && !(Array.isArray(c.tickers) && c.tickers.length)) err(`aiConcentration.${id}: constituent ${c.name} has no ticker`);
        if (!between(c.weight, 0, 0.6)) err(`aiConcentration.${id}: ${c.name} weight ${c.weight} out of range`);
      }
    }
  }
  if (!Array.isArray(r.forecasts) || r.forecasts.length < 3) err('forecasts: expected at least 3 houses');
  for (const f of r.forecasts ?? []) for (const [k, x] of Object.entries(f.values ?? {})) if (!between(x, -0.2, 0.25)) err(`forecast ${f.house} ${k} ${x} should be an annual fraction`);
  const c = r.commodities ?? {};
  if (!between(c.goldRecord?.usd, 1000, 50000)) err('commodities.goldRecord.usd out of range');
  if (!between(c.silverRecord?.usd, 10, 1000)) err('commodities.silverRecord.usd out of range');
  if (!Array.isArray(c.goldForecasts) || !c.goldForecasts.every((g) => between(g.mid, 1000, 50000))) err('commodities.goldForecasts need numeric mid in $');
  if (!Array.isArray(r.aiContext?.warnings)) err('aiContext.warnings missing');
}

function checkAssets() {
  let a;
  try { a = read('data/assets.json'); } catch (e) { err(`assets.json does not parse: ${e.message}`); return; }
  if (daysAgo(a.fetched) > 4) err(`assets.json fetched ${a.fetched}, over 4 days ago`);
  const now = new Date().toISOString().slice(0, 7);
  const prevMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  for (const x of a.assets) {
    const n = x.px.length;
    if (n < 100) err(`${x.id}: only ${n} months`);
    const [y, m] = x.first.split('-').map(Number);
    const lastM = new Date(Date.UTC(y, m - 1 + n - 1, 1)).toISOString().slice(0, 7);
    if (lastM !== now && lastM !== prevMonth) err(`${x.id}: last month ${lastM}, expected ${now}`);
    if (daysAgo(x.last?.time) > 6) warn(`${x.id}: last quote ${x.last?.time}`);
    for (let i = Math.max(1, n - 24); i < n; i++) {
      const r = x.px[i] / x.px[i - 1] - 1;
      const lim = x.group === 'commodity' || x.id === 'sox' ? 0.7 : 0.45;
      if (!isFinite(r) || Math.abs(r) > lim) err(`${x.id}: ${(r * 100).toFixed(0)}% move in one month near the end, check the data`);
    }
  }
  for (const [c, f] of Object.entries(a.fx)) {
    const v = f.v[f.v.length - 1];
    if (!between(v, 0.5, 5000)) err(`fx ${c} latest ${v} out of range`);
  }
  if (a.stale?.length) warn(`not refreshed this run, kept previous: ${a.stale.join(', ')}`);
  const live = a.live?.quotes ?? {};
  if (Object.keys(live).length < 15) err(`only ${Object.keys(live).length} live quotes`);
  let m;
  try { m = read('data/market-now.json'); if (daysAgo(m.fetched) > 4) err(`market-now.json fetched ${m.fetched}`); } catch (e) { err(`market-now.json: ${e.message}`); }
}

checkResearch();
if (process.argv[2] !== 'research') checkAssets();
for (const w of warnings) console.log('warn:', w);
for (const e of errors) console.log('ERROR:', e);
console.log(errors.length ? `${errors.length} problem(s)` : 'data ok');
process.exit(errors.length ? 1 : 0);
