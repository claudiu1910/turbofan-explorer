import * as THREE from 'three';
import { sampleCurve } from './geometry.js';

// The aircraft's measurements, shared by the fuselage, the wing, the gear, the cabin and the
// system diagrams. Aircraft frame: +x aft (nose at x = -26), +y up, +z out along the near wing.
// 1 unit ≈ 1 metre.

export const FUSE_Y = 4.0; // fuselage axis height
export const FUSE_Z = -13.5; // fuselage axis; the explored engine hangs at z = 0
export const FUSE_R = 3.2;

// Fuselage profile [x, r]; nose at -26, tail at 32. Smoothed (centripetal Catmull-Rom) so the
// nose and tail cone stop reading as facets. Livery u = (x + 26) / 58.
const FUSE_KEYS = [
  [-26, 0], [-25.6, 0.8], [-24.6, 1.7], [-22.4, 2.55], [-19.5, 3.0], [-16, 3.2],
  [10, 3.2], [18, 3.15], [24, 2.6], [28.5, 1.5], [31.5, 0.35], [32, 0],
];
export const FUSE = new THREE.CatmullRomCurve3(FUSE_KEYS.map(([x, r]) => new THREE.Vector3(x, r, 0)), false, 'centripetal')
  .getPoints(120)
  .map((p) => [p.x, Math.max(0, p.y)]);
/** Fuselage radius at station x. */
export const fuseR = (x) => sampleCurve(FUSE, x);

// Door centres (fuselage x, m). livery/fuselage*.svg draws its doors at the same stations:
// change both together.
export const DOORS = [-20.4, -7.4, 12.6, 22.4];
// Cabin windows: alpha = angle above the fuselage's horizontal centre plane.
export const WINDOWS = { w: 0.25, h: 0.34, r: 0.1, alpha: 0.42, from: -19.9, to: 24, pitch: 0.95 };

// ───────── wing planform ─────────
// Root at z = -13 (inside the fuselage), tip at z = 18: a 63 m span on a 58 m fuselage.
// The sheet livery/wing-panels.svg is drawn for u = (z + 13) / 41, v = chord; keep that mapping.
export const WING = {
  root: -13,
  tip: 18,
  side: -10.3, // where the wing meets the fuselage side
  leC: 0.08, // the bare-metal leading edge (and the slats) end here
  // the lines below are the ones drawn on the wing sheet
  flapC: 0.74,
  flapZ: [-10.3, -3.6, 5.0, 14.0],
  spoiler: { c0: 0.62, c1: 0.74, z0: -8.5, pitch: 2.2, count: 10 },
  // slats stop either side of each pylon
  slatZ: [[-9.8, -7.75], [-6.65, -0.55], [0.55, 16.5]],
};
export const LE = (z) => -3 + (18 * (z + 13)) / 41;
export const TE = (z) => 10 + (7 * (z + 13)) / 41;
const THICK = (z) => 1.0 + (0.18 - 1.0) * ((z + 13) / 41);
const YMID = (z) => 3.05 + 0.03 * z;
function airfoil(c) {
  const t = 0.2969 * Math.sqrt(c) - 0.126 * c - 0.3516 * c * c + 0.2843 * c ** 3 - 0.1036 * c ** 4;
  return t / 0.0594;
}
/** A point on the wing skin: span station z, chord fraction c, sign +1 upper / -1 lower. */
export const wingX = (z, c) => LE(z) + (TE(z) - LE(z)) * c;
export const wingY = (z, c, sign) => YMID(z) + (sign > 0 ? 0.55 : -0.45) * THICK(z) * airfoil(c);
export const wingPoint = (z, c, sign, out = new THREE.Vector3()) => out.set(wingX(z, c), wingY(z, c, sign), z);

// ───────── engines ─────────
// z of each nacelle. The first is the explored engine (built in engine.js); the rest are shells.
export const ENGINE_Z = [0, -7.2, 2 * FUSE_Z + 7.2, 2 * FUSE_Z];

// ───────── on the ground ─────────
export const GROUND_Y = -2.46; // where the tyres touch, with the aircraft level
export const MAIN_GEAR = { x: 6.6, y: 2.0, out: 3.9, leg: 3.84 }; // pivot; `out` = distance from the centreline
export const NOSE_GEAR = { x: -20.6, y: 1.25, leg: 3.19 };
