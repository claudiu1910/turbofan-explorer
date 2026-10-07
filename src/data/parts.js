// What the info card says about each part, in the order the air meets them.
// Figures are typical of a large airliner engine and rounded; they are not one specific engine.
//
// `part`/`at`  : where the camera looks (engine-local point, riding on that part group)
// `cam`        : camera offset from that point
// `station`    : which band lights up on the graph
// `phase`      : which of suck / squeeze / bang / blow it belongs to
// `inside`     : true if you have to cut the engine open to see it

export const PARTS = [
  {
    id: 'inlet',
    name: 'Inlet cowl',
    tagline: 'guides air smoothly into the engine',
    what:
      'The smooth ring at the very front. It steadies the incoming air so the fan gets an even flow, whatever the angle of the wind. Its perforated lining soaks up fan noise.',
    stats: [
      ['Air swallowed', 'over 1 tonne a second at take-off'],
      ['Outer diameter', '≈ 3.4 m'],
      ['Front lip', 'heated to stop ice forming'],
    ],
    madeOf: 'Aluminium and carbon-fibre composite, with a honeycomb sound-absorbing lining.',
    part: 'fanCowl', at: [0.5, 0, 0], cam: [-4.8, 0.9, 4.8],
    station: 'inlet', phase: 'suck', inside: false,
  },
  {
    id: 'fan',
    name: 'Fan',
    tagline: 'pulls in the air and makes most of the thrust',
    what:
      'One ring of big, twisted blades. It works like a propeller inside a tube, pushing a huge mass of air backwards. About nine-tenths of that air never enters the core: it goes straight out of the back as thrust.',
    stats: [
      ['Diameter', '≈ 3 m'],
      ['Speed', '≈ 2,500 rpm at take-off'],
      ['Blade tips', '≈ 400 m/s, faster than sound'],
      ['Pressure rise', '≈ 1.5 ×'],
    ],
    madeOf: 'Titanium, or carbon-fibre composite with titanium leading edges.',
    part: 'fan', at: [0.95, 0, 0], cam: [-4.2, 0.7, 4.2],
    station: 'fan', phase: 'suck', inside: false,
  },
  {
    id: 'bypass',
    name: 'Bypass duct',
    tagline: 'lets most of the air go around the core',
    what:
      'The wide channel around the core. Air from the fan runs straight through it and out of the back, cool and fairly slow. On a modern engine this stream makes most of the thrust, and it wraps the hot core jet in quieter air.',
    stats: [
      ['Bypass ratio', '≈ 9 : 1'],
      ['Share of thrust', '≈ 80 %'],
      ['Air temperature', '≈ 50 °C'],
    ],
    madeOf:
      'Composite and aluminium panels. Fixed vanes behind the fan straighten the swirling air, and the rear section slides back as the thrust reverser.',
    part: 'bypassTop', at: [3.4, 0.9, 0], cam: [-0.8, 1.3, 6.8],
    station: 'fan', phase: 'suck', inside: false,
  },
  {
    id: 'lpc',
    name: 'LP compressor',
    tagline: 'gives the core air its first, gentle squeeze',
    what:
      'The first squeeze. A few rings of small blades, on the same shaft as the fan, start compressing the air that enters the core before it reaches the main compressor.',
    stats: [
      ['Stages', '3 to 4'],
      ['Pressure rise', '≈ 2 ×'],
      ['Speed', 'same as the fan'],
    ],
    madeOf: 'Titanium alloy blades and discs.',
    part: 'lpCompressor', at: [2.1, 0.0, 0], cam: [-0.4, 0.9, 4.6],
    station: 'lpc', phase: 'squeeze', inside: true,
  },
  {
    id: 'hpc',
    name: 'HP compressor',
    tagline: 'squeezes the air about 40 times',
    what:
      'The main squeeze. Each ring of spinning blades throws air into a ring of fixed vanes, which slow it down and raise its pressure. Ring after ring, the air ends up packed about 40 times tighter than outside, and hot from being squeezed.',
    stats: [
      ['Stages', '≈ 10'],
      ['Overall pressure', '≈ 40 : 1'],
      ['Exit temperature', '≈ 600 °C'],
      ['Speed', '≈ 10,000 rpm'],
    ],
    madeOf: 'Titanium at the cooler front, nickel alloys at the hot rear.',
    part: 'hpCompressor', at: [3.4, 0.0, 0], cam: [-0.3, 0.9, 4.8],
    station: 'hpc', phase: 'squeeze', inside: true,
  },
  {
    id: 'combustor',
    name: 'Combustor',
    tagline: 'burns the fuel',
    what:
      'A ring-shaped chamber where fuel is sprayed into the compressed air and burns without stopping, like a blowtorch that never goes out. Only part of the air burns. The rest runs along the walls to stop them melting, then mixes in to cool the gas for the turbine.',
    stats: [
      ['Flame', '≈ 2,000 °C'],
      ['Gas leaving', 'over 1,500 °C'],
      ['Fuel at take-off', '≈ 3 kg a second'],
    ],
    madeOf: 'Nickel and cobalt superalloys with a ceramic heat-shield coating and thousands of cooling holes.',
    part: 'combustor', at: [4.55, 0.0, 0], cam: [0.0, 0.8, 4.2],
    station: 'combustor', phase: 'bang', inside: true,
  },
  {
    id: 'hpt',
    name: 'HP turbine',
    tagline: 'is spun by the hottest gas and drives the HP compressor',
    what:
      'The first turbine the hot gas hits. The gas spins it, and it drives the HP compressor through the outer shaft. The gas here is hotter than the melting point of the blades. They survive because cooling air flows through channels inside each blade and out over its surface.',
    stats: [
      ['Gas temperature', 'over 1,500 °C'],
      ['Blade alloy melts at', '≈ 1,300 °C'],
      ['Speed', '≈ 10,000 rpm'],
    ],
    madeOf: 'Single-crystal nickel superalloy with a ceramic thermal coating.',
    part: 'hpTurbine', at: [5.28, 0.0, 0], cam: [0.2, 0.8, 4.0],
    station: 'hpt', phase: 'blow', inside: true,
  },
  {
    id: 'lpt',
    name: 'LP turbine',
    tagline: 'spins the big fan at the front',
    what:
      'Several larger, slower turbine stages. They take most of the energy still left in the gas and send it forward along the inner shaft to turn the fan. This is where the fan gets its power.',
    stats: [
      ['Stages', '4 to 7'],
      ['Gas cools', '≈ 1,000 → 600 °C'],
      ['Speed', 'same as the fan'],
    ],
    madeOf: 'Nickel alloys. Some newer engines use lightweight titanium aluminide at the rear.',
    part: 'lpTurbine', at: [6.0, 0.0, 0], cam: [0.4, 0.9, 4.8],
    station: 'lpt', phase: 'blow', inside: true,
  },
  {
    id: 'nozzle',
    name: 'Exhaust nozzle',
    tagline: 'speeds the hot gas up into a jet',
    what:
      'The narrowing outlet of the core. It speeds the hot gas up into a jet. On a big-fan engine this hot jet is the smaller share of the thrust, around a fifth.',
    stats: [
      ['Jet speed', '≈ 450 m/s'],
      ['Gas temperature', '≈ 600 °C'],
      ['Share of thrust', '≈ 20 %'],
    ],
    madeOf: 'Heat-resistant nickel alloy or titanium, with a cone-shaped plug in the centre.',
    part: 'lpTurbine', at: [7.0, 0, 0], cam: [3.2, 1.0, 4.6],
    station: 'nozzle', phase: 'blow', inside: false,
  },
  {
    id: 'lpShaft',
    name: 'LP shaft',
    tagline: 'links the turbine at the back to the fan at the front',
    what:
      'The long inner shaft. It runs the full length of the core, joining the LP turbine at the back to the fan and LP compressor at the front.',
    stats: [
      ['Speed', '≈ 2,500 rpm'],
      ['Power carried', 'tens of megawatts'],
    ],
    madeOf: 'High-strength steel.',
    part: 'shafts', at: [3.7, 0, 0], cam: [0.0, 0.9, 7.6],
    station: null, phase: null, inside: true,
  },
  {
    id: 'hpShaft',
    name: 'HP shaft',
    tagline: 'links the HP turbine to the HP compressor',
    what:
      'The short, hollow outer shaft. It joins the HP turbine to the HP compressor and spins about four times faster than the inner shaft passing through it. The two turn independently, each at its own best speed.',
    stats: [
      ['Speed', '≈ 10,000 rpm'],
      ['Compared with the LP shaft', '≈ 4 × faster'],
    ],
    madeOf: 'Steel and nickel alloy.',
    part: 'shafts', at: [4.1, 0, 0], cam: [0.0, 0.8, 5.8],
    station: null, phase: null, inside: true,
  },
];

export const PART_BY_ID = Object.fromEntries(PARTS.map((p) => [p.id, p]));

// "Click the part that…" Each answer is a part id; `also` lists answers that count as right too.
export const QUIZ = [
  { ask: 'pulls in the air and makes most of the thrust', answer: 'fan' },
  { ask: 'squeezes the air about 40 times', answer: 'hpc', also: ['lpc'] },
  { ask: 'burns the fuel', answer: 'combustor' },
  { ask: 'is spun by the hottest gas and drives the HP compressor', answer: 'hpt' },
  { ask: 'spins the big fan at the front', answer: 'lpt' },
  { ask: 'lets most of the air go around the core', answer: 'bypass' },
  { ask: 'links the turbine at the back to the fan at the front', answer: 'lpShaft' },
  { ask: 'speeds the hot gas up into a jet', answer: 'nozzle' },
  { ask: 'guides air smoothly into the engine', answer: 'inlet' },
  { ask: 'gives the core air its first, gentle squeeze', answer: 'lpc' },
];

// The quiz comes in three rounds. Each prompt is completed as "Click the part <lead> <ask>."
export const QUIZ_ROUNDS = {
  jobs: { name: 'Jobs', lead: 'that', list: QUIZ },
  materials: {
    name: 'Materials',
    lead: '',
    list: [
      { ask: 'with the biggest blades in the engine, made of titanium or carbon fibre', answer: 'fan' },
      { ask: 'whose blades are each a single crystal of nickel alloy, hollow, with cooling air inside', answer: 'hpt' },
      { ask: 'lined with a ceramic heat shield and pierced by thousands of cooling holes', answer: 'combustor' },
      { ask: 'that is one long piece of high-strength steel', answer: 'lpShaft' },
      { ask: 'built of titanium at its cool front and nickel alloys at its hot rear', answer: 'hpc' },
      { ask: 'with a honeycomb lining that soaks up noise, and a heated front lip', answer: 'inlet' },
      { ask: 'made of composite panels, with a rear section that slides back', answer: 'bypass' },
      { ask: 'where some newer engines use lightweight titanium aluminide blades', answer: 'lpt' },
    ],
  },
  numbers: {
    name: 'Numbers',
    lead: '',
    list: [
      { ask: 'where the gas is hottest, around 2,000 °C in the flame', answer: 'combustor' },
      { ask: 'where the pressure reaches about 40 times the outside air', answer: 'hpc', also: ['combustor'] },
      { ask: 'whose blade tips move faster than sound', answer: 'fan' },
      { ask: 'that carries about nine-tenths of the air', answer: 'bypass', also: ['fan'] },
      { ask: 'that turns at about 10,000 rpm, four times faster than the shaft inside it', answer: 'hpShaft', also: ['hpc', 'hpt'] },
      { ask: 'where the gas leaves at about 450 m/s', answer: 'nozzle' },
      { ask: 'that swallows over a tonne of air a second', answer: 'inlet', also: ['fan'] },
      { ask: 'where the gas cools from about 1,000 to 600 °C as it drives the fan', answer: 'lpt' },
    ],
  },
};

// "Build the engine": the pieces you drag, with the stretch of the axis each one occupies.
export const ASSEMBLY = [
  { part: 'fanCowl', id: 'inlet', span: [0.0, 1.9] },
  { part: 'fan', id: 'fan', span: [0.12, 1.35] },
  { part: 'lpCompressor', id: 'lpc', span: [1.5, 2.7] },
  { part: 'hpCompressor', id: 'hpc', span: [2.7, 4.1] },
  { part: 'combustor', id: 'combustor', span: [4.1, 5.0] },
  { part: 'hpTurbine', id: 'hpt', span: [5.0, 5.55] },
  { part: 'lpTurbine', id: 'lpt', span: [5.55, 7.46] },
];

// The harder build adds the two halves of the bypass duct. They are too big for the tray, so
// they wait above the engine (`park` is the offset they start from).
export const ASSEMBLY_HARD = [
  ...ASSEMBLY,
  { part: 'bypassTop', id: 'bypass', span: [1.9, 6.0], name: 'Bypass duct, top half', park: [-4.6, 3.1, 0] },
  { part: 'bypassBottom', id: 'bypass', span: [1.9, 6.0], name: 'Bypass duct, bottom half', park: [3.9, 4.9, 0] },
];

// The turbojet / turbofan comparison (rough, for the same thrust).
export const COMPARE = {
  title: 'Why fans grew',
  body:
    'Thrust is the mass of air you move times how much you speed it up. A turbojet throws a little air very fast. A turbofan pushes a lot of air gently. The push is the same, but far less energy is wasted in the jet, and it is much quieter.',
  rows: [
    { k: 'Air moved', jet: 1, fan: 10, jetText: '1 ×', fanText: '≈ 10 ×' },
    { k: 'Exhaust speed', jet: 2.2, fan: 1, jetText: '≈ 2 × faster', fanText: 'slower' },
    { k: 'Fuel for the same thrust', jet: 2.2, fan: 1, jetText: '≈ 2 ×', fanText: '1 ×' },
    { k: 'Noise', jet: 3, fan: 1, jetText: 'very loud', fanText: 'much quieter' },
  ],
  note: 'Rough comparison at take-off, same thrust.',
};
