/* Parking money for 1 to 5 years (Retirement page) over the engine bundle (window.RE).
   User-facing text avoids dashes (INLAP rule). */
(function () {
  const E = window.RE;
  const $ = (id) => document.getElementById(id);
  if (!$('sec-park') || !E.parkingOptions) return;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const gbp = (v) => '£' + Math.round(v).toLocaleString('en-GB');
  const pc = (v, d = 2) => (v == null || !isFinite(v) ? 'n/a' : (v * 100).toFixed(d) + '%');
  const L = E.MARKET_NOW.latest;
  // Market-implied CPI: the 5-year breakeven is on RPI, about a point above CPI until 2030.
  const INFL = { implied: Math.max(0, (L.implied5?.value ?? L.implied20.value) - 0.008), cpi: L.cpi.value, target: 0.02, high: 0.05 };
  const INFL_LABEL = { implied: `Market-implied ${pc(INFL.implied, 1)}`, cpi: `CPI now ${pc(INFL.cpi, 1)}`, target: '2% target', high: '5% (Bank forecast peak)' };
  const K = { years: 2, tax: 0.4, infl: 'implied', amount: 20000, rate: Math.round(L.bankRate.value * 10000) / 100 };
  try { Object.assign(K, JSON.parse(localStorage.getItem('pension-planner-park-v1') || '{}')); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem('pension-planner-park-v1', JSON.stringify(K)); } catch (e) { /* ignore */ } };
  $('pk-amount').value = K.amount; $('pk-rate').value = K.rate;
  $('pk-infl').innerHTML = Object.keys(INFL).map((k) => `<button type="button" data-v="${k}">${INFL_LABEL[k]}</button>`).join('');
  let chart = null;
  const COL = { savings: '--grey', isa: '--s1', gilt: '--accent-ink', linker: '--s3' };

  function render() {
    const pick = (id, cur, fn) => document.querySelectorAll(`#${id} button`).forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.v === String(cur))); b.onclick = () => { fn(b.dataset.v); save(); render(); }; });
    pick('pk-years', K.years, (v) => { K.years = +v; });
    pick('pk-tax', K.tax, (v) => { K.tax = +v; });
    pick('pk-infl', K.infl, (v) => { K.infl = v; });
    const infl = INFL[K.infl];
    const rows = E.parkingOptions({ amount: K.amount, years: K.years, taxRate: K.tax, inflation: infl, savingsRate: K.rate / 100 });
    $('pk-asof').textContent = new Date(E.GILT_PRICES_AS_OF).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const best = [...rows].sort((a, b) => b.net - a.net)[0];
    const sav = rows.find((r) => r.id === 'savings');
    $('pk-h').textContent = `Over ${K.years} year${K.years > 1 ? 's' : ''} at ${pc(K.tax, 0)} tax, ${best.name.toLowerCase()} comes out best: ${pc(best.net)} a year after tax, ${pc(best.real)} after ${pc(infl, 1)} inflation${best.id !== 'savings' ? `, against ${pc(sav.net)} from taxed savings` : ''}.`;
    $('tbl-pk').innerHTML = `<thead><tr><th>Option</th><th>Before tax</th><th>After tax</th><th>After inflation</th><th>${gbp(K.amount)} becomes</th><th>In today's money</th><th>How sure</th></tr></thead><tbody>`
      + rows.map((r) => `<tr class="${r === best ? 'hit' : ''}"><td><span class="name">${esc(r.name)}</span><span class="gloss">${esc(r.detail)}</span></td><td>${pc(r.gross)}</td><td><b>${pc(r.net)}</b></td><td class="${r.real < 0 ? 'down' : 'up'}">${pc(r.real)}</td><td>${gbp(r.end)}</td><td>${gbp(r.endReal)}</td><td style="white-space:normal;text-align:left;font-family:var(--font-ui);font-size:12px;color:var(--ink-3);min-width:150px">${esc(r.certainty)}. ${esc(r.access)}.</td></tr>`).join('') + '</tbody>';
    const ys = Array.from({ length: K.years + 1 }, (_, i) => i);
    if (chart) chart.destroy();
    chart = new Chart($('ch-pk'), { type: 'line', data: { labels: ys.map((y) => (y ? `${y} yr` : 'Now')), datasets: rows.map((r) => ({ label: r.name, data: ys.map((y) => K.amount * Math.pow((1 + r.net) / (1 + infl), y)), borderColor: css(COL[r.id]), backgroundColor: css(COL[r.id]), borderWidth: r === best ? 2.6 : 1.8, borderDash: r.id === 'savings' ? [5, 3] : [], pointRadius: 3, tension: 0 })) },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: css('--raised'), titleColor: css('--ink-1'), bodyColor: css('--ink-2'), borderColor: css('--rule-strong'), borderWidth: 1, callbacks: { label: (c) => `${c.dataset.label}: ${gbp(c.parsed.y)}` } } },
        scales: { x: { ticks: { color: css('--ink-3') }, grid: { display: false } }, y: { ticks: { color: css('--ink-3'), callback: (v) => gbp(v) }, grid: { color: css('--rule') } } } } });
    $('pk-key').innerHTML = rows.map((r) => `<span><i style="background:${r.id === 'savings' ? 'transparent' : css(COL[r.id])};${r.id === 'savings' ? `border-top:2px dashed ${css(COL[r.id])};height:0;vertical-align:3px` : ''}"></i>${esc(r.name)}</span>`).join('');
    $('pk-notes').innerHTML = [
      ['Why gilts can beat savings after tax', 'A low-coupon gilt bought below 100 pays most of its return as a rise in price, which is free of Capital Gains Tax. Savings interest is taxed in full once the personal savings allowance (£1,000 basic, £500 higher rate) is used.'],
      ['Index-linked gilts', `Their return rises with RPI inflation, so they protect spending power if inflation runs hot. Markets price ${pc(L.implied5?.value ?? 0, 1)} RPI inflation over five years; the Bank of England expects CPI near 5% by mid-2027. If inflation comes in higher than the market expects, these win.`],
      ['Held to maturity', 'Gilt returns here assume you hold to the end. Selling early means taking the market price, which falls if yields rise: see the gilt calculator\'s ranges.'],
      ['Rates can change', `Savings rates follow Bank Rate (${pc(L.bankRate.value)} now). If the Bank raises rates again in December, savings catch up; a gilt locks in today's yield either way.`],
    ].map(([h, p]) => `<div class="note"><h3>${h}</h3><p>${p}</p></div>`).join('');
  }
  $('pk-amount').addEventListener('input', () => { K.amount = Math.max(1000, parseFloat($('pk-amount').value) || 0); clearTimeout(render.t); render.t = setTimeout(() => { save(); render(); }, 300); });
  $('pk-rate').addEventListener('input', () => { K.rate = Math.max(0, parseFloat($('pk-rate').value) || 0); clearTimeout(render.t); render.t = setTimeout(() => { save(); render(); }, 300); });
  render();
  try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', render); } catch (e) { /* old browsers */ }
})();
