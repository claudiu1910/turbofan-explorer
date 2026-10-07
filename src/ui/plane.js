import * as THREE from 'three';
import { AIRCRAFT_PART_BY_ID, HOTSPOTS } from '../data/aircraft.js';

const $ = (id) => document.getElementById(id);

const flapName = (v) => (v < 0.04 ? 'Up' : v < 0.4 ? 'Take-off' : v < 0.8 ? 'Approach' : 'Landing');

/**
 * The Aircraft mode's panel and the markers on the whole-aircraft view.
 * It edits `state` in place and calls `onChange(what)` so the page can react.
 *
 *   state.view      'overview' | 'wing' | 'cabin' | 'cockpit'
 *   state.air/hyd/elec   which system lines are drawn
 *   state.gear, flaps (0..1), ground, spoilers, reverse   the wing-and-wheels view
 *   state.cut (0..1), flow   the cabin view
 */
export function createPlane({ state, aircraft, camera, onChange, onCard, onGo, onLand }) {
  const panel = $('aircraft-panel');
  const viewBtns = [...panel.querySelectorAll('#ac-view button')];
  const sections = [...panel.querySelectorAll('section[data-for]')];
  const el = {
    air: $('ac-air'), hyd: $('ac-hyd'), elec: $('ac-elec'),
    gear: $('ac-gear'), flaps: $('ac-flaps'), flapsOut: $('ac-flaps-out'), ground: $('ac-ground'),
    spoilers: $('ac-spoilers'), reverse: $('ac-reverse'), cut: $('ac-cut'), flow: $('ac-flow'),
  };

  // little "i" buttons that open a details card
  panel.querySelectorAll('.chips').forEach((row) => {
    for (const id of row.dataset.cards.split(',')) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = AIRCRAFT_PART_BY_ID[id].name;
      b.addEventListener('click', () => onCard(id));
      row.appendChild(b);
    }
  });

  function sync() {
    viewBtns.forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
    sections.forEach((s) => (s.hidden = s.dataset.for !== state.view));
    el.air.checked = state.air;
    el.hyd.checked = state.hyd;
    el.elec.checked = state.elec;
    el.gear.checked = state.gear;
    el.gear.disabled = state.ground; // it is standing on them
    el.flaps.value = String(Math.round(state.flaps * 100));
    el.flapsOut.textContent = flapName(state.flaps);
    el.ground.checked = state.ground;
    el.spoilers.checked = state.spoilers;
    el.reverse.checked = state.reverse;
    el.reverse.disabled = !state.ground; // reversers only unlock with the wheels on the ground
    if (!state.ground) state.reverse = el.reverse.checked = false;
    el.cut.value = String(Math.round(state.cut * 100));
    el.flow.checked = state.flow;
  }

  viewBtns.forEach((b) =>
    b.addEventListener('click', () => {
      if (state.view === b.dataset.view) return;
      state.view = b.dataset.view;
      sync();
      onChange('view');
    })
  );
  const bind = (input, key, what = key) =>
    input.addEventListener('change', () => {
      state[key] = input.checked;
      if (key === 'ground' && state.ground) state.gear = true;
      sync();
      onChange(what);
    });
  bind(el.air, 'air', 'systems');
  bind(el.hyd, 'hyd', 'systems');
  bind(el.elec, 'elec', 'systems');
  bind(el.gear, 'gear');
  bind(el.ground, 'ground');
  bind(el.spoilers, 'spoilers');
  bind(el.reverse, 'reverse');
  bind(el.flow, 'flow');
  el.flaps.addEventListener('input', () => {
    state.flaps = el.flaps.value / 100;
    el.flapsOut.textContent = flapName(state.flaps);
    onChange('flaps');
  });
  el.cut.addEventListener('input', () => {
    state.cut = el.cut.value / 100;
    onChange('cut');
  });
  $('ac-land').addEventListener('click', onLand);

  // ── markers on the whole aircraft ──
  const host = $('hotspots');
  const world = new THREE.Vector3();
  const spots = HOTSPOTS.map((h) => {
    const b = document.createElement('button');
    b.className = 'hotspot';
    b.textContent = h.label;
    b.hidden = true;
    b.addEventListener('click', () => {
      if (h.go) onGo(h.go);
      else {
        state.view = h.view;
        sync();
        onChange('view');
      }
    });
    host.appendChild(b);
    return { ...h, el: b, anchor: aircraft.anchor(h.at), shown: false };
  });

  sync();
  return {
    sync,
    /** Place the markers over their anchors. `on`: whether they should be showing at all. */
    updateHotspots(on) {
      for (const s of spots) {
        let show = on;
        if (show) {
          s.anchor.getWorldPosition(world).project(camera);
          show = world.z > -1 && world.z < 1 && Math.abs(world.x) < 0.96 && Math.abs(world.y) < 0.94;
        }
        if (show !== s.shown) {
          s.shown = show;
          s.el.hidden = !show;
        }
        if (!show) continue;
        const x = (world.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-world.y * 0.5 + 0.5) * window.innerHeight;
        // the pill hangs to the right of its dot, unless that would run it off the screen
        s.w ||= s.el.offsetWidth;
        const flip = x + s.w - 14 > window.innerWidth - 6;
        if (flip !== s.flip) {
          s.flip = flip;
          s.el.classList.toggle('flip', flip);
        }
        s.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${flip ? 'calc(-100% + 14px)' : '-14px'}, -50%)`;
      }
    },
  };
}
