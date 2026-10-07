import * as THREE from 'three';
import { ENGINE_X } from '../config.js';
import { coreRadius, bypassRadius } from '../scene/flowpath.js';
import { profileAt, stationAt } from '../model.js';

const $ = (id) => document.getElementById(id);

// Where the parcel is along the axis (engine-local x) as the ride progresses 0 → 1.
// It lingers where there is most to see.
const KEYS = {
  core: { time: 17, k: [[0, -2.6], [0.12, 0.9], [0.29, 2.7], [0.5, 4.1], [0.64, 5.0], [0.74, 5.55], [0.87, 6.5], [1, 9.2]] },
  bypass: { time: 11, k: [[0, -2.6], [0.2, 1.0], [0.78, 6.0], [1, 9.2]] },
};
const COLD = new THREE.Color('#78b6ff');
const HOT = new THREE.Color('#ffb35a');

const along = (keys, u) => {
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const [u0, x0] = keys[i - 1];
      const [u1, x1] = keys[i];
      return x0 + ((u - u0) / (u1 - u0)) * (x1 - x0);
    }
  }
  return keys[keys.length - 1][1];
};

/**
 * Follow one parcel of air from intake to exhaust: a tracking shot along the cut face,
 * with a read-out of what the air is going through.
 */
export function createRide({ xp, getEngine, getFit = () => 1, onEnd }) {
  const hud = $('ride-hud');
  const station = $('ride-station');
  const outP = $('ride-p');
  const outT = $('ride-t');
  const outV = $('ride-v');
  const fill = $('ride-fill');

  const pos = new THREE.Vector3(); // engine-local
  const want = new THREE.Vector3();
  const look = new THREE.Vector3();
  const lookNow = new THREE.Vector3();
  const color = new THREE.Color();
  const state = { active: false, path: 'core', u: 0, x: null, hold: 0 };
  let lastText = '';

  function stop(silent = false) {
    if (!state.active) return;
    state.active = false;
    state.x = null;
    xp.tracer.group.visible = false;
    hud.hidden = true;
    document.body.classList.remove('riding');
    if (!silent) onEnd();
  }
  $('ride-exit').addEventListener('click', () => stop());

  return {
    state,
    start(path) {
      state.active = true;
      state.path = path;
      state.u = 0;
      state.hold = 0;
      xp.tracer.reset();
      xp.tracer.group.visible = true;
      hud.hidden = false;
      document.body.classList.add('riding');
      lookNow.set(ENGINE_X - 2.2, 0.8, 0);
      lastText = '';
    },
    stop,
    /** Advances the ride and drives the camera. Call only while active. */
    update(dt, camera) {
      const cfg = KEYS[state.path];
      if (state.u < 1) state.u = Math.min(1, state.u + dt / cfg.time);
      else if ((state.hold += dt) > 1.4) {
        stop();
        return;
      }

      const x = along(cfg.k, state.u);
      const r = state.path === 'core' ? coreRadius(x, 0.5) : bypassRadius(x, 0.5);
      state.x = x;
      // just behind the cut face, in the upper passage
      pos.set(x, r, -0.04);

      const e = getEngine();
      const at = profileAt(Math.max(0, x), e, state.path);
      color.copy(COLD).lerp(HOT, Math.min(1, Math.max(0, (at.t - 40) / 900)));
      xp.tracer.set(pos, color);

      // tracking shot: beside the parcel, a little ahead of it
      const wx = x + ENGINE_X;
      const back = (state.path === 'core' ? 3.0 : 4.4) * getFit();
      want.set(wx - 0.35, r * 0.55 + 0.5, back);
      look.set(wx + 0.3, r * 0.8, 0);
      const k = 1 - Math.exp(-dt * 3.5);
      camera.position.lerp(want, k);
      lookNow.lerp(look, k);
      camera.lookAt(lookNow);

      const st = stationAt(x, state.path);
      const text = `${st.name}|${at.p.toFixed(1)}|${Math.round(at.t / 5)}|${Math.round(at.v / 5)}`;
      if (text !== lastText) {
        lastText = text;
        station.textContent = x < -0.3 ? 'Outside air' : st.name;
        outP.textContent = `${at.p.toFixed(at.p < 10 ? 1 : 0)} ×`;
        outT.textContent = `${(Math.round(at.t / 5) * 5).toLocaleString('en-US')} °C`;
        outV.textContent = `${Math.round(at.v / 5) * 5} m/s`;
      }
      fill.style.width = `${(state.u * 100).toFixed(1)}%`;
    },
    /** Where the ride camera is looking, so the orbit controls can pick up from there. */
    get lookAt() {
      return lookNow;
    },
  };
}
