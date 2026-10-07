import { createStartSim, START, FAILS } from '../sim/start.js';
import { FAULTS } from '../data/faults.js';
import { PART_BY_ID } from '../data/parts.js';
import { lc, setFeedback } from './play.js';

const $ = (id) => document.getElementById(id);
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// The two games that run the engine from a script instead of from the throttle.
// Each one writes the engine's state into `out.sim` every frame; the page poses the scene from it:
//   n1, n2 (%), egt (°C), ff (kg/s), vib      the numbers
//   flame 0..1, torch 0..1, shake, surge, sparks, fan, lpt (spin rates), reverse   what is seen
const blankSim = () => ({ n1: 0, n2: 0, egt: 20, ff: 0, vib: 0, flame: 0, torch: 0, shake: 0, surge: 0, sparks: 0, fan: 1, lpt: 1, reverse: 0 });

// what the coach says at each point of a start: [what to do, why]
const COACH = {
  bleed: ['Open the bleed air.', 'The starter is a small air turbine. It needs compressed air, from the little turbine in the tail or from an engine that is already running.'],
  starter: ['Open the starter.', 'Air now spins the core. Watch N2 climb.'],
  wait: [`Wait for ${START.fuelAt} % N2.`, 'The core has to be moving enough air before any fuel goes in.'],
  ign: ['Ignition on.', 'Igniters spark inside the combustor, like spark plugs that stay on.'],
  fuel: ['Fuel on.', 'With air moving and a spark ready, it will light at once.'],
  light: ['Wait for the flame to catch.', ''],
  spool: ['Light-off. Keep the starter helping.', 'The exhaust temperature jumps, then eases as the core speeds up and pulls more air through.'],
  release: ['Starter off.', `Past about ${START.starterOff} % N2 the engine can drive itself.`],
  settle: ['Let it settle at idle.', ''],
};
const NEXT_SWITCH = { bleed: 'bleed', starter: 'starter', ign: 'ign', fuel: 'fuel', release: 'starter' };

/** Start the engine from cold: four switches, in the right order, at the right moments. */
export function createStartGame({ out, cockpit, onResult }) {
  const msg = $('start-msg');
  const feedback = $('start-feedback');
  const time = $('start-time');
  const coach = $('start-coach');
  const state = blankSim();
  let sim = null;
  let active = false;
  let reported = false;
  let lastAdvice = '';

  function start() {
    sim = createStartSim();
    active = true;
    reported = false;
    lastAdvice = '';
    Object.assign(state, blankSim());
    out.sim = state;
    cockpit.show('start');
  }
  $('start-restart').addEventListener('click', () => active && start());
  coach.addEventListener('change', () => (lastAdvice = ''));

  return {
    start,
    stop() {
      if (!active) return;
      active = false;
      cockpit.hide();
    },
    flip(name, on) {
      sim?.set(name, on);
    },
    update(dt) {
      if (!active) return;
      sim.step(dt);
      const s = sim.s;
      const cranking = s.bleed && s.starter;
      state.n1 = s.n1;
      state.n2 = s.n2;
      state.egt = s.egt;
      state.ff = s.ff;
      state.vib = 0.1 + 0.4 * (s.n2 / 100);
      state.flame = s.lit ? 0.35 + 0.65 * Math.min(1, s.n2 / 60) : 0;
      state.torch = s.torch;
      state.shake = 0.6 * s.torch;

      const advice = sim.advice;
      cockpit.setSwitches(s, coach.checked && s.state === 'running' ? NEXT_SWITCH[advice] ?? null : null);
      cockpit.setGauges({
        n1: s.n1, n2: s.n2, egt: s.egt, ff: s.ff, vib: state.vib, egtLimit: START.egtLimit,
        status: s.state === 'done' ? 'RUNNING' : cranking && !s.lit ? 'CRANKING' : s.lit ? 'LIGHT-OFF' : '',
        warn: s.egt > START.egtLimit ? [['EGT OVER START LIMIT']] : s.state === 'failed' ? [['START ABORTED', 'amber']] : [],
      });
      time.textContent = `${s.t.toFixed(0)} s`;

      const key = `${advice}|${coach.checked}`;
      if (key === lastAdvice) return;
      lastAdvice = key;
      if (s.state === 'done') {
        msg.textContent = 'Engine running.';
        setFeedback(
          feedback,
          `Stable at idle in ${Math.round(s.t)} seconds. The exhaust temperature peaked at ${Math.round(s.peakEgt / 5) * 5} °C; the start limit is ${START.egtLimit}.`,
          'good'
        );
        if (!reported) {
          reported = true;
          onResult?.({ game: 'start', key: coach.checked ? 'coached' : 'solo', time: Math.round(s.t), peak: Math.round(s.peakEgt) });
        }
      } else if (s.state === 'failed') {
        msg.textContent = FAILS[s.fail].title;
        setFeedback(feedback, FAILS[s.fail].text, 'bad');
      } else if (coach.checked) {
        msg.textContent = COACH[advice][0];
        setFeedback(feedback, COACH[advice][1]);
      } else {
        msg.textContent = 'Start the engine.';
        setFeedback(feedback, 'No coach this time. Four switches; the gauges tell you when.');
      }
    },
  };
}

const ROUNDS = 5;

/** Find the fault: the engine misbehaves on a loop; click the part that is to blame. */
export function createFaultGame({ out, cockpit, onResult }) {
  const ask = $('fault-ask');
  const feedback = $('fault-feedback');
  const count = $('fault-count');
  const scoreEl = $('fault-score');
  const next = $('fault-next');
  const state = blankSim();
  let order = [];
  let i = 0;
  let score = 0;
  let t = 0;
  let cur = null;
  let answered = false;
  let finished = false;
  let active = false;

  function load() {
    cur = order[i];
    t = 0;
    answered = false;
    out.focus = null;
    count.textContent = `Fault ${i + 1} of ${order.length}`;
    scoreEl.textContent = `Found ${score}`;
    ask.textContent = cur.clue;
    setFeedback(feedback, 'Watch the engine and the display, then click the part at fault.');
    next.disabled = true;
    next.textContent = i === order.length - 1 ? 'Finish' : 'Next';
  }

  function start() {
    order = shuffle(FAULTS).slice(0, ROUNDS);
    i = 0;
    score = 0;
    finished = false;
    active = true;
    out.sim = state;
    cockpit.show('watch');
    load();
  }

  next.addEventListener('click', () => {
    if (!active) return;
    if (finished) {
      start();
      return;
    }
    if (i < order.length - 1) {
      i++;
      load();
      return;
    }
    finished = true;
    cur = null;
    out.focus = null;
    count.textContent = 'Finished';
    ask.textContent = `You found ${score} of ${order.length} faults.`;
    setFeedback(
      feedback,
      score === order.length ? 'Every one. You read an engine like a flight engineer.' : 'Each of these has happened in service, and each time the crew landed safely on the engines that were left.',
      score === order.length ? 'good' : ''
    );
    next.textContent = 'Play again';
    onResult?.({ game: 'fault', key: 'faults', score, total: order.length });
  });

  return {
    start,
    stop() {
      if (!active) return;
      active = false;
      cockpit.hide();
    },
    answer(id) {
      if (!active || answered || finished || !cur) return;
      answered = true;
      next.disabled = false;
      out.focus = cur.answer;
      const right = id === cur.answer || cur.also?.includes(id);
      if (right) score++;
      scoreEl.textContent = `Found ${score}`;
      ask.textContent = cur.title;
      const lead = right ? 'Yes. ' : `Not the ${lc(PART_BY_ID[id].name)}: it is the ${lc(PART_BY_ID[cur.answer].name)}, now lit up. `;
      setFeedback(feedback, lead + cur.explain, right ? 'good' : 'bad');
    },
    update(dt) {
      if (!active) return;
      if (!cur) {
        // between games: a healthy engine
        Object.assign(state, FAULTS[0].at(0));
        cockpit.setGauges({ ...state, warn: [] });
        return;
      }
      // the symptoms play, hold for a moment, and start again
      t += dt;
      const loop = cur.length + 1.6;
      Object.assign(state, cur.at(Math.min(t % loop, cur.length)));
      state.torch = 0;
      cockpit.setGauges({ n1: state.n1, n2: state.n2, egt: state.egt, ff: state.ff, vib: state.vib, warn: state.warn });
    },
  };
}
