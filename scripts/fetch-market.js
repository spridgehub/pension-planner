// Fetch today's market conditions into data/market-now.json:
//   Bank of England IADB: Bank Rate, 10y and 20y nominal zero-coupon gilt yields,
//   20y real yield and 20y implied (RPI) inflation, daily since 2019.
//   ONS: CPI annual rate (D7G7), monthly.
// Run with `npm run refresh` (fetch + rebuild the page).
import { writeFileSync } from 'node:fs';

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh) pension-planner/0.2' };
const SERIES = { IUDBEDR: 'bankRate', IUDMNZC: 'gilt10', IUDLNZC: 'gilt20', IUDLRZC: 'real20', IUDLIZC: 'implied20' };

async function boe() {
  const url = 'https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2019&Dateto=now'
    + `&SeriesCodes=${Object.keys(SERIES).join(',')}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`BoE ${res.status}`);
  const [head, ...lines] = (await res.text()).trim().split(/\r?\n/);
  const cols = head.split(',');
  const rows = lines.map((l) => {
    const v = l.split(',');
    const r = { date: new Date(v[0] + ' UTC').toISOString().slice(0, 10) };
    cols.slice(1).forEach((c, i) => { const x = parseFloat(v[i + 1]); r[SERIES[c]] = isFinite(x) ? x / 100 : null; });
    return r;
  });
  const latest = {};
  for (const k of Object.values(SERIES)) {
    const r = [...rows].reverse().find((x) => x[k] != null);
    latest[k] = { value: r[k], date: r.date };
  }
  // Month-end samples for sparklines.
  const monthly = [];
  for (const r of rows) {
    const m = r.date.slice(0, 7);
    if (r.gilt10 == null) continue;
    if (monthly.length && monthly[monthly.length - 1].month === m) monthly[monthly.length - 1] = { month: m, ...pick(r) };
    else monthly.push({ month: m, ...pick(r) });
  }
  return { latest, monthly };
}
const pick = (r) => ({ bankRate: r.bankRate, gilt10: r.gilt10, gilt20: r.gilt20, real20: r.real20, implied20: r.implied20 });

async function ons() {
  const res = await fetch('https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23/data', { headers: UA });
  if (!res.ok) throw new Error(`ONS ${res.status}`);
  const d = await res.json();
  const months = d.months.filter((m) => +m.year >= 2019).map((m) => ({ month: `${m.year}-${String(new Date(`${m.month} 1, 2000`).getMonth() + 1).padStart(2, '0')}`, cpi: parseFloat(m.value) / 100 }));
  return { latest: months[months.length - 1], months };
}

const [b, c] = await Promise.all([boe(), ons()]);
const out = {
  fetched: new Date().toISOString(),
  sources: {
    boe: 'Bank of England Statistical Interactive Database (IUDBEDR, IUDMNZC, IUDLNZC, IUDLRZC, IUDLIZC)',
    ons: 'ONS CPI annual rate 00: all items (D7G7)',
  },
  latest: { ...b.latest, cpi: { value: c.latest.cpi, date: c.latest.month } },
  monthly: b.monthly.map((m) => ({ ...m, cpi: c.months.find((x) => x.month === m.month)?.cpi ?? null })),
};
writeFileSync(new URL('../data/market-now.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log('market-now', Object.entries(out.latest).map(([k, v]) => `${k} ${(v.value * 100).toFixed(2)}% (${v.date})`).join(', '));
