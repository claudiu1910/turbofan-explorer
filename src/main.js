import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';
import './story.css';

import { VIEWS, cutFromSlider } from './config.js';
import { createExperience, createGovernor, blankView } from './experience.js';
import { stateAt, portraitFit, stepBack } from './timeline.js';
import { FILMS } from './films.js';
import { restAirframe } from './aircraftFilm.js';
import { AIRCRAFT_PARTS, AIRCRAFT_PART_BY_ID, AIRCRAFT_VIEWS } from './data/aircraft.js';
import { createPlane } from './ui/plane.js';
import { createCockpit } from './ui/cockpit.js';
import { createLog } from './ui/log.js';
import { engineAt, stationAt, CRUISE } from './model.js';
import { PARTS, PART_BY_ID } from './data/parts.js';
import { createTransport, createEngineControls, createHud } from './ui/transport.js';
import { createStory } from './ui/story.js';
import { createPicker } from './ui/picker.js';
import { createInfoCard, createCompareCard } from './ui/cards.js';
import { createExplorePanel } from './ui/explore.js';
import { createGraph } from './ui/graph.js';
import { createRide } from './ui/ride.js';
import { createPlay } from './ui/play.js';

const $ = (id) => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);
// frame-rate independent "move towards": rate is roughly 1 / seconds-to-settle
const approach = (cur, target, dt, rate) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const v3 = (a) => new THREE.Vector3(...a);

// ───────────── scene ─────────────
const canvas = $('stage');
const xp = await createExperience(canvas);
const { camera, engine } = xp;
const view = blankView(); // what the scene should look like this frame

// ───────────── state ─────────────
// story: the scroll-driven front page · tour: a film played against the clock ("Watch")
// explore: hands on the engine · play: the games · aircraft: the rest of the machine
const MODES = ['story', 'tour', 'explore', 'play', 'aircraft'];
/** @type {'story' | 'tour' | 'explore' | 'play' | 'aircraft' | null} */
let mode = null;
let film = FILMS.engine; // the film Watch is showing
let focusId = null; // the engine part whose details are open
let cardId = null; // the aircraft system whose details are open
let hoverId = null;
let spool = CRUISE; // where the engine actually is; it lags the throttle lever
let engineNow = engineAt(CRUISE);
let followBeforeSelect = false;

const settings = {
  spin: 1,
  flow: 1,
  aircraft: true,
  labels: true,
  bloom: true,
  figure: false,
  graph: { story: false, tour: false, explore: true, play: false, aircraft: false },
};
// the Explore panel's levers (targets; the scene eases towards them)
const explore = { throttle: CRUISE, cut: 0.5, explode: 0, xray: false, jet: false, reverse: false, burner: false, altitude: 11 };
// the Aircraft mode's levers
const plane = {
  view: 'overview', // 'overview' | 'wing' | 'cabin' | 'cockpit'
  air: true, hyd: true, elec: true, // which system lines are drawn
  gear: false, flaps: 0, ground: false, spoilers: false, reverse: false,
  cut: 1, flow: true, // the cabin: how far the skin is opened, and whether the air is shown
};

// which part glows for which word of the cycle
const GLOW_PHASE = { fan: 'suck', lpCompressor: 'suck', hpCompressor: 'squeeze', combustor: 'bang', hpTurbine: 'blow', lpTurbine: 'blow' };
const PHASE_BAND = { suck: 'fan', squeeze: 'hpc', bang: 'combustor', blow: 'lpt' };
const handsOnWeights = {};

// a point on each part for the camera to look at; it rides with the part when the engine is pulled apart
const focusAnchor = Object.fromEntries(PARTS.map((p) => [p.id, engine.anchor(p.part, p.at)]));

// ───────────── camera ─────────────
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.5;
controls.maxDistance = 60;
controls.enabled = false;

const camState = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 38 };
const blend = { active: false, k: 1, fromPos: new THREE.Vector3(), fromTarget: new THREE.Vector3(), fromFov: 38 };
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
let fly = null; // a one-off camera move between two fixed views

const currentFov = () => camera.fov / (camera.userData.aspectBoost || 1);

/** Glide from wherever the camera is onto the scripted path (a film, or the story). */
function startBlendToScript() {
  blend.active = true;
  blend.k = 0;
  blend.fromPos.copy(camera.position);
  blend.fromTarget.copy(controls.target);
  blend.fromFov = currentFov();
}

/** Glide to a fixed view, then hand the camera to the orbit controls (unless `lock`). */
function flyTo({ pos, target, fov = 40 }, { dur = 1.0, lock = false } = {}) {
  fly = {
    k: 0,
    dur,
    lock,
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
    fromFov: currentFov(),
    toPos: Array.isArray(pos) ? v3(pos) : pos.clone(),
    toTarget: Array.isArray(target) ? v3(target) : target.clone(),
    toFov: fov,
  };
  stepBack(fly.toPos, fly.toTarget, portraitFit(camera.aspect));
  blend.active = false;
  controls.enabled = false;
}

// ───────────── the film transport ─────────────
const transport = createTransport({
  film,
  isActive: () => mode === 'tour',
  onFollowChange(follow) {
    if (mode !== 'tour') return;
    controls.enabled = !follow;
    if (!follow) {
      controls.target.copy(camState.target);
      controls.update();
    } else {
      fly = null;
      startBlendToScript();
    }
  },
  onSeek() {
    blend.active = false;
  },
  onPlayChange(playing) {
    // pressing Play with a part open: close it and go back to the guided camera
    if (!playing || mode !== 'tour' || !focusId) return;
    clearSelection();
    if (followBeforeSelect) transport.setFollow(true);
  },
});
const { playback } = transport;
const hud = createHud();

// ───────────── the flight log ─────────────
const log = createLog({
  onNew: (label, done, total) => showToast(`Logged: ${label}. ${done} of ${total}.`, 3600),
  snapshot() {
    xp.render(); // a WebGL canvas only holds its picture until the frame is shown
    return canvas;
  },
});

controls.addEventListener('start', () => {
  if (mode === 'tour' && playback.follow) transport.setFollow(false);
});

// ───────────── the story ─────────────
const story = createStory({ films: FILMS, onGo: (m) => (m === 'tour' ? watch() : setMode(m)) });

// ───────────── details card, comparison, graph ─────────────
const partList = () => PARTS.filter((p) => !(explore.jet && mode === 'explore' && p.id === 'bypass'));

const info = createInfoCard({
  onClose: () => clearSelection(),
  onStep(dir) {
    if (cardId) {
      const i = AIRCRAFT_PARTS.findIndex((p) => p.id === cardId);
      openCard(AIRCRAFT_PARTS[(i + dir + AIRCRAFT_PARTS.length) % AIRCRAFT_PARTS.length].id);
      return;
    }
    const list = partList();
    const i = list.findIndex((p) => p.id === focusId);
    selectPart(list[(i + dir + list.length) % list.length].id);
  },
});
const compare = createCompareCard();
const graph = createGraph();

function selectPart(id, { move = true } = {}) {
  const p = PART_BY_ID[id];
  if (!p || mode === 'play' || mode === 'story' || mode === 'aircraft') return;
  if (mode === 'tour') {
    if (!focusId) followBeforeSelect = playback.follow;
    transport.setPlaying(false);
    if (playback.follow) transport.setFollow(false);
  } else {
    if (ride.state.active) ride.stop(true);
    compare.hide();
    // parts inside the core need the engine opened up to be seen
    if (p.inside && explore.cut < 0.45 && !explore.xray) {
      explore.cut = 0.5;
      panel.sync();
    }
  }
  focusId = id;
  log.add('parts', id);
  const list = partList();
  info.show(p, list.indexOf(p), list.length);
  if (move) {
    focusAnchor[id].getWorldPosition(tmpA);
    flyTo({ pos: tmpB.copy(tmpA).add(v3(p.cam)), target: tmpA, fov: 40 }, { dur: 0.9 });
  }
}

/** Open the details card for one of the aircraft's systems (Aircraft mode). */
function openCard(id) {
  const p = AIRCRAFT_PART_BY_ID[id];
  if (!p) return;
  focusId = null;
  cardId = id;
  log.add('systems', id);
  info.show(p, AIRCRAFT_PARTS.indexOf(p), AIRCRAFT_PARTS.length);
}

function clearSelection() {
  focusId = null;
  cardId = null;
  info.hide();
}

// ───────────── Explore panel and ride ─────────────
const ride = createRide({
  xp,
  getEngine: () => engineNow,
  getFit: () => portraitFit(camera.aspect),
  onEnd() {
    if (ride.state.u >= 0.999) log.mark(`ride-${ride.state.path}`); // rode it all the way
    controls.target.copy(ride.lookAt);
    flyTo(VIEWS.explore, { dur: 1.3 });
  },
});

function startRide(path) {
  clearSelection();
  compare.hide();
  // the ride runs along the cut face of an assembled engine
  explore.cut = 0.5;
  explore.explode = 0;
  explore.xray = false;
  if (path === 'bypass') explore.reverse = false;
  panel.sync();
  fly = null;
  controls.enabled = false;
  picker.clearHover();
  ride.start(path);
}

const panel = createExplorePanel({
  state: explore,
  onRide: startRide,
  onChange(what) {
    if (what === 'type') {
      if (ride.state.active) ride.stop();
      if (explore.jet) {
        clearSelection();
        compare.show();
      } else compare.hide();
    }
    if (what === 'reverse' && explore.reverse) {
      // the reverser only makes sense on an assembled engine
      explore.explode = 0;
      panel.sync();
      log.mark('reverser');
    }
    if (what === 'type' && explore.jet) log.mark('turbojet');
    if (what === 'burner' && explore.burner) {
      compare.hide();
      log.mark('turbojet');
      log.mark('afterburner');
      showToast('Afterburner: fuel sprayed straight into the exhaust. About half as much thrust again, for three times the fuel. Push the throttle up.', 7000);
    }
    if (what === 'altitude' && explore.altitude < 0.05) log.mark('altitude');
    if ((what === 'cut' || what === 'explode' || what === 'xray') && ride.state.active) ride.stop();
  },
});

// ───────────── the flight deck panel (Aircraft mode, and two of the games) ─────────────
const cockpit = createCockpit({
  onSwitch: (name, on) => play.onSwitch(name, on),
  onLever: () => log.mark('cockpit'),
});
/** Results of the games, for the flight log. */
function onResult(r) {
  if (r.game === 'quiz') log.best(`quiz-${r.key}`, r.score, { of: r.total });
  else if (r.game === 'fault') log.best('fault-faults', r.score, { of: r.total });
  else if (r.game === 'build') log.best(`build-${r.key}`, r.time);
  else if (r.game === 'start') log.best(`start-${r.key}`, r.time);
}

// ───────────── Play ─────────────
const play = createPlay({
  canvas,
  cockpit,
  onResult: (r) => onResult(r),
  picker: { pickAt: (x, y) => picker.pickAt(x, y), rayAt: (x, y) => picker.rayAt(x, y) },
  onGameChange(game) {
    if (mode !== 'play') return;
    picker.clearHover();
    if (game === 'build') flyTo(play.out.level === 2 ? VIEWS.assemblyHard : VIEWS.assembly, { dur: 1.1, lock: true });
    else if (game === 'start' || game === 'fault') flyTo(VIEWS.sim, { dur: 1.0 });
    else flyTo(VIEWS.quiz, { dur: 1.0 });
  },
  onBuilt() {
    // step in for a proper look at the finished engine, and let the user orbit it
    flyTo(VIEWS.built, { dur: 1.6 });
  },
});

// ───────────── Aircraft ─────────────
const planePanel = createPlane({
  state: plane,
  aircraft: xp.aircraft,
  camera,
  onChange(what) {
    if (what === 'gear' && plane.gear) log.mark('gear');
    if (what === 'flaps' && plane.flaps > 0.95) log.mark('flaps');
    if (what === 'ground' && plane.ground) log.mark('runway');
    if (what !== 'view') return;
    if (plane.view === 'cabin') log.mark('cabin');
    clearSelection();
    flyTo(AIRCRAFT_VIEWS[plane.view], { dur: 1.4 });
    syncCockpit();
  },
  onCard: openCard,
  onGo: (m) => setMode(m),
  onLand() {
    // the landing is the second half of the aircraft film
    setFilm('aircraft');
    playback.t = 11.6;
    setMode('tour');
  },
});

/** The Aircraft mode's flight deck view puts the panel up, with a live thrust lever. */
function syncCockpit() {
  if (mode === 'aircraft' && plane.view === 'cockpit') cockpit.show('free');
  else if (mode !== 'play') cockpit.hide();
}

// ───────────── hover and click on the engine ─────────────
const tooltip = $('tooltip');
const picker = createPicker({
  canvas,
  camera,
  engine,
  isEnabled: () => mode !== 'story' && mode !== 'aircraft' && !ride.state.active && !fly && !play.dragging,
  onHover(id, x, y) {
    if (id === 'bypass' && view.jet > 0.5) id = null; // on a turbojet that shell is just the casing
    hoverId = id;
    canvas.classList.toggle('pointing', !!id);
    if (id && mode !== 'play') {
      tooltip.innerHTML = `${PART_BY_ID[id].name}<small>click for details</small>`;
      tooltip.style.transform = `translate(${x + 14}px, ${y + 16}px)`;
      tooltip.hidden = false;
    } else tooltip.hidden = true;
  },
  onPick(hit) {
    if (mode === 'play') {
      play.onPick(hit);
      return;
    }
    if (!hit || (hit.id === 'bypass' && view.jet > 0.5)) {
      if (focusId) clearSelection();
      return;
    }
    selectPart(hit.id);
  },
});

// ───────────── modes ─────────────
const tabs = [...document.querySelectorAll('#modes button')];
const watchBtn = $('btn-watch');
const tools = $('tools');
const moreBtn = $('btn-more');

function syncGraph() {
  graph.setVisible(settings.graph[mode]);
  engineControls.setGraph(settings.graph[mode]);
}

/** Keep the address in step with the mode, so a reload or a shared link lands in the same place. */
let started = false; // the address the page was opened with is left alone
function syncAddress() {
  if (!started) return;
  const q = new URLSearchParams(location.search);
  q.delete('t');
  q.delete('part');
  if (mode === 'story') q.delete('mode');
  else q.set('mode', mode);
  if (mode === 'tour' && film.id !== 'engine') q.set('film', film.id);
  else q.delete('film');
  const s = q.toString();
  history.replaceState(null, '', s ? `?${s}` : location.pathname);
}

function setMode(next) {
  if (next === mode || !MODES.includes(next)) return;
  const from = mode;

  // ── leave ──
  if (ride.state.active) ride.stop(true);
  if (from === 'play') play.exit();
  if (from === 'story') story.exit();
  clearSelection();
  compare.hide();
  picker.clearHover();
  tooltip.hidden = true;
  tools.classList.remove('open');
  moreBtn.setAttribute('aria-expanded', 'false');
  fly = null;

  // ── arrive ──
  mode = next;
  document.body.dataset.mode = next;
  tabs.forEach((b) => {
    const on = b.dataset.mode === next;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  watchBtn.setAttribute('aria-pressed', String(next === 'tour'));
  view.offsets = null;
  view.hidden = null;
  controls.maxDistance = next === 'aircraft' ? 150 : 60;

  if (next === 'story') {
    story.enter();
    transport.setPlaying(false);
    controls.enabled = false;
    if (from) startBlendToScript();
  } else if (next === 'tour') {
    if (playback.t >= transport.duration - 0.01) playback.t = 0;
    transport.setFollow(true); // blends the camera onto the guided path
    transport.setPlaying(true);
  } else {
    transport.setPlaying(false);
    hud.setPhase(null);
    if (next === 'explore') {
      panel.sync();
      flyTo(VIEWS.explore, { dur: from === 'story' ? 1.5 : 1.0 });
    } else if (next === 'aircraft') {
      planePanel.sync();
      flyTo(AIRCRAFT_VIEWS[plane.view], { dur: 1.6 });
    } else {
      play.enter();
      flyTo(VIEWS.quiz);
    }
  }
  syncCockpit();
  syncGraph();
  syncAddress();
}
tabs.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
/** Watch: play the film from the top. */
function watch() {
  if (mode !== 'tour') playback.t = 0;
  setMode('tour');
}
watchBtn.addEventListener('click', watch);

// Watch has two films; the transport bar is laid out for whichever is showing
const filmBtns = [...document.querySelectorAll('#film-pick button')];
function setFilm(id) {
  if (!FILMS[id] || film === FILMS[id]) return;
  film = FILMS[id];
  transport.setFilm(film);
  filmBtns.forEach((b) => b.classList.toggle('on', b.dataset.film === id));
  playback.t = 0;
  blend.active = false;
  syncAddress();
}
filmBtns.forEach((b) =>
  b.addEventListener('click', () => {
    setFilm(b.dataset.film);
    if (playback.follow) transport.setFollow(true);
    transport.setPlaying(true);
  })
);
// on a phone the tools fold into a small menu
moreBtn.addEventListener('click', () => {
  const open = tools.classList.toggle('open');
  moreBtn.setAttribute('aria-expanded', String(open));
});

const engineControls = createEngineControls({
  onSpin: (v) => (settings.spin = v),
  onFlow: (v) => (settings.flow = v),
  onLabels: (v) => (settings.labels = v),
  onAircraft: (v) => (settings.aircraft = v),
  onBloom: (v) => (settings.bloom = v),
  onGraph(v) {
    settings.graph[mode] = v;
    syncGraph();
  },
  onFigure: (v) => (settings.figure = v),
  onResetView() {
    if (ride.state.active) ride.stop(true);
    clearSelection();
    if (mode === 'tour') transport.setFollow(true);
    else if (mode === 'explore') flyTo(VIEWS.explore);
    else if (mode === 'aircraft') flyTo(AIRCRAFT_VIEWS[plane.view]);
    else if (mode === 'play') {
      const g = play.out.game;
      if (g === 'build') flyTo(play.out.level === 2 ? VIEWS.assemblyHard : VIEWS.assembly, { lock: true });
      else flyTo(g === 'start' || g === 'fault' ? VIEWS.sim : VIEWS.quiz);
    }
  },
});

// ───────────── graphics quality ─────────────
const qualityBtns = [...document.querySelectorAll('#ctl-quality button')];
const toast = $('toast');
let toastTimer = 0;
const QUALITY_NAME = { high: 'Full', medium: 'Balanced', low: 'Light' };
function showQuality(level) {
  qualityBtns.forEach((b) => b.classList.toggle('on', b.dataset.q === level));
}
function showToast(text, ms = 5000) {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), ms);
}
// if frames run slow, the graphics step down by themselves (until the user chooses a preset)
const governor = createGovernor(xp, (level) => {
  showQuality(level);
  showToast(`Graphics set to ${QUALITY_NAME[level]} to keep things smooth.`);
});
qualityBtns.forEach((b) =>
  b.addEventListener('click', () => {
    governor.lock();
    xp.setQuality(b.dataset.q);
    showQuality(b.dataset.q);
  })
);

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (ride.state.active) ride.stop();
  else if (focusId) clearSelection();
});

// ───────────── sizing ─────────────
window.addEventListener('resize', () => xp.resize());
xp.resize();

// ───────────── one frame of each mode ─────────────
/** Anything left over from Explore fades away while a film is on screen. */
function fadeHandsOn(dt) {
  view.xray = approach(view.xray, 0, dt, 6);
  view.reverse = approach(view.reverse, 0, dt, 4);
  view.jet = approach(view.jet, 0, dt, 4);
  view.burner = approach(view.burner, 0, dt, 4);
}

function storyFrame(dt) {
  const p = story.update(dt);
  fadeHandsOn(dt);
  const { s, engine: e } = p.film.fill(view, p.t);
  const tried = story.applyTries(view, s);
  view.playing = true; // blades keep turning and air keeps moving while you read
  view.inside = true; // the film times its own labels
  spool = s.run;
  engineNow = tried ?? e;
  hud.setPhase(s.activePhase);
  if (story.finished) log.mark('story');
  return s;
}

function tourFrame(dt) {
  if (playback.playing) {
    playback.t += dt * playback.speed;
    if (playback.t >= film.duration) {
      playback.t = film.duration;
      transport.setPlaying(false);
      log.mark(`film-${film.id}`);
    }
  }
  fadeHandsOn(dt);
  const { s, engine: e } = film.fill(view, playback.t);
  view.playing = playback.playing;
  view.inside = true; // the film times its own labels
  spool = s.run;
  engineNow = e;

  hud.update(s);
  // with a part open, the cycle pill follows that part instead of the paused timeline
  if (focusId) hud.setPhase(PART_BY_ID[focusId].phase);
  transport.render();
  return s;
}

function handsOnPhase(dt, id) {
  for (const k of ['suck', 'squeeze', 'bang', 'blow']) view.phase[k] = approach(view.phase[k], k === id ? 0.8 : 0, dt, 5);
  for (const [part, ph] of Object.entries(GLOW_PHASE)) handsOnWeights[part] = view.phase[ph];
  view.stageWeights = handsOnWeights;
}

// what Explore has eased to so far: its height above the runway, and the gear that goes with it
const exploreNow = { altitude: 11, gear: 0 };

function exploreFrame(dt) {
  restAirframe(view);
  const riding = ride.state.active;
  // near the ground the runway comes into view and the wheels come down
  exploreNow.altitude = approach(exploreNow.altitude, explore.altitude, dt, 2.4);
  const agl = exploreNow.altitude * 1000;
  exploreNow.gear = moveTo(exploreNow.gear, agl < 80 ? 1 : 0, dt / 3.2);
  view.gear = exploreNow.gear;
  view.ground = agl < 420 ? { agl: agl < 0.5 ? 0 : agl, travel: 0, alpha: 1 - smooth(clamp01((agl - 160) / 250)) } : null;
  view.wide = !!view.ground; // near the ground the far wing and its wheels can be seen under the belly
  view.burner = approach(view.burner, explore.burner ? 1 : 0, dt, 3) * clamp01((spool - 0.45) / 0.45 + 0.25);
  spool = approach(spool, explore.throttle, dt, 1.1); // engines take a moment to spool up
  view.jet = approach(view.jet, explore.jet ? 1 : 0, dt, 3.2);
  view.reverse = approach(view.reverse, explore.reverse && !explore.jet ? 1 : 0, dt, 2.2);
  view.xray = approach(view.xray, explore.xray ? 1 : 0, dt, 6);
  view.cutConst = approach(view.cutConst, cutFromSlider(explore.cut), dt, 7);
  view.explode = approach(view.explode, explore.explode, dt, 6);
  engineNow = engineAt(spool, { jet: view.jet, reverse: view.reverse, burner: explore.burner ? 1 : 0, altitude: exploreNow.altitude });

  view.playing = true;
  const apart = smooth(clamp01((view.explode - 0.25) / 0.55)); // no air flows through loose parts
  // with a part selected the air is turned down so it does not hide it
  view.flow = approach(view.flow, (1 - 0.88 * apart) * (0.5 + 0.5 * spool) * (focusId ? 0.5 : 1), dt, 3);
  view.hot = approach(view.hot, 0.3 + 0.7 * spool, dt, 2);
  view.fxBang = approach(view.fxBang, 0.05 + 0.3 * spool, dt, 4);
  view.fxBlow = approach(view.fxBlow, 0.1 + 0.42 * spool, dt, 4);
  view.thrustAlpha = approach(view.thrustAlpha, view.explode > 0.75 || view.reverse > 0.6 ? 1 : 0, dt, 4);
  // standing on the runway there is no wind going past
  view.ambient = 0.38 * (1 - 0.8 * clamp01(1 - view.cutConst / 1.78)) * (0.1 + 0.9 * clamp01(agl / 60));

  view.lpRate = 0.3 + 0.9 * engineNow.n1f;
  view.hpRate = 0.3 + 0.9 * engineNow.n2f;
  view.flowSpeed = 0.45 + 0.75 * spool + 0.25 * view.jet;

  // the cycle pill and the airflow emphasis follow whatever the user is looking at
  let phaseId = focusId ? PART_BY_ID[focusId].phase : null;
  if (riding && ride.state.x != null) {
    const x = ride.state.x;
    phaseId = ride.state.path === 'bypass' ? 'suck' : x < 1.5 ? 'suck' : x < 4.1 ? 'squeeze' : x < 5.0 ? 'bang' : 'blow';
  }
  handsOnPhase(dt, phaseId);
  hud.setPhase(phaseId);

  view.labelT = null; // every label, regardless of film time
  view.inside = view.cutConst < 0.9 || view.xray > 0.5 || view.explode > 0.35;
  view.hpcT = engineNow.t3;
  view.hpcPR = engineNow.opr;
  view.gasT = engineNow.t4;

  panel.setGauges(engineNow, view.reverse);
}

/** The games that run the engine from a script (Start the engine, Find the fault). */
function simFrame(dt, g) {
  const n1f = g.n1 / 100;
  const n2f = g.n2 / 100;
  view.playing = true;
  view.cutConst = approach(view.cutConst, cutFromSlider(0.5), dt, 7);
  view.explode = approach(view.explode, 0, dt, 5);
  view.offsets = null;
  view.hidden = null;
  view.xray = approach(view.xray, 0, dt, 6);
  view.jet = approach(view.jet, 0, dt, 4);
  view.burner = approach(view.burner, 0, dt, 4);
  view.reverse = approach(view.reverse, g.reverse, dt, 4);

  // the numbers the display runs on
  spool = n1f;
  engineNow = { ...engineAt(0), n1: g.n1, n2: g.n2, n1f, n2f, egt: g.egt, fuel: g.ff, forward: 320 * Math.pow(n1f, 1.5), throttle: n1f };
  view.lpRate = 1.25 * n1f; // an engine in these games can be standing still
  view.hpRate = 1.25 * n2f;
  view.lptRate = g.lpt > 1.05 ? 1.25 * 0.86 * g.lpt : null;
  view.flow = approach(view.flow, Math.min(1, n1f + 0.25 * n2f), dt, 4);
  view.flowSpeed = 0.3 + 0.9 * n1f;
  view.hot = approach(view.hot, clamp01((g.egt - 150) / 750), dt, 3);
  view.fxBang = approach(view.fxBang, 0.55 * g.flame, dt, 6);
  view.fxBlow = approach(view.fxBlow, 0.5 * g.flame * n1f, dt, 4);
  view.thrustAlpha = approach(view.thrustAlpha, 0, dt, 4);
  view.ambient = 0.05;
  view.shake = g.shake;
  view.surge = g.surge;
  view.sparks = g.sparks;
  view.torch = g.torch ?? 0;
  handsOnPhase(dt, null);
  view.labelT = null;
}

function playFrame(dt) {
  restAirframe(view);
  const o = play.out;
  play.update(dt);
  if (o.sim) {
    simFrame(dt, o.sim);
    return;
  }
  const build = o.game === 'build';
  view.playing = true;
  view.cutConst = approach(view.cutConst, cutFromSlider(0.5), dt, 7);
  view.explode = approach(view.explode, o.explode, dt, 5);
  view.offsets = o.offsets;
  view.hidden = o.hidden;
  fadeHandsOn(dt);

  // while it is in pieces the engine is dead; once built it spools up
  const alive = o.running ? 1 : 0;
  spool = approach(spool, build ? 0.65 * alive : 0.45, dt, 1.0);
  engineNow = engineAt(spool);
  view.flow = approach(view.flow, build ? 0.95 * alive : 0.3, dt, 2.5);
  view.hot = approach(view.hot, build ? 0.15 + 0.6 * alive : 0.45, dt, 2);
  view.fxBang = approach(view.fxBang, build ? 0.4 * alive : 0.15, dt, 3);
  view.fxBlow = approach(view.fxBlow, build ? 0.4 * alive : 0.15, dt, 3);
  view.thrustAlpha = approach(view.thrustAlpha, 0, dt, 4);
  view.ambient = 0.08;
  const turning = build ? alive : 1;
  view.lpRate = approach(view.lpRate, turning * (0.3 + 0.9 * engineNow.n1f), dt, 2);
  view.hpRate = approach(view.hpRate, turning * (0.3 + 0.9 * engineNow.n2f), dt, 2);
  view.flowSpeed = 0.5 + 0.7 * spool;
  handsOnPhase(dt, null);
  view.labelT = null;
}

// what the Aircraft mode has eased to so far
const planeNow = { ground: 0, air: 0, hyd: 0, elec: 0 };
const moveTo = (cur, target, step) => (cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step));

function aircraftFrame(dt) {
  const st = plane;
  const deck = st.view === 'cockpit'; // the flight deck view
  view.playing = true;
  view.wide = true;
  view.labelSet = 'aircraft';
  view.labelT = null;
  view.acView = st.view;
  view.inside = true;
  view.offsets = null;
  view.hidden = null;
  view.xray = approach(view.xray, 0, dt, 6);
  view.jet = approach(view.jet, 0, dt, 4);
  view.burner = approach(view.burner, 0, dt, 4);
  view.explode = approach(view.explode, 0, dt, 6);
  // the flight deck looks at the cut-open engine; everywhere else it is whole
  view.cutConst = approach(view.cutConst, deck ? cutFromSlider(0.5) : 1.78, dt, 5);

  // wing and wheels
  planeNow.ground = approach(planeNow.ground, st.ground ? 1 : 0, dt, 1.5);
  const k = planeNow.ground;
  view.ground = k > 0.004 ? { agl: 45 * (1 - smooth(k)) ** 2, travel: 0, alpha: Math.min(1, k * 1.7) } : null;
  view.gear = moveTo(view.gear, st.gear ? 1 : 0, dt / 3.2); // the legs take their time
  view.flaps = approach(view.flaps, st.flaps, dt, 2.2);
  view.slats = Math.min(1, view.flaps * 1.6); // slats come out first
  view.spoilers = approach(view.spoilers, st.spoilers ? 1 : 0, dt, 7);
  // on the flight deck the thrust lever is in charge: pull it below idle for reverse
  const lever = cockpit.lever;
  const reversing = deck ? lever < -0.02 : st.reverse && st.ground;
  view.reverse = approach(view.reverse, reversing ? 1 : 0, dt, 2.2);
  view.reverseAll = view.reverse;
  view.brakes = approach(view.brakes, 0, dt, 2);
  view.pitch = approach(view.pitch, 0, dt, 3);
  view.veil = approach(view.veil, 0, dt, 4);
  view.rolled = 0;
  view.smoke = null;

  // the engines
  spool = approach(spool, deck ? Math.abs(lever) * (lever < 0 ? 0.75 : 1) : view.reverse > 0.5 ? 0.55 : st.ground ? 0.08 : 0.5, dt, 1.1);
  engineNow = engineAt(spool, { reverse: view.reverse });
  view.flow = approach(view.flow, deck ? 0.5 + 0.5 * spool : 0.3 + 0.5 * view.reverse, dt, 3);
  view.hot = approach(view.hot, 0.3 + 0.7 * spool, dt, 2);
  view.fxBang = approach(view.fxBang, deck ? 0.05 + 0.3 * spool : 0, dt, 4);
  view.fxBlow = approach(view.fxBlow, 0.1 + 0.42 * spool, dt, 4);
  view.thrustAlpha = approach(view.thrustAlpha, 0, dt, 4);
  view.ambient = approach(view.ambient, st.ground ? 0.03 : 0.3, dt, 2);
  view.lpRate = 0.3 + 0.9 * engineNow.n1f;
  view.hpRate = 0.3 + 0.9 * engineNow.n2f;
  view.flowSpeed = 0.45 + 0.75 * spool;
  handsOnPhase(dt, null);

  // cabin and the system lines
  view.cabin = approach(view.cabin ?? 0, st.view === 'cabin' ? st.cut : 0, dt, 4);
  const overview = st.view === 'overview';
  planeNow.air = approach(planeNow.air, (overview && st.air) || (st.view === 'cabin' && st.flow) ? 1 : 0, dt, 5);
  planeNow.hyd = approach(planeNow.hyd, overview && st.hyd ? 1 : 0, dt, 5);
  planeNow.elec = approach(planeNow.elec, overview && st.elec ? 1 : 0, dt, 5);
  view.systems = planeNow;
}

// ───────────── camera, every frame ─────────────
/** Where the script (the story's scroll, or the film's clock) puts the camera right now. */
function scriptedCamera() {
  if (mode === 'story') story.camera(camState, camera.aspect);
  else {
    film.camera(playback.t, camState);
    stepBack(camState.pos, camState.target, portraitFit(camera.aspect));
  }
}

function cameraFrame(dt) {
  if (ride.state.active) {
    ride.update(dt, camera);
    xp.setFov(40);
    return;
  }
  if (fly) {
    fly.k = Math.min(1, fly.k + dt / fly.dur);
    const e = smooth(fly.k);
    camera.position.lerpVectors(fly.fromPos, fly.toPos, e);
    tmpA.lerpVectors(fly.fromTarget, fly.toTarget, e);
    camera.lookAt(tmpA);
    controls.target.copy(tmpA);
    xp.setFov(lerp(fly.fromFov, fly.toFov, e));
    if (fly.k >= 1) {
      controls.enabled = !fly.lock;
      fly = null;
    }
    return;
  }
  if (mode === 'story' || (mode === 'tour' && playback.follow)) {
    let { pos, target, fov } = camState;
    if (blend.active) {
      blend.k = Math.min(1, blend.k + dt / 0.9);
      const e = smooth(blend.k);
      pos = tmpA.lerpVectors(blend.fromPos, camState.pos, e);
      target = tmpB.lerpVectors(blend.fromTarget, camState.target, e);
      fov = lerp(blend.fromFov, camState.fov, e);
      if (blend.k >= 1) blend.active = false;
    }
    camera.position.copy(pos);
    camera.lookAt(target);
    controls.target.copy(target);
    xp.setFov(fov);
    return;
  }
  controls.update();
}

const cardOpen = () => info.open || !$('compare-card').hidden;
let cardWasOpen = false;
/** The phone layout swaps the Explore panel for an open card, so the page has to know about it. */
function syncCardClass() {
  const open = cardOpen();
  if (open === cardWasOpen) return;
  cardWasOpen = open;
  document.body.classList.toggle('card-open', open);
}

function safeInsets() {
  if (mode === 'story') return story.safe;
  // phones: keep labels out of the two rows of buttons at the top and the caption above the transport
  if (window.innerWidth <= 760) return { left: 6, right: 6, top: 100, bottom: mode === 'tour' ? 250 : window.innerHeight * 0.46 };
  if (mode !== 'explore' && mode !== 'aircraft') return null;
  return { left: 272, right: cardOpen() ? 328 : 10, top: 96, bottom: graph.visible ? 182 : 20 };
}

// Panels cover part of the picture, so slide it to keep the engine centred in what is left.
const shiftNow = { x: 0, y: 0 };
const shiftWant = { x: 0, y: 0 };
function pictureShift() {
  if (mode === 'story') return Object.assign(shiftWant, story.shift);
  const narrow = window.innerWidth <= 760;
  if (narrow) {
    // on a phone the panels and cards are sheets along the bottom: move the picture up instead
    shiftWant.x = 0;
    shiftWant.y = -window.innerHeight * (mode === 'explore' || mode === 'aircraft' ? 0.2 : mode === 'play' ? 0.1 : cardOpen() ? 0.2 : 0.04);
    return shiftWant;
  }
  const left = mode === 'explore' || mode === 'aircraft' ? 268 : 0;
  const right = cardOpen() ? 318 : 0;
  shiftWant.x = (left - right) / 2;
  // the flight deck panel takes the bottom of the picture
  shiftWant.y = cockpit.visible ? -window.innerHeight * (mode === 'play' ? 0.17 : 0.1) : 0;
  return shiftWant;
}

// The aircraft's read-out (speed, height, gear, flaps) takes the cycle pill's place while it lands.
const flight = { el: $('flight'), speed: $('fl-speed'), height: $('fl-height'), gear: $('fl-gear'), flaps: $('fl-flaps'), shown: false, text: '' };
function syncFlight(s) {
  const on = !!s && s.duration !== undefined && 'inSight' in s;
  if (on !== flight.shown) {
    flight.shown = on;
    flight.el.hidden = !on;
    document.body.classList.toggle('flying', on);
  }
  if (!on) return;
  const kmh = Math.round((s.speed * 3.6) / 5) * 5;
  const h = s.height > 1000 ? '11,000 m' : `${s.height < 10 ? s.height.toFixed(1) : Math.round(s.height)} m`;
  const gear = s.gear < 0.02 ? 'Up' : s.gear > 0.98 ? 'Down' : 'Moving';
  const flaps = s.flaps < 0.04 ? 'Up' : s.flaps > 0.96 ? 'Landing' : 'Moving';
  const text = `${kmh}|${h}|${gear}|${flaps}`;
  if (text === flight.text) return;
  flight.text = text;
  flight.speed.textContent = `${kmh} km/h`;
  flight.height.textContent = s.onGround ? 'On the runway' : h;
  flight.gear.textContent = gear;
  flight.flaps.textContent = flaps;
}

// ───────────── loop ─────────────
const timer = new THREE.Timer();

function frame() {
  timer.update();
  const rawDt = timer.getDelta();
  governor.frame(rawDt);
  tick(Math.min(rawDt, 0.1));
  requestAnimationFrame(frame);
}

/** One step of the whole app: mode logic, camera, scene, interface. */
function tick(dt) {
  // only the games set these, and only for the frame in hand
  view.shake = view.surge = view.sparks = view.torch = 0;
  view.lptRate = null;

  let script = null; // the film state, while a film or the story is on screen
  if (mode === 'story') script = storyFrame(dt);
  else if (mode === 'tour') script = tourFrame(dt);
  else if (mode === 'explore') exploreFrame(dt);
  else if (mode === 'aircraft') aircraftFrame(dt);
  else playFrame(dt);
  syncFlight(script);
  if (cockpit.visible) {
    const sim = mode === 'play' && play.out.sim;
    if (!sim) {
      cockpit.setGauges({
        n1: engineNow.n1, n2: engineNow.n2, egt: engineNow.egt, ff: engineNow.fuel, vib: 0.2 + 0.4 * engineNow.n1f,
        status: view.reverse > 0.5 ? 'REVERSE' : '',
      });
    }
    // lift the panel clear of whatever sheet is under it
    const narrow = window.innerWidth <= 760;
    cockpit.setBottom(sim ? $('play-panel').offsetHeight + 22 : narrow ? $('aircraft-panel').offsetHeight : null);
  }

  view.spin = settings.spin;
  view.flowDensity = settings.flow;
  // the build game gets a clear workbench: no aircraft behind the pieces
  view.aircraft = settings.aircraft && !(mode === 'play' && play.out.game === 'build');
  view.bloomOn = settings.bloom;
  view.figure = approach(view.figure, settings.figure ? 1 : 0, dt, 5);
  view.focus = mode === 'play' ? play.out.focus : focusId;
  view.hover = hoverId;
  view.labelsOn = settings.labels && (mode === 'story' ? story.labelsOn : mode !== 'play' && !focusId && !cardId && !ride.state.active);
  // the lens focuses on whatever the camera is looking at (set below, once the camera has moved)
  view.focusAt = ride.state.active ? ride.lookAt : controls.target;
  view.safe = safeInsets();

  syncCardClass();
  pictureShift();
  shiftNow.x = approach(shiftNow.x, shiftWant.x, dt, 5);
  shiftNow.y = approach(shiftNow.y, shiftWant.y, dt, 5);
  xp.setShift(shiftNow.x, shiftNow.y);
  scriptedCamera();
  cameraFrame(dt);
  picker.update();
  planePanel.updateHotspots(mode === 'aircraft' && plane.view === 'overview' && !fly && !cardOpen());

  xp.apply(view, dt);
  if (!(mode === 'story' && story.covered)) xp.render(); // nothing to draw behind a solid page
  xp.updateLabels(view, dt);

  // graph: follows the ride, else the selected part, else the film's current stage
  const riding = ride.state.active && ride.state.x != null;
  const band = riding
    ? stationAt(ride.state.x, ride.state.path).id
    : focusId
      ? PART_BY_ID[focusId].station
      : script
        ? PHASE_BAND[script.activePhase] ?? null
        : null;
  graph.update(engineNow, riding ? ride.state.path : 'core', riding ? ride.state.x : null, band);

}

// ───────────── start ─────────────
// The page opens on the story. ?mode=explore, ?mode=play and ?mode=tour (the film) jump straight
// in; ?t=12.5 opens the film paused at that moment (&film=aircraft for the second film);
// ?part=fan opens a part's details.
// ?quality=high|medium|low fixes the graphics preset.
const params = new URLSearchParams(location.search);
if (['high', 'medium', 'low'].includes(params.get('quality'))) {
  governor.lock();
  xp.setQuality(params.get('quality'));
  showQuality(params.get('quality'));
}
if (params.get('film') === 'aircraft') setFilm('aircraft');
const startAt = parseFloat(params.get('t'));
const startPart = PART_BY_ID[params.get('part')] ? params.get('part') : null;
let startMode = params.get('mode');
if (!MODES.includes(startMode)) startMode = !Number.isNaN(startAt) || params.has('film') ? 'tour' : startPart ? 'explore' : 'story';
if (['overview', 'wing', 'cabin', 'cockpit'].includes(params.get('view'))) plane.view = params.get('view');
if (!Number.isNaN(startAt)) playback.t = Math.min(film.duration, Math.max(0, startAt));
if (params.has('t') || params.has('mode') || params.has('part') || params.has('film')) $('loading').remove();

// start from the film's camera, so the first move into another mode has somewhere to come from
film.camera(playback.t, camState);
stepBack(camState.pos, camState.target, portraitFit(camera.aspect));
camera.position.copy(camState.pos);
controls.target.copy(camState.target);
camera.lookAt(camState.target);

if (startMode !== 'story') document.documentElement.classList.remove('story');
setMode(startMode);
started = true;
if (!Number.isNaN(startAt)) transport.setPlaying(false);
if (startMode === 'play' && params.get('game')) play.open(params.get('game'));
if (startPart && startMode !== 'story' && startMode !== 'play') {
  // wait a frame so the anchors have world positions
  requestAnimationFrame(() => selectPart(startPart));
}

requestAnimationFrame(frame);
requestAnimationFrame(() => {
  const loading = $('loading');
  if (!loading) return;
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 900);
});

// handles for debugging and screenshots
window.__turbofan = {
  xp, view, controls, playback, transport, story, explore, panel, plane, planePanel, cockpit, log, ride, play, picker, setMode, setFilm, selectPart, openCard, clearSelection, stateAt,
  get mode() {
    return mode;
  },
  /** Advance the app by n steps of dt seconds without waiting for the screen (for tests). */
  step(n = 1, dt = 1 / 30) {
    for (let i = 0; i < n; i++) tick(dt);
  },
  /** Put the free camera somewhere exact: look([x, y, z], [tx, ty, tz]). */
  look(pos, target) {
    fly = null;
    camera.position.set(...pos);
    controls.target.set(...target);
    controls.enabled = true;
    controls.update();
  },
};
