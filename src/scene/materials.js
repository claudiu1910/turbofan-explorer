import * as THREE from 'three';
import { P } from './palette.js';

// One world-space clip plane shared by every engine material.
// keeps z <= constant  →  as the constant sinks to 0 the camera-side half is sliced away.
export const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 5);
const clip = [cutPlane];
export const clipPlanes = clip; // Material.clone() deep-copies planes — re-assign this after cloning.

// clipShadows: the removed half must not keep shadowing the interior
const CLIP = { clippingPlanes: clip, clipShadows: true };
const D = THREE.DoubleSide;

const lit = (k) => ({ color: P[k].color, roughness: P[k].roughness, metalness: P[k].metalness });
const std = (k, o = {}) => new THREE.MeshStandardMaterial({ ...lit(k), ...o });
const phys = (k, o = {}) =>
  new THREE.MeshPhysicalMaterial({ ...lit(k), clearcoat: P[k].clearcoat ?? 0, clearcoatRoughness: P[k].clearcoatRoughness ?? 0, ...o });

export const M = {
  // aircraft (not clipped)
  skin: phys('paint'), // pylon, fairing, winglet
  fuselage: phys('paint'), // + fuselage livery (livery.js)
  tail: phys('paint'), // + tail livery
  skinShade: std('coreCowl'),
  window: phys('glass', { ior: 1.5 }),
  wingTop: std('wingGrey', { side: D }), // + wing panel sheet
  wingLE: std('wingLE', { side: D }),
  tailplane: std('wingGrey'),

  // engine exterior (clipped)
  cowl: phys('paint', { ...CLIP, side: THREE.FrontSide }), // + nacelle livery
  lip: std('lip', CLIP),
  coreCowl: std('coreCowl', CLIP),
  nozzle: std('nozzle', { ...CLIP, side: D }),
  spinner: phys('spinner', CLIP), // + spinner swirl
  fanBlade: std('fanBlade', { ...CLIP, side: D }),

  // engine interior (clipped)
  liner: std('liner', CLIP),
  duct: std('duct', CLIP),
  steel: std('compressor', { ...CLIP, side: D }),
  steelDark: std('steelDark', { ...CLIP, side: D }),
  casing: std('casing', { ...CLIP, side: THREE.FrontSide }), // separate so x-ray can ghost just the shells
  hot: std('hot', { ...CLIP, side: D, emissive: '#ff6a1a', emissiveIntensity: 0 }),
  bronze: std('bronze', { ...CLIP, side: D }),
  lpShaft: std('lpShaft', { ...CLIP, emissive: P.lpShaft.emissive, emissiveIntensity: P.lpShaft.emissiveIntensity }),
  hpShaft: std('hpShaft', { ...CLIP, emissive: P.hpShaft.emissive, emissiveIntensity: P.hpShaft.emissiveIntensity }),
  white: std('ogv', { ...CLIP, side: D }),

  // the orange "cut section" shown through back faces
  cutFace: new THREE.MeshBasicMaterial({ color: P.cutFace.color, side: THREE.BackSide, clippingPlanes: clip }),
  cutFaceHot: new THREE.MeshBasicMaterial({ color: P.cutFaceHot.color, side: THREE.BackSide, clippingPlanes: clip }),
};

/** A fresh, unclipped, untextured material straight from the palette (material balls). */
export function paletteMaterial(key) {
  const p = P[key];
  if (p.unlit) return new THREE.MeshBasicMaterial({ color: p.color });
  const o = { ...lit(key) };
  if (p.emissive) Object.assign(o, { emissive: p.emissive, emissiveIntensity: p.emissiveIntensity });
  return p.clearcoat ? phys(key, o) : std(key, o);
}

/** Mesh plus an orange back-face twin so a clipped wall shows a coloured section. */
export function cutMesh(geometry, material, cutMaterial = M.cutFace) {
  const g = new THREE.Group();
  const front = new THREE.Mesh(geometry, material);
  const back = new THREE.Mesh(geometry, cutMaterial);
  back.renderOrder = 1;
  g.add(front, back);
  g.userData.front = front;
  g.userData.back = back;
  return g;
}
