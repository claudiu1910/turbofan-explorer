import * as THREE from 'three';
import { latheX, mergeGeometries } from './geometry.js';
import { FUSE_Y, FUSE_Z, FUSE_R, WINDOWS } from './airframe.js';

// The cabin cutaway: a window cut in the fuselage skin, and what is behind it.
//
// The cut is three world-space planes used with `clipIntersection`, so only the corner where all
// three agree is removed: the stretch of skin between two frames, on the camera's side and over
// the top. `CABIN.planes` go on every material that is part of the tube (skin, lining, window
// panes); the furniture inside is never clipped, it is simply uncovered.

export const CABIN = {
  from: -18.6, // the window runs between these two stations (clear of both doors)
  to: -9.2,
  tilt: 0.35, // the cut leans over the crown, so the view from above-and-beside is clear
  closed: 3.45, // plane offsets from the fuselage axis: nothing cut …
  open: -0.35, // … to a little more than half the shell gone
  wall: 0.13, // skin thickness, exaggerated so the section reads
  floor: -0.7, // passenger floor, relative to the axis
  hold: -2.5, // cargo floor
};

const LINER_R = FUSE_R - 0.16;
const n = new THREE.Vector3(0, Math.sin(CABIN.tilt), Math.cos(CABIN.tilt)); // the cut's outward normal

// three keeps the side a plane's normal points to; a fragment is dropped only if all three drop it
const cutPlane = new THREE.Plane(n.clone().negate(), 0);
const fromPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), CABIN.from);
const toPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -CABIN.to);
export const cabinPlanes = [cutPlane, fromPlane, toPlane];
/** Material options for anything that belongs to the tube. */
export const CABIN_CLIP = { clippingPlanes: cabinPlanes, clipIntersection: true, clipShadows: true };

/** @param {number} k 0 = skin whole, 1 = fully opened */
export function setCabinCut(k) {
  const d = CABIN.closed + (CABIN.open - CABIN.closed) * k;
  cutPlane.constant = n.y * FUSE_Y + n.z * FUSE_Z + d;
}
setCabinCut(0);

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const a = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) c.toArray(a, i);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
/** A cross-section [z, y] pulled along x from x0 to x1. */
function extrudeX(points, x0, x1) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  g.rotateY(Math.PI / 2); // shape x (= -z) → world z, extrusion → world x
  g.translate(x0, 0, 0);
  return g;
}

/**
 * Everything inside the tube, in fuselage-axis coordinates (add to a group placed on the axis).
 * Returns the group and a `setGain` for its lamps.
 */
export function createCabin() {
  const group = new THREE.Group();
  group.visible = false;
  const x0 = CABIN.from - 0.95;
  const x1 = CABIN.to + 1.15;
  const len = x1 - x0;
  const xm = (x0 + x1) / 2;

  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  const trim = new THREE.MeshStandardMaterial({ color: '#d8d5cb', roughness: 0.62, metalness: 0 });
  const structure = new THREE.MeshStandardMaterial({ color: '#8f9b82', roughness: 0.6, metalness: 0.1 }); // primer green
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.46, metalness: 0.7 });
  const lamp = new THREE.MeshBasicMaterial({ color: '#ffe9c4' });
  lamp.userData.base = lamp.color.clone(); // unlit: rescaled with the exposure, like the section faces

  // ── the lining: the inside face of the tube, cut with the skin ──
  const liner = new THREE.Mesh(
    latheX([[28, 1.3], [24, 2.44], [18, 2.99], [10, LINER_R], [-16, LINER_R], [-19.5, 2.84], [-22, 2.5]], 96),
    new THREE.MeshStandardMaterial({ color: '#cfcbc0', roughness: 0.7, metalness: 0, ...CABIN_CLIP })
  );
  group.add(liner);

  // window light on the lining, where the panes are
  const reveal = new THREE.PlaneGeometry(WINDOWS.w + 0.1, WINDOWS.h + 0.12);
  const xs = [];
  for (let x = WINDOWS.from; x <= WINDOWS.to; x += WINDOWS.pitch) if (x > x0 && x < x1) xs.push(x);
  const glow = new THREE.MeshBasicMaterial({ color: '#c9b8e6', ...CABIN_CLIP });
  glow.userData.base = glow.color.clone();
  const reveals = new THREE.InstancedMesh(reveal, glow, xs.length * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let i = 0;
  for (const side of [1, -1]) {
    for (const x of xs) {
      const r = LINER_R - 0.012;
      const a = WINDOWS.alpha;
      // facing the axis
      q.setFromEuler(new THREE.Euler(side > 0 ? Math.PI - a : a, 0, 0));
      m.compose(new THREE.Vector3(x, r * Math.sin(a), side * r * Math.cos(a)), q, new THREE.Vector3(1, 1, 1));
      reveals.setMatrixAt(i++, m);
    }
  }
  group.add(reveals);

  // ── floor, its beams, and the hold floor ──
  const half = Math.sqrt(LINER_R ** 2 - (CABIN.floor - 0.1) ** 2) - 0.03;
  group.add(new THREE.Mesh(paint(box(len, 0.06, half * 2, xm, CABIN.floor - 0.03, 0), '#272c52'), cloth));
  const beams = [];
  for (let x = x0 + 0.25; x < x1; x += 0.53) beams.push(box(0.07, 0.16, half * 2 - 0.1, x, CABIN.floor - 0.14, 0));
  const holdHalf = Math.sqrt(LINER_R ** 2 - CABIN.hold ** 2) - 0.04;
  beams.push(box(len, 0.07, holdHalf * 2, xm, CABIN.hold - 0.035, 0));
  group.add(new THREE.Mesh(mergeGeometries(beams), structure));

  // ── seats: ten across (3-4-3), each one a few boxes ──
  const yf = CABIN.floor;
  const seat = mergeGeometries([
    paint(box(0.44, 0.1, 0.43, 0, yf + 0.43, 0), '#2a3172'), // cushion
    paint(box(0.09, 0.64, 0.43, 0, 0.32, 0).rotateZ(-0.13).translate(0.25, yf + 0.5, 0), '#2a3172'), // back
    paint(box(0.1, 0.19, 0.3, 0, 0, 0).rotateZ(-0.13).translate(0.325, yf + 1.2, 0), '#f0922c'), // headrest cover
    paint(box(0.34, 0.36, 0.36, 0.02, yf + 0.2, 0), '#3a3d4c'), // frame
  ]);
  const zs = [-2.62, -2.14, -1.66, -0.72, -0.24, 0.24, 0.72, 1.66, 2.14, 2.62];
  const rows = [];
  for (let x = x0 + 0.7; x < x1 - 0.55; x += 0.81) rows.push(x);
  const seats = new THREE.InstancedMesh(seat, cloth, rows.length * zs.length);
  i = 0;
  for (const x of rows) for (const z of zs) seats.setMatrixAt(i++, m.makeTranslation(x, 0, z));
  group.add(seats);

  // ── overhead bins (the camera-side row went with the skin), and the lamps under them ──
  const sideBin = [[-2.86, 0.98], [-2.94, 1.38], [-2.68, 1.8], [-2.0, 1.9], [-1.82, 1.32], [-2.02, 0.98]];
  const midBin = [[-0.78, 1.18], [0.78, 1.18], [0.94, 1.52], [0.62, 1.98], [-0.62, 1.98], [-0.94, 1.52]];
  group.add(new THREE.Mesh(mergeGeometries([extrudeX(sideBin, x0 + 0.1, x1 - 0.1), extrudeX(midBin, x0 + 0.1, x1 - 0.1)]), trim));
  group.add(new THREE.Mesh(mergeGeometries([
    box(len - 0.4, 0.025, 0.1, xm, 0.965, -2.42),
    box(len - 0.4, 0.025, 0.1, xm, 1.165, -0.55),
    box(len - 0.4, 0.025, 0.1, xm, 1.165, 0.55),
  ]), lamp));

  // ── bulkheads closing the view at each end ──
  const wallGeo = new THREE.CircleGeometry(LINER_R - 0.02, 64).rotateY(Math.PI / 2);
  group.add(new THREE.Mesh(mergeGeometries([wallGeo.clone().translate(x0, 0, 0), wallGeo.clone().rotateY(Math.PI).translate(x1, 0, 0)]), trim));

  // ── cargo containers in the hold, two abreast ──
  const tint = ['#b9bcc0', '#a9b0bb', '#c4c2bb', '#8f98ad'];
  const cans = [];
  let k = 0;
  for (let x = x0 + 0.25; x + 1.5 < x1; x += 1.62) {
    for (const side of [1, -1]) {
      const pts = [[0.05, 0.02], [1.5, 0.02], [1.92, 0.5], [1.92, 1.6], [0.05, 1.6]].map(([z, y]) => [side * z, CABIN.hold + y]);
      if (side < 0) pts.reverse(); // keep the outline turning the same way
      cans.push(paint(extrudeX(pts, x, x + 1.5), tint[k++ % tint.length]));
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(cans), metal));

  group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = !o.material.isMeshBasicMaterial;
  });
  return { group };
}
