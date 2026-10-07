import * as THREE from 'three';
import { clipPlanes } from './materials.js';
import { CORE_CAS, CORE_HUB, BYP_IN, BYP_OUT, REVERSER_X, glslTable } from './flowpath.js';

/**
 * GPU airflow: every streak is a camera-facing quad stretched between a "head" and a "tail" point
 * that are computed in the vertex shader from a path function — no per-frame CPU work.
 *
 * lane 0 = core (through the compressors, combustor, turbines)
 * lane 1 = bypass (around the core, the thrust-makers)
 * lane 2 = ambient air sliding past the nacelle
 */

const vert = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uAmbient;
  uniform float uDensity;
  uniform float uWidth;
  uniform float uBypass;   // 1 = turbofan, 0 = turbojet (no bypass stream)
  uniform float uReverse;  // 0 = normal, 1 = thrust reverser deployed
  uniform vec2  uRes;
  uniform vec4  uPhase; // suck, squeeze, bang, blow (0..1)

  attribute vec4 aSeed;   // lane, radial fraction, angle, random
  attribute vec2 aCorner; // x: 0 head / 1 tail, y: side -1 / +1

  varying float vAlpha;
  varying vec3  vColor;

  #include <clipping_planes_pars_vertex>

  // piecewise-linear lookup tables (x, r), generated from scene/flowpath.js
  ${glslTable('CORE_CAS', CORE_CAS)}
  ${glslTable('CORE_HUB', CORE_HUB)}
  ${glslTable('BYP_IN', BYP_IN)}
  ${glslTable('BYP_OUT', BYP_OUT)}
  const float REV_X = ${REVERSER_X.toFixed(3)};

  float pw(float x, vec2 p[8]) {
    if (x <= p[0].x) return p[0].y;
    for (int i = 1; i < 8; i++) {
      if (x <= p[i].x) {
        float t = (x - p[i-1].x) / (p[i].x - p[i-1].x);
        return mix(p[i-1].y, p[i].y, t);
      }
    }
    return p[7].y;
  }

  vec3 flowPos(float x, float lane, float f, float ang, out vec3 col, out float vis) {
    float r;
    float xo = x;
    float ri = lane < 0.5 ? mix(0.47, 0.76, f) : mix(0.86, 1.36, f);
    float cap = clamp(-x / 2.6, 0.0, 1.0);
    float swirl = ang;
    vis = 1.0;

    if (lane < 1.5) {
      float band;
      if (lane < 0.5) {
        float cas = pw(x, CORE_CAS);
        float hub = pw(x, CORE_HUB);
        band = mix(hub + 0.02, cas - 0.02, f);
        if (x > 7.1) band = mix(0.03, 0.46, f) * (1.0 + (x - 7.1) * 0.3);
        swirl += x * 1.4;
      } else {
        float a = pw(x, BYP_IN);
        float b = pw(x, BYP_OUT);
        band = mix(a, b, f);
        if (x > 6.05) band *= 1.0 + (x - 6.05) * 0.12;
        swirl += x * 0.45;
      }
      r = mix(ri * (1.0 + 0.45 * cap), band, smoothstep(1.0, 1.6, x));
    } else {
      r = 1.95 + f * 2.5 + 0.35 * exp(-(x - 1.4) * (x - 1.4) / 5.0);
      vis = 0.5;
    }

    // temperature colouring
    vec3 cold = vec3(0.34, 0.60, 1.0);
    vec3 warm = vec3(1.0, 0.70, 0.34);
    vec3 hot  = vec3(1.0, 0.86, 0.62);
    if (lane < 0.5) {
      col = mix(cold, warm, smoothstep(2.2, 4.2, x));
      col = mix(col, hot, smoothstep(4.1, 4.7, x) * (1.0 - smoothstep(5.0, 5.6, x)));
      col = mix(col, warm * 0.95, smoothstep(5.2, 6.2, x));
      vis = 1.0 - 0.5 * smoothstep(7.2, 10.0, x);
    } else if (lane < 1.5) {
      col = mix(cold, vec3(0.62, 0.62, 0.95), smoothstep(1.5, 5.5, x));
      col = mix(col, vec3(1.0, 0.62, 0.38), smoothstep(6.0, 8.5, x) * 0.55 * (1.0 - uReverse));
      vis = (1.0 - 0.6 * smoothstep(6.0, 9.0, x)) * uBypass;

      // thrust reverser: the blocker doors shut the duct, the air leaves through the cascade
      // in the side of the nacelle and is thrown outwards and forwards
      float q = x - REV_X;
      if (uReverse > 0.001 && q > 0.0) {
        float r0 = mix(pw(REV_X, BYP_IN), pw(REV_X, BYP_OUT), f);
        float rr = mix(r0, 1.56, smoothstep(0.0, 0.5, q)) + 0.85 * max(q - 0.4, 0.0);
        float xr = REV_X + 0.5 * (1.0 - exp(-2.5 * q)) - 0.8 * max(q - 0.35, 0.0);
        r = mix(r, rr, uReverse);
        xo = mix(x, xr, uReverse);
        vis *= mix(1.0, 1.0 - smoothstep(1.2, 2.6, q), uReverse); // gone before it would reach the nozzle
        col = mix(col, vec3(0.62, 0.78, 1.0), uReverse);
      }
    } else {
      col = vec3(0.45, 0.50, 0.98);
    }
    return vec3(xo, r * sin(swirl), r * cos(swirl));
  }

  void main() {
    float lane = aSeed.x;
    float rnd = aSeed.w;
    float spd = mix(0.055, 0.1, fract(rnd * 7.13));
    if (lane < 0.5) spd *= 0.9;
    float s = fract(rnd + uTime * spd);

    float xa = lane > 1.5 ? -5.0 : -4.0;
    float xb = lane > 1.5 ? 12.5 : 11.4;
    float len = lane > 1.5 ? 0.028 : 0.014 + 0.02 * fract(rnd * 3.7);

    vec3 colH, colT; float visH, visT;
    float xH = mix(xa, xb, s);
    vec3 pH = flowPos(xH, lane, aSeed.y, aSeed.z, colH, visH);
    vec3 pT = flowPos(mix(xa, xb, s - len), lane, aSeed.y, aSeed.z, colT, visT);

    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 cH = mvp * vec4(pH, 1.0);
    vec4 cT = mvp * vec4(pT, 1.0);
    vec2 nH = cH.xy / cH.w;
    vec2 nT = cT.xy / cT.w;
    vec2 dpx = (nT - nH) * uRes * 0.5;
    vec2 dir = length(dpx) > 0.0001 ? normalize(dpx) : vec2(1.0, 0.0);
    vec2 perp = vec2(-dir.y, dir.x);

    bool tail = aCorner.x > 0.5;
    vec4 c = tail ? cT : cH;
    vec3 p = tail ? pT : pH;
    c.xy += perp * aCorner.y * uWidth / uRes * c.w;
    gl_Position = c;

    // ambient air is never sliced by the cutaway plane (it is faded out by uAmbient instead)
    vec4 mvPosition = lane > 1.5 ? viewMatrix * vec4(0.0, 0.0, -100.0, 1.0) : modelViewMatrix * vec4(p, 1.0);
    #include <clipping_planes_vertex>

    // region emphasis follows the active stage (measured along the path, not after any turn)
    float x = xH;
    float wSuck = 1.0 - smoothstep(1.2, 2.3, x);
    float wSqz  = smoothstep(1.3, 1.9, x) * (1.0 - smoothstep(4.0, 4.4, x));
    float wBang = smoothstep(3.9, 4.2, x) * (1.0 - smoothstep(5.0, 5.5, x));
    float wBlow = smoothstep(5.0, 5.6, x);
    float emph = dot(uPhase, vec4(wSuck, wSqz, wBang, wBlow));

    float life = smoothstep(0.0, 0.06, s) * (1.0 - smoothstep(0.84, 1.0, s));
    float keep = step(rnd * 0.999, uDensity);
    float taper = tail ? 0.0 : 1.0;
    float strength = lane > 1.5 ? uAmbient : uStrength * (0.42 + 0.6 * emph);
    vAlpha = clamp(life * keep * taper * strength * (tail ? 1.0 : visH), 0.0, 1.0);
    vColor = (tail ? colT : colH) * (0.95 + 0.55 * emph);
  }
`;

const frag = /* glsl */ `
  uniform float uGain; // keeps the streaks at their authored brightness under any exposure
  varying float vAlpha;
  varying vec3 vColor;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    gl_FragColor = vec4(vColor * uGain, vAlpha);
  }
`;

export function createAirflow() {
  const counts = [
    [0, 3600],
    [1, 4600],
    [2, 2000],
  ];
  const total = counts.reduce((a, [, n]) => a + n, 0);
  const seed = new Float32Array(total * 4 * 4);
  const corner = new Float32Array(total * 4 * 2);
  const pos = new Float32Array(total * 4 * 3);
  const index = new Uint32Array(total * 6);

  const rng = mulberry32(1337);
  let k = 0;
  for (const [lane, n] of counts) {
    for (let i = 0; i < n; i++, k++) {
      const f = Math.sqrt(rng());
      const ang = rng() * Math.PI * 2;
      const r = rng();
      for (let v = 0; v < 4; v++) {
        const o = (k * 4 + v) * 4;
        seed[o] = lane;
        seed[o + 1] = f;
        seed[o + 2] = ang;
        seed[o + 3] = r;
        const c = (k * 4 + v) * 2;
        corner[c] = v < 2 ? 0 : 1; // head | tail
        corner[c + 1] = v % 2 === 0 ? -1 : 1;
      }
      const b = k * 4;
      const ii = k * 6;
      index.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], ii);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, // screen-space quads wind clockwise
    clipping: true,
    clippingPlanes: clipPlanes,
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uAmbient: { value: 0.38 },
      uDensity: { value: 1 },
      uWidth: { value: 1.6 },
      uBypass: { value: 1 },
      uReverse: { value: 0 },
      uGain: { value: 1 },
      uRes: { value: new THREE.Vector2(1280, 720) },
      uPhase: { value: new THREE.Vector4() },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
