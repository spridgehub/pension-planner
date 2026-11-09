/* Markets pages (Equities, Commodities) over the engine bundle (window.RE) and the page router.
   User-facing text avoids dashes (INLAP rule); ranges are written "x to y". */
(function () {
  const E = window.RE;
  const $ = (id) => document.getElementById(id);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pc = (v, d = 1) => (v == null || !isFinite(v) ? 'n/a' : (Math.abs(v * 100) < 0.5 * Math.pow(10, -d) ? 0 : v * 100).toFixed(d) + '%');
  const spc = (v, d = 1) => (v == null || !isFinite(v) ? 'n/a' : Math.abs(v * 100) < 0.5 * Math.pow(10, -d) ? '0%' : (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%');
  const gbp = (v) => (v == null || !isFinite(v) ? 'n/a' : '£' + Math.round(v).toLocaleString('en-GB'));
  const gbpk = (v) => (v == null || !isFinite(v) ? 'n/a' : Math.abs(v) >= 1e6 ? '£' + (v / 1e6).toFixed(2) + 'm' : Math.abs(v) >= 1e3 ? '£' + Math.round(v / 1000) + 'k' : gbp(v));
  const usd = (v, d = 0) => (v == null || !isFinite(v) ? 'n/a' : '$' + v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const mshort = (m) => new Date(m + '-01T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }).replace('Sept', 'Sep');
  const mon = (m) => new Date(m + '-01T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  const yrs = (months) => (months == null ? 'n/a' : months < 12 ? `${months} mo` : `${(months / 12).toFixed(months < 60 ? 1 : 0)} yr`);
  const rgba = (color, a) => {
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = color;
    const hex = c.fillStyle;
    if (!hex.startsWith('#')) return color;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const A = E.ASSETS, R = E.RESEARCH, LAST = E.LAST_MONTH;
  const name = (id) => (id === 'mix' ? 'Your mix' : A[id].name);

  // Fixed colour per market (dataviz reference palette); never reassigned by rank or filter.
  const COLOR = { spx: '--s1', ndx: '--s7', ftse: '--s2', nikkei: '--s8', kospi: '--s3', hsi: '--s5', taiex: '--s6', nifty: '--s4', gold: '--s4', silver: '--s1', platinum: '--s7', copper: '--s2', brent: '--s8' };
  const col = (id) => css(COLOR[id] || '--grey');
  const EQ = ['spx', 'ndx', 'ftse', 'nikkei', 'kospi', 'hsi', 'taiex', 'nifty'];
  const CO = ['gold', 'silver', 'platinum', 'copper', 'brent'];

  // ---------- state ----------
  const S = { eq: { pick: ['spx', 'ndx', 'ftse', 'nikkei', 'kospi'], from: '2000-01', ccy: 'GBP', real: false, roll: 10, proj: 'spx', centre: 'value', shock: 0.4, mix: { spx: 35, ftse: 20, nikkei: 15, kospi: 10, hsi: 10, gold: 10 } },
    co: { pick: ['gold', 'silver'], from: '2000-09', ccy: 'GBP', real: false, proj: 'gold', centre: 'jpm' } };
  try { const s = JSON.parse(localStorage.getItem('pension-planner-markets-v1') || 'null'); if (s) { Object.assign(S.eq, s.eq || {}); Object.assign(S.co, s.co || {}); } } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem('pension-planner-markets-v1', JSON.stringify(S)); } catch (e) { /* ignore */ } };

  // ---------- charts ----------
  const charts = {};
  function chart(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), config);
    return charts[id];
  }
  function opts({ y = (v) => v, log = false, legend = false, tip, xTicks = 8, yMin, yMax, zero = false } = {}) {
    const ink3 = css('--ink-3'), rule = css('--rule');
    const numFont = { family: css('--font-num'), size: 11 };
    return {
      responsive: true, maintainAspectRatio: false, animation: false, normalized: true,
      interaction: { mode: 'index', intersect: false },
      elements: { point: { radius: 0, hitRadius: 6, hoverRadius: 4 }, line: { borderWidth: 2, tension: 0 } },
      plugins: {
        legend: { display: legend, position: 'top', align: 'start', labels: { color: ink3, boxWidth: 12, boxHeight: 8, font: { family: css('--font-ui'), size: 12 } } },
        tooltip: { backgroundColor: css('--raised'), titleColor: css('--ink-1'), bodyColor: css('--ink-2'), borderColor: css('--rule-strong'), borderWidth: 1, padding: 10, cornerRadius: 6, titleFont: { family: css('--font-ui'), weight: '600' }, bodyFont: numFont, callbacks: tip ? { label: tip } : {} },
      },
      scales: {
        x: { ticks: { color: ink3, maxRotation: 0, autoSkip: true, maxTicksLimit: xTicks, font: numFont }, grid: { display: false }, border: { color: css('--rule-strong') } },
        y: { type: log ? 'logarithmic' : 'linear', min: yMin, max: yMax, ticks: { color: ink3, font: numFont, callback: (v) => y(v), maxTicksLimit: 7 }, grid: { color: (c) => (zero && c.tick?.value === 0 ? css('--rule-strong') : rule) }, border: { display: false } },
      },
    };
  }
  const line = (id, data, extra = {}) => ({ label: name(id), data, borderColor: col(id), backgroundColor: col(id), spanGaps: false, ...extra });
  const key = (el, items) => { $(el).innerHTML = items.map(([label, color, dash]) => `<span><i style="background:${dash ? 'transparent' : color};${dash ? `border-top:2px dashed ${color};height:0;vertical-align:3px` : ''}"></i>${esc(label)}</span>`).join(''); };
  const monthsFrom = (from) => { const out = []; for (let m = from; m <= LAST; m = E.addMonths(m, 1)) out.push(m); return out; };
  // Values on a shared month axis, rebased to `base` at each series' first month on the axis.
  function rebased(s, axis, base = 10000) {
    const map = new Map(s.months.map((m, i) => [m, s.values[i]]));
    let b = null;
    return axis.map((m) => { const v = map.get(m); if (v == null) return null; if (b == null) b = v; return base * v / b; });
  }
  function seg(el, items, current, onPick, multi = false) {
    $(el).innerHTML = items.map(([v, label, sw]) => `<button type="button" data-v="${v}" aria-pressed="${multi ? current.includes(v) : String(current) === String(v)}">${sw ? `<span class="sw" style="background:${sw}"></span>` : ''}${label}</button>`).join('');
    $(el).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.v)));
  }
  const fixedSeg = (el, current, onPick) => {
    $(el).querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.v === String(current)));
      b.onclick = () => onPick(b.dataset.v);
    });
  };
  const fromItems = (starts) => starts.map((m) => [m, /^\d{4}-01$/.test(m) ? m.slice(0, 4) : m === E.addMonths(LAST, -120) ? '10 years' : m === E.addMonths(LAST, -60) ? '5 years' : mon(m)]);

  function statsTable(el, ids, o, from) {
    const rows = ids.map((id) => ({ id, st: E.stats(E.series(id, o), from) })).filter((r) => r.st);
    $(el).innerHTML = '<thead><tr><th>Market</th><th>Per year</th><th>£10k became</th><th>Swings (vol)</th><th>Worst fall</th><th>When</th><th>Under water</th><th>Worst 12 months</th><th>Best 12 months</th></tr></thead><tbody>'
      + rows.map(({ id, st }) => `<tr><td><span class="name"><i class="dot" style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;background:${col(id)}"></i>${esc(name(id))}</span>${st.from > from ? `<span class="gloss">from ${mon(st.from)}</span>` : ''}</td><td>${pc(st.cagr)}</td><td>${gbpk(10000 * (1 + st.total))}</td><td>${pc(st.vol, 0)}</td><td class="down">${pc(st.maxDD, 0)}</td><td>${mshort(st.ddPeak)} to ${mshort(st.ddTrough)}</td><td>${yrs(st.longestUnderwaterMonths)}</td><td class="down">${pc(st.worst12, 0)}</td><td class="up">${spc(st.best12, 0)}</td></tr>`).join('') + '</tbody>';
    return rows;
  }
  const ccyLabel = (o, dollars) => (o.ccy === 'GBP' ? 'in pounds' : dollars ? 'in dollars' : 'in local currency') + (o.real ? ', after UK inflation' : '');

  // ================= EQUITIES =================
  function renderEquities() {
    const e = S.eq;
    const o = { ccy: e.ccy, real: e.real };
    // tickers
    $('eq-tickers').innerHTML = EQ.map((id) => {
      const p = E.latestPrice(id), s = E.series(id), st1 = E.stats(s, E.addMonths(LAST, -12)), st10 = E.stats(s, E.addMonths(LAST, -120));
      return `<div class="cell"><span class="lbl">${esc(name(id))}</span><span class="val">${Math.round(p.local).toLocaleString('en-GB')}</span><span class="sub">1 yr ${spc(st1?.total)} · 10 yr ${st10 ? pc(st10.cagr) + '/yr' : 'n/a'}</span></div>`;
    }).join('');
    const v = R.valuation;
    const s10 = Object.fromEntries(EQ.map((id) => [id, E.stats(E.series(id), E.addMonths(LAST, -120))]));
    const ai = R.aiConcentration;
    $('eq-verdict').innerHTML = `Over ten years in pounds the US led (S&amp;P 500 ${pc(s10.spx.cagr)} a year, Nasdaq-100 ${pc(s10.ndx.cagr)}) against ${pc(s10.ftse.cagr)} for the FTSE 100. Most of that lead came from a handful of AI-linked giants, now ${pc(ai.spx.weight, 0)} of the S&amp;P 500, and US shares now cost ${v.spx.cape.toFixed(0)} times average earnings (CAPE) against ${v.ftse.cape.toFixed(0)} in the UK.`
      + `<small>Prices from Yahoo Finance to ${mon(LAST)}; valuations from Siblis Research, ${new Date(v.spx.asOf).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}. Past returns do not predict future returns.</small>`;

    seg('eq-pick', EQ.map((id) => [id, esc(name(id)), col(id)]), e.pick, (id) => { e.pick = e.pick.includes(id) ? e.pick.filter((x) => x !== id) : EQ.filter((x) => x === id || e.pick.includes(x)); if (!e.pick.length) e.pick = [id]; save(); renderEquities(); }, true);
    seg('eq-from', fromItems(['1985-01', '1990-01', '2000-01', '2010-01', E.addMonths(LAST, -120), E.addMonths(LAST, -60)]), e.from, (m) => { e.from = m; save(); renderEquities(); });
    fixedSeg('eq-ccy', e.ccy, (vv) => { e.ccy = vv; save(); renderEquities(); });
    fixedSeg('eq-real', e.real ? '1' : '0', (vv) => { e.real = vv === '1'; save(); renderEquities(); });

    // growth
    const axis = monthsFrom(e.from);
    const ser = Object.fromEntries(e.pick.map((id) => [id, E.series(id, o)]));
    const ds = e.pick.map((id) => line(id, rebased(ser[id], axis)));
    chart('ch-eqg', { type: 'line', data: { labels: axis.map(mon), datasets: ds }, options: opts({ log: true, y: gbpk, tip: (c) => `${c.dataset.label}: ${gbp(c.parsed.y)}` }) });
    key('eqg-key', e.pick.map((id) => [name(id), col(id)]));
    const ends = e.pick.map((id) => { const d = ds[e.pick.indexOf(id)].data; const i = d.findIndex((x) => x != null); return { id, end: d[d.length - 1], start: axis[i] }; }).filter((x) => x.end != null).sort((a, b) => b.end - a.end);
    const late = ends.filter((x) => x.start > e.from);
    $('eqg-h').textContent = ends.length > 1
      ? `From ${mon(e.from)}, ${name(ends[0].id)} turned £10,000 into ${gbpk(ends[0].end)}; ${name(ends[ends.length - 1].id)} managed ${gbpk(ends[ends.length - 1].end)}${late.length ? ` (${late.map((x) => `${name(x.id)} from ${mon(x.start)}`).join(', ')})` : ''}`
      : `${name(ends[0].id)} turned £10,000 into ${gbpk(ends[0].end)} from ${mon(ends[0].start)}`;

    // stats
    $('eqs-sub').textContent = `from ${mon(e.from)}, ${ccyLabel(o)}`;
    const rows = statsTable('tbl-eqs', e.pick, o, e.from);
    const steady = [...rows].sort((a, b) => b.st.cagr / b.st.vol - a.st.cagr / a.st.vol)[0];
    const deep = [...rows].sort((a, b) => a.st.maxDD - b.st.maxDD)[0];
    $('eqs-h').textContent = rows.length > 1 ? `${name(steady.id)} gave the most return for its swings; ${name(deep.id)} had the deepest fall, ${pc(deep.st.maxDD, 0)}` : '';

    // rolling
    fixedSeg('eqr-years', e.roll, (vv) => { e.roll = +vv; save(); renderEquities(); });
    const rolls = e.pick.map((id) => ({ id, r: E.rolling(E.series(id, o), e.roll) })).filter((x) => x.r);
    const rAxis = monthsFrom(rolls.reduce((m, x) => (x.r.windows[0].start < m ? x.r.windows[0].start : m), LAST)).filter((m) => m <= E.addMonths(LAST, -12 * e.roll));
    chart('ch-eqr', { type: 'line', data: { labels: rAxis.map(mon), datasets: rolls.map(({ id, r }) => { const mp = new Map(r.windows.map((w) => [w.start, w.r])); return line(id, rAxis.map((m) => mp.get(m) ?? null), { borderWidth: 1.5 }); }) }, options: opts({ y: (vv) => pc(vv, 0), zero: true, tip: (c) => `${c.dataset.label}: ${pc(c.parsed.y)} a year` }) });
    $('tbl-eqr').innerHTML = `<thead><tr><th>Market (all history ${ccyLabel(o)})</th><th>Worst</th><th>Middle</th><th>Best</th><th>Lost money</th></tr></thead><tbody>`
      + rolls.map(({ id, r }) => `<tr><td>${esc(name(id))}</td><td class="${r.worst < 0 ? 'down' : ''}">${pc(r.worst)}</td><td>${pc(r.median)}</td><td>${pc(r.best)}</td><td>${pc(r.lossShare, 0)}</td></tr>`).join('') + '</tbody>';
    const worstLoser = [...rolls].sort((a, b) => b.r.lossShare - a.r.lossShare)[0];
    $('eqr-h').textContent = worstLoser && worstLoser.r.lossShare > 0
      ? `Even over ${e.roll} years shares can lose: ${name(worstLoser.id)} did in ${pc(worstLoser.r.lossShare, 0)} of ${e.roll}-year spells`
      : `None of these markets lost money over any ${e.roll}-year spell in this data`;

    // drawdowns
    chart('ch-eqd', { type: 'line', data: { labels: axis.map(mon), datasets: e.pick.map((id) => { const d = E.drawdowns(E.series(id, { ...o, from: e.from })); const mp = new Map(d.months.map((m, i) => [m, d.values[i]])); return line(id, axis.map((m) => mp.get(m) ?? null), { borderWidth: 1.5 }); }) }, options: opts({ y: (vv) => pc(vv, 0), yMax: 0, tip: (c) => `${c.dataset.label}: ${pc(c.parsed.y, 0)}` }) });
    const under = rows.filter((r) => r.st && E.drawdowns(E.series(r.id, { ...o, from: e.from })).values.slice(-1)[0] < -0.05);
    $('eqd-h').textContent = rows.length ? `Every market here has fallen at least ${pc(Math.max(...rows.map((r) => r.st.maxDD)) * -1, 0)} at some point${under.length ? `; ${under.map((r) => name(r.id)).join(', ')} still sit more than 5% below a past high` : '; all are at or near their highs today'}` : '';

    renderAI();
    renderOutlook();
    renderMix();
  }

  function renderAI() {
    const e = S.eq, ai = R.aiConcentration, shock = -e.shock;
    $('eqa-val').textContent = pc(e.shock, 0);
    const rows = EQ.map((id) => ({ id, s: E.aiStress(id, shock), ep: Object.fromEntries(E.EPISODES.map((x) => [x.id, E.episodeReturn(id, x)])) }));
    const worst = [...rows].sort((a, b) => a.s.history - b.s.history);
    $('eqa-h').textContent = `${name(worst[0].id)} and ${name(worst[1].id)} are the most tied to AI chip stocks; the ${name(worst[worst.length - 1].id)} and ${name(worst[worst.length - 2].id)} the least`;
    $('eqa-sub').textContent = R.aiContext.capex + ' That spending is what the market is paying for; if it slows or fails to earn a return, the names below take the hit.';
    $('tbl-eqa').innerHTML = '<thead><tr><th>Market</th><th>AI names weight</th><th>Which</th><th>Moves with chips</th><th>Dot-com bust</th><th>2022</th><th>DeepSeek, tariffs</th><th>If AI falls ' + pc(e.shock, 0) + '</th></tr></thead><tbody>'
      + rows.map(({ id, s, ep }) => `<tr><td><span class="name">${esc(name(id))}</span><span class="gloss">${esc(ai[id]?.extra || '')}</span></td><td>${s.weight != null ? `<span class="bar" style="width:${Math.round(s.weight * 120)}px"></span>${pc(s.weight, 0)}` : 'n/a'}</td><td style="white-space:normal;text-align:left;font-family:var(--font-ui);font-size:12px;color:var(--ink-3);min-width:180px">${esc(ai[id]?.names || '')}</td><td title="Beta to SOX in pounds, 10 years; ${pc(s.r2, 0)} of monthly swings shared">${s.beta.toFixed(2)}<span class="gloss">${pc(s.r2, 0)} shared</span></td>`
        + ['dotcom', 'rates', 'tariffs'].map((k) => `<td class="${ep[k] == null ? '' : ep[k] < 0 ? 'down' : 'up'}">${ep[k] == null ? 'n/a' : spc(ep[k], 0)}</td>`).join('')
        + `<td class="down">${s.direct != null ? `${pc(s.direct, 0)} to ` : ''}${pc(s.history, 0)}</td></tr>`).join('') + '</tbody>';
    const blue = css('--accent-ink'), grey = css('--grey');
    chart('ch-eqa', { type: 'bar', data: { labels: EQ.map(name), datasets: [
      { label: 'Direct', data: rows.map((r) => r.s.direct), backgroundColor: grey, borderRadius: 4, borderSkipped: 'start' },
      { label: 'Past link', data: rows.map((r) => r.s.history), backgroundColor: blue, borderRadius: 4, borderSkipped: 'start' },
    ] }, options: { ...opts({ y: (vv) => pc(vv, 0), tip: (c) => `${c.dataset.label}: ${pc(c.parsed.y, 0)}` }), interaction: { mode: 'index', intersect: false }, datasets: { bar: { categoryPercentage: 0.7, barPercentage: 0.9 } } } });
    key('eqa-key', [['Direct (weight × fall)', grey], ['Past link (10-year beta to chips)', blue]]);
    $('eqa-warn').innerHTML = R.aiContext.warnings.map((w) => `<div class="callout"><strong>${esc(w.who)}, ${esc(w.date)}</strong><span>${esc(w.text)} <a href="${w.src}" target="_blank" rel="noopener">Source</a></span></div>`).join('')
      + `<div class="callout"><strong>The 2000 precedent</strong><span>In the dot-com bust the Nasdaq-100 fell ${pc(-E.episodeReturn('ndx', E.EPISODES[0]), 0)} in pounds and the S&amp;P 500 ${pc(-E.episodeReturn('spx', E.EPISODES[0]), 0)}, but gold rose ${pc(E.episodeReturn('gold', E.EPISODES[0]), 0)}. The FTSE 100, with little tech, still fell ${pc(-E.episodeReturn('ftse', E.EPISODES[0]), 0)}.</span></div>`;
  }

  function renderOutlook() {
    const e = S.eq, v = R.valuation;
    const rows = EQ.map((id) => ({ id, v: v[id], imp: E.valuationReturn(id), past: E.stats(E.series(id, { real: true }), E.addMonths(LAST, -120)) }));
    $('tbl-eqv').innerHTML = '<thead><tr><th>Market</th><th>CAPE</th><th>Forward P/E</th><th>Implied real return</th><th>Last 10 yrs real, £</th></tr></thead><tbody>'
      + rows.map((r) => `<tr><td><span class="name">${esc(name(r.id))}</span>${r.v?.basis ? `<span class="gloss">${esc(r.v.basis)}</span>` : ''}</td><td>${r.v?.cape?.toFixed(1) ?? 'n/a'}</td><td>${r.v?.fwdPe?.toFixed(1) ?? 'n/a'}</td><td>${r.imp ? pc(r.imp.real) + (r.imp.basis !== 'CAPE' ? ' *' : '') : 'n/a'}</td><td>${pc(r.past?.cagr)}</td></tr>`).join('')
      + '</tbody><tfoot><tr><td colspan="5" style="font-size:12px;color:var(--ink-3);white-space:normal">* No CAPE is published for the Nasdaq-100, so 1 / trailing P/E is used. Implied returns are in local currency; currency moves come on top.</td></tr></tfoot>';
    const us = rows[0].imp.real, uk = rows[2].imp.real;
    $('eqo-h').textContent = `Today's prices point to lower US returns than the last decade: about ${pc(us)} a year after inflation for the S&P 500 against ${pc(uk)} for the UK, if valuations hold their link with later returns`;

    // CAPE scatter
    const cv = E.capeVsNext10().filter((x) => x.next10 != null);
    const now = v.spx.cape;
    const near = cv.filter((x) => x.cape >= now - 5);
    const avgNear = near.length ? near.reduce((s, x) => s + x.next10, 0) / near.length : null;
    const all = cv.reduce((s, x) => s + x.next10, 0) / cv.length;
    chart('ch-cape', { type: 'scatter', data: { datasets: [
      { label: 'Month since 1881', data: cv.map((x) => ({ x: x.cape, y: x.next10, m: x.month })), backgroundColor: rgba(css('--accent-ink'), 0.35), pointRadius: 2, pointHoverRadius: 4 },
      { label: 'Today', type: 'line', data: [{ x: now, y: -0.06 }, { x: now, y: 0.2 }], borderColor: css('--amber'), borderWidth: 2, borderDash: [4, 3], pointRadius: 0 },
    ] }, options: (() => { const op = opts({ y: (vv) => pc(vv, 0), zero: true }); op.interaction = { mode: 'nearest', intersect: true }; op.scales.x = { ...op.scales.x, type: 'linear', title: { display: true, text: 'CAPE at the start', color: css('--ink-3') } }; op.plugins.tooltip.callbacks = { label: (c) => (c.raw.m ? `${mon(c.raw.m)}: CAPE ${c.raw.x.toFixed(1)}, next 10 yrs ${pc(c.raw.y)} a year` : `Today: CAPE ${now}`) }; return op; })() });
    $('cape-note').textContent = `Each dot is a month since 1881 (Shiller data, US dollars, before inflation). Starting within 5 points of today's ${now.toFixed(1)} or higher, the next 10 years returned ${pc(avgNear)} a year on average (${near.length} months, mostly 1929, 1999 and 2000), against ${pc(all)} across all months. The amber line is today.`;

    // house forecasts
    const F = R.forecasts;
    const cols = [['us', 'US'], ['uk', 'UK'], ['japan', 'Japan'], ['devExUs', 'Developed ex-US'], ['em', 'Emerging'], ['gold', 'Gold']];
    $('tbl-eqf').innerHTML = '<thead><tr><th>House</th>' + cols.map(([, l]) => `<th>${l}</th>`).join('') + '<th>Basis</th></tr></thead><tbody>'
      + F.map((f) => `<tr><td><a href="${f.src}" target="_blank" rel="noopener">${esc(f.house)}</a><span class="gloss">${esc(f.horizon)}, ${esc(f.asOf)}</span></td>` + cols.map(([k]) => `<td class="${f.values[k] < 0 ? 'down' : ''}">${f.values[k] != null ? pc(f.values[k]) : ''}</td>`).join('') + `<td style="font-family:var(--font-ui);font-size:12px;color:var(--ink-3)">${esc(f.basis)}</td></tr>`).join('')
      + '</tbody>';

    // projection
    $('eqp-id').innerHTML = EQ.map((id) => `<option value="${id}"${id === e.proj ? ' selected' : ''}>${esc(name(id))}</option>`).join('');
    fixedSeg('eqp-centre', e.centre, (vv) => { e.centre = vv; save(); renderOutlook(); });
    fan('ch-eqp', 'eqp', e.proj, e.centre === 'value' ? E.valuationReturn(e.proj)?.real ?? null : null,
      e.centre === 'value' ? `centred on ${pc(E.valuationReturn(e.proj)?.real)} a year after inflation (1 / ${E.valuationReturn(e.proj)?.basis})` : 'centred on its own past return');
  }

  // Fan chart of £10,000 after inflation over 10 years.
  function fan(canvas, prefix, id, centre, how) {
    const p = E.projection(id, { years: 10, centre });
    const labels = p.byYear.map((x) => (x.year ? `${x.year} yr` : 'Now'));
    const c = css('--accent-ink');
    const band = (lo, hi, a, label) => [
      { label: label, data: p.byYear.map((x) => 10000 * x[hi]), borderWidth: 0, backgroundColor: rgba(c, a), fill: '+1', pointRadius: 0 },
      { label: label + ' low', data: p.byYear.map((x) => 10000 * x[lo]), borderWidth: 0, backgroundColor: rgba(c, a), fill: false, pointRadius: 0 },
    ];
    chart(canvas, { type: 'line', data: { labels, datasets: [
      ...band('p10', 'p90', 0.14, '1 in 10 to 9 in 10'), ...band('p25', 'p75', 0.22, 'Middle half'),
      { label: 'Middle outcome', data: p.byYear.map((x) => 10000 * x.p50), borderColor: c, borderWidth: 2, pointRadius: 0, fill: false },
      { label: 'Start', data: p.byYear.map(() => 10000), borderColor: css('--grey'), borderDash: [4, 3], borderWidth: 1, pointRadius: 0, fill: false },
    ] }, options: (() => { const op = opts({ y: gbpk, xTicks: 11 }); op.plugins.tooltip.filter = (t) => !/low$/.test(t.dataset.label); op.plugins.tooltip.callbacks = { label: (t) => { const x = p.byYear[t.dataIndex]; if (t.dataset.label === 'Middle outcome') return `Middle: ${gbp(10000 * x.p50)}`; if (t.dataset.label === 'Middle half') return `Middle half: ${gbp(10000 * x.p25)} to ${gbp(10000 * x.p75)}`; if (t.dataset.label.startsWith('1 in 10')) return `1 in 10 to 9 in 10: ${gbp(10000 * x.p10)} to ${gbp(10000 * x.p90)}`; return null; } }; return op; })() });
    key(prefix + '-key', [['Middle outcome', c], ['Middle half', rgba(c, 0.36)], ['1 in 10 to 9 in 10', rgba(c, 0.14)], ['What you put in', css('--grey'), true]]);
    const end = p.byYear[10];
    $(prefix + '-h').textContent = `${name(id)}: £10,000 for 10 years, ${how}. Middle outcome ${gbp(10000 * end.p50)} in today's money; 1 in 10 below ${gbp(10000 * end.p10)}`;
    $(prefix + '-sub').textContent = `2,000 futures built from 12-month blocks of ${name(id)}'s own monthly returns in pounds since ${mon(E.series(id, { real: true }).months[0])}, keeping its real swings and crashes. Chance of ending below what you put in, after inflation: ${pc(p.lossChance, 0)}; of losing half: ${pc(p.halfChance, 0)}. Its past real return was ${pc(p.histAnnual)} a year. An illustration of spread, not a forecast.`;
  }

  // mix
  const MIXABLE = ['spx', 'ndx', 'ftse', 'nikkei', 'kospi', 'hsi', 'gold', 'silver'];
  const PRESETS = [
    ['Spread out', { spx: 35, ftse: 20, nikkei: 15, kospi: 10, hsi: 10, gold: 10 }],
    ['S&P 500 only', { spx: 100 }],
    ['UK tilt', { ftse: 50, spx: 30, nikkei: 10, gold: 10 }],
    ['Tech heavy', { ndx: 60, spx: 30, kospi: 10 }],
    ['A fifth in gold', { spx: 40, ftse: 40, gold: 20 }],
  ];
  function renderMix() {
    const e = S.eq;
    $('eqm-sliders').innerHTML = MIXABLE.map((id) => `<label><span>${esc(name(id))}<span class="num" id="mw-${id}">${e.mix[id] || 0}%</span></span><input type="range" min="0" max="100" step="5" value="${e.mix[id] || 0}" data-id="${id}" style="accent-color:${col(id)}"></label>`).join('');
    $('eqm-sliders').querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => { e.mix[inp.dataset.id] = +inp.value; $('mw-' + inp.dataset.id).textContent = inp.value + '%'; clearTimeout(renderMix.t); renderMix.t = setTimeout(() => { save(); drawMix(); }, 120); }));
    seg('eqm-presets', PRESETS.map(([l], i) => [i, esc(l)]), -1, (i) => { e.mix = { ...PRESETS[i][1] }; save(); renderMix(); });
    drawMix();
  }
  function drawMix() {
    const w = S.eq.mix;
    const ids = Object.keys(w).filter((k) => w[k] > 0);
    if (!ids.length) { $('eqm-h').textContent = 'Move a slider to build a mix'; return; }
    const tot = ids.reduce((s, k) => s + w[k], 0);
    const m = E.mix(w, { real: true });
    const from = m.months[0];
    const comp = ['spx', 'ftse'].filter((id) => !(ids.length === 1 && ids[0] === id));
    const axis = monthsFrom(from);
    const st = E.stats(m), cs = Object.fromEntries(comp.map((id) => [id, E.stats(E.series(id, { real: true }), from)]));
    chart('ch-eqm', { type: 'line', data: { labels: axis.map(mon), datasets: [
      { label: 'Your mix', data: rebased(m, axis), borderColor: css('--ink-1'), backgroundColor: css('--ink-1'), borderWidth: 2.5 },
      ...comp.map((id) => line(id, rebased(E.series(id, { real: true }), axis), { borderWidth: 1.5, borderDash: [5, 3] })),
    ] }, options: opts({ log: true, y: gbpk, tip: (c) => `${c.dataset.label}: ${gbp(c.parsed.y)}` }) });
    key('eqm-key', [['Your mix', css('--ink-1')], ...comp.map((id) => [name(id) + ' alone', col(id), true])]);
    const share = ids.map((k) => `${Math.round(100 * w[k] / tot)}% ${name(k)}`).join(', ');
    $('eqm-figs').innerHTML = [
      ['Per year, real', pc(st.cagr), comp.map((id) => `${name(id)} ${pc(cs[id].cagr)}`).join(' · ')],
      ['£10k became', gbpk(10000 * (1 + st.total)), `today's money, since ${mon(from)}`],
      ['Worst fall', pc(st.maxDD, 0), `${mon(st.ddPeak)} to ${mon(st.ddTrough)}` + comp.map((id) => ` · ${name(id)} ${pc(cs[id].maxDD, 0)}`).join('')],
      ['Swings (vol)', pc(st.vol, 0), comp.map((id) => `${name(id)} ${pc(cs[id].vol, 0)}`).join(' · ')],
      ['Worst 12 months', pc(st.worst12, 0), `losing years ${pc(st.lossYears, 0)}`],
    ].map(([l, vv, s]) => `<div class="cell"><span class="lbl">${l}</span><span class="val">${vv}</span><span class="sub">${esc(s)}</span></div>`).join('');
    const better = comp.filter((id) => st.maxDD > cs[id].maxDD);
    $('eqm-h').textContent = `${share}: ${pc(st.cagr)} a year after inflation since ${mon(from)}, worst fall ${pc(st.maxDD, 0)}${better.length ? `, shallower than ${better.map((id) => name(id) + ' alone').join(' or ')}` : ''}`;
  }

  // ================= COMMODITIES =================
  function renderCommodities() {
    const c = S.co;
    const o = { ccy: c.ccy, real: c.real };
    const cr = R.commodities;
    const g = E.latestPrice('gold'), sv = E.latestPrice('silver');
    const ch1 = (id) => E.stats(E.series(id), E.addMonths(LAST, -12))?.total;
    $('co-tickers').innerHTML = [
      ['Gold', gbp(g.gbp) + '/oz', `${usd(g.local)} · 1 yr ${spc(ch1('gold'))} in £ · ${pc(1 - g.local / cr.goldRecord.usd, 0)} below Jan record`],
      ['Silver', '£' + sv.gbp.toFixed(2) + '/oz', `${usd(sv.local, 2)} · 1 yr ${spc(ch1('silver'))} · ${pc(1 - sv.local / cr.silverRecord.usd, 0)} below Jan record`],
      ['Platinum', gbp(E.latestPrice('platinum').gbp) + '/oz', `1 yr ${spc(ch1('platinum'))} in £`],
      ['Copper', usd(E.latestPrice('copper').local, 2) + '/lb', `1 yr ${spc(ch1('copper'))} in £`],
      ['Brent crude', usd(E.latestPrice('brent').local, 2) + '/bbl', `1 yr ${spc(ch1('brent'))} in £`],
      ['Gold to silver', (g.local / sv.local).toFixed(1), 'ounces of silver per ounce of gold'],
    ].map(([l, vv, s]) => `<div class="cell"><span class="lbl">${l}</span><span class="val">${vv}</span><span class="sub">${s}</span></div>`).join('');
    const g00 = E.stats(E.series('gold'), '2000-09'), f00 = E.stats(E.series('ftse'), '2000-09'), s00 = E.stats(E.series('spx'), '2000-09');
    const gl = E.stats(E.series('gold', { real: true }));
    $('co-verdict').innerHTML = `Since 2000 gold has returned ${pc(g00.cagr)} a year in pounds, ahead of the FTSE 100 (${pc(f00.cagr)} with dividends) and the S&amp;P 500 (${pc(s00.cagr)}). But it pays no income, and after its 1980 peak it lost ${pc(-gl.maxDD, 0)} of its real value and took ${Math.round(gl.ddRecoveredMonths / 12)} years to recover.`
      + `<small>Gold is ${pc(1 - g.local / cr.goldRecord.usd, 0)} below January's record of ${usd(cr.goldRecord.usd)}, and silver ${pc(1 - sv.local / cr.silverRecord.usd, 0)} below its ${usd(cr.silverRecord.usd, 2)} peak. Prices to ${mon(LAST)}.</small>`;

    seg('co-pick', CO.map((id) => [id, esc(name(id)), col(id)]), c.pick, (id) => { c.pick = c.pick.includes(id) ? c.pick.filter((x) => x !== id) : CO.filter((x) => x === id || c.pick.includes(x)); if (!c.pick.length) c.pick = [id]; save(); renderCommodities(); }, true);
    seg('co-from', fromItems(['1975-01', '2000-09', '2008-01', '2011-09', E.addMonths(LAST, -120), E.addMonths(LAST, -60)]).map(([m, l]) => [m, m === '2011-09' ? 'Gold 2011 peak' : m === '1975-01' ? '1975 (gold only)' : l]), c.from, (m) => { c.from = m; save(); renderCommodities(); });
    fixedSeg('co-ccy', c.ccy, (vv) => { c.ccy = vv; save(); renderCommodities(); });
    fixedSeg('co-real', c.real ? '1' : '0', (vv) => { c.real = vv === '1'; save(); renderCommodities(); });

    // gold long run (always pounds, real)
    const gs = E.series('gold', { real: true });
    const gAxis = gs.months;
    chart('ch-col', { type: 'line', data: { labels: gAxis.map(mon), datasets: [line('gold', rebased(gs, gAxis, 10000), { fill: { target: 'origin' }, backgroundColor: rgba(col('gold'), 0.12) })] }, options: opts({ log: true, y: gbpk, tip: (t) => `£10,000 in Jan 1975 worth ${gbp(t.parsed.y)} in today's money` }) });
    const g99 = E.stats(gs, '1999-07'), g11 = E.stats(gs, '2011-08');
    $('col-h').textContent = `After inflation, gold lost ${pc(-gl.maxDD, 0)} from ${mon(gl.ddPeak)} to ${mon(gl.ddTrough)}, then rose ${Math.round(1 + g99.total)}-fold. It is a long-cycle asset, not a steady one`;
    $('col-figs').innerHTML = [
      ['Per year since 1975', pc(gl.cagr), 'after UK inflation'],
      ['Worst real fall', pc(gl.maxDD, 0), `${mon(gl.ddPeak)} to ${mon(gl.ddTrough)}`],
      ['Time to recover', yrs(gl.ddRecoveredMonths), 'from the 1980 peak'],
      ['Since the 1999 low', pc(g99.cagr) + '/yr', 'after inflation'],
      ['Since the 2011 peak', pc(g11.cagr) + '/yr', 'after inflation'],
    ].map(([l, vv, s]) => `<div class="cell"><span class="lbl">${l}</span><span class="val">${vv}</span><span class="sub">${s}</span></div>`).join('');

    // growth vs shares
    const axis = monthsFrom(c.from);
    const comps = ['spx', 'ftse'];
    const ds = [...c.pick.map((id) => line(id, rebased(E.series(id, o), axis))),
      ...comps.map((id) => ({ ...line(id, rebased(E.series(id, o), axis)), borderColor: id === 'spx' ? css('--ink-3') : css('--grey'), borderDash: id === 'spx' ? [6, 3] : [2, 3], borderWidth: 1.5 }))];
    chart('ch-cog', { type: 'line', data: { labels: axis.map(mon), datasets: ds }, options: opts({ log: true, y: gbpk, tip: (t) => `${t.dataset.label}: ${gbp(t.parsed.y)}` }) });
    key('cog-key', [...c.pick.map((id) => [name(id), col(id)]), ['S&P 500 with dividends', css('--ink-3'), true], ['FTSE 100 with dividends', css('--grey'), true]]);
    const ends = ds.map((d, i) => ({ label: d.label, end: d.data[d.data.length - 1], i })).filter((x) => x.end != null).sort((a, b) => b.end - a.end);
    $('cog-h').textContent = ends.length ? `From ${mon(c.from)}, ${ends[0].label} did best (£10,000 to ${gbpk(ends[0].end)}) and ${ends[ends.length - 1].label} worst (${gbpk(ends[ends.length - 1].end)})${c.from === '1975-01' ? '; only gold has data that far back' : ''}` : '';

    $('cos-sub').textContent = `from ${mon(c.from)}, ${ccyLabel(o, true)}`;
    const rows = statsTable('tbl-cos', [...c.pick, 'spx', 'ftse'], o, c.from);
    const vols = rows.filter((r) => CO.includes(r.id)).sort((a, b) => b.st.vol - a.st.vol);
    $('cos-h').textContent = vols.length ? `${name(vols[0].id)} swings ${pc(vols[0].st.vol, 0)} a year, about ${(vols[0].st.vol / rows.find((r) => r.id === 'ftse').st.vol).toFixed(1)} times the FTSE 100; ${vols.length > 1 ? `${name(vols[vols.length - 1].id)} is the calmest of those shown at ${pc(vols[vols.length - 1].st.vol, 0)}` : ''}` : '';

    // crises
    const cids = ['spx', 'ftse', 'gold', 'silver', 'platinum', 'copper'];
    $('tbl-coc').innerHTML = '<thead><tr><th>Share-market fall</th>' + cids.map((id) => `<th>${esc(name(id))}</th>`).join('') + '</tr></thead><tbody>'
      + E.EPISODES.map((ep) => `<tr><td><span class="name">${esc(ep.label)}</span><span class="gloss">${mon(ep.from)} to ${mon(ep.to)}. ${esc(ep.note)}</span></td>` + cids.map((id) => { const r = E.episodeReturn(id, ep); return `<td class="${r == null ? '' : r < 0 ? 'down' : 'up'}">${r == null ? 'n/a' : spc(r, 0)}</td>`; }).join('') + '</tr>').join('') + '</tbody>';
    const up = (id) => E.EPISODES.filter((ep) => (E.episodeReturn(id, ep) ?? -1) > 0).length;
    $('coc-h').textContent = `Gold rose in pounds in ${up('gold')} of these ${E.EPISODES.length} share-market falls; silver in ${up('silver')}, copper in ${up('copper')}. Gold is the one that behaves like insurance`;

    // correlation
    const ids = ['gold', 'silver', 'platinum', 'copper', 'brent', 'spx', 'ftse'];
    const M = E.correlation(ids, { years: 10 });
    const short = { gold: 'Gold', silver: 'Silver', platinum: 'Plat.', copper: 'Copper', brent: 'Brent', spx: 'S&P', ftse: 'FTSE' };
    $('tbl-cor').innerHTML = '<thead><tr><th></th>' + ids.map((id) => `<th>${short[id]}</th>`).join('') + '</tr></thead><tbody>'
      + ids.map((a, i) => `<tr><td>${short[a]}</td>` + ids.map((b, j) => { const x = M[i][j]; const bg = j === i ? 'transparent' : rgba(x >= 0 ? css('--accent-ink') : css('--amber'), Math.min(0.75, Math.abs(x) * 0.8)); return `<td style="background:${bg}">${j === i ? '' : (Math.abs(x) < 0.005 ? 0 : x).toFixed(2)}</td>`; }).join('') + '</tr>').join('') + '</tbody>';
    $('cor-h').textContent = `Gold moved with the S&P 500 at ${(Math.abs(M[0][5]) < 0.005 ? 0 : M[0][5]).toFixed(2)} and the FTSE at ${(Math.abs(M[0][6]) < 0.005 ? 0 : M[0][6]).toFixed(2)}: close to independent. Copper and silver track the economy more`;

    // gold/silver ratio
    const gU = E.series('gold', { ccy: 'local', total: false }), sU = E.series('silver', { ccy: 'local', total: false });
    const gm = new Map(gU.months.map((m, i) => [m, gU.values[i]]));
    const ratio = sU.months.map((m, i) => ({ m, r: gm.get(m) / sU.values[i] })).filter((x) => isFinite(x.r));
    const avg = ratio.reduce((s, x) => s + x.r, 0) / ratio.length;
    chart('ch-cora', { type: 'line', data: { labels: ratio.map((x) => mon(x.m)), datasets: [
      { label: 'Gold to silver', data: ratio.map((x) => x.r), borderColor: col('silver'), backgroundColor: col('silver') },
      { label: 'Average since 2000', data: ratio.map(() => avg), borderColor: css('--grey'), borderDash: [4, 3], borderWidth: 1 },
    ] }, options: opts({ y: (vv) => vv.toFixed(0), tip: (t) => `${t.dataset.label}: ${t.parsed.y.toFixed(1)}` }) });
    const now = ratio[ratio.length - 1].r;
    $('cora-h').textContent = `At ${now.toFixed(0)}, the ratio is ${now > avg ? 'above' : 'below'} its average of ${avg.toFixed(0)} since 2000, so silver looks ${now > avg ? 'cheap' : 'dear'} against gold by this measure`;

    // drawdowns
    const dAxis = monthsFrom(c.from);
    chart('ch-cod', { type: 'line', data: { labels: dAxis.map(mon), datasets: c.pick.map((id) => { const d = E.drawdowns(E.series(id, { ...o, from: c.from })); const mp = new Map(d.months.map((m, i) => [m, d.values[i]])); return line(id, dAxis.map((m) => mp.get(m) ?? null), { borderWidth: 1.5 }); }) }, options: opts({ y: (vv) => pc(vv, 0), yMax: 0, tip: (t) => `${t.dataset.label}: ${pc(t.parsed.y, 0)}` }) });
    const dd = c.pick.map((id) => ({ id, st: E.stats(E.series(id, o), c.from) })).filter((x) => x.st).sort((a, b) => a.st.maxDD - b.st.maxDD);
    $('cod-h').textContent = dd.length ? `${name(dd[0].id)} fell as much as ${pc(-dd[0].st.maxDD, 0)} (${mon(dd[0].st.ddPeak)} to ${mon(dd[0].st.ddTrough)})` : '';

    renderCoOutlook();
  }

  function renderCoOutlook() {
    const c = S.co, cr = R.commodities;
    const g = E.latestPrice('gold'), fxNow = g.local / g.gbp;
    const fs = cr.goldForecasts;
    $('tbl-cof').innerHTML = '<thead><tr><th>Bank</th><th>View</th><th>Mid, $</th><th>Mid, £/oz</th><th>vs today</th></tr></thead><tbody>'
      + fs.map((f) => `<tr><td>${esc(f.house)}<span class="gloss">${esc(f.asOf)}</span></td><td style="font-family:var(--font-ui);white-space:normal">${esc(f.view)}</td><td>${usd(f.mid)}</td><td>${gbp(f.mid / fxNow)}</td><td class="${f.mid >= g.local ? 'up' : 'down'}">${spc(f.mid / g.local - 1, 0)}</td></tr>`).join('') + '</tbody>';
    const lo = Math.min(...fs.map((f) => f.mid)), hi = Math.max(...fs.map((f) => f.mid));
    $('coo-h').textContent = `Banks expect gold of ${usd(lo)} to ${usd(hi)} by 2027, ${pc(lo / g.local - 1, 0)} to ${pc(hi / g.local - 1, 0)} above today's ${usd(g.local)}. Forecasters were bullish at the 2011 peak too`;
    $('cof-note').innerHTML = `${esc(cr.centralBanks.text)} <a href="${cr.centralBanks.src}" target="_blank" rel="noopener">World Gold Council</a>. Bank views as reported in July 2026 (<a href="${cr.goldForecastsSrc}" target="_blank" rel="noopener">source</a>); pounds at today's rate of $${fxNow.toFixed(3)}. J.P. Morgan's long-run assumption for gold is ${pc(R.forecasts[0].values.gold)} a year in dollars.`;
    $('co-drivers').innerHTML = [
      ['Real interest rates', 'Gold pays nothing, so it shines when cash and bonds pay little after inflation, and struggles when real yields rise (2013, 2022). That link weakened after 2022 as central banks bought regardless.'],
      ['Central banks', `Since sanctions froze Russia's reserves in 2022, central banks have bought about 1,000 tonnes a year, twice the old pace. Their ${cr.centralBanks.t2025} tonnes in 2025 underpinned the rally; a slowdown is the main risk.`],
      ['Fear and the dollar', 'Gold is priced in dollars. A weaker dollar or a crisis of confidence (war, debt, inflation) tends to lift it. For a UK holder, a falling pound adds to the gain.'],
      ['Silver is half industrial', 'Solar panels and electronics now use over half of silver demand, so it also rises and falls with factory activity. That is why it swings about twice as much as gold.'],
    ].map(([h, p]) => `<div class="note"><h3>${h}</h3><p>${p}</p></div>`).join('');
    $('cop-id').value = c.proj;
    fixedSeg('cop-centre', c.centre, (vv) => { c.centre = vv; save(); renderCoOutlook(); });
    const jpmReal = (1 + R.forecasts[0].values.gold) / 1.025 - 1;
    fan('ch-cop', 'cop', c.proj, c.centre === 'jpm' ? jpmReal : null, c.centre === 'jpm' ? `centred on ${pc(jpmReal)} a year after inflation (J.P. Morgan's ${pc(R.forecasts[0].values.gold)} for gold, less 2.5% inflation)` : 'centred on its own past return');
  }

  // ================= router =================
  const VIEWS = { retire: 'view-retire', equities: 'view-equities', commodities: 'view-commodities' };
  const rendered = {};
  function viewFor(hash) {
    const h = (hash || '').replace('#', '');
    if (h === 'equities' || h.startsWith('eq-')) return 'equities';
    if (h === 'commodities' || h.startsWith('co-')) return 'commodities';
    return 'retire';
  }
  function show(view, scrollTo, nav = true) {
    for (const [k, id] of Object.entries(VIEWS)) $(id).hidden = k !== view;
    document.querySelectorAll('.views a').forEach((a) => (a.dataset.view === view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    document.querySelectorAll('.links a[data-in]').forEach((a) => { a.hidden = a.dataset.in !== view; });
    document.title = view === 'retire' ? 'Pension Planner' : `${view === 'equities' ? 'Equities' : 'Commodities'} · Pension Planner`;
    if (!rendered[view]) {
      rendered[view] = true;
      try { if (view === 'equities') renderEquities(); if (view === 'commodities') renderCommodities(); } catch (err) { console.error(err); }
    }
    if (!nav) return;
    const target = scrollTo && $(scrollTo);
    if (target && !['equities', 'commodities', 'retirement'].includes(scrollTo)) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => show(viewFor(location.hash), location.hash.slice(1)));

  $('eqa-shock').addEventListener('input', () => { S.eq.shock = +$('eqa-shock').value / 100; clearTimeout(renderAI.t); renderAI.t = setTimeout(() => { save(); renderAI(); }, 80); });
  $('eqa-shock').value = Math.round(S.eq.shock * 100);
  $('eqp-id').addEventListener('change', () => { S.eq.proj = $('eqp-id').value; save(); renderOutlook(); });
  $('cop-id').addEventListener('change', () => { S.co.proj = $('cop-id').value; save(); renderCoOutlook(); });
  const rerender = () => { for (const k of Object.keys(rendered)) rendered[k] = false; show(viewFor(location.hash), null, false); };
  try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', rerender); } catch (e) { /* old browsers */ }
  new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  const first = viewFor(location.hash);
  show(first, location.hash.slice(1), first !== 'retire');
})();
