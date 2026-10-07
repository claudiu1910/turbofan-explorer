import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Surface of revolution about the +X axis.
 * `profile` is [[x, r], ...]. Walk the outer skin front→back and the inner skin back→front
 * to get a closed wall (outward normals) — cutting it exposes the back faces (rendered orange).
 *
 * Angle convention (after the axis swap): phi=0 → +Z, phi=π/2 → -Y, phi=π → -Z, phi=3π/2 → +Y.
 * Upper half (y>0) = phiStart π, length π.  Lower half (y<0) = phiStart 0, length π.
 */
export function latheX(profile, segments = 96, phiStart = 0, phiLength = Math.PI * 2) {
  const pts = profile.map(([x, r]) => new THREE.Vector2(r, x));
  const g = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
  g.rotateZ(-Math.PI / 2);
  g.userData.phi = [phiStart, phiLength]; // read by cylUV
  return g;
}

/** Closed thin wall from an outer and an inner skin, both given front→back. */
export function wallProfile(outer, inner) {
  return [...outer, ...inner.slice().reverse(), outer[0]];
}

/** Sample a piecewise-linear [x, r] curve. */
export function sampleCurve(curve, x) {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (x <= curve[i][0]) {
      const [x0, r0] = curve[i - 1];
      const [x1, r1] = curve[i];
      return r0 + ((x - x0) / (x1 - x0)) * (r1 - r0);
    }
  }
  return curve[curve.length - 1][1];
}

/**
 * Single twisted aerofoil-ish blade pointing along +Y (radial), chord roughly along X.
 * root/tip are radii; chord and stagger vary linearly root→tip.
 */
export function bladeGeometry({
  root = 0.3,
  tip = 1.3,
  chordRoot = 0.4,
  chordTip = 0.5,
  staggerRoot = 1.0,
  staggerTip = 0.45,
  thickness = 0.03,
  sweep = 0.0,
  camber = 0.0,
  spanSegs = 8,
  chordSegs = 6,
}) {
  const positions = [];
  const indices = [];
  const rows = spanSegs + 1;
  const cols = chordSegs + 1;
  const surfaces = 2;
  for (let side = 0; side < surfaces; side++) {
    for (let i = 0; i < rows; i++) {
      const s = i / spanSegs;
      const r = root + (tip - root) * s;
      const c = chordRoot + (chordTip - chordRoot) * s;
      const th = staggerRoot + (staggerTip - staggerRoot) * s;
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      for (let j = 0; j < cols; j++) {
        const u = j / chordSegs - 0.5;
        const along = u * c;
        const t = thickness * (1 - 4 * u * u) * (side === 0 ? 1 : -1);
        const cam = camber * (1 - 4 * u * u) * c;
        const px = along * cs + sweep * s + (-sn) * (t + cam);
        const pz = along * sn + cs * (t + cam);
        positions.push(px, r, pz);
      }
    }
  }
  const per = rows * cols;
  for (let side = 0; side < surfaces; side++) {
    for (let i = 0; i < spanSegs; i++) {
      for (let j = 0; j < chordSegs; j++) {
        const a = side * per + i * cols + j;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        if (side === 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Copy `geo` around the X axis at the given angles (radians) and merge to one geometry. */
export function ringOf(geo, angles, dx = 0) {
  const parts = angles.map((a) => {
    const g = geo.clone();
    g.translate(dx, 0, 0);
    g.rotateX(a);
    return g;
  });
  return mergeGeometries(parts, false);
}

export function evenAngles(count, from = 0, span = Math.PI * 2, jitter = 0) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(from + (i / count) * span + (jitter ? Math.sin(i * 12.9898) * jitter : 0));
  return out;
}

export function disc(r0, r1, x0, thickness = 0.04, segments = 64) {
  // thin ring/disc as a closed lathe wall
  return latheX(
    wallProfile(
      [
        [x0, r1],
        [x0 + thickness, r1],
      ],
      [
        [x0, r0],
        [x0 + thickness, r0],
      ]
    ),
    segments
  );
}

/**
 * Cylindrical texture coordinates for a latheX geometry, shared by every livery sheet:
 *   u = axial position, x0 → x1 (0 → 1)
 *   v = angle around the axis: crown (+Y) at v = 0 / 1, the +Z side (camera side, port / outboard)
 *       at v = 0.75, belly at 0.5, the -Z side at 0.25. In the SVG (y down) that puts the crown on
 *       the top and bottom edges, the camera side a quarter of the way down, drawn upright, nose left.
 * Built from the lathe's own segment index, so seams stay continuous; use RepeatWrapping on T.
 * Call once per geometry (it overwrites the lathe's uv.x).
 */
export function cylUV(geo, x0, x1) {
  const [p0, pl] = geo.userData.phi ?? [0, Math.PI * 2];
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const phi = p0 + uv.getX(i) * pl;
    uv.setXY(i, (pos.getX(i) - x0) / (x1 - x0), (1.5 * Math.PI - phi) / (2 * Math.PI));
  }
  uv.needsUpdate = true;
  return geo;
}

export { mergeGeometries };
