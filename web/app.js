/* Pension Planner: UI over the engine bundle (window.RE). */
(function () {
  const E = window.RE;
  const $ = (id) => document.getElementById(id);
  const gbp = (v) => (v == null || !isFinite(v) ? '–' : '£' + Math.round(v).toLocaleString('en-GB'));
  const gbpk = (v) => (v == null || !isFinite(v) ? '–' : Math.abs(v) >= 1e6 ? '£' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'm' : '£' + Math.round(v / 1000) + 'k');
  const pc = (v, d = 1) => (v == null || !isFinite(v) ? '–' : (v * 100).toFixed(d) + '%');
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const alpha = (hex, a) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NOW = E.MARKET_NOW;
  const TODAY = E.todaysRegime(NOW);

  // ---------- state ----------
  const state = { persona: 'couple', regime: TODAY, selected: 'four-percent' };
  let quotes = [];
  const FIELDS = ['p-age', 'p-sex', 'p-health', 'p-sp', 'p-spa', 'couple', 'q-age', 'q-sex', 'q-health', 'q-sp', 'q-spa', 'pot', 'savings', 'tfc', 'db', 'essential', 'fee', 'eqadj', 'sppol', 'toage'];
  for (const id of ['p-health', 'q-health']) $(id).innerHTML = Object.entries(E.HEALTH).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  const setVal = (id, v) => { const el = $(id); if (el.type === 'checkbox') el.checked = !!v; else el.value = v; };
  const num = (id) => parseFloat($(id).value) || 0;

  function loadPersona(id) {
    const p = E.PERSONAS.find((x) => x.id === id);
    const h = p.household;
    state.persona = id;
    setVal('p-age', h.person.age); setVal('p-sex', h.person.sex); setVal('p-health', 'average');
    setVal('p-sp', 241.30); setVal('p-spa', h.person.statePensionAge ?? 67);
    setVal('couple', !!h.partner);
    if (h.partner) { setVal('q-age', h.partner.age); setVal('q-sex', h.partner.sex); setVal('q-health', 'average'); setVal('q-sp', 241.30); setVal('q-spa', h.partner.statePensionAge ?? 67); }
    setVal('pot', h.pensionPot); setVal('savings', h.otherSavings ?? 0); setVal('tfc', '0.25'); setVal('db', 0); setVal('essential', h.essentialSpending);
    quotes = [];
  }
  // Defaults for settings that personas do not set.
  setVal('fee', 0.6); setVal('eqadj', '0'); setVal('sppol', 'tripleLock'); setVal('toage', '95');
  loadPersona('couple');
  try {
    const saved = JSON.parse(localStorage.getItem('pension-planner-v2') || 'null');
    if (saved) {
      Object.assign(state, saved.state || {});
      for (const id of FIELDS) if (saved.f?.[id] != null) setVal(id, saved.f[id]);
    }
  } catch (e) { /* storage unavailable */ }
  const save = () => {
    try { localStorage.setItem('pension-planner-v2', JSON.stringify({ state, f: Object.fromEntries(FIELDS.map((id) => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value])) })); } catch (e) { /* ignore */ }
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
  function baseOptions({ yMoney = true, xTitle = 'Age', yTitle, legend = true, compact = false } = {}) {
    const ink2 = css('--ink-2'), line = css('--line');
    return {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: legend, labels: { color: ink2, boxWidth: 12, boxHeight: 8, font: { family: css('--f-body'), size: 12 } } },
        tooltip: { backgroundColor: css('--surface'), titleColor: css('--ink'), bodyColor: ink2, footerColor: css('--muted'), borderColor: line, borderWidth: 1, padding: 10, titleFont: { family: css('--f-body'), weight: '600' }, bodyFont: { family: css('--f-body') } },
      },
      scales: {
        x: { ticks: { color: css('--muted'), maxRotation: 0, autoSkipPadding: compact ? 18 : 12, font: { size: compact ? 10 : 12 } }, grid: { display: false }, border: { color: line }, title: { display: !compact && !!xTitle, text: xTitle, color: css('--muted') } },
        y: { ticks: { color: css('--muted'), maxTicksLimit: compact ? 4 : 8, font: { size: compact ? 10 : 12 }, callback: yMoney ? (v) => gbpk(v) : undefined }, grid: { color: line }, border: { display: false }, title: { display: !compact && !!yTitle, text: yTitle, color: css('--muted') }, beginAtZero: true },
      },
    };
  }

  // ---------- market band ----------
  function spark(values, { color }) {
    const vs = values.filter((v) => v != null);
    if (vs.length < 2) return '';
    const W = 160, H = 30, lo = Math.min(...vs), hi = Math.max(...vs), r = hi - lo || 1;
    const pts = values.map((v, i) => (v == null ? null : [(i / (values.length - 1)) * W, H - 3 - ((v - lo) / r) * (H - 6)])).filter(Boolean);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${W} ${H} L0 ${H} Z" fill="${alpha(color, 0.14)}"></path><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"></path><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${color}"></circle></svg>`;
  }
  function renderMarket() {
    const L = NOW.latest, M = NOW.monthly;
    const B = basis();
    const per100 = E.annuityIncome(100000, { life: 'single', escalation: { kind: 'level' } }, { age: 65 }, B);
    const per100cpi = E.annuityIncome(100000, { life: 'single', guaranteeYears: 5, escalation: { kind: 'cpi' } }, { age: 65 }, B);
    const y2020 = E.ANNUITY_HISTORY.find((a) => a.date === '2020-07').income;
    const minReal = Math.min(...M.map((m) => m.real20).filter((v) => v != null));
    const minRealMonth = M.find((m) => m.real20 === minReal)?.month;
    const yieldPct = E.historyPercentile('longYield', L.gilt10.value);
    const c = css('--s3');
    const ticks = [
      ['Bank Rate', pc(L.bankRate.value, 2), `Set by the Bank of England. Since 2019.`, spark(M.map((m) => m.bankRate), { color: c })],
      ['10-year gilt yield', pc(L.gilt10.value, 2), `Higher than in ${pc(yieldPct, 0)} of years since 1900`, spark(M.map((m) => m.gilt10), { color: c })],
      ['CPI inflation', pc(L.cpi.value, 1), `${new Date(L.cpi.date + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}. Target 2%`, spark(M.map((m) => m.cpi), { color: c })],
      ["Market's inflation forecast", pc(L.implied20.value, 2), '20-year, RPI basis. Inflation-linked income is priced on this', spark(M.map((m) => m.implied20), { color: c })],
      ['Real gilt yield', pc(L.real20.value, 2), `20-year, above inflation. It was ${pc(minReal, 1)} in ${minRealMonth ? new Date(minRealMonth + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'the trough'}`, spark(M.map((m) => m.real20), { color: c })],
      ['£100k buys at 65', gbp(per100), `a year, level. ${gbp(per100cpi)} if linked to CPI. July 2020: ${gbp(y2020)}`, ''],
    ];
    $('tickers').innerHTML = ticks.map(([l, b, ctx, s]) => `<div class="tick"><span class="lbl">${l}</span><b>${b}</b><span class="ctx">${ctx}</span>${s}</div>`).join('');
    $('asof').textContent = `to ${new Date(L.gilt10.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const ref = E.safeMaxByStartYear({ person: { age: 65 }, pensionPot: 100000, tfcPct: 0 }, B, { toAge: 95 });
    const like = ref.filter((x) => E.REGIMES.likeToday.test(E.conditions(x.startYear)));
    const low = ref.filter((x) => E.REGIMES.lowRates.test(E.conditions(x.startYear)));
    const ok = (g) => g.filter((x) => x.rate >= 0.04).length;
    $('verdict').textContent = TODAY === 'likeToday'
      ? `Today is a high-rate, moderate-inflation start. Since 1900, a 65-year-old's 4% plan begun in conditions like this lasted to 95 in ${ok(like)} of ${like.length} cases; begun with low rates, ${ok(low)} of ${low.length}. Annuities pay ${pc(per100 / y2020 - 1, 0)} more than in 2020.`
      : `Today's conditions: ${E.REGIMES[TODAY].label.toLowerCase()}. Annuities pay ${pc(per100 / y2020 - 1, 0)} more than in July 2020.`;
  }

  // ---------- pickers ----------
  function renderPickers() {
    $('personas').innerHTML = E.PERSONAS.map((p) => `<button type="button" class="persona" data-id="${p.id}" aria-pressed="${state.persona === p.id}"><span class="pot">${gbpk(p.household.pensionPot)}</span><strong>${esc(p.title)}</strong><span>${esc(p.blurb)}</span><span>Essentials ${gbp(p.household.essentialSpending)} a year</span></button>`).join('')
      + `<button type="button" class="persona" data-id="custom" aria-pressed="${state.persona === 'custom'}"><span class="pot">${state.persona === 'custom' ? gbpk(num('pot')) : 'You'}</span><strong>Your own</strong><span>Set your ages, pot and spending under "Make it yours" below</span></button>`;
    $('personas').querySelectorAll('.persona').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.id === 'custom') { state.persona = 'custom'; $('yours').open = true; $('yours').scrollIntoView({ behavior: 'smooth', block: 'start' }); renderPickers(); return; }
      loadPersona(b.dataset.id); renderPickers(); run();
    }));
    const pot = num('pot');
    $('pots').innerHTML = E.POT_SIZES.map((p) => `<button type="button" data-pot="${p}" aria-pressed="${pot === p}">${gbpk(p)}</button>`).join('');
    $('pots').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { setVal('pot', b.dataset.pot); renderPickers(); run(); }));
    $('regimes').innerHTML = Object.entries(E.REGIMES).map(([k, r]) => `<button type="button" data-k="${k}" aria-pressed="${state.regime === k}">${r.short}${k === TODAY ? '<span class="today">now</span>' : ''}</button>`).join('');
    $('regimes').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setRegime(b.dataset.k)));
    const n = E.regimeYears(state.regime).length;
    $('regime-note').textContent = state.regime === 'all'
      ? 'Futures are stitched together from random five-year stretches of UK history since 1900, crashes and booms included.'
      : `${E.REGIMES[state.regime].label}. Each simulated future opens with a real decade that began in one of the ${n} years like this since 1900, then carries on with random stretches of history.`;
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
    setStatus('Simulating 2,000 futures…');
    await tick(); if (token !== runToken) return;
    const horizon = Math.max(30, 112 - Math.min(h.person.age, h.partner?.age ?? 200));
    const scen = E.bootstrapScenarios({ n: 2000, horizon, fromYear: 1900, adj: { equity: s.equityAdj }, startYears: state.regime === 'all' ? null : E.regimeYears(state.regime) });
    const paths = E.buildPaths(h, scen);
    const sim = { statePensionUprating: s.spPolicy };
    const strategies = E.strategySet(h).map((o) => (o.drawdown ? { ...o, drawdown: { ...o.drawdown, fee: s.fee } } : o));
    const results = strategies.map((o) => ({ ...E.simulateOption(o, h, paths, B, sim).summary, short: o.short, tagline: o.tagline }));
    last = { h, s, B, scen, paths, strategies, results };
    if (!strategies.some((o) => o.id === state.selected)) state.selected = 'four-percent';
    renderRace();
    await tick(); if (token !== runToken) return;

    setStatus('Looking for things worth knowing…');
    renderIdeas(E.insights(h, scen, B, { fee: s.fee, toAge: s.toAge }));
    await tick(); if (token !== runToken) return;

    setStatus('Trying other pot sizes…');
    renderMatrix(E.potMatrix(h, scen.slice(0, 500), B, { settings: sim }));
    await tick(); if (token !== runToken) return;

    setStatus('Replaying history since 1900…');
    renderBacktestOptions();
    renderBacktest();
    renderSafeMax();
    renderDives();
    setStatus(`${paths.length.toLocaleString('en-GB')} simulated lifetimes, ${state.regime === 'all' ? 'drawn from all history' : E.REGIMES[state.regime].short.toLowerCase() + ' futures'}${quotes.length ? `, anchored to your quote` : ''}.`);
  }

  // ---------- race ----------
  const refAge = () => Math.max(85, last.h.person.age + 10);
  function renderRace() {
    const { h, results } = last;
    const age = refAge();
    document.querySelectorAll('.ref-age').forEach((el) => { el.textContent = age; });
    const people = h.partner ? `${h.person.age} and ${h.partner.age}` : `${h.person.age}`;
    $('race-title').textContent = `${results.length} ways to use ${gbp(h.pensionPot)} at ${people}`;
    const ymax = Math.max(...results.flatMap((r) => r.byYear.filter((y) => y.age <= 100).map((y) => y.income.upside)));
    const s1 = css('--s1');
    $('race-key').innerHTML = `<span><i style="background:${alpha(s1, 0.22)}"></i>8 in 10 futures</span><span><i style="background:${s1};height:3px"></i>Likely</span>${h.essentialSpending > 0 ? '<span><i style="border-top:2px dashed var(--ink-2);height:0"></i>Essential spending</span>' : ''}`;
    $('race').innerHTML = results.map((r) => {
      const y = r.byYear.find((b) => b.age === age)?.income ?? {};
      const sf = r.pShortfallAfterStatePension;
      const hasPot = r.investedAtStart > 0 && !last.strategies.find((o) => o.id === r.id).annuities?.some((a) => a.share === 1);
      return `<div class="runner" role="button" tabindex="0" data-id="${r.id}" aria-pressed="${state.selected === r.id}">
        <h3>${esc(r.short)}</h3><p class="tag">${esc(r.tagline)}</p>
        <div class="mini"><canvas aria-label="${esc(r.short)} income range"></canvas></div>
        <div class="trio"><div><span>Prudent</span><b>${gbpk(y.prudent)}</b></div><div><span>Likely</span><b>${gbpk(y.likely)}</b></div><div><span>Upside</span><b>${gbpk(y.upside)}</b></div></div>
        <div class="pills">
          ${h.essentialSpending > 0 ? `<span class="pill dot ${sf < 0.1 ? 'good' : sf < 0.3 ? 'warn' : 'crit'}">Short of essentials ${pc(sf, 0)}</span>` : ''}
          ${hasPot && r.pDepleted > 0.005 ? `<span class="pill dot ${r.pDepleted < 0.1 ? 'warn' : 'crit'}">Pot runs dry ${pc(r.pDepleted, 0)}</span>` : ''}
          <span class="pill">Leaves ${gbpk(r.legacy.likely)}</span>
        </div></div>`;
    }).join('');
    $('race').querySelectorAll('.runner').forEach((el) => {
      const r = results.find((x) => x.id === el.dataset.id);
      const ys = r.byYear.filter((b) => b.age <= 100);
      const ds = [
        { label: 'upside', data: ys.map((b) => b.income.upside), borderColor: 'transparent', pointRadius: 0, fill: false },
        { label: 'prudent', data: ys.map((b) => b.income.prudent), borderColor: 'transparent', backgroundColor: alpha(s1, 0.22), pointRadius: 0, fill: '-1' },
        { label: 'likely', data: ys.map((b) => b.income.likely), borderColor: s1, borderWidth: 2, pointRadius: 0, fill: false },
      ];
      if (h.essentialSpending > 0) ds.push({ label: 'essentials', data: ys.map(() => h.essentialSpending), borderColor: css('--ink-2'), borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false });
      const o = baseOptions({ legend: false, compact: true });
      o.scales.y.max = Math.ceil(ymax / 10000) * 10000;
      o.plugins.tooltip.callbacks = {
        title: (it) => `Age ${it[0].label}`,
        label: (c) => ({ upside: 'Upside', likely: 'Likely', prudent: 'Prudent', essentials: 'Essentials' }[c.dataset.label] + ': ' + gbp(c.parsed.y)),
        footer: (it) => `Still alive in ${pc(ys[it[0].dataIndex].alive, 0)} of futures`,
      };
      if (charts['race-' + r.id]) charts['race-' + r.id].destroy();
      charts['race-' + r.id] = new Chart(el.querySelector('canvas'), { type: 'line', data: { labels: ys.map((b) => b.age), datasets: ds }, options: o });
      const pick = () => selectStrategy(r.id, false);
      el.addEventListener('click', pick);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
  }

  function selectStrategy(id, scroll) {
    state.selected = id;
    save();
    document.querySelectorAll('.runner').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.id === id)));
    $('bt-option').value = id;
    renderBacktest();
    if (scroll) document.querySelector(`.runner[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------- ideas ----------
  function renderIdeas(list) {
    $('ideas').innerHTML = list.map((i, k) => `<article class="idea"><span class="kicker">${esc(i.kicker)}</span><h3>${esc(i.headline)}</h3><p>${esc(i.body)}</p>${i.tryIt ? `<button type="button" class="ghost" data-k="${k}">${esc(i.tryIt.label)}</button>` : ''}</article>`).join('');
    $('ideas').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const t = list[+b.dataset.k].tryIt;
      if (t.regime) { setRegime(t.regime); $('race-sec').scrollIntoView({ behavior: 'smooth' }); }
      else if (t.fee != null) { setVal('fee', (t.fee * 100).toFixed(2)); markCustom(); run(); }
      else if (t.ageDelta) { setVal('p-age', num('p-age') + t.ageDelta); if ($('couple').checked) setVal('q-age', num('q-age') + t.ageDelta); markCustom(); run(); $('race-sec').scrollIntoView({ behavior: 'smooth' }); }
      else if (t.strategy) selectStrategy(t.strategy, true);
      else if (t.deepDive) { const d = $('dive-' + t.deepDive); d.open = true; renderDives(); d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }));
  }
  function markCustom() { state.persona = 'custom'; renderPickers(); }

  // ---------- pot matrix ----------
  function renderMatrix(m) {
    const { h } = last;
    const age = Math.max(h.person.age + 10, 75);
    const max = Math.max(...m.flatMap((r) => r.cells.map((c) => c.likely ?? 0)));
    const min = Math.min(...m.flatMap((r) => r.cells.map((c) => c.likely ?? max)));
    $('matrix-note').textContent = `Likely net household income at age ${age} in today's money, with the 1-in-10 bad outcome underneath. Same people, same futures; only the pot changes. State Pension${h.partner ? 's' : ''} make up ${gbp(h.person.statePension + (h.partner?.statePension ?? 0))} of every figure once paid.`;
    const ids = m[0].cells.map((c) => c.id);
    const head = `<thead><tr><th>Strategy</th>${m.map((r) => `<th${r.pot === h.pensionPot ? ' style="color:var(--accent)"' : ''}>${gbpk(r.pot)} pot</th>`).join('')}</tr></thead>`;
    const body = ids.map((id) => {
      const name = m[0].cells.find((c) => c.id === id).short;
      return `<tr><td>${esc(name)}</td>${m.map((r) => {
        const c = r.cells.find((x) => x.id === id);
        const t = max > min ? (c.likely - min) / (max - min) : 0;
        return `<td class="cell" style="background:color-mix(in srgb, var(--s1) ${(4 + t * 26).toFixed(0)}%, var(--surface))"><b>${gbp(c.likely)}</b><span>prudent ${gbpk(c.prudent)}</span></td>`;
      }).join('')}</tr>`;
    }).join('');
    $('tbl-matrix').innerHTML = head + `<tbody>${body}</tbody>`;
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
    const P = h.person;
    const n = Math.max(...bt.map((b) => b.income.length));
    const labels = Array.from({ length: n }, (_, t) => P.age + t);
    const crit = css('--crit'), s1 = css('--s1'), muted = css('--muted');
    const inReg = (y) => E.REGIMES[state.regime].test(E.conditions(y));
    const ds = bt.map((b) => {
      const bad = b.depletedAge !== null, hit = state.regime === 'all' || inReg(b.startYear);
      return { label: String(b.startYear), data: measure === 'pot' ? b.pot : b.income, borderColor: bad ? alpha(crit, hit ? 0.8 : 0.3) : hit ? alpha(s1, 0.55) : alpha(muted, 0.18), borderWidth: hit ? 1.4 : 1, pointRadius: 0, fill: false, bad, order: hit ? 0 : 1 };
    });
    const o = baseOptions({ legend: false, xTitle: 'Your age', yTitle: measure === 'pot' ? "Invested, today's money" : "Net household income, today's money" });
    o.interaction = { mode: 'nearest', intersect: false, axis: 'xy' };
    o.plugins.tooltip.callbacks = { title: (it) => `Retired in ${it[0].dataset.label}`, label: (c) => `Age ${c.label}: ${gbp(c.parsed.y)}${c.dataset.bad ? ' (ran out)' : ''}` };
    chart('ch-backtest', { type: 'line', data: { labels, datasets: ds }, options: o });
    const failed = bt.filter((b) => b.depletedAge !== null);
    const reg = bt.filter((b) => inReg(b.startYear));
    const regFail = reg.filter((b) => b.depletedAge !== null);
    const worst = [...bt].sort((a, b) => a.minIncome - b.minIncome)[0];
    $('bt-title').textContent = `${opt.short}: every retirement since 1900`;
    $('bt-figs').innerHTML = [
      [`${bt.length - failed.length} of ${bt.length}`, `start years lasted to ${s.toAge}`],
      state.regime !== 'all' && [`${reg.length - regFail.length} of ${reg.length}`, `that started ${E.REGIMES[state.regime].short.toLowerCase()} lasted`],
      [failed.length ? failed.slice(0, 3).map((f) => f.startYear).join(', ') + (failed.length > 3 ? ` +${failed.length - 3}` : '') : 'None', 'ran out (red)'],
      [gbp(worst.minIncome), `lowest income in any year (retired ${worst.startYear})`],
    ].filter(Boolean).map(([b, sp]) => `<div class="fig"><b>${b}</b><span>${sp}</span></div>`).join('');
  }
  function renderSafeMax() {
    const { h, B, s } = last;
    const sm = E.safeMaxByStartYear(h, B, { toAge: s.toAge, fee: s.fee });
    const rate = num('smax-rate') / 100;
    $('smax-val').textContent = pc(rate);
    const s1 = css('--s1');
    const inReg = (y) => state.regime === 'all' || E.REGIMES[state.regime].test(E.conditions(y));
    const o = baseOptions({ yMoney: false, xTitle: 'Year retirement started' });
    o.scales.y.ticks.callback = (v) => pc(v, 0);
    o.plugins.tooltip.callbacks = { title: (it) => `Retired in ${it[0].label}`, label: (c) => (c.dataset.type === 'line' ? `Comparing with ${pc(c.parsed.y)}` : `Safe maximum ${pc(c.parsed.y, 2)}${c.parsed.y < rate ? `: ${pc(rate)} would have run out` : ''}`) };
    const below = sm.filter((x) => x.rate < rate);
    const regLabel = state.regime === 'all' ? 'Start year' : `Started ${E.REGIMES[state.regime].short.toLowerCase()}`;
    chart('ch-safemax', {
      type: 'bar',
      data: {
        labels: sm.map((x) => x.startYear),
        datasets: [
          { type: 'line', label: `${pc(rate)}: ${below.length} of ${sm.length} start years fall below`, data: sm.map(() => rate), borderColor: css('--ink'), borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 },
          { label: regLabel, data: sm.map((x) => (inReg(x.startYear) ? x.rate : null)), backgroundColor: s1, borderRadius: 2, grouped: false },
          ...(state.regime === 'all' ? [] : [{ label: 'Other years', data: sm.map((x) => (inReg(x.startYear) ? null : x.rate)), backgroundColor: alpha(css('--muted'), 0.35), borderRadius: 2, grouped: false }]),
        ],
      },
      options: o,
    });
  }

  // ---------- deep dives (rendered when open) ----------
  function renderDives() {
    if (!last) return;
    if ($('dive-annuities').open) renderAnnuities();
    if ($('dive-inflation').open) renderInflation();
    if ($('dive-longevity').open) renderLongevity();
    if ($('dive-gilts').open) renderGilts();
    if ($('dive-all').open) renderAllOptions();
    if ($('dive-method').open) renderHistorySummary();
  }
  document.querySelectorAll('details.dive').forEach((d) => d.addEventListener('toggle', () => d.open && renderDives()));

  const SPEC_KEYS = Object.keys(E.SPECS);
  $('qt-spec').innerHTML = SPEC_KEYS.map((k) => `<option value="${k}">${esc(E.describeSpec(E.SPECS[k]))}</option>`).join('');
  $('qt-add').addEventListener('click', () => {
    const h = E.withDefaults(readHousehold());
    let income = num('qt-income'), provider = 'Your quote';
    const parsed = E.parseQuoteText($('qt-paste').value);
    if (!income && parsed.length) { const best = parsed.reduce((a, b) => (b.annualIncome > a.annualIncome ? b : a)); income = best.annualIncome; provider = best.provider; }
    if (!income) { $('qt-status').textContent = 'Enter the yearly income from a quote, or paste the results list.'; return; }
    const spec = E.SPECS[$('qt-spec').value];
    if (spec.life === 'joint' && !h.partner) { $('qt-status').textContent = 'That is a joint-life product. Add a partner under "Make it yours" first.'; return; }
    quotes = quotes.filter((q) => q.key !== $('qt-spec').value);
    quotes.push({ key: $('qt-spec').value, spec, purchase: h.pensionPot * (1 - h.tfcPct), lives: { age: h.person.age, spouseAge: h.partner?.age ?? h.person.age - 3 }, annualIncome: income, provider });
    $('qt-status').textContent = `Using ${provider}: ${gbp(income)} a year for ${E.describeSpec(spec)}${parsed.length ? ` (best of ${parsed.length} pasted)` : ''}.`;
    run();
  });
  $('qt-clear').addEventListener('click', () => { quotes = []; $('qt-status').textContent = 'Back to model rates.'; run(); });

  function renderAnnuities() {
    const { h, B } = last;
    const P = h.person, Q = h.partner;
    const purchase = h.pensionPot * (1 - h.tfcPct);
    const lives = { age: P.age, spouseAge: Q?.age ?? P.age - 3 };
    const rows = SPEC_KEYS.filter((k) => Q || E.SPECS[k].life !== 'joint').map((k) => ({ k, spec: E.SPECS[k], income: E.annuityIncome(purchase, E.SPECS[k], lives, B) }));
    const level = rows.find((r) => r.k === 'singleLevel').income, max = Math.max(...rows.map((r) => r.income));
    const quoted = new Set(quotes.map((q) => q.key));
    $('tbl-annuities').innerHTML = `<thead><tr><th>Product (age ${P.age}${Q ? `, partner ${Q.age}` : ''}, ${gbp(purchase)} after tax-free cash)</th><th>Income a year</th><th>A month</th><th>Per £100k</th><th>vs level single</th><th>Source</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(E.describeSpec(r.spec))}</td>
      <td><svg width="100" height="10" aria-hidden="true" style="vertical-align:middle;margin-right:8px"><rect x="0" y="1" width="${((r.income / max) * 100).toFixed(1)}" height="8" rx="2" fill="var(--s1)"></rect></svg>${gbp(r.income)}</td>
      <td>${gbp(r.income / 12)}</td><td>${gbp((r.income / purchase) * 100000)}</td><td>${r.k === 'singleLevel' ? '<span class="muted">baseline</span>' : pc(r.income / level - 1)}</td>
      <td>${quoted.has(r.k) ? '<span class="pill dot good">Your quote</span>' : quotes.length ? '<span class="pill dot warn">Scaled to quote</span>' : '<span class="muted">Live model</span>'}</td></tr>`).join('')}</tbody>`;
  }

  function renderInflation() {
    const { h, B } = last;
    const inf = num('infl') / 100;
    $('infl-val').textContent = pc(inf);
    const ip = E.inflationProtection(h, B, { life: h.partner ? 'joint' : 'single', survivorPct: 0.5, inflationRates: [inf] });
    const P = h.person;
    const labels = Array.from({ length: Math.min(36, 101 - P.age) }, (_, t) => P.age + t);
    const colors = { level: css('--s2'), fixed: css('--s3'), cpi: css('--s1') };
    const ds = ['level', 'fixed', 'cpi'].map((kind) => {
      const p = ip.products.find((x) => x.spec.escalation.kind === kind);
      const g = { level: 0, fixed: 0.03, cpi: inf }[kind];
      return { label: p.name, data: labels.map((_, t) => (p.income * Math.pow(1 + g, t)) / Math.pow(1 + inf, t)), borderColor: colors[kind], backgroundColor: colors[kind], borderWidth: 2, pointRadius: 0 };
    });
    const o = baseOptions({ yTitle: "Income in today's money" });
    o.plugins.tooltip.callbacks = { title: (it) => `Age ${it[0].label}`, label: (c) => `${c.dataset.label}: ${gbp(c.parsed.y)}` };
    chart('ch-inflation', { type: 'line', data: { labels, datasets: ds }, options: o });
    const S = E.longevitySummary(P).curve;
    const sc = ip.scenarios[0];
    $('tbl-breakeven').innerHTML = `<thead><tr><th>At ${pc(inf)} average inflation</th><th>Starts at</th><th>vs level</th><th>Pays more each year from age</th><th>Total catches up by age</th><th>Chance you are alive then</th><th>Worth at ${P.age + 20}</th></tr></thead><tbody>${sc.rows.map((r, i) => {
      const be = r.breakEvenRealAge, pa = be ? S[be - P.age] : null;
      return `<tr><td>${esc(r.name)}</td><td>${gbp(r.startIncome)}</td><td>${i ? pc(ip.costOfProtection[i].vsLevel) : '<span class="muted">baseline</span>'}</td><td>${i ? r.crossAge ?? 'never' : '–'}</td><td>${i ? be ?? 'after 115' : '–'}</td><td>${i ? (pa != null ? `<span class="pill dot ${pa > 0.5 ? 'good' : pa > 0.25 ? 'warn' : 'crit'}">${pc(pa, 0)}</span>` : '<span class="pill dot crit">under 1%</span>') : '–'}</td><td>${gbp(r.real[P.age + 20])}</td></tr>`;
    }).join('')}</tbody>`;
  }

  function renderLongevity() {
    const { h } = last;
    const P = h.person, Q = h.partner;
    const lp = E.longevitySummary(P), lq = Q ? E.longevitySummary(Q) : null, joint = Q ? E.jointSummary(P, Q) : null;
    $('found-figs').innerHTML = [
      [lp.lifeExpectancy.toFixed(0), 'your average life expectancy'],
      [lp.oneInTen.toFixed(0), '1 in 10 chance you reach this age'],
      lq && [lq.lifeExpectancy.toFixed(0), "partner's average life expectancy"],
      joint && [(P.age + joint.lastSurvivorOneInTenYears).toFixed(0), '1 in 10 chance one of you is still alive when you would be this age'],
    ].filter(Boolean).map(([b, sp]) => `<div class="fig"><b>${b}</b><span>${sp}</span></div>`).join('');
    const n = Math.min(45, 106 - P.age);
    const labels = Array.from({ length: n + 1 }, (_, t) => P.age + t);
    const ds = [{ label: 'You', data: lp.curve.slice(0, n + 1), borderColor: css('--s1'), backgroundColor: css('--s1'), borderWidth: 2, pointRadius: 0 }];
    if (Q) {
      ds.push({ label: `Partner (now ${Q.age})`, data: lq.curve.slice(0, n + 1), borderColor: css('--s2'), backgroundColor: css('--s2'), borderWidth: 2, pointRadius: 0 });
      ds.push({ label: 'At least one of you', data: joint.curve.slice(0, n + 1), borderColor: css('--s3'), backgroundColor: css('--s3'), borderWidth: 2, pointRadius: 0, borderDash: [5, 4] });
    }
    const o = baseOptions({ yMoney: false, xTitle: 'Your age' });
    o.scales.y.max = 1; o.scales.y.ticks.callback = (v) => pc(v, 0);
    o.plugins.tooltip.callbacks = { title: (it) => `When you are ${it[0].label}`, label: (c) => `${c.dataset.label}: ${pc(c.parsed.y, 0)} chance alive` };
    chart('ch-survival', { type: 'line', data: { labels, datasets: ds }, options: o });
  }

  function renderGilts() {
    const rate = parseFloat($('gilt-rate').value);
    const rows = E.SAMPLE_GILTS.map((g) => E.giltAfterTax(g, rate));
    $('tbl-gilts').innerHTML = `<thead><tr><th>Gilt</th><th>Matures</th><th>Price</th><th>Yield before tax</th><th>After your tax</th><th>Savings rate needed to match</th><th>Return that is tax-free</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.name)} <span class="muted">${r.ticker}</span></td><td>${new Date(r.maturity).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</td><td>${r.price.toFixed(2)}</td><td>${pc(r.grossYield, 2)}</td><td>${pc(r.netYield, 2)}</td><td><b>${pc(r.grossEquivalent, 2)}</b></td><td>${pc(r.taxFreeShareOfReturn, 0)}</td></tr>`).join('')}</tbody>`;
  }

  function renderAllOptions() {
    const { h, B, s, paths } = last;
    const sub = paths.filter((_, i) => i % 2 === 0);
    const opts = E.defaultOptions(h).map((o) => (o.drawdown ? { ...o, drawdown: { ...o.drawdown, fee: s.fee } } : o));
    const res = opts.map((o) => ({ ...E.simulateOption(o, h, sub, B, { statePensionUprating: s.spPolicy }).summary, group: o.group }));
    const age = refAge();
    let group = null;
    $('tbl-compare').innerHTML = `<thead><tr><th>Option</th><th>First year</th><th>At ${age}: prudent</th><th>Likely</th><th>Upside</th><th>Short of essentials</th><th>Leaves (likely)</th></tr></thead><tbody>${res.map((r) => {
      const y = r.byYear.find((b) => b.age === age)?.income ?? {};
      const head = r.group !== group ? `<tr class="group"><td colspan="7">${esc(r.group)}</td></tr>` : '';
      group = r.group;
      return `${head}<tr><td>${esc(r.name)}</td><td>${gbp(r.firstYearIncome.likely)}</td><td>${gbp(y.prudent)}</td><td>${gbp(y.likely)}</td><td>${gbp(y.upside)}</td><td>${pc(r.pShortfallAfterStatePension, 0)}</td><td>${gbpk(r.legacy.likely)}</td></tr>`;
    }).join('')}</tbody>`;
  }

  function renderHistorySummary() {
    const x = E.summariseHistory(E.historyFrom(1900));
    $('history-summary').textContent = `Over ${x.years}: UK equities returned ${pc(x.equityReal)} a year above inflation, gilts ${pc(x.bondsReal)}, cash ${pc(x.cashReal)}; inflation averaged ${pc(x.inflation)}. Worst equity year ${x.worstEquityYear.year} (${pc(x.worstEquityYear.equity, 0)}), worst gilt year ${x.worstBondYear.year} (${pc(x.worstBondYear.bonds, 0)}), highest inflation ${x.highestInflationYear.year} (${pc(x.highestInflationYear.inflation, 0)}). Market data fetched ${new Date(NOW.fetched).toLocaleString('en-GB')}.`;
  }

  // ---------- wiring ----------
  let timer = null;
  document.querySelectorAll('#yours input, #yours select').forEach((el) => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.persona = 'custom'; renderPickers(); run(); }, 400);
  }));
  $('bt-option').addEventListener('change', () => selectStrategy($('bt-option').value, false));
  $('bt-measure').addEventListener('change', () => last && renderBacktest());
  $('smax-rate').addEventListener('input', () => last && renderSafeMax());
  $('infl').addEventListener('input', () => last && renderInflation());
  $('gilt-rate').addEventListener('change', renderGilts);
  const rerender = () => { renderMarket(); if (last) run(); };
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender); } catch (e) { /* old browsers */ }
  new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  renderMarket();
  renderPickers();
  run();
})();
