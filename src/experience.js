import * as THREE from 'three';

import { ENGINE_X } from './config.js';
import { setupEnvironment } from './scene/environment.js';
import { M, cutPlane } from './scene/materials.js';
import { loadLivery, applyLivery } from './scene/livery.js';
import { buildEngine } from './scene/engine.js';
import { createAircraft } from './scene/aircraft.js';
import { createGround } from './scene/ground.js';
import { FUSE_Z, GROUND_Y, MAIN_GEAR } from './scene/airframe.js';
import { createAirflow } from './scene/airflow.js';
import { createEffects, createFanBlur } from './scene/effects.js';
import { createScaleFigure, createTracer } from './scene/figure.js';
import { LAYER } from './scene/layers.js';
import { createPost, POST } from './post.js';
import { createLabels } from './ui/labels.js';

// Graphics presets. "high" is the full look from the Claude Design study; the others trade the
// costliest layers for frame rate. The explorer steps down by itself if frames run slow.
export const QUALITY = {
  high: { pixelRatio: 1.5, shadows: true, ao: true, dof: true, haze: true, fanBlur: true },
  medium: { pixelRatio: 1.25, shadows: true, ao: true, dof: false, haze: true, fanBlur: true },
  low: { pixelRatio: 1, shadows: false, ao: false, dof: false, haze: false, fanBlur: false },
};

// The scene is lit by a real sky and sun, so the exposure is low (about 0.18). Anything that is
// not lit by them has to be scaled to stay where it was authored:
const EMISSIVE_KEY = 0.62; // glowing metal, shaft colours, hover tint: brightness × exposure
const GLOW_KEY = 1.3; // additive flame and plume sprites
const BLOOM_KEY = 0.75; // only what is brighter than this on screen blooms: flame, hot metal, sun glints
const AMBIENT_SCALE = 0.63; // wind streaks: against a photographic sky the old strength reads as rain
const LIGHT_KEY = 2.6; // runway lights: bright enough to bloom
const BRAKE_KEY = 1.1; // glowing brake hubs

// What the shadow map covers. A tight frame gives crisp shadows on the one engine; the aircraft
// views need the whole machine and the long evening shadows it throws on the runway.
const SHADOW = {
  engine: { centre: new THREE.Vector3(ENGINE_X + 3.4, 0.5, -1.4), extent: 11, dist: 40, far: 90, bias: -0.0002, normalBias: 0.03 },
  wide: { centre: new THREE.Vector3(3, 1, FUSE_Z + 3), extent: 46, dist: 150, far: 340, bias: -0.00008, normalBias: 0.09 },
};
const FAR = { sky: 900, ground: 5200 }; // camera far plane: the runway needs kilometres

/**
 * Everything that draws: renderer, scene, engine, aircraft, airflow, effects, labels.
 * It knows nothing about modes or the timeline. Each frame the page hands it a "view"
 * (see `blankView`) describing what the scene should look like, and it makes it so.
 * The explorer and the scroll-story page both sit on top of this.
 *
 * Async because the livery artwork is rasterised first. The photographic sky is not waited for:
 * the scene starts on a procedural sky and switches when the photograph arrives.
 */
export async function createExperience(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // multisampling happens in post.js's scene target
    powerPreference: 'high-performance',
  });
  let quality = 'high';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.high.pixelRatio));
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps livery and diagram colours as authored
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // post.js updates it once per frame, in the base pass

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 900);

  // livery sheets go onto the source materials before the engine clones them per part
  try {
    applyLivery(M, await loadLivery(renderer));
  } catch (err) {
    console.warn('Livery artwork unavailable, using plain paint:', err.message);
  }

  let ready = false;
  let brakeGain = 1;
  const env = await setupEnvironment(scene, renderer, { onChange: () => ready && calibrate() });
  env.setShadow(SHADOW.engine);
  let shadowWide = false;

  // Everything that flies sits in one rig, so the whole aircraft can pitch about its main wheels
  // on landing. The rig stays at the origin otherwise: the aircraft never travels, the runway does.
  const rig = new THREE.Group();
  scene.add(rig);

  // engine at the origin (world z = 0 is the cut plane), nose forward along -X
  const engine = buildEngine();
  engine.root.position.set(ENGINE_X, 0, 0);
  rig.add(engine.root);

  const aircraft = createAircraft();
  rig.add(aircraft.group);

  const airflow = createAirflow();
  airflow.position.set(ENGINE_X, 0, 0);
  airflow.userData.noPick = true;
  airflow.layers.set(LAYER.OVERLAY); // drawn after ambient occlusion, like every other overlay
  rig.add(airflow);

  const ground = createGround(env);
  scene.add(ground.group);

  const effects = createEffects(engine);
  const fanBlur = createFanBlur(engine);
  const figure = createScaleFigure();
  engine.root.add(figure.group);
  const tracer = createTracer();
  engine.root.add(tracer.group);
  const labels = createLabels(engine, aircraft);

  const post = createPost(renderer, scene, camera);
  post.bindHaze(effects.haze.material);

  /** Re-balance everything unlit or self-lit for the current exposure. */
  function calibrate() {
    const exposure = env.exposure;
    renderer.toneMappingExposure = exposure;
    const unlit = 1 / exposure;
    // flat diagram colours (the section faces) land on screen exactly as picked
    scene.traverse((o) => {
      const m = o.material;
      if (!m || !m.isMeshBasicMaterial || !m.userData.base) return;
      m.userData.authored ??= m.userData.base.clone();
      m.userData.base.copy(m.userData.authored).multiplyScalar(unlit);
      m.color.copy(m.userData.base);
    });
    engine.setEmissiveGain(EMISSIVE_KEY * unlit);
    effects.setGain(GLOW_KEY * unlit);
    figure.setGain(unlit, EMISSIVE_KEY * unlit);
    tracer.setGain(1.3 * unlit);
    airflow.material.uniforms.uGain.value = Math.min(2.5, 0.92 * unlit);
    ground.setGain(LIGHT_KEY * unlit, unlit);
    aircraft.systems.setGain(0.9 * unlit);
    brakeGain = BRAKE_KEY * unlit;
    // the study bloomed everything sunlit, which veils the diagram; keep bloom for real highlights
    POST.bloom.threshold = BLOOM_KEY * unlit;
  }
  ready = true;
  calibrate();

  let animTime = 0; // advances only while the scene is "playing": spin and glow freeze on pause
  let flowTime = 0; // the airflow's own clock, so the throttle can speed it up without a jump
  let focus = 8; // metres along the view axis that the lens is focused at
  const fx = { bang: 0, blow: 0, hot: 0, flow: 0, jet: 0, surge: 0, sparks: 0, torch: 0, burner: 0 };
  let shaking = false;
  const size = new THREE.Vector2();
  const tmp = new THREE.Vector3();
  const veilColor = new THREE.Color();
  // px the picture is slid right (x) and down (y), so the engine sits clear of panels
  const shift = { x: 0, y: 0 };

  function applyShift() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (Math.abs(shift.x) < 0.5 && Math.abs(shift.y) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(w, h, -shift.x, -shift.y, w, h);
  }

  function resize(w = window.innerWidth, h = window.innerHeight) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the subject framed on tall, narrow screens
    camera.userData.aspectBoost = w / h < 1.2 ? 1.25 : 1;
    camera.updateProjectionMatrix();
    applyShift();
    renderer.getDrawingBufferSize(size);
    post.setSize(size.x, size.y);
    airflow.material.uniforms.uRes.value.copy(size);
    airflow.material.uniforms.uWidth.value = 1.7 * renderer.getPixelRatio();
    fitLights();
  }

  /** Runway light size on screen follows the drawing buffer and the lens. */
  function fitLights() {
    ground.setScale(0.5 * size.y * camera.projectionMatrix.elements[5]);
  }

  /** Pitch the whole aircraft nose-up by `a` radians about the point where the main wheels touch. */
  const pivot = new THREE.Vector2(MAIN_GEAR.x + 0.1, GROUND_Y);
  let pitchNow = 0;
  function setPitch(a) {
    if (a === pitchNow) return;
    pitchNow = a;
    const c = Math.cos(-a);
    const s = Math.sin(-a);
    rig.rotation.z = -a;
    rig.position.set(pivot.x - (pivot.x * c - pivot.y * s), pivot.y - (pivot.x * s + pivot.y * c), 0);
  }

  function setQuality(level) {
    const q = QUALITY[level];
    if (!q) return;
    quality = level;
    POST.ao.on = q.ao;
    POST.dof.on = q.dof;
    POST.haze.on = q.haze;
    fanBlur.enabled = q.fanBlur;
    env.sun.castShadow = q.shadows;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    resize();
  }

  /** Make the scene match the view. `dt` is real seconds since the last frame. */
  function apply(v, dt) {
    const adt = v.playing ? dt : 0;
    animTime += adt;
    flowTime += adt * v.flowSpeed;

    cutPlane.constant = v.cutConst;
    engine.update(adt, v, 1 - Math.exp(-dt * 12));
    aircraft.setExplode(v.explode);
    aircraft.group.visible = v.aircraft;
    aircraft.update(v, animTime);
    aircraft.gear.setBrakeGlow(brakeGain * (v.brakes ?? 0));
    setPitch(v.pitch ?? 0);
    ground.update(v.ground);
    ground.smoke(v.ground ? v.smoke ?? null : null);
    post.setVeil(v.veil ?? 0, veilColor.copy(env.uniforms.uUp.value).multiplyScalar(1.7));

    // the aircraft views light and shadow the whole machine; the engine lessons only their corner of it
    if (!!v.wide !== shadowWide) {
      shadowWide = !!v.wide;
      env.setShadow(shadowWide ? SHADOW.wide : SHADOW.engine);
    }
    const far = v.ground ? FAR.ground : FAR.sky;
    if (camera.far !== far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    const omega = v.spin * 1.35 * v.lpRate; // LP spool rad/s, as in engine.update
    aircraft.spin(adt * omega);
    fanBlur.update(v.playing ? omega : 0);

    const u = airflow.material.uniforms;
    u.uTime.value = flowTime;
    u.uStrength.value = v.flow;
    u.uDensity.value = v.flowDensity;
    u.uAmbient.value = v.ambient * AMBIENT_SCALE;
    u.uBypass.value = 1 - v.jet;
    u.uReverse.value = v.reverse;
    u.uPhase.value.set(v.phase.suck, v.phase.squeeze, v.phase.bang, v.phase.blow);

    fx.bang = v.fxBang;
    fx.blow = v.fxBlow;
    fx.hot = v.hot;
    fx.flow = v.flow;
    fx.jet = v.jet;
    fx.surge = v.surge ?? 0;
    fx.sparks = v.sparks ?? 0;
    fx.torch = v.torch ?? 0;
    fx.burner = v.burner ?? 0;
    effects.update(animTime, fx);

    // a rough-running engine shakes on its mounts
    const shake = v.shake ?? 0;
    if (shake > 0.001 || shaking) {
      shaking = shake > 0.001;
      engine.root.position.set(
        ENGINE_X + 0.03 * shake * Math.sin(animTime * 71),
        0.035 * shake * Math.sin(animTime * 83 + 1.3),
        0.025 * shake * Math.sin(animTime * 97 + 2.1)
      );
    }
    env.update(animTime, camera);
    figure.set(v.figure);

    POST.bloom.on = v.bloomOn;
    post.bloom.strength = POST.bloom.strength + 0.3 * v.fxBang + 0.12 * v.fxBlow + 0.08 * (v.burner ?? 0);

    // focus the lens on whatever the page says the subject is
    if (v.focusAt) {
      camera.updateMatrixWorld();
      const z = -tmp.copy(v.focusAt).applyMatrix4(camera.matrixWorldInverse).z;
      focus += (Math.max(0.5, z) - focus) * (1 - Math.exp(-dt * 6));
      post.setFocus(focus);
    }
  }

  function setFov(fov) {
    const f = fov * (camera.userData.aspectBoost || 1);
    if (Math.abs(camera.fov - f) > 0.01) {
      camera.fov = f;
      camera.updateProjectionMatrix();
      fitLights();
    }
  }

  return {
    renderer, scene, camera, rig, engine, aircraft, ground, airflow, figure, tracer, labels, env, post,
    resize,
    apply,
    setFov,
    setQuality,
    get quality() {
      return quality;
    },
    /** Slide the whole picture by this many px: right and down are positive. */
    setShift(px, py = 0) {
      if (Math.abs(px - shift.x) < 0.25 && Math.abs(py - shift.y) < 0.25) return;
      shift.x = px;
      shift.y = py;
      applyShift();
    },
    render: () => post.render(animTime, { shadows: QUALITY[quality].shadows }),
    updateLabels: (v, dt) => labels.update(camera, v, dt),
    get animTime() {
      return animTime;
    },
  };
}

const LEVELS = ['high', 'medium', 'low'];

/**
 * Keeps the frame rate up: if frames run slow for a while, step the graphics down one preset.
 * It only ever steps down, and stops for good once the user picks a preset by hand.
 * Call `frame(rawDt)` every frame with the real (unclamped) seconds since the last one.
 */
export function createGovernor(xp, onDrop) {
  let warm = 0;
  let frames = 0;
  let time = 0;
  let stalls = 0;
  let locked = false;
  function stepDown() {
    frames = 0;
    time = 0;
    stalls = 0;
    const i = LEVELS.indexOf(xp.quality);
    if (i >= LEVELS.length - 1) return;
    xp.setQuality(LEVELS[i + 1]);
    warm = 0;
    onDrop?.(LEVELS[i + 1]);
  }
  return {
    lock() {
      locked = true;
    },
    frame(rawDt) {
      // a hidden tab says nothing about the graphics card
      if (locked || document.visibilityState !== 'visible') return;
      if (rawDt > 0.2) {
        // One long frame is a stall (a tab switch, shaders compiling); a run of them is a slow
        // device. Gaps of most of a second are the browser holding a covered page back, not the
        // graphics card, and say nothing.
        if (rawDt > 0.8) stalls = 0;
        else if (++stalls >= 8) stepDown();
        return;
      }
      stalls = 0;
      if ((warm += rawDt) < 3) return; // shaders compiling, sky loading
      frames++;
      time += rawDt;
      // judge about every two seconds (sooner at a healthy frame rate)
      if (frames < 90 && time < 2) return;
      if (time / frames > 0.034) stepDown();
      frames = 0;
      time = 0;
    },
  };
}

/** A view with every field the scene reads, set to "engine closed, at rest". */
export function blankView() {
  return {
    playing: true,
    // geometry
    cutConst: 1.78, // clip plane (world z): 1.78 = whole, 0 = sliced on the centreline
    explode: 0, // 0 assembled → 1 pulled apart
    offsets: null, // { partName: Vector3 } overrides the explode position (assembly game)
    hidden: null, // Set of part names to hide
    xray: 0,
    reverse: 0,
    jet: 0, // 0 turbofan → 1 turbojet
    burner: 0, // afterburner 0 → 1
    figure: 0,
    aircraft: true,
    // the rest of the aircraft (all zero in the engine lessons)
    wide: false, // draw the far wing and engines too, and shadow the whole machine
    gear: 0, // 0 up → 1 down and locked
    flaps: 0, // 0 clean → 1 landing setting
    slats: 0,
    spoilers: 0,
    reverseAll: 0, // the other three engines' reversers
    brakes: 0, // brake heat 0 → 1
    pitch: 0, // rad, nose up, about the main wheels
    rolled: 0, // metres the wheels have turned
    ground: null, // { agl, travel, alpha }: the runway, or null above the clouds
    smoke: null, // seconds since the wheels touched (tyre smoke), or null
    veil: 0, // cloud over the lens, 0 → 1
    labelSet: 'engine', // which family of labels is on screen
    acView: null, // the Aircraft mode's current view, for its labels
    cabin: 0, // how far the fuselage skin is opened over the cabin, 0 → 1
    systems: null, // { air, hyd, elec }: strength of each system's lines, or null
    // motion
    spin: 1, // user's rotation-speed multiplier
    lpRate: 1,
    hpRate: 1,
    flowSpeed: 1,
    // air and heat
    flow: 0,
    flowDensity: 1,
    ambient: 0.38,
    phase: { suck: 0, squeeze: 0, bang: 0, blow: 0 },
    stageWeights: {},
    hot: 0.16,
    fxBang: 0,
    fxBlow: 0,
    thrustAlpha: 0,
    bloomOn: true,
    // things going wrong (the games): all zero otherwise
    shake: 0,
    surge: 0, // flame out of the inlet
    sparks: 0, // sparks from the tailpipe
    torch: 0, // a sheet of flame from the tailpipe
    lptRate: null, // the LP turbine's own spin rate, when its shaft has let go
    // attention
    focus: null,
    hover: null,
    focusAt: null, // world point the lens focuses on (THREE.Vector3)
    // labels
    labelsOn: true,
    inside: true, // false while the core is closed up, so labels for hidden parts stay off
    labelT: 0,
    safe: null,
    hpcT: 330,
    hpcPR: 21,
    gasT: 1020,
  };
}
