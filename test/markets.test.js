import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/markets.js';

test('markets: series, stats and helpers are sane', () => {
  const spx = M.series('spx');
  assert.ok(spx.months.length > 500, 'S&P 500 history in pounds since 1975');
  for (const id of Object.keys(M.ASSETS)) {
    const s = M.series(id);
    assert.ok(s.values.every((v) => v > 0 && isFinite(v)), `${id} values positive`);
    // No duplicated months and no gaps.
    for (let i = 1; i < s.months.length; i++) assert.equal(s.months[i], M.addMonths(s.months[i - 1], 1), `${id} contiguous at ${s.months[i]}`);
  }
  const st = M.stats(M.series('ndx'), '2000-01');
  assert.ok(st.maxDD < -0.6 && st.ddTrough.startsWith('2002'), 'dot-com drawdown visible');
  const gold = M.stats(M.series('gold', { real: true }));
  assert.ok(gold.maxDD < -0.6 && gold.ddPeak.startsWith('1980'), 'gold 1980 real peak');
  const b = M.beta('sox', 'sox');
  assert.ok(Math.abs(b.beta - 1) < 1e-9);
  const p = M.projection('spx', { years: 10, n: 300, centre: 0.03 });
  assert.ok(Math.abs(p.medianAnnual - 0.03) < 0.015, 're-centred projection median near target');
  const m = M.mix({ spx: 50, ftse: 50 });
  assert.equal(m.values[0], 1);
  assert.ok(M.valuationReturn('spx').real > 0);
});
