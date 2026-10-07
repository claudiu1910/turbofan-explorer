import { PARTS } from '../data/parts.js';
import { AIRCRAFT_PARTS } from '../data/aircraft.js';

const $ = (id) => document.getElementById(id);
const KEY = 'turbofan-explorer-log-v1';

// The flight log: what this visitor has done so far, kept in their own browser (nothing is sent
// anywhere), and a certificate they can save as a picture.
//
// Three kinds of entry:
//   flag   done or not                          log.mark('story')
//   set    a collection to complete             log.add('parts', 'fan')
//   best   a score or a time worth beating      log.best('quiz-jobs', 5, { of: 6 })
const SECTIONS = [
  {
    title: 'Learn',
    items: [
      { id: 'story', kind: 'flag', label: 'Read the story to the end' },
      { id: 'film-engine', kind: 'flag', label: 'Watched the engine film' },
      { id: 'film-aircraft', kind: 'flag', label: 'Watched the aircraft film' },
    ],
  },
  {
    title: 'Explore',
    items: [
      { id: 'parts', kind: 'set', of: PARTS.length, label: 'Read about every part of the engine' },
      { id: 'ride-core', kind: 'flag', label: 'Rode the air through the core' },
      { id: 'ride-bypass', kind: 'flag', label: 'Rode the air around the core' },
      { id: 'reverser', kind: 'flag', label: 'Opened the thrust reverser' },
      { id: 'turbojet', kind: 'flag', label: 'Tried the engine as a turbojet' },
      { id: 'afterburner', kind: 'flag', label: 'Lit the afterburner' },
      { id: 'altitude', kind: 'flag', label: 'Ran the engine on the runway' },
    ],
  },
  {
    title: 'Play',
    items: [
      { id: 'quiz-jobs', kind: 'best', label: 'Name the part: jobs', unit: 'score' },
      { id: 'quiz-materials', kind: 'best', label: 'Name the part: materials', unit: 'score' },
      { id: 'quiz-numbers', kind: 'best', label: 'Name the part: numbers', unit: 'score' },
      { id: 'build-level1', kind: 'best', label: 'Built the engine, 7 pieces', unit: 'time' },
      { id: 'build-level2', kind: 'best', label: 'Built the engine, 9 pieces', unit: 'time' },
      { id: 'start-coached', kind: 'best', label: 'Started the engine', unit: 'time' },
      { id: 'start-solo', kind: 'best', label: 'Started it without the coach', unit: 'time' },
      { id: 'fault-faults', kind: 'best', label: 'Found the faults', unit: 'score' },
    ],
  },
  {
    title: 'Aircraft',
    items: [
      { id: 'systems', kind: 'set', of: AIRCRAFT_PARTS.length, label: 'Read about every system' },
      { id: 'gear', kind: 'flag', label: 'Lowered the landing gear' },
      { id: 'flaps', kind: 'flag', label: 'Set the flaps for landing' },
      { id: 'runway', kind: 'flag', label: 'Put it down on the runway' },
      { id: 'cabin', kind: 'flag', label: 'Opened up the cabin' },
      { id: 'cockpit', kind: 'flag', label: 'Worked the thrust lever' },
    ],
  },
];
const ITEMS = SECTIONS.flatMap((s) => s.items);
const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { flags: d.flags ?? {}, sets: d.sets ?? {}, bests: d.bests ?? {}, name: d.name ?? '' };
  } catch {
    return { flags: {}, sets: {}, bests: {}, name: '' };
  }
}

/**
 * @param {{ onNew?: (label: string, done: number, total: number) => void, snapshot?: () => HTMLCanvasElement }} opts
 *   onNew: something was logged for the first time. snapshot: a picture of the scene, for the certificate.
 */
export function createLog({ onNew, snapshot } = {}) {
  const data = load();
  let saveTimer = 0;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        /* private windows may refuse: the log then lasts for this visit only */
      }
    }, 200);
  };

  const isDone = (it) =>
    it.kind === 'flag' ? !!data.flags[it.id] : it.kind === 'set' ? (data.sets[it.id]?.length ?? 0) >= it.of : data.bests[it.id] != null;
  const doneCount = () => ITEMS.filter(isDone).length;
  const detail = (it) => {
    if (it.kind === 'set') return `${data.sets[it.id]?.length ?? 0} of ${it.of}`;
    if (it.kind !== 'best') return '';
    const b = data.bests[it.id];
    if (b == null) return '';
    return it.unit === 'time' ? `${b.value} s` : `${b.value} of ${b.of}`;
  };

  function changed(it, wasDone) {
    save();
    syncButton();
    if (!root.hidden) render();
    if (!wasDone && isDone(it)) onNew?.(it.label, doneCount(), ITEMS.length);
  }

  // ───────── the panel ─────────
  const root = $('log');
  const list = $('log-list');
  const bar = $('log-bar');
  const count = $('log-count');
  const name = $('log-name');
  const button = $('btn-log');
  name.value = data.name;
  name.addEventListener('input', () => {
    data.name = name.value.slice(0, 40);
    save();
  });

  function syncButton() {
    button.textContent = `Log ${doneCount()}/${ITEMS.length}`;
  }

  function render() {
    const done = doneCount();
    count.textContent = `${done} of ${ITEMS.length} done`;
    bar.style.width = `${(done / ITEMS.length) * 100}%`;
    list.replaceChildren(
      ...SECTIONS.map((sec) => {
        const box = document.createElement('section');
        const h = document.createElement('h3');
        h.textContent = sec.title;
        box.appendChild(h);
        for (const it of sec.items) {
          const row = document.createElement('div');
          row.className = `log-row${isDone(it) ? ' done' : ''}`;
          const tick = document.createElement('i');
          const label = document.createElement('span');
          label.textContent = it.label;
          const d = document.createElement('b');
          d.textContent = detail(it);
          row.append(tick, label, d);
          box.appendChild(row);
        }
        return box;
      })
    );
  }

  function open() {
    render();
    root.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    $('log-close').focus();
  }
  function close() {
    root.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }
  button.addEventListener('click', () => (root.hidden ? open() : close()));
  $('log-close').addEventListener('click', close);
  root.addEventListener('click', (e) => e.target === root && close());
  window.addEventListener('keydown', (e) => e.key === 'Escape' && !root.hidden && close());

  $('log-clear').addEventListener('click', () => {
    if (!window.confirm('Clear your flight log on this device?')) return;
    data.flags = {};
    data.sets = {};
    data.bests = {};
    save();
    syncButton();
    render();
  });

  // ───────── the certificate ─────────
  function certificate() {
    const W = 1600;
    const H = 1000;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    // the scene as it stands, under a wash of the page's indigo
    g.fillStyle = '#241b3d';
    g.fillRect(0, 0, W, H);
    try {
      const shot = snapshot?.();
      if (shot) {
        const s = Math.max(W / shot.width, H / shot.height);
        g.drawImage(shot, (W - shot.width * s) / 2, (H - shot.height * s) / 2, shot.width * s, shot.height * s);
      }
    } catch {
      /* no picture: the plain background will do */
    }
    const wash = g.createLinearGradient(0, 0, W, 0);
    wash.addColorStop(0, 'rgba(28, 21, 52, 0.94)');
    wash.addColorStop(0.62, 'rgba(28, 21, 52, 0.86)');
    wash.addColorStop(1, 'rgba(28, 21, 52, 0.55)');
    g.fillStyle = wash;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    g.lineWidth = 2;
    g.strokeRect(28, 28, W - 56, H - 56);

    const font = (weight, size) => `${weight} ${size}px Inter, system-ui, sans-serif`;
    const ink = '#f3eefb';
    const dim = 'rgba(243, 238, 251, 0.62)';
    g.textBaseline = 'alphabetic';
    g.fillStyle = dim;
    g.font = font(600, 22);
    g.letterSpacing = '6px';
    g.fillText('TURBOFAN EXPLORER', 84, 118);
    g.letterSpacing = '0px';
    g.fillStyle = ink;
    g.font = font(700, 76);
    g.fillText('Flight log', 80, 208);
    const done = doneCount();
    g.font = font(500, 30);
    g.fillStyle = dim;
    const who = data.name.trim();
    g.fillText(who ? `${who} · ${done} of ${ITEMS.length} completed` : `${done} of ${ITEMS.length} completed`, 84, 262);
    // progress bar
    g.fillStyle = 'rgba(255, 255, 255, 0.14)';
    g.fillRect(84, 290, 620, 8);
    g.fillStyle = '#7fb4ff';
    g.fillRect(84, 290, 620 * (done / ITEMS.length), 8);

    // the entries, two sections to a column
    const colW = 700;
    let x = 84;
    let y = 356;
    SECTIONS.forEach((sec, si) => {
      if (si === 2) {
        x += colW;
        y = 356;
      }
      g.font = font(600, 19);
      g.fillStyle = dim;
      g.letterSpacing = '4px';
      g.fillText(sec.title.toUpperCase(), x, y);
      g.letterSpacing = '0px';
      y += 38;
      for (const it of sec.items) {
        const ok = isDone(it);
        g.font = font(ok ? 500 : 400, 24);
        g.fillStyle = ok ? '#8ee6a8' : 'rgba(243, 238, 251, 0.3)';
        g.fillText(ok ? '✓' : '·', x + 2, y);
        g.fillStyle = ok ? ink : 'rgba(243, 238, 251, 0.42)';
        g.fillText(it.label, x + 36, y);
        const d = detail(it);
        if (d) {
          g.fillStyle = ok ? '#cfe2ff' : 'rgba(243, 238, 251, 0.42)';
          g.textAlign = 'right';
          g.fillText(d, x + colW - 70, y);
          g.textAlign = 'left';
        }
        y += 35;
      }
      y += 26;
    });

    g.font = font(400, 20);
    g.fillStyle = dim;
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    g.fillText(date, 84, H - 48);
    g.textAlign = 'right';
    g.fillText('How a jet engine works, and what it powers', W - 84, H - 48);
    g.textAlign = 'left';
    return c;
  }
  $('log-save').addEventListener('click', () => {
    certificate().toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'turbofan-flight-log.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  });

  syncButton();
  return {
    data,
    certificate,
    get done() {
      return doneCount();
    },
    total: ITEMS.length,
    /** Tick a one-off. */
    mark(id) {
      const it = ITEM[id];
      if (!it || data.flags[id]) return;
      data.flags[id] = true;
      changed(it, false);
    },
    /** Add one member to a collection. */
    add(id, member) {
      const it = ITEM[id];
      if (!it) return;
      const set = (data.sets[id] ??= []);
      if (set.includes(member)) return;
      const was = isDone(it);
      set.push(member);
      changed(it, was);
    },
    /** Record a result if it beats the one on file. `of` given: higher is better. Otherwise seconds: lower is better. */
    best(id, value, { of } = {}) {
      const it = ITEM[id];
      if (!it) return;
      const old = data.bests[id];
      const better = !old || (of != null ? value > old.value : value < old.value);
      if (!better) return;
      const was = isDone(it);
      data.bests[id] = of != null ? { value, of } : { value };
      changed(it, was);
    },
  };
}
