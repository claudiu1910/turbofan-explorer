const $ = (id) => document.getElementById(id);

// a 240° dial: starts lower-left, sweeps over the top to lower-right
const ARC = 'M 11.2 42 A 24 24 0 1 1 52.8 42';
const ARC_LEN = 100.5;

import { airAt } from '../model.js';

const throttleName = (v) => (v < 8 ? 'Idle' : v < 45 ? 'Low' : v < 86 ? 'Cruise' : v < 97 ? 'Climb' : 'Take-off');

/**
 * The Explore panel: throttle and gauges, view sliders, engine type, reverser, ride buttons.
 * It edits `state` in place and calls `onChange` so the page can react.
 */
export function createExplorePanel({ state, onChange, onRide }) {
  const throttle = $('ex-throttle');
  const throttleOut = $('ex-throttle-out');
  const cut = $('ex-cut');
  const explode = $('ex-explode');
  const xray = $('ex-xray');
  const reverse = $('ex-reverse');
  const typeBtns = [...document.querySelectorAll('#ex-type button')];
  const rideCore = $('ride-core');
  const rideBypass = $('ride-bypass');
  const burner = $('ex-burner');
  const alt = $('ex-alt');
  const altOut = $('ex-alt-out');
  const airOut = $('ex-air');

  const dials = {};
  document.querySelectorAll('#gauges [data-g]').forEach((el) => {
    const g = { el, val: el.querySelector('.val'), arc: el.querySelector('.value'), name: el.querySelector('span'), last: '' };
    el.querySelectorAll('path').forEach((p) => p.setAttribute('d', ARC));
    dials[el.dataset.g] = g;
  });

  const setDial = (key, frac, text) => {
    const g = dials[key];
    if (g.last === text) return;
    g.last = text;
    g.val.textContent = text;
    if (g.arc) g.arc.setAttribute('stroke-dasharray', `${(Math.min(1, Math.max(0, frac)) * ARC_LEN).toFixed(1)} 300`);
  };

  function sync() {
    const t = Math.round(state.throttle * 100);
    throttle.value = String(t);
    throttleOut.textContent = `${throttleName(t)} · ${t} %`;
    cut.value = String(Math.round(state.cut * 100));
    explode.value = String(Math.round(state.explode * 100));
    xray.checked = state.xray;
    reverse.checked = state.reverse && !state.jet;
    reverse.disabled = state.jet;
    reverse.parentElement.style.opacity = state.jet ? '0.45' : '';
    rideBypass.disabled = state.jet;
    typeBtns.forEach((b) => b.classList.toggle('on', (b.dataset.type === 'jet') === state.jet));
    dials.n1.name.textContent = state.jet ? 'LP speed' : 'Fan speed';
    burner.checked = state.burner;
    alt.value = String(state.altitude);
    const air = airAt(state.altitude);
    altOut.textContent = state.altitude < 0.05 ? 'On the runway' : `${state.altitude.toFixed(state.altitude % 1 ? 1 : 0)} km`;
    airOut.textContent = `Outside: ${air.t < -0.5 ? '−' : ''}${Math.abs(Math.round(air.t))} °C, ${air.p > 0.995 ? 'sea-level pressure' : `${Math.round(air.p * 100)} % of sea-level pressure`}.`;
  }

  throttle.addEventListener('input', () => {
    state.throttle = throttle.value / 100;
    sync();
    onChange('throttle');
  });
  cut.addEventListener('input', () => {
    state.cut = cut.value / 100;
    onChange('cut');
  });
  explode.addEventListener('input', () => {
    state.explode = explode.value / 100;
    onChange('explode');
  });
  xray.addEventListener('change', () => {
    state.xray = xray.checked;
    onChange('xray');
  });
  reverse.addEventListener('change', () => {
    state.reverse = reverse.checked;
    onChange('reverse');
  });
  typeBtns.forEach((b) =>
    b.addEventListener('click', () => {
      const jet = b.dataset.type === 'jet';
      if (jet === state.jet) return;
      state.jet = jet;
      if (jet) state.reverse = false; // a turbojet has no bypass air to reverse
      else state.burner = false; // and no airliner turbofan has an afterburner
      sync();
      onChange('type');
    })
  );
  burner.addEventListener('change', () => {
    state.burner = burner.checked;
    if (state.burner) {
      // afterburners belong to slim, fast jets: switch to the turbojet to light one
      state.jet = true;
      state.reverse = false;
    }
    sync();
    onChange('burner');
  });
  alt.addEventListener('input', () => {
    state.altitude = parseFloat(alt.value);
    sync();
    onChange('altitude');
  });
  rideCore.addEventListener('click', () => onRide('core'));
  rideBypass.addEventListener('click', () => onRide('bypass'));

  sync();

  return {
    sync,
    /** @param {ReturnType<import('../model.js').engineAt>} e  @param {number} reverse 0..1 */
    setGauges(e, reverse) {
      setDial('n1', e.n1f, `${Math.round(e.n1)}%`);
      setDial('n2', e.n2f, `${Math.round(e.n2)}%`);
      setDial('egt', (e.egt - 300) / 700, `${Math.round(e.egt / 10) * 10}°`);
      const rev = reverse > 0.5;
      dials.thrust.el.classList.toggle('rev', rev);
      dials.thrust.name.textContent = rev ? 'Thrust (reversed)' : 'Thrust';
      setDial('thrust', 0, `${Math.round(e.thrust)} kN`);
      setDial('fuel', 0, `${e.fuel.toFixed(1)} kg/s`);
    },
  };
}
