import { STATIONS, X_END, PEAK, AMBIENT, profile, profileAt } from '../model.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

const BANDS = {
  core: STATIONS.slice(1).map((s, i) => ({ id: s.id, from: STATIONS[i].x, to: s.x, name: s.short })),
  bypass: [
    { id: 'fan', from: 0, to: 1.2, name: 'Fan' },
    { id: 'bypass', from: 1.2, to: 6.0, name: 'Bypass duct' },
    { id: 'nozzle', from: 6.0, to: X_END, name: 'Nozzle' },
  ],
};
const SHORT = { 'LP comp.': 'LPC', 'HP comp.': 'HPC', Combustor: 'Burn', 'HP turb.': 'HPT', 'LP turb.': 'LPT', Nozzle: 'Out' };

/**
 * The textbook figure: pressure, temperature and gas speed along the engine,
 * each drawn against its own take-off peak so the three shapes can share one box.
 */
export function createGraph() {
  const host = document.getElementById('graph');
  host.innerHTML = `
    <div class="head">
      <span class="eyebrow" data-title>Along the core</span>
      <div class="legend">
        <span class="p">Pressure <b></b></span>
        <span class="t">Temp. <b></b></span>
        <span class="v">Speed <b></b></span>
      </div>
    </div>`;
  const svg = el('svg', { role: 'img' });
  host.appendChild(svg);
  const title = host.querySelector('[data-title]');
  const out = { p: host.querySelector('.p b'), t: host.querySelector('.t b'), v: host.querySelector('.v b') };

  const H = 104;
  const top = 6;
  const base = 78;
  let W = 0;
  let path = null;
  let bandEls = [];
  let curves = null;
  let marker = null;
  let lastKey = '';

  const X = (x) => 4 + (Math.min(x, X_END) / X_END) * (W - 8);
  const Y = (f) => base - Math.min(1.02, Math.max(0, f)) * (base - top);

  function build(nextPath) {
    path = nextPath;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const narrow = W < 430;
    bandEls = BANDS[path].map((b, i) => {
      const r = el('rect', { class: 'band', x: X(b.from) + 1, y: top, width: Math.max(1, X(b.to) - X(b.from) - 2), height: base - top, rx: 3 });
      r.dataset.id = b.id;
      svg.appendChild(r);
      const text = el('text', { x: (X(b.from) + X(b.to)) / 2, y: base + 14, 'text-anchor': 'middle' });
      text.textContent = narrow ? SHORT[b.name] ?? b.name : b.name;
      svg.appendChild(text);
      return r;
    });
    svg.appendChild(el('line', { class: 'axis', x1: 4, x2: W - 4, y1: base, y2: base }));
    curves = {
      p: svg.appendChild(el('path', { class: 'curve p', stroke: 'currentColor' })),
      t: svg.appendChild(el('path', { class: 'curve t', stroke: 'currentColor' })),
      v: svg.appendChild(el('path', { class: 'curve v', stroke: 'currentColor' })),
    };
    marker = svg.appendChild(el('line', { class: 'marker', y1: top - 2, y2: base, visibility: 'hidden' }));
    title.textContent = path === 'bypass' ? 'Around the core' : 'Along the core';
    lastKey = '';
  }

  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  return {
    get visible() {
      return !host.hidden;
    },
    setVisible(v) {
      host.hidden = !v;
    },
    /**
     * @param {object} e        engineAt(...) result
     * @param {'core'|'bypass'} nextPath
     * @param {number|null} markerX   engine-local x of the ride, or null
     * @param {string|null} bandId    station to light up
     */
    update(e, nextPath, markerX, bandId) {
      if (host.hidden) return;
      const w = Math.round(host.clientWidth - 24);
      if (w < 120) return;
      if (w !== W || nextPath !== path) {
        W = w;
        build(nextPath);
      }
      const key = `${e.throttle.toFixed(3)}|${e.opr.toFixed(1)}|${markerX == null ? '' : markerX.toFixed(2)}|${bandId ?? ''}`;
      if (key === lastKey) return;
      lastKey = key;

      const pts = profile(e, path).filter((p) => p.x <= X_END);
      for (const q of ['p', 't', 'v']) {
        // 0 = outside air, 1 = this path's take-off peak
        const lo = AMBIENT[q];
        const hi = PEAK[path][q];
        curves[q].setAttribute('d', pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y((p[q] - lo) / (hi - lo)).toFixed(1)}`).join(' '));
      }
      for (const b of bandEls) b.classList.toggle('on', b.dataset.id === bandId);

      if (markerX != null && markerX >= 0 && markerX <= X_END) {
        marker.setAttribute('x1', X(markerX));
        marker.setAttribute('x2', X(markerX));
        marker.setAttribute('visibility', 'visible');
        const at = profileAt(markerX, e, path);
        out.p.textContent = `${at.p.toFixed(at.p < 10 ? 1 : 0)} ×`;
        out.t.textContent = `${fmt(at.t)} °C`;
        out.v.textContent = `${fmt(at.v)} m/s`;
      } else {
        marker.setAttribute('visibility', 'hidden');
        // no marker: show the peaks
        out.p.textContent = `${Math.round(Math.max(...pts.map((p) => p.p)))} ×`;
        out.t.textContent = `${fmt(Math.max(...pts.map((p) => p.t)))} °C`;
        out.v.textContent = `${fmt(Math.max(...pts.map((p) => p.v)))} m/s`;
      }
    },
  };
}
