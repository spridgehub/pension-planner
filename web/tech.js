/* Tech stocks page over the engine bundle (window.RE). Rendered by the router in markets.js via
   window.TechView.render(symbol). User-facing text avoids dashes (INLAP rule). */
(function () {
  const E = window.RE;
  if (!E.STOCKS?.length) { window.TechView = { render() {} }; return; }
  const $ = (id) => document.getElementById(id);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pc = (v, d = 0) => (v == null || !isFinite(v) ? 'n/a' : (Math.abs(v * 100) < 0.5 * Math.pow(10, -d) ? 0 : v * 100).toFixed(d) + '%');
  const spc = (v, d = 0) => (v == null || !isFinite(v) ? 'n/a' : (v > 0 ? '+' : '') + pc(v, d));
  const usd = (v) => (v == null || !isFinite(v) ? 'n/a' : '$' + v.toLocaleString('en-US', { minimumFractionDigits: v < 100 ? 2 : 0, maximumFractionDigits: v < 100 ? 2 : 0 }));
  const dmy = (d) => new Date(d.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const dm = (d) => new Date(d.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const mo = (m) => new Date(m + '-15T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }).replace('Sept', 'Sep');
  const rgba = (color, a) => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = color; const h = c.fillStyle; if (!h.startsWith('#')) return color; const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

  const ALL = E.STOCKS.map((s) => s.symbol);
  const chg = (v) => (v == null || !isFinite(v) ? '<span class="chg">n/a</span>' : `<span class="chg ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${spc(v)}</span>`);
  // Fixed colour slot per stock (8-colour reference palette); a second pick sharing a slot is dashed.
  const SLOT = { NVDA: 6, AVGO: 8, AMD: 2, TSM: 3, MSFT: 1, GOOGL: 4, AMZN: 5, META: 7, ORCL: 2, AAPL: 3, TSLA: 8, TEAM: 1, CRM: 4, NOW: 5, ADBE: 6, PLTR: 7 };
  const col = (s) => (s === '^NDX' ? css('--ink-3') : css(`--s${SLOT[s] ?? 1}`));
  const nm = (s) => E.stock(s).name;
  const ST = Object.fromEntries([...ALL, '^NDX'].map((s) => [s, E.stockStats(s)]));
  const T = { spot: 'TEAM', picks: ['NVDA', 'MSFT', 'META', 'ORCL', 'TEAM'] };
  try { Object.assign(T, JSON.parse(localStorage.getItem('pension-planner-tech-v1') || '{}')); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem('pension-planner-tech-v1', JSON.stringify({ picks: T.picks })); } catch (e) { /* ignore */ } };

  const charts = {};
  const chart = (id, cfg) => { if (charts[id]) charts[id].destroy(); charts[id] = new Chart($(id), cfg); return charts[id]; };
  function opts({ y = (v) => v, tip, xTicks = 8, zero = false, yMin } = {}) {
    const ink3 = css('--ink-3'), rule = css('--rule'), f = { family: css('--font-num'), size: 11 };
    return {
      responsive: true, maintainAspectRatio: false, animation: false, normalized: true,
      interaction: { mode: 'index', intersect: false },
      elements: { point: { radius: 0, hitRadius: 6, hoverRadius: 4 }, line: { borderWidth: 2, tension: 0 } },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: css('--raised'), titleColor: css('--ink-1'), bodyColor: css('--ink-2'), borderColor: css('--rule-strong'), borderWidth: 1, padding: 10, cornerRadius: 6, bodyFont: f, callbacks: tip ? { label: tip } : {} } },
      scales: {
        x: { ticks: { color: ink3, maxRotation: 0, autoSkip: true, maxTicksLimit: xTicks, font: f }, grid: { display: false }, border: { color: css('--rule-strong') } },
        y: { min: yMin, ticks: { color: ink3, font: f, callback: (v) => y(v), maxTicksLimit: 7 }, grid: { color: (c) => (zero && c.tick?.value === 0 ? css('--rule-strong') : rule) }, border: { display: false } },
      },
    };
  }
  const key = (el, items) => { $(el).innerHTML = items.map(([l, c, dash]) => `<span><i style="background:${dash ? 'transparent' : c};${dash ? `border-top:2px dashed ${c};height:0;vertical-align:3px` : ''}"></i>${esc(l)}</span>`).join(''); };
  const dashFor = (list) => { const seen = new Set(); return Object.fromEntries(list.map((s) => { const k = col(s); const d = seen.has(k); seen.add(k); return [s, d]; })); };
  const D = E.STOCK_DATES, Y = 252;

  function sparkSvg(values, color) {
    const W = 160, H = 26, lo = Math.min(...values), hi = Math.max(...values), r = hi - lo || 1;
    const d = values.map((v, i) => (i ? 'L' : 'M') + ((i / (values.length - 1)) * W).toFixed(1) + ' ' + (H - 3 - ((v - lo) / r) * (H - 6)).toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${W} ${H} L0 ${H} Z" fill="${rgba(color, 0.14)}"></path><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"></path></svg>`;
  }

  function renderAll() {
    $('tech-tiles').innerHTML = ALL.map((s) => {
      const st = ST[s];
      const up = st.r12m >= 0;
      return `<a class="cell tile ${up ? 'is-up' : 'is-down'}" href="#t-${s}" aria-label="Spotlight ${esc(nm(s))}, ${spc(st.r12m)} over 12 months"${s === T.spot ? ' style="background:var(--raised)"' : ''}><span class="lbl"><i style="background:${col(s)}"></i>${esc(nm(s))}</span><span class="go" aria-hidden="true">›</span><span class="val">${usd(st.price)}</span><span class="moves">${chg(st.r12m)} <span class="per">12 mo</span></span><span class="sub">1 mo ${chg(st.r1m)}</span>${sparkSvg(E.stock(s).px.slice(-Y), up ? css('--good') : css('--bad'))}</a>`;
    }).join('');
    const by = [...ALL].sort((a, b) => ST[b].r12m - ST[a].r12m);
    const stormy = [...ALL].sort((a, b) => ST[b].volTrend - ST[a].volTrend);
    const ndx = ST['^NDX'];
    $('tech-verdict').innerHTML = `Over 12 months ${esc(nm(by[0]))} led (${spc(ST[by[0]].r12m)}) and ${esc(nm(by[by.length - 1]))} lagged (${spc(ST[by[by.length - 1]].r12m)}), against ${spc(ndx.r12m)} for the Nasdaq-100. Swings are ${ndx.volTrend > 1.3 ? 'running hot' : ndx.volTrend < 0.8 ? 'unusually calm' : 'about normal'}: the Nasdaq-100's 1-month volatility is ${pc(ndx.vols[21])} against ${pc(ndx.vols[252])} over a year, and ${esc(nm(stormy[0]))}'s is ${(ST[stormy[0]].volTrend).toFixed(1)} times its yearly level.`
      + `<small>Daily closes from Yahoo Finance to ${dmy(D[D.length - 1])}, in dollars, prices only. Updated several times a day. Not a recommendation to buy or sell.</small>`;
    renderSpot();
    render12m();
    renderMonths();
    renderVol();
    renderRange();
  }

  const ABOUT = {
    NVDA: 'Designs the graphics chips most AI models are trained and run on; the bellwether of AI spending.',
    AVGO: 'Custom AI chips for the cloud giants plus networking, and VMware software.',
    AMD: 'Nvidia\'s main rival in AI chips, and the second big maker of PC and server processors.',
    TSM: 'Taiwan Semiconductor: manufactures most of the world\'s advanced chips, Nvidia\'s included (US listing).',
    MSFT: 'Azure cloud, Office and Windows; OpenAI\'s biggest backer and a top AI spender.',
    GOOGL: 'Google search and YouTube advertising, Google Cloud and the Gemini AI models.',
    AMZN: 'Online retail plus AWS, the largest cloud platform, which earns most of its profit.',
    META: 'Facebook, Instagram and WhatsApp advertising, spending heavily on AI data centres.',
    ORCL: 'Databases and a fast-growing AI cloud business, funded by heavy borrowing for data centres.',
    AAPL: 'iPhone, Mac and services; a smaller AI spender than the others, so it trades differently.',
    TSLA: 'Electric cars and batteries; valued largely on self-driving and robot ambitions.',
    TEAM: 'Atlassian makes Jira and Confluence, sold per user to software teams. Seat-based software has been hit by worries that AI agents will need fewer human licences.',
    CRM: 'Salesforce: customer-relationship software sold per seat, now pitching AI agents.',
    NOW: 'ServiceNow: workflow software for IT and HR departments, sold to large companies.',
    ADBE: 'Photoshop, Acrobat and creative software, facing competition from AI image tools.',
    PLTR: 'Data and AI software for governments and companies; priced at a very high multiple of sales.',
  };

  function renderSpot() {
    const s = T.spot, st = ST[s], x = E.stock(s);
    $('ts-sw').style.background = col(s);
    $('ts-kind').textContent = x.group;
    $('ts-name').textContent = `${x.name} (${s})`;
    $('ts-price').textContent = usd(st.price);
    $('ts-price-sub').textContent = `${dmy(st.asOf)} · 52-week ${usd(st.low52)} to ${usd(st.high52)}`;
    const v1 = st.vols[252];
    const r12 = E.impliedRange(st.price, v1, 12);
    $('ts-verdict').textContent = `${x.name} is ${spc(st.r12m)} over 12 months and ${pc(-st.fromHigh)} below its 52-week high, with a worst fall of ${pc(-st.maxDD12)} (${dm(st.ddFrom)} to ${dm(st.ddTo)}). It swings ${pc(v1)} a year, ${(v1 / ST['^NDX'].vols[252]).toFixed(1)} times the Nasdaq-100, so a typical year from here spans ${usd(r12.lo1)} to ${usd(r12.hi1)}.`;
    $('ts-figs').innerHTML = [
      ['1 month', spc(st.r1m), `3 months ${spc(st.r3m)}`],
      ['12 months', spc(st.r12m), `year to date ${spc(st.ytd)}`],
      ['3 years', st.r3y != null ? spc(st.r3y) + '/yr' : 'n/a', `5 years ${st.r5y != null ? spc(st.r5y) + '/yr' : 'n/a'}`],
      ['Worst day', pc(st.worstDay, 1), dmy(st.worstDayDate)],
      ['Best day', spc(st.bestDay, 1), dmy(st.bestDayDate)],
      ['Days over 5%', String(st.bigDays), 'up or down, last 12 months'],
      ['Beta', st.beta.toFixed(2), `to the Nasdaq-100, 1 year (corr. ${st.corr.toFixed(2)})`],
    ].map(([l, v, sub]) => `<div class="cell"><span class="lbl">${l}</span><span class="val">${v}</span><span class="sub">${sub}</span></div>`).join('');
    // price + forward cone (weekly steps for 12 months)
    const px = x.px.slice(-Y), dates = D.slice(-Y);
    const steps = 52, last = new Date(dates[dates.length - 1] + 'T12:00:00Z');
    const fwd = Array.from({ length: steps }, (_, i) => { const t = new Date(last); t.setUTCDate(t.getUTCDate() + 7 * (i + 1)); return t.toISOString().slice(0, 10); });
    const labels = [...dates, ...fwd].map(dm);
    const cone = (k) => [...px.slice(0, -1).map(() => null), st.price, ...fwd.map((_, i) => E.impliedRange(st.price, v1, (i + 1) * 12 / 52)[k])];
    const c = col(s);
    chart('ch-ts', { type: 'line', data: { labels, datasets: [
      { label: 'Price', data: [...px, ...fwd.map(() => null)], borderColor: c, backgroundColor: c },
      { label: 'wide-hi', data: cone('hi2'), borderWidth: 0, backgroundColor: rgba(c, 0.1), fill: '+1', pointRadius: 0 },
      { label: 'wide-lo', data: cone('lo2'), borderWidth: 0, fill: false, pointRadius: 0 },
      { label: 'likely-hi', data: cone('hi1'), borderWidth: 0, backgroundColor: rgba(c, 0.22), fill: '+1', pointRadius: 0 },
      { label: 'likely-lo', data: cone('lo1'), borderWidth: 0, fill: false, pointRadius: 0 },
      { label: '52-week high', data: labels.map(() => st.high52), borderColor: css('--grey'), borderDash: [3, 3], borderWidth: 1, pointRadius: 0 },
    ] }, options: (() => { const o = opts({ y: usd, xTicks: 9 }); o.plugins.tooltip.filter = (t) => t.dataset.label === 'Price' || t.dataset.label.endsWith('-hi'); o.plugins.tooltip.callbacks = { label: (t) => { const i = t.dataIndex - px.length + 1; if (t.dataset.label === 'Price') return `Price ${usd(t.parsed.y)}`; if (i < 1) return null; const r = E.impliedRange(st.price, v1, i * 12 / 52); return t.dataset.label === 'likely-hi' ? `2 in 3: ${usd(r.lo1)} to ${usd(r.hi1)}` : `19 in 20: ${usd(r.lo2)} to ${usd(r.hi2)}`; } }; return o; })() });
    key('ts-key', [['Price', c], ['Likely range (2 in 3)', rgba(c, 0.32)], ['Wide range (19 in 20)', rgba(c, 0.12)], ['52-week high', css('--grey'), true]]);
    // vol by period
    const pv = E.VOL_PERIODS.map(([n, l]) => ({ l, v: st.vols[n], b: ST['^NDX'].vols[n] }));
    chart('ch-tsvol', { type: 'bar', data: { labels: pv.map((p) => p.l), datasets: [
      { label: x.name, data: pv.map((p) => p.v), backgroundColor: c, borderRadius: 4, borderSkipped: 'start' },
      { label: 'Nasdaq-100', data: pv.map((p) => p.b), backgroundColor: css('--grey'), borderRadius: 4, borderSkipped: 'start' },
    ] }, options: (() => { const o = opts({ y: (v) => pc(v), tip: (t) => `${t.dataset.label}: ${pc(t.parsed.y)} a year` }); o.plugins.legend = { display: true, position: 'top', align: 'start', labels: { color: css('--ink-3'), boxWidth: 12, boxHeight: 8 } }; o.scales.y.beginAtZero = true; return o; })() });
    $('tbl-tsrange').innerHTML = '<thead><tr><th>Typical range ahead</th><th>2 in 3</th><th>19 in 20</th></tr></thead><tbody>'
      + [[1, '1 month'], [3, '3 months'], [12, '12 months']].map(([m, l]) => { const r = E.impliedRange(st.price, v1, m); return `<tr><td>${l}</td><td>${usd(r.lo1)} to ${usd(r.hi1)}</td><td>${usd(r.lo2)} to ${usd(r.hi2)}</td></tr>`; }).join('') + '</tbody>';
    $('ts-about').textContent = ABOUT[s] || '';
  }

  function render12m() {
    const seg = $('t12-pick');
    const groups = [...new Set(E.STOCKS.map((x) => x.group))];
    seg.innerHTML = groups.map((g) => `<span class="lbl" style="align-self:center;margin:0 4px 0 8px">${esc(g)}</span>` + E.STOCKS.filter((x) => x.group === g).map((x) => `<button type="button" data-v="${x.symbol}" aria-pressed="${T.picks.includes(x.symbol)}"><span class="sw" style="background:${col(x.symbol)}"></span>${esc(x.name)}</button>`).join('')).join('');
    seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const s = b.dataset.v;
      T.picks = T.picks.includes(s) ? T.picks.filter((x) => x !== s) : [...T.picks, s].slice(-6);
      if (!T.picks.length) T.picks = [s];
      save(); render12m(); renderVol();
    }));
    const dates = D.slice(-Y - 1), dash = dashFor(T.picks);
    const ds = [...T.picks, '^NDX'].map((s) => { const v = E.stock(s).px.slice(-Y - 1); return { label: nm(s), data: v.map((p) => 100 * p / v[0]), borderColor: col(s), backgroundColor: col(s), borderDash: s === '^NDX' || dash[s] ? [5, 3] : [], borderWidth: s === '^NDX' ? 1.5 : 2 }; });
    chart('ch-t12', { type: 'line', data: { labels: dates.map(dm), datasets: ds }, options: opts({ y: (v) => v.toFixed(0), tip: (t) => `${t.dataset.label}: ${spc(t.parsed.y / 100 - 1)}` }) });
    key('t12-key', [...T.picks.map((s) => [nm(s), col(s), dash[s]]), ['Nasdaq-100', col('^NDX'), true]]);
    const r = T.picks.map((s) => [s, ST[s].r12m]).sort((a, b) => b[1] - a[1]);
    $('t12-h').textContent = r.length > 1 ? `${nm(r[0][0])} ${spc(r[0][1])}, ${nm(r[r.length - 1][0])} ${spc(r[r.length - 1][1])}, Nasdaq-100 ${spc(ST['^NDX'].r12m)}: a wide spread inside one sector` : `${nm(r[0][0])} ${spc(r[0][1])} over 12 months`;
  }

  function heat(v, scale) {
    if (v == null) return '';
    const a = Math.min(0.75, Math.abs(v) / scale * 0.75);
    return `background:${rgba(v >= 0 ? css('--good') : css('--bad'), a)}`;
  }
  function renderMonths() {
    const rows = [...ALL, '^NDX'].map((s) => ({ s, m: E.monthlyMoves(s, 12) }));
    const months = rows[0].m.map((x) => x.month);
    $('tbl-tm').innerHTML = `<thead><tr><th>Stock</th>${months.map((m, i) => `<th>${mo(m)}${i === months.length - 1 ? ' so far' : ''}</th>`).join('')}<th>12 months</th></tr></thead><tbody>`
      + rows.map(({ s, m }) => `<tr${s === '^NDX' ? ' class="group"' : ''}><td><a href="#t-${s === '^NDX' ? T.spot : s}" style="color:inherit;text-decoration:none"><span class="name">${esc(nm(s))}</span></a></td>${m.map((x) => `<td style="${heat(x.r, 0.25)}">${spc(x.r)}</td>`).join('')}<td style="${heat(ST[s].r12m, 0.6)}"><b>${spc(ST[s].r12m)}</b></td></tr>`).join('') + '</tbody>';
    const flat = rows.filter((r) => r.s !== '^NDX').flatMap((r) => r.m.map((x) => ({ s: r.s, ...x })));
    const big = flat.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
    const downAll = months.map((m, i) => rows.filter((r) => r.s !== '^NDX' && r.m[i]?.r < 0).length);
    const worstM = downAll.indexOf(Math.max(...downAll));
    $('tm-h').textContent = `Biggest single month: ${nm(big.s)} ${spc(big.r)} in ${mo(big.month)}. In ${mo(months[worstM])} ${downAll[worstM]} of ${ALL.length} fell together`;
  }

  function renderVol() {
    const per = E.VOL_PERIODS;
    const rows = [...ALL, '^NDX'].map((s) => ({ s, st: ST[s] }));
    $('tbl-tv').innerHTML = `<thead><tr><th>Stock</th>${per.map(([, l]) => `<th>${l}</th>`).join('')}<th>Now vs year</th><th>Beta</th></tr></thead><tbody>`
      + rows.map(({ s, st }) => `<tr${s === '^NDX' ? ' class="group"' : ''}><td><span class="name">${esc(nm(s))}</span></td>${per.map(([n]) => { const v = st.vols[n]; return `<td style="${v == null ? '' : `background:${rgba(css('--accent-ink'), Math.min(0.7, v / 1.2 * 0.7))}`}">${pc(v)}</td>`; }).join('')}<td class="${st.volTrend > 1.3 ? 'down' : st.volTrend < 0.8 ? 'up' : ''}">${st.volTrend == null ? 'n/a' : st.volTrend > 1.3 ? `${st.volTrend.toFixed(1)}× stormy` : st.volTrend < 0.8 ? `${st.volTrend.toFixed(1)}× calm` : `${st.volTrend.toFixed(1)}× normal`}</td><td>${s === '^NDX' ? '1.00' : st.beta.toFixed(2)}</td></tr>`).join('') + '</tbody>';
    const hot = [...ALL].sort((a, b) => ST[b].vols[252] - ST[a].vols[252]), calm = hot[hot.length - 1];
    const storm = ALL.filter((s) => ST[s].volTrend > 1.3);
    $('tv-h').textContent = `${nm(hot[0])} swings most (${pc(ST[hot[0]].vols[252])} a year), ${nm(calm)} least (${pc(ST[calm].vols[252])}). ${storm.length ? `${storm.length} of ${ALL.length} are in a stormy patch, with this month's swings well above their yearly norm` : 'None is unusually stormy this month'}`;
    const dash = dashFor(T.picks);
    const rv = [...T.picks, '^NDX'].map((s) => ({ s, r: E.rollingVol(s, 21, Y) }));
    chart('ch-tvr', { type: 'line', data: { labels: rv[0].r.dates.map(dm), datasets: rv.map(({ s, r }) => ({ label: nm(s), data: r.values, borderColor: col(s), backgroundColor: col(s), borderWidth: s === '^NDX' ? 1.5 : 1.8, borderDash: s === '^NDX' || dash[s] ? [5, 3] : [] })) }, options: opts({ y: (v) => pc(v), tip: (t) => `${t.dataset.label}: ${pc(t.parsed.y)} a year` }) });
    key('tvr-key', [['Rolling 1-month volatility:', 'transparent'], ...T.picks.map((s) => [nm(s), col(s), dash[s]]), ['Nasdaq-100', col('^NDX'), true]]);
  }

  function renderRange() {
    const rows = [...ALL, '^NDX'].map((s) => { const st = ST[s], v = st.vols[252]; return { s, st, v, m1: E.impliedRange(st.price, v, 1), m12: E.impliedRange(st.price, v, 12), bad: Math.exp(-1.645 * v * Math.sqrt(1 / 12)) - 1, hit: E.rangeHitRate(s, 3) }; });
    $('tbl-tr').innerHTML = '<thead><tr><th>Stock</th><th>Typical month</th><th>Typical year</th><th>12 months, 2 in 3</th><th>Bad month (1 in 20)</th><th>Held</th></tr></thead><tbody>'
      + rows.map((r) => `<tr${r.s === '^NDX' ? ' class="group"' : ''}><td><a href="#t-${r.s === '^NDX' ? T.spot : r.s}" style="color:inherit;text-decoration:none"><span class="name">${esc(nm(r.s))}</span></a></td><td>${pc(r.m1.down1)} / ${spc(r.m1.up1)}</td><td>${pc(r.m12.down1)} / ${spc(r.m12.up1)}</td><td>${r.s === '^NDX' ? `${Math.round(r.m12.lo1).toLocaleString('en-GB')} to ${Math.round(r.m12.hi1).toLocaleString('en-GB')}` : `${usd(r.m12.lo1)} to ${usd(r.m12.hi1)}`}</td><td class="down">${pc(r.bad)}</td><td>${pc(r.hit)}</td></tr>`).join('') + '</tbody>';
    const t = rows.find((r) => r.s === T.spot) ?? rows[0];
    $('tr-h').textContent = `On this year's swings, a typical month moves ${nm(t.s)} between ${pc(t.m1.down1)} and ${spc(t.m1.up1)}, the Nasdaq-100 between ${pc(rows[rows.length - 1].m1.down1)} and ${spc(rows[rows.length - 1].m1.up1)}; 1 month in 20 would see ${nm(t.s)} fall ${pc(-t.bad)} or more`;
    chart('ch-trs', { type: 'scatter', data: { datasets: [
      ...rows.map((r) => ({ label: nm(r.s), data: [{ x: r.v, y: r.st.r12m }], backgroundColor: col(r.s), borderColor: css('--panel'), borderWidth: 2, pointRadius: r.s === T.spot ? 8 : 6, pointHoverRadius: 9, pointStyle: r.s === '^NDX' ? 'rectRot' : 'circle' })),
    ] }, plugins: [{ id: 'labels', afterDatasetsDraw(ch) {
      const ctx = ch.ctx; ctx.save(); ctx.font = `500 11px ${css('--font-ui')}`; ctx.fillStyle = css('--ink-2'); ctx.textBaseline = 'middle';
      ch.data.datasets.forEach((d, i) => { const pt = ch.getDatasetMeta(i).data[0]; if (pt) ctx.fillText(d.label.replace('Nasdaq-100', 'Nasdaq'), pt.x + 9, pt.y); });
      ctx.restore();
    } }], options: (() => { const o = opts({ y: (v) => pc(v), zero: true }); o.interaction = { mode: 'nearest', intersect: true }; o.scales.x = { ...o.scales.x, type: 'linear', title: { display: true, text: '1-year volatility', color: css('--ink-3') }, ticks: { ...o.scales.x.ticks, callback: (v) => pc(v) } }; o.plugins.tooltip.callbacks = { label: (t) => `${t.dataset.label}: ${spc(t.parsed.y)} in 12 months, volatility ${pc(t.parsed.x)}` }; return o; })() });
  }

  window.TechView = {
    render(sym) {
      if (sym && E.stock(sym) && sym[0] !== '^') T.spot = sym;
      renderAll();
    },
  };
})();
