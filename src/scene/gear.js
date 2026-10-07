import * as THREE from 'three';
import { latheX, mergeGeometries } from './geometry.js';
import { M } from './materials.js';
import { FUSE_Z, MAIN_GEAR, NOSE_GEAR } from './airframe.js';

// The landing gear: two four-wheel main legs that swing inwards into the belly, and a two-wheel
// nose leg that folds back. `set(g)` takes 0 (up and hidden) → 1 (down and locked); the doors
// open for the swing and mostly close again behind it, as they do on the real thing.

const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

const TYRE_R = 0.62;
const MAIN_SWING = 1.48; // rad, inwards
const NOSE_SWING = 1.66; // rad, backwards

function materials() {
  const mat = {
    steel: new THREE.MeshStandardMaterial({ color: '#b4b8be', roughness: 0.34, metalness: 1 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#e2e4e8', roughness: 0.12, metalness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: '#4a4d54', roughness: 0.5, metalness: 0.8 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.92, metalness: 0 }),
    hub: new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.4, metalness: 0.9, emissive: '#ff5a1c', emissiveIntensity: 0 }),
    door: Object.assign(M.skin.clone(), { side: THREE.DoubleSide }),
  };
  // only the main wheels have brakes to glow
  mat.hubCold = mat.hub.clone();
  return mat;
}

/** A wheel on the z axis: tyre and hub as two geometries (two materials). */
function wheelGeometry(scale = 1) {
  const tyre = latheX(
    [[-0.23, 0.34], [-0.23, 0.52], [-0.19, 0.59], [-0.1, 0.62], [0.1, 0.62], [0.19, 0.59], [0.23, 0.52], [0.23, 0.34]],
    40
  );
  const hub = latheX([[-0.2, 0], [-0.2, 0.3], [-0.14, 0.35], [0.14, 0.35], [0.2, 0.3], [0.2, 0]], 28);
  for (const g of [tyre, hub]) {
    g.deleteAttribute('uv');
    g.rotateY(Math.PI / 2); // axle along z
    g.scale(scale, scale, scale);
  }
  return { tyre, hub };
}

/** A rod between two points. */
function rod(a, b, r) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 14);
  g.deleteAttribute('uv');
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
  g.translate((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2);
  return g;
}
const box = (w, h, d, x, y, z) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  return g;
};

/** One axle with its wheels: a group that turns about z. */
function axle(mat, zs, scale = 1) {
  const g = new THREE.Group();
  const w = wheelGeometry(scale);
  const tyres = mergeGeometries(zs.map((z) => w.tyre.clone().translate(0, 0, z)));
  const hubs = mergeGeometries(zs.map((z) => w.hub.clone().translate(0, 0, z)));
  const span = Math.max(...zs) - Math.min(...zs) + 0.5;
  const bar = new THREE.CylinderGeometry(0.07 * scale, 0.07 * scale, span, 12).rotateX(Math.PI / 2);
  g.add(new THREE.Mesh(tyres, mat.tyre), new THREE.Mesh(hubs, mat.hub), new THREE.Mesh(bar, mat.dark));
  return g;
}

function mainLeg(mat) {
  const L = MAIN_GEAR.leg;
  const leg = new THREE.Group(); // origin at the pivot; hangs straight down when locked
  leg.add(new THREE.Mesh(mergeGeometries([
    rod([0, 0.1, 0], [0, -L * 0.6, 0], 0.17), // shock strut
    rod([0, -1.5, 0], [0, -0.05, -1.25], 0.07), // side brace, up into the belly
    rod([0, -1.2, 0], [-0.9, -0.05, 0], 0.06), // drag brace
  ]), mat.steel));
  leg.add(new THREE.Mesh(rod([0, -L * 0.55, 0], [0, -L, 0], 0.11), mat.chrome)); // the sliding piston
  leg.add(new THREE.Mesh(mergeGeometries([
    box(2.1, 0.2, 0.26, 0.1, -L, 0), // bogie beam
    rod([0.25, -L * 0.62, 0.16], [0.5, -L + 0.1, 0.16], 0.04), // torque link
  ]), mat.dark));
  const axles = [-0.75, 0.95].map((x) => {
    const a = axle(mat, [-0.56, 0.56]);
    a.position.set(x, -L, 0);
    leg.add(a);
    return a;
  });
  // the door that rides on the leg and closes the bay behind it
  leg.add(new THREE.Mesh(box(1.0, 2.3, 0.05, 0, -1.25, 0.3), mat.door));
  return { leg, axles };
}

function mainGear(mat) {
  const group = new THREE.Group();
  const { leg, axles } = mainLeg(mat);
  leg.position.set(MAIN_GEAR.x, MAIN_GEAR.y, FUSE_Z + MAIN_GEAR.out);
  group.add(leg);
  // belly door, hinged along the centreline side
  const hinge = new THREE.Group();
  hinge.position.set(MAIN_GEAR.x + 0.1, 1.0, FUSE_Z + 0.45);
  hinge.add(new THREE.Mesh(box(2.7, 0.05, 1.7, 0, 0, 0.85), mat.door));
  group.add(hinge);
  return {
    group,
    axles,
    set(g) {
      leg.rotation.x = MAIN_SWING * (1 - smooth(clamp01((g - 0.14) / 0.72)));
      const open = smooth(clamp01(g / 0.16)) * (1 - 0.82 * smooth(clamp01((g - 0.84) / 0.16)));
      hinge.rotation.x = 1.45 * open;
    },
  };
}

function noseGear(mat) {
  const L = NOSE_GEAR.leg;
  const group = new THREE.Group();
  const leg = new THREE.Group();
  leg.position.set(NOSE_GEAR.x, NOSE_GEAR.y, FUSE_Z);
  leg.add(new THREE.Mesh(mergeGeometries([
    rod([0, 0.1, 0], [0, -L * 0.6, 0], 0.12),
    rod([0, -1.3, 0], [1.1, -0.05, 0], 0.055), // drag brace
  ]), mat.steel));
  leg.add(new THREE.Mesh(rod([0, -L * 0.55, 0], [0, -L, 0], 0.08), mat.chrome));
  leg.add(new THREE.Mesh(mergeGeometries([
    box(0.16, 0.16, 0.16, 0, -L * 0.6, 0.2), // steering actuator
    rod([-0.1, -L * 0.62, 0], [-0.3, -L + 0.12, 0], 0.035),
  ]), mat.dark));
  const a = axle({ ...mat, hub: mat.hubCold }, [-0.3, 0.3], 0.84);
  a.position.set(0, -L, 0);
  leg.add(a);
  group.add(leg);
  // two doors, hinged along the sides of the bay
  const doors = [1, -1].map((s) => {
    const hinge = new THREE.Group();
    hinge.position.set(NOSE_GEAR.x + 1.3, 1.18, FUSE_Z + s * 0.5);
    hinge.add(new THREE.Mesh(box(3.2, 0.04, 0.5, 0, 0, -s * 0.25), mat.door));
    group.add(hinge);
    return { hinge, s };
  });
  return {
    group,
    axles: [a],
    set(g) {
      leg.rotation.z = NOSE_SWING * (1 - smooth(clamp01((g - 0.1) / 0.7)));
      const open = smooth(clamp01(g / 0.14));
      for (const d of doors) d.hinge.rotation.x = -d.s * 1.4 * open;
    },
  };
}

export function createGear() {
  const mat = materials();
  const group = new THREE.Group();
  const near = mainGear(mat);
  const far = mainGear(mat);
  // the far leg is the near one seen in a mirror standing on the fuselage centreline
  far.group.scale.z = -1;
  far.group.position.z = 2 * FUSE_Z;
  const nose = noseGear(mat);
  group.add(near.group, far.group, nose.group);
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  group.visible = false;

  const mains = [...near.axles, ...far.axles];
  let last = -1;
  return {
    group,
    /** @param {number} g 0 up → 1 down and locked */
    set(g) {
      if (g === last) return;
      last = g;
      group.visible = g > 0.004;
      near.set(g);
      far.set(g);
      nose.set(g);
    },
    /** Wheel rotation for a distance rolled along the runway (m). */
    roll(distance) {
      const a = -distance / TYRE_R;
      for (const ax of mains) ax.rotation.z = a;
      nose.axles[0].rotation.z = a / 0.84;
    },
    /** Brake heat: the hubs glow. `e` is an emissive intensity already scaled to the exposure. */
    setBrakeGlow(e) {
      mat.hub.emissiveIntensity = e;
    },
  };
}
