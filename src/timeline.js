import * as THREE from 'three';
import { CAMERA_KEYS, CAPTIONS, CUT, EXPLODE, FLOW, PHASES, STAGE_GLOW, DURATION } from './config.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => x * x * (3 - 2 * x);
const norm = (t, a, b) => clamp01((t - a) / (b - a));
const ease = (t, a, b) => smooth(norm(t, a, b));

const v = (a) => new THREE.Vector3(...a);

function catmull(p0, p1, p2, p3, u, out) {
  const u2 = u * u;
  const u3 = u2 * u;
  out.set(
    0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
    0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
    0.5 * (2 * p1.z + (-p0.z + p2.z) * u + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * u2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * u3)
  );
  return out;
}

const keys = CAMERA_KEYS.map((k) => ({ t: k.t, pos: v(k.pos), target: v(k.target), fov: k.fov }));

export function cameraAt(t, out = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 38 }) {
  const n = keys.length;
  let i = 0;
  while (i < n - 2 && t > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const u = clamp01((t - a.t) / (b.t - a.t));
  // ease the parameter slightly so the camera "arrives" at each beat without stopping dead
  const ue = lerp(u, smooth(u), 0.55);
  const i0 = Math.max(0, i - 1);
  const i3 = Math.min(n - 1, i + 2);
  catmull(keys[i0].pos, a.pos, b.pos, keys[i3].pos, ue, out.pos);
  catmull(keys[i0].target, a.target, b.target, keys[i3].target, ue, out.target);
  out.fov = lerp(a.fov, b.fov, ue);
  // a whisper of handheld drift keeps the shot alive
  out.pos.x += Math.sin(t * 0.7) * 0.05;
  out.pos.y += Math.sin(t * 0.53 + 1.3) * 0.04;
  return out;
}

/**
 * The camera views are composed for a wide screen. On a tall, narrow one the camera steps back
 * by this factor so the engine still fits across.
 */
export const portraitFit = (aspect) => (aspect >= 1.35 ? 1 : Math.min(2.3, 1.35 / aspect));

/** Move a camera position away from its target by a factor, in place. */
export function stepBack(pos, target, factor) {
  if (factor !== 1) pos.sub(target).multiplyScalar(factor).add(target);
  return pos;
}

const window01 = (t, from, to, fadeIn = 0.35, fadeOut = 0.35) =>
  smooth(clamp01((t - from) / fadeIn)) * (1 - smooth(clamp01((t - (to - fadeOut)) / fadeOut)));

export function stateAt(t) {
  const cutProgress = ease(t, CUT.from, CUT.to);
  const cutConst = lerp(CUT.open, CUT.closed, cutProgress);
  const explode = ease(t, EXPLODE.from, EXPLODE.to);
  const flow = ease(t, FLOW.in0, FLOW.in1) * (1 - ease(t, FLOW.out0, FLOW.out1));

  const phase = { suck: 0, squeeze: 0, bang: 0, blow: 0 };
  let activePhase = null;
  for (const p of PHASES) {
    phase[p.id] = window01(t, p.from, p.to, 0.45, 0.45);
    if (t >= p.from && t < p.to) activePhase = p.id;
  }

  const stageWeights = {};
  for (const [id, partList] of Object.entries(STAGE_GLOW)) {
    for (const name of partList) stageWeights[name] = Math.max(stageWeights[name] ?? 0, phase[id]);
  }

  // “how hard is the engine working” — drives the numbers on the labels and the glow
  const run = lerp(0.5, 1, ease(t, 9.5, 17.3)) * (1 - 0.94 * ease(t, 22.8, 26.0));
  const hot = (0.16 + 0.84 * ease(t, 6.8, 12)) * (1 - 0.6 * ease(t, 22.8, 26));

  const caption = CAPTIONS.find((c) => t >= c.from && t < c.to) || null;

  return {
    t,
    cutConst,
    cutProgress,
    explode,
    flow,
    phase,
    activePhase,
    stageWeights,
    hot,
    run,
    hpcT: lerp(60, 600, run),
    hpcPR: lerp(2, 40, run),
    gasT: lerp(540, 1560, Math.pow(run, 0.8)),
    thrustAlpha: ease(t, 24.0, 25.6),
    caption,
    captionFade: caption ? window01(t, caption.from, caption.to, 0.3, 0.3) : 0,
    duration: DURATION,
  };
}
