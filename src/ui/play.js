import * as THREE from 'three';
import { PART_BY_ID, QUIZ_ROUNDS, ASSEMBLY, ASSEMBLY_HARD } from '../data/parts.js';
import { createStartGame, createFaultGame } from './sims.js';

const $ = (id) => document.getElementById(id);

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// "Fan" → "fan" mid-sentence, but leave "HP compressor" and "LP shaft" alone
export const lc = (name) => (/^[A-Z]{2}/.test(name) ? name : name[0].toLowerCase() + name.slice(1));
export const setFeedback = (el, text, tone = '') => {
  el.textContent = text;
  el.className = `feedback ${tone}`.trim();
};

const QUIZ_LENGTH = 6;
const TRAY_Y = -3.6; // where loose pieces wait, below the engine axis
const SNAP_X = 0.5;
const SNAP_Y = 0.65;
const PENALTY = 5; // seconds added for a wrong drop in the harder build

/**
 * Play mode: four small games.
 *   quiz   "click the part …", in three rounds, scored
 *   build  drag the scattered pieces back onto the shaft, in two levels, timed
 *   start  start the engine from cold with four switches (see sims.js)
 *   fault  read the symptoms and click the part at fault (see sims.js)
 * The page reads `out` every frame to know how to pose the engine.
 */
export function createPlay({ canvas, picker, cockpit, onGameChange, onBuilt, onResult }) {
  const menu = $('play-menu');
  const sections = { menu, quiz: $('quiz'), build: $('build'), start: $('startgame'), fault: $('faultgame') };

  /** What the scene should look like for the current game. */
  const out = {
    game: null, // null | 'quiz' | 'build' | 'start' | 'fault'
    level: 1, // build level
    explode: 0,
    offsets: null,
    hidden: null,
    focus: null,
    running: false, // engine alive (air flowing) or parked
    sim: null, // start / fault: the engine state those games dictate (see sims.js)
  };

  const show = (which) => {
    for (const [k, el] of Object.entries(sections)) el.hidden = k !== which;
  };

  function toMenu() {
    start.stop();
    fault.stop();
    out.game = null;
    out.explode = 0;
    out.offsets = null;
    out.hidden = null;
    out.focus = null;
    out.running = true;
    out.sim = null;
    drag = null;
    show('menu');
    onGameChange(null);
  }

  // ───────────────── quiz ─────────────────
  const qAsk = $('quiz-ask');
  const qFeedback = $('quiz-feedback');
  const qCount = $('quiz-count');
  const qScore = $('quiz-score');
  const qNext = $('quiz-next');
  const roundBtns = [...document.querySelectorAll('#quiz-round button')];
  let round = 'jobs';
  let questions = [];
  let qi = 0;
  let score = 0;
  let answered = false;
  let finished = false;

  function showQuestion() {
    answered = false;
    out.focus = null;
    const q = questions[qi];
    const lead = QUIZ_ROUNDS[round].lead;
    qCount.textContent = `Question ${qi + 1} of ${questions.length}`;
    qScore.textContent = `Score ${score}`;
    qAsk.textContent = `Click the part ${lead ? `${lead} ` : ''}${q.ask}.`;
    setFeedback(qFeedback, '');
    qNext.disabled = true;
    qNext.textContent = qi === questions.length - 1 ? 'Finish' : 'Next';
  }

  function startQuiz(which = round) {
    round = which;
    roundBtns.forEach((b) => b.classList.toggle('on', b.dataset.round === round));
    out.game = 'quiz';
    out.explode = 0.42; // eased apart a little so every part can be clicked
    out.offsets = null;
    out.hidden = null;
    out.running = true;
    out.sim = null;
    questions = shuffle(QUIZ_ROUNDS[round].list).slice(0, QUIZ_LENGTH);
    qi = 0;
    score = 0;
    finished = false;
    show('quiz');
    showQuestion();
    onGameChange('quiz');
  }
  roundBtns.forEach((b) => b.addEventListener('click', () => startQuiz(b.dataset.round)));

  function answer(id) {
    if (answered || finished) return;
    const q = questions[qi];
    const right = PART_BY_ID[q.answer];
    const clicked = PART_BY_ID[id];
    answered = true;
    qNext.disabled = false;
    if (id === q.answer || q.also?.includes(id)) {
      score++;
      out.focus = id;
      setFeedback(qFeedback, `Yes. The ${lc(clicked.name)} ${clicked.tagline}.`, 'good');
    } else {
      out.focus = q.answer;
      setFeedback(
        qFeedback,
        `Not quite. That is the ${lc(clicked.name)}, which ${clicked.tagline}. The answer is the ${lc(right.name)}, now lit up.`,
        'bad'
      );
    }
    qScore.textContent = `Score ${score}`;
  }

  qNext.addEventListener('click', () => {
    if (finished) {
      startQuiz();
      return;
    }
    if (qi < questions.length - 1) {
      qi++;
      showQuestion();
      return;
    }
    finished = true;
    out.focus = null;
    qCount.textContent = 'Finished';
    qAsk.textContent = `You got ${score} of ${questions.length}.`;
    const verdict =
      score === questions.length
        ? 'Every one right. Try another round.'
        : score >= questions.length - 2
          ? 'Nearly all of them. The story covers the ones you missed.'
          : 'Read the story again, or click the parts in Explore to read about each one.';
    setFeedback(qFeedback, verdict, score === questions.length ? 'good' : '');
    qNext.textContent = 'Play again';
    onResult?.({ game: 'quiz', key: round, score, total: questions.length });
  });
  $('quiz-quit').addEventListener('click', toMenu);

  // ───────────────── build ─────────────────
  const bMsg = $('build-msg');
  const bFeedback = $('build-feedback');
  const bCount = $('build-count');
  const bTime = $('build-time');
  const bHint = $('build-hint');
  const levelBtns = [...document.querySelectorAll('#build-level button')];
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // the cut face: pieces slide across it
  const grab = new THREE.Vector3();
  const now = new THREE.Vector3();
  const zero = new THREE.Vector3();
  let pieces = [];
  let duct = null; // level 1: the two duct halves, which close around the core at the end
  let drag = null;
  let clock = 0;
  let built = false;
  let hintFor = 0;

  function layoutTray() {
    // pack the pieces in a random order along a row under the engine
    const order = shuffle(pieces.filter((p) => !p.park));
    let x = -2.0;
    for (const p of order) {
      const len = p.span[1] - p.span[0];
      const centre = x + len / 2;
      p.tray.set(centre - (p.span[0] + p.span[1]) / 2, TRAY_Y, 0);
      x += len + 0.4;
    }
    for (const p of pieces) if (p.park) p.tray.set(...p.park);
  }

  function refreshBuild() {
    const placed = pieces.filter((p) => p.placed).length;
    bCount.textContent = `${placed} of ${pieces.length} in place`;
  }

  function startBuild(level = out.level) {
    out.level = level;
    levelBtns.forEach((b) => b.classList.toggle('on', Number(b.dataset.level) === level));
    out.game = 'build';
    out.explode = 0;
    out.focus = null;
    out.running = false;
    out.sim = null;
    built = false;
    clock = 0;
    drag = null;
    pieces = (level === 2 ? ASSEMBLY_HARD : ASSEMBLY).map((a) => ({
      ...a,
      name: a.name ?? PART_BY_ID[a.id].name,
      tray: new THREE.Vector3(),
      target: new THREE.Vector3(),
      cur: new THREE.Vector3(),
      placed: false,
    }));
    layoutTray();
    out.offsets = { shafts: zero };
    for (const p of pieces) {
      p.target.copy(p.tray);
      // start where the piece sits in the assembled engine, then fall to the tray
      p.cur.set(0, 0, 0);
      out.offsets[p.part] = p.cur;
    }
    if (level === 1) {
      duct = { top: new THREE.Vector3(-0.2, 2.4, 0), bottom: new THREE.Vector3(-0.2, -2.4, 0) };
      out.offsets.bypassTop = duct.top;
      out.offsets.bypassBottom = duct.bottom;
      out.hidden = new Set(['bypassTop', 'bypassBottom']);
    } else {
      duct = null;
      out.hidden = null;
    }
    bMsg.textContent = 'Drag each piece onto the shaft, where it belongs.';
    setFeedback(bFeedback, level === 2 ? `No hints this time, and a wrong drop costs ${PENALTY} seconds.` : 'The blue shaft is the spine. The air goes in on the left.');
    bHint.hidden = level === 2;
    bHint.disabled = false;
    refreshBuild();
    show('build');
    onGameChange('build');
  }
  levelBtns.forEach((b) => b.addEventListener('click', () => startBuild(Number(b.dataset.level))));

  const planePoint = (e, target) => picker.rayAt(e.clientX, e.clientY).intersectPlane(plane, target);

  canvas.addEventListener('pointerdown', (e) => {
    if (out.game !== 'build' || built || e.button !== 0) return;
    const hit = picker.pickAt(e.clientX, e.clientY);
    const piece = hit && pieces.find((p) => p.part === hit.part && !p.placed);
    if (!piece || !planePoint(e, grab)) return;
    drag = { piece, from: piece.cur.clone(), grab: grab.clone(), id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('grabbing');
    out.focus = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || !planePoint(e, now)) return;
    drag.piece.cur.copy(drag.from).add(now).sub(drag.grab);
    drag.piece.cur.z = 0;
    drag.piece.target.copy(drag.piece.cur);
  });
  const drop = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = drag.piece;
    drag = null;
    canvas.classList.remove('grabbing');
    if (Math.abs(p.cur.x) < SNAP_X && Math.abs(p.cur.y) < SNAP_Y) {
      p.placed = true;
      p.target.set(0, 0, 0);
      setFeedback(bFeedback, `${p.name} in place.`, 'good');
    } else {
      p.target.copy(p.tray);
      const onAxis = Math.abs(p.cur.y) < 1.0;
      if (onAxis && out.level === 2) clock += PENALTY;
      setFeedback(
        bFeedback,
        onAxis ? `The ${lc(p.name)} does not go there. It ${PART_BY_ID[p.id].tagline}.${out.level === 2 ? ` +${PENALTY} s.` : ''}` : '',
        onAxis ? 'bad' : ''
      );
    }
    refreshBuild();
    if (pieces.every((q) => q.placed)) finishBuild();
  };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);

  function finishBuild() {
    built = true;
    out.hidden = null;
    out.running = true;
    out.focus = null;
    bHint.disabled = true;
    bMsg.textContent = `Engine built in ${Math.round(clock)} seconds.`;
    onBuilt?.();
    setFeedback(bFeedback, out.level === 1 ? 'The duct closes around the core, and it runs.' : 'All nine pieces home, and it runs.', 'good');
    onResult?.({ game: 'build', key: `level${out.level}`, time: Math.round(clock) });
  }

  bHint.addEventListener('click', () => {
    // the next piece the air would meet that is not in yet
    const next = pieces.find((p) => !p.placed);
    if (!next) return;
    out.focus = next.id;
    hintFor = 2.2;
    const i = pieces.indexOf(next);
    const where =
      next.id === 'inlet'
        ? 'at the very front'
        : next.id === 'fan'
          ? 'at the front, inside the inlet cowl'
          : `right behind the ${lc(pieces[i - 1].name)}`;
    setFeedback(bFeedback, `Try the ${lc(next.name)}, now lit up. It goes ${where}.`);
  });
  $('build-restart').addEventListener('click', () => startBuild());
  $('build-quit').addEventListener('click', toMenu);

  // ───────────────── the two simulated games ─────────────────
  const start = createStartGame({ out, cockpit, onResult });
  const fault = createFaultGame({ out, cockpit, onResult });
  function begin(name, game) {
    out.game = name;
    out.explode = 0;
    out.offsets = null;
    out.hidden = null;
    out.focus = null;
    out.running = true;
    show(name);
    game.start();
    onGameChange(name);
  }
  $('start-quit').addEventListener('click', toMenu);
  $('fault-quit').addEventListener('click', toMenu);

  $('play-quiz').addEventListener('click', () => startQuiz());
  $('play-build').addEventListener('click', () => startBuild());
  $('play-start').addEventListener('click', () => begin('start', start));
  $('play-fault').addEventListener('click', () => begin('fault', fault));

  return {
    out,
    enter: toMenu,
    exit() {
      toMenu();
      out.running = false;
    },
    /** Jump straight into a game (deep links). */
    open(name) {
      if (name === 'quiz') startQuiz();
      else if (name === 'build') startBuild();
      else if (name === 'start') begin('start', start);
      else if (name === 'fault') begin('fault', fault);
    },
    /** A click on a part (quiz and fault). */
    onPick(hit) {
      if (!hit) return;
      if (out.game === 'quiz') answer(hit.id);
      else if (out.game === 'fault') fault.answer(hit.id);
    },
    /** A start switch was flipped on the flight deck panel. */
    onSwitch(name, on) {
      if (out.game === 'start') start.flip(name, on);
    },
    get dragging() {
      return !!drag;
    },
    update(dt) {
      if (out.game === 'start') start.update(dt);
      else if (out.game === 'fault') fault.update(dt);
      if (out.game !== 'build') return;
      const k = 1 - Math.exp(-dt * 9);
      for (const p of pieces) if (!drag || drag.piece !== p) p.cur.lerp(p.target, k);
      if (built) {
        if (duct) {
          const kd = 1 - Math.exp(-dt * 2.4);
          duct.top.lerp(zero, kd);
          duct.bottom.lerp(zero, kd);
        }
      } else {
        clock += dt;
        bTime.textContent = `${Math.floor(clock)} s`;
      }
      if (hintFor > 0 && (hintFor -= dt) <= 0 && !built) out.focus = null;
    },
  };
}
