import * as THREE from 'three';
import { clipPlanes } from './materials.js';
import { LAYER } from './layers.js';

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Open cone behind the nozzle, uv.x = 0 at the nozzle → 1 downstream, uv.y around. */
function trailGeometry(r0, r1, len, segs) {
  const geo = new THREE.CylinderGeometry(r0, r1, len, segs, 1, true).rotateZ(Math.PI / 2);
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + len / 2) / len, uv.getX(i));
  return geo;
}

const noiseGLSL = /* glsl */ `
  float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
`;

const plumeVert = /* glsl */ `
  varying vec2 vUv;
  #include <clipping_planes_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const plumeFrag = /* glsl */ `
  uniform float uTime;
  uniform float uAmt;
  uniform float uGain;
  uniform float uBurn; // afterburner: a longer, bluer flame with shock diamonds in it
  varying vec2 vUv;
  #include <clipping_planes_pars_fragment>
  ${noiseGLSL}
  void main() {
    #include <clipping_planes_fragment>
    float along = vUv.x;
    float streak = n(vec2(along * 6.0 - uTime * 5.0, vUv.y * 24.0));
    float streak2 = n(vec2(along * 14.0 - uTime * 9.0, vUv.y * 40.0 + 7.0));
    float body = pow(clamp(1.0 - along, 0.0, 1.0), mix(1.6, 0.85, uBurn)); // clamp: pow of a negative is NaN
    float diamonds = pow(0.5 + 0.5 * cos(along * 30.0 - 0.8), 6.0) * clamp(1.0 - along * 1.15, 0.0, 1.0) * uBurn;
    float a = (body * (0.35 + 0.9 * streak * streak2) + 0.8 * diamonds) * uAmt;
    vec3 col = mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.45, 0.12), smoothstep(0.0, 0.55, along));
    vec3 reheat = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.5, 0.18), smoothstep(0.05, 0.75, along));
    col = mix(col, reheat * 0.7, uBurn) + vec3(1.0, 0.92, 0.75) * diamonds * 0.6;
    a = min(a, 1.1);
    gl_FragColor = vec4(col * a * uGain, a * 0.8);
  }
`;

// Heat haze: writes a screen-space UV offset (rg) into post.js's haze buffer.
// Depth-tested by hand against the scene depth, so the nacelle in front is never warped.
const hazeVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  varying float vZ;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = -mv.xyz;
    vZ = -mv.z;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const hazeFrag = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uAmt;
  uniform float uNear;
  uniform float uFar;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  varying float vZ;
  ${noiseGLSL}
  float linZ(float d) { return uNear * uFar / (uFar - d * (uFar - uNear)); }
  void main() {
    float sceneZ = linZ(texture2D(tDepth, gl_FragCoord.xy / uRes).x);
    float soft = clamp((sceneZ - vZ) / 0.6, 0.0, 1.0);
    if (soft <= 0.0) discard;
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float along = vUv.x;
    float m = facing * facing * smoothstep(0.0, 0.12, along) * (1.0 - smoothstep(0.35, 1.0, along)) * soft * uAmt;
    vec2 p = vec2(along * 9.0 - uTime * 3.2, vUv.y * 10.0);
    vec2 off = vec2(n(p) - 0.5, n(p * 1.7 + 4.1) - 0.5);
    gl_FragColor = vec4(off * m, 0.0, m);
  }
`;

export function createEffects(engine) {
  const glowTex = radialTexture([
    [0, 'rgba(255,255,235,1)'],
    [0.25, 'rgba(255,200,120,0.75)'],
    [0.6, 'rgba(255,120,40,0.25)'],
    [1, 'rgba(255,90,20,0)'],
  ]);
  const spriteMats = [];
  const mkSprite = (scale) => {
    const m = new THREE.SpriteMaterial({
      map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
    });
    const s = new THREE.Sprite(m);
    s.scale.setScalar(scale);
    s.renderOrder = 4;
    spriteMats.push(m);
    s.userData.noPick = true;
    s.layers.set(LAYER.OVERLAY);
    return s;
  };
  const flame = mkSprite(2.6);
  flame.position.set(4.55, 0, 0);
  engine.parts.combustor.add(flame);

  const tip = mkSprite(1.6);
  tip.position.set(7.35, 0, 0);
  engine.parts.lpTurbine.add(tip);

  const hpGlow = mkSprite(1.1);
  hpGlow.position.set(5.3, 0, 0);
  engine.parts.hpTurbine.add(hpGlow);

  // things going wrong: flame bursting out of the front, and sparks streaming out of the back
  const surge = mkSprite(3.4);
  surge.position.set(0.5, 0, 0);
  engine.parts.fanCowl.add(surge);
  const sparks = [];
  for (let i = 0; i < 16; i++) {
    const s = mkSprite(0.1);
    engine.parts.lpTurbine.add(s);
    sparks.push({ s, speed: 0.55 + 0.5 * ((i * 0.618) % 1), phase: (i * 0.377) % 1, a: i * 2.4, r: 0.1 + 0.3 * ((i * 0.271) % 1) });
  }

  const plumeMat = new THREE.ShaderMaterial({
    vertexShader: plumeVert,
    fragmentShader: plumeFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    clipping: true,
    clippingPlanes: clipPlanes,
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uGain: { value: 1 }, uBurn: { value: 0 } },
  });
  const plume = new THREE.Mesh(trailGeometry(0.16, 0.75, 4.2, 40), plumeMat);
  plume.position.set(7.35 + 2.1, 0, 0);
  plume.renderOrder = 4;
  plume.userData.noPick = true;
  plume.layers.set(LAYER.OVERLAY);
  engine.parts.lpTurbine.add(plume);

  // heat haze volume: core exhaust only (the bypass stream is barely warmer than ambient)
  const hazeMat = new THREE.ShaderMaterial({
    vertexShader: hazeVert,
    fragmentShader: hazeFrag,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      tDepth: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uAmt: { value: 0 },
      uNear: { value: 0.1 },
      uFar: { value: 900 },
    },
  });
  const haze = new THREE.Mesh(trailGeometry(0.34, 1.15, 4.8, 32), hazeMat);
  haze.position.set(7.1 + 2.4, 0, 0);
  haze.userData.noPick = true;
  haze.frustumCulled = false;
  haze.layers.set(LAYER.HAZE);
  engine.parts.lpTurbine.add(haze);

  return {
    haze,
    /** Scale the glows and the plume to the scene's exposure. */
    setGain(g) {
      for (const m of spriteMats) m.color.setScalar(g);
      plumeMat.uniforms.uGain.value = g;
    },
    update(time, s) {
      flame.material.opacity = Math.min(1, 0.05 + 0.95 * s.bang) * s.hot;
      flame.scale.setScalar(2.2 + 0.7 * s.bang + 0.12 * Math.sin(time * 23));
      hpGlow.material.opacity = (0.06 + 0.4 * s.blow + 0.2 * s.bang) * s.hot;
      const burn = s.burner ?? 0;
      tip.material.opacity = Math.min(1, (0.18 + 0.5 * s.blow) * s.hot + 0.25 * burn);
      tip.scale.setScalar(1.4 + 0.5 * s.blow + 0.5 * burn + 0.08 * Math.sin(time * 31));
      plumeMat.uniforms.uBurn.value = burn;
      plume.scale.x = 1 + 1.2 * burn; // the flame reaches further back
      plume.position.x = 7.35 + 2.1 * plume.scale.x;
      plumeMat.uniforms.uTime.value = time;
      const torch = s.torch ?? 0;
      plumeMat.uniforms.uAmt.value = s.flow * (0.12 + 0.42 * s.blow) * (1 + 1.1 * (s.jet ?? 0)) + 1.6 * torch + 0.6 * (s.surge ?? 0) + 0.3 * (s.burner ?? 0);
      surge.material.opacity = Math.min(1, s.surge ?? 0);
      surge.scale.setScalar(2.6 + 1.6 * (s.surge ?? 0));
      const sp = s.sparks ?? 0;
      for (const k of sparks) {
        const u = (time * k.speed + k.phase) % 1;
        k.s.visible = sp > 0.01;
        if (!k.s.visible) continue;
        const spread = k.r * (0.3 + 1.6 * u);
        k.s.position.set(7.3 + 5.5 * u, spread * Math.sin(k.a) - 0.5 * u * u, spread * Math.cos(k.a));
        k.s.material.opacity = sp * (1 - u) * (1 - u);
        k.s.scale.setScalar(0.07 + 0.09 * (1 - u));
      }
      hazeMat.uniforms.uTime.value = time;
      hazeMat.uniforms.uAmt.value = 0.55 + 0.45 * Math.min(1, s.hot * 1.6); // engine running → always some shimmer
    },
  };
}

/**
 * Fan motion blur: trailing copies of the blade ring at earlier rotation angles, fading out.
 * arc = angular speed × shutter. At the lesson's slowed spin a real 1/60 s shutter would show
 * nothing, so the shutter is long on purpose.
 */
export function createFanBlur(engine, { copies = 5, shutter = 0.12 } = {}) {
  const { rotor, blades } = engine.fan;
  const src = blades.material;
  const list = [];
  for (let i = 1; i <= copies; i++) {
    const m = src.clone();
    m.clippingPlanes = clipPlanes;
    m.transparent = true;
    m.depthWrite = false;
    m.opacity = 0.42 * (1 - i / (copies + 1));
    const mesh = new THREE.Mesh(blades.geometry, m);
    mesh.userData.noPick = true;
    mesh.receiveShadow = true;
    rotor.add(mesh);
    list.push(mesh);
  }
  return {
    enabled: true,
    shutter,
    update(omega) {
      const arc = omega * this.shutter;
      list.forEach((mesh, i) => {
        mesh.visible = this.enabled && arc > 0.003;
        mesh.rotation.x = (-arc * (i + 1)) / list.length;
        mesh.material.color.copy(src.color);
        mesh.material.emissive.copy(src.emissive);
        mesh.material.emissiveIntensity = src.emissiveIntensity;
      });
    },
  };
}
