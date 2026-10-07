import * as THREE from 'three';
import { mergeGeometries } from './geometry.js';
import { LAYER } from './layers.js';
import { ENGINE_X } from '../config.js';
import { FUSE_Y, FUSE_Z, ENGINE_Z, MAIN_GEAR, NOSE_GEAR, wingX, wingY } from './airframe.js';
import { CABIN } from './cabin.js';

// What an engine gives the aircraft besides thrust, drawn as three sets of flowing lines:
//   air    hot bleed air to the packs in the belly (orange), then cool air to the cabin (blue)
//   hyd    oil under pressure to the gear, flaps, spoilers and tail
//   elec   current to the flight deck and the cabin
// A diagram laid over the aircraft: always drawn on top, routes sketched rather than surveyed.

const COLORS = {
  air: ['#ff9d4d', '#6fc3ff'], // hot, cooled
  hyd: ['#c79bff', '#c79bff'],
  elec: ['#ffe066', '#ffe066'],
};

const vert = /* glsl */ `
  attribute float aDist;
  attribute float aHot;
  varying float vDist;
  varying float vHot;
  void main() {
    vDist = aDist;
    vHot = aHot;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const frag = /* glsl */ `
  uniform float uTime;
  uniform float uAlpha;
  uniform float uGain;
  uniform vec3 uHot;
  uniform vec3 uCool;
  varying float vDist;
  varying float vHot;
  void main() {
    float d = fract(vDist * 0.42 - uTime * 1.5);
    float dash = smoothstep(0.0, 0.1, d) * (1.0 - smoothstep(0.5, 0.68, d));
    vec3 col = mix(uCool, uHot, vHot);
    gl_FragColor = vec4(col * uGain * (0.4 + 0.6 * dash), uAlpha * (0.42 + 0.58 * dash));
  }
`;

/** A tube along the points, tagged with distance along it (for the dashes) and "hot". */
function pipe(points, { hot = 0, r = 0.085, tension = 0.25 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', tension);
  const length = curve.getLength();
  const g = new THREE.TubeGeometry(curve, Math.max(8, Math.round(length * 2.2)), r, 6, false);
  const uv = g.attributes.uv;
  const dist = new Float32Array(uv.count);
  const heat = new Float32Array(uv.count).fill(hot);
  for (let i = 0; i < uv.count; i++) dist[i] = uv.getX(i) * length;
  g.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
  g.setAttribute('aHot', new THREE.BufferAttribute(heat, 1));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}
const cube = (w, h, d, at, hot = 0) => {
  const g = new THREE.BoxGeometry(w, h, d).translate(...at);
  const n = g.attributes.position.count;
  g.setAttribute('aDist', new THREE.BufferAttribute(new Float32Array(n).fill(0.3), 1)); // a steady, undashed block
  g.setAttribute('aHot', new THREE.BufferAttribute(new Float32Array(n).fill(hot), 1));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
};

const mid = (z, c) => (wingY(z, c, 1) + wingY(z, c, -1)) / 2;
const sideOf = (z) => (z > FUSE_Z ? 1 : -1); // +1 near wing, -1 far wing
// the far wing is the near one mirrored: use the near wing's shape at the mirrored station
const nearZ = (z) => (z > FUSE_Z ? z : 2 * FUSE_Z - z);
const wingPt = (z, c, dy = 0) => [wingX(nearZ(z), c), mid(nearZ(z), c) + dy, z];
const spar = (z, c) => {
  // along the wing from an engine's station to the fuselage side
  const s = sideOf(z);
  const pts = [];
  const root = FUSE_Z + s * 3.6;
  const steps = 5;
  for (let i = 0; i <= steps; i++) pts.push(wingPt(z + ((root - z) * i) / steps, c));
  return pts;
};

function buildAir() {
  const geos = [];
  const pack = (s) => [2.2, 1.45, FUSE_Z + s * 1.25];
  for (const z of ENGINE_Z) {
    const s = sideOf(z);
    // hot: off the compressor, up the pylon, inboard along the front of the wing, down to the pack
    geos.push(pipe([[ENGINE_X + 3.7, 0.72, z], [ENGINE_X + 4.6, 1.7, z], wingPt(z, 0.2), ...spar(z, 0.2).slice(1), [3.2, 1.9, FUSE_Z + s * 2.4], pack(s)], { hot: 1 }));
  }
  for (const s of [1, -1]) {
    geos.push(cube(2.2, 0.75, 1.3, pack(s), 0.5)); // an air-conditioning pack
    // cool: forward under the floor, then up the wall to the duct along the ceiling
    const z = FUSE_Z + s * 1.25;
    geos.push(pipe([pack(s), [-1, 1.5, z], [-7.5, 1.6, z], [-8.3, 2.2, FUSE_Z + s * 2.75], [-8.5, FUSE_Y + 1.2, FUSE_Z + s * 2.9], [-8.8, FUSE_Y + 2.45, FUSE_Z + s * 1.5], [-9.4, FUSE_Y + 2.62, FUSE_Z + s * 0.5]]));
    // … and aft, to the rest of the cabin
    geos.push(pipe([pack(s), [6, 1.6, z], [9, 2.4, FUSE_Z + s * 2.7], [9.6, FUSE_Y + 1.4, FUSE_Z + s * 2.85], [10.5, FUSE_Y + 2.55, FUSE_Z + s * 1.2], [22, FUSE_Y + 2.45, FUSE_Z + s * 0.5]]));
  }
  // the duct along the ceiling above the cutaway, and the air falling from it across the cabin
  geos.push(pipe([[-9.2, FUSE_Y + 2.62, FUSE_Z], [-14, FUSE_Y + 2.66, FUSE_Z], [-19.2, FUSE_Y + 2.55, FUSE_Z]], { r: 0.11 }));
  for (let x = CABIN.to - 1.3; x > CABIN.from + 0.6; x -= 2.05) {
    for (const s of [1, -1]) {
      geos.push(pipe([
        [x, FUSE_Y + 2.5, FUSE_Z + s * 0.25], [x, FUSE_Y + 2.05, FUSE_Z + s * 1.4], [x, FUSE_Y + 1.0, FUSE_Z + s * 1.75],
        [x, FUSE_Y + 0.1, FUSE_Z + s * 2.3], [x, FUSE_Y + CABIN.floor + 0.12, FUSE_Z + s * 2.8],
      ], { r: 0.05, tension: 0.5 }));
    }
  }
  // out again: under the floor to the outflow valve near the tail
  geos.push(pipe([[-14, 2.0, FUSE_Z], [0, 1.25, FUSE_Z], [16, 1.3, FUSE_Z], [24.2, 1.75, FUSE_Z], [24.8, 0.9, FUSE_Z]], { r: 0.06 }));
  return mergeGeometries(geos);
}

function buildHyd() {
  const geos = [];
  const hub = [6.4, 2.1, FUSE_Z];
  for (const z of ENGINE_Z) {
    const s = sideOf(z);
    geos.push(pipe([[ENGINE_X + 2.7, -0.95, z], [ENGINE_X + 4.4, 1.5, z], wingPt(z, 0.6), ...spar(z, 0.6).slice(1), [6.4, 2.1, FUSE_Z + s * 2.2], hub]));
  }
  for (const s of [1, -1]) {
    geos.push(pipe([hub, [MAIN_GEAR.x, MAIN_GEAR.y, FUSE_Z + s * MAIN_GEAR.out], [MAIN_GEAR.x, 0.4, FUSE_Z + s * MAIN_GEAR.out]])); // main gear
    // out along the back of the wing: flaps and spoilers
    const pts = [];
    for (const z of [3.7, 6, 9, 12, 14.5]) pts.push(wingPt(FUSE_Z + s * z, 0.7, 0.05));
    geos.push(pipe([[6.4, 2.1, FUSE_Z + s * 2.2], ...pts]));
  }
  geos.push(pipe([hub, [0, 1.3, FUSE_Z], [-12, 1.2, FUSE_Z], [NOSE_GEAR.x, NOSE_GEAR.y, FUSE_Z], [NOSE_GEAR.x, 0.2, FUSE_Z]])); // nose gear
  geos.push(pipe([hub, [16, 1.9, FUSE_Z], [25, 3.4, FUSE_Z], [27.5, 4.4, FUSE_Z], [28.6, 8.6, FUSE_Z]])); // tail controls
  return mergeGeometries(geos);
}

function buildElec() {
  const geos = [];
  for (const z of ENGINE_Z) {
    const s = sideOf(z);
    geos.push(pipe([[ENGINE_X + 2.2, -0.7, z], [ENGINE_X + 3.6, 1.4, z], wingPt(z, 0.08, 0.08), ...spar(z, 0.08).slice(1), [-2.2, 2.3, FUSE_Z + s * 2.6]], { r: 0.07 }));
  }
  for (const s of [1, -1]) {
    // forward under the floor to the electronics bay, and up to the flight deck
    geos.push(pipe([[-2.2, 2.3, FUSE_Z + s * 2.6], [-12, 2.2, FUSE_Z + s * 2.2], [-21.5, 2.3, FUSE_Z + s * 1.1], [-23.4, 3.4, FUSE_Z + s * 0.7], [-24.3, 4.9, FUSE_Z + s * 0.5]], { r: 0.07 }));
  }
  geos.push(cube(1.6, 0.7, 1.8, [-21.8, 2.3, FUSE_Z])); // electronics bay
  // the cabin's lights and sockets
  geos.push(pipe([[-2.2, 2.3, FUSE_Z + 2.6], [-2.4, FUSE_Y + 1.5, FUSE_Z + 2.7], [-3, FUSE_Y + 2.35, FUSE_Z + 1.6], [10, FUSE_Y + 2.4, FUSE_Z + 1.5], [21, FUSE_Y + 2.3, FUSE_Z + 1.2]], { r: 0.055 }));
  return mergeGeometries(geos);
}

export function createSystems() {
  const group = new THREE.Group();
  group.visible = false;
  const time = { value: 0 };
  const gain = { value: 1 };
  const make = (geo, [hot, cool]) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: { uTime: time, uGain: gain, uAlpha: { value: 0 }, uHot: { value: new THREE.Color(hot) }, uCool: { value: new THREE.Color(cool) } },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.layers.set(LAYER.OVERLAY);
    mesh.renderOrder = 6;
    mesh.frustumCulled = false;
    mesh.userData.noPick = true;
    mesh.visible = false;
    group.add(mesh);
    return mesh;
  };
  const lines = {
    air: make(buildAir(), COLORS.air),
    hyd: make(buildHyd(), COLORS.hyd),
    elec: make(buildElec(), COLORS.elec),
  };
  return {
    group,
    setGain(g) {
      gain.value = g;
    },
    /** @param {{air: number, hyd: number, elec: number} | null} s strengths 0..1 */
    update(t, s) {
      let any = false;
      for (const k of ['air', 'hyd', 'elec']) {
        const a = s ? s[k] ?? 0 : 0;
        lines[k].visible = a > 0.01;
        lines[k].material.uniforms.uAlpha.value = a;
        any ||= a > 0.01;
      }
      group.visible = any;
      time.value = t;
    },
  };
}
