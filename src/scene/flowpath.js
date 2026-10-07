// The gas path: how wide the air passages are along the engine axis (engine-local x, radius).
// One set of tables, used three ways: the airflow shader, the "ride the air" tracer,
// and the checks that keep the geometry and the particles lined up.

export const CORE_CAS = [[1.3, 0.6], [1.55, 0.58], [2.7, 0.54], [4.1, 0.4], [5.0, 0.38], [5.55, 0.46], [6.5, 0.58], [7.1, 0.46]];
export const CORE_HUB = [[1.3, 0.44], [1.55, 0.31], [2.7, 0.34], [4.1, 0.36], [5.0, 0.3], [5.55, 0.3], [6.5, 0.26], [7.1, 0.05]];
export const BYP_IN = [[1.3, 0.62], [1.9, 0.82], [2.7, 0.74], [4.1, 0.64], [5.0, 0.64], [5.5, 0.68], [6.0, 0.74], [6.05, 0.75]];
export const BYP_OUT = [[1.3, 1.38], [1.9, 1.44], [3.0, 1.48], [4.2, 1.38], [5.2, 1.21], [6.0, 1.03], [6.05, 1.03], [6.1, 1.03]];

// where the thrust reverser turns the bypass air (engine-local x)
export const REVERSER_X = 3.3;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Piecewise-linear lookup in an [x, r] table. */
export function pw(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, r0] = table[i - 1];
      const [x1, r1] = table[i];
      return r0 + ((x - x0) / (x1 - x0)) * (r1 - r0);
    }
  }
  return table[table.length - 1][1];
}

/** GLSL source for one table, so the shader can never drift from the JS. */
export const glslTable = (name, table) =>
  `const vec2 ${name}[8] = vec2[8](${table.map(([x, r]) => `vec2(${x.toFixed(3)}, ${r.toFixed(3)})`).join(', ')});`;

/** Radius of a core streamline at x; f = 0 hugs the hub, 1 hugs the casing. Mirrors the shader. */
export function coreRadius(x, f) {
  const ri = lerp(0.47, 0.76, f);
  const cap = clamp(-x / 2.6, 0, 1);
  let band = lerp(pw(CORE_HUB, x) + 0.02, pw(CORE_CAS, x) - 0.02, f);
  if (x > 7.1) band = lerp(0.03, 0.46, f) * (1 + (x - 7.1) * 0.3);
  return lerp(ri * (1 + 0.45 * cap), band, smoothstep(1.0, 1.6, x));
}

/** Radius of a bypass streamline at x; f = 0 hugs the core cowl, 1 hugs the nacelle. */
export function bypassRadius(x, f) {
  const ri = lerp(0.86, 1.36, f);
  const cap = clamp(-x / 2.6, 0, 1);
  let band = lerp(pw(BYP_IN, x), pw(BYP_OUT, x), f);
  if (x > 6.05) band *= 1 + (x - 6.05) * 0.12;
  return lerp(ri * (1 + 0.45 * cap), band, smoothstep(1.0, 1.6, x));
}
