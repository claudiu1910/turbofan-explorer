import * as THREE from 'three';

// SVG livery sheets → textures. The SVGs live in public/livery/, next to the pages, so the path
// is relative to the page: it keeps working when the built site sits in a sub-folder.
export const LIVERY_DIR = new URL('livery/', document.baseURI);

// Raster sizes. Each sheet's viewBox has the same aspect, so nothing stretches.
const SHEETS = {
  fuselage: { livery: 'fuselage.svg', panels: 'fuselage-panels.svg', size: [2048, 710] },
  nacelle: { livery: 'nacelle.svg', panels: 'nacelle-panels.svg', size: [1024, 1808] },
  tail: { livery: 'tail.svg', size: [1024, 882] },
  wing: { panels: 'wing-panels.svg', size: [2048, 1024] },
  spinner: { livery: 'spinner.svg', size: [512, 512] },
};

export const LIVERY = {
  panelDarken: 0.45, // how much panel lines darken the albedo (multiply alpha)
  bumpScale: 1.6, // groove depth of the panel-line bump
  roughMean: 0.9, // roughness maps average this; material.roughness is set to palette / roughMean
};

const load = (name) =>
  new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('livery: ' + name));
    i.src = new URL(name, LIVERY_DIR).href;
  });

const canvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
};

function rng(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Soft blotches and flow-wise streaks: the shininess variation of weathered paint. */
function roughnessCanvas(seed, w = 512, h = 512, stretch = 3) {
  const [c, g] = canvas(w, h);
  const mean = Math.round(255 * LIVERY.roughMean);
  g.fillStyle = `rgb(${mean},${mean},${mean})`;
  g.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < 320; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = (0.015 + r() * 0.07) * h;
    const v = r() < 0.5 ? 255 : 196;
    const a = 0.05 + r() * 0.1;
    g.save();
    g.translate(x, y);
    g.scale(stretch, 1);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rad);
    grad.addColorStop(0, `rgba(${v},${v},${v},${a})`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grad;
    g.fillRect(-rad, -rad, rad * 2, rad * 2);
    g.restore();
  }
  return c;
}

export async function loadLivery(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (c, srgb, wrapAround) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = wrapAround ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; // v runs around lathes
    return t;
  };
  const out = {};
  let seed = 11;
  await Promise.all(
    Object.entries(SHEETS).map(async ([id, s]) => {
      const [w, h] = s.size;
      const [livery, panels] = await Promise.all([s.livery ? load(s.livery) : null, s.panels ? load(s.panels) : null]);
      const around = id === 'fuselage' || id === 'nacelle' || id === 'spinner';
      const [mc, mg] = canvas(w, h);
      if (livery) mg.drawImage(livery, 0, 0, w, h);
      else {
        mg.fillStyle = '#ffffff';
        mg.fillRect(0, 0, w, h);
      }
      if (panels) {
        mg.globalCompositeOperation = 'multiply';
        mg.globalAlpha = LIVERY.panelDarken;
        mg.drawImage(panels, 0, 0, w, h);
      }
      const t = { map: tex(mc, true, around) };
      if (panels) {
        const [bc, bg] = canvas(w, h);
        bg.drawImage(panels, 0, 0, w, h);
        t.bump = tex(bc, false, around);
      }
      t.rough = tex(roughnessCanvas(seed++, 512, 512, id === 'wing' ? 1 : 3), false, around);
      out[id] = t;
    })
  );
  return out;
}

/** Put the sheets on the source materials. Call before buildEngine(): its scopes clone these. */
export function applyLivery(M, T) {
  const put = (m, t, { white = true } = {}) => {
    if (white) m.color.set('#ffffff'); // the paint colour lives in the sheet
    m.map = t.map;
    if (t.bump) {
      m.bumpMap = t.bump;
      m.bumpScale = LIVERY.bumpScale;
    }
    m.roughnessMap = t.rough;
    m.roughness = Math.min(1, m.roughness / LIVERY.roughMean);
    m.needsUpdate = true;
  };
  put(M.fuselage, T.fuselage);
  put(M.cowl, T.nacelle);
  put(M.tail, T.tail);
  put(M.spinner, T.spinner);
  put(M.wingTop, T.wing, { white: false }); // grey stays on the material; the sheet only adds lines
}

/** Toggle every textured standard material in a scene (for A/B in the study). */
export function setLiveryVisible(scene, on) {
  scene.traverse((o) => {
    const m = o.material;
    if (!m || !m.isMeshStandardMaterial) return;
    if (!m._liv && (m.map || m.bumpMap || m.roughnessMap)) {
      m._liv = { map: m.map, bumpMap: m.bumpMap, roughnessMap: m.roughnessMap, color: m.color.clone(), roughness: m.roughness };
    }
    if (!m._liv) return;
    const L = m._liv;
    m.map = on ? L.map : null;
    m.bumpMap = on ? L.bumpMap : null;
    m.roughnessMap = on ? L.roughnessMap : null;
    if (on) m.roughness = L.roughness;
    else m.roughness = L.roughness * LIVERY.roughMean;
    if (!on && L.color.r === 1 && L.color.g === 1 && L.color.b === 1) m.color.set('#e9eae6');
    else if (on) m.color.copy(L.color);
    m.needsUpdate = true;
  });
}
