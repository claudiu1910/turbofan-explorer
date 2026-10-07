const $ = (id) => document.getElementById(id);

/**
 * Playback state + the bottom transport bar.
 * `playback` is the single source of truth the render loop reads.
 * The bar is laid out for one film at a time (`setFilm`): its length, markers and ticks.
 */
export function createTransport({ film, onFollowChange, onSeek, onPlayChange, isActive = () => true } = {}) {
  const playback = { t: 0, playing: true, speed: 1, follow: true };
  let duration = film.duration;

  const scrub = $('scrub');
  const fill = scrub.querySelector('.fill');
  const knob = scrub.querySelector('.knob');
  const ticksEl = scrub.querySelector('.ticks');
  const marksEl = scrub.querySelector('.marks');
  const playBtn = $('btn-play');
  const readout = $('time-readout');
  const followBtn = $('btn-follow');

  const pct = (t) => `${(t / duration) * 100}%`;

  function setFilm(f) {
    duration = f.duration;
    ticksEl.replaceChildren();
    marksEl.replaceChildren();
    f.ticks.forEach((t) => {
      const i = document.createElement('i');
      i.style.left = pct(t);
      ticksEl.appendChild(i);
    });
    f.markers.forEach((m) => {
      const s = document.createElement('span');
      s.textContent = m.label;
      s.style.left = m.t === 0 ? '12px' : pct(m.t);
      marksEl.appendChild(s);
      const i = document.createElement('i');
      i.style.left = pct(m.t);
      i.style.height = '9px';
      i.style.top = '15px';
      i.style.background = 'rgba(255,255,255,0.6)';
      ticksEl.appendChild(i);
    });
  }
  setFilm(film);

  function setPlaying(p) {
    playback.playing = p;
    playBtn.querySelector('.txt').textContent = p ? 'Pause' : playback.t >= duration ? 'Replay' : 'Play';
    playBtn.querySelector('.ico').textContent = p ? '❚❚' : '▶';
    onPlayChange?.(p);
  }

  playBtn.addEventListener('click', () => {
    if (!playback.playing && playback.t >= duration - 0.01) playback.t = 0;
    setPlaying(!playback.playing);
  });
  $('btn-stop').addEventListener('click', () => {
    playback.t = 0;
    setPlaying(false);
    onSeek?.();
  });

  function setFollow(v) {
    playback.follow = v;
    followBtn.classList.toggle('active', v);
    onFollowChange?.(v);
  }
  followBtn.addEventListener('click', () => setFollow(!playback.follow));

  document.querySelectorAll('#speed button').forEach((b) =>
    b.addEventListener('click', () => {
      playback.speed = parseFloat(b.dataset.speed);
      document.querySelectorAll('#speed button').forEach((x) => x.classList.toggle('on', x === b));
    })
  );

  // scrubbing
  let dragging = false;
  let wasPlaying = false;
  const seekTo = (e) => {
    const r = scrub.getBoundingClientRect();
    const u = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    playback.t = u * duration;
    onSeek?.();
  };
  scrub.addEventListener('pointerdown', (e) => {
    dragging = true;
    wasPlaying = playback.playing;
    scrub.setPointerCapture(e.pointerId);
    seekTo(e);
    setPlaying(false);
    if (!playback.follow) setFollow(true);
  });
  scrub.addEventListener('pointermove', (e) => dragging && seekTo(e));
  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (wasPlaying && playback.t < duration) setPlaying(true);
  };
  scrub.addEventListener('pointerup', end);
  scrub.addEventListener('pointercancel', end);

  window.addEventListener('keydown', (e) => {
    // the film's shortcuts only apply while it is on screen
    if (!isActive() || e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
    if (e.code === 'Space') { e.preventDefault(); playBtn.click(); }
    if (e.code === 'ArrowRight') { playback.t = Math.min(duration, playback.t + 2); onSeek?.(); }
    if (e.code === 'ArrowLeft') { playback.t = Math.max(0, playback.t - 2); onSeek?.(); }
    if (e.key === 'f') followBtn.click();
  });

  return {
    playback,
    setPlaying,
    setFollow,
    setFilm,
    get duration() {
      return duration;
    },
    render() {
      const t = playback.t;
      fill.style.width = pct(t);
      knob.style.left = pct(t);
      readout.textContent = `${t.toFixed(1)} / ${duration} s`;
    },
  };
}

export function createEngineControls({ onSpin, onFlow, onLabels, onAircraft, onBloom, onGraph, onFigure, onResetView }) {
  const box = $('engine-controls');
  const toggle = $('controls-toggle');
  toggle.addEventListener('click', () => {
    const collapsed = box.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.querySelector('.plus').textContent = collapsed ? '+' : '–';
  });
  $('ctl-spin').addEventListener('input', (e) => onSpin(parseFloat(e.target.value)));
  $('ctl-flow').addEventListener('input', (e) => onFlow(parseFloat(e.target.value)));
  $('ctl-labels').addEventListener('change', (e) => onLabels(e.target.checked));
  $('ctl-aircraft').addEventListener('change', (e) => onAircraft(e.target.checked));
  $('ctl-bloom').addEventListener('change', (e) => onBloom(e.target.checked));
  $('ctl-graph').addEventListener('change', (e) => onGraph(e.target.checked));
  $('ctl-figure').addEventListener('change', (e) => onFigure(e.target.checked));
  $('reset-view').addEventListener('click', onResetView);
  return {
    setGraph(v) { $('ctl-graph').checked = v; },
    setFigure(v) { $('ctl-figure').checked = v; },
  };
}

export function createHud() {
  const caption = $('caption');
  const phaseEls = [...document.querySelectorAll('#phases span')];
  let lastText = '';
  let lastPhase = null;
  const setPhase = (id) => {
    if (id === lastPhase) return;
    phaseEls.forEach((el) => el.classList.toggle('on', el.dataset.phase === id));
    lastPhase = id;
  };
  return {
    /** Light one word of the cycle pill (or none). */
    setPhase,
    update(s) {
      const text = s.caption ? s.caption.text : '';
      if (text && text !== lastText) {
        caption.textContent = text;
        lastText = text;
      }
      caption.classList.toggle('hide', !text || s.captionFade < 0.05);
      if (s.captionFade > 0 && text) caption.style.opacity = String(Math.min(1, s.captionFade));
      else caption.style.opacity = '';
      setPhase(s.activePhase);
    },
  };
}
