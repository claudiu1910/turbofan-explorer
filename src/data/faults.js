// "Find the fault": six things that go wrong with a jet engine, as the pilots would meet them.
// Each one plays as a loop of symptoms. `at(t)` gives the engine's state t seconds into the loop:
//   n1, n2 (%), egt (°C), ff (kg/s), vib         what the display shows
//   flame 0..1, shake 0..1, surge 0..1 (flame out of the inlet), sparks 0..1,
//   fan / lpt (spin rates, 1 = normal), reverse 0..1   what the engine is seen to do
//   warn: [[text, 'amber' | undefined]]           the warning lights
// The numbers are illustrative, like the rest.

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t, a, b) => {
  const u = clamp01((t - a) / (b - a));
  return u * u * (3 - 2 * u);
};
// a bang at time t0: jumps to 1, dies away
const bang = (t, t0, decay = 3.5) => (t < t0 ? 0 : Math.exp(-(t - t0) * decay));

const NORMAL = { n1: 86, n2: 94, egt: 850, ff: 2.3, vib: 0.4, flame: 1, shake: 0, surge: 0, sparks: 0, fan: 1, lpt: 1, reverse: 0, warn: [] };

export const FAULTS = [
  {
    id: 'bird',
    title: 'Bird strike',
    answer: 'fan',
    also: ['inlet'],
    clue: 'A thump from the front, then the whole engine buzzes. Fan speed sags and will not hold steady.',
    explain:
      'A bird went into the fan and bent a blade. The fan is out of balance, so it shakes, and it moves less air, so fan speed and thrust fall. The core behind it is unharmed. Engines are tested to survive exactly this: the pilots throttle it back and land.',
    length: 7,
    at(t) {
      const hit = ease(t, 1.0, 1.25);
      return {
        ...NORMAL,
        n1: 86 - 21 * hit + 3.5 * hit * Math.sin(t * 7.3),
        n2: 94 - 4 * hit,
        egt: 850 - 40 * hit,
        ff: 2.3 - 0.5 * hit,
        vib: 0.4 + 5.2 * hit + 0.5 * hit * Math.sin(t * 11),
        shake: 0.55 * hit + bang(t, 1.0, 4),
        surge: 0.5 * bang(t, 1.0, 6),
        fan: 1 - 0.25 * hit,
        warn: hit > 0.5 ? [['VIBRATION', 'amber'], ['N1 LOW', 'amber']] : [],
      };
    },
  },
  {
    id: 'surge',
    title: 'Compressor surge',
    answer: 'hpc',
    also: ['lpc'],
    clue: 'Loud bangs, like gunshots. Flame shoots out of the front of the engine as well as the back.',
    explain:
      'The airflow through the compressor broke down, and the high-pressure air behind it burst forwards: a surge. Each bang is the flow collapsing and recovering. The exhaust temperature climbs because fuel is still burning with too little air. Easing the throttle back usually lets the flow settle.',
    length: 6.5,
    at(t) {
      const on = ease(t, 0.8, 1.0);
      const b = Math.max(bang(t, 1.0), bang(t, 2.3), bang(t, 3.6), bang(t, 4.9));
      return {
        ...NORMAL,
        n1: 86 - 14 * b * on,
        n2: 94 - 9 * b * on,
        egt: 850 + 120 * on + 60 * b,
        ff: 2.3,
        vib: 0.4 + 2.4 * b,
        shake: b,
        surge: b,
        sparks: 0.5 * b,
        warn: on > 0.5 ? [['ENGINE STALL'], ['EGT', 'amber']] : [],
      };
    },
  },
  {
    id: 'flameout',
    title: 'Flame-out',
    answer: 'combustor',
    clue: 'It goes quiet. The exhaust temperature falls away and both spools wind down, though fuel is still flowing.',
    explain:
      'The flame in the combustor went out, here drowned by heavy rain and hail. With nothing burning there is no hot gas to drive the turbines, so everything slows to a windmill. The pilots switch the igniters on and relight it, much as they started it on the ground.',
    length: 8,
    at(t) {
      const out = ease(t, 1.0, 1.4);
      const down = ease(t, 1.0, 6.5);
      return {
        ...NORMAL,
        n1: lerp(86, 19, down),
        n2: lerp(94, 27, down),
        egt: lerp(850, 240, ease(t, 1.0, 5.5)),
        ff: 2.3 - 1.2 * out,
        vib: 0.4,
        flame: 1 - out,
        fan: lerp(1, 0.25, down),
        lpt: lerp(1, 0.25, down),
        warn: out > 0.5 ? [['ENGINE FAIL']] : [],
      };
    },
  },
  {
    id: 'turbine',
    title: 'Turbine blade failure',
    answer: 'hpt',
    also: ['lpt'],
    clue: 'The exhaust temperature is over the red line and sparks are streaming from the tailpipe. The core is shaking.',
    explain:
      'A blade in the HP turbine cracked and broke up. The damaged turbine takes less energy out of the gas, so the gas leaves hotter and the core slows down; the pieces go out of the back as sparks. This is why turbine blades are inspected with a camera through ports in the casing.',
    length: 7,
    at(t) {
      const hit = ease(t, 1.0, 1.3);
      return {
        ...NORMAL,
        n1: 86 - 9 * hit,
        n2: 94 - 13 * hit + 2 * hit * Math.sin(t * 9),
        egt: 850 + 150 * hit + 12 * hit * Math.sin(t * 5),
        ff: 2.3 + 0.2 * hit,
        vib: 0.4 + 3.9 * hit,
        shake: 0.4 * hit + 0.8 * bang(t, 1.0, 4),
        sparks: hit,
        warn: hit > 0.5 ? [['EGT OVER LIMIT'], ['VIBRATION', 'amber']] : [],
      };
    },
  },
  {
    id: 'shaft',
    title: 'Broken LP shaft',
    answer: 'lpShaft',
    clue: 'The fan slows to a windmill, but the core is running normally. At the back, something is spinning far too fast.',
    explain:
      'The long inner shaft has broken. The gas is still driving the LP turbine, but the turbine is no longer joined to the fan: the fan coasts and the turbine runs away. The engine’s computer cuts the fuel at once, because a turbine disc that bursts from overspeed is the one thing the casing cannot contain.',
    length: 7,
    at(t) {
      const hit = ease(t, 1.0, 1.25);
      const run = ease(t, 1.0, 3.2);
      return {
        ...NORMAL,
        n1: lerp(86, 16, ease(t, 1.0, 4.5)),
        n2: 94 - 3 * hit,
        egt: 850 - 60 * hit,
        ff: 2.3,
        vib: 0.4 + 2.2 * hit,
        shake: 0.25 * hit + bang(t, 1.0, 4),
        fan: lerp(1, 0.2, ease(t, 1.0, 4.5)),
        lpt: 1 + 2.1 * run,
        warn: hit > 0.5 ? [['LP TURBINE OVERSPEED'], ['N1 LOW', 'amber']] : [],
      };
    },
  },
  {
    id: 'reverser',
    title: 'Reverser unlocked',
    answer: 'bypass',
    clue: 'A buffeting from one side, and a warning light. The cowl at the back of the engine is not where it should be.',
    explain:
      'The thrust reverser has come unlocked in flight and its sleeve is creeping open. Fan air is spilling out sideways, which shakes the wing and drags that side back. The engine is brought to idle automatically. Reversers carry three separate locks because of this.',
    length: 7,
    at(t) {
      const open = ease(t, 1.0, 3.0);
      return {
        ...NORMAL,
        n1: lerp(86, 34, ease(t, 1.6, 4.5)),
        n2: lerp(94, 68, ease(t, 1.6, 4.5)),
        egt: lerp(850, 520, ease(t, 1.6, 5)),
        ff: lerp(2.3, 0.6, ease(t, 1.6, 4.5)),
        vib: 0.4 + 1.6 * open,
        shake: 0.3 * open * (0.6 + 0.4 * Math.sin(t * 13)),
        reverse: 0.42 * open + 0.04 * open * Math.sin(t * 3.1),
        warn: open > 0.3 ? [['REVERSER UNLOCKED', 'amber']] : [],
      };
    },
  },
];
