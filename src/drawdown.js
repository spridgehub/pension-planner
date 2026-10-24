// Withdrawal rules. Each returns { first(state), next(state) } giving the nominal amount to
// withdraw at the start of a year. `state` carries pot, price index, last year's inflation
// and return, and the previous withdrawal.
//
//  fixedReal  - the "4% rule" (Bengen 1994): rate x starting pot, then raised with inflation
//               whatever markets do. Income is steady until the pot runs out.
//  percent    - rate x current pot every year. Never runs out, income swings with markets.
//  guardrails - Guyton-Klinger: inflation rises, but skip the rise after a losing year, cut 10%
//               if the withdrawal rate drifts 20% above the start rate, raise 10% if it
//               drifts 20% below. The upward guardrail is what lets good markets fund a
//               better lifestyle.
//  dynamic    - Vanguard-style: rate x current pot, but real income may rise at most 5% and
//               fall at most 2.5% a year.
export const STRATEGIES = {
  fixedReal: 'Fixed real (4% rule)',
  percent: 'Percentage of pot',
  guardrails: 'Guardrails (Guyton-Klinger)',
  dynamic: 'Ceiling and floor (dynamic)',
};

export function makeStrategy({ strategy = 'fixedReal', rate = 0.04, upper = 1.2, lower = 0.8, cut = 0.1, raise = 0.1, ceiling = 0.05, floor = -0.025 } = {}) {
  switch (strategy) {
    case 'fixedReal':
      return { first: (s) => rate * s.pot, next: (s) => s.prev * (1 + s.lastInflation) };
    case 'percent':
      return { first: (s) => rate * s.pot, next: (s) => rate * s.pot };
    case 'guardrails':
      return {
        first: (s) => rate * s.pot,
        next: (s) => {
          let w = s.prev;
          const wr = (w * (1 + s.lastInflation)) / Math.max(s.pot, 1e-9);
          if (!(s.lastReturn < 0 && wr > rate)) w *= 1 + s.lastInflation;
          const cur = w / Math.max(s.pot, 1e-9);
          if (cur > rate * upper) w *= 1 - cut;
          else if (cur < rate * lower) w *= 1 + raise;
          return w;
        },
      };
    case 'dynamic':
      return {
        first: (s) => rate * s.pot,
        next: (s) => {
          const prevReal = s.prev * (1 + s.lastInflation); // last year's income in today's prices
          const target = rate * s.pot;
          return Math.min(prevReal * (1 + ceiling), Math.max(prevReal * (1 + floor), target));
        },
      };
    default:
      throw new Error(`unknown strategy ${strategy}`);
  }
}

// Real spending often falls in later retirement ("go-go, slow-go, no-go"). Multiplier on
// discretionary withdrawals by age.
export function spendingMultiplier(age, profile) {
  if (!profile || profile.type === 'flat') return 1;
  if (profile.type === 'slowdown') {
    const from = profile.fromAge ?? 75, decline = profile.declinePerYear ?? 0.01, min = profile.floor ?? 0.7;
    return Math.max(min, 1 - Math.max(0, age - from) * decline);
  }
  return 1;
}
