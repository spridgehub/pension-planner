/* Pension tax relief calculator (Retirement page) over the engine bundle (window.RE).
   User-facing text avoids dashes (INLAP rule). */
(function () {
  const E = window.RE;
  const $ = (id) => document.getElementById(id);
  if (!$('sec-relief') || !E.reliefPosition) return;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const gbp = (v) => (v == null || !isFinite(v) ? 'n/a' : (v < 0 ? '−' : '') + '£' + Math.round(Math.abs(v)).toLocaleString('en-GB'));
  const gbpk = (v) => (Math.abs(v) >= 1000 ? '£' + (v / 1000).toFixed(v % 1000 ? 1 : 0).replace(/\.0$/, '') + 'k' : gbp(v));
  const pc = (v) => (v == null || !isFinite(v) ? 'n/a' : Math.round(v * 100) + '%');
  const rgba = (color, a) => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = color; const h = c.fillStyle; if (!h.startsWith('#')) return color; const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const P = E.PENSION_2026;

  const R = { earn: 65000, other: 0, personal: 3250, employer: 3250, sac: 0, cb: 0, mpaa: false, method: 'personal', try: null, prior: P.prior.map((y) => ({ year: y.year, allowance: y.allowance, used: 6500, member: true })) };
  try { const s = JSON.parse(localStorage.getItem('pension-planner-relief-v1') || 'null'); if (s) Object.assign(R, s, { prior: s.prior ?? R.prior }); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem('pension-planner-relief-v1', JSON.stringify(R)); } catch (e) { /* ignore */ } };
  const FIELDS = { 'r-earn': 'earn', 'r-other': 'other', 'r-personal': 'personal', 'r-employer': 'employer', 'r-sac': 'sac', 'r-cb': 'cb' };
  for (const [id, k] of Object.entries(FIELDS)) $(id).value = R[k];
  $('r-mpaa').checked = R.mpaa;

  function renderPrior() {
    $('tbl-rprior').innerHTML = '<thead><tr><th>Tax year</th><th>Paid in (you + employer)</th><th>Allowance that year</th><th>Unused</th><th>Member</th></tr></thead><tbody>'
      + R.prior.map((y, i) => `<tr><td>${y.year}</td><td><input type="number" step="500" min="0" data-i="${i}" data-k="used" value="${y.used}" style="max-width:130px"></td><td><input type="number" step="500" min="10000" data-i="${i}" data-k="allowance" value="${y.allowance}" style="max-width:130px"></td><td>${y.member ? gbp(Math.max(0, y.allowance - y.used)) : '£0'}</td><td><input type="checkbox" data-i="${i}" data-k="member"${y.member ? ' checked' : ''}></td></tr>`).join('') + '</tbody>';
    $('tbl-rprior').querySelectorAll('input').forEach((el) => el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
      const y = R.prior[+el.dataset.i];
      y[el.dataset.k] = el.type === 'checkbox' ? el.checked : Math.max(0, parseFloat(el.value) || 0);
      clearTimeout(renderPrior.t); renderPrior.t = setTimeout(() => { save(); render(); if (el.type === 'checkbox') renderPrior(); }, 300);
    }));
  }

  let chart = null;
  function render() {
    const r = E.reliefPosition({ earnings: R.earn, otherIncome: R.other, sacrifice: R.sac, employer: R.employer, personal: R.personal, childBenefit: R.cb, mpaa: R.mpaa, prior: R.prior, method: R.method });
    const n = r.now, room = Math.max(0, n.aa + r.carry - n.inputs);
    const limitBy = r.maxRelieved < room - 1 ? (R.method === 'personal' ? `your earnings (relief is limited to 100% of them${R.earn - R.sac < P.noEarningsCap ? ', or £3,600' : ''})` : 'the salary left to sacrifice') : 'your annual allowance';
    $('r-h').textContent = r.maxRelieved > 0
      ? `You could pay up to ${gbp(r.maxRelieved)} more into pensions this tax year with tax relief, limited by ${limitBy}.`
      : `You have no tax-relieved pension room left this year${n.room < 0 ? `: you are ${gbp(-n.room)} over your allowance, which brings a tax charge` : ''}.`;
    $('r-sub').textContent = `Allowance ${gbp(n.aa)}${r.tapered ? ' (tapered)' : R.mpaa ? ' (Money Purchase Annual Allowance)' : ''} plus ${gbp(r.carry)} carried forward, less ${gbp(n.inputs)} already paid in by you and your employer. Information, not advice; check carry forward with HMRC's calculator before paying in large sums.`;
    $('r-kpis').innerHTML = [
      ['Annual allowance', gbp(n.aa), r.tapered ? `tapered: adjusted income ${gbp(n.adjusted)}` : R.mpaa ? 'MPAA after flexible access' : 'standard £60,000'],
      ['Carry forward', gbp(r.carry), R.mpaa ? 'not allowed after flexible access' : 'unused from the last 3 years'],
      ['Paid in so far', gbp(n.inputs), 'you (gross), employer and sacrifice'],
      ['Room left', gbp(room), n.room < 0 ? 'over the allowance' : 'before any tax charge'],
      ['Your top rate', pc(E.marginalRate(n.ani)), `adjusted net income ${gbp(n.ani)}`],
    ].map(([l, v, s]) => `<div class="cell"><span class="lbl">${l}</span><span class="val">${v}</span><span class="sub">${s}</span></div>`).join('');

    const traps = [];
    if (r.paTrap > 0) traps.push(['Losing your personal allowance', `Your adjusted net income is over £100,000, so you lose £1 of personal allowance for every £2 above it: an effective 60% tax rate. Paying ${gbp(r.paTrap)} more into a pension brings it back to £100,000 and gets relief at about 60% on that slice.`]);
    if (r.cbTrap > 0) traps.push(['High Income Child Benefit Charge', `Over £60,000 of adjusted net income, Child Benefit is clawed back (all of it at £80,000). ${gbp(r.cbTrap)} into a pension would bring you back to £60,000 and keep it.`]);
    if (r.tapered) traps.push(['Tapered allowance', `Threshold income ${gbp(n.threshold)} and adjusted income ${gbp(n.adjusted)} cut your allowance to ${gbp(n.aa)}. Personal contributions lower threshold income; if they take it to £200,000 or below the taper falls away. Salary sacrifice does not.`]);
    if (R.mpaa) traps.push(['Money Purchase Annual Allowance', 'Having drawn taxable income flexibly, you can pay only £10,000 a year into defined contribution pensions with relief, and cannot carry forward.']);
    if (n.room < 0) traps.push(['Annual allowance charge', `Inputs over the allowance and carry forward are taxed at your top rate, which removes the relief. You are ${gbp(-n.room)} over.`]);
    $('r-traps').innerHTML = traps.map(([h, p]) => `<div class="callout"><strong>${esc(h)}</strong><span>${esc(p)}</span></div>`).join('');
    $('r-traps').hidden = !traps.length;

    // the amount to try
    document.querySelectorAll('#r-method button').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.v === R.method)); b.onclick = () => { R.method = b.dataset.v; R.try = null; save(); render(); }; });
    const max = Math.max(5000, Math.ceil(Math.max(r.maxRelieved * 1.25, room) / 500) * 500);
    if (R.try == null) R.try = Math.round(Math.min(r.maxRelieved, Math.max(r.paTrap, r.cbTrap) || Math.min(r.maxRelieved, 10000)) / 100) * 100;
    R.try = Math.min(R.try, max);
    $('r-try').max = max; $('r-try').value = R.try; $('r-try-num').value = R.try;
    $('r-try-val').textContent = gbp(R.try);
    const s = r.saving(R.try);
    const viaProvider = R.method === 'personal' ? 0.2 * Math.min(R.try, r.reliefCap) : 0;
    const viaReturn = Math.max(0, s.taxSaved - viaProvider);
    const rate = R.try ? (s.taxSaved + s.niSaved - s.charge) / R.try : 0;
    $('r-result').innerHTML = (R.method === 'personal' ? [
      ['You pay', gbp(R.try - viaProvider), `your provider adds ${gbp(viaProvider)} (20%)`],
      ['Reclaim on your tax return', gbp(viaReturn), viaReturn > 0 ? 'higher-rate relief and allowance traps' : 'nothing more to claim'],
    ] : [
      ['Salary given up', gbp(R.try), 'goes in as an employer contribution'],
      ['NI saved', gbp(s.niSaved), 'employee National Insurance'],
    ]).concat([
      ['Total relief', gbp(s.taxSaved + s.niSaved - s.charge), s.charge > 0 ? `after a ${gbp(s.charge)} allowance charge` : `${pc(rate)} of what goes in`],
      ['Real cost to you', gbp(s.netCost), `for ${gbp(R.try)} in your pension`],
      ['Income after it', gbp(s.ani), `adjusted net income, top rate ${pc(E.marginalRate(s.ani))}`],
    ]).map(([l, v, sub]) => `<div class="cell"><span class="lbl">${l}</span><span class="val">${v}</span><span class="sub">${sub}</span></div>`).join('');

    // relief rate per slice
    const good = css('--accent-ink'), bad = css('--bad'), grey = css('--grey'), hi = css('--good');
    const cfg = { type: 'bar', data: { labels: r.slices.map((x) => `${gbpk(x.from)} to ${gbpk(x.to)}`), datasets: [{ label: 'Relief', data: r.slices.map((x) => x.rate),
      backgroundColor: r.slices.map((x) => (!x.inside ? (x.rate < 0.05 ? bad : grey) : x.rate > 0.5 ? hi : good)), borderRadius: 3, borderSkipped: 'start' }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: css('--raised'), titleColor: css('--ink-1'), bodyColor: css('--ink-2'), borderColor: css('--rule-strong'), borderWidth: 1, callbacks: { label: (c) => `Relief ${pc(c.parsed.y)} on this slice${r.slices[c.dataIndex].inside ? '' : ' (over your limit)'}` } } },
        scales: { x: { ticks: { color: css('--ink-3'), maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { family: css('--font-num'), size: 10 } }, grid: { display: false } },
          y: { min: 0, max: 0.7, ticks: { color: css('--ink-3'), callback: (v) => pc(v), font: { family: css('--font-num'), size: 11 } }, grid: { color: css('--rule') } } } } };
    if (chart) chart.destroy();
    chart = new Chart($('ch-relief'), cfg);
    $('r-key').innerHTML = `<span><i style="background:${hi}"></i>60%+ (allowance traps)</span><span><i style="background:${good}"></i>within your limits</span><span><i style="background:${grey}"></i>over the limit</span><span>Bars show tax${R.method === 'sacrifice' ? ' and NI' : ''} saved per £1 on each slice.</span>`;

    // alternatives
    const full = r.maxRelieved < 1000;
    $('r-alt-h').textContent = full ? 'You have hit your limits: other tax-efficient options' : 'Once pension room runs out';
    $('r-alts').innerHTML = [
      ['ISA, £20,000 a year', 'Growth and income tax-free, and money can come out any time. From April 2027 under-65s can hold at most £12,000 of it in cash.'],
      ['Lifetime ISA (age 18 to 39)', '£4,000 a year with a 25% government bonus, for a first home or from age 60. A 25% charge applies to other withdrawals.'],
      ['Low-coupon gilts', 'Bought below 100, most of the return is a gain free of Capital Gains Tax. <a href="#sec-gilts">Use the gilt calculator</a>.'],
      ['Your partner\'s pension', 'A partner with unused allowance or a lower tax rate can contribute; up to £3,600 gross a year even with no earnings.'],
      ['Premium Bonds, up to £50,000', 'Prizes are tax-free; the prize rate is an average, not a guaranteed return.'],
      ['VCTs and EIS (high risk)', '30% income tax relief (VCT dividends tax-free; EIS gains free of CGT) for investing in small, risky companies. Usually for experienced investors with advice.'],
    ].map(([h, p]) => `<div class="note"><h3>${h}</h3><p>${p}</p></div>`).join('');
  }

  for (const [id, k] of Object.entries(FIELDS)) $(id).addEventListener('input', () => { R[k] = Math.max(0, parseFloat($(id).value) || 0); R.try = null; clearTimeout(render.t); render.t = setTimeout(() => { save(); render(); }, 300); });
  $('r-mpaa').addEventListener('change', () => { R.mpaa = $('r-mpaa').checked; R.try = null; save(); render(); });
  $('r-try').addEventListener('input', () => { R.try = +$('r-try').value; clearTimeout(render.t2); render.t2 = setTimeout(() => { save(); render(); }, 60); });
  $('r-try-num').addEventListener('input', () => { R.try = Math.max(0, parseFloat($('r-try-num').value) || 0); clearTimeout(render.t2); render.t2 = setTimeout(() => { save(); render(); }, 300); });
  renderPrior();
  render();
  try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', render); } catch (e) { /* old browsers */ }
})();
