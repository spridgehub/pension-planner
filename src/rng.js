// Seeded PRNG so every option is evaluated on identical random paths.
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const normal = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0;
    while (u === 0) u = uniform();
    v = uniform();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  // Student-t scaled to unit variance (fat-tailed equity shocks).
  const studentT = (df) => {
    let chi = 0;
    for (let i = 0; i < df; i++) { const z = normal(); chi += z * z; }
    return normal() / Math.sqrt(chi / df) * Math.sqrt((df - 2) / df);
  };
  return { uniform, normal, studentT };
}
