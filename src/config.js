import { wingX, wingY, MAIN_GEAR, NOSE_GEAR, FUSE_Y, FUSE_Z } from './scene/airframe.js';

// All the "script" of the lesson lives here: timing, captions, camera path, labels.
// Everything on screen is a pure function of the timeline time `t` (seconds).

export const DURATION = 30;

// World-space x of the engine's local origin (front lip of the nacelle).
export const ENGINE_X = -3.2;

export const MARKERS = [
  { t: 0, label: 'Wing' },
  { t: 6.2, label: 'Cutaway' },
  { t: 11.1, label: 'Flow' },
  { t: 23.3, label: 'Exploded' },
];

// Extra ticks on the scrub bar (stage boundaries and beats).
export const TICKS = [2.5, 6.2, 8.2, 9.7, 11.1, 13.2, 15.4, 17.4, 19.3, 21.5, 23.3, 25.7, 28.5];

export const PHASES = [
  { id: 'suck', from: 11.1, to: 15.4 },
  { id: 'squeeze', from: 15.4, to: 17.4 },
  { id: 'bang', from: 17.4, to: 19.3 },
  { id: 'blow', from: 19.3, to: 23.0 },
];

export const CAPTIONS = [
  { from: 0.2, to: 4.4, text: 'A turbofan: a giant fan driven by a jet engine at its core.' },
  { from: 4.6, to: 9.2, text: 'Slice it open: air goes in the front, fuel burns in the middle, thrust leaves the back.' },
  { from: 9.4, to: 11.0, text: 'Two shafts, one inside the other, spinning at different speeds.' },
  { from: 11.1, to: 15.3, text: 'Suck: the fan pulls in a huge mass of air. Most air bypasses the core, and makes most of the thrust.' },
  { from: 15.4, to: 17.3, text: 'Squeeze: stage after stage compresses the air about 40 times, heating it.' },
  { from: 17.4, to: 19.2, text: 'Bang: fuel burns continuously, hotter than the turbine metal’s melting point.' },
  {
    from: 19.3,
    to: 22.9,
    text: 'The blades survive with cooling air and heat-resistant coatings. Blow: hot gas spins the turbines, then blasts out the back.',
  },
  { from: 23.1, to: 29.0, text: 'Suck, squeeze, bang, blow: all happening at once, continuously.' },
];

// Camera path (world space). Catmull-Rom through these in order.
export const CAMERA_KEYS = [
  { t: 0, pos: [-8.6, -0.5, 4.4], target: [-1.4, 0.5, 0], fov: 40 },
  { t: 3.6, pos: [-7.2, -0.1, 6.6], target: [-0.8, 0.4, 0], fov: 39 },
  { t: 6.0, pos: [0.2, 1.0, 11.2], target: [0.6, 0.0, 0], fov: 38 },
  { t: 8.2, pos: [1.2, 1.2, 8.6], target: [0.9, 0.0, 0], fov: 38 },
  { t: 9.9, pos: [-1.4, 1.1, 7.6], target: [0.6, 0.0, 0], fov: 38 },
  { t: 11.3, pos: [-6.2, 0.7, 4.6], target: [-1.6, 0.0, 0], fov: 40 },
  { t: 13.4, pos: [-2.8, 0.6, 5.4], target: [0.4, 0.0, 0], fov: 40 },
  { t: 15.6, pos: [0.4, 0.5, 4.2], target: [0.6, 0.0, 0], fov: 40 },
  { t: 17.5, pos: [1.1, 0.25, 2.5], target: [1.1, 0.0, 0], fov: 40 },
  { t: 19.4, pos: [4.6, 1.8, 5.2], target: [2.0, 0.0, 0], fov: 40 },
  { t: 21.8, pos: [8.4, 2.8, 9.4], target: [1.4, 0.1, 0], fov: 40 },
  { t: 23.6, pos: [3.2, 0.4, 17.0], target: [1.4, -0.85, 0], fov: 38 },
  { t: 30, pos: [2.2, 0.1, 15.6], target: [1.4, -0.85, 0], fov: 38 },
];

// Cutaway: clip plane constant (world z). >= 2.2 means nothing is clipped.
export const CUT = { from: 4.4, to: 8.2, open: 1.78, closed: -0.01 };
// Exploded view progress 0..1
export const EXPLODE = { from: 22.8, to: 27.6 };
// Airflow strength 0..1 (fades in with the cutaway, out as the engine explodes)
export const FLOW = { in0: 6.8, in1: 10.5, out0: 22.4, out1: 25.6 };

// Which stage a part is "lit" for (used to pulse emissive glows)
export const STAGE_GLOW = {
  suck: ['fan', 'lpCompressor'],
  squeeze: ['hpCompressor'],
  bang: ['combustor'],
  blow: ['hpTurbine', 'lpTurbine'],
};

// Labels. `part` = the engine part group the anchor rides on (so it follows the explode).
// `at` is in engine-local coordinates; `off` is the box offset in px from the anchor dot.
// `show` is the tour time window; `when` is an extra condition on the scene state;
// `inner` marks parts hidden inside the core, whose labels wait until the engine is opened.
export const LABELS = [
  { id: 'note', part: 'fan', at: [0.15, 0.0, 0.0], off: [-150, -34], kind: 'note', title: 'Rotation shown slowed', show: [0.8, 30] },
  { id: 'fan', part: 'fan', at: [1.0, -0.95, 0.15], off: [-170, 62], title: 'Fan', sub: () => 'Intake: ambient air · PR 1:1', show: [7.2, 30], when: (s) => (s.jet ?? 0) < 0.5 },
  { id: 'lpc', inner: true, part: 'lpCompressor', at: [1.85, -0.38, 0.0], off: [-40, 82], title: 'LP compressor', show: [7.6, 30] },
  { id: 'lps', inner: true, part: 'shafts', at: [2.2, 0.0, 0.0], off: [-100, 126], title: 'LP shaft', cls: 'lp', sub: () => 'Low-pressure spool', show: [8.6, 30] },
  { id: 'byp', part: 'bypassTop', at: [3.0, 1.05, 0.0], off: [-150, -66], title: 'Bypass duct', show: [7.4, 30], when: (s) => (s.jet ?? 0) < 0.5 },
  {
    id: 'hpc', inner: true, part: 'hpCompressor', at: [3.3, 0.45, 0.0], off: [-10, -118], title: 'HP compressor',
    sub: (s) => `Exit ≈ ${Math.round(s.hpcT)} °C · PR ≈ ${Math.round(s.hpcPR)}:1 <em>approx.</em>`, show: [8.2, 30],
  },
  {
    id: 'cmb', inner: true, part: 'combustor', at: [4.5, 0.42, 0.0], off: [130, -104], title: 'Combustor',
    sub: (s) => `Gas ${s.gasT > 1480 ? '>' : '≈'} ${s.gasT > 1480 ? '1,500' : fmt(Math.round(s.gasT / 10) * 10)} °C <em>approx.</em>`, show: [8.4, 30],
  },
  { id: 'hps', inner: true, part: 'shafts', at: [3.9, -0.2, 0.0], off: [70, 112], title: 'HP shaft', cls: 'hp', sub: () => 'High-pressure spool', show: [8.8, 30] },
  { id: 'hpt', inner: true, part: 'hpTurbine', at: [5.35, -0.42, 0.0], off: [150, 46], title: 'HP turbine', show: [8.6, 30] },
  { id: 'lpt', inner: true, part: 'lpTurbine', at: [6.1, 0.45, 0.0], off: [130, -64], title: 'LP turbine', show: [8.4, 30] },
  { id: 'exh', part: 'lpTurbine', at: [7.05, 0.0, 0.0], off: [96, 122], title: 'Exhaust nozzle', sub: () => 'Still hot · leaving through the nozzle', show: [8.8, 30] },
  {
    id: 'thr', part: 'thrust', at: [1.6, 0.0, 0.0], off: [-10, -86], cls: 'thrust',
    title: (s) => ((s.reverse ?? 0) > 0.5 ? 'Reverse thrust' : 'Thrust'),
    sub: (s) => ((s.reverse ?? 0) > 0.5 ? 'Pushes forwards: slows the aircraft' : 'Newton’s third law'),
    show: [24.2, 30], when: (s) => s.thrustAlpha > 0.4,
  },

  // ── the aircraft: the second film, and the Aircraft mode ──
  // `part: 'aircraft'` anchors in aircraft coordinates. `show` is in the aircraft film's time;
  // `acView` is the Aircraft mode's current view (unset while the film is playing).
  {
    id: 'a-air', set: 'aircraft', part: 'aircraft', at: [-13.6, FUSE_Y + 2.5, FUSE_Z + 0.6], off: [40, -84], title: 'Cabin air',
    sub: () => 'Fresh from the engines, in along the ceiling', show: [7.2, 10.2], when: (s) => (s.cabin ?? 0) > 0.6,
  },
  {
    id: 'a-hold', set: 'aircraft', part: 'aircraft', at: [-12, FUSE_Y - 1.9, FUSE_Z + 1.2], off: [150, 70], title: 'Cargo hold',
    sub: () => 'Containers under the floor', show: [7.6, 10.2], when: (s) => (s.cabin ?? 0) > 0.6,
  },
  {
    id: 'a-gear', set: 'aircraft', part: 'aircraft', at: [MAIN_GEAR.x, -0.7, FUSE_Z + MAIN_GEAR.out], off: [-170, -50], title: 'Main landing gear',
    sub: () => 'Eight wheels carry nine-tenths of the weight', show: [14.6, 16.1], when: (s) => s.gear > 0.7 && on(s, 'wing'),
  },
  {
    id: 'a-nose', set: 'aircraft', part: 'aircraft', at: [NOSE_GEAR.x, -0.9, FUSE_Z], off: [-110, -60], title: 'Nose gear',
    sub: () => 'Steers on the ground', show: [14.6, 16.1], when: (s) => s.gear > 0.7 && on(s, 'wing'),
  },
  {
    id: 'a-slat', set: 'aircraft', part: 'aircraft', at: [wingX(9, 0.02) - 0.3, wingY(9, 0.02, 1), 9], off: [-120, -70], title: 'Slats',
    sub: () => 'Slide forward from the leading edge', show: [18.2, 20.0], when: (s) => s.flaps > 0.4 && on(s, 'wing'),
  },
  {
    id: 'a-flap', set: 'aircraft', part: 'aircraft', at: [wingX(1, 0.92) + 0.4, wingY(1, 0.92, 1) - 0.5, 1], off: [120, 60], title: 'Flaps',
    sub: () => 'A bigger, more curved wing', show: [18.6, 20.0], when: (s) => s.flaps > 0.4 && on(s, 'wing'),
  },
  {
    id: 'a-spoil', set: 'aircraft', part: 'aircraft', at: [wingX(5.8, 0.7), wingY(5.8, 0.7, 1) + 0.5, 5.8], off: [130, -70], title: 'Spoilers',
    sub: () => 'Dump the lift onto the wheels', show: [24.4, 27.4], when: (s) => s.spoilers > 0.5 && on(s, 'wing'),
  },
  {
    id: 'a-rev', set: 'aircraft', part: 'aircraft', at: [ENGINE_X + 3.6, 1.72, 0.2], off: [-150, -90], title: 'Thrust reverser',
    sub: () => 'Fan air thrown forwards', show: [25.0, 27.4], when: (s) => (s.reverse ?? 0) > 0.5 && on(s, 'wing'),
  },
];
// true while the film plays, or while the Aircraft mode is on one of these views
function on(s, ...views) {
  return !s.acView || views.includes(s.acView);
}

// ───────────── Explore / Play presets ─────────────
// Camera homes (world space) for the hands-on modes.
export const VIEWS = {
  explore: { pos: [-0.4, 1.5, 9.6], target: [0.5, -0.1, 0], fov: 40 },
  quiz: { pos: [0.9, 1.0, 11.4], target: [0.9, -0.55, 0], fov: 40 },
  built: { pos: [-1.2, 0.4, 10.2], target: [0.5, -0.9, 0], fov: 40 },
  // framed high, so the tray of loose pieces clears the game panel at the bottom
  assembly: { pos: [0.5, -2.2, 16.4], target: [0.5, -2.45, 0], fov: 38 },
  // the harder build parks the duct halves above the engine: stand further back
  assemblyHard: { pos: [0.4, -0.6, 21], target: [0.4, -0.85, 0], fov: 38 },
  // the games that run the engine from the flight deck panel
  sim: { pos: [-0.2, 1.3, 9.4], target: [0.7, -0.2, 0], fov: 40 },
};

// Cutaway slider (0..1) → clip plane constant: 0 = whole engine, 0.5 = sliced on the centreline,
// 1 = a thin slice of the far side.
export const cutFromSlider = (u) => (u <= 0.5 ? 1.78 * (1 - u / 0.5) : -1.3 * ((u - 0.5) / 0.5)) - 0.01;

function fmt(n) {
  return n.toLocaleString('en-US');
}
