import * as THREE from 'three';
import { latheX, wallProfile, sampleCurve, bladeGeometry, ringOf, evenAngles, disc, cylUV } from './geometry.js';
import { M, clipPlanes } from './materials.js';
import { LAYER } from './layers.js';

// Nacelle livery UV domain: engine-local x 0 → 6.0 m (livery/nacelle.svg, nacelle-panels.svg).
export const NAC_UV = [0, 6.0];

/**
 * Procedural high-bypass turbofan, axis = +X, front lip at x = 0, nozzle tip at x ≈ 7.45.
 *
 * Every major assembly is its own Group ("part") so one model drives the cutaway, the exploded
 * view and the assembly game. Every mesh also belongs to an info "scope" (inlet, fan, hpc, …):
 * a scope owns private copies of its materials, which is what lets a single part be highlighted
 * while the rest are dimmed, and lets the outer shells be ghosted for x-ray.
 */

// Explode offsets (engine-local) for each part.
const EXPLODE = {
  fanCowl: [-3.7, 0, 0],
  fan: [-2.1, 0, 0],
  bypassTop: [-0.2, 0.98, 0],
  bypassBottom: [-0.2, -0.98, 0],
  lpCompressor: [0.2, 0, 0],
  hpCompressor: [1.3, 0, 0],
  combustor: [2.6, 0, 0],
  hpTurbine: [3.8, 0, 0],
  lpTurbine: [4.7, 0, 0],
  shafts: [1.7, -3.25, 0],
  thrust: [0, 0, 0],
};

const PI = Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);

// Lathe angle phi → the rotateX angle that puts a +Y blade at that phi (see geometry.latheX).
const rotOf = (phi) => phi + PI / 2;

export const CORE_COWL = [
  [1.55, 0.72], [1.9, 0.76], [2.7, 0.68], [4.1, 0.58], [5.0, 0.58], [5.5, 0.62], [6.0, 0.68], [6.45, 0.70],
];
const NAC_OUTER = [[1.9, 1.68], [3.0, 1.64], [4.2, 1.52], [5.2, 1.32], [6.0, 1.14]];
const NAC_INNER = [[1.9, 1.5], [3.0, 1.52], [4.2, 1.42], [5.2, 1.25], [6.0, 1.07]];

// thrust reverser: where the nacelle splits, how far the sleeve slides, how far the doors swing
const SLEEVE_X = 3.25;
const SLEEVE_TRAVEL = 0.7;
const DOOR_SWING = 1.3;

// source materials for the special section colours (cloned per scope like everything else)
const SRC = {
  cut: M.cutFace,
  cutHot: M.cutFaceHot,
  cutDark: new THREE.MeshBasicMaterial({ color: '#0f1442', side: THREE.BackSide }),
  cutFlame: new THREE.MeshBasicMaterial({ color: '#ffcf8a', side: THREE.BackSide }),
  cutLp: new THREE.MeshBasicMaterial({ color: '#63dcff', side: THREE.BackSide }),
};
const HILITE = new THREE.Color('#a9ccff');

export function buildEngine() {
  const root = new THREE.Group();
  const parts = {};
  const rotors = []; // { obj, spool }
  const glows = []; // { key, mat, base, max, amt, hot, scope }
  const scopes = {}; // info id → { id, mats, byKey, dim, hi }
  const ghostBacks = []; // section twins of the shells that x-ray ghosts
  const nacs = []; // sub-groups that vanish on a turbojet
  const reverser = { sleeves: [], hinges: [], extras: [] };
  let scope = null;
  const fanRef = {}; // { rotor, blades }: read by the fan motion-blur copies

  // ───────── scopes & materials ─────────
  const useScope = (id) => {
    scope = scopes[id] ??= { id, mats: [], byKey: new Map(), dim: 1, hi: 0 };
    return scope;
  };

  const register = (m, extra = {}) => {
    m.clippingPlanes = clipPlanes; // Material.clone() deep-copies planes; point back at the shared one
    const own = !m.isMeshBasicMaterial && m.emissiveIntensity > 0 && m.emissive.r + m.emissive.g + m.emissive.b > 0;
    m.userData = {
      base: m.color.clone(),
      baseEI: m.isMeshBasicMaterial ? 0 : m.emissiveIntensity,
      basic: !!m.isMeshBasicMaterial,
      ownEmissive: own,
      glow: false,
      ghost: false,
      ...extra,
    };
    if (m.userData.ghost) m.transparent = true; // always in the transparent pass: no recompile when x-ray toggles
    scope.mats.push(m);
    return m;
  };

  /** This scope's private copy of a shared source material. */
  const pm = (src, ghost = false) => {
    const key = src.uuid + (ghost ? ':ghost' : '');
    let m = scope.byKey.get(key);
    if (!m) {
      m = register(src.clone(), { ghost });
      scope.byKey.set(key, m);
    }
    return m;
  };

  const tag = (obj) => {
    obj.userData.infoId = scope.id;
    return obj;
  };

  const mk = (geo, src, { ghost = false } = {}) => tag(new THREE.Mesh(geo, src.userData?.base ? src : pm(src, ghost)));

  /** Mesh plus a back-face twin, so a clipped wall shows a coloured section. */
  const mkCut = (geo, src, cutSrc = SRC.cut, { ghost = false } = {}) => {
    const g = new THREE.Group();
    const front = mk(geo, src, { ghost });
    const back = tag(new THREE.Mesh(geo, pm(cutSrc)));
    back.renderOrder = 1; // same geometry → equal depth; drawing second makes the section win
    back.layers.set(LAYER.OVERLAY); // drawn after AO, so sections stay flat diagram colour
    back.userData.cutBack = true;
    if (ghost) ghostBacks.push(back);
    g.add(front, back);
    return g;
  };

  const wall = (outer, inner, src, opts = {}) => {
    const { segs = 96, phi0 = 0, phiLen = PI * 2, cut = SRC.cut, ghost = false, uv = null } = opts;
    const geo = latheX(wallProfile(outer, inner), segs, phi0, phiLen);
    if (uv) cylUV(geo, uv[0], uv[1]);
    return mkCut(geo, src, cut, { ghost });
  };

  /** A material that glows with its stage (and with heat, for the hot section). */
  const glowMat = (key, src, color, base, max, hot = false) => {
    const m = register(src.clone(), { glow: true });
    m.emissive = new THREE.Color(color);
    m.emissiveIntensity = base;
    glows.push({ key, mat: m, base, max, amt: 0, hot, scope });
    return m;
  };

  const bladeRow = ({ x, root: r0, tip, count, chord, stagger, thick = 0.012, phase = 0, mat, sweep = 0, spanSegs = 2 }) => {
    const g = bladeGeometry({
      root: r0, tip, chordRoot: chord, chordTip: chord * 0.9,
      staggerRoot: stagger, staggerTip: stagger * 0.82, thickness: thick, sweep,
      spanSegs, chordSegs: 3,
    });
    return tag(new THREE.Mesh(ringOf(g, evenAngles(count, phase), x), mat));
  };

  const part = (name) => {
    const g = new THREE.Group();
    g.name = name;
    g.userData.explode = new THREE.Vector3(...EXPLODE[name]);
    parts[name] = g;
    root.add(g);
    return g;
  };

  const track = (obj, spool, rear = false) => {
    rotors.push({ obj, spool, rear }); // rear: the LP turbine, which a broken shaft sets free
    return obj;
  };

  // ───────────────── FAN COWL ─────────────────
  {
    const g = part('fanCowl');
    useScope('inlet');
    // bare-aluminium lip (the anti-ice skin), then the painted inlet cowl behind it
    const LIP_X = 0.35;
    const LIP_RI = 1.4206; // inner skin radius at LIP_X
    g.add(wall([[0.02, 1.5], [0.1, 1.57], [LIP_X, 1.63]], [[0.03, 1.455], [0.15, 1.425], [LIP_X, LIP_RI]], M.lip, { ghost: true }));
    g.add(wall(
      [[LIP_X, 1.63], [0.9, 1.67], [1.5, 1.685], [1.9, 1.68]],
      [[LIP_X, LIP_RI], [0.6, 1.415], [1.5, 1.43], [1.9, 1.5]],
      M.cowl,
      { ghost: true, uv: NAC_UV }
    ));
    // acoustic liner just inside the throat (profile runs back → front so it faces the axis)
    g.add(mk(latheX([[1.85, 1.41], [1.2, 1.405], [0.6, 1.405], [0.18, 1.415]], 96), M.liner, { ghost: true }));
    // bright metal lip
    g.add(mk(new THREE.TorusGeometry(1.485, 0.045, 12, 96).rotateY(PI / 2).translate(0.07, 0, 0), M.lip));
  }

  // ───────────────── FAN ─────────────────
  {
    const g = part('fan');
    useScope('fan');
    const rotor = track(new THREE.Group(), 'lp');
    const spinnerGeo = latheX(
      [[0.12, 0.0], [0.2, 0.1], [0.38, 0.22], [0.68, 0.34], [0.95, 0.4], [1.3, 0.42], [1.35, 0.4], [1.35, 0.0]],
      72
    );
    cylUV(spinnerGeo, 0.12, 1.35); // livery/spinner.svg
    rotor.add(mkCut(spinnerGeo, M.spinner, SRC.cutDark));
    rotor.add(mk(new THREE.TorusGeometry(0.34, 0.035, 10, 64).rotateY(PI / 2).translate(0.62, 0, 0), M.steel));

    const fanMat = glowMat('fan', M.fanBlade, '#4aa8ff', 0.0, 0.55);
    fanRef.blades = (
      mk(
        ringOf(
          bladeGeometry({
            root: 0.4, tip: 1.385, chordRoot: 0.42, chordTip: 0.7, staggerRoot: 0.5, staggerTip: 1.12,
            thickness: 0.032, sweep: 0.3, camber: 0.04, spanSegs: 10, chordSegs: 8,
          }),
          evenAngles(18),
          0.98
        ),
        fanMat
      )
    );
    rotor.add(fanRef.blades);
    fanRef.rotor = rotor;
    rotor.add(mk(disc(0.36, 0.5, 0.88, 0.5, 48), M.steelDark)); // blade-root platform ring
    g.add(rotor);
  }

  // ───────────────── BYPASS DUCT (two halves) ─────────────────
  const buildBypassHalf = (name, phi0) => {
    const g = part(name);
    useScope('bypass');
    const half = { phi0, phiLen: PI, segs: 64 };
    const rOut = (x) => sampleCurve(NAC_OUTER, x);
    const rIn = (x) => sampleCurve(NAC_INNER, x);

    const nac = new THREE.Group(); // the fan case and everything in the duct: gone on a turbojet
    const sleeve = new THREE.Group(); // the reverser's translating cowl
    nac.add(sleeve);
    g.add(nac);
    nacs.push(nac);
    reverser.sleeves.push(sleeve);

    // fixed fan case, then the sliding sleeve behind it
    nac.add(
      wall(
        [[1.9, 1.68], [3.0, 1.64], [SLEEVE_X, rOut(SLEEVE_X)]],
        [[1.9, 1.5], [3.0, 1.52], [SLEEVE_X, rIn(SLEEVE_X)]],
        M.cowl,
        { ...half, ghost: true, uv: NAC_UV }
      )
    );
    sleeve.add(
      wall(
        [[SLEEVE_X, rOut(SLEEVE_X)], [4.2, 1.52], [5.2, 1.32], [6.0, 1.14]],
        [[SLEEVE_X, rIn(SLEEVE_X)], [4.2, 1.42], [5.2, 1.25], [6.0, 1.07]],
        M.cowl,
        { ...half, ghost: true, uv: NAC_UV }
      )
    );
    // dark duct lining so the bypass reads as a tunnel, not a cream shell
    nac.add(mk(latheX([[SLEEVE_X, rIn(SLEEVE_X) - 0.005], [3.0, 1.515], [1.92, 1.495]], 64, phi0, PI), M.duct, { ghost: true }));
    sleeve.add(mk(latheX([[5.95, 1.065], [4.2, 1.415], [SLEEVE_X, rIn(SLEEVE_X) - 0.005]], 64, phi0, PI), M.duct, { ghost: true }));

    // core cowl: the inner wall of the duct (stays on a turbojet, where it is simply the casing)
    g.add(wall(CORE_COWL, CORE_COWL.map(([x, r]) => [x, r - 0.04]), M.coreCowl, { ...half, ghost: true }));

    // outlet guide vanes
    const ogv = bladeGeometry({
      root: 0.76, tip: 1.52, chordRoot: 0.34, chordTip: 0.34, staggerRoot: 0.55, staggerTip: 0.5,
      thickness: 0.018, spanSegs: 4, chordSegs: 4,
    });
    nac.add(mk(ringOf(ogv, evenAngles(13, phi0, PI).map((p) => rotOf(p + 0.12)), 2.15), M.white));

    // structural struts across the duct
    const strut = bladeGeometry({
      root: sampleCurve(CORE_COWL, 2.85) - 0.02, tip: rIn(2.85) + 0.02,
      chordRoot: 0.44, chordTip: 0.44, staggerRoot: 0, staggerTip: 0, thickness: 0.03, spanSegs: 2, chordSegs: 4,
    });
    nac.add(mk(ringOf(strut, [0.5, 1.5, 2.5, 3.5].map((k) => rotOf(phi0 + (k * PI) / 4)), 2.85), M.steelDark));

    // ── thrust reverser ──
    // cascade vanes, uncovered when the sleeve slides back
    const cascade = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const x = SLEEVE_X + 0.12 + i * 0.15;
      const ring = latheX([[x, 1.5], [x - 0.06, 1.61], [x - 0.04, 1.61], [x + 0.02, 1.5], [x, 1.5]], 48, phi0, PI);
      cascade.add(mk(ring, M.steel));
    }
    nac.add(cascade);
    reverser.extras.push(cascade);

    // blocker doors, hinged on the sleeve, swing in to shut the duct
    const doors = new THREE.Group();
    const N = 5;
    const L = 0.92;
    const rHinge = 1.49;
    const wHinge = ((PI * rHinge) / N) * 0.94;
    const wEnd = ((PI * 0.6) / N) * 0.94;
    const plate = new THREE.ExtrudeGeometry(
      new THREE.Shape([
        new THREE.Vector2(0, -wHinge / 2), new THREE.Vector2(L, -wEnd / 2),
        new THREE.Vector2(L, wEnd / 2), new THREE.Vector2(0, wHinge / 2),
      ]),
      { depth: 0.03, bevelEnabled: false }
    );
    const ex = new THREE.Vector3(1, 0, 0);
    for (let k = 0; k < N; k++) {
      const phi = phi0 + ((k + 0.5) * PI) / N;
      const et = new THREE.Vector3(0, -Math.cos(phi), -Math.sin(phi)); // tangential (hinge axis)
      const inward = new THREE.Vector3(0, Math.sin(phi), -Math.cos(phi));
      const pivot = new THREE.Group();
      pivot.position.set(SLEEVE_X + 0.05, -rHinge * Math.sin(phi), rHinge * Math.cos(phi));
      pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, et, inward));
      const hinge = new THREE.Group();
      hinge.add(mk(plate, M.steelDark));
      pivot.add(hinge);
      doors.add(pivot);
      reverser.hinges.push(hinge);
    }
    sleeve.add(doors);
    reverser.extras.push(doors);
  };
  buildBypassHalf('bypassTop', PI);
  buildBypassHalf('bypassBottom', 0);

  // ───────────────── LP COMPRESSOR (booster) ─────────────────
  {
    const g = part('lpCompressor');
    useScope('lpc');
    g.add(wall([[1.55, 0.64], [2.7, 0.58]], [[1.55, 0.6], [2.7, 0.54]], M.casing, { ghost: true }));
    const rotor = track(new THREE.Group(), 'lp');
    const rotMat = glowMat('lpCompressor', M.steel, '#4aa8ff', 0.0, 0.5);
    rotor.add(mkCut(latheX(wallProfile([[1.5, 0.3], [2.7, 0.34]], [[1.5, 0.26], [2.7, 0.3]]), 48), M.steelDark));
    [1.68, 2.08, 2.48].forEach((x, i) => {
      rotor.add(bladeRow({ x, root: 0.3 + i * 0.01, tip: 0.55 - i * 0.015, count: 26, chord: 0.2, stagger: 0.95, mat: rotMat, phase: i * 0.3 }));
    });
    g.add(rotor);
    const stator = pm(M.bronze);
    [1.88, 2.28].forEach((x, i) => {
      g.add(bladeRow({ x, root: 0.32, tip: 0.57 - i * 0.02, count: 30, chord: 0.18, stagger: -0.8, mat: stator, phase: 0.1 }));
    });
  }

  // ───────────────── HP COMPRESSOR ─────────────────
  {
    const g = part('hpCompressor');
    useScope('hpc');
    const casIn = (x) => lerp(0.54, 0.4, (x - 2.7) / 1.4);
    const hub = (x) => lerp(0.34, 0.36, (x - 2.7) / 1.4);
    const xs = [2.7, 3.1, 3.5, 3.9, 4.1];
    g.add(wall(xs.map((x) => [x, casIn(x) + 0.045]), xs.map((x) => [x, casIn(x)]), M.casing, { ghost: true }));

    const rotor = track(new THREE.Group(), 'hp');
    const rotMat = glowMat('hpCompressor', M.steel, '#ffb23c', 0.0, 0.55);
    const stator = pm(M.bronze);
    rotor.add(mkCut(latheX(wallProfile(xs.map((x) => [x, hub(x)]), xs.map((x) => [x, hub(x) - 0.05])), 48), M.steelDark));
    for (let i = 0; i < 8; i++) {
      const x = 2.78 + i * 0.165;
      const h = hub(x);
      rotor.add(bladeRow({ x, root: h - 0.005, tip: casIn(x) - 0.006, count: 34, chord: 0.11, stagger: 0.95, mat: rotMat, phase: i * 0.17, thick: 0.008 }));
      rotor.add(mk(disc(0.22, h, x - 0.015, 0.025, 40), M.bronze));
      const xs2 = x + 0.082;
      g.add(bladeRow({ x: xs2, root: hub(xs2) + 0.004, tip: casIn(xs2) + 0.002, count: 36, chord: 0.1, stagger: -0.85, mat: stator, phase: 0.05, thick: 0.007 }));
    }
    g.add(rotor);
  }

  // ───────────────── COMBUSTOR ─────────────────
  {
    const g = part('combustor');
    useScope('combustor');
    g.add(wall([[4.1, 0.5], [4.55, 0.525], [5.0, 0.5]], [[4.1, 0.455], [4.55, 0.48], [5.0, 0.455]], M.casing, { ghost: true }));
    const liner = glowMat('combustor', M.hot, '#ff7a22', 0.18, 2.4, true);
    g.add(wall([[4.14, 0.41], [4.5, 0.425], [4.96, 0.39]], [[4.14, 0.365], [4.5, 0.38], [4.96, 0.345]], liner, { cut: SRC.cutFlame }));
    g.add(wall([[4.14, 0.3], [4.6, 0.3], [4.96, 0.29]], [[4.14, 0.265], [4.6, 0.265], [4.96, 0.255]], liner, { cut: SRC.cutFlame }));
    // fuel injectors
    const inj = new THREE.CylinderGeometry(0.035, 0.05, 0.28, 10);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      const m = mk(inj, M.white);
      m.position.set(4.2, Math.sin(a) * 0.6, Math.cos(a) * 0.6);
      m.rotation.x = PI / 2 - a; // cylinder axis (Y) → radial direction (0, sin a, cos a)
      g.add(m);
    }
    g.add(mk(new THREE.TorusGeometry(0.66, 0.018, 8, 64).rotateY(PI / 2).translate(4.2, 0, 0), M.steel)); // fuel manifold
  }

  // ───────────────── HP TURBINE ─────────────────
  {
    const g = part('hpTurbine');
    useScope('hpt');
    const casIn = (x) => lerp(0.46, 0.5, (x - 5.0) / 0.55);
    const xs = [5.0, 5.28, 5.55];
    g.add(wall(xs.map((x) => [x, casIn(x) + 0.05]), xs.map((x) => [x, casIn(x)]), M.casing, { ghost: true }));
    const rotor = track(new THREE.Group(), 'hp');
    const mat = glowMat('hpTurbine', M.hot, '#ff6a1a', 0.12, 1.6, true);
    const vane = pm(M.bronze);
    rotor.add(mkCut(latheX(wallProfile([[5.0, 0.3], [5.55, 0.32]], [[5.0, 0.24], [5.55, 0.26]]), 40), M.steelDark));
    [5.12, 5.42].forEach((x, i) => {
      rotor.add(bladeRow({ x, root: 0.3, tip: casIn(x) - 0.01, count: 38, chord: 0.14, stagger: 0.85, mat, phase: i * 0.1, thick: 0.014 }));
      rotor.add(mk(disc(0.2, 0.34, x - 0.02, 0.03, 40), M.bronze));
    });
    g.add(rotor);
    [5.02, 5.3].forEach((x, i) => {
      g.add(bladeRow({ x, root: 0.3, tip: casIn(x), count: 30, chord: 0.15, stagger: -0.9, mat: vane, phase: 0.2 + i * 0.05, thick: 0.014 }));
    });
  }

  // ───────────────── LP TURBINE + NOZZLE ─────────────────
  let plugMat;
  let plugScope;
  {
    const g = part('lpTurbine');
    useScope('lpt');
    const casIn = (x) => lerp(0.5, 0.62, (x - 5.55) / 0.95);
    const xs = [5.55, 6.0, 6.5];
    g.add(wall(xs.map((x) => [x, casIn(x) + 0.045]), xs.map((x) => [x, casIn(x)]), M.casing, { ghost: true }));
    const rotor = track(new THREE.Group(), 'lp', true);
    const mat = glowMat('lpTurbine', M.hot, '#ff6a1a', 0.1, 1.3, true);
    const vane = pm(M.bronze);
    rotor.add(mkCut(latheX(wallProfile([[5.55, 0.3], [6.45, 0.3]], [[5.55, 0.22], [6.45, 0.22]]), 40), M.steelDark));
    [5.68, 5.88, 6.08, 6.28].forEach((x, i) => {
      rotor.add(bladeRow({ x, root: 0.3, tip: casIn(x) - 0.01, count: 44, chord: 0.15, stagger: 0.85, mat, phase: i * 0.13, thick: 0.014 }));
      rotor.add(mk(disc(0.18, 0.32, x - 0.02, 0.03, 40), M.bronze));
    });
    g.add(rotor);
    [5.58, 5.78, 5.98, 6.18].forEach((x, i) => {
      g.add(bladeRow({ x, root: 0.3, tip: casIn(x), count: 36, chord: 0.15, stagger: -0.9, mat: vane, phase: 0.2 + i * 0.05, thick: 0.014 }));
    });

    // exhaust nozzle skin + centre plug: their own scope, riding on the same part
    plugScope = useScope('nozzle');
    g.add(wall([[6.5, 0.67], [6.8, 0.6], [7.08, 0.5]], [[6.5, 0.625], [6.8, 0.555], [7.08, 0.465]], M.nozzle));
    plugMat = register(M.hot.clone(), { glow: true });
    plugMat.emissive = new THREE.Color('#ffa14a');
    g.add(mkCut(latheX([[6.35, 0.0], [6.35, 0.25], [6.8, 0.24], [7.2, 0.14], [7.46, 0.0]], 48), plugMat, SRC.cutHot));
  }

  // ───────────────── SHAFTS ─────────────────
  {
    const g = part('shafts');
    useScope('lpShaft');
    g.add(mkCut(latheX(wallProfile([[1.0, 0.06], [6.4, 0.06]], [[1.0, 0.0], [6.4, 0.0]]), 24), M.lpShaft, SRC.cutLp));
    const ringGeo = new THREE.TorusGeometry(0.135, 0.014, 8, 48).rotateY(PI / 2);
    [1.5, 1.95, 2.45, 3.05, 3.65, 4.25, 4.8, 5.35, 5.9, 6.3].forEach((x) => {
      const r = mk(ringGeo, M.lpShaft);
      r.position.x = x;
      g.add(r);
    });
    // HP shaft: a hollow tube around the LP shaft
    useScope('hpShaft');
    g.add(wall([[2.6, 0.215], [5.65, 0.215]], [[2.6, 0.18], [5.65, 0.18]], M.steelDark, { segs: 48, cut: SRC.cutHot }));
    const hpRing = new THREE.TorusGeometry(0.235, 0.014, 8, 48).rotateY(PI / 2);
    [2.8, 3.3, 3.8, 4.3, 5.1, 5.5].forEach((x) => {
      const r = mk(hpRing, M.hpShaft);
      r.position.x = x;
      g.add(r);
    });
  }

  // ───────────────── THRUST ARROW ─────────────────
  let arrowMat;
  let arrowTurn;
  {
    const g = part('thrust');
    arrowMat = new THREE.MeshStandardMaterial({
      color: '#dfe8ff', roughness: 0.35, metalness: 0.1, emissive: '#6f9dff', emissiveIntensity: 0.55,
      transparent: true, opacity: 0,
    });
    arrowTurn = new THREE.Group(); // turns about its own middle when the thrust reverses
    arrowTurn.position.set(1.6, 0, 0);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5.0, 24).rotateZ(PI / 2), arrowMat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 28).rotateZ(PI / 2), arrowMat);
    head.position.set(-2.9, 0, 0);
    arrowTurn.add(shaft, head);
    g.add(arrowTurn);
    g.position.set(0, -2.1, 1.7);
  }

  // ───────────────── shadows ─────────────────
  // every solid casts and receives; section twins and the translucent thrust arrow do neither
  root.traverse((o) => {
    if (!o.isMesh) return;
    const off = o.userData.cutBack || o.material === arrowMat;
    o.castShadow = !off;
    o.receiveShadow = !off;
  });

  // ───────────────── state ─────────────────
  const scopeList = Object.values(scopes);
  const partNames = Object.keys(parts);
  let lastXray = -1;
  let emGain = 1; // scales every emissive value to the scene's exposure (see setEmissiveGain)

  const applyXray = (x) => {
    for (const sc of scopeList) {
      for (const m of sc.mats) {
        if (!m.userData.ghost) continue;
        m.opacity = 1 - 0.88 * x;
        m.depthWrite = x < 0.5;
      }
    }
    for (const b of ghostBacks) b.visible = x < 0.5;
  };

  const paintScope = (sc) => {
    const { dim, hi } = sc;
    for (const m of sc.mats) {
      const u = m.userData;
      m.color.copy(u.base).multiplyScalar(dim * (1 + 0.16 * hi));
      if (u.basic || u.glow) continue;
      if (u.ownEmissive) {
        m.emissiveIntensity = u.baseEI * emGain * dim * (1 + 0.35 * hi);
      } else {
        m.emissive.copy(HILITE);
        m.emissiveIntensity = 0.2 * emGain * hi * dim;
      }
    }
  };
  scopeList.forEach(paintScope);
  applyXray(0);

  const api = {
    root,
    parts,
    fan: fanRef,
    scopeIds: scopeList.map((s) => s.id),
    /** Groups to raycast against (everything except the thrust arrow). */
    pickRoots: partNames.filter((n) => n !== 'thrust').map((n) => parts[n]),
    /** A point that rides along with a part (labels and camera focus use these). */
    anchor(partName, at) {
      const a = new THREE.Object3D();
      a.position.set(...at);
      parts[partName].add(a);
      return a;
    },
    explodeOf(partName) {
      return parts[partName].userData.explode;
    },
    /**
     * Glows, shaft colours and the hover tint are light the parts give off, so their strength on
     * screen depends on the exposure. This keeps them where they were authored.
     */
    setEmissiveGain(g) {
      emGain = g;
      arrowMat.emissiveIntensity = 0.55 * g;
      scopeList.forEach(paintScope);
    },

    /**
     * @param {number} dt seconds of animation time (0 while paused)
     * @param {object} s  explode, spin, lpRate, hpRate, stageWeights, thrustAlpha, hot,
     *                    jet, reverse, xray, focus, hover, offsets, hidden
     * @param {number} [k] smoothing factor for highlight fades (real time, so they work when paused)
     */
    update(dt, s, k = 0.2) {
      // rotation: LP spool slow, HP spool faster, both deliberately slowed so the blades read
      const lp = dt * s.spin * 1.35 * (s.lpRate ?? 1);
      const lpt = dt * s.spin * 1.35 * (s.lptRate ?? s.lpRate ?? 1);
      const hp = dt * s.spin * 3.1 * (s.hpRate ?? 1);
      for (const r of rotors) r.obj.rotation.x += r.spool === 'hp' ? hp : r.rear ? lpt : lp;

      // where each part sits: exploded along its own offset, unless a game is placing it
      for (const name of partNames) {
        const p = parts[name];
        if (name === 'thrust') {
          p.visible = s.thrustAlpha > 0.01;
          continue;
        }
        const o = s.offsets?.[name];
        if (o) p.position.copy(o);
        else p.position.copy(p.userData.explode).multiplyScalar(s.explode);
        p.visible = !s.hidden?.has(name);
      }
      arrowMat.opacity = s.thrustAlpha;
      arrowTurn.rotation.y = PI * smooth(clamp01(s.reverse ?? 0));

      // turbojet: the fan and its case shrink to the width of the core, the duct disappears
      const jet = clamp01(s.jet ?? 0);
      const kj = lerp(1, 0.5, smooth(jet));
      parts.fanCowl.scale.set(1, kj, kj);
      parts.fan.scale.set(1, kj, kj);
      for (const n of nacs) {
        n.scale.set(1, kj, kj);
        n.visible = jet < 0.985;
      }

      // thrust reverser
      const rev = clamp01(s.reverse ?? 0);
      const slide = smooth(rev) * SLEEVE_TRAVEL;
      const swing = -DOOR_SWING * smooth(clamp01((rev - 0.15) / 0.85));
      for (const sl of reverser.sleeves) sl.position.x = slide;
      for (const h of reverser.hinges) h.rotation.y = swing;
      for (const e of reverser.extras) e.visible = rev > 0.02;

      // x-ray: ghost the shells
      const xray = clamp01(s.xray ?? 0);
      if (Math.abs(xray - lastXray) > 0.002) {
        applyXray(xray);
        lastXray = xray;
      }

      // focus and hover: one part stays lit, the rest fall back
      const focus = s.focus ?? null;
      const hover = s.hover ?? null;
      for (const sc of scopeList) {
        // under the low sunset light a deeper dim than this turns the other parts into black shapes
        const dimT = focus ? (sc.id === focus ? 1 : sc.id === hover ? 0.62 : 0.32) : 1;
        const hiT = sc.id === hover && sc.id !== focus ? 1 : 0;
        if (Math.abs(dimT - sc.dim) > 0.002 || Math.abs(hiT - sc.hi) > 0.002) {
          sc.dim += (dimT - sc.dim) * k;
          sc.hi += (hiT - sc.hi) * k;
          if (Math.abs(dimT - sc.dim) <= 0.002) sc.dim = dimT;
          if (Math.abs(hiT - sc.hi) <= 0.002) sc.hi = hiT;
          paintScope(sc);
        }
      }

      // stage glows
      // eased on real time (k = 1 - e^(-12 dt)), a third as fast, so glows also follow a paused scrub
      const gk = 1 - Math.cbrt(1 - k);
      for (const gl of glows) {
        const target = s.stageWeights[gl.key] ?? 0;
        gl.amt += (target - gl.amt) * gk;
        gl.mat.emissiveIntensity = (gl.hot ? s.hot : 1) * (gl.base + gl.amt * gl.max) * gl.scope.dim * emGain;
      }
      plugMat.emissiveIntensity = (0.25 + 0.9 * s.hot) * plugScope.dim * emGain;
    },
  };
  return api;
}

/** Nacelle-only copy for the neighbouring engine on the wing: unclipped, with its own fan. */
export function buildNacelleShell() {
  const g = new THREE.Group();
  const own = (m) => {
    const c = m.clone();
    c.clippingPlanes = null;
    return c;
  };
  // the cowl in two pieces, split where the thrust reverser's sleeve slides back
  const rOut = sampleCurve(NAC_OUTER, SLEEVE_X);
  const rIn = sampleCurve(NAC_INNER, SLEEVE_X);
  const cowl = own(M.cowl);
  const outer = [[0.02, 1.5], [0.1, 1.57], [0.35, 1.63], [0.9, 1.67], [1.5, 1.685], [1.9, 1.68], [3.0, 1.64], [SLEEVE_X, rOut]];
  const inner = [[0.03, 1.455], [0.15, 1.425], [0.6, 1.415], [1.5, 1.43], [1.9, 1.5], [3.0, 1.52], [SLEEVE_X, rIn]];
  g.add(new THREE.Mesh(cylUV(latheX(wallProfile(outer, inner), 96), ...NAC_UV), cowl));
  const sleeve = new THREE.Group();
  sleeve.add(
    new THREE.Mesh(
      cylUV(latheX(wallProfile([[SLEEVE_X, rOut], [4.2, 1.52], [5.2, 1.32], [6.0, 1.14]], [[SLEEVE_X, rIn], [4.2, 1.42], [5.2, 1.25], [6.0, 1.07]]), 96), ...NAC_UV),
      cowl
    )
  );
  g.add(sleeve);
  // what the open sleeve uncovers: the ring of cascade vanes, kept simple at this distance
  const cascade = new THREE.Mesh(
    latheX([[SLEEVE_X, 1.5], [SLEEVE_X, 1.6], [SLEEVE_X + SLEEVE_TRAVEL + 0.04, 1.6], [SLEEVE_X + SLEEVE_TRAVEL + 0.04, 1.5]], 64),
    own(M.steelDark)
  );
  cascade.visible = false;
  g.add(cascade);
  g.userData.setReverse = (rev) => {
    sleeve.position.x = SLEEVE_TRAVEL * rev;
    cascade.visible = rev > 0.02;
  };
  g.add(new THREE.Mesh(new THREE.TorusGeometry(1.485, 0.045, 12, 96).rotateY(PI / 2).translate(0.07, 0, 0), own(M.lip)));
  g.add(new THREE.Mesh(latheX([[1.45, 1.41], [1.1, 1.4], [0.4, 1.4], [0.18, 1.41]], 64), own(M.liner)));
  g.add(new THREE.Mesh(latheX([[1.36, 0.0], [1.36, 1.4]], 48), own(M.duct))); // fan face behind the blades
  const rotor = new THREE.Group();
  const blade = bladeGeometry({
    root: 0.4, tip: 1.385, chordRoot: 0.42, chordTip: 0.7, staggerRoot: 0.5, staggerTip: 1.12,
    thickness: 0.032, sweep: 0.3, camber: 0.04, spanSegs: 6, chordSegs: 5,
  });
  rotor.add(new THREE.Mesh(ringOf(blade, evenAngles(18), 0.98), own(M.fanBlade)));
  const spin = latheX([[0.12, 0.0], [0.2, 0.1], [0.38, 0.22], [0.68, 0.34], [0.95, 0.4], [1.3, 0.42], [1.35, 0.4], [1.35, 0.0]], 48);
  rotor.add(new THREE.Mesh(cylUV(spin, 0.12, 1.35), own(M.spinner)));
  g.add(rotor);
  g.add(new THREE.Mesh(latheX(wallProfile(CORE_COWL, CORE_COWL.map(([x, r]) => [x, r - 0.04])), 64), own(M.coreCowl)));
  g.add(new THREE.Mesh(latheX(wallProfile([[6.5, 0.67], [6.8, 0.6], [7.08, 0.5]], [[6.5, 0.625], [6.8, 0.555], [7.08, 0.465]]), 64), own(M.nozzle)));
  g.add(new THREE.Mesh(latheX([[6.35, 0.0], [6.35, 0.25], [6.8, 0.24], [7.2, 0.14], [7.46, 0.0]], 40), own(M.nozzle)));
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  g.userData.rotor = rotor;
  return g;
}
