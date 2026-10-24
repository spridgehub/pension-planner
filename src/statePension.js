// New State Pension. Full rate 2026/27: £241.30 a week.
export const FULL_NEW_STATE_PENSION_2026 = 241.30 * 52;

// State Pension age from date of birth (Pensions Act 2014 timetable; 68 not yet legislated in).
export function statePensionAge(birthYear, birthMonth = 6) {
  const born = birthYear + (birthMonth - 1) / 12;
  if (born < 1960.25) return 66;            // before 6 April 1960
  if (born < 1961.17) return 66 + Math.min(11, Math.round((born - 1960.25) * 12)) / 12; // transition
  return 67;
}

// Annual uprating: triple lock = max(CPI, earnings, 2.5%); earnings assumed CPI + 1%.
export function uprating(cpi, policy = 'tripleLock') {
  if (policy === 'cpi') return cpi;
  if (policy === 'earnings') return cpi + 0.01;
  return Math.max(cpi + 0.01, 0.025);
}
