import { COMPARE } from '../data/parts.js';

const $ = (id) => document.getElementById(id);

/** The details card for a selected part. */
export function createInfoCard({ onClose, onStep }) {
  const el = $('info-card');
  const name = $('info-name');
  const what = $('info-what');
  const stats = $('info-stats');
  const made = $('info-made');
  const step = $('info-step');
  const madeTitle = el.querySelector('h4');
  const fine = el.querySelector('.fine');

  $('info-close').addEventListener('click', onClose);
  $('info-prev').addEventListener('click', () => onStep(-1));
  $('info-next').addEventListener('click', () => onStep(1));

  return {
    get open() {
      return !el.hidden;
    },
    show(part, index, total) {
      name.textContent = part.name;
      what.textContent = part.what;
      // engine parts say what they are made of; the aircraft's systems say what drives them
      made.textContent = part.madeOf ?? part.poweredBy;
      madeTitle.textContent = part.madeOf ? 'Made of' : 'Powered by';
      fine.textContent = `Typical figures for a large airliner${part.madeOf ? ' engine' : ''}, rounded.`;
      step.textContent = `${part.madeOf ? 'Part' : 'System'} ${index + 1} of ${total}`;
      stats.replaceChildren(
        ...part.stats.flatMap(([k, v]) => {
          const dt = document.createElement('dt');
          const dd = document.createElement('dd');
          dt.textContent = k;
          dd.textContent = v;
          return [dt, dd];
        })
      );
      el.hidden = false;
      el.scrollTop = 0;
    },
    hide() {
      el.hidden = true;
    },
  };
}

/** Turbojet vs turbofan, shown when the engine type is switched. */
export function createCompareCard() {
  const el = $('compare-card');
  $('compare-title').textContent = COMPARE.title;
  $('compare-body').textContent = COMPARE.body;
  $('compare-note').textContent = COMPARE.note;

  const rows = $('compare-rows');
  for (const r of COMPARE.rows) {
    const max = Math.max(r.jet, r.fan);
    const row = document.createElement('div');
    row.className = 'cmp';
    const bar = (cls, label, value, text) => {
      const d = document.createElement('div');
      d.className = `bar ${cls}`;
      const lab = document.createElement('span');
      lab.textContent = label;
      const track = document.createElement('div');
      const fill = document.createElement('i');
      fill.style.width = `${Math.max(6, (value / max) * 55)}%`;
      const em = document.createElement('em');
      em.textContent = text;
      fill.appendChild(em);
      track.appendChild(fill);
      d.append(lab, track);
      return d;
    };
    const title = document.createElement('b');
    title.textContent = r.k;
    row.append(title, bar('jet', 'Turbojet', r.jet, r.jetText), bar('fan', 'Turbofan', r.fan, r.fanText));
    rows.appendChild(row);
  }

  $('compare-close').addEventListener('click', () => (el.hidden = true));

  return {
    show() {
      el.hidden = false;
      el.scrollTop = 0;
    },
    hide() {
      el.hidden = true;
    },
  };
}
