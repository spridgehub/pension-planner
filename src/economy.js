// Economic scenarios built only from UK history (1872-2025):
//  - 'historical': replay actual sequences from each start year (the 100-year backtest).
//  - 'bootstrap': stitch random multi-year blocks of real history together. Keeps the
//    real joint behaviour of inflation, equities and gilts (e.g. 1974, 2022) and its fat
//    tails without assuming a distribution.
// Each scenario is an array of years { inflation, equity, bonds, cash } (nominal).
import { history } from './data.js';
import { makeRng } from './rng.js';

export const HISTORY = history.rows;

export function historyFrom(fromYear = 1900) {
  return HISTORY.filter((r) => r.year >= fromYear);
}

// Shift returns to reflect a view that the future differs from the past: e.g.
// equityAdj -0.01 lowers every year's equity return by one percentage point.
function adjust(row, adj) {
  if (!adj) return row;
  return {
    ...row,
    equity: row.equity + (adj.equity ?? 0),
    bonds: row.bonds + (adj.bonds ?? 0),
    cash: row.cash + (adj.cash ?? 0),
    inflation: row.inflation + (adj.inflation ?? 0),
  };
}

// One scenario per historical start year. Paths that run past 2025 wrap round to the
// start of the window so every start year gets a full horizon; `complete` marks the ones
// that did not need to wrap.
export function historicalScenarios({ fromYear = 1900, toYear = 2025, horizon = 50, adj } = {}) {
  const rows = HISTORY.filter((r) => r.year >= fromYear && r.year <= toYear);
  return rows.map((r, i) => {
    const path = [];
    for (let t = 0; t < horizon; t++) path.push(adjust(rows[(i + t) % rows.length], adj));
    return { label: String(r.year), startYear: r.year, complete: i + horizon <= rows.length, path };
  });
}

// `startYears` conditions the opening: the first `firstBlock` years replay history from a
// randomly chosen one of those years (e.g. years that started like today), then random blocks.
export function bootstrapScenarios({ n = 2000, horizon = 50, block = 5, fromYear = 1900, seed = 7, adj, startYears, firstBlock = 10 } = {}) {
  const rows = historyFrom(fromYear);
  const rng = makeRng(seed);
  const starts = startYears?.length ? startYears.map((y) => rows.findIndex((r) => r.year === y)).filter((i) => i >= 0) : null;
  const out = [];
  for (let k = 0; k < n; k++) {
    const path = [];
    if (starts) {
      const s = starts[Math.floor(rng.uniform() * starts.length)];
      for (let j = 0; j < firstBlock && path.length < horizon; j++) path.push(adjust(rows[(s + j) % rows.length], adj));
    }
    while (path.length < horizon) {
      const s = Math.floor(rng.uniform() * rows.length);
      for (let j = 0; j < block && path.length < horizon; j++) path.push(adjust(rows[(s + j) % rows.length], adj));
    }
    out.push({ label: `sim ${k + 1}`, path });
  }
  return out;
}

export function portfolioReturn(row, mix) {
  const e = mix.equity ?? 0.6, b = mix.bonds ?? 1 - e - (mix.cash ?? 0), c = mix.cash ?? 0;
  return e * row.equity + b * row.bonds + c * row.cash;
}

// Long-run summary of a set of rows, for the assumptions panel.
export function summarise(rows) {
  const geo = (f) => Math.exp(rows.reduce((a, r) => a + Math.log(1 + f(r)), 0) / rows.length) - 1;
  return {
    years: `${rows[0].year}-${rows[rows.length - 1].year}`,
    inflation: geo((r) => r.inflation),
    equityReal: geo((r) => (1 + r.equity) / (1 + r.inflation) - 1),
    bondsReal: geo((r) => (1 + r.bonds) / (1 + r.inflation) - 1),
    cashReal: geo((r) => (1 + r.cash) / (1 + r.inflation) - 1),
    worstEquityYear: rows.reduce((w, r) => (r.equity < w.equity ? r : w)),
    worstBondYear: rows.reduce((w, r) => (r.bonds < w.bonds ? r : w)),
    highestInflationYear: rows.reduce((w, r) => (r.inflation > w.inflation ? r : w)),
  };
}
