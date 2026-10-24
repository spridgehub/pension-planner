/* Pension Planner desk: UI over the engine bundle (window.RE). User-facing text avoids dashes
   (INLAP rule); ranges are written "x to y". */
(function () {
  const E = window.RE;
  const $ = (id) => document.getElementById(id);
  const gbp = (v) => (v == null || !isFinite(v) ? 'n/a' : '£' + Math.round(v).toLocaleString('en-GB'));
  const gbpk = (v) => (v == null || !isFinite(v) ? 'n/a' : Math.abs(v) >= 1e6 ? '£' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'm' : '£' + Math.round(v / 1000) + 'k');
  const pc = (v, d = 1) => (v == null || !isFinite(v) ? 'n/a' : (v * 100).toFixed(d) + '%');
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const rgba = (color, a) => {
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = color;
    const hex = c.fillStyle;
    if (!hex.startsWith('#')) return color;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NOW = E.MARKET_NOW;
  const TODAY = E.todaysRegime(NOW);

  // ---------- state ----------
  const state = { persona: 'couple', regime: TODAY, selected: 'four-percent', tab: 'annuities' };
  let quotes = [];
  const FIELDS = ['p-age', 'p-sex', 'p-health', 'p-sp', 'p-spa', 'couple', 'q-age', 'q-sex', 'q-health', 'q-sp', 'q-spa', 'pot', 'savings', 'tfc', 'db', 'essential', 'fee', 'eqadj', 'sppol', 'toage'];
  for (const id of ['p-health', 'q-health']) $(id).innerHTML = Object.entries(E.HEALTH).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  const setVal = (id, v) => { const el = $(id); if (el.type === 'checkbox') el.checked = !!v; else el.value = v; };
  const num = (id) => parseFloat($(id).value) || 0;

  function loadPersona(id) {
    const h = E.PERSONAS.find((x) => x.id === id).household;
    state.persona = id;
    setVal('p-age', h.person.age); setVal('p-sex', h.person.sex); setVal('p-health', 'average');
    setVal('p-sp', 241.30); setVal('p-spa', h.person.statePensionAge ?? 67);
    setVal('couple', !!h.partner);
    if (h.partner) { setVal('q-age', h.partner.age); setVal('q-sex', h.partner.sex); setVal('q-health', 'average'); setVal('q-sp', 241.30); setVal('q-spa', h.partner.statePensionAge ?? 67); }
    setVal('pot', h.pensionPot); setVal('savings', h.otherSavings ?? 0); setVal('tfc', '0.25'); setVal('db', 0); setVal('essential', h.essentialSpending);
    quotes = [];
  }
  setVal('fee', 0.6); setVal('eqadj', '0'); setVal('sppol', 'tripleLock'); setVal('toage', '95');
  loadPersona('couple');
  try {
    const saved = JSON.parse(localStorage.getItem('pension-planner-v3') || 'null');
    if (saved) {
      Object.assign(state, saved.state || {});
      for (const id of FIELDS) if (saved.f?.[id] != null) setVal(id, saved.f[id]);
    }
  } catch (e) { /* storage unavailable */ }
  const save = () => {
    try { localStorage.setItem('pension-planner-v3', JSON.stringify({ state, f: Object.fromEntries(FIELDS.map((id) => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value])) })); } catch (e) { /* ignore */ }
  };

  function readHousehold() {
    const couple = $('couple').checked;
    document.querySelectorAll('.partner').forEach((el) => { el.hidden = !couple; });
    const person = { age: Math.round(num('p-age')), sex: $('p-sex').value, health: $('p-health').value, statePension: num('p-sp') * 52, statePensionAge: num('p-spa'), otherIncome: num('db') > 0 ? [{ amount: num('db'), indexed: true, survivorPct: 0.5 }] : [] };
    const partner = couple ? { age: Math.round(num('q-age')), sex: $('q-sex').value, health: $('q-health').value, statePension: num('q-sp') * 52, statePensionAge: num('q-spa'), otherIncome: [] } : null;
    return { person, partner, pensionPot: num('pot'), otherSavings: num('savings'), tfcPct: parseFloat($('tfc').value), essentialSpending: num('essential') };
  }
  const settings = () => ({ fee: num('fee') / 100, equityAdj: parseFloat($('eqadj').value), spPolicy: $('sppol').value, toAge: parseInt($('toage').value, 10) });
  const basis = () => E.anchorBasis(E.liveBasis(), quotes);

  // ---------- charts ----------
  const charts = {};
  function chart(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), config);
    return charts[id];
  }
  function baseOptions({ yMoney = true, xTitle = 'Age', yTitle, legend = false } = {}) {
    const ink3 = css('--ink-3'), rule = css('--rule');
    const numFont = { family: css('--font-num'), size: 11 };
    return {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: legend, position: 'top', align: 'start', labels: { color: ink3, boxWidth: 12, boxHeight: 8, font: { family: css('--font-ui'), size: 12 } } },
        tooltip: { backgroundColor: css('--raised'), titleColor: css('--ink-1'), bodyColor: css('--ink-2'), footerColor: ink3, borderColor: css('--rule-strong'), borderWidth: 1, padding: 10, cornerRadius: 6, titleFont: { family: css('--font-ui'), weight: '600' }, bodyFont: numFont, footerFont: numFont },
      },
      scales: {
        x: { ticks: { color: ink3, maxRotation: 0, autoSkipPadding: 14, font: numFont }, grid: { display: false }, border: { color: css('--rule-strong') }, title: { display: !!xTitle, text: xTitle, color: ink3, font: { family: css('--font-ui'), size: 11 } } },
        y: { ticks: { color: ink3, font: numFont, callback: yMoney ? (v) => gbpk(v) : undefined }, grid: { color: rule }, border: { display: false }, title: { display: !!yTitle, text: yTitle, color: ink3, font: { family: css('--font-ui'), size: 11 } }, beginAtZero: true },
      },
    };
  }

  // ---------- desk strip ----------
  function spark(values, color) {
    const vs = values.filter((v) => v != null);
    if (vs.length < 2) return '';
    const W = 160, H = 26, lo = Math.min(...vs), hi = Math.max(...vs), r = hi - lo || 1;
    const pts = values.map((v, i) => (v == null ? null : [(i / (values.length - 1)) * W, H - 3 - ((v - lo) / r) * (H - 6)])).filter(Boolean);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${W} ${H} L0 ${H} Z" fill="${rgba(color, 0.16)}"></path><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"></path><circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="${color}"></circle></svg>`;
  }
  function renderMarket() {
    const L = NOW.latest, M = NOW.monthly;
    const B = basis();
    const per100 = E.annuityIncome(100000, { life: 'single', escalation: { kind: 'level' } }, { age: 65 }, B);
    const per100cpi = E.annuityIncome(100000, { life: 'single', guaranteeYears: 5, escalation: { kind: 'cpi' } }, { age: 65 }, B);
    const y2020 = E.ANNUITY_HISTORY.find((a) => a.date === '2020-07').income;
    const minReal = Math.min(...M.map((m) => m.real20).filter((v) => v != null));
    const minRealMonth = M.find((m) => m.real20 === minReal)?.month;
    const mon = (m) => new Date(m + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    const c = css('--accent-ink');
    const cells = [
      ['Bank Rate', pc(L.bankRate.value, 2), 'Since 2019', spark(M.map((m) => m.bankRate), c)],
      ['10y gilt', pc(L.gilt10.value, 2), `Above ${pc(E.historyPercentile('longYield', L.gilt10.value), 0)} of years since 1900`, spark(M.map((m) => m.gilt10), c)],
      ['CPI', pc(L.cpi.value, 1), `${mon(L.cpi.date)}, target 2%`, spark(M.map((m) => m.cpi), c)],
      ['Implied inflation', pc(L.implied20.value, 2), '20y, RPI basis', spark(M.map((m) => m.implied20), c)],
      ['Real yield', pc(L.real20.value, 2), `20y. ${pc(minReal, 1)} in ${minRealMonth ? mon(minRealMonth) : 'the trough'}`, spark(M.map((m) => m.real20), c)],
      ['£100k at 65', gbp(per100), `Level a year. CPI linked ${gbp(per100cpi)}. Jul 2020 ${gbp(y2020)}`, ''],
    ];
    $('tickers').innerHTML = cells.map(([l, v, s, sp]) => `<div class="cell"><span class="lbl">${l}</span><span class="val">${v}</span><span class="sub">${s}</span>${sp}</div>`).join('');
    $('asof').textContent = `BoE ${new Date(L.gilt10.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ONS ${mon(L.cpi.date)}`;
    const ref = E.safeMaxByStartYear({ person: { age: 65 }, pensionPot: 100000, tfcPct: 0 }, B, { toAge: 95 });
    const grp = (k) => ref.filter((x) => E.REGIMES[k].test(E.conditions(x.startYear)));
    const ok = (g) => g.filter((x) => x.rate >= 0.04).length;
    const like = grp('likeToday'), low = grp('lowRates');
    $('verdict').innerHTML = TODAY === 'likeToday'
      ? `Today is a high-rate, moderate-inflation start. A 65-year-old's 4% plan begun in conditions like this lasted to 95 in ${ok(like)} of ${like.length} cases since 1900; begun with low rates, ${ok(low)} of ${low.length}.<small>Annuities pay ${pc(per100 / y2020 - 1, 0)} more than in July 2020. Small, overlapping samples: a tilt in the odds, not a promise.</small>`
      : `Today's conditions: ${esc(E.REGIMES[TODAY].label.toLowerCase())}.<small>Annuities pay ${pc(per100 / y2020 - 1, 0)} more than in July 2020.</small>`;
  }

  // ---------- pickers ----------
  function renderPickers() {
    $('personas').innerHTML = E.PERSONAS.map((p) => `<button type="button" data-id="${p.id}" aria-pressed="${state.persona === p.id}" title="${esc(p.blurb)}. Essentials ${gbp(p.household.essentialSpending)} a year.">${esc(p.title.replace(/^The /, ''))}</button>`).join('')
      + `<button type="button" data-id="custom" aria-pressed="${state.persona === 'custom'}">Your own</button>`;
    $('personas').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.id === 'custom') { state.persona = 'custom'; $('yours').open = true; renderPickers(); return; }
      loadPersona(b.dataset.id); renderPickers(); run();
    }));
    const pot = num('pot');
    $('pots').innerHTML = E.POT_SIZES.map((p) => `<button type="button" data-pot="${p}" aria-pressed="${pot === p}">${gbpk(p)}</button>`).join('');
    $('pots').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { setVal('pot', b.dataset.pot); renderPickers(); run(); }));
    $('regimes').innerHTML = Object.entries(E.REGIMES).map(([k, r]) => `<button type="button" data-k="${k}" aria-pressed="${state.regime === k}">${r.short}<span class="num">${E.regimeYears(k).length}</span>${k === TODAY ? '<span class="tag">now</span>' : ''}</button>`).join('');
    $('regimes').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setRegime(b.dataset.k)));
    const p = E.PERSONAS.find((x) => x.id === state.persona);
    const n = E.regimeYears(state.regime).length;
    $('regime-note').textContent = (p ? `${p.blurb}. Essentials ${gbp(p.household.essentialSpending)} a year. ` : 'Your own household. ')
      + (state.regime === 'all'
        ? 'Futures stitch together random five-year stretches of UK history since 1900.'
        : `${E.REGIMES[state.regime].label}. Each future opens with a real decade from one of the ${n} matching years, then random history.`);
  }
  function setRegime(k) { state.regime = k; renderPickers(); run(); }

  // ---------- main run ----------
  let last = null, runToken = 0;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const setStatus = (t) => { $('status').textContent = t; };

  async function run() {
    const token = ++runToken;
    save();
    const h = E.withDefaults(readHousehold());
    const s = settings();
    const B = basis();
    setStatus('Simulating 2,000 futures');
    await tick(); if (token !== runToken) return;
    const horizon = Math.max(30, 112 - Math.min(h.person.age, h.partner?.age ?? 200));
    const scen = E.bootstrapScenarios({ n: 2000, horizon, fromYear: 1900, adj: { equity: s.equityAdj }, startYears: state.regime === 'all' ? null : E.regimeYears(state.regime) });
    const paths = E.buildPaths(h, scen);
    const sim = { statePensionUprating: s.spPolicy };
    const strategies = E.strategySet(h).map((o) => (o.drawdown ? { ...o, drawdown: { ...o.drawdown, fee: s.fee } } : o));
    const results = strategies.map((o) => ({ ...E.simulateOption(o, h, paths, B, sim).summary, short: o.short, tagline: o.tagline, allAnnuity: !!o.annuities?.some((a) => a.share === 1) }));
    last = { h, s, B, scen, paths, strategies, results };
    if (!strategies.some((o) => o.id === state.selected)) state.selected = 'four-percent';
    renderBoard();
    renderFan();
    await tick(); if (token !== runToken) return;

    setStatus('Working out notes');
    renderIdeas(E.insights(h, scen, B, { fee: s.fee, toAge: s.toAge }));
    await tick(); if (token !== runToken) return;

    setStatus('Trying other pot sizes');
    renderMatrix(E.potMatrix(h, scen.slice(0, 500), B, { settings: sim }));
    await tick(); if (token !== runToken) return;

    setStatus('Replaying history since 1900');
    renderBacktestOptions();
    renderBacktest();
    renderSafeMax();
    renderTab();
    setStatus(`${paths.length.toLocaleString('en-GB')} simulated lifetimes · ${state.regime === 'all' ? 'all history' : E.REGIMES[state.regime].short.toLowerCase()}${quotes.length ? ' · anchored to your quote' : ''}`);
  }

  // ---------- board ----------
  const refAge = () => Math.max(85, last.h.person.age + 10);
  const sfClass = (v) => (v < 0.1 ? 'good' : v < 0.3 ? 'caution' : 'bad');
  function fanSpark(r, ymax, ess) {
    const ys = r.byYear.filter((b) => b.age <= 100);
    const W = 150, H = 34, x = (i) => (i / (ys.length - 1)) * W, y = (v) => H - 2 - (Math.min(v, ymax) / ymax) * (H - 4);
    const top = ys.map((b, i) => `${x(i).toFixed(1)} ${y(b.income.upside).toFixed(1)}`);
    const bot = ys.map((b, i) => `${x(i).toFixed(1)} ${y(b.income.prudent).toFixed(1)}`).reverse();
    const mid = ys.map((b, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(b.income.likely).toFixed(1)).join(' ');
    const a = css('--accent-ink');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" style="display:block">
      <path d="M${top.join(' L')} L${bot.join(' L')} Z" fill="${rgba(a, 0.2)}"></path>
      ${ess > 0 ? `<line x1="0" x2="${W}" y1="${y(ess).toFixed(1)}" y2="${y(ess).toFixed(1)}" stroke="${css('--ink-3')}" stroke-dasharray="3 3" stroke-width="1"></line>` : ''}
      <path d="${mid}" fill="none" stroke="${a}" stroke-width="1.5"></path></svg>`;
  }
  function renderBoard() {
    const { h, results } = last;
    const age = refAge();
    document.querySelectorAll('.ref-age').forEach((el) => { el.textContent = age; });
    const at = (r) => r.byYear.find((b) => b.age === age)?.income ?? {};
    const ymax = Math.max(...results.flatMap((r) => r.byYear.filter((y) => y.age <= 100).map((y) => y.income.upside)));
    const ess = h.essentialSpending;
    const bestLikely = [...results].sort((a, b) => (at(b).likely ?? 0) - (at(a).likely ?? 0))[0];
    const bestPrudent = [...results].sort((a, b) => (at(b).prudent ?? 0) - (at(a).prudent ?? 0))[0];
    const safest = [...results].sort((a, b) => a.pShortfallAfterStatePension - b.pShortfallAfterStatePension)[0];
    const people = h.partner ? `${h.person.age} and ${h.partner.age}` : `${h.person.age}`;
    $('board-h').textContent = `${bestLikely.short} gives the most likely income at ${age} (${gbpk(at(bestLikely).likely)}); ${bestPrudent.short.toLowerCase()} the best bad case (${gbpk(at(bestPrudent).prudent)})${ess > 0 ? `; ${safest.short.toLowerCase()} falls short of essentials least (${pc(safest.pShortfallAfterStatePension, 0)})` : ''}.`;
    $('board-sub').textContent = `${gbp(h.pensionPot)} pot at ${people}. Prudent is the 1 in 10 bad outcome, likely the middle, upside the 1 in 10 good outcome. Select a row to chart it and replay it through history.`;
    $('board').innerHTML = `<thead><tr><th>Strategy</th><th>Now to 100</th><th>Year 1</th><th>Prudent</th><th>Likely</th><th>Upside</th>${ess > 0 ? '<th>Below essentials</th>' : ''}<th>Pot runs dry</th><th>Leaves</th></tr></thead><tbody>${results.map((r) => {
      const y = at(r);
      const dry = r.allAnnuity || r.investedAtStart <= 0 ? '<span class="pill">n/a</span>' : `<span class="pill ${r.pDepleted < 0.05 ? 'good' : r.pDepleted < 0.2 ? 'caution' : 'bad'}">${pc(r.pDepleted, 0)}</span>`;
      return `<tr class="pick" data-id="${r.id}" tabindex="0" aria-selected="${state.selected === r.id}"><td><span class="name">${esc(r.short)}</span><span class="gloss">${esc(r.tagline)}</span></td>
        <td>${fanSpark(r, ymax, ess)}</td><td>${gbpk(r.firstYearIncome.likely)}</td><td>${gbpk(y.prudent)}</td><td><b>${gbpk(y.likely)}</b></td><td>${gbpk(y.upside)}</td>
        ${ess > 0 ? `<td><span class="pill ${sfClass(r.pShortfallAfterStatePension)}">${pc(r.pShortfallAfterStatePension, 0)}</span></td>` : ''}<td>${dry}</td><td>${gbpk(r.legacy.likely)}</td></tr>`;
    }).join('')}</tbody>`;
    $('board').querySelectorAll('tr.pick').forEach((tr) => {
      const go = () => selectStrategy(tr.dataset.id);
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  function renderFan() {
    const { h, results } = last;
    const r = results.find((x) => x.id === state.selected);
    const age = refAge();
    const y85 = r.byYear.find((b) => b.age === age)?.income ?? {};
    const ys = r.byYear.filter((b) => b.age <= 100);
    const a = css('--accent-ink');
    const ess = h.essentialSpending;
    const ds = [
      { label: 'upside', data: ys.map((b) => b.income.upside), borderColor: 'transparent', pointRadius: 0, fill: false },
      { label: 'prudent', data: ys.map((b) => b.income.prudent), borderColor: 'transparent', backgroundColor: rgba(a, 0.14), pointRadius: 0, fill: '-1' },
      { label: 'good', data: ys.map((b) => b.income.good), borderColor: 'transparent', pointRadius: 0, fill: false },
      { label: 'cautious', data: ys.map((b) => b.income.cautious), borderColor: 'transparent', backgroundColor: rgba(a, 0.26), pointRadius: 0, fill: '-1' },
      { label: 'likely', data: ys.map((b) => b.income.likely), borderColor: a, borderWidth: 2, pointRadius: 0, fill: false },
    ];
    if (ess > 0) ds.push({ label: 'essentials', data: ys.map(() => ess), borderColor: css('--ink-3'), borderDash: [5, 4], borderWidth: 1, pointRadius: 0, fill: false });
    const o = baseOptions({ xTitle: 'Your age' });
    o.plugins.tooltip.filter = (c) => ['upside', 'likely', 'prudent', 'essentials'].includes(c.dataset.label);
    o.plugins.tooltip.callbacks = {
      title: (it) => `Age ${it[0].label}`,
      label: (c) => ({ upside: 'Upside', likely: 'Likely', prudent: 'Prudent', essentials: 'Essentials' }[c.dataset.label] + '  ' + gbp(c.parsed.y)),
      footer: (it) => `alive in ${pc(ys[it[0].dataIndex].alive, 0)} of futures`,
    };
    chart('ch-fan', { type: 'line', data: { labels: ys.map((b) => b.age), datasets: ds }, options: o });
    $('fan-h').textContent = `${r.short}: likely ${gbpk(y85.likely)} a year at ${age}, 1 in 10 futures below ${gbpk(y85.prudent)}, 1 in 10 above ${gbpk(y85.upside)}.`;
    $('fan-key').innerHTML = `<span><i style="background:${rgba(a, 0.14)}"></i>8 in 10 futures</span><span><i style="background:${rgba(a, 0.26)}"></i>middle half</span><span><i style="background:${a};height:2px"></i>likely</span>${ess > 0 ? `<span><i style="border-top:1px dashed ${css('--ink-3')};height:0"></i>essentials ${gbpk(ess)}</span>` : ''}`;
    const ann = r.annuities.map((x) => `${gbp(x.purchase)} buys ${E.describeSpec(x.spec)} at ${gbp(x.income)} a year`).join('; ');
    $('fan-sub').textContent = `${ann ? ann + '. ' : ''}${gbp(r.investedAtStart)} stays invested. Income steps down where one partner dies and their State Pension stops.`;
  }

  function selectStrategy(id, scroll) {
    state.selected = id;
    save();
    document.querySelectorAll('#board tr.pick').forEach((tr) => tr.setAttribute('aria-selected', String(tr.dataset.id === id)));
    $('bt-option').value = id;
    renderFan();
    renderBacktest();
    if (scroll) document.querySelector(`#board tr[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------- notes ----------
  function renderIdeas(list) {
    $('ideas').innerHTML = list.map((i, k) => `<article class="note"><span class="lbl">${esc(i.kicker)}</span><h3>${esc(i.headline)}</h3><p>${esc(i.body)}</p>${i.tryIt ? `<button type="button" data-k="${k}">${esc(i.tryIt.label)}</button>` : ''}</article>`).join('');
    $('ideas').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const t = list[+b.dataset.k].tryIt;
      if (t.regime) setRegime(t.regime);
      else if (t.fee != null) { setVal('fee', (t.fee * 100).toFixed(2)); markCustom(); run(); }
      else if (t.ageDelta) { setVal('p-age', num('p-age') + t.ageDelta); if ($('couple').checked) setVal('q-age', num('q-age') + t.ageDelta); markCustom(); run(); }
      else if (t.strategy) selectStrategy(t.strategy, true);
      else if (t.deepDive) { openTab(t.deepDive); $('tabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }));
  }
  function markCustom() { state.persona = 'custom'; renderPickers(); }

  // ---------- pot matrix ----------
  function renderMatrix(m) {
    const { h } = last;
    const age = Math.max(h.person.age + 10, 75);
    const all = m.flatMap((r) => r.cells.map((c) => c.likely ?? 0));
    const max = Math.max(...all), min = Math.min(...all);
    const sp = h.person.statePension + (h.partner?.statePension ?? 0);
    const small = m[0].cells.map((c) => c.likely), big = m[m.length - 1].cells.map((c) => c.likely);
    const spread = (xs) => Math.max(...xs) - Math.min(...xs);
    $('mx-h').textContent = `At ${gbpk(m[0].pot)} the strategies sit within ${gbpk(spread(small))} of each other; at ${gbpk(m[m.length - 1].pot)} the gap is ${gbpk(spread(big))}. The bigger the pot, the more the choice matters.`;
    $('matrix-note').textContent = `Likely net household income at age ${age}, with the 1 in 10 bad outcome underneath. State Pension${h.partner ? 's' : ''} supply ${gbp(sp)} of every figure once paid.`;
    const ids = m[0].cells.map((c) => c.id);
    $('tbl-matrix').innerHTML = `<thead><tr><th>Strategy</th>${m.map((r) => `<th${r.pot === h.pensionPot ? ' style="color:var(--accent-ink)"' : ''}>${gbpk(r.pot)}</th>`).join('')}</tr></thead><tbody>${ids.map((id) => `<tr><td><span class="name">${esc(m[0].cells.find((c) => c.id === id).short)}</span></td>${m.map((r) => {
      const c = r.cells.find((x) => x.id === id);
      const t = max > min ? (c.likely - min) / (max - min) : 0;
      return `<td class="cell2" style="background:color-mix(in srgb, var(--accent) ${(3 + t * 27).toFixed(0)}%, var(--panel))"><b>${gbp(c.likely)}</b><span>prudent ${gbpk(c.prudent)}</span></td>`;
    }).join('')}</tr>`).join('')}</tbody>`;
  }

  // ---------- backtests ----------
  function renderBacktestOptions() {
    $('bt-option').innerHTML = last.strategies.map((o) => `<option value="${o.id}">${esc(o.short)}</option>`).join('');
    $('bt-option').value = state.selected;
  }
  function renderBacktest() {
    const { h, B, s, strategies } = last;
    const opt = strategies.find((o) => o.id === $('bt-option').value) ?? strategies[0];
    const bt = E.historicalBacktest(opt, h, B, { toAge: s.toAge });
    const measure = $('bt-measure').value;
    const n = Math.max(...bt.map((b) => b.income.length));
    const labels = Array.from({ length: n }, (_, t) => h.person.age + t);
    const bad = css('--bad'), a = css('--accent-ink'), grey = css('--grey');
    const inReg = (y) => state.regime === 'all' || E.REGIMES[state.regime].test(E.conditions(y));
    const ds = bt.map((b) => {
      const failed = b.depletedAge !== null, hit = inReg(b.startYear);
      return { label: String(b.startYear), data: measure === 'pot' ? b.pot : b.income, borderColor: failed ? rgba(bad, hit ? 0.85 : 0.3) : hit ? rgba(a, 0.5) : rgba(grey, 0.2), borderWidth: hit ? 1.3 : 1, pointRadius: 0, fill: false, failed, order: hit ? 0 : 1 };
    });
    const o = baseOptions({ xTitle: 'Your age', yTitle: measure === 'pot' ? 'Invested' : 'Net income' });
    o.interaction = { mode: 'nearest', intersect: false, axis: 'xy' };
    o.plugins.tooltip.callbacks = { title: (it) => `Retired in ${it[0].dataset.label}`, label: (c) => `Age ${c.label}  ${gbp(c.parsed.y)}${c.dataset.failed ? '  ran out' : ''}` };
    chart('ch-backtest', { type: 'line', data: { labels, datasets: ds }, options: o });
    const failed = bt.filter((b) => b.depletedAge !== null);
    const reg = bt.filter((b) => inReg(b.startYear)), regFail = reg.filter((b) => b.depletedAge !== null);
    const worst = [...bt].sort((x, y) => x.minIncome - y.minIncome)[0];
    $('bt-h').textContent = `${opt.short} lasted to ${s.toAge} in ${bt.length - failed.length} of ${bt.length} start years${state.regime !== 'all' ? `, and ${reg.length - regFail.length} of ${reg.length} that started ${E.REGIMES[state.regime].short.toLowerCase()}` : ''}.`;
    $('bt-figs').innerHTML = [
      ['Ran out', failed.length ? `${failed.length}` : 'none', failed.length ? `first ${failed.slice(0, 3).map((f) => f.startYear).join(', ')}` : 'every start year lasted'],
      ['Earliest failure', failed.length ? `age ${Math.min(...failed.map((f) => f.depletedAge))}` : 'n/a', 'red lines'],
      ['Lowest income', gbpk(worst.minIncome), `retired ${worst.startYear}`],
    ].map(([l, v, sub]) => `<div class="cell"><span class="lbl">${l}</span><span class="val">${v}</span><span class="sub">${sub}</span></div>`).join('');
  }
  function renderSafeMax() {
    const { h, B, s } = last;
    const sm = E.safeMaxByStartYear(h, B, { toAge: s.toAge, fee: s.fee });
    const rate = num('smax-rate') / 100;
    $('smax-val').textContent = pc(rate);
    const inReg = (y) => state.regime === 'all' || E.REGIMES[state.regime].test(E.conditions(y));
    const sorted = [...sm].sort((x, y) => x.rate - y.rate);
    const reg = sm.filter((x) => inReg(x.startYear)).map((x) => x.rate).sort((x, y) => x - y);
    const med = (xs) => xs[xs.length >> 1];
    $('sm-h').textContent = `Worst start ${sorted[0].startYear} allowed ${pc(sorted[0].rate, 2)}; the middle start year ${pc(med(sorted.map((x) => x.rate)), 1)}${state.regime !== 'all' ? `; ${E.REGIMES[state.regime].short.toLowerCase()} starts ${pc(med(reg), 1)}` : ''}. ${sm.filter((x) => x.rate < rate).length} of ${sm.length} fall below ${pc(rate)}.`;
    const o = baseOptions({ yMoney: false, xTitle: 'Year retirement started', legend: true });
    o.scales.y.ticks.callback = (v) => pc(v, 0);
    o.plugins.tooltip.callbacks = { title: (it) => `Retired in ${it[0].label}`, label: (c) => (c.dataset.type === 'line' ? `Comparing with ${pc(c.parsed.y)}` : `Safe maximum ${pc(c.parsed.y, 2)}`) };
    chart('ch-safemax', {
      type: 'bar',
      data: {
        labels: sm.map((x) => x.startYear),
        datasets: [
          { type: 'line', label: `${pc(rate)} line`, data: sm.map(() => rate), borderColor: css('--ink-2'), borderDash: [5, 4], borderWidth: 1, pointRadius: 0 },
          { label: state.regime === 'all' ? 'Start year' : `Started ${E.REGIMES[state.regime].short.toLowerCase()}`, data: sm.map((x) => (inReg(x.startYear) ? x.rate : null)), backgroundColor: css('--accent'), borderRadius: 2, grouped: false },
          ...(state.regime === 'all' ? [] : [{ label: 'Other years', data: sm.map((x) => (inReg(x.startYear) ? null : x.rate)), backgroundColor: rgba(css('--grey'), 0.4), borderRadius: 2, grouped: false }]),
        ],
      },
      options: o,
    });
  }

  // ---------- tabs ----------
  function openTab(t) {
    state.tab = t;
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    document.querySelectorAll('.tabpanel').forEach((p) => { p.hidden = p.id !== 'tab-' + t; });
    renderTab();
  }
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { openTab(b.dataset.tab); save(); }));
  function renderTab() {
    if (!last) return;
    ({ annuities: renderAnnuities, inflation: renderInflation, longevity: renderLongevity, gilts: renderGilts, all: renderAllOptions, method: renderHistorySummary })[state.tab]?.();
  }

  const SPEC_KEYS = Object.keys(E.SPECS);
  $('qt-spec').innerHTML = SPEC_KEYS.map((k) => `<option value="${k}">${esc(E.describeSpec(E.SPECS[k]))}</option>`).join('');
  $('qt-add').addEventListener('click', () => {
    const h = E.withDefaults(readHousehold());
    let income = num('qt-income'), provider = 'Your quote';
    const parsed = E.parseQuoteText($('qt-paste').value);
    if (!income && parsed.length) { const best = parsed.reduce((x, y) => (y.annualIncome > x.annualIncome ? y : x)); income = best.annualIncome; provider = best.provider; }
    if (!income) { $('qt-status').textContent = 'Enter the yearly income from a quote, or paste the results list.'; return; }
    const spec = E.SPECS[$('qt-spec').value];
    if (spec.life === 'joint' && !h.partner) { $('qt-status').textContent = 'That is a joint-life product. Add a partner under "Make it yours" first.'; return; }
    quotes = quotes.filter((q) => q.key !== $('qt-spec').value);
    quotes.push({ key: $('qt-spec').value, spec, purchase: h.pensionPot * (1 - h.tfcPct), lives: { age: h.person.age, spouseAge: h.partner?.age ?? h.person.age - 3 }, annualIncome: income, provider });
    $('qt-status').textContent = `Using ${provider}: ${gbp(income)} a year for ${E.describeSpec(spec)}${parsed.length ? ` (best of ${parsed.length} pasted)` : ''}.`;
    renderMarket(); run();
  });
  $('qt-clear').addEventListener('click', () => { quotes = []; $('qt-status').textContent = 'Back to model rates.'; renderMarket(); run(); });

  function renderAnnuities() {
    const { h, B } = last;
    const P = h.person, Q = h.partner;
    const purchase = h.pensionPot * (1 - h.tfcPct);
    const lives = { age: P.age, spouseAge: Q?.age ?? P.age - 3 };
    const rows = SPEC_KEYS.filter((k) => Q || E.SPECS[k].life !== 'joint').map((k) => ({ k, spec: E.SPECS[k], income: E.annuityIncome(purchase, E.SPECS[k], lives, B) }));
    const level = rows.find((r) => r.k === 'singleLevel').income, max = Math.max(...rows.map((r) => r.income));
    const cpi = rows.find((r) => r.k === 'singleCPI').income;
    const quoted = new Set(quotes.map((q) => q.key));
    $('ann-h').textContent = `${gbp(purchase)} buys ${gbp(level)} a year level, or ${gbp(cpi)} linked to CPI: protection from inflation costs ${pc(1 - cpi / level, 0)} of the starting income.`;
    $('tbl-annuities').innerHTML = `<thead><tr><th>Product, age ${P.age}${Q ? ` and ${Q.age}` : ''}</th><th>A year</th><th>A month</th><th>Per £100k</th><th>vs level single</th><th>Source</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(E.describeSpec(r.spec))}</td>
      <td><svg width="90" height="8" aria-hidden="true" style="vertical-align:middle;margin-right:8px"><rect x="0" y="0" width="${((r.income / max) * 90).toFixed(1)}" height="8" rx="2" fill="${css('--accent')}"></rect></svg>${gbp(r.income)}</td>
      <td>${gbp(r.income / 12)}</td><td>${gbp((r.income / purchase) * 100000)}</td><td>${r.k === 'singleLevel' ? 'base' : pc(r.income / level - 1)}</td>
      <td>${quoted.has(r.k) ? '<span class="pill good">your quote</span>' : quotes.length ? '<span class="pill caution">scaled to quote</span>' : '<span class="pill">live model</span>'}</td></tr>`).join('')}</tbody>`;
  }

  function renderInflation() {
    const { h, B } = last;
    const inf = num('infl') / 100;
    $('infl-val').textContent = pc(inf);
    const ip = E.inflationProtection(h, B, { life: h.partner ? 'joint' : 'single', survivorPct: 0.5, inflationRates: [inf] });
    const P = h.person;
    const labels = Array.from({ length: Math.min(36, 101 - P.age) }, (_, t) => P.age + t);
    const colors = { level: css('--amber'), fixed: css('--grey'), cpi: css('--accent-ink') };
    const ds = ['level', 'fixed', 'cpi'].map((kind) => {
      const p = ip.products.find((x) => x.spec.escalation.kind === kind);
      const g = { level: 0, fixed: 0.03, cpi: inf }[kind];
      return { label: p.name, data: labels.map((_, t) => (p.income * Math.pow(1 + g, t)) / Math.pow(1 + inf, t)), borderColor: colors[kind], backgroundColor: colors[kind], borderWidth: 2, pointRadius: 0 };
    });
    const o = baseOptions({ yTitle: "Today's money", legend: true });
    o.plugins.tooltip.callbacks = { title: (it) => `Age ${it[0].label}`, label: (c) => `${c.dataset.label}  ${gbp(c.parsed.y)}` };
    chart('ch-inflation', { type: 'line', data: { labels, datasets: ds }, options: o });
    const S = E.longevitySummary(P).curve;
    const sc = ip.scenarios[0];
    const cpiRow = sc.rows.find((r) => /CPI/.test(r.name));
    $('inf-h').textContent = `At ${pc(inf)} inflation the CPI-linked version pays more each year from ${cpiRow.crossAge ?? 'never'} and catches up in total by ${cpiRow.breakEvenRealAge ?? 'after 115'}${cpiRow.breakEvenRealAge ? `, an age ${pc(S[cpiRow.breakEvenRealAge - P.age] ?? 0, 0)} of people like you reach` : ''}.`;
    $('tbl-breakeven').innerHTML = `<thead><tr><th>At ${pc(inf)} inflation</th><th>Starts</th><th>vs level</th><th>Pays more from</th><th>Catches up by</th><th>Chance alive then</th><th>Worth at ${P.age + 20}</th></tr></thead><tbody>${sc.rows.map((r, i) => {
      const be = r.breakEvenRealAge, pa = be ? S[be - P.age] : null;
      return `<tr><td>${esc(r.name)}</td><td>${gbp(r.startIncome)}</td><td>${i ? pc(ip.costOfProtection[i].vsLevel) : 'base'}</td><td>${i ? r.crossAge ?? 'never' : ''}</td><td>${i ? be ?? 'after 115' : ''}</td><td>${i ? (pa != null ? `<span class="pill ${pa > 0.5 ? 'good' : pa > 0.25 ? 'caution' : 'bad'}">${pc(pa, 0)}</span>` : '<span class="pill bad">under 1%</span>') : ''}</td><td>${gbp(r.real[P.age + 20])}</td></tr>`;
    }).join('')}</tbody>`;
  }

  function renderLongevity() {
    const { h } = last;
    const P = h.person, Q = h.partner;
    const lp = E.longevitySummary(P), lq = Q ? E.longevitySummary(Q) : null, joint = Q ? E.jointSummary(P, Q) : null;
    $('lon-h').textContent = Q
      ? `On average you live to ${lp.lifeExpectancy.toFixed(0)}, but there is a 1 in 10 chance one of you is still alive when you would be ${(P.age + joint.lastSurvivorOneInTenYears).toFixed(0)}.`
      : `On average you live to ${lp.lifeExpectancy.toFixed(0)}, with a 1 in 10 chance of reaching ${lp.oneInTen.toFixed(0)}.`;
    $('found-figs').innerHTML = [
      ['You, average', lp.lifeExpectancy.toFixed(0), 'ONS 2022-based'],
      ['You, 1 in 10', lp.oneInTen.toFixed(0), 'reach this age'],
      lq && ['Partner, average', lq.lifeExpectancy.toFixed(0), `now ${Q.age}`],
      joint && ['Either of you, 1 in 10', (P.age + joint.lastSurvivorOneInTenYears).toFixed(0), 'in your years'],
    ].filter(Boolean).map(([l, v, sub]) => `<div class="cell"><span class="lbl">${l}</span><span class="val">${v}</span><span class="sub">${sub}</span></div>`).join('');
    const n = Math.min(45, 106 - P.age);
    const labels = Array.from({ length: n + 1 }, (_, t) => P.age + t);
    const ds = [{ label: 'You', data: lp.curve.slice(0, n + 1), borderColor: css('--accent-ink'), backgroundColor: css('--accent-ink'), borderWidth: 2, pointRadius: 0 }];
    if (Q) {
      ds.push({ label: `Partner (now ${Q.age})`, data: lq.curve.slice(0, n + 1), borderColor: css('--amber'), backgroundColor: css('--amber'), borderWidth: 2, pointRadius: 0 });
      ds.push({ label: 'At least one of you', data: joint.curve.slice(0, n + 1), borderColor: css('--grey'), backgroundColor: css('--grey'), borderWidth: 2, pointRadius: 0, borderDash: [5, 4] });
    }
    const o = baseOptions({ yMoney: false, xTitle: 'Your age', legend: true });
    o.scales.y.max = 1; o.scales.y.ticks.callback = (v) => pc(v, 0);
    o.plugins.tooltip.callbacks = { title: (it) => `When you are ${it[0].label}`, label: (c) => `${c.dataset.label}  ${pc(c.parsed.y, 0)} alive` };
    chart('ch-survival', { type: 'line', data: { labels, datasets: ds }, options: o });
  }

  function renderGilts() {
    const rate = parseFloat($('gilt-rate').value);
    const rows = E.SAMPLE_GILTS.map((g) => E.giltAfterTax(g, rate));
    const best = [...rows].sort((x, y) => y.grossEquivalent - x.grossEquivalent)[0];
    $('gilt-h').textContent = `${best.name} yields ${pc(best.grossYield, 2)} before tax; at a ${pc(rate, 0)} tax rate a savings account would need ${pc(best.grossEquivalent, 2)} to match it.`;
    $('tbl-gilts').innerHTML = `<thead><tr><th>Gilt</th><th>Matures</th><th>Price</th><th>Gross yield</th><th>After tax</th><th>Savings equivalent</th><th>Tax free share</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.name)} <span class="gloss" style="display:inline">${r.ticker}</span></td><td>${new Date(r.maturity).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</td><td>${r.price.toFixed(2)}</td><td>${pc(r.grossYield, 2)}</td><td>${pc(r.netYield, 2)}</td><td><b>${pc(r.grossEquivalent, 2)}</b></td><td>${pc(r.taxFreeShareOfReturn, 0)}</td></tr>`).join('')}</tbody>`;
  }

  function renderAllOptions() {
    const { h, B, s, paths } = last;
    const sub = paths.filter((_, i) => i % 2 === 0);
    const opts = E.defaultOptions(h).map((o) => (o.drawdown ? { ...o, drawdown: { ...o.drawdown, fee: s.fee } } : o));
    const res = opts.map((o) => ({ ...E.simulateOption(o, h, sub, B, { statePensionUprating: s.spPolicy }).summary, group: o.group }));
    const age = refAge();
    let group = null;
    $('tbl-compare').innerHTML = `<thead><tr><th>Option</th><th>Year 1</th><th>Prudent ${age}</th><th>Likely ${age}</th><th>Upside ${age}</th><th>Below essentials</th><th>Leaves</th></tr></thead><tbody>${res.map((r) => {
      const y = r.byYear.find((b) => b.age === age)?.income ?? {};
      const head = r.group !== group ? `<tr class="group"><td colspan="7">${esc(r.group)}</td></tr>` : '';
      group = r.group;
      return `${head}<tr><td>${esc(r.name)}</td><td>${gbpk(r.firstYearIncome.likely)}</td><td>${gbpk(y.prudent)}</td><td>${gbpk(y.likely)}</td><td>${gbpk(y.upside)}</td><td><span class="pill ${sfClass(r.pShortfallAfterStatePension)}">${pc(r.pShortfallAfterStatePension, 0)}</span></td><td>${gbpk(r.legacy.likely)}</td></tr>`;
    }).join('')}</tbody>`;
  }

  function renderHistorySummary() {
    const x = E.summariseHistory(E.historyFrom(1900));
    $('history-summary').textContent = `${x.years.replace('-', ' to ')}: UK equities returned ${pc(x.equityReal)} a year above inflation, gilts ${pc(x.bondsReal)}, cash ${pc(x.cashReal)}; inflation averaged ${pc(x.inflation)}. Worst equity year ${x.worstEquityYear.year} (${pc(x.worstEquityYear.equity, 0)}), worst gilt year ${x.worstBondYear.year} (${pc(x.worstBondYear.bonds, 0)}), highest inflation ${x.highestInflationYear.year} (${pc(x.highestInflationYear.inflation, 0)}). Market data fetched ${new Date(NOW.fetched).toLocaleString('en-GB')}.`;
  }

  // ---------- wiring ----------
  let timer = null;
  document.querySelectorAll('#yours input, #yours select').forEach((el) => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.persona = 'custom'; renderPickers(); run(); }, 400);
  }));
  $('bt-option').addEventListener('change', () => selectStrategy($('bt-option').value));
  $('bt-measure').addEventListener('change', () => last && renderBacktest());
  $('smax-rate').addEventListener('input', () => last && renderSafeMax());
  $('infl').addEventListener('input', () => last && renderInflation());
  $('gilt-rate').addEventListener('change', renderGilts);
  const rerender = () => { renderMarket(); if (last) { renderBoard(); renderFan(); renderBacktest(); renderSafeMax(); renderTab(); } };
  try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', rerender); } catch (e) { /* old browsers */ }
  new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  openTab(state.tab || 'annuities');
  renderMarket();
  renderPickers();
  run();
})();
