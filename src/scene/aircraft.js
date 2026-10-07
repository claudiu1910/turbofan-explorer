import * as THREE from 'three';
import { latheX, wallProfile, cylUV } from './geometry.js';
import { M } from './materials.js';
import { LAYER } from './layers.js';
import { createCabin, setCabinCut, CABIN, CABIN_CLIP } from './cabin.js';
import { createSystems } from './systems.js';
import { buildNacelleShell } from './engine.js';
import { createWing } from './wing.js';
import { createGear } from './gear.js';
import { ENGINE_X } from '../config.js';
import { FUSE, FUSE_Y, FUSE_Z, fuseR, DOORS, WINDOWS, ENGINE_Z } from './airframe.js';
import { P } from './palette.js';

function extrudeShape(points, depth, bevel = 0.08) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8,
  });
}

function pylonGeometry() {
  const g = extrudeShape(
    [[3.4, 3.2], [-0.8, 2.4], [-2.0, 1.65], [0.5, 1.5], [5, 1.45], [8.2, 1.2], [10.6, 1.3], [13, 3.0]],
    0.7,
    0.12
  );
  g.translate(0, 0, -0.35);
  return g;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// Fin: root follows the fuselage crown.
const crown = (x) => FUSE_Y + fuseR(x) - 0.12;
const FIN = { rootLE: 21.2, rootTE: 30.2, tipLE: 28.4, tipTE: 31.2, tipY: 15.6 };
// tail sheet window (m): livery/tail.svg viewBox 1300 × 1120 cm
const TAIL_UV = { x0: 18.8, x1: 31.8, y0: 4.6, y1: 15.8 };

/**
 * The airliner the engine hangs from. In the engine lessons only the near side is drawn (the far
 * wing, the far engines and the gear are hidden, as nothing there can be seen); the aircraft
 * views switch the whole machine on (`wide`).
 */
export function createAircraft() {
  const group = new THREE.Group();
  const far = new THREE.Group(); // everything beyond the fuselage centreline
  group.add(far);

  // Fuselage: a thick-walled tube, so the cabin cutaway shows a section through the skin the same
  // way the engine's cutaway does (a back-face twin, drawn flat orange after the shading).
  const inner = FUSE.filter(([x]) => x >= -21.6 && x <= 27).map(([x, r]) => [x, r - CABIN.wall]);
  const tube = cylUV(latheX(wallProfile(FUSE, inner), 128), -26, 32);
  Object.assign(M.fuselage, CABIN_CLIP);
  const fuselage = new THREE.Mesh(tube, M.fuselage);
  const section = new THREE.MeshBasicMaterial({ color: P.cutFace.color, side: THREE.BackSide, ...CABIN_CLIP });
  section.userData.base = section.color.clone(); // kept at its authored colour under any exposure
  const sectionMesh = new THREE.Mesh(tube, section);
  sectionMesh.renderOrder = 1;
  sectionMesh.layers.set(LAYER.OVERLAY);
  sectionMesh.visible = false;
  const body = new THREE.Group(); // everything on the fuselage axis
  body.position.set(0, FUSE_Y, FUSE_Z);
  const cabin = createCabin();
  body.add(fuselage, sectionMesh, cabin.group);
  group.add(body);

  const systems = createSystems();
  group.add(systems.group);

  // passenger windows (both sides): flush glass panes, skipped at the doors
  const winGeo = new THREE.ShapeGeometry(roundedRect(WINDOWS.w, WINDOWS.h, WINDOWS.r), 4);
  const xs = [];
  for (let x = WINDOWS.from; x <= WINDOWS.to; x += WINDOWS.pitch) {
    if (DOORS.every((d) => Math.abs(x - d) > 0.95)) xs.push(x);
  }
  const wins = new THREE.InstancedMesh(winGeo, Object.assign(M.window.clone(), CABIN_CLIP), xs.length * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const a = WINDOWS.alpha;
  let n = 0;
  for (const side of [1, -1]) {
    for (const x of xs) {
      const r = fuseR(x) + 0.008;
      const p = new THREE.Vector3(x, FUSE_Y + r * Math.sin(a), FUSE_Z + side * r * Math.cos(a));
      e.set(side > 0 ? -a : a + Math.PI, 0, 0);
      q.setFromEuler(e);
      m.compose(p, q, new THREE.Vector3(1, 1, 1));
      wins.setMatrixAt(n++, m);
    }
  }
  wins.receiveShadow = true;
  group.add(wins);

  // wings: the far one is the near one seen in a mirror standing on the fuselage centreline
  const wingNear = createWing();
  const wingFar = createWing();
  wingFar.group.scale.z = -1;
  wingFar.group.position.z = 2 * FUSE_Z;
  group.add(wingNear.group);
  far.add(wingFar.group);

  // wing-to-body fairings: long, flat-bottomed, only ~1 m proud of the fuselage side
  const fairingGeo = latheX([[-7.5, 0], [-6.2, 0.45], [-3.5, 0.82], [1, 1.0], [6, 0.98], [10.5, 0.78], [13.5, 0.42], [15, 0]], 48);
  for (const side of [1, -1]) {
    const fairing = new THREE.Mesh(fairingGeo, M.skin);
    fairing.scale.set(1, 1.25, 2.1);
    fairing.position.set(0, 2.3, FUSE_Z + side * 2.2);
    (side > 0 ? group : far).add(fairing);
  }

  // vertical fin, planar-mapped to the tail sheet
  const finPts = [
    [FIN.rootLE, crown(FIN.rootLE)],
    ...[23.5, 26, 28.5].map((x) => [x, crown(x)]),
    [FIN.rootTE, crown(FIN.rootTE)],
    [FIN.tipTE, FIN.tipY],
    [FIN.tipLE, FIN.tipY],
  ];
  const finGeo = extrudeShape(finPts, 0.34, 0.08);
  {
    const pos = finGeo.attributes.position;
    const uv = finGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (pos.getX(i) - TAIL_UV.x0) / (TAIL_UV.x1 - TAIL_UV.x0), (pos.getY(i) - TAIL_UV.y0) / (TAIL_UV.y1 - TAIL_UV.y0));
    }
  }
  const fin = new THREE.Mesh(finGeo, M.tail);
  fin.position.set(0, 0, FUSE_Z - 0.17);
  group.add(fin);

  // horizontal stabilisers: root chord kept ahead of the tail cone tip
  const hs = new THREE.Mesh(
    extrudeShape([[24.2, 0], [28.2, -10.5], [30.0, -10.5], [30.6, 0], [30.0, 10.5], [28.2, 10.5]], 0.2, 0.05).rotateX(Math.PI / 2),
    M.tailplane
  );
  hs.position.set(0, FUSE_Y + 0.4, FUSE_Z);
  group.add(hs);

  // engines: the explored one is built elsewhere and hangs on a pylon that can fade away;
  // the other three are nacelle shells with a turning fan
  const pyl = pylonGeometry();
  const heroPylonMat = M.skin.clone();
  heroPylonMat.transparent = true;
  const heroPylon = new THREE.Mesh(pyl, heroPylonMat);
  heroPylon.position.set(0, 0, ENGINE_Z[0]);
  group.add(heroPylon);

  const shells = [];
  ENGINE_Z.slice(1).forEach((z) => {
    const home = z > FUSE_Z ? group : far;
    const shell = buildNacelleShell();
    shell.position.set(ENGINE_X, 0, z);
    const pylon = new THREE.Mesh(pyl, M.skin);
    pylon.position.set(0, 0, z);
    home.add(shell, pylon);
    shells.push(shell);
  });

  const gear = createGear();
  group.add(gear.group);

  const skip = new Set([wins, sectionMesh]);
  group.traverse((o) => {
    if (!o.isMesh || skip.has(o) || o.parent === systems.group || cabin.group.getObjectById(o.id)) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  far.visible = false;

  let lastRev = -1;
  let lastCabin = -1;
  return {
    group,
    fuselage,
    gear,
    systems,
    /** A point that rides with the aircraft (labels and hotspots use these). */
    anchor(at) {
      const o = new THREE.Object3D();
      o.position.set(...at);
      group.add(o);
      return o;
    },
    setExplode(ex) {
      const o = 1 - Math.min(1, ex * 3);
      heroPylonMat.opacity = o;
      heroPylon.visible = o > 0.01;
    },
    /** Turn the other engines' fans by an angle (rad). */
    spin(da) {
      for (const s of shells) if (s.parent.visible) s.userData.rotor.rotation.x += da;
    },
    /**
     * @param {object} v  view: wide, gear, flaps, slats, spoilers, reverseAll, rolled, cabin, systems
     * @param {number} time seconds, for the system lines' flow
     */
    update(v, time = 0) {
      far.visible = !!v.wide;
      const cut = v.cabin ?? 0;
      if (cut !== lastCabin) {
        lastCabin = cut;
        setCabinCut(cut);
        cabin.group.visible = sectionMesh.visible = cut > 0.004;
      }
      systems.update(time, v.systems);
      const surfaces = { flaps: v.flaps ?? 0, slats: v.slats ?? v.flaps ?? 0, spoilers: v.spoilers ?? 0 };
      wingNear.set(surfaces);
      wingFar.set(surfaces);
      gear.set(v.gear ?? 0);
      if (gear.group.visible) gear.roll(v.rolled ?? 0);
      const rev = v.reverseAll ?? 0;
      if (rev !== lastRev) {
        lastRev = rev;
        for (const s of shells) s.userData.setReverse(rev);
      }
    },
  };
}
