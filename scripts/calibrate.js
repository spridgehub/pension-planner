// Fit the annuity pricing basis to published market rates and write data/market-basis.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { annuityIncome } from '../src/annuity.js';

const ratesPath = new URL('../data/market-rates-2026-10-22.json', import.meta.url);
const market = JSON.parse(readFileSync(ratesPath));

function basisFrom([y, cpi, m, imp]) {
  return { nominalYield: y, cpiPriced: cpi, mortalityMultiplier: m, longTermImprovement: imp, startYear: 2026 };
}

function errors(basis) {
  const out = [];
  for (const row of market.rows) {
    market.ages.forEach((age, i) => {
      const lives = { age, spouseAge: age - 3 };
      const model = annuityIncome(market.purchase, row.spec, lives, basis);
      out.push({ row, age, model, actual: row.income[i], rel: model / row.income[i] - 1 });
    });
  }
  return out;
}
const FIXED_IMPROVEMENT = 0.015; // CMI-style long-term rate; fitting it freely just hits the bound
const loss = (q) => {
  const p = [...q, FIXED_IMPROVEMENT];
  if (p[0] < 0 || p[1] < 0 || p[2] <= 0.05 || p[3] < 0 || p[3] > 0.03) return 1e9;
  return errors(basisFrom(p)).reduce((a, e) => a + e.rel * e.rel, 0);
};

// Nelder-Mead
function nelderMead(f, x0, step, iters = 400) {
  let simplex = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + step[j] : v)))].map((x) => ({ x, f: f(x) }));
  for (let k = 0; k < iters; k++) {
    simplex.sort((a, b) => a.f - b.f);
    const n = x0.length, best = simplex[0], worst = simplex[n];
    const c = x0.map((_, j) => simplex.slice(0, n).reduce((a, s) => a + s.x[j], 0) / n);
    const at = (t) => { const x = c.map((v, j) => v + t * (worst.x[j] - v)); return { x, f: f(x) }; };
    const r = at(-1);
    if (r.f < best.f) { const e = at(-2); simplex[n] = e.f < r.f ? e : r; }
    else if (r.f < simplex[n - 1].f) simplex[n] = r;
    else {
      const ct = at(0.5);
      if (ct.f < worst.f) simplex[n] = ct;
      else simplex = simplex.map((s, i) => (i === 0 ? s : { x: s.x.map((v, j) => best.x[j] + 0.5 * (v - best.x[j])), f: 0 })).map((s, i) => (i === 0 ? s : { x: s.x, f: f(s.x) }));
    }
  }
  simplex.sort((a, b) => a.f - b.f);
  return simplex[0];
}

const fit = nelderMead(loss, [0.05, 0.03, 0.6], [0.005, 0.005, 0.1]);
fit.x.push(FIXED_IMPROVEMENT);
const basis = basisFrom(fit.x);
const errs = errors(basis);
const rms = Math.sqrt(errs.reduce((a, e) => a + e.rel * e.rel, 0) / errs.length);

// Enhanced (smoker) rate as an equivalent mortality multiplier relative to the basis.
const enh = market.enhanced;
let lo = 1, hi = 5;
for (let i = 0; i < 50; i++) {
  const mid = (lo + hi) / 2;
  const inc = annuityIncome(market.purchase, enh.spec, { age: enh.age }, { ...basis, mortalityMultiplier: basis.mortalityMultiplier * mid });
  if (inc < enh.income) lo = mid; else hi = mid;
}

const out = {
  asOf: '2026-10-22',
  source: market.source,
  ...basis,
  expenseLoad: 0,
  enhancedSmokerMultiplier: +((lo + hi) / 2).toFixed(3),
  curveAtCalibration: JSON.parse(readFileSync(new URL('../data/market-basis.json', import.meta.url))).curveAtCalibration,
  fit: { rmsRelativeError: +rms.toFixed(4), maxAbsRelativeError: +Math.max(...errs.map((e) => Math.abs(e.rel))).toFixed(4) },
};
writeFileSync(new URL('../data/market-basis.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');

console.log('basis', out);
for (const e of errs) console.log(JSON.stringify(e.row.spec).padEnd(95), e.age, Math.round(e.model), e.actual, (e.rel * 100).toFixed(1) + '%');
