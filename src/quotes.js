// Using real quotes (e.g. from MoneyHelper's "Compare annuities" tool) instead of the model.
//
// MoneyHelper has no public API and sits behind bot protection, so quotes are entered (or
// pasted) by the person after running the tool themselves. Each quote re-anchors the model:
// the ratio quote/model is applied to products with the same escalation type, and the
// average ratio to everything else, so unquoted variations stay consistent with real prices.
import { annuityIncome, normaliseSpec } from './annuity.js';

// Pull "provider ... £x,xxx" lines out of pasted results. Best effort: always show the
// parsed rows for the person to check before using them.
const PROVIDERS = ['Aviva', 'Canada Life', 'Just', 'Legal & General', 'Legal and General', 'L&G', 'Scottish Widows', 'Standard Life', 'Royal London', 'Pension Insurance', 'Hodge', 'Rothesay', 'Phoenix', 'LV=', 'Wesleyan', 'Utmost'];
export function parseQuoteText(text) {
  const out = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/£\s?([\d,]+(?:\.\d{1,2})?)/);
    if (!m) continue;
    const amount = parseFloat(m[1].replace(/,/g, ''));
    const monthly = /month|pm\b|p\/m/i.test(line);
    const provider = PROVIDERS.find((p) => line.toLowerCase().includes(p.toLowerCase())) ?? line.slice(0, m.index).replace(/[^\w &=]/g, '').trim();
    out.push({ provider: provider || 'Unknown', annualIncome: monthly ? amount * 12 : amount, line });
  }
  return out;
}

// quotes: [{ spec, purchase, lives: { age, spouseAge }, annualIncome, provider }]
export function anchorBasis(basis, quotes) {
  if (!quotes?.length) return basis;
  const raw = { ...basis, quoteAdjust: undefined };
  const ratios = quotes.map((q) => {
    const spec = normaliseSpec(q.spec);
    return { kind: spec.escalation.kind, life: spec.life, ratio: q.annualIncome / annuityIncome(q.purchase, spec, q.lives, raw), quote: q };
  });
  const mean = (rs) => rs.reduce((a, r) => a + r.ratio, 0) / rs.length;
  const overall = mean(ratios);
  const quoteAdjust = (spec) => {
    const same = ratios.filter((r) => r.kind === spec.escalation.kind && r.life === spec.life);
    if (same.length) return mean(same);
    const kind = ratios.filter((r) => r.kind === spec.escalation.kind);
    return kind.length ? mean(kind) : overall;
  };
  return { ...basis, quoteAdjust, anchoredTo: ratios.map((r) => ({ provider: r.quote.provider, kind: r.kind, life: r.life, ratio: r.ratio })) };
}
