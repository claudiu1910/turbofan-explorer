// Look-dev palette: the single source of the material values.
// materials.js builds the three.js materials from it; the look-study page draws its swatches from it.
// Colours are sRGB hex (three converts them to linear). Roughness and metalness are the mean values;
// textured materials carry a roughness map that varies about this mean (see livery.js).

export const FAMILIES = [
  {
    id: 'paint',
    name: 'Painted skin',
    items: [
      { key: 'paint', name: 'Gloss white topcoat', use: 'Fuselage, nacelle cowls, pylon, fairings', color: '#e9eae6', roughness: 0.36, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.12, maps: 'Livery colour, panel-line bump, roughness variation' },
      { key: 'wingGrey', name: 'Wing and tailplane grey', use: 'Wing box, flaps, stabilisers, flap-track fairings', color: '#b4b9bf', roughness: 0.5, metalness: 0, maps: 'Panel lines, roughness variation' },
      { key: 'coreCowl', name: 'Core cowl grey', use: 'Core cowl and inner fixed structure', color: '#8e9399', roughness: 0.48, metalness: 0 },
      { key: 'spinner', name: 'Spinner, gloss graphite', use: 'Spinner (white swirl from livery/spinner.svg)', color: '#2b2d32', roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.08, maps: 'Swirl' },
      { key: 'indigo', name: 'Livery indigo', use: 'Tail, aft sweep, cheatline, nacelle band', color: '#232a5c', roughness: 0.36, metalness: 0, texture: true },
      { key: 'accent', name: 'Livery orange', use: 'Pinstripes, tail mark', color: '#f0922c', roughness: 0.36, metalness: 0, texture: true },
      { key: 'red', name: 'Warning red', use: 'Inlet chevrons, danger placards', color: '#c62d2d', roughness: 0.4, metalness: 0, texture: true },
    ],
  },
  {
    id: 'alu',
    name: 'Bare aluminium',
    items: [
      { key: 'lip', name: 'Inlet lip, polished', use: 'Nacelle lip ring (anti-ice skin)', color: '#e4e6e9', roughness: 0.14, metalness: 1 },
      { key: 'wingLE', name: 'Leading edge, brushed', use: 'Wing leading-edge strip', color: '#c9cdd2', roughness: 0.3, metalness: 1 },
    ],
  },
  {
    id: 'ti',
    name: 'Titanium',
    items: [
      { key: 'fanBlade', name: 'Fan blades, machined', use: 'Fan (glows blue during Suck)', color: '#bdb7ad', roughness: 0.26, metalness: 1 },
      { key: 'compressor', name: 'Compressor rotors', use: 'LP and HP compressor blades, bright trim', color: '#b1b3b6', roughness: 0.3, metalness: 1 },
    ],
  },
  {
    id: 'hot',
    name: 'Hot-section alloys',
    items: [
      { key: 'hot', name: 'Nickel superalloy', use: 'Combustor liner, turbine blades (heat glow #ff6a1a on top)', color: '#6b5b4f', roughness: 0.48, metalness: 1 },
      { key: 'nozzle', name: 'Heat-tinted Inconel', use: 'Exhaust nozzle and plug', color: '#8a837a', roughness: 0.4, metalness: 1 },
      { key: 'casing', name: 'Core casing steel', use: 'Compressor, combustor and turbine casings', color: '#6c7178', roughness: 0.42, metalness: 1 },
      { key: 'steelDark', name: 'Discs and drums', use: 'Rotor drums, discs, struts, blocker doors', color: '#5b5f66', roughness: 0.38, metalness: 1 },
    ],
  },
  {
    id: 'comp',
    name: 'Composites',
    items: [
      { key: 'liner', name: 'Acoustic liner', use: 'Inlet throat, perforated face sheet', color: '#777b80', roughness: 0.82, metalness: 0 },
      { key: 'duct', name: 'Bypass duct panels', use: 'Fan duct lining, fan face', color: '#61666d', roughness: 0.7, metalness: 0 },
      { key: 'ogv', name: 'Outlet guide vanes, painted', use: 'OGVs, fuel injectors', color: '#c8cac8', roughness: 0.55, metalness: 0 },
    ],
  },
  {
    id: 'glass',
    name: 'Glazing',
    items: [
      { key: 'glass', name: 'Cabin window', use: 'Passenger windows (geometry), ior 1.5', color: '#0c1015', roughness: 0.04, metalness: 0 },
    ],
  },
  {
    id: 'diagram',
    name: 'Diagram codes, kept',
    items: [
      { key: 'cutFace', name: 'Section face', use: 'Every clipped wall (unlit, drawn after AO)', color: '#f0922c', unlit: true },
      { key: 'cutFaceHot', name: 'Hot section face', use: 'Plug and HP shaft sections', color: '#ffb25a', unlit: true },
      { key: 'bronze', name: 'Stator vanes', use: 'Stators read apart from rotors', color: '#b4834c', roughness: 0.36, metalness: 1 },
      { key: 'lpShaft', name: 'LP shaft', use: 'Emissive #25b6f0 × 0.9', color: '#2fb8e6', roughness: 0.3, metalness: 0.2, emissive: '#25b6f0', emissiveIntensity: 0.9 },
      { key: 'hpShaft', name: 'HP shaft', use: 'Emissive #e8841a × 0.25', color: '#d98a2b', roughness: 0.35, metalness: 0.5, emissive: '#e8841a', emissiveIntensity: 0.25 },
    ],
  },
];

export const P = Object.fromEntries(FAMILIES.flatMap((f) => f.items.map((i) => [i.key, i])));
