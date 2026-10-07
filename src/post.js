import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { LAYER } from './scene/layers.js';

/**
 * Render pipeline (replaces the EffectComposer chain in experience.js).
 *
 *  1 BASE layer → scene target (half-float, 4× MSAA, depth texture). Shadow map updates here.
 *  2 AO: half-res SAO-style from the depth texture (normals rebuilt from depth, so the clip plane
 *    is respected for free), bilateral blur, depth-aware upsample, multiplied into the scene.
 *  3 OVERLAY layer on top, depth-tested: section faces, airflow, glows, plume. No AO on them.
 *  4 HAZE layer → half-res offset buffer.
 *  5 DOF: CoC from depth (thin lens: blur ∝ |1 − focus/z| / focus), half-res gather blur.
 *  6 Lens composite: haze warp, DOF blend, vignette, grain.
 *  7 Bloom (UnrealBloomPass, in place), 8 OutputPass: tone mapping + sRGB.
 */
export const POST = {
  maxPixelRatio: 1.5,
  msaa: 4,
  ao: { on: true, radius: 0.5, intensity: 1.2, bias: 0.04 },
  dof: { on: true, blurAt1m: 0.03, maxBlur: 8 }, // blurAt1m: CoC at infinity, focused at 1 m, × image width
  haze: { on: true, strength: 0.012 },
  bloom: { on: true, strength: 0.16, radius: 0.45, threshold: 1.0 },
  vignette: 0.22,
  grain: 0.03,
};

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const LINZ = /* glsl */ `uniform float uNear; uniform float uFar;
  float linZ(float d) { return uNear * uFar / (uFar - d * (uFar - uNear)); }`;

const AO_FRAG = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform vec2 uAoRes;
  uniform mat4 uProjInv;
  uniform float uProjScale;
  uniform float uRadius;
  uniform float uBias;
  uniform float uIntensity;
  varying vec2 vUv;
  #define SAMPLES 12
  vec3 viewPos(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main() {
    float d0 = texture2D(tDepth, vUv).x;
    if (d0 >= 0.999999) { gl_FragColor = vec4(1.0, 1e4, 0.0, 1.0); return; }
    vec3 P = viewPos(vUv);
    vec3 Pr = viewPos(vUv + vec2(uTexel.x, 0.0));
    vec3 Pl = viewPos(vUv - vec2(uTexel.x, 0.0));
    vec3 Pu = viewPos(vUv + vec2(0.0, uTexel.y));
    vec3 Pd = viewPos(vUv - vec2(0.0, uTexel.y));
    vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
    vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
    vec3 cr = cross(dx, dy);
    if (dot(cr, cr) < 1e-24) { gl_FragColor = vec4(1.0, -P.z, 0.0, 1.0); return; }
    vec3 N = normalize(cr);
    float rPx = clamp(uRadius * uProjScale / -P.z, 2.0, 90.0);
    float rot = ign(gl_FragCoord.xy) * 6.2831853;
    float r2 = uRadius * uRadius;
    float occ = 0.0;
    for (int i = 0; i < SAMPLES; i++) {
      float t = (float(i) + 0.5) / float(SAMPLES);
      float ang = float(i) * 2.3999632 + rot;
      vec3 S = viewPos(vUv + vec2(cos(ang), sin(ang)) * (t * rPx) / uAoRes);
      vec3 v = S - P;
      float vv = dot(v, v);
      occ += max(0.0, 1.0 - vv / r2) * max(0.0, dot(v, N) * inversesqrt(vv + 1e-5) - uBias);
    }
    float ao = clamp(1.0 - uIntensity * 2.0 * occ / float(SAMPLES), 0.0, 1.0);
    gl_FragColor = vec4(ao, -P.z, 0.0, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tAO;
  uniform vec2 uDir;
  varying vec2 vUv;
  float wt(int i) { return i == 1 ? 0.2 : i == 2 ? 0.14 : i == 3 ? 0.08 : 0.035; }
  void main() {
    vec2 c = texture2D(tAO, vUv).rg;
    float z0 = c.g;
    float sum = c.r * 0.25;
    float wsum = 0.25;
    for (int i = 1; i <= 4; i++) {
      for (int k = -1; k <= 1; k += 2) {
        vec2 s = texture2D(tAO, vUv + uDir * float(i * k)).rg;
        float w = wt(i) * exp(-abs(s.g - z0) / (0.015 * z0 + 0.01));
        sum += s.r * w;
        wsum += w;
      }
    }
    gl_FragColor = vec4(sum / wsum, z0, 0.0, 1.0);
  }
`;

const AO_APPLY_FRAG = /* glsl */ `
  uniform sampler2D tAO;
  uniform sampler2D tDepth;
  uniform vec2 uAoTexel;
  ${LINZ}
  varying vec2 vUv;
  void main() {
    float d = texture2D(tDepth, vUv).x;
    if (d >= 0.999999) { gl_FragColor = vec4(1.0); return; }
    float z = linZ(d);
    float sum = 0.0;
    float wsum = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(i == 0 || i == 2 ? -0.5 : 0.5, i < 2 ? -0.5 : 0.5);
      vec2 s = texture2D(tAO, vUv + o * uAoTexel).rg;
      float w = 1.0 / (abs(s.g - z) + 0.004 * z + 1e-4);
      sum += s.r * w;
      wsum += w;
    }
    gl_FragColor = vec4(vec3(sum / wsum), 1.0);
  }
`;

const COC = /* glsl */ `
  uniform float uFocus;
  uniform float uK;       // half-res px of blur at infinity, focused at 1 m
  uniform float uMaxBlur;
  float coc(float d) {
    if (d >= 0.999999) return min(uMaxBlur, uK / uFocus);
    return min(uMaxBlur, uK / uFocus * abs(1.0 - uFocus / linZ(d)));
  }
`;

const DOF_PREP_FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  ${LINZ}
  ${COC}
  varying vec2 vUv;
  void main() { gl_FragColor = vec4(texture2D(tColor, vUv).rgb, coc(texture2D(tDepth, vUv).x)); }
`;

// Single-pass gather (after D. Gustafsson): a sample only spreads onto this pixel if its own
// CoC reaches this far, so sharp edges never smear into blurred backgrounds.
const DOF_BLUR_FRAG = /* glsl */ `
  uniform sampler2D tPrep;
  uniform vec2 uTexel;
  uniform float uMaxBlur;
  varying vec2 vUv;
  void main() {
    vec4 c0 = texture2D(tPrep, vUv);
    vec3 acc = c0.rgb;
    float tot = 1.0;
    float radius = 0.85;
    float ang = 0.0;
    for (int i = 0; i < 56; i++) {
      if (radius >= uMaxBlur) break;
      vec4 s = texture2D(tPrep, vUv + vec2(cos(ang), sin(ang)) * uTexel * radius);
      float m = smoothstep(radius - 0.5, radius + 0.5, s.a);
      acc += mix(acc / tot, s.rgb, m);
      tot += 1.0;
      ang += 2.39996323;
      radius += 0.85 / radius;
    }
    gl_FragColor = vec4(acc / tot, c0.a);
  }
`;

const LENS_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tDof;
  uniform sampler2D tHaze;
  uniform sampler2D tDepth;
  uniform float uDof;
  uniform float uHaze;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uTime;
  uniform float uVeil;
  uniform vec3 uVeilColor;
  ${LINZ}
  ${COC}
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv + texture2D(tHaze, vUv).xy * uHaze;
    vec3 col = texture2D(tScene, uv).rgb;
    if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0); // one bad pixel would bloom into a black block
    if (uDof > 0.5) {
      float c = coc(texture2D(tDepth, uv).x);
      vec3 b = texture2D(tDof, uv).rgb;
      if (!any(isnan(b))) col = mix(col, b, smoothstep(0.3, 1.2, c));
    }
    col = mix(col, uVeilColor, uVeil); // cloud closing over the lens
    vec2 q = vUv - 0.5;
    col *= 1.0 - uVignette * dot(q, q) * 2.0;
    float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 97.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    col *= 1.0 + n * uGrain;
    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
`;

const quadMat = (frag, uniforms, extra = {}) =>
  new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra });

export function createPost(renderer, scene, camera, settings = POST) {
  const S = settings;
  const samples = Math.min(S.msaa, renderer.capabilities.maxSamples);
  const depthTexture = new THREE.DepthTexture(1, 1);
  const hf = { type: THREE.HalfFloatType, depthBuffer: false };
  const rtScene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthTexture });
  const rtAO = new THREE.WebGLRenderTarget(1, 1, hf);
  const rtAO2 = new THREE.WebGLRenderTarget(1, 1, hf);
  const rtHaze = new THREE.WebGLRenderTarget(1, 1, hf);
  const rtPrep = new THREE.WebGLRenderTarget(1, 1, hf);
  const rtBlur = new THREE.WebGLRenderTarget(1, 1, hf);
  const rtLens = new THREE.WebGLRenderTarget(1, 1, hf);

  const near = { value: camera.near };
  const far = { value: camera.far };
  const cocU = { uFocus: { value: 8 }, uK: { value: 10 }, uMaxBlur: { value: S.dof.maxBlur } };

  const aoMat = quadMat(AO_FRAG, {
    tDepth: { value: depthTexture }, uTexel: { value: new THREE.Vector2() }, uAoRes: { value: new THREE.Vector2() },
    uProjInv: { value: new THREE.Matrix4() }, uProjScale: { value: 1 },
    uRadius: { value: S.ao.radius }, uBias: { value: S.ao.bias }, uIntensity: { value: S.ao.intensity },
  });
  const blurMat = quadMat(BLUR_FRAG, { tAO: { value: null }, uDir: { value: new THREE.Vector2() } });
  const aoApply = quadMat(
    AO_APPLY_FRAG,
    { tAO: { value: rtAO.texture }, tDepth: { value: depthTexture }, uAoTexel: { value: new THREE.Vector2() }, uNear: near, uFar: far },
    {
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, // dst *= ao
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    }
  );
  const prepMat = quadMat(DOF_PREP_FRAG, { tColor: { value: rtScene.texture }, tDepth: { value: depthTexture }, uNear: near, uFar: far, ...cocU });
  const dofMat = quadMat(DOF_BLUR_FRAG, { tPrep: { value: rtPrep.texture }, uTexel: { value: new THREE.Vector2() }, uMaxBlur: cocU.uMaxBlur });
  const lensMat = quadMat(LENS_FRAG, {
    tScene: { value: rtScene.texture }, tDof: { value: rtBlur.texture }, tHaze: { value: rtHaze.texture }, tDepth: { value: depthTexture },
    uDof: { value: 1 }, uHaze: { value: 0 }, uVignette: { value: S.vignette }, uGrain: { value: S.grain }, uTime: { value: 0 },
    uVeil: { value: 0 }, uVeilColor: { value: new THREE.Color(1, 1, 1) },
    uNear: near, uFar: far, ...cocU,
  });

  const quad = new FullScreenQuad();
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), S.bloom.strength, S.bloom.radius, S.bloom.threshold);
  const output = new OutputPass();
  output.renderToScreen = true;

  const hazeMats = [];
  const size = new THREE.Vector2(1, 1);
  const black = new THREE.Color(0, 0, 0);

  const draw = (mat, target) => {
    renderer.setRenderTarget(target);
    quad.material = mat;
    quad.render(renderer);
  };

  function setSize(w, h) {
    size.set(w, h);
    const hw = Math.max(1, Math.ceil(w / 2));
    const hh = Math.max(1, Math.ceil(h / 2));
    rtScene.setSize(w, h);
    rtLens.setSize(w, h);
    for (const rt of [rtAO, rtAO2, rtHaze, rtPrep, rtBlur]) rt.setSize(hw, hh);
    aoMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    aoMat.uniforms.uAoRes.value.set(hw, hh);
    aoApply.uniforms.uAoTexel.value.set(1 / hw, 1 / hh);
    dofMat.uniforms.uTexel.value.set(1 / hw, 1 / hh);
    cocU.uK.value = S.dof.blurAt1m * hw;
    for (const m of hazeMats) m.uniforms.uRes.value.set(hw, hh);
    bloom.setSize(w, h);
  }

  function render(time, { shadows = true } = {}) {
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    near.value = camera.near;
    far.value = camera.far;
    renderer.shadowMap.needsUpdate = shadows;

    // 1 base
    camera.layers.set(LAYER.BASE);
    renderer.setRenderTarget(rtScene);
    renderer.setClearColor(black, 1);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);

    // 2 ambient occlusion
    if (S.ao.on) {
      const u = aoMat.uniforms;
      u.uProjInv.value.copy(camera.projectionMatrixInverse);
      u.uProjScale.value = 0.5 * u.uAoRes.value.y * camera.projectionMatrix.elements[5];
      u.uRadius.value = S.ao.radius;
      u.uIntensity.value = S.ao.intensity;
      u.uBias.value = S.ao.bias;
      draw(aoMat, rtAO);
      blurMat.uniforms.tAO.value = rtAO.texture;
      blurMat.uniforms.uDir.value.set(1.5 / rtAO.width, 0);
      draw(blurMat, rtAO2);
      blurMat.uniforms.tAO.value = rtAO2.texture;
      blurMat.uniforms.uDir.value.set(0, 1.5 / rtAO.height);
      draw(blurMat, rtAO);
      draw(aoApply, rtScene);
    }

    // 3 overlay
    camera.layers.set(LAYER.OVERLAY);
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);

    // 4 heat haze offsets
    if (S.haze.on) {
      camera.layers.set(LAYER.HAZE);
      renderer.setRenderTarget(rtHaze);
      renderer.setClearColor(black, 0);
      renderer.clear(true, false, false);
      for (const m of hazeMats) {
        m.uniforms.uNear.value = camera.near;
        m.uniforms.uFar.value = camera.far;
      }
      renderer.render(scene, camera);
    }
    camera.layers.set(LAYER.BASE);

    // 5 depth of field
    cocU.uMaxBlur.value = S.dof.maxBlur;
    if (S.dof.on) {
      draw(prepMat, rtPrep);
      draw(dofMat, rtBlur);
    }

    // 6 lens
    lensMat.uniforms.uDof.value = S.dof.on ? 1 : 0;
    lensMat.uniforms.uHaze.value = S.haze.on ? S.haze.strength : 0;
    lensMat.uniforms.uVignette.value = S.vignette;
    lensMat.uniforms.uGrain.value = S.grain;
    lensMat.uniforms.uTime.value = time;
    draw(lensMat, rtLens);

    // 7 bloom, 8 output
    if (S.bloom.on) {
      bloom.threshold = S.bloom.threshold;
      bloom.radius = S.bloom.radius;
      bloom.render(renderer, null, rtLens, 0, false);
    }
    output.render(renderer, null, rtLens);
    renderer.autoClear = ac;
  }

  return {
    settings: S,
    bloom,
    depthTexture,
    setSize,
    render,
    /** Lay cloud over the picture: `a` 0 → 1, `color` in scene light units. */
    setVeil(a, color) {
      lensMat.uniforms.uVeil.value = a;
      if (color) lensMat.uniforms.uVeilColor.value.copy(color);
    },
    /** Focus distance in metres along the view axis. */
    setFocus(d) {
      cocU.uFocus.value = Math.max(0.3, d);
    },
    /** Heat-haze materials read the scene depth and need the haze buffer size. */
    bindHaze(mat) {
      mat.uniforms.tDepth.value = depthTexture;
      mat.uniforms.uRes.value.set(Math.ceil(size.x / 2), Math.ceil(size.y / 2));
      hazeMats.push(mat);
    },
  };
}
