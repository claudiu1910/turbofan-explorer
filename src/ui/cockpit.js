const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// A dial: a 240° arc that starts lower-left and sweeps over the top to lower-right.
const R = 40;
const C = [54, 50];
const polar = (frac) => {
  const a = ((-210 + 240 * frac) * Math.PI) / 180;
  return [C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)];
};
const arc = (f0, f1) => {
  const [x0, y0] = polar(f0);
  const [x1, y1] = polar(f1);
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${R} ${R} 0 ${f1 - f0 > 0.75 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};

const DIALS = {
  n1: { label: 'N1 %', max: 110, zones: [[100 / 110, 1, 'red']] },
  egt: { label: 'EGT °C', max: 1000, zones: [[0.725, 0.95, 'amber'], [0.95, 1, 'red']] },
};
// thrust lever: the forward range takes most of the travel, reverse a short stretch below idle
const IDLE_AT = 0.72;

/**
 * The flight deck's engine panel: an engine display, four start switches and a thrust lever.
 *
 *   mode 'free'   lever live, no switches (the Aircraft mode's flight deck view)
 *   mode 'start'  switches live, lever parked at idle (the Start the engine game)
 *   mode 'watch'  nothing to press: the display only (Find the fault)
 */
export function createCockpit({ onLever, onSwitch } = {}) {
  const root = $('cockpit');
  const status = $('ck-status');
  const warn = $('ck-warn');
  const switchRow = $('ck-switches');
  const leverBox = $('ck-lever');
  const track = $('ck-track');
  const knob = $('ck-knob');
  const out = { n2: $('ck-n2'), ff: $('ck-ff'), vib: $('ck-vib') };
  const rows = { n2: out.n2.parentElement, ff: out.ff.parentElement, vib: out.vib.parentElement };

  const dials = {};
  root.querySelectorAll('.ck-dial').forEach((el) => {
    const d = DIALS[el.dataset.d];
    el.innerHTML = `
      <svg viewBox="0 0 108 76" aria-hidden="true">
        <path class="arc" d="${arc(0, 1)}" />
        ${d.zones.map(([a, b, c]) => `<path class="zone ${c}" d="${arc(a, b)}" />`).join('')}
        <line class="needle" x1="${C[0]}" y1="${C[1]}" x2="${C[0]}" y2="${C[1] - R + 4}" />
        <circle class="hub" cx="${C[0]}" cy="${C[1]}" r="3.2" />
      </svg>
      <b>–</b><span>${d.label}</span>`;
    dials[el.dataset.d] = { el, d, needle: el.querySelector('.needle'), val: el.querySelector('b'), last: '' };
  });
  const setDial = (key, value, text, over = false) => {
    const g = dials[key];
    const k = `${text}|${over}`;
    if (k === g.last) return;
    g.last = k;
    g.val.textContent = text;
    g.el.classList.toggle('over', over);
    // the needle is drawn pointing straight up, which is the middle of the sweep
    g.needle.setAttribute('transform', `rotate(${(-120 + 240 * clamp(value / g.d.max, 0, 1)).toFixed(1)} ${C[0]} ${C[1]})`);
  };

  // ── switches ──
  const switches = {};
  switchRow.querySelectorAll('.ck-sw').forEach((b) => {
    switches[b.dataset.sw] = b;
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      onSwitch?.(b.dataset.sw, on);
    });
  });

  // ── thrust lever: 1 = take-off, 0 = idle, -1 = full reverse ──
  let lever = 0.5;
  const yOf = (v) => (v >= 0 ? IDLE_AT * (1 - v) : IDLE_AT + (1 - IDLE_AT) * -v);
  const vOf = (y) => (y <= IDLE_AT ? 1 - y / IDLE_AT : -(y - IDLE_AT) / (1 - IDLE_AT));
  function placeLever() {
    knob.style.top = `${(yOf(lever) * 100).toFixed(1)}%`;
    knob.classList.toggle('rev', lever < -0.02);
    track.setAttribute('aria-valuenow', String(Math.round(lever * 100)));
    track.setAttribute('aria-valuetext', lever < -0.02 ? `Reverse ${Math.round(-lever * 100)} %` : lever < 0.03 ? 'Idle' : `${Math.round(lever * 100)} %`);
  }
  function setLever(v, tell = true) {
    v = clamp(v, -1, 1);
    if (Math.abs(v) < 0.045) v = 0; // a detent at idle
    if (v === lever) return;
    lever = v;
    placeLever();
    if (tell) onLever?.(lever);
  }
  let dragging = false;
  const fromEvent = (e) => {
    const r = track.getBoundingClientRect();
    setLever(vOf(clamp((e.clientY - r.top) / r.height, 0, 1)));
  };
  track.addEventListener('pointerdown', (e) => {
    dragging = true;
    track.setPointerCapture(e.pointerId);
    fromEvent(e);
  });
  track.addEventListener('pointermove', (e) => dragging && fromEvent(e));
  const end = () => (dragging = false);
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowUp' ? 0.05 : e.key === 'ArrowDown' ? -0.05 : 0;
    if (!step) return;
    e.preventDefault();
    setLever(lever + step);
  });
  placeLever();

  let lastWarn = '';
  let lastStatus = '';
  return {
    get lever() {
      return lever;
    },
    setLever,
    get visible() {
      return !root.hidden;
    },
    show(mode) {
      root.hidden = false;
      root.dataset.mode = mode;
      switchRow.hidden = mode !== 'start';
      leverBox.classList.toggle('off', mode !== 'free');
    },
    hide() {
      root.hidden = true;
    },
    /** Lift the panel clear of whatever sits under it (px from the bottom of the screen). */
    setBottom(px) {
      root.style.bottom = px == null ? '' : `${px}px`;
    },
    /** Set the four start switches; `next` (optional) is ringed as the one to press. */
    setSwitches(state, next = null) {
      for (const [k, b] of Object.entries(switches)) {
        b.setAttribute('aria-pressed', String(!!state[k]));
        b.classList.toggle('next', k === next);
      }
    },
    /**
     * @param {{n1:number, n2:number, egt:number, ff:number, vib?:number, egtLimit?:number,
     *          status?:string, warn?: Array<[string, string?]>}} g  ff in kg/s
     */
    setGauges(g) {
      setDial('n1', g.n1, g.n1.toFixed(1), g.n1 > 101);
      setDial('egt', g.egt, String(Math.round(g.egt / 5) * 5), g.egt > (g.egtLimit ?? 950));
      const n2 = g.n2.toFixed(1);
      if (out.n2.textContent !== n2) out.n2.textContent = n2;
      const ff = (Math.round((g.ff * 3600) / 20) * 20).toLocaleString('en-US');
      if (out.ff.textContent !== ff) out.ff.textContent = ff;
      const vib = (g.vib ?? 0.3).toFixed(1);
      if (out.vib.textContent !== vib) out.vib.textContent = vib;
      rows.vib.classList.toggle('over', (g.vib ?? 0) > 3);
      const st = g.status ?? '';
      if (st !== lastStatus) {
        lastStatus = st;
        status.textContent = st;
      }
      const w = (g.warn ?? []).map(([t, c]) => `${t}:${c ?? ''}`).join('|');
      if (w !== lastWarn) {
        lastWarn = w;
        warn.replaceChildren(
          ...(g.warn ?? []).map(([t, c]) => {
            const i = document.createElement('i');
            i.textContent = t;
            if (c) i.className = c;
            return i;
          })
        );
      }
    },
  };
}
