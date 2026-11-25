// Fetch conventional gilt prices into data/gilts.json from giltcalculator.co.uk/gilts (indicative
// clean mid prices; the DMO's own pages are captcha-protected). Keeps the previous file if the
// page cannot be read or looks wrong. Run by `npm run refresh`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUT = new URL('../data/gilts.json', import.meta.url);
const res = await fetch('https://www.giltcalculator.co.uk/gilts', { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) pension-planner/0.3' } });
if (!res.ok) throw new Error(`gilt prices ${res.status}`);
const html = await res.text();
const asOf = html.match(/Prices as of <time dateTime="([^"]+)"/)?.[1];
const start = html.indexOf('id="group-gilt"'), end = html.indexOf('</table>', start);
if (!asOf || start < 0 || end < 0) throw new Error('gilt page layout changed');
const strip = (s) => s.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const gilts = [];
for (const row of html.slice(start, end).split('<tr>').slice(2)) {
  const name = strip(row.match(/<a [^>]*>([^<]+)<\/a>/)?.[1] ?? '').replace(/^UK /, '');
  const ticker = strip(row.match(/<span class="[^"]*small[^"]*">(.*?)<\/span>/)?.[1] ?? '');
  const tds = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => strip(m[1]));
  const [day, mon, yr] = (tds[0] ?? '').split(' ');
  const coupon = parseFloat(tds[1]) / 100, price = parseFloat(tds[2]), quotedYield = parseFloat(tds[3]) / 100;
  if (!name || !(price > 20 && price < 200) || !isFinite(coupon) || MONTHS[mon] == null) continue;
  const maturity = new Date(Date.UTC(+yr, MONTHS[mon], +day)).toISOString().slice(0, 10);
  gilts.push({ ticker: ticker || undefined, name, coupon, maturity, price, quotedYield });
}
if (gilts.length < 40) throw new Error(`only ${gilts.length} gilts parsed`);
const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT)) : null;
writeFileSync(OUT, JSON.stringify({ asOf: asOf.slice(0, 16), source: 'giltcalculator.co.uk/gilts (indicative clean mid prices; not executable)', gilts }, null, 1) + '\n');
console.log(`gilts ${gilts.length} priced ${asOf.slice(0, 16)}${old ? ` (was ${old.asOf})` : ''}`);
