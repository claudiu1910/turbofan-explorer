// A small, deliberately simple model of the engine's numbers.
// Everything here is illustrative: typical of a large airliner turbofan, rounded, and not any
// particular engine. It drives the gauges, the label read-outs, the graph and the ride.

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The standard atmosphere at a height in km: temperature (°C), and pressure and density as
 * fractions of their sea-level values.
 */
export function airAt(km) {
  const h = Math.min(20, Math.max(0, km)) * 1000;
  const T0 = 288.15;
  let T;
  let p;
  if (h <= 11000) {
    T = T0 - 0.0065 * h;
    p = Math.pow(T / T0, 5.2561);
  } else {
    T = 216.65;
    p = 0.22336 * Math.exp(-(h - 11000) / 6341.6);
  }
  return { t: T - 273.15, kelvin: T, p, rho: p / (T / T0) };
}

/**
 * @param {number} throttle 0 = idle, 1 = take-off
 * @param {{jet?: number, reverse?: number, burner?: number, altitude?: number}} [cfg]
 *   jet: 0 turbofan → 1 turbojet. reverse: 0 → 1 deployed. burner: 0 → 1 afterburner lit.
 *   altitude: km above sea level (0 = on the runway, which is what the films assume).
 */
export function engineAt(throttle, { jet = 0, reverse = 0, burner = 0, altitude = 0 } = {}) {
  const th = clamp01(throttle);
  const air = airAt(altitude);
  // thinner air: less to push against, and less fuel needed to do it
  const lapse = Math.pow(air.rho, 0.7);
  // an afterburner only earns its fuel with the engine already near full power
  const wet = clamp01(burner) * clamp01((th - 0.45) / 0.45);
  const n1 = 22 + 78 * Math.pow(th, 0.9); // fan (LP spool) speed, % of maximum
  const n2 = 60 + 40 * Math.pow(th, 0.75); // core (HP spool) speed, %
  const opr = 4 + 36 * th; // overall pressure ratio
  const t3 = air.kelvin * Math.pow(opr, 0.3) - 273; // compressor exit, °C (≈ 600 at 40:1 on a 15 °C day)
  const t4 = 800 + 760 * th; // gas leaving the combustor, °C
  const egt = 430 + 520 * th - 0.8 * (15 - air.t); // exhaust gas temperature, °C
  const fuel = (0.25 + 2.85 * Math.pow(th, 1.35)) * lapse * (1 + 2.4 * wet); // kg/s

  // The same core without its big fan makes well under half the thrust for the same fuel.
  // An afterburner adds about half as much thrust again, for more than three times the fuel.
  const forward = (12 + 308 * Math.pow(th, 1.5)) * lerp(1, 0.42, jet) * lapse * (1 + 0.5 * wet); // kN
  // With the reverser out, the bypass air pushes forwards; only the small core jet still pushes back.
  const thrust = forward * (1 - 1.4 * reverse);

  return {
    throttle: th,
    n1,
    n2,
    n1f: n1 / 100,
    n2f: n2 / 100,
    opr,
    t3,
    t4,
    egt,
    fuel,
    thrust,
    forward,
    burner: wet,
    air,
    bypassRatio: lerp(9, 0, jet),
    // rev/min shown in the info cards scale off these maxima
    fanRpm: 25 * n1,
    coreRpm: 100 * n2,
  };
}

/** Throttle setting whose numbers match the tour's scripted "how hard is it working" value. */
export const CRUISE = 0.75;

// ───────────── along the engine ─────────────
// Stations a parcel of air passes, front to back (engine-local x).
export const STATIONS = [
  { id: 'inlet', x: 0.0, name: 'Inlet', short: 'Inlet' },
  { id: 'fan', x: 1.2, name: 'Fan', short: 'Fan' },
  { id: 'lpc', x: 2.7, name: 'LP compressor', short: 'LP comp.' },
  { id: 'hpc', x: 4.1, name: 'HP compressor', short: 'HP comp.' },
  { id: 'combustor', x: 5.0, name: 'Combustor', short: 'Combustor' },
  { id: 'hpt', x: 5.55, name: 'HP turbine', short: 'HP turb.' },
  { id: 'lpt', x: 6.5, name: 'LP turbine', short: 'LP turb.' },
  { id: 'nozzle', x: 7.3, name: 'Exhaust nozzle', short: 'Nozzle' },
];
export const X_END = 7.3;

// Take-off values at each sample point along the core: pressure (× outside air),
// temperature (°C) and gas speed (m/s). `hot` marks points after the fuel is burned.
const CORE = [
  { x: 0.0, p: 1.0, t: 15, v: 160, hot: 0 },
  { x: 1.2, p: 1.55, t: 55, v: 175, hot: 0 },
  { x: 2.7, p: 2.6, t: 125, v: 170, hot: 0 },
  { x: 4.1, p: 40, t: 598, v: 150, hot: 0 },
  { x: 4.45, p: 39, t: 1250, v: 60, hot: 1 },
  { x: 5.0, p: 38, t: 1560, v: 190, hot: 1 },
  { x: 5.55, p: 9.5, t: 1050, v: 330, hot: 1 },
  { x: 6.5, p: 1.55, t: 640, v: 300, hot: 1 },
  { x: 7.3, p: 1.0, t: 590, v: 470, hot: 1 },
  { x: 9.5, p: 1.0, t: 480, v: 430, hot: 1 },
];
// …and around it, through the bypass duct.
const BYPASS = [
  { x: 0.0, p: 1.0, t: 15, v: 160, hot: 0 },
  { x: 1.2, p: 1.5, t: 52, v: 180, hot: 0 },
  { x: 2.3, p: 1.48, t: 52, v: 170, hot: 0 },
  { x: 5.0, p: 1.44, t: 50, v: 200, hot: 0 },
  { x: 6.0, p: 1.0, t: 22, v: 300, hot: 0 },
  { x: 9.5, p: 1.0, t: 18, v: 280, hot: 0 },
];
// The largest value each quantity reaches at take-off, per path: the graph draws each curve
// against its own peak, so the gentle bypass numbers are not flattened by the core's.
export const PEAK = {
  core: { p: 40, t: 1560, v: 470 },
  bypass: { p: 1.5, t: 52, v: 300 },
};
export const AMBIENT = { p: 1, t: 15, v: 0 };

function scalePoint(pt, e) {
  // pressure follows the overall pressure ratio; temperature follows the compressor exit
  // before the flame and the combustor exit after it; speed follows the throttle.
  const p = 1 + ((pt.p - 1) * (e.opr - 1)) / 39;
  const g = pt.hot ? (e.t4 - 15) / (1560 - 15) : (e.t3 - 15) / (598 - 15);
  const t = 15 + (pt.t - 15) * g;
  const v = pt.v * (0.4 + 0.6 * Math.pow(e.throttle, 0.8));
  return { x: pt.x, p, t, v };
}

/** The whole curve, for the graph. */
export function profile(e, path = 'core') {
  return (path === 'bypass' ? BYPASS : CORE).map((pt) => scalePoint(pt, e));
}

/** Values at one point along the path, for the ride read-out. */
export function profileAt(x, e, path = 'core') {
  const pts = path === 'bypass' ? BYPASS : CORE;
  if (x <= pts[0].x) return scalePoint(pts[0], e);
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i].x) {
      const a = scalePoint(pts[i - 1], e);
      const b = scalePoint(pts[i], e);
      const u = (x - pts[i - 1].x) / (pts[i].x - pts[i - 1].x);
      return { x, p: lerp(a.p, b.p, u), t: lerp(a.t, b.t, u), v: lerp(a.v, b.v, u) };
    }
  }
  return scalePoint(pts[pts.length - 1], e);
}

/** Which station a point along the axis belongs to. */
export function stationAt(x, path = 'core') {
  if (path === 'bypass') {
    if (x < 0.2) return { id: 'inlet', name: 'Inlet' };
    if (x < 1.5) return { id: 'fan', name: 'Fan' };
    if (x < 6.0) return { id: 'bypass', name: 'Bypass duct' };
    return { id: 'jet', name: 'Out the back' };
  }
  if (x < 0.2) return { id: 'inlet', name: 'Inlet' };
  for (const s of STATIONS.slice(1)) if (x <= s.x) return s;
  return { id: 'jet', name: 'Out the back' };
}
