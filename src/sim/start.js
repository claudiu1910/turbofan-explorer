// Starting a turbofan, as a small simulation. Illustrative, like the rest of the numbers:
// the shape of a real start, with the timing squeezed to a few seconds.
//
// How a start goes: compressed air spins a small turbine (the starter) geared to the core, the
// core (N2) winds up, at about a fifth of full speed the igniters and the fuel come on, the flame
// lights and the exhaust temperature (EGT) jumps, the core accelerates with the starter still
// helping, and at about half speed the starter lets go: the engine now drives itself up to idle.
//
// What goes wrong if the order is wrong:
//   hot      fuel lit with too little air going through: EGT runs past its limit
//   wet      fuel with no spark: it pools in the engine and nothing lights
//   torch    … and lighting that pool afterwards
//   hung     starter released too early: the core cannot speed itself up and stalls below idle
//   starter  starter left engaged at speed: it is driven faster than it was built for

export const START = {
  egtLimit: 725, // °C, the start limit
  fuelAt: 20, // % N2: enough air for a safe light-off
  starterOff: 50, // % N2: the engine can drive itself from here
  idleN2: 60,
  idleN1: 21,
  selfSustain: 43,
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const FAILS = {
  hot: {
    title: 'Hot start',
    text: 'The fuel was lit with too little air flowing through the core, so the exhaust temperature ran past its limit. Wait for about 20 % N2 before the fuel goes on.',
  },
  wet: {
    title: 'Wet start',
    text: 'Fuel was sprayed in with no spark to light it, and it pooled inside the engine. Ignition goes on before, or with, the fuel.',
  },
  torch: {
    title: 'Torching start',
    text: 'Pooled fuel lit all at once: a sheet of flame out of the tailpipe and a temperature spike. Ignition goes on before the fuel, not after.',
  },
  hung: {
    title: 'Hung start',
    text: 'The starter was released before the engine could drive itself. The core stalled below idle with the temperature creeping up. Keep the starter on to about 50 % N2.',
  },
  starter: {
    title: 'Starter overspeed',
    text: 'The starter was left engaged with the engine running: it was being driven faster than it is built for. Release it at about 50 % N2.',
  },
};

export function createStartSim() {
  const s = {
    t: 0,
    n2: 0,
    n1: 0,
    egt: 20,
    ff: 0,
    bleed: false,
    starter: false,
    ign: false,
    fuel: false,
    lit: false,
    pool: 0, // seconds' worth of unburnt fuel lying in the engine
    spark: 0,
    surge: 0, // extra heat from lighting pooled fuel, decaying
    torch: 0, // 0..1, the flash out of the tailpipe
    over: 0,
    hung: 0,
    hot: 0,
    stable: 0,
    peakEgt: 20,
    state: 'running', // 'running' | 'done' | 'failed'
    fail: null,
  };

  const failWith = (id) => {
    s.state = 'failed';
    s.fail = id;
  };

  return {
    s,
    set(name, on) {
      if (s.state !== 'running' || !(name in s)) return;
      s[name] = on;
    },
    /** What to do next, for the coach. */
    get advice() {
      if (s.state === 'done') return 'done';
      if (s.state === 'failed') return 'failed';
      if (!s.bleed) return 'bleed';
      if (!s.starter && !s.lit) return 'starter';
      if (!s.lit && s.n2 < START.fuelAt) return 'wait';
      if (!s.lit && !s.ign) return 'ign';
      if (!s.lit && !s.fuel) return 'fuel';
      if (!s.lit) return 'light';
      if (s.n2 < START.starterOff) return 'spool';
      if (s.starter) return 'release';
      return 'settle';
    },
    step(dt) {
      if (s.state !== 'running') {
        // let things wind down on screen
        s.torch = Math.max(0, s.torch - dt * 1.2);
        if (s.state === 'failed') {
          s.n2 = Math.max(0, s.n2 - dt * 4);
          s.n1 = Math.max(0, s.n1 - dt * 2);
          s.egt += (120 - s.egt) * Math.min(1, dt * 0.5);
          s.ff = 0;
        }
        return;
      }
      s.t += dt;
      const cranking = s.bleed && s.starter;

      // ── flame ──
      if (!s.fuel) {
        s.lit = false;
        s.pool = Math.max(0, s.pool - dt * 0.6);
        s.spark = 0;
      } else if (!s.lit) {
        s.pool += dt;
        if (s.ign && s.n2 > 8) {
          s.spark += dt;
          if (s.spark > 0.7) {
            s.lit = true;
            if (s.pool > 2.6) {
              // a puddle of fuel going up at once
              s.surge = 110 * Math.min(4, s.pool);
              s.torch = 1;
              failWith('torch');
            }
            s.pool = 0;
          }
        } else s.spark = 0;
        if (s.pool > 5.5) failWith('wet');
      }

      // ── core speed ──
      let dn2;
      if (s.lit && s.n2 >= START.selfSustain) {
        dn2 = (START.idleN2 - s.n2) * 0.5 + (cranking ? 1.5 : 0);
      } else {
        const starter = cranking ? 9 * Math.max(0, 1 - s.n2 / 52) : 0;
        const burn = s.lit ? 0.13 * s.n2 : 0;
        const drag = s.n2 > 0.01 ? 1.3 + 0.1 * s.n2 : 0;
        dn2 = starter + burn - drag;
      }
      s.n2 = clamp(s.n2 + dn2 * dt, 0, 100);

      // ── fan speed, fuel flow ──
      const n1Target = s.lit ? Math.max(0, s.n2 - 18) * 0.5 : s.n2 * 0.1;
      s.n1 += (n1Target - s.n1) * Math.min(1, dt / 1.4);
      s.ff = s.fuel ? 0.07 + 0.003 * s.n2 : 0;

      // ── exhaust temperature: hot when there is little air for the fuel ──
      s.surge = Math.max(0, s.surge - dt * 60);
      let target = 20 + 0.6 * s.n2; // spinning, not burning: barely warm
      if (s.lit) target = 430 + 380 * Math.pow(Math.max(0, 60 - s.n2) / 38, 3) + s.surge;
      const tau = target > s.egt ? 0.6 : 2.6;
      s.egt += (target - s.egt) * Math.min(1, dt / tau);
      s.peakEgt = Math.max(s.peakEgt, s.egt);
      s.torch = Math.max(0, s.torch - dt * 0.9);

      // ── limits ──
      s.hot = s.egt > START.egtLimit ? s.hot + dt : 0;
      if (s.hot > 0.35 && s.state === 'running') failWith('hot');
      s.hung = s.lit && !cranking && s.n2 < START.selfSustain ? s.hung + dt : 0;
      if (s.hung > 3.5 && s.state === 'running') failWith('hung');
      s.over = s.starter && s.n2 > 56 ? s.over + dt : 0;
      if (s.over > 2.5 && s.state === 'running') failWith('starter');

      // ── success: idling on its own ──
      s.stable = s.lit && !s.starter && s.n2 > START.idleN2 - 2 ? s.stable + dt : 0;
      if (s.stable > 1.2 && s.state === 'running') s.state = 'done';
    },
  };
}
