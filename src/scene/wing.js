import * as THREE from 'three';
import { latheX, mergeGeometries } from './geometry.js';
import { M } from './materials.js';
import { WING, LE, TE, wingX, wingY, wingPoint } from './airframe.js';

// One wing with its moving surfaces. The splits follow the lines already drawn on the wing sheet
// (livery/wing-panels.svg), so a retracted wing looks exactly like the one-piece wing it replaced:
//   slats     the bare-metal leading edge, in three spans that stop either side of each pylon
//   flaps     everything aft of 74 % chord from the fuselage out to z = 14, on one straight hinge
//   spoilers  ten panels on top, 62–74 % chord, just ahead of the flaps
// Each set is one merged mesh turning about one hinge line: the wing is straight-tapered, so the
// line of constant chord fraction is straight too.

const TRAVEL = {
  flap: { angle: -0.62, slide: [0.14, -0.04] }, // hinge-local: +x aft, +y up; trailing edge down
  canoe: 0.55, // the fairings' tails droop about half as far as the flap they cover
  slat: { angle: 0.36, slide: [-0.34, -0.2] }, // nose down, forwards
  spoiler: { angle: 0.86 },
};

/**
 * A closed piece of wing skin between span stations z0..z1 and chord fractions c0..c1.
 * `front`, `back`, `root`, `tip` close the open edges with flat walls; `ribFrom` starts the
 * root / tip ribs part-way along the chord (for the stretch that faces a flap's end).
 */
function wingSolid({ z0, z1, c0 = 0, c1 = 1, nz, nx = 14, front = false, back = false, root = false, tip = false, ribFrom = 0 }) {
  nz ??= Math.max(1, Math.ceil((z1 - z0) / 1.6));
  const pos = [];
  const uv = [];
  const idx = [];
  const cs = [];
  for (let j = 0; j <= nx; j++) cs.push(c0 + (c1 - c0) * (0.5 - 0.5 * Math.cos((j / nx) * Math.PI)));
  const zs = [];
  for (let i = 0; i <= nz; i++) zs.push(z0 + ((z1 - z0) * i) / nz);

  // skins: u = span (root → tip), v = chord; upper surface on the top half of the sheet
  const skin = (sign) => {
    const base = pos.length / 3;
    for (const z of zs) {
      for (const c of cs) {
        pos.push(wingX(z, c), wingY(z, c, sign), z);
        uv.push((z + 13) / 41, sign > 0 ? 1 - c / 2 : 0.5 - c / 2);
      }
    }
    for (let i = 0; i < nz; i++) {
      for (let j = 0; j < nx; j++) {
        const a = base + i * (nx + 1) + j;
        const b = a + 1;
        const c = a + nx + 1;
        const d = c + 1;
        if (sign > 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    }
  };
  skin(1);
  skin(-1);

  // walls get their own vertices (hard edges) and a blank spot on the sheet
  const wall = (upper, lower, flip) => {
    const base = pos.length / 3;
    const n = upper.length;
    for (const p of upper) { pos.push(p.x, p.y, p.z); uv.push(0.5, 0.93); }
    for (const p of lower) { pos.push(p.x, p.y, p.z); uv.push(0.5, 0.93); }
    for (let k = 0; k < n - 1; k++) {
      const a = base + k;
      const b = a + 1;
      const c = base + n + k;
      const d = c + 1;
      if (flip) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  };
  if (front) wall(zs.map((z) => wingPoint(z, c0, 1)), zs.map((z) => wingPoint(z, c0, -1)), false);
  if (back) wall(zs.map((z) => wingPoint(z, c1, 1)), zs.map((z) => wingPoint(z, c1, -1)), true);
  const ribCs = cs.filter((c) => c >= ribFrom - 1e-6);
  if (root) wall(ribCs.map((c) => wingPoint(z0, c, 1)), ribCs.map((c) => wingPoint(z0, c, -1)), true);
  if (tip) wall(ribCs.map((c) => wingPoint(z1, c, 1)), ribCs.map((c) => wingPoint(z1, c, -1)), false);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A spoiler: a thin slab lying a hair above the upper skin. */
function spoilerPanel(z0, z1, c0, c1) {
  const lift = 0.014;
  const thick = 0.04;
  const n = 3;
  const pos = [];
  const uv = [];
  const idx = [];
  const quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
  // top face follows the skin; the underside is the same shape, a little lower
  for (const dy of [lift, lift - thick]) {
    for (const z of [z0, z1]) {
      for (let j = 0; j <= n; j++) {
        const c = c0 + ((c1 - c0) * j) / n;
        pos.push(wingX(z, c), wingY(z, c, 1) + dy, z);
        uv.push((z + 13) / 41, dy === lift ? 1 - c / 2 : 0.93);
      }
    }
  }
  const row = n + 1;
  const at = (face, zi, j) => face * 2 * row + zi * row + j;
  for (let j = 0; j < n; j++) {
    quad(at(0, 0, j), at(0, 1, j), at(0, 1, j + 1), at(0, 0, j + 1)); // top
    quad(at(1, 0, j), at(1, 0, j + 1), at(1, 1, j + 1), at(1, 1, j)); // underside
    quad(at(0, 0, j), at(0, 0, j + 1), at(1, 0, j + 1), at(1, 0, j)); // inboard edge
    quad(at(0, 1, j), at(1, 1, j), at(1, 1, j + 1), at(0, 1, j + 1)); // outboard edge
  }
  quad(at(0, 0, 0), at(1, 0, 0), at(1, 1, 0), at(0, 1, 0)); // leading edge
  quad(at(0, 0, n), at(0, 1, n), at(1, 1, n), at(1, 0, n)); // trailing edge
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const flat = g.toNonIndexed(); // hard edges all round
  flat.computeVertexNormals();
  return flat;
}

// Flap-track fairings ("canoes") under the trailing edge: a fixed nose and a tail that drops
// with the flap. Bodies of revolution, length 1 along +x and radius 1 before scaling.
const CANOE_NOSE = [[0, 0], [0.05, 0.5], [0.18, 0.86], [0.3, 0.95], [0.3, 0]];
const CANOE_TAIL = [[0.3, 0], [0.3, 0.95], [0.38, 1], [0.62, 0.92], [0.85, 0.55], [0.99, 0.1], [1, 0]];
const CANOE_WHOLE = [[0, 0], [0.05, 0.5], [0.18, 0.86], [0.38, 1], [0.62, 0.92], [0.85, 0.55], [0.99, 0.1], [1, 0]];
const CANOES = [
  { z: -3.8, moves: true },
  { z: 5.2, moves: true },
  { z: 10.4, moves: true },
  { z: 15.6, moves: false }, // outboard of the flaps: the aileron's fairing stays put
];
function canoe(profile, z) {
  const ch = TE(z) - LE(z);
  const len = 0.66 * ch;
  const r = 0.14 + 0.022 * ch;
  const g = latheX(profile, 24);
  g.deleteAttribute('uv');
  g.scale(len, r * 1.3, r);
  g.translate(wingX(z, 0.56), wingY(z, 0.75, -1) - r * 0.5, z);
  return g;
}

/** Hinge frame: origin at `a`, local z along a→b, local x aft, local y up. */
function hingeFrame(a, b) {
  const z = b.clone().sub(a).normalize();
  const x = new THREE.Vector3(1, 0, 0);
  x.addScaledVector(z, -x.dot(z)).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const basis = new THREE.Matrix4().makeBasis(x, y, z);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
  const inverse = new THREE.Matrix4().compose(a, quaternion, new THREE.Vector3(1, 1, 1)).invert();
  return { position: a.clone(), quaternion, inverse };
}

let cache = null;

/** The wing's geometry, built once and shared by both wings. */
function wingGeometry() {
  if (cache) return cache;
  const { root, tip, side, leC, flapC, flapZ, spoiler, slatZ } = WING;
  const flapEnd = flapZ[flapZ.length - 1];

  // fixed skin: the box ahead of the flaps, and the full chord inboard and outboard of them
  const fixed = mergeGeometries([
    wingSolid({ z0: root, z1: side, c0: leC, c1: 1, nx: 22, tip: true, ribFrom: flapC }),
    wingSolid({ z0: side, z1: flapEnd, c0: leC, c1: flapC, nx: 18, front: true, back: true }),
    wingSolid({ z0: flapEnd, z1: tip, c0: leC, c1: 1, nx: 22, front: true, root: true, tip: true, ribFrom: flapC }),
  ]);

  // leading edge: fixed where there is no slat
  const fixedSpans = [];
  let z = root;
  for (const [a, b] of slatZ) {
    fixedSpans.push([z, a]);
    z = b;
  }
  fixedSpans.push([z, tip]);
  const fixedLE = mergeGeometries(fixedSpans.map(([a, b]) => wingSolid({ z0: a, z1: b, c0: 0, c1: leC, nx: 8, root: true, tip: true })));
  const slat = mergeGeometries(slatZ.map(([a, b]) => wingSolid({ z0: a, z1: b, c0: 0, c1: leC, nx: 8, back: true, root: true, tip: true })));

  const flap = mergeGeometries(
    flapZ.slice(0, -1).map((a, i) => wingSolid({ z0: a + 0.015, z1: flapZ[i + 1] - 0.015, c0: flapC, c1: 1, nx: 8, front: true, root: true, tip: true }))
  );
  const spoilers = [];
  for (let k = 0; k < spoiler.count; k++) {
    const a = spoiler.z0 + k * spoiler.pitch;
    spoilers.push(spoilerPanel(a + 0.03, a + spoiler.pitch - 0.03, spoiler.c0 + 0.004, spoiler.c1 - 0.004));
  }
  const spoilerGeo = mergeGeometries(spoilers);

  const fixedCanoe = mergeGeometries(CANOES.map((c) => canoe(c.moves ? CANOE_NOSE : CANOE_WHOLE, c.z)));
  const flapCanoe = mergeGeometries(CANOES.filter((c) => c.moves).map((c) => canoe(CANOE_TAIL, c.z)));

  // hinge lines. The flap's runs through the middle of its nose: low enough to open a slot ahead
  // of it as it drops, not so low that the slot becomes a hole in the wing.
  const flapHinge = (z) => new THREE.Vector3(wingX(z, flapC), (wingY(z, flapC, 1) + wingY(z, flapC, -1)) / 2 - 0.1, z);
  const hinge = {
    flap: hingeFrame(flapHinge(side), flapHinge(flapEnd)),
    slat: hingeFrame(wingPoint(slatZ[0][0], leC, -1), wingPoint(slatZ[slatZ.length - 1][1], leC, -1)),
    spoiler: hingeFrame(wingPoint(spoiler.z0, spoiler.c0, 1), wingPoint(spoiler.z0 + spoiler.count * spoiler.pitch, spoiler.c0, 1)),
  };
  // moving geometry lives in its hinge's own frame
  flap.applyMatrix4(hinge.flap.inverse);
  flapCanoe.applyMatrix4(hinge.flap.inverse);
  slat.applyMatrix4(hinge.slat.inverse);
  spoilerGeo.applyMatrix4(hinge.spoiler.inverse);

  // winglet: a swept blade standing on the tip chord
  const y = wingY(tip, 0.4, 1) - 0.22;
  const shape = new THREE.Shape([
    new THREE.Vector2(LE(tip) + 0.5, y), new THREE.Vector2(TE(tip), y),
    new THREE.Vector2(TE(tip) + 1.25, y + 3.2), new THREE.Vector2(TE(tip) + 0.35, y + 3.2),
  ]);
  const winglet = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3 });
  winglet.translate(0, 0, tip - 0.1);

  cache = { fixed, fixedLE, slat, flap, spoiler: spoilerGeo, fixedCanoe, flapCanoe, winglet, hinge };
  return cache;
}

/**
 * One wing (the near one; mirror the returned group for the far one).
 * `set({ flaps, slats, spoilers })` takes 0 (stowed) → 1 (fully out).
 */
export function createWing() {
  const G = wingGeometry();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(G.fixed, M.wingTop), new THREE.Mesh(G.fixedLE, M.wingLE), new THREE.Mesh(G.fixedCanoe, M.tailplane));
  group.add(new THREE.Mesh(G.winglet, M.skin));

  const hinged = (frame, ...meshes) => {
    const pivot = new THREE.Group();
    pivot.position.copy(frame.position);
    pivot.quaternion.copy(frame.quaternion);
    const turn = new THREE.Group();
    turn.add(...meshes);
    pivot.add(turn);
    group.add(pivot);
    return turn;
  };
  const flap = hinged(G.hinge.flap, new THREE.Mesh(G.flap, M.wingTop));
  const canoes = hinged(G.hinge.flap, new THREE.Mesh(G.flapCanoe, M.tailplane));
  const slat = hinged(G.hinge.slat, new THREE.Mesh(G.slat, M.wingLE));
  const spoiler = hinged(G.hinge.spoiler, new THREE.Mesh(G.spoiler, M.wingTop));

  group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });

  const last = { flaps: -1, slats: -1, spoilers: -1 };
  return {
    group,
    set({ flaps = 0, slats = 0, spoilers = 0 }) {
      if (flaps !== last.flaps) {
        last.flaps = flaps;
        flap.rotation.z = TRAVEL.flap.angle * flaps;
        flap.position.set(TRAVEL.flap.slide[0] * flaps, TRAVEL.flap.slide[1] * flaps, 0);
        canoes.rotation.z = TRAVEL.flap.angle * TRAVEL.canoe * flaps;
        canoes.position.copy(flap.position);
      }
      if (slats !== last.slats) {
        last.slats = slats;
        slat.rotation.z = TRAVEL.slat.angle * slats;
        slat.position.set(TRAVEL.slat.slide[0] * slats, TRAVEL.slat.slide[1] * slats, 0);
      }
      if (spoilers !== last.spoilers) {
        last.spoilers = spoilers;
        spoiler.rotation.z = TRAVEL.spoiler.angle * spoilers;
      }
    },
  };
}
