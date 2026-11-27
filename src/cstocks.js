// Commodity shares (data/commodity-stocks.json, scripts/fetch-commodity-stocks.js): relative value
// screen. Three signals, each scaled 0 (cheap) to 1 (dear):
//   vs commodity: where the share-to-commodity price ratio sits in its own five-year range;
//   EV/EBITDA against the median of its group (royalty companies and oil majors are valued
//   differently from miners, so each is compared with its own kind);
//   free-cash-flow yield against its group (a higher yield reads as cheaper).
// The screen averages the signals available. It describes prices; it is not a recommendation.
import data from '../data/commodity-stocks.json' with { type: 'json' };

export const COMMODITY_STOCKS_META = { fetched: data.fetched, valuationsFetched: data.valuationsFetched, stale: data.stale ?? [], commodities: data.commodities };
const clamp = (x) => Math.max(0, Math.min(1, x));
const median = (xs) => { const s = xs.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const isFund = (s) => /fund/i.test(s.listing);

export const COMMODITY_STOCKS = (() => {
  const groups = [...new Set(data.stocks.map((s) => s.group))];
  const med = Object.fromEntries(groups.map((g) => {
    const xs = data.stocks.filter((s) => s.group === g && !isFund(s));
    return [g, { ev: median(xs.map((s) => (s.val?.evEbitda > 0 ? s.val.evEbitda : null))), fcf: median(xs.map((s) => s.val?.fcfYield)), fpe: median(xs.map((s) => (s.val?.fwdPe > 0 ? s.val.fwdPe : null))) }];
  }));
  return data.stocks.map((s) => {
    const m = med[s.group], sig = { ratio: s.ratioPct };
    if (s.val?.evEbitda > 0 && m.ev) sig.ev = clamp(0.5 + 0.5 * Math.log(s.val.evEbitda / m.ev) / Math.log(2));
    if (s.val?.fcfYield != null && m.fcf != null) sig.fcf = clamp(0.5 - 0.5 * (s.val.fcfYield - m.fcf) / 0.05);
    const vals = Object.values(sig);
    const score = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { ...s, fund: isFund(s), signals: sig, score, screen: score < 0.4 ? 'Cheaper' : score > 0.6 ? 'Dearer' : 'In line', groupMedian: m };
  });
})();
