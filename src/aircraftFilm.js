import * as THREE from 'three';
import { engineAt } from './model.js';

// The second film: what the engines power, told as one approach and landing.
// Like the engine film, everything is a pure function of the film time `t` (seconds), so it can
// be played, scrubbed, or scrolled.
//
// The aircraft never travels. The runway slides underneath (`travel`) and rises to the wheels
// (`agl`); the aircraft only pitches. Time is compressed: a real landing roll takes twice as long.

export const AIRCRAFT_DURATION = 32;
const TD = 22.0; // the main wheels touch
const GROUND_FROM = 10.9; // out of the cloud: the runway is in sight
const APPROACH = 72; // m/s, about 260 km/h
const TAXI = 7;
const ROLL_TIME = 9.4; // seconds from touchdown to taxi speed

export const AIRCRAFT_MARKERS = [
  { t: 0, label: 'Power' },
  { t: 4.6, label: 'Cabin air' },
  { t: 10.9, label: 'Wheels' },
  { t: 16.3, label: 'Flaps' },
  { t: 20.2, label: 'Touchdown' },
  { t: 27.6, label: 'Stop' },
];
export const AIRCRAFT_TICKS = [1.6, 2.4, 3.2, 4.6, 7.2, 10.9, 12.3, 15.6, 16.3, 19.6, 20.2, 22, 23.6, 24.8, 27.6, 30.4];

export const AIRCRAFT_CAPTIONS = [
  { from: 0.3, to: 4.4, text: 'Four engines do more than push. They power everything else on board.' },
  { from: 4.8, to: 10.6, text: 'The air you breathe is bled from their compressors, cooled, and fed to the cabin.' },
  { from: 11.2, to: 16.1, text: 'Pumps on the engines drive the hydraulics. Wheels down.' },
  { from: 16.4, to: 20.0, text: 'Slats and flaps reshape the wing, so it can fly slowly enough to land.' },
  { from: 20.4, to: 23.4, text: 'Touchdown, at about 260 km/h.' },
  { from: 23.7, to: 27.4, text: 'Spoilers kill the lift. Reversers throw the fan air forwards.' },
  { from: 27.8, to: 31.6, text: 'From 260 km/h to walking pace in half a minute. The engines powered all of it.' },
];

// Camera: a film of separate shots. Each one is a slow move from `a` to `b`; shots are joined by cuts.
const SHOTS = [
  { from: 0, to: 4.6, a: { pos: [-58, 14, 40], target: [-2, 2.5, -12], fov: 36 }, b: { pos: [-43, 9, 31], target: [-4, 3, -12], fov: 36 } },
  { from: 4.6, to: 10.9, a: { pos: [-30, 10.5, 5], target: [-13.5, 3.2, -12.5], fov: 36 }, b: { pos: [-25, 8, 1.5], target: [-13.5, 3.2, -12.5], fov: 36 } },
  { from: 10.9, to: 16.3, a: { pos: [20, -0.5, 0.5], target: [5.5, 0.1, -10.6], fov: 40 }, b: { pos: [17.5, -1.3, 2.6], target: [5.8, -0.6, -10.3], fov: 40 } },
  { from: 16.3, to: 20.2, a: { pos: [27, 11, 16], target: [8, 3, 2], fov: 38 }, b: { pos: [23, 9, 20], target: [8, 2.8, 2], fov: 38 } },
  { from: 20.2, to: 23.6, a: { pos: [-27, -0.5, 38], target: [2, 0.6, -12], fov: 36 }, b: { pos: [-22, -0.9, 33], target: [3, 0.4, -12], fov: 36 } },
  { from: 23.6, to: 27.6, a: { pos: [-9.5, 0.5, 13.5], target: [1.5, 0.7, -2], fov: 38 }, b: { pos: [-12, 1.3, 15], target: [1.5, 0.8, -3], fov: 38 } },
  { from: 27.6, to: 32, a: { pos: [-66, 3.4, 16], target: [-6, 2.4, -13], fov: 34 }, b: { pos: [-60, 3.0, 9], target: [-6, 2.4, -13], fov: 34 } },
].map((s) => ({
  ...s,
  a: { pos: new THREE.Vector3(...s.a.pos), target: new THREE.Vector3(...s.a.target), fov: s.a.fov },
  b: { pos: new THREE.Vector3(...s.b.pos), target: new THREE.Vector3(...s.b.target), fov: s.b.fov },
}));
const CUTS = SHOTS.slice(1).map((s) => s.from);

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => x * x * (3 - 2 * x);
const ease = (t, a, b) => smooth(clamp01((t - a) / (b - a)));
const window01 = (t, from, to, fadeIn = 0.35, fadeOut = 0.35) =>
  smooth(clamp01((t - from) / fadeIn)) * (1 - smooth(clamp01((t - (to - fadeOut)) / fadeOut)));

export function aircraftCameraAt(t, out = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 38 }) {
  let shot = SHOTS[0];
  for (const s of SHOTS) if (t >= s.from) shot = s;
  const u = clamp01((t - shot.from) / (shot.to - shot.from));
  const e = lerp(u, smooth(u), 0.4);
  out.pos.lerpVectors(shot.a.pos, shot.b.pos, e);
  out.target.lerpVectors(shot.a.target, shot.b.target, e);
  out.fov = lerp(shot.a.fov, shot.b.fov, e);
  // a whisper of handheld drift keeps the shot alive
  out.pos.x += Math.sin(t * 0.7) * 0.06;
  out.pos.y += Math.sin(t * 0.53 + 1.3) * 0.04;
  return out;
}

/** Ground speed, m/s. */
function speedAt(t) {
  return TAXI + (APPROACH - TAXI) * (1 - ease(t, TD, TD + ROLL_TIME));
}
/** Metres of runway that have passed under the aircraft since it came into sight. */
function travelAt(t) {
  const flown = APPROACH * (Math.min(t, TD) - GROUND_FROM);
  if (t <= TD) return flown;
  const x = t - TD;
  const u = clamp01(x / ROLL_TIME);
  // ∫ of the eased slow-down: smoothstep integrates to u³ − u⁴/2
  const braking = (APPROACH - TAXI) * ROLL_TIME * (u - (u * u * u - 0.5 * u * u * u * u));
  return flown + TAXI * x + braking;
}
/** Height of the wheels above the runway, m: a steady descent, then the flare. */
function heightAt(t) {
  const x = TD - t; // seconds to touchdown
  if (x <= 0) return 0;
  const FLARE = 1.7;
  if (x >= FLARE) return 1.6 + 3.6 * (x - FLARE);
  return 1.6 * Math.pow(x / FLARE, 1.7);
}

export function aircraftStateAt(t) {
  const onGround = t >= TD;
  const inSight = t >= GROUND_FROM;

  const gear = ease(t, 12.3, 15.6);
  const slats = ease(t, 16.5, 18.6);
  const flaps = ease(t, 16.8, 19.7);
  const spoilers = ease(t, TD + 0.25, TD + 0.95) * (1 - ease(t, 30.2, 31.2));
  const reverse = ease(t, TD + 1.7, TD + 2.9) * (1 - ease(t, 29.2, 30.4));
  const brakes = ease(t, TD + 1.0, TD + 6.5);
  // nose-up on the approach, a little more in the flare, then the nose wheel is lowered
  const pitch = inSight ? lerp(0.045, 0.095, ease(t, TD - 2.4, TD - 0.3)) * (1 - ease(t, TD + 0.35, TD + 2.3)) : 0;

  // how hard the engines are working: cruise, approach power, idle in the flare, then reverse thrust
  let run = 0.62;
  run = lerp(run, 0.36, ease(t, 10.2, 11.4));
  run = lerp(run, 0.06, ease(t, TD - 1.6, TD - 0.4));
  run = lerp(run, 0.6, ease(t, TD + 2.6, TD + 3.6));
  run = lerp(run, 0.05, ease(t, 28.6, 29.8));

  const cabin = ease(t, 5.4, 7.3) * (1 - ease(t, 9.9, 10.75));
  const systems = {
    air: Math.max(window01(t, 1.5, 4.5, 0.7, 0.5), window01(t, 4.9, 10.4, 0.8, 0.6)),
    hyd: Math.max(window01(t, 2.3, 4.5, 0.7, 0.5), window01(t, 11.6, 16.2, 0.7, 0.7) * 0.5),
    elec: window01(t, 3.1, 4.5, 0.7, 0.5),
  };

  // cloud over the lens: thick as the aircraft drops through the overcast, a breath at each cut
  let veil = window01(t, 9.9, 11.9, 1.0, 1.0);
  for (const c of CUTS) if (c !== GROUND_FROM) veil = Math.max(veil, 0.85 * (1 - clamp01(Math.abs(t - c) / 0.24)));

  const speed = inSight ? speedAt(t) : 250; // m/s (cruise before the cloud)
  const caption = AIRCRAFT_CAPTIONS.find((c) => t >= c.from && t < c.to) || null;

  return {
    t,
    run,
    gear,
    flaps,
    slats,
    spoilers,
    reverse,
    brakes,
    pitch,
    cabin,
    systems,
    veil,
    onGround,
    inSight,
    speed,
    height: inSight ? heightAt(t) : 11000,
    travel: inSight ? travelAt(t) : 0,
    rolled: onGround ? travelAt(t) - travelAt(TD) : 0,
    smoke: onGround ? t - TD : null,
    activePhase: null,
    caption,
    captionFade: caption ? window01(t, caption.from, caption.to, 0.3, 0.3) : 0,
    duration: AIRCRAFT_DURATION,
  };
}

/** Pose the scene for film time `t`. Returns the script state and the engine numbers. */
export function fillAircraftView(view, t) {
  const s = aircraftStateAt(t);
  const engine = engineAt(s.run, { reverse: s.reverse });

  // the engine: whole, running, nothing taken apart
  view.cutConst = 1.78;
  view.explode = 0;
  view.offsets = null;
  view.hidden = null;
  view.xray = 0;
  view.jet = 0;
  view.reverse = s.reverse;
  view.flow = 0.3 + 0.5 * s.reverse;
  view.phase.suck = view.phase.squeeze = view.phase.bang = view.phase.blow = 0;
  view.stageWeights = {};
  view.hot = 0.3 + 0.6 * s.run;
  view.fxBang = 0;
  view.fxBlow = 0.15 + 0.4 * s.run;
  view.thrustAlpha = 0;
  view.ambient = 0.34 * Math.min(1, s.speed / APPROACH);
  view.lpRate = 0.3 + 0.9 * engine.n1f;
  view.hpRate = 0.3 + 0.9 * engine.n2f;
  view.flowSpeed = 0.5 + 0.6 * s.run;

  // the aircraft
  view.wide = true;
  view.gear = s.gear;
  view.flaps = s.flaps;
  view.slats = s.slats;
  view.spoilers = s.spoilers;
  view.reverseAll = s.reverse;
  view.brakes = s.brakes;
  view.pitch = s.pitch;
  view.rolled = s.rolled;
  view.ground = s.inSight ? { agl: s.height, travel: s.travel, alpha: 1 } : null;
  view.smoke = s.smoke;
  view.veil = s.veil;
  view.cabin = s.cabin;
  view.systems = s.systems;

  view.labelSet = 'aircraft';
  view.labelT = t;
  view.acView = null;
  return { s, engine };
}

/** The aircraft as the engine lessons want it: clean, in cruise, only the near side drawn. */
export function restAirframe(view) {
  view.wide = false;
  view.gear = 0;
  view.flaps = 0;
  view.slats = 0;
  view.spoilers = 0;
  view.reverseAll = 0;
  view.brakes = 0;
  view.pitch = 0;
  view.rolled = 0;
  view.ground = null;
  view.smoke = null;
  view.veil = 0;
  view.cabin = 0;
  view.systems = null;
  view.labelSet = 'engine';
  view.acView = null;
}
