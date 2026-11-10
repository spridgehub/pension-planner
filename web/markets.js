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
  const dmy = (d) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? new Date(d.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : d || '');
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

  // Clickable tiles: each opens the market's own page.
  function sparkSvg(values, color) {
    const W = 160, H = 26, lo = Math.min(...values), hi = Math.max(...values), r = hi - lo || 1;
    const d = values.map((v, i) => (i ? 'L' : 'M') + ((i / (values.length - 1)) * W).toFixed(1) + ' ' + (H - 3 - ((v - lo) / r) * (H - 6)).toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${W} ${H} L0 ${H} Z" fill="${rgba(color, 0.14)}"></path><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"></path></svg>`;
  }
  const priceText = (id) => {
    const p = E.latestPrice(id), u = A[id].unit;
    if (!u) return Math.round(p.local).toLocaleString('en-GB');
    return id === 'gold' || id === 'platinum' ? `${gbp(p.gbp)}/${u}` : id === 'silver' ? `£${p.gbp.toFixed(2)}/${u}` : `${usd(p.local, 2)}/${u}`;
  };
  function marketTiles(el, ids) {
    $(el).innerHTML = ids.map((id) => {
      const s = E.series(id), st1 = E.stats(s, E.addMonths(LAST, -12)), st10 = E.stats(s, E.addMonths(LAST, -120));
      return `<a class="cell tile" href="#m-${id}" aria-label="Open the ${esc(name(id))} page"><span class="lbl"><i style="background:${col(id)}"></i>${esc(name(id))}</span><span class="go" aria-hidden="true">›</span><span class="val">${priceText(id)}</span><span class="sub">1 yr ${spc(st1?.total)} · 10 yr ${st10 ? pc(st10.cagr) + '/yr' : 'n/a'}</span>${sparkSvg(s.values.slice(-60), col(id))}</a>`;
    }).join('');
  }

  // ================= EQUITIES =================
  function renderEquities() {
    const e = S.eq;
    const o = { ccy: e.ccy, real: e.real };
    // tickers
    marketTiles('eq-tickers', EQ);
    const v = E.VALUATION_NOW;
    const s10 = Object.fromEntries(EQ.map((id) => [id, E.stats(E.series(id), E.addMonths(LAST, -120))]));
    const ai = E.AI_NOW;
    $('eq-verdict').innerHTML = `Over ten years in pounds the US led (S&amp;P 500 ${pc(s10.spx.cagr)} a year, Nasdaq-100 ${pc(s10.ndx.cagr)}) against ${pc(s10.ftse.cagr)} for the FTSE 100. Most of that lead came from a handful of AI-linked giants, now ${pc(ai.spx.weight, 0)} of the S&amp;P 500, and US shares now cost ${v.spx.cape.toFixed(0)} times average earnings (CAPE) against ${v.ftse.cape.toFixed(0)} in the UK.`
      + `<small>Prices from Yahoo Finance to ${mon(LAST)}; valuations and AI weights from published research (Siblis Research ${dmy(v.spx.asOf)}; index holdings), rolled forward daily with prices. Past returns do not predict future returns.</small>`;

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
    const e = S.eq, ai = E.AI_NOW, shock = -e.shock;
    $('eqa-val').textContent = pc(e.shock, 0);
    const rows = EQ.map((id) => ({ id, s: E.aiStress(id, shock), ep: Object.fromEntries(E.EPISODES.map((x) => [x.id, E.episodeReturn(id, x)])) }));
    const worst = [...rows].sort((a, b) => a.s.history - b.s.history);
    $('eqa-h').textContent = `${name(worst[0].id)} and ${name(worst[1].id)} are the most tied to AI chip stocks; the ${name(worst[worst.length - 1].id)} and ${name(worst[worst.length - 2].id)} the least`;
    $('eqa-sub').textContent = R.aiContext.capex + ' That spending is what the market is paying for; if it slows or fails to earn a return, the names below take the hit.';
    $('tbl-eqa').innerHTML = '<thead><tr><th>Market</th><th>AI names weight</th><th>Which</th><th>Moves with chips</th><th>Dot-com bust</th><th>2022</th><th>DeepSeek, tariffs</th><th>If AI falls ' + pc(e.shock, 0) + '</th></tr></thead><tbody>'
      + rows.map(({ id, s, ep }) => `<tr><td><span class="name">${esc(name(id))}</span><span class="gloss">${esc(ai[id]?.extra || '')}</span></td><td>${s.weight != null ? `<span class="bar" style="width:${Math.round(s.weight * 120)}px"></span>${pc(s.weight, 0)}${ai[id]?.live ? `<span class="gloss">${pc(ai[id].base, 0)} on ${dmy(ai[id].asOf)}</span>` : ai[id]?.asOf ? `<span class="gloss">${dmy(ai[id].asOf)}</span>` : ''}` : 'n/a'}</td><td style="white-space:normal;text-align:left;font-family:var(--font-ui);font-size:12px;color:var(--ink-3);min-width:180px">${esc(ai[id]?.names || '')}</td><td title="Beta to SOX in pounds, 10 years; ${pc(s.r2, 0)} of monthly swings shared">${s.beta.toFixed(2)}<span class="gloss">${pc(s.r2, 0)} shared</span></td>`
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
    const e = S.eq, v = E.VALUATION_NOW;
    const rows = EQ.map((id) => ({ id, v: v[id], imp: E.valuationReturn(id), past: E.stats(E.series(id, { real: true }), E.addMonths(LAST, -120)) }));
    $('tbl-eqv').innerHTML = '<thead><tr><th>Market</th><th>CAPE</th><th>Forward P/E</th><th>Implied real return</th><th>Last 10 yrs real, £</th></tr></thead><tbody>'
      + rows.map((r) => `<tr><td><span class="name">${esc(name(r.id))}</span>${r.v?.basis ? `<span class="gloss">${esc(r.v.basis)}</span>` : ''}</td><td>${r.v?.cape?.toFixed(1) ?? 'n/a'}</td><td>${r.v?.fwdPe?.toFixed(1) ?? 'n/a'}</td><td>${r.imp ? pc(r.imp.real) + (r.imp.basis !== 'CAPE' ? ' *' : '') : 'n/a'}</td><td>${pc(r.past?.cagr)}</td></tr>`).join('')
      + `</tbody><tfoot><tr><td colspan="5" style="font-size:12px;color:var(--ink-3);white-space:normal">Readings from Siblis Research on ${dmy(v.spx.asOf)}, rolled forward to today with each index's price (a ratio's earnings base moves slowly). * No CAPE is published for the Nasdaq-100, so 1 / trailing P/E is used. Implied returns are in local currency; currency moves come on top.</td></tr></tfoot>`;
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
    marketTiles('co-tickers', CO);
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
      + fs.map((f) => `<tr><td>${f.src ? `<a href="${f.src}" target="_blank" rel="noopener">${esc(f.house)}</a>` : esc(f.house)}<span class="gloss">${esc(dmy(f.asOf))}</span></td><td style="font-family:var(--font-ui);white-space:normal">${esc(f.view)}</td><td>${usd(f.mid)}</td><td>${gbp(f.mid / fxNow)}</td><td class="${f.mid >= g.local ? 'up' : 'down'}">${spc(f.mid / g.local - 1, 0)}</td></tr>`).join('') + '</tbody>';
    const lo = Math.min(...fs.map((f) => f.mid)), hi = Math.max(...fs.map((f) => f.mid));
    $('coo-h').textContent = `Banks expect gold of ${usd(lo)} to ${usd(hi)} by 2027, ${pc(lo / g.local - 1, 0)} to ${pc(hi / g.local - 1, 0)} above today's ${usd(g.local)}. Forecasters were bullish at the 2011 peak too`;
    $('cof-note').innerHTML = `${esc(cr.centralBanks.text)} <a href="${cr.centralBanks.src}" target="_blank" rel="noopener">World Gold Council</a>. Bank views with the date each was reported; pounds at today's rate of $${fxNow.toFixed(3)}. J.P. Morgan's long-run assumption for gold is ${pc(R.forecasts[0].values.gold)} a year in dollars.`;
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

  // ================= ONE MARKET =================
  const ABOUT = {
    spx: ['US large companies', 'The 500 largest US-listed companies, weighted by size. About 60% of the world stock market by value, and a third of it now sits in eight technology giants.', 'S&P 500 trackers are among the cheapest funds there are (around 0.03 to 0.1% a year), as ETFs or index funds. Most global trackers are already about 70% US.'],
    ndx: ['US technology-led', 'The 100 largest non-financial companies on the Nasdaq exchange: mostly technology, internet and biotech. A concentrated bet on US tech and AI.', 'Nasdaq-100 ETFs charge around 0.1 to 0.3% a year. Holding one beside an S&P 500 or global fund doubles up on the same giants.'],
    ftse: ['UK large companies', 'The 100 largest companies on the London Stock Exchange. Heavy in banks, oil, mining, drugs and consumer staples; very little tech. About three quarters of its sales come from abroad.', 'FTSE 100 and FTSE All-Share trackers cost under 0.1% a year. UK dividends are high, which suits income in retirement.'],
    nikkei: ['Japan', 'Japan\'s best-known index of 225 large companies, weighted by share price rather than size, so a few high-priced stocks (chip-equipment makers, Fast Retailing) dominate.', 'Most Japan funds track the broader TOPIX or MSCI Japan rather than the Nikkei; charges around 0.1 to 0.2%. Yen-hedged versions remove the currency swing.'],
    kospi: ['South Korea', 'All shares on the Korea Exchange\'s main board, weighted by size. Samsung Electronics and SK Hynix, the memory-chip makers riding AI demand, now make up around 40%.', 'Held through MSCI Korea ETFs (around 0.2 to 0.6% a year) or Asia and emerging-market funds.'],
    hsi: ['Hong Kong and China', 'The largest companies listed in Hong Kong, many of them Chinese: Tencent, Alibaba, HSBC, Xiaomi. Cheap on earnings, but with Chinese political and property risk.', 'Held through Hang Seng or MSCI China ETFs, or China and Asia funds, at around 0.1 to 0.6% a year.'],
    taiex: ['Taiwan', 'All shares on the Taiwan Stock Exchange. TSMC, which makes most of the world\'s advanced chips, is over 40% of it, so it is close to a single-company AI bet with geopolitical risk.', 'Held through MSCI Taiwan ETFs (around 0.2 to 0.6%) or Asia and emerging-market funds.'],
    nifty: ['India', 'India\'s 50 largest companies: banks, IT services, energy and consumer firms. Fast-growing economy, usually priced at a premium.', 'Held through Nifty 50 or MSCI India ETFs and India investment trusts, at around 0.2 to 0.8% a year.'],
    gold: ['Precious metal', 'Priced in dollars per troy ounce. No income; driven by real interest rates, central-bank buying, the dollar and fear. The longest-running store of value there is.', 'Physical gold ETCs (backed by bars in a vault) work in a SIPP or ISA at around 0.1 to 0.25% a year. Britannia and Sovereign coins are free of Capital Gains Tax outside a pension.'],
    silver: ['Precious and industrial metal', 'Priced in dollars per troy ounce. Over half of demand is industrial (solar panels, electronics), so it moves with the economy as well as with gold, and about twice as violently.', 'Physical silver ETCs work in a SIPP or ISA. Silver coins and bars carry 20% VAT when bought new, which is a steep hurdle.'],
    platinum: ['Precious and industrial metal', 'Priced in dollars per troy ounce. Mostly used in car catalytic converters and jewellery, and mined mainly in South Africa and Russia, so supply shocks matter.', 'Physical platinum ETCs are available on most platforms; they are small and less liquid than gold.'],
    copper: ['Industrial metal', 'Priced in dollars per pound. Used in wiring, power grids, electric cars and data centres, so it tracks global growth, China in particular, and the energy transition.', 'Held through futures-based ETCs, whose returns can differ from the spot price (roll costs), or through mining shares, which are an equity bet.'],
    brent: ['Energy', 'Priced in dollars per barrel: the international benchmark for crude oil. Driven by OPEC supply decisions, global demand and wars.', 'Held through futures-based ETCs, which can lag the oil price badly when storage is tight. Oil companies in the FTSE 100 are the indirect route.'],
  };
  const REGION_FC = { spx: 'us', ndx: 'us', ftse: 'uk', nikkei: 'japan', kospi: 'em', hsi: 'em', taiex: 'em', nifty: 'em', gold: 'gold', silver: 'commodities', platinum: 'commodities', copper: 'commodities', brent: 'commodities' };
  const MK = { id: 'spx', range: 120, ccy: 'GBP', real: false, centre: 'value' };
  try { Object.assign(MK, JSON.parse(localStorage.getItem('pension-planner-market-v1') || '{}'), { id: MK.id }); } catch (e) { /* ignore */ }
  const saveMk = () => { try { localStorage.setItem('pension-planner-market-v1', JSON.stringify({ range: MK.range, ccy: MK.ccy, real: MK.real, centre: MK.centre })); } catch (e) { /* ignore */ } };

  function renderMarket(id) {
    MK.id = id;
    const a = A[id], isEq = EQ.includes(id), about = ABOUT[id];
    const link = (x) => `<a href="#m-${x}"${x === id ? ' aria-current="page"' : ''}><i style="background:${col(x)}"></i>${esc(name(x))}</a>`;
    $('mk-switch').innerHTML = `<a href="#equities" style="border-style:dashed">‹ All</a><span class="grp">Shares</span>${EQ.map(link).join('')}<span class="grp">Commodities</span>${CO.map(link).join('')}`;
    $('mk-sw').style.background = col(id);
    $('mk-kind').textContent = about[0];
    $('mk-name').textContent = name(id);
    const p = E.latestPrice(id);
    $('mk-price').textContent = priceText(id);
    $('mk-price-sub').textContent = `${a.unit ? usd(p.local, p.local < 100 ? 2 : 0) + '/' + a.unit + ' · ' : `index points (${a.ccy}) · `}${new Date(p.asOf).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    $('mk-about').textContent = about[1];

    const sGbp = E.series(id), all = E.stats(sGbp);
    const per = (n) => E.stats(sGbp, E.addMonths(LAST, -12 * n));
    const dd = E.drawdowns(sGbp), ddNow = dd.values[dd.values.length - 1];
    const s1 = per(1), s5 = per(5), s10 = per(10);
    $('mk-figs').innerHTML = [
      ['1 year', spc(s1?.total), 'in pounds' + (isEq ? ', with dividends' : '')],
      ['5 years', s5 ? pc(s5.cagr) + '/yr' : 'n/a', s5 ? `£10k became ${gbpk(10000 * (1 + s5.total))}` : ''],
      ['10 years', s10 ? pc(s10.cagr) + '/yr' : 'n/a', s10 ? `£10k became ${gbpk(10000 * (1 + s10.total))}` : ''],
      [`Since ${sGbp.months[0].slice(0, 4)}`, pc(all.cagr) + '/yr', `after inflation ${pc(E.stats(E.series(id, { real: true })).cagr)}/yr`],
      ['Swings (vol)', pc(all.vol, 0), 'typical yearly up or down'],
      ['Below its high', ddNow > -0.005 ? 'At a high' : pc(ddNow, 0), `worst ever ${pc(all.maxDD, 0)}`],
    ].map(([l, v, sub]) => `<div class="cell"><span class="lbl">${l}</span><span class="val">${v}</span><span class="sub">${sub}</span></div>`).join('');
    $('mk-verdict').innerHTML = s10
      ? `${esc(name(id))} has returned ${pc(s10.cagr)} a year in pounds over the last ten years, with a worst fall of ${pc(-all.maxDD, 0)} in its history${ddNow < -0.05 ? ` and is ${pc(-ddNow, 0)} below its high today` : ''}.`
      : `${esc(name(id))} has returned ${pc(all.cagr)} a year in pounds since ${mon(all.from)}.`;

    renderMarketChart();
    // calendar years
    const cy = E.calendarYears(id).slice(-25);
    const good = css('--good'), bad = css('--bad');
    chart('ch-mky', { type: 'bar', data: { labels: cy.map((x) => (x.partial ? `${x.year} so far` : String(x.year))), datasets: [{ label: 'Return', data: cy.map((x) => x.r), backgroundColor: cy.map((x) => rgba(x.r >= 0 ? good : bad, x.partial ? 0.45 : 0.85)), borderRadius: 4, borderSkipped: 'start' }] }, options: opts({ y: (v) => pc(v, 0), zero: true, xTicks: 13, tip: (c) => `${pc(c.parsed.y)}` }) });
    const done = cy.filter((x) => !x.partial);
    const ups = done.filter((x) => x.r >= 0).length, best = [...done].sort((x, y) => y.r - x.r)[0], worst = [...done].sort((x, y) => x.r - y.r)[0];
    $('mky-h').textContent = `Up in ${ups} of the last ${done.length} years. Best ${best.year} (${spc(best.r, 0)}), worst ${worst.year} (${pc(worst.r, 0)})`;

    // risks panel
    if (isEq) {
      const ai = E.AI_NOW[id], st = E.aiStress(id, -0.4), v = E.VALUATION_NOW[id], imp = E.valuationReturn(id);
      $('mkr-lbl').textContent = 'AI exposure and valuation';
      $('mkr-h').textContent = ai?.weight != null ? `${pc(ai.weight, 0)} sits in AI-linked companies; a 40% fall in AI stocks would mean roughly ${st.direct != null ? pc(-st.direct, 0) + ' to ' : ''}${pc(-st.history, 0)} off this index` : `No AI hardware names; a 40% fall in chip stocks has meant about ${pc(-st.history, 0)} here`;
      $('mkr-figs').innerHTML = [
        ['AI names', ai?.weight != null ? pc(ai.weight, 0) : 'n/a', ai?.live ? `today, est. (${pc(ai.base, 0)} on ${dmy(ai.asOf)})` : ai?.asOf ? `as of ${dmy(ai.asOf)}` : ''],
        ['Moves with chips', st.beta.toFixed(2), `${pc(st.r2, 0)} of swings shared`],
        ['CAPE', v?.cape?.toFixed(1) ?? 'n/a', `forward P/E ${v?.fwdPe?.toFixed(1) ?? 'n/a'}${v?.live ? `; today, est. from ${dmy(v.asOf)}` : ''}`],
        ['Implied real return', imp ? pc(imp.real) : 'n/a', imp ? `1 / ${imp.basis}, a year` : ''],
      ].map(([l, vv, sub]) => `<div class="cell"><span class="lbl">${l}</span><span class="val">${vv}</span><span class="sub">${sub}</span></div>`).join('');
      $('mkr-notes').innerHTML = `<div class="note"><h3>${esc(ai?.names || '')}</h3><p>${esc(ai?.extra || '')}${ai?.src ? ` <a href="${ai.src}" target="_blank" rel="noopener">Source</a>` : ''}</p></div>`
        + `<div class="note"><h3>Currency</h3><p>${a.ccy === 'GBP' ? 'Priced in pounds, so no currency risk for a UK investor, though most FTSE 100 profits are earned abroad.' : `Priced in ${a.ccy}. Over the last 10 years currency moves changed a UK investor's return from ${pc(E.stats(E.series(id, { ccy: 'local' }), E.addMonths(LAST, -120))?.cagr)} a year in ${a.ccy} to ${pc(s10?.cagr)} in pounds.`}</p></div>`;
    } else {
      const cr = R.commodities;
      $('mkr-lbl').textContent = 'Risks and role';
      const ep = E.EPISODES.filter((e) => (E.episodeReturn(id, e) ?? -1) > 0).length;
      const corr = E.correlation([id, 'spx', 'ftse'], { years: 10 });
      $('mkr-h').textContent = `Rose in ${ep} of ${E.EPISODES.length} share-market falls; moves with the S&P 500 at ${(Math.abs(corr[0][1]) < 0.005 ? 0 : corr[0][1]).toFixed(2)}`;
      const rec = id === 'gold' ? cr.goldRecord : id === 'silver' ? cr.silverRecord : null;
      $('mkr-figs').innerHTML = [
        ['Corr. with S&P 500', (Math.abs(corr[0][1]) < 0.005 ? 0 : corr[0][1]).toFixed(2), '10 years, monthly, in £'],
        ['Corr. with FTSE 100', (Math.abs(corr[0][2]) < 0.005 ? 0 : corr[0][2]).toFixed(2), '1 = lockstep, 0 = unrelated'],
        rec ? ['Record high', usd(rec.usd, rec.usd < 1000 ? 2 : 0), `${new Date(rec.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${pc(1 - p.local / rec.usd, 0)} above today`] : ['Worst fall', pc(all.maxDD, 0), `${mon(all.ddPeak)} to ${mon(all.ddTrough)}`],
        ['Income', 'None', 'all return is price'],
      ].map(([l, vv, sub]) => `<div class="cell"><span class="lbl">${l}</span><span class="val">${vv}</span><span class="sub">${sub}</span></div>`).join('');
      $('mkr-notes').innerHTML = id === 'gold' ? `<div class="note"><h3>Central banks</h3><p>${esc(cr.centralBanks.text)}</p></div>` : `<div class="note"><h3>Why it swings</h3><p>${esc(about[1])}</p></div>`;
    }

    // crashes
    const cmp = id === 'spx' ? ['ftse', 'gold'] : id === 'gold' ? ['spx', 'ftse'] : ['spx', 'gold'];
    $('tbl-mkx').innerHTML = `<thead><tr><th>Episode</th><th>${esc(name(id))}</th>${cmp.map((x) => `<th>${esc(name(x))}</th>`).join('')}</tr></thead><tbody>`
      + E.EPISODES.map((e) => `<tr><td><span class="name">${esc(e.label)}</span><span class="gloss">${mshort(e.from)} to ${mshort(e.to)}</span></td>` + [id, ...cmp].map((x) => { const r = E.episodeReturn(x, e); return `<td class="${r == null ? '' : r < 0 ? 'down' : 'up'}">${r == null ? 'n/a' : spc(r, 0)}</td>`; }).join('') + '</tr>').join('') + '</tbody>';
    const eps = E.EPISODES.map((e) => ({ e, r: E.episodeReturn(id, e) })).filter((x) => x.r != null).sort((x, y) => x.r - y.r);
    $('mkx-h').textContent = !eps.length ? 'Too little history for these episodes' : eps[0].r > 0 ? `Rose in every episode it was around for; smallest gain ${spc(eps[0].r, 0)} (${eps[0].e.label})` : `Worst episode here: ${eps[0].e.label}, ${spc(eps[0].r, 0)}`;

    // drawdowns
    chart('ch-mkd', { type: 'line', data: { labels: dd.months.map(mon), datasets: [line(id, dd.values, { fill: { target: 'origin' }, backgroundColor: rgba(col(id), 0.12), borderWidth: 1.5 })] }, options: opts({ y: (v) => pc(v, 0), yMax: 0, tip: (c) => `${pc(c.parsed.y, 0)} below the high` }) });
    $('mkd-h').textContent = `Worst fall ${pc(-all.maxDD, 0)}, ${mon(all.ddPeak)} to ${mon(all.ddTrough)}; ${all.ddRecoveredMonths != null ? `back to the old high after ${yrs(all.ddRecoveredMonths)}` : 'not yet back to that high'}`;

    renderMarketOutlook();

    $('mkh-h').textContent = isEq ? `How to hold ${name(id)}` : `How to hold ${name(id).toLowerCase()}`;
    $('mkh-p').textContent = about[2] + ' Information, not advice.';
    document.title = `${name(id)} · Pension Planner`;
  }

  function renderMarketChart() {
    const id = MK.id, o = { ccy: MK.ccy, real: MK.real };
    const full = E.series(id, o);
    const opts0 = [[12, '1 year'], [36, '3 years'], [60, '5 years'], [120, '10 years'], [240, '20 years'], [0, 'All']].filter(([n]) => !n || n < full.months.length);
    if (!opts0.some(([n]) => n === MK.range)) MK.range = 120 < full.months.length ? 120 : 0;
    seg('mk-range', opts0.map(([n, l]) => [n, l]), MK.range, (v) => { MK.range = +v; saveMk(); renderMarketChart(); });
    fixedSeg('mk-ccy', MK.ccy, (v) => { MK.ccy = v; saveMk(); renderMarketChart(); });
    fixedSeg('mk-real', MK.real ? '1' : '0', (v) => { MK.real = v === '1'; saveMk(); renderMarketChart(); });
    $('mk-ccy').querySelector('[data-v="local"]').textContent = A[id].ccy === 'USD' ? 'Dollars' : A[id].ccy === 'GBP' ? 'Pounds (same)' : `Local (${A[id].ccy})`;
    const from = MK.range ? E.addMonths(LAST, -MK.range) : full.months[0];
    const axis = monthsFrom(from < full.months[0] ? full.months[0] : from);
    const data = rebased(full, axis);
    const log = !MK.range || MK.range >= 240;
    chart('ch-mk', { type: 'line', data: { labels: axis.map(mon), datasets: [line(id, data, { fill: { target: 'origin' }, backgroundColor: rgba(col(id), 0.1) }), { label: 'What you put in', data: axis.map(() => 10000), borderColor: css('--grey'), borderDash: [4, 3], borderWidth: 1, pointRadius: 0 }] }, options: (() => { const op = opts({ log, y: gbpk, tip: (c) => `${c.dataset.label}: ${gbp(c.parsed.y)}` }); if (!log) op.scales.y.beginAtZero = false; return op; })() });
    const st = E.stats(full, axis[0]);
    $('mkc-sub').textContent = `£10,000 invested ${ccyLabel(o, A[id].ccy === 'USD')}${log ? ', log scale' : ''}`;
    $('mkc-h').textContent = st ? `£10,000 put in ${mon(st.from)} would be worth ${gbp(10000 * (1 + st.total))} now: ${pc(st.cagr)} a year, with a worst fall of ${pc(-st.maxDD, 0)} on the way` : '';
    $('mkc-note').textContent = A[id].note ? A[id].note + '.' : EQ.includes(id) ? (A[id].tr ? 'Total return including dividends.' : `Price index plus its typical ${pc(A[id].divYield)} dividend yield.`) : 'Front-month futures price.';
  }

  function renderMarketOutlook() {
    const id = MK.id, isEq = EQ.includes(id);
    const alt = isEq ? ['value', 'Today\'s valuation'] : ['jpm', 'Long-run assumption'];
    if (!['history', alt[0]].includes(MK.centre)) MK.centre = alt[0];
    seg('mk-centre', [['history', 'Its own history'], alt], MK.centre, (v) => { MK.centre = v; saveMk(); renderMarketOutlook(); });
    let centre = null, how = 'centred on its own past return';
    if (MK.centre === 'value' && isEq) { const v = E.valuationReturn(id); centre = v?.real ?? null; how = `centred on ${pc(centre)} a year after inflation (1 / ${v?.basis})`; }
    if (MK.centre === 'jpm' && !isEq) { const g = R.forecasts[0].values[id === 'gold' ? 'gold' : 'commodities']; centre = (1 + g) / 1.025 - 1; how = `centred on ${pc(centre)} a year after inflation (J.P. Morgan's ${pc(g)} for ${id === 'gold' ? 'gold' : 'commodities'}, less 2.5% inflation)`; }
    fan('ch-mkp', 'mkp', id, centre, how);
    const k = REGION_FC[id];
    const rows = R.forecasts.filter((f) => f.values[k] != null);
    $('mkf-wrap').hidden = !rows.length;
    $('tbl-mkf').innerHTML = `<thead><tr><th>House forecast for ${{ us: 'US shares', uk: 'UK shares', japan: 'Japanese shares', em: 'emerging markets', gold: 'gold', commodities: 'commodities' }[k]}</th><th>Per year</th><th>Horizon</th><th>Basis</th></tr></thead><tbody>`
      + rows.map((f) => `<tr><td><a href="${f.src}" target="_blank" rel="noopener">${esc(f.house)}</a><span class="gloss">${esc(f.asOf)}</span></td><td class="${f.values[k] < 0 ? 'down' : ''}">${pc(f.values[k])}</td><td>${esc(f.horizon)}</td><td style="font-family:var(--font-ui);font-size:12px;color:var(--ink-3)">${esc(f.basis)}</td></tr>`).join('')
      + (id === 'gold' ? R.commodities.goldForecasts.map((f) => `<tr><td>${esc(f.house)} (price target)<span class="gloss">${esc(dmy(f.asOf))}</span></td><td>${spc(f.mid / E.latestPrice('gold').local - 1, 0)} total</td><td>to 2027</td><td style="font-family:var(--font-ui);font-size:12px;color:var(--ink-3)">${esc(f.view)}</td></tr>`).join('') : '') + '</tbody>';
  }

  // ================= router =================
  const VIEWS = { retire: 'view-retire', equities: 'view-equities', commodities: 'view-commodities', market: 'view-market' };
  const rendered = {};
  function viewFor(hash) {
    const h = (hash || '').replace('#', '');
    if (h === 'equities' || h.startsWith('eq-')) return 'equities';
    if (h === 'commodities' || h.startsWith('co-')) return 'commodities';
    if (h.startsWith('m-') && A[h.slice(2)]) return 'market';
    return 'retire';
  }
  function show(view, scrollTo, nav = true) {
    for (const [k, id] of Object.entries(VIEWS)) $(id).hidden = k !== view;
    const mid = view === 'market' ? (scrollTo || '').slice(2) : null;
    const navView = view === 'market' ? (EQ.includes(mid) ? 'equities' : 'commodities') : view;
    document.querySelectorAll('.views a').forEach((a) => (a.dataset.view === navView ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    document.querySelectorAll('.links a[data-in]').forEach((a) => { a.hidden = a.dataset.in !== navView; });
    if (view === 'market') {
      try { renderMarket(mid); } catch (err) { console.error(err); }
      if (nav) window.scrollTo(0, 0);
      return;
    }
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
  const rerender = () => { for (const k of Object.keys(rendered)) rendered[k] = false; show(viewFor(location.hash), location.hash.slice(1), false); };
  try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', rerender); } catch (e) { /* old browsers */ }
  new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // Data freshness: updated automatically twice a day; say so plainly if that stops.
  (function stamp() {
    const D = E.DATA_STAMP, when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const ageDays = (Date.now() - new Date(D.prices)) / 864e5;
    const rAge = D.research ? (Date.now() - new Date(D.research)) / 864e5 : 999;
    $('data-stamp').textContent = `Market prices updated ${when(D.prices)} (automatically, twice a day). Research figures (valuations, AI weights, forecasts) last checked ${D.research ? new Date(D.research).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'n/a'}, refreshed monthly, and rolled forward with prices in between.${D.stale.length ? ` Not refreshed in the last run: ${D.stale.join(', ')}.` : ''}`;
    if (ageDays > 3 || rAge > 75) {
      $('stale-banner').hidden = false;
      $('stale-banner').textContent = ageDays > 3 ? `Market prices on this page were last updated ${when(D.prices)}. The automatic update looks to have stopped, so figures may be out of date.` : `The research figures (valuations, AI weights, forecasts) were last checked ${Math.round(rAge)} days ago; prices are current.`;
    }
  })();

  const first = viewFor(location.hash);
  show(first, location.hash.slice(1), first !== 'retire');
})();
