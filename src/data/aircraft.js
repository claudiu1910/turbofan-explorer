// What the details card says about the rest of the aircraft: the things the engines power.
// Figures are typical of a large airliner and rounded; they are not one specific aircraft.
// `poweredBy` takes the place of the engine parts' "made of" line.

export const AIRCRAFT_PARTS = [
  {
    id: 'cabinAir',
    name: 'Cabin air',
    what:
      'At cruising height the outside air is too thin to breathe and bitterly cold. So air is taken, or "bled", from the engines’ compressors, already squeezed and hot. Air-conditioning packs in the belly cool it, it is mixed with filtered cabin air, and it flows in along the ceiling and out at floor level. A valve at the back lets air out at just the rate that holds the pressure.',
    stats: [
      ['Bleed air', '≈ 200 °C as it leaves the engine'],
      ['Cabin pressure', 'like standing at ≈ 2,000 m'],
      ['All the air replaced', 'every 2 to 3 minutes'],
      ['Outside at cruise', '≈ −55 °C, a quarter of sea-level pressure'],
    ],
    poweredBy: 'Compressed air bled from the engines. The Boeing 787 is the exception: it uses electric compressors instead.',
  },
  {
    id: 'fuselage',
    name: 'Pressure cabin',
    what:
      'The fuselage is a pressure vessel: a thin tube of aluminium or carbon fibre, with a hoop frame every half metre and stringers running along it. In cruise the air inside pushes outwards with about six tonnes on every square metre of skin. Under the passenger floor is the hold, for baggage and cargo containers.',
    stats: [
      ['Skin thickness', '≈ 2 mm of aluminium'],
      ['Pressure difference', '≈ 0.6 bar'],
      ['Seats across, here', '10 (3-4-3)'],
    ],
    poweredBy: 'Kept inflated by the same bleed air you breathe.',
  },
  {
    id: 'gear',
    name: 'Landing gear',
    what:
      'Three legs carry the whole aircraft. The two main legs under the wing roots take about nine-tenths of the weight; the nose leg steers. Each leg is a shock absorber, a cylinder of oil and nitrogen that soaks up the touchdown. In flight they fold away behind doors to keep the airflow clean.',
    stats: [
      ['Wheels', '10: two on the nose, eight on the mains'],
      ['Touchdown speed', '≈ 260 km/h'],
      ['Time to extend', '≈ 15 seconds'],
      ['Brakes', 'carbon discs, can pass 500 °C'],
    ],
    poweredBy: 'Hydraulic pressure from pumps driven by the engines. If that fails, the legs can be released to fall under their own weight.',
  },
  {
    id: 'flaps',
    name: 'Slats and flaps',
    what:
      'A wing shaped to cruise at 900 km/h cannot hold the aircraft up at landing speed. So it changes shape: slats slide forward from the leading edge, flaps slide back and down from the trailing edge, and the wing becomes bigger and more curved. The gaps they open let air through, which keeps the flow stuck to the wing.',
    stats: [
      ['Extra lift', 'up to ≈ 80 %'],
      ['Landing without them', '≈ 100 km/h faster'],
      ['Flap angle for landing', '≈ 30 to 35°'],
    ],
    poweredBy: 'Hydraulic motors, or electric ones on newer aircraft. Either way the power comes from the engines.',
  },
  {
    id: 'spoilers',
    name: 'Spoilers',
    what:
      'Panels on top of the wing that flip up the moment the wheels touch. They break up the airflow so the wing stops lifting. That puts the weight onto the wheels, where the brakes can use it, and adds drag. In flight a few of them also help the aircraft roll and slow down.',
    stats: [
      ['Lift lost', 'most of it, within a second'],
      ['Angle', 'up to ≈ 50°'],
      ['Panels', '10 on each wing, here'],
    ],
    poweredBy: 'Hydraulic jacks.',
  },
  {
    id: 'reverser',
    name: 'Thrust reversers',
    what:
      'The back half of each engine cowl slides rearwards. Doors inside swing shut across the bypass duct, and the fan air escapes sideways through angled vanes, thrown forwards. The hot core jet still pushes back, but the big fan stream now pushes against the motion.',
    stats: [
      ['Share of the stopping', '≈ 10 to 20 % on a dry runway, more on a wet one'],
      ['Used above', '≈ 110 km/h'],
      ['Air that is turned', 'the bypass stream only'],
    ],
    poweredBy: 'Hydraulic or electric actuators open them. The push itself is the engine’s own.',
  },
  {
    id: 'hydraulic',
    name: 'Hydraulics',
    what:
      'The muscle of the aircraft. Each engine turns a pump through the gearbox on its side, and the pumps keep oil under enormous pressure in three separate circuits. That pressure moves the landing gear, the flaps, the spoilers, the brakes and the flight controls. Three circuits mean that losing one, or two, still leaves the aircraft flyable.',
    stats: [
      ['Pressure', '≈ 200 bar (3,000 psi)'],
      ['Separate circuits', '3'],
      ['Moves', 'gear, flaps, spoilers, brakes, controls'],
    ],
    poweredBy: 'Pumps driven by the engines, with electric pumps and a wind-driven turbine as back-up.',
  },
  {
    id: 'electric',
    name: 'Electricity',
    what:
      'Each engine also turns a generator. Between them they supply everything from the flight computers and the cockpit displays to the galley ovens and the reading lights. On the ground, and as a back-up in the air, a small extra turbine in the tail (the APU) can do the same job.',
    stats: [
      ['Each generator', '≈ 90 kVA, enough for a street of houses'],
      ['Supply', '115 volts at 400 Hz'],
      ['Back-ups', 'the APU, batteries, a wind-driven turbine'],
    ],
    poweredBy: 'Generators on the engines’ gearboxes.',
  },
  {
    id: 'cockpit',
    name: 'Flight deck',
    what:
      'From here the engines are four thrust levers and a column of numbers. A lever does not open a fuel tap directly: it asks that engine’s computer for a thrust, and the computer works out the fuel. The pilots watch fan speed (N1), exhaust temperature (EGT), core speed (N2) and fuel flow.',
    stats: [
      ['Thrust levers', 'one for each engine'],
      ['Main thrust reading', 'N1, the fan speed'],
      ['Limit watched most', 'EGT, the exhaust temperature'],
    ],
    poweredBy: 'Electricity from the engines’ generators.',
  },
];

export const AIRCRAFT_PART_BY_ID = Object.fromEntries(AIRCRAFT_PARTS.map((p) => [p.id, p]));

// Camera homes (world space) for the Aircraft mode's four views.
export const AIRCRAFT_VIEWS = {
  overview: { pos: [-56, 13, 40], target: [-1, 2.5, -12], fov: 36 },
  wing: { pos: [-20, 3.2, 31], target: [3, 0.8, -8], fov: 38 },
  cabin: { pos: [-30, 10.5, 5], target: [-13.5, 3.2, -12.5], fov: 36 },
  cockpit: { pos: [-0.4, 1.2, 8.4], target: [0.5, -0.5, 0], fov: 40 },
};

// Markers on the whole-aircraft view. `at` is in aircraft coordinates.
export const HOTSPOTS = [
  { id: 'engine', label: 'Engine', at: [-2.6, 0.2, 1.7], go: 'explore' },
  { id: 'wing', label: 'Wing and wheels', at: [9.5, 3.7, 6.5], view: 'wing' },
  { id: 'cabin', label: 'Cabin', at: [-13.5, 7.0, -12.4], view: 'cabin' },
  { id: 'cockpit', label: 'Flight deck', at: [-24.4, 5.7, -12.6], view: 'cockpit' },
];
