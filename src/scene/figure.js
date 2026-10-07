import * as THREE from 'three';
import { LAYER } from './layers.js';

// 1 scene unit ≈ 1 metre (the fan is 2.77 units across, about the size of a big airliner fan).

function textSprite(text, height = 0.26) {
  const c = document.createElement('canvas');
  const pad = 18;
  const font = '600 44px Inter, system-ui, sans-serif';
  let g = c.getContext('2d');
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + pad * 2;
  c.height = 72;
  g = c.getContext('2d');
  g.font = font;
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(28, 22, 44, 0.78)';
  g.beginPath();
  if (g.roundRect) g.roundRect(0, 0, c.width, c.height, 16);
  else g.rect(0, 0, c.width, c.height);
  g.fill();
  g.fillStyle = '#f3eefb';
  g.fillText(text, pad, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set((height * c.width) / c.height, height, 1);
  s.renderOrder = 8;
  return s;
}

/** A dimension bar: a thin line with a tick at each end. `axis` is 'y'. */
function dimensionBar(length, mat) {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.014, length, 0.014), mat);
  const tick = new THREE.BoxGeometry(0.16, 0.014, 0.014);
  const a = new THREE.Mesh(tick, mat);
  const b = new THREE.Mesh(tick, mat);
  a.position.y = length / 2;
  b.position.y = -length / 2;
  g.add(bar, a, b);
  return g;
}

/**
 * A 1.8 m person standing by the inlet, plus a bar across the fan, so the size reads at a glance.
 * Lives in engine-local space; feet at the level of the bottom of the nacelle.
 */
export function createScaleFigure() {
  const group = new THREE.Group();
  group.visible = false;

  const body = new THREE.MeshStandardMaterial({
    // a dark silhouette: it has to read against both the bright cloud deck and the cream nacelle
    color: '#1c1746', roughness: 0.7, metalness: 0.0, emissive: '#3a47b8', emissiveIntensity: 0.14,
    transparent: true, opacity: 0,
  });
  const line = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthTest: false });
  const fades = [];

  // ── the person ──
  const person = new THREE.Group();
  const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1, rz = 0) => {
    const m = new THREE.Mesh(geo, body);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.z = rz;
    person.add(m);
  };
  add(new THREE.SphereGeometry(0.105, 24, 16), 0, 1.68, 0);
  add(new THREE.CylinderGeometry(0.045, 0.055, 0.1, 12), 0, 1.54, 0);
  add(new THREE.CapsuleGeometry(0.15, 0.36, 6, 16), 0, 1.24, 0, 1, 1, 0.62);
  add(new THREE.SphereGeometry(0.15, 20, 12), 0, 0.94, 0, 1, 0.72, 0.64);
  for (const sx of [-1, 1]) {
    add(new THREE.CapsuleGeometry(0.068, 0.74, 6, 12), sx * 0.085, 0.46, 0);
    add(new THREE.BoxGeometry(0.1, 0.05, 0.24), sx * 0.085, 0.025, 0.05);
    add(new THREE.CapsuleGeometry(0.048, 0.52, 6, 12), sx * 0.24, 1.14, 0, 1, 1, 1, sx * 0.09);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.47, 48).rotateX(-Math.PI / 2), line);
  ring.position.y = 0.004;
  person.add(ring);
  const tall = dimensionBar(1.785, line);
  tall.position.set(-0.46, 0.8925, 0);
  person.add(tall);
  const tallText = textSprite('1.8 m');
  tallText.position.set(-0.86, 0.95, 0);
  person.add(tallText);
  fades.push(tallText.material);
  person.position.set(-1.7, -1.68, 1.9);
  group.add(person);

  // ── the fan diameter ──
  const fanBar = dimensionBar(2.77, line);
  fanBar.position.set(-0.2, 0, 0);
  group.add(fanBar);
  const fanText = textSprite('Fan ≈ 3 m');
  fanText.position.set(-0.2, 1.72, 0);
  group.add(fanText);
  fades.push(fanText.material);

  group.traverse((o) => {
    o.userData.noPick = true;
    // the measuring lines and their captions are flat overlays: drawn after ambient occlusion
    if (o.isSprite || (o.isMesh && o.material === line)) o.layers.set(LAYER.OVERLAY);
    if (o.isMesh && o.material === line) o.renderOrder = 7;
  });

  return {
    group,
    /** @param {number} a 0 hidden → 1 shown */
    set(a) {
      group.visible = a > 0.01;
      body.opacity = a;
      line.opacity = 0.85 * a;
      for (const m of fades) m.opacity = a;
    },
    /** Keep the unlit lines and captions, and the figure's own glow, steady under any exposure. */
    setGain(unlit, emissive) {
      line.color.setScalar(unlit);
      for (const m of fades) m.color.setScalar(unlit);
      body.emissiveIntensity = 0.14 * emissive;
    },
  };
}

/** The glowing parcel of air you follow in "ride the air", with a short comet tail. */
export function createTracer() {
  const group = new THREE.Group();
  group.visible = false;

  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);

  const N = 22;
  const dots = [];
  for (let i = 0; i < N; i++) {
    const m = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const s = new THREE.Sprite(m);
    s.renderOrder = 9;
    s.userData.noPick = true;
    s.layers.set(LAYER.OVERLAY);
    group.add(s);
    dots.push(s);
  }
  const trail = []; // newest first
  let gain = 1;

  return {
    group,
    reset() {
      trail.length = 0;
    },
    setGain(g) {
      gain = g;
    },
    /** @param {THREE.Vector3} p engine-local position  @param {THREE.Color} color */
    set(p, color) {
      trail.unshift(p.clone());
      if (trail.length > N * 3) trail.length = N * 3;
      for (let i = 0; i < N; i++) {
        const q = trail[Math.min(trail.length - 1, i * 3)];
        const f = 1 - i / N;
        dots[i].position.copy(q);
        dots[i].scale.setScalar(i === 0 ? 0.42 : 0.06 + 0.22 * f);
        dots[i].material.opacity = i === 0 ? 1 : 0.55 * f * f;
        dots[i].material.color.copy(color).multiplyScalar(gain);
      }
    },
  };
}
