import * as THREE from 'three';
import { SKY_LOOKUP } from './environment.js';
import { LAYER } from './layers.js';
import { FUSE_Z, GROUND_Y, MAIN_GEAR } from './airframe.js';

// The runway. The aircraft never moves: the ground slides under it (uTravel) and rises to meet
// the wheels. One big lit plane whose colour is drawn in the shader from world coordinates:
// asphalt, paint, shoulders and grass, fading into the horizon's own colour with distance so its
// edge is never seen. The lights are points, so they stay crisp however far away they are.

const RUNWAY = {
  halfWidth: 22.5,
  fog: 1500, // metres to ~63 % haze
  lightSpan: 3000, // the lights repeat over this length
};

const groundGLSL = /* glsl */ `
  uniform float uTravel;
  uniform float uCentre;
  uniform float uFog;
  uniform float uAlpha;
  varying vec3 vGround;
  ${SKY_LOOKUP}

  float gHash(vec2 p) { return fract(sin(dot(p, vec2(91.7, 247.3))) * 43758.5453); }
  float gNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y);
  }
  // 1 inside a band of half-width h around 0, with an edge as soft as one pixel
  float band(float d, float h, float aa) { return 1.0 - smoothstep(h - aa, h + aa, abs(d)); }

  void groundSurface(vec2 P, out vec3 col, out float rough) {
    float s = P.x - uTravel;          // along the runway
    float w = P.y - uCentre;          // across it: 0 on the centreline
    float aw = abs(w);
    float aaw = fwidth(w) * 1.2 + 0.01;
    float aas = fwidth(s) * 1.2 + 0.01;

    float n1 = gNoise(vec2(s, w) * 0.31);
    float n2 = gNoise(vec2(s, w) * 2.7);
    float n3 = gNoise(vec2(s * 0.015, w * 0.55));

    vec3 asphalt = vec3(0.088, 0.089, 0.096) * (0.78 + 0.3 * n1 + 0.16 * n2);
    // tyre rubber, laid down where main wheels have been meeting the runway for years
    float rubber = (1.0 - smoothstep(1.5, 7.5, abs(aw - 4.0))) * (0.45 + 0.55 * n3);
    asphalt *= 1.0 - 0.42 * rubber;
    vec3 shoulder = vec3(0.10, 0.10, 0.105) * (0.85 + 0.25 * n1);
    vec3 grass = mix(vec3(0.034, 0.052, 0.026), vec3(0.066, 0.074, 0.036), gNoise(vec2(s, w) * 0.045));
    grass *= 0.75 + 0.5 * gNoise(vec2(s, w) * 0.8);

    float onRunway = 1.0 - smoothstep(${RUNWAY.halfWidth.toFixed(1)} - aaw, ${RUNWAY.halfWidth.toFixed(1)} + aaw, aw);
    float onShoulder = 1.0 - smoothstep(30.0 - aaw, 30.0 + aaw, aw);
    col = mix(grass, shoulder, onShoulder);
    col = mix(col, asphalt, onRunway);
    rough = mix(0.96, 0.9, onRunway);

    // paint
    float paint = band(aw - 21.0, 0.45, aaw);                                    // side stripes
    float cs = mod(s, 50.0);
    paint = max(paint, band(w, 0.45, aaw) * band(cs - 15.0, 15.0, aas));         // centreline dashes
    float ts = mod(s, 150.0);                                                    // touchdown-zone bars
    float bars = max(band(aw - 9.9, 0.9, aaw), max(band(aw - 13.2, 0.9, aaw), band(aw - 16.5, 0.9, aaw)));
    paint = max(paint, bars * band(ts - 11.25, 11.25, aas));
    float worn = 0.72 + 0.28 * n2 - 0.35 * rubber;
    col = mix(col, vec3(0.56, 0.56, 0.54) * worn, paint * onRunway * 0.92);
    rough = mix(rough, 0.72, paint * onRunway);
  }
`;

const lightVert = /* glsl */ `
  uniform float uTravel;
  uniform float uSpan;
  uniform float uScale;
  uniform float uFog;
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vec3 p = position;
    p.x = mod(p.x + uTravel + uSpan * 0.5, uSpan) - uSpan * 0.5; // slides with the runway, and repeats
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = length(mv.xyz);
    vFade = exp(-pow(d / uFog, 1.5)) * smoothstep(uSpan * 0.5, uSpan * 0.42, abs(p.x));
    vColor = aColor;
    gl_PointSize = clamp(aSize * uScale / max(d, 1.0), 2.0, 26.0);
  }
`;
const lightFrag = /* glsl */ `
  uniform float uGain;
  uniform float uAlpha;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r = length(q) * 2.0;
    float core = 1.0 - smoothstep(0.0, 0.45, r);
    float halo = pow(max(0.0, 1.0 - r), 2.2) * 0.35;
    float a = (core + halo) * vFade * uAlpha;
    gl_FragColor = vec4(vColor * uGain * a, a);
  }
`;

/**
 * @param {object} env  the environment (for the sky uniforms the haze is matched to)
 */
export function createGround(env) {
  const group = new THREE.Group();
  group.visible = false;

  const U = {
    uTravel: { value: 0 },
    uCentre: { value: FUSE_Z },
    uFog: { value: RUNWAY.fog },
    uAlpha: { value: 1 },
    uHdr: env.uniforms.uHdr,
    uPhoto: env.uniforms.uPhoto,
    uYaw: env.uniforms.uYaw,
    uSun: env.uniforms.uSun,
  };

  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${groundGLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 gCol; float gRough;
        groundSurface(vGround.xz, gCol, gRough);
        diffuseColor.rgb = gCol;`
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        {
          // haze: by a few kilometres out the ground is the colour of the horizon behind it
          vec3 toP = vGround - cameraPosition;
          float d = length(toP);
          float f = 1.0 - exp(-pow(d / uFog, 1.5));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, horizonAt(toP / d), f);
          gl_FragColor.a = uAlpha;
        }`
      );
  };
  mat.customProgramCacheKey = () => 'runway';
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000).rotateX(-Math.PI / 2), mat);
  plane.receiveShadow = true;
  plane.userData.noPick = true;
  plane.renderOrder = -5; // while it fades in or out it is see-through: draw it before anything else that is
  group.add(plane);

  // ── lights ──
  const pos = [];
  const col = [];
  const size = [];
  const add = (x, z, c, s) => {
    pos.push(x, 0.12, z);
    col.push(...c);
    size.push(s);
  };
  const white = [1.0, 0.94, 0.8];
  const half = RUNWAY.lightSpan / 2;
  for (let x = -half; x < half; x += 60) {
    add(x, FUSE_Z + RUNWAY.halfWidth + 0.8, white, 1.25);
    add(x, FUSE_Z - RUNWAY.halfWidth - 0.8, white, 1.25);
  }
  for (let x = -half; x < half; x += 15) add(x, FUSE_Z, [1.0, 0.97, 0.9], 0.8);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  const lightMat = new THREE.ShaderMaterial({
    vertexShader: lightVert,
    fragmentShader: lightFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTravel: U.uTravel,
      uSpan: { value: RUNWAY.lightSpan },
      uScale: { value: 400 },
      uFog: U.uFog,
      uGain: { value: 1 },
      uAlpha: U.uAlpha,
    },
  });
  const lights = new THREE.Points(geo, lightMat);
  lights.frustumCulled = false;
  lights.layers.set(LAYER.OVERLAY);
  lights.userData.noPick = true;
  group.add(lights);

  // ── tyre smoke: a few soft puffs left behind by the main wheels at touchdown ──
  const puffTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const puffs = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const m = new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 });
      const sp = new THREE.Sprite(m);
      sp.layers.set(LAYER.OVERLAY);
      sp.userData.noPick = true;
      sp.visible = false;
      group.add(sp);
      puffs.push({ sp, side, i });
    }
  }
  let smokeGain = 1;

  return {
    group,
    /** Light points are unlit: keep them at the same brightness on screen under any exposure. */
    setGain(g, unlit = 1) {
      lightMat.uniforms.uGain.value = g;
      smokeGain = 0.5 * unlit;
    },
    /** @param {number | null} age seconds since the wheels touched, or null */
    smoke(age) {
      for (const { sp, side, i } of puffs) {
        const a = age == null ? -1 : age - i * 0.07;
        const on = a > 0 && a < 2.4;
        sp.visible = on;
        if (!on) continue;
        // left behind by the aircraft: it drifts aft and swells
        sp.position.set(MAIN_GEAR.x + 0.4 + (10 + 3 * i) * a, 0.5 + (1.1 + 0.3 * i) * a, FUSE_Z + side * (MAIN_GEAR.out + 0.25 * (i - 1.5)));
        sp.scale.setScalar(1.4 + (4.2 + i) * a);
        sp.material.opacity = 0.55 * Math.min(1, a / 0.12) * Math.pow(1 - a / 2.4, 1.6);
        sp.material.color.setScalar(smokeGain);
      }
    },
    /** Point size follows the drawing buffer height and the lens. */
    setScale(pxPerMetreAt1m) {
      lightMat.uniforms.uScale.value = pxPerMetreAt1m;
    },
    /**
     * @param {{agl: number, travel: number, alpha?: number} | null} g
     *   agl: metres between the wheels and the runway; travel: metres rolled along it
     */
    update(g) {
      group.visible = !!g && (g.alpha ?? 1) > 0.004;
      if (!group.visible) return;
      group.position.y = GROUND_Y - g.agl;
      U.uTravel.value = g.travel;
      U.uAlpha.value = g.alpha ?? 1;
      mat.transparent = U.uAlpha.value < 0.995;
      mat.depthWrite = !mat.transparent;
    },
  };
}
