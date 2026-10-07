import * as THREE from 'three';
import { LABELS, DURATION } from '../config.js';

const NS = 'http://www.w3.org/2000/svg';
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);

/**
 * Labels that ride on 3D anchor points: a dot on the part, a box nearby, a leader between them.
 * `update(camera, v, dt)` reads from the view state `v`:
 *   v.labelsOn  master switch
 *   v.labelSet  which family is on screen: 'engine' (default) or 'aircraft'
 *   v.labelT    tour time, used for each label's `show` window; null = show every label
 *   v.inside    false while the core is closed up: labels marked `inner` stay hidden
 *   v.safe      { left, right, top, bottom } px kept clear for panels
 *   plus whatever the labels' own `sub` / `when` functions read (hpcT, jet, reverse, …)
 */
export function createLabels(engine, aircraft) {
  const host = document.getElementById('labels');
  const svg = document.getElementById('leaders');
  const items = LABELS.map((def) => {
    const el = document.createElement('div');
    el.className = `label ${def.kind ?? ''} ${def.cls ?? ''}`.trim();
    if (!def.sub) el.classList.add('title-only');
    host.appendChild(el);

    const line = document.createElementNS(NS, 'line');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r', '2.6');
    svg.append(line, dot);

    const anchor = def.part === 'aircraft' ? aircraft.anchor(def.at) : engine.anchor(def.part, def.at);
    return { def, el, line, dot, anchor, set: def.set ?? 'engine', html: '', w: 0, h: 0, init: false, alpha: 0, shown: null };
  });

  const world = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const setShown = (it, on) => {
    if (it.shown === on) return;
    it.shown = on;
    const vis = on ? 'visible' : 'hidden';
    it.el.style.visibility = vis;
    it.line.style.visibility = vis;
    it.dot.style.visibility = vis;
  };

  function update(camera, v, dt) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const safe = v.safe ?? {};
    const left = safe.left ?? 10;
    const right = W - (safe.right ?? 10);
    const top = safe.top ?? 96; // clear of both rows of buttons
    const bottom = H - (safe.bottom ?? 175);
    const t = v.labelT;
    const phone = W <= 760;
    const visible = [];

    for (const it of items) {
      let a = 0;
      // on a phone there is only room for the part names, not for side notes
      const wanted = v.labelsOn !== false && it.set === (v.labelSet ?? 'engine') && !(phone && it.def.kind === 'note');
      if (wanted && !(it.def.inner && v.inside === false) && (!it.def.when || it.def.when(v))) {
        if (t == null) a = 1;
        else {
          const [from, to] = it.def.show;
          const fadeIn = clamp01((t - from) / 0.6);
          const fadeOut = to >= DURATION ? 1 : clamp01((to - t) / 0.3); // labels that run to the end stay up
          a = smooth(Math.min(fadeIn, fadeOut));
        }
      }

      it.anchor.getWorldPosition(world);
      ndc.copy(world).project(camera);
      const behind = ndc.z > 1 || ndc.z < -1;
      const sx = (ndc.x * 0.5 + 0.5) * W;
      const sy = (-ndc.y * 0.5 + 0.5) * H;
      if (behind || sx < left - 60 || sx > right + 60 || sy < -40 || sy > H + 40) a = 0;

      it.alpha += (a - it.alpha) * Math.min(1, dt * 10);
      if (it.alpha <= 0.02) {
        setShown(it, false);
        continue;
      }
      setShown(it, true);
      const o = it.alpha.toFixed(3);
      it.el.style.opacity = o;
      it.line.style.opacity = o;
      it.dot.style.opacity = o;

      // text (only touch the DOM when it changes)
      const title = typeof it.def.title === 'function' ? it.def.title(v) : it.def.title;
      const html = it.def.sub ? `<b>${title}</b><small>${it.def.sub(v)}</small>` : `<b>${title}</b>`;
      if (html !== it.html) {
        it.el.innerHTML = html;
        it.html = html;
        it.w = it.el.offsetWidth;
        it.h = it.el.offsetHeight;
      } else if (!it.w) {
        it.w = it.el.offsetWidth;
        it.h = it.el.offsetHeight;
      }

      it.sx = sx;
      it.sy = sy;
      visible.push(it);
    }

    // desired box rects (top-left), then relaxation passes that separate overlaps while keeping
    // every box on screen (a box pinned against an edge makes its neighbour do the moving)
    const reach = phone ? 0.6 : 1; // keep boxes nearer their dots where there is little room
    const keepIn = (it) => {
      it.tx = Math.min(right - it.w, Math.max(left, it.tx));
      it.ty = Math.min(bottom - it.h, Math.max(top, it.ty));
    };
    for (const it of visible) {
      const [dx, dy] = it.def.off;
      const bx = it.sx + dx * reach - it.w / 2;
      const by = it.sy + dy * reach - it.h / 2;
      if (!it.init) {
        it.bx = bx;
        it.by = by;
        it.init = true;
      }
      it.tx = bx;
      it.ty = by;
      keepIn(it);
    }
    const pad = 6;
    for (let pass = 0; pass < 14; pass++) {
      let touching = false;
      for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
          const a = visible[i];
          const b = visible[j];
          const ox = Math.min(a.tx + a.w, b.tx + b.w) - Math.max(a.tx, b.tx) + pad;
          const oy = Math.min(a.ty + a.h, b.ty + b.h) - Math.max(a.ty, b.ty) + pad;
          if (ox > 0.5 && oy > 0.5) {
            touching = true;
            // push apart along the axis of least penetration
            if (oy < ox) {
              const d = oy / 2;
              if (a.ty + a.h / 2 < b.ty + b.h / 2) { a.ty -= d; b.ty += d; } else { a.ty += d; b.ty -= d; }
            } else {
              const d = ox / 2;
              if (a.tx + a.w / 2 < b.tx + b.w / 2) { a.tx -= d; b.tx += d; } else { a.tx += d; b.tx -= d; }
            }
          }
        }
      }
      if (!touching) break;
      for (const it of visible) keepIn(it);
    }

    const k = Math.min(1, dt * 9);
    for (const it of visible) {
      it.bx += (it.tx - it.bx) * k;
      it.by += (it.ty - it.by) * k;
      it.el.style.transform = `translate(${it.bx.toFixed(1)}px, ${it.by.toFixed(1)}px)`;

      // leader: dot → nearest point on the box edge
      const cx = Math.min(it.bx + it.w, Math.max(it.bx, it.sx));
      const cy = Math.min(it.by + it.h, Math.max(it.by, it.sy));
      it.line.setAttribute('x1', it.sx.toFixed(1));
      it.line.setAttribute('y1', it.sy.toFixed(1));
      it.line.setAttribute('x2', cx.toFixed(1));
      it.line.setAttribute('y2', cy.toFixed(1));
      it.dot.setAttribute('cx', it.sx.toFixed(1));
      it.dot.setAttribute('cy', it.sy.toFixed(1));
    }
  }

  return { update };
}
