import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { LAYER } from './layers.js';

// ───────────── sky ─────────────
// Photographic sky above the horizon (CC0 HDRI, rotated so its sun lines up with the key light),
// a procedural cloud deck below it, lit with colours measured from the same HDRI.
// The same shader is baked through PMREM for reflections, with the sun clipped out of it:
// direct sun comes from the DirectionalLight, so it is not counted twice.
export const SKY = {
  // public/sky/, next to the pages (downloaded once from polyhaven.com, so the site stands alone)
  url: new URL('sky/belfast_sunset_puresky_2k.hdr', document.baseURI).href,
  credit: 'Belfast Sunset (Pure Sky) · Dimitrios Savva, Jarod Guest · Poly Haven · CC0',
  timeoutMs: 15000,
  envIntensity: 1.0,
  envClamp: 6.0, // radiance cap while baking reflections, × mean sky radiance (removes the sun)
  cloudScale: 0.9, // cloud size on the deck (bigger = smaller clouds)
};

// Key light: low golden sun from the outboard side, slightly aft. Side-lights the wing view,
// front-lights the cutaway, and drops the hero engine's shadow onto the inboard nacelle.
export const SUN = {
  elevationDeg: 12,
  azimuthDeg: 78.5, // atan2(z, x) in world space
  ratio: 3.2, // sun / sky illuminance on a surface facing the sun
  exposureKey: 0.78, // auto exposure: key-lit white lands at ~this before tone mapping
  shadow: { mapSize: 2048, extent: 11, near: 1, far: 90, bias: -0.0002, normalBias: 0.03, radius: 3 },
};

const rad = THREE.MathUtils.degToRad;
export const SUN_DIR = new THREE.Vector3(
  Math.cos(rad(SUN.elevationDeg)) * Math.cos(rad(SUN.azimuthDeg)),
  Math.sin(rad(SUN.elevationDeg)),
  Math.cos(rad(SUN.elevationDeg)) * Math.sin(rad(SUN.azimuthDeg))
);

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w; // always at far plane
  }
`;

/**
 * The sky as a function of direction, shared with anything that has to melt into it (the runway
 * fades to the horizon's own colour). Needs the uniforms uHdr, uPhoto, uYaw and uSun.
 */
export const SKY_LOOKUP = /* glsl */ `
  uniform sampler2D uHdr;
  uniform float uPhoto;
  uniform float uYaw;
  uniform vec3 uSun;
  // lod picks a mip of the photograph by hand: 0 = sharp. (An explicit lod also avoids the
  // one-pixel seam an equirect lookup gets where the angle wraps.)
  vec3 skyPhoto(vec3 d, float lod) {
    float c = cos(uYaw), s = sin(uYaw);
    vec3 r = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
    vec2 uv = vec2(atan(r.z, r.x) * 0.15915494 + 0.5, asin(clamp(r.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    return textureLod(uHdr, uv, lod).rgb;
  }
  vec3 skyProcedural(vec3 d) {
    float h = max(d.y, 0.0);
    float s = max(dot(d, uSun), 0.0);
    vec3 zen = vec3(0.10, 0.13, 0.30);
    vec3 hor = mix(vec3(0.55, 0.50, 0.66), vec3(1.30, 0.74, 0.44), pow(s, 3.0));
    vec3 col = mix(hor, zen, pow(smoothstep(0.0, 0.7, h), 0.6));
    return col + vec3(1.0, 0.7, 0.45) * pow(s, 90.0) * 6.0;
  }
  vec3 skyAt(vec3 d, float lod) { return uPhoto > 0.5 ? skyPhoto(d, lod) : skyProcedural(d); }
  // the colour of the horizon along this direction's azimuth
  vec3 horizonAt(vec3 d) { return skyAt(normalize(vec3(d.x, 0.07, d.z)), 5.5); }
`;

const skyFrag = /* glsl */ `
  varying vec3 vDir;
  ${SKY_LOOKUP}
  uniform vec3 uSunCol;  // sun radiance on cloud tops (chroma × strength)
  uniform vec3 uUp;      // mean upper-sky radiance
  uniform float uTime;
  uniform float uEnv;
  uniform float uClamp;
  uniform float uCloudScale;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return s;
  }

  float deck(vec2 p) { return fbm(p) * 0.75 + fbm(p * 3.3 + 7.1) * 0.35; }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    // Below a few degrees the photograph is held at one row, and any detail in that row would be
    // stretched into vertical stripes: so blur it away towards the horizon.
    float soft = 5.5 * (1.0 - smoothstep(0.03, 0.16, h));
    vec3 col = skyAt(normalize(vec3(d.x, max(h, 0.05), d.z)), soft);

    if (h < 0.03) {
      vec3 hz = horizonAt(d);
      float t = 1.0 / max(-h, 0.002);
      vec2 p = d.xz * t * uCloudScale + vec2(uTime * 0.006, 0.0);
      float dens = deck(p);
      vec2 toSun = normalize(uSun.xz + 1e-4) * 0.07;
      float lit = clamp(0.55 + (dens - deck(p + toSun)) * 4.0, 0.0, 1.0); // bumps facing the sun
      float cover = smoothstep(0.36, 0.62, dens);
      vec3 shade = uUp * 1.05;
      vec3 tops = shade + uSunCol * lit;
      vec3 gaps = uUp * 0.5;
      vec3 cloud = mix(gaps, tops, cover);
      cloud += uSunCol * pow(max(dot(d, uSun), 0.0), 6.0) * 0.6; // forward scatter
      // aerial perspective. It reaches the pure horizon colour just below the horizon line: up
      // there the deck is sampled along one row, and any cloud detail left in would show as stripes.
      float air = smoothstep(-0.26, -0.012, h);
      cloud = mix(cloud, hz, air * (0.92 + 0.08 * smoothstep(-0.06, -0.012, h)));
      col = mix(cloud, col, smoothstep(-0.002, 0.03, h));
    }
    if (uEnv > 0.5) col = min(col, vec3(uClamp));
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Brightest pixel (the sun), mean upper-sky radiance and sun colour, from a half-float equirect. */
function analyse(tex) {
  const { data, width: W, height: H } = tex.image;
  const half = THREE.DataUtils.fromHalfFloat;
  let best = -1;
  let bi = 0;
  let bj = 0;
  const up = [0, 0, 0];
  let wUp = 0;
  for (let j = 0; j < H; j += 2) {
    const el = (0.5 - (j + 0.5) / H) * Math.PI; // row 0 = zenith (flipY)
    if (el <= 0) continue;
    const w = Math.sin(el) * Math.cos(el); // cosine-weighted, per solid angle
    for (let i = 0; i < W; i += 2) {
      const o = (j * W + i) * 4;
      const r = half(data[o]);
      const g = half(data[o + 1]);
      const b = half(data[o + 2]);
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (L > best) {
        best = L;
        bi = i;
        bj = j;
      }
      const m = Math.min(1, 4 / Math.max(L, 1e-4)); // keep the sun out of the sky mean
      up[0] += r * m * w;
      up[1] += g * m * w;
      up[2] += b * m * w;
      wUp += w;
    }
  }
  const o = (bj * W + bi) * 4;
  const sun = new THREE.Color(half(data[o]), half(data[o + 1]), half(data[o + 2]));
  const az = ((bi + 0.5) / W - 0.5) * Math.PI * 2;
  const upC = new THREE.Color(up[0] / wUp, up[1] / wUp, up[2] / wUp);
  return { sunAz: az, sun, up: upC };
}

const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export async function setupEnvironment(scene, renderer, { onChange } = {}) {
  const uniforms = {
    uHdr: { value: null },
    uPhoto: { value: 0 },
    uYaw: { value: 0 },
    uSun: { value: SUN_DIR.clone() },
    uSunCol: { value: new THREE.Color(1.6, 1.0, 0.6) },
    uUp: { value: new THREE.Color(0.28, 0.3, 0.5) },
    uTime: { value: 0 },
    uClamp: { value: SKY.envClamp },
    uCloudScale: { value: SKY.cloudScale },
  };
  const mkSky = (env) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { ...uniforms, uEnv: { value: env ? 1 : 0 }, uTime: env ? { value: 0 } : uniforms.uTime },
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 32), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    mesh.layers.set(LAYER.BASE);
    return mesh;
  };
  const sky = mkSky(false);
  scene.add(sky);
  const envScene = new THREE.Scene();
  envScene.add(mkSky(true));

  // key light + shadows
  const sun = new THREE.DirectionalLight('#ffd2a6', 3);
  sun.castShadow = true;
  const S = SUN.shadow;
  sun.shadow.mapSize.set(S.mapSize, S.mapSize);
  Object.assign(sun.shadow.camera, { left: -S.extent, right: S.extent, top: S.extent, bottom: -S.extent, near: S.near, far: S.far });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = S.bias;
  sun.shadow.normalBias = S.normalBias;
  sun.shadow.radius = S.radius;
  sun.layers.enableAll(); // lit in every pass, so the light setup never changes between passes
  scene.add(sun, sun.target);

  let photo = null;

  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  let exposure = 1;
  const sunAz = Math.atan2(SUN_DIR.z, SUN_DIR.x);

  function configure(usePhoto) {
    const on = usePhoto && !!photo;
    uniforms.uPhoto.value = on ? 1 : 0;
    let skyL;
    if (on) {
      uniforms.uHdr.value = photo.tex;
      uniforms.uYaw.value = photo.sunAz - sunAz; // HDRI sun → key-light azimuth
      uniforms.uUp.value.copy(photo.up);
      skyL = lum(photo.up);
      const chroma = photo.sun.clone().multiplyScalar(1 / Math.max(lum(photo.sun), 1e-4));
      chroma.lerp(new THREE.Color(1, 1, 1), 0.25);
      sun.color.copy(chroma).multiplyScalar(1 / Math.max(chroma.r, chroma.g, chroma.b));
    } else {
      uniforms.uUp.value.set(0.26, 0.29, 0.48);
      skyL = lum(uniforms.uUp.value);
      sun.color.set('#ffd2a6');
    }
    sun.intensity = SUN.ratio * Math.PI * skyL;
    uniforms.uSunCol.value.copy(sun.color).multiplyScalar(SUN.ratio * skyL * Math.sin(rad(SUN.elevationDeg)) * 2.2);
    exposure = SUN.exposureKey / (skyL * (1 + SUN.ratio));
    uniforms.uClamp.value = SKY.envClamp * skyL;
    envRT?.dispose();
    envRT = pmrem.fromScene(envScene, 0, 0.1, 1000);
    scene.environment = envRT.texture;
    scene.environmentIntensity = SKY.envIntensity;
    return exposure;
  }
  // Start on the procedural sky straight away, and switch to the photograph when it arrives:
  // the page never waits on a 4.6 MB file, and a failed load just leaves the fallback.
  configure(false);
  const ready = (async () => {
    try {
      const tex = await Promise.race([
        new HDRLoader().loadAsync(SKY.url), // half-float equirect
        new Promise((_, rej) => setTimeout(() => rej(new Error('HDRI timeout')), SKY.timeoutMs)),
      ]);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      // mipmaps, so the shader can ask for a blurred copy near the horizon
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.needsUpdate = true;
      photo = { tex, ...analyse(tex) };
      onChange?.(configure(true));
    } catch (err) {
      console.warn('Photographic sky unavailable, using the procedural sky:', err.message);
    }
    return !!photo;
  })();

  return {
    /** Resolves to true once the photographic sky is in, false if it could not be loaded. */
    ready,
    sky,
    sun,
    get hasPhoto() {
      return !!photo;
    },
    get exposure() {
      return exposure;
    },
    setPhoto: (on) => configure(on),
    /** Uniforms for SKY_LOOKUP, for other shaders that sample the sky. */
    uniforms,
    /**
     * Frame the shadow map: a box `extent` metres either side of `centre`, seen from the sun.
     * A tight frame gives crisp shadows on one engine; a wide one takes in the whole aircraft.
     */
    setShadow({ centre, extent = S.extent, dist = 40, far = S.far, bias = S.bias, normalBias = S.normalBias }) {
      Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far });
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.bias = bias;
      sun.shadow.normalBias = normalBias;
      sun.target.position.copy(centre);
      sun.position.copy(centre).addScaledVector(SUN_DIR, dist);
      sun.target.updateMatrixWorld();
    },
    /** The sky is infinitely far away: it travels with the camera. */
    update(time, camera) {
      uniforms.uTime.value = time;
      if (camera) sky.position.copy(camera.position);
    },
  };
}
