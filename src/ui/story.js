import { CUT } from '../config.js';
import { portraitFit, stepBack } from '../timeline.js';
import { engineAt } from '../model.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => x * x * (3 - 2 * x);

/**
 * The scroll-driven story: the same films as Watch, but the reader's scroll position is the clock.
 *
 * Each `.step` section covers a slice of a film (`data-film`, `data-from`, `data-to`); its height
 * is the scroll distance that slice gets. An `.interlude` between two films hides the cut.
 * A few steps carry a "try it" slider that takes one value (the cut, the throttle, the exploded
 * view) away from the scroll for as long as the reader stays on that step.
 */
export function createStory({ films, onGo }) {
  const root = document.getElementById('story');
  const bar = document.querySelector('#progress i');
  const outro = root.querySelector('.outro');
  const making = root.querySelector('.making');
  const stops = [...root.querySelectorAll('.step, .interlude')].map((el) => ({
    el,
    interlude: el.classList.contains('interlude'),
    film: films[el.dataset.film || 'engine'],
    from: parseFloat(el.dataset.from),
    to: parseFloat(el.dataset.to),
  }));
  const steps = stops.filter((s) => !s.interlude);

  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => onGo(b.dataset.go)));
  root.querySelectorAll('[data-scroll]').forEach((b) =>
    b.addEventListener('click', () => {
      const el = root.querySelector(b.dataset.scroll);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'smooth' });
    })
  );

  // ───────── "try it" sliders ─────────
  // value: what the reader chose (null = follow the scroll); k: how much of it is applied (eased)
  const tries = {};
  root.querySelectorAll('[data-try]').forEach((input) => {
    const t = { input, step: steps.find((s) => s.el.contains(input)), value: null, k: 0, shown: -1 };
    tries[input.dataset.try] = t;
    input.addEventListener('input', () => {
      t.value = input.value / 100;
    });
  });
  const throttleOut = document.getElementById('try-throttle-out');

  let active = false;
  let savedScroll = 0;
  let film = steps[0].film;
  let tNow = steps[0].from;
  let current = null; // the step under the middle of the screen
  let finished = false;
  let outroTop = Infinity;
  let covered = false; // the "how it was made" page has scrolled over the whole picture
  let atEnd = false;

  /** Where the scroll position puts us: which film, what time in it, which step. */
  function scrollPoint() {
    const mid = window.scrollY + window.innerHeight * 0.5;
    let f = steps[0].film;
    let t = steps[0].from;
    let step = null;
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const r = s.el.getBoundingClientRect(); // page position, whatever the offset parent is
      const top = r.top + window.scrollY;
      if (mid <= top) break;
      const u = clamp01((mid - top) / r.height);
      if (s.interlude) {
        // the panel is opaque around its middle: that is where the film changes
        const next = stops[i + 1];
        if (u >= 0.5 && next) {
          f = next.film;
          t = next.from;
        }
      } else {
        f = s.film;
        t = lerp(s.from, s.to, u);
        step = u < 1 ? s : null;
      }
    }
    return { film: f, t, step };
  }

  function follow(input, t, auto) {
    // when the reader is not holding it, the slider shows what the scroll is doing
    if (t.value != null || t.k > 0.02) return;
    const v = Math.round(auto * 100);
    if (v !== t.shown) {
      t.shown = v;
      input.value = String(v);
    }
  }

  return {
    get active() {
      return active;
    },
    enter() {
      active = true;
      document.documentElement.classList.add('story');
      window.scrollTo({ top: savedScroll, behavior: 'instant' });
      const p = scrollPoint();
      film = p.film;
      tNow = p.t;
    },
    exit() {
      active = false;
      savedScroll = window.scrollY;
      atEnd = false;
      document.body.classList.remove('story-end');
      document.documentElement.classList.remove('story');
      window.scrollTo({ top: 0, behavior: 'instant' });
    },
    /** Scroll back to a section of the page (and remember it, if the story is not showing). */
    scrollTo(selector) {
      const el = root.querySelector(selector);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      if (active) window.scrollTo({ top, behavior: 'smooth' });
      else savedScroll = top;
    },

    /** Advance one frame. Returns the film and the time in it that the scene should show. */
    update(dt) {
      const p = scrollPoint();
      if (p.film !== film) {
        film = p.film;
        tNow = p.t; // behind the interlude panel: no need to glide
      } else {
        // ease towards the scroll position so wheel steps do not judder the camera
        tNow += (p.t - tNow) * (1 - Math.exp(-dt * 7));
        if (Math.abs(p.t - tNow) < 0.002) tNow = p.t;
      }
      if (p.step !== current) {
        current = p.step;
        for (const s of steps) s.el.classList.toggle('on', s === current);
        // leaving a step hands its slider back to the scroll
        for (const t of Object.values(tries)) if (t.step !== current) t.value = null;
      }
      for (const t of Object.values(tries)) t.k += ((t.value == null ? 0 : 1) - t.k) * (1 - Math.exp(-dt * 6));

      outroTop = outro.getBoundingClientRect().top;
      covered = !!making && making.getBoundingClientRect().top <= 0;
      // once the closing panel is up, the read-outs at the top have nothing left to describe
      const ended = outroTop < window.innerHeight * 0.55;
      if (ended !== atEnd) {
        atEnd = ended;
        document.body.classList.toggle('story-end', ended);
      }
      const span = outroTop + window.scrollY - window.innerHeight * 0.5;
      bar.style.width = `${(clamp01(window.scrollY / Math.max(1, span)) * 100).toFixed(2)}%`;
      if (!finished && outroTop < window.innerHeight * 0.6) finished = true;
      return { film, t: tNow };
    },

    /** Lay the reader's "try it" choices over what the film set. Call after film.fill(). */
    applyTries(view, s) {
      if (film.id !== 'engine') return null;
      let engine = null;
      const { cut, throttle, explode } = tries;
      if (cut) {
        follow(cut.input, cut, s.cutProgress);
        if (cut.k > 0.001) view.cutConst = lerp(view.cutConst, lerp(CUT.open, CUT.closed, cut.value ?? cut.input.value / 100), cut.k);
      }
      if (explode) {
        follow(explode.input, explode, s.explode);
        if (explode.k > 0.001) view.explode = lerp(view.explode, explode.value ?? explode.input.value / 100, explode.k);
      }
      if (throttle) {
        follow(throttle.input, throttle, s.run);
        const th = lerp(s.run, throttle.value ?? throttle.input.value / 100, throttle.k);
        const e = engineAt(th);
        if (throttle.k > 0.001) {
          view.lpRate = 0.3 + 0.9 * e.n1f;
          view.hpRate = 0.3 + 0.9 * e.n2f;
          view.flowSpeed = 0.45 + 0.75 * th;
          view.flow *= lerp(1, (0.45 + 0.55 * th) / (0.45 + 0.55 * s.run), throttle.k);
          view.hot = lerp(view.hot, 0.3 + 0.7 * th, throttle.k);
          engine = e;
        }
        if (current === throttle.step) {
          const text = `Fan ${Math.round(e.n1)} % · ${(Math.round(e.fanRpm / 50) * 50).toLocaleString('en-US')} rpm`;
          if (throttleOut.textContent !== text) throttleOut.textContent = text;
        }
      }
      return engine;
    },

    /** The film camera, stepped back where the layout needs it. */
    camera(out, aspect) {
      film.camera(tNow, out);
      const wide = window.innerWidth > 760;
      if (wide && film.id === 'engine') {
        // the pulled-apart engine is wide: step back so it still fits beside the copy
        const u = clamp01((tNow - 22.8) / 2.4);
        stepBack(out.pos, out.target, 1 + 0.3 * smooth(u));
      }
      stepBack(out.pos, out.target, portraitFit(aspect));
      return out;
    },

    /** Labels stay off over the title screen and once the closing panel has come up. */
    get labelsOn() {
      return window.innerWidth > 760 && window.scrollY > window.innerHeight * 0.55 && outroTop > window.innerHeight * 0.8;
    },
    get safe() {
      return window.innerWidth > 760 ? { left: Math.min(470, window.innerWidth * 0.36), right: 10, top: 100, bottom: 30 } : null;
    },
    /** Px to slide the picture: right on a wide screen (the copy is on the left), up on a phone. */
    get shift() {
      const wide = window.innerWidth > 760;
      return { x: wide ? Math.min(230, window.innerWidth * 0.16) : 0, y: wide ? 0 : -window.innerHeight * 0.1 };
    },
    get finished() {
      return finished;
    },
    /** True while a solid page covers the scene: nothing needs drawing. */
    get covered() {
      return covered;
    },
    get film() {
      return film;
    },
    get t() {
      return tNow;
    },
  };
}
