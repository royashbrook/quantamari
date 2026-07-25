export type Confidence = "MEASURED" | "SUPPORTED MODEL" | "UNKNOWN" | "SPECULATIVE";
export type Realm = "prephysical" | "particle" | "matter" | "macroscopic" | "cosmic" | "speculative";
export type Shape =
  | "bubble" | "spark" | "quark" | "hadron" | "atom" | "molecule"
  | "virus" | "cell" | "fiber" | "dust" | "stone" | "object"
  | "chair" | "car" | "house" | "mountain" | "planet" | "star"
  | "system" | "galaxy" | "universe";

export type Curio = {
  name: string;
  shape: Shape;
  color: string;
  fact: string;
};

export type Era = {
  at: number;
  logMeters: number;
  name: string;
  quip: string;
  confidence: Confidence;
  realm: Realm;
  palette: [string, string, string];
  lesson: string;
  curios: Curio[];
};

const c = (name: string, shape: Shape, color: string, fact: string): Curio => ({
  name, shape, color, fact,
});

export const JOURNEY_HOURS = 1000;

export const ERAS: Era[] = [
  {
    at: 0,
    logMeters: Math.log10(1.616255e-35),
    name: "Planck Regime",
    quip: "Where our map of physics runs out",
    confidence: "SPECULATIVE",
    realm: "prephysical",
    palette: ["#07041d", "#281754", "#ff62c7"],
    lesson: "The Planck length is well defined, but spacetime foam is an unobserved visualization. Here, rolling is deliberately shown as a navigation metaphor.",
    curios: [
      c("spacetime fluctuation", "bubble", "#ff76c8", "A fluctuation is a game metaphor here; no experiment has imaged Planck-scale spacetime."),
      c("curvature ripple", "bubble", "#8b8cff", "General relativity describes curved spacetime, but not a confirmed granular texture at this scale."),
      c("energy uncertainty", "spark", "#ffe875", "Quantum systems can fluctuate, but this is not a little solid object."),
      c("vacuum shimmer", "spark", "#63e7ff", "A quantum vacuum is not empty, though 'shimmer' is purely visual language."),
    ],
  },
  {
    at: 0.02,
    logMeters: -24,
    name: "The Unresolved Gap",
    quip: "Eleven orders of honest uncertainty",
    confidence: "UNKNOWN",
    realm: "prephysical",
    palette: ["#07142c", "#173d6e", "#65dbff"],
    lesson: "There is no experimentally confirmed ladder of smaller constituents filling the enormous gap between the Planck scale and current particle probes.",
    curios: [
      c("field ripple", "bubble", "#65dbff", "Modern particle physics describes fields extending through space."),
      c("energy packet", "spark", "#ffe37a", "Particles are excitations of fields—not tiny classical beads."),
      c("unresolved structure", "bubble", "#c797ff", "This object is intentionally labeled unknown rather than inventing a particle."),
      c("measurement horizon", "spark", "#ff8ea8", "Below current experimental reach, uncertainty should remain visible."),
    ],
  },
  {
    at: 0.06,
    logMeters: -20,
    name: "Quark–Gluon Droplet",
    quip: "Confined, colorful, and never alone",
    confidence: "MEASURED",
    realm: "particle",
    palette: ["#170526", "#58185e", "#ff5c9e"],
    lesson: "Quarks are consistent with point-like particles down to current probe scales. They are never observed alone; quarks and gluons remain confined in composite matter.",
    curios: [
      c("up-quark trace", "quark", "#ff5575", "Up quarks help make protons and neutrons, but cannot be collected as isolated free objects."),
      c("down-quark trace", "quark", "#57a7ff", "Down quarks are confined by the strong interaction."),
      c("gluon field", "spark", "#ffd94f", "Gluons carry the strong force and bind quarks."),
      c("quark–antiquark pair", "quark", "#b7f35d", "High-energy interactions can produce pairs that hadronize into composite particles."),
    ],
  },
  {
    at: 0.2,
    logMeters: -15.08,
    name: "Hadron Forge",
    quip: "Composite matter finally has an inside",
    confidence: "MEASURED",
    realm: "particle",
    palette: ["#111646", "#304e98", "#6be7ff"],
    lesson: "Protons and neutrons are hadrons made from quarks and gluons. Their roughly femtometre-scale structure is experimentally measured.",
    curios: [
      c("proton", "hadron", "#ff667f", "A proton contains two up valence quarks and one down valence quark plus gluons and a dynamic quark sea."),
      c("neutron", "hadron", "#9ba8c0", "A neutron contains one up and two down valence quarks, plus gluons and a quark sea."),
      c("pion", "hadron", "#9df0d2", "Pions are mesons made from a quark and an antiquark."),
      c("antiproton", "hadron", "#c996ff", "Antimatter has opposite quantum numbers and annihilates with corresponding matter."),
    ],
  },
  {
    at: 0.5,
    logMeters: -10,
    name: "Atomic Cloud",
    quip: "Mostly probability, not tiny orbits",
    confidence: "MEASURED",
    realm: "matter",
    palette: ["#07313c", "#0a746e", "#67e8bd"],
    lesson: "Atoms are nuclei surrounded by electron probability clouds. The familiar planetary-orbit picture is useful art, not a literal trajectory.",
    curios: [
      c("hydrogen atom", "atom", "#f4fbff", "Hydrogen is one proton with one electron in its neutral state."),
      c("helium atom", "atom", "#ffe27d", "Most helium nuclei have two protons and two neutrons."),
      c("carbon atom", "atom", "#83efc1", "Carbon's bonding flexibility underpins known life."),
      c("oxygen atom", "atom", "#6fc9ff", "Oxygen readily forms bonds, including those in water."),
    ],
  },
  {
    at: 2,
    logMeters: -9,
    name: "Molecular Assembly",
    quip: "Shape starts to matter",
    confidence: "MEASURED",
    realm: "matter",
    palette: ["#0b353e", "#397655", "#c4e873"],
    lesson: "Molecules are stable arrangements of atoms bound by shared or transferred electrons. Their three-dimensional shapes control much of chemistry.",
    curios: [
      c("water molecule", "molecule", "#65caff", "A water molecule is bent, not linear, with an angle of about 104.5 degrees."),
      c("glucose", "molecule", "#ffe6a4", "Glucose stores chemical energy and supplies carbon for cells."),
      c("amino acid", "molecule", "#ff8fbd", "Amino acids are building blocks of proteins."),
      c("lipid", "molecule", "#e9ef79", "Lipids can self-assemble into membranes."),
    ],
  },
  {
    at: 6,
    logMeters: -8,
    name: "Macromolecule Reef",
    quip: "Machines before life",
    confidence: "MEASURED",
    realm: "matter",
    palette: ["#10383d", "#388061", "#d2f17c"],
    lesson: "Proteins, DNA, membranes, and many viruses occupy the nanometre-to-hundreds-of-nanometres range. Viruses are not cells.",
    curios: [
      c("protein complex", "molecule", "#ff8fb7", "Proteins fold into three-dimensional structures that perform cellular work."),
      c("DNA loop", "fiber", "#86e6ff", "DNA is a polymer whose sequence carries genetic information."),
      c("membrane vesicle", "bubble", "#d8ef6b", "Phospholipid membranes can self-assemble into closed vesicles."),
      c("small virus", "virus", "#b799ff", "Viruses depend on host cells to reproduce and are not universally considered alive."),
    ],
  },
  {
    at: 10,
    logMeters: -5,
    name: "Cellular Sea",
    quip: "The first whole living systems",
    confidence: "MEASURED",
    realm: "matter",
    palette: ["#123930", "#3a8048", "#bde96b"],
    lesson: "Many eukaryotic cells are around 10–100 micrometres across. Cells are deformable, internally structured systems—not simple balls.",
    curios: [
      c("bacterium", "cell", "#a8e95e", "Bacteria are cells without a membrane-bound nucleus."),
      c("red blood cell", "cell", "#ff5c6d", "Human red blood cells are flexible biconcave discs about 7–8 micrometres wide."),
      c("yeast cell", "cell", "#f4e4ac", "Yeasts are single-celled fungi."),
      c("plant cell", "cell", "#78d886", "Plant cells have cellulose walls, chloroplasts in photosynthetic tissue, and large vacuoles."),
    ],
  },
  {
    at: 25,
    logMeters: -4,
    name: "Fiber & Pollen",
    quip: "The microscopic world gets scratchy",
    confidence: "MEASURED",
    realm: "matter",
    palette: ["#29442b", "#7c8b3f", "#f3df69"],
    lesson: "Hair widths, pollen grains, tiny multicellular organisms, and large cells overlap around tens to hundreds of micrometres.",
    curios: [
      c("pollen grain", "cell", "#f5dd54", "Pollen sizes and surface textures vary dramatically among plant species."),
      c("hair fiber", "fiber", "#704d38", "Human hair diameter commonly spans tens of micrometres."),
      c("paper fiber", "fiber", "#e7dfcf", "Paper is a tangled network of plant-derived cellulose fibers."),
      c("tardigrade", "cell", "#e9a8a2", "Many tardigrades are visible under a microscope and are multicellular animals."),
    ],
  },
  {
    at: 40,
    logMeters: -3,
    name: "Dust Country",
    quip: "Every speck has a biography",
    confidence: "MEASURED",
    realm: "macroscopic",
    palette: ["#3c3827", "#7e7140", "#f3cf72"],
    lesson: "Household dust is a mixture, not one substance: fibers, soil, skin fragments, pollen, soot, and other particles all contribute.",
    curios: [
      c("dust mite", "dust", "#d99ba1", "Dust mites are animals typically a fraction of a millimetre long."),
      c("sand grain", "stone", "#efcd78", "Geologists commonly classify sand grains from about 0.0625 to 2 millimetres."),
      c("fabric lint", "fiber", "#b5c6df", "Lint is a loose tangle of fibers shed from textiles."),
      c("crumb", "dust", "#c99457", "A crumb is already an irregular aggregate of many substances."),
    ],
  },
  {
    at: 70,
    logMeters: -2,
    name: "Pocket World",
    quip: "Buttons, pebbles, and suspicious crumbs",
    confidence: "MEASURED",
    realm: "macroscopic",
    palette: ["#3d4334", "#718551", "#f1c76d"],
    lesson: "At centimetre scales, rigid-body rolling becomes a reasonable visual metaphor—though the magical sticking remains the game's central fiction.",
    curios: [
      c("pebble", "stone", "#9ca3a0", "Pebbles are rock fragments rounded or worn by transport and weathering."),
      c("button", "object", "#ff7395", "Manufactured objects introduce standardized shapes and materials."),
      c("toy brick", "object", "#5cb8ff", "A familiar rigid object can now visibly protrude from the mash."),
      c("bottle cap", "object", "#f5d55c", "Thin, asymmetric objects make the rolling body increasingly uneven."),
    ],
  },
  {
    at: 120,
    logMeters: 0,
    name: "Everyday Kingdom",
    quip: "Furniture begins to regret everything",
    confidence: "MEASURED",
    realm: "macroscopic",
    palette: ["#234e70", "#49a1aa", "#f4d181"],
    lesson: "The scale now ranges through familiar human-sized objects. The mash becomes visibly irregular and its rolling axis changes as objects accumulate.",
    curios: [
      c("shoe", "object", "#ff7a88", "Shoes combine flexible fabrics, foams, and rigid structural elements."),
      c("floor lamp", "object", "#f5db67", "Long objects can make the rolling mash temporarily elongated."),
      c("chair", "chair", "#d38a55", "Furniture creates lopsided collisions and prominent silhouettes."),
      c("couch", "object", "#ef9f47", "Upholstered furniture is mostly empty space, padding, and a structural frame."),
    ],
  },
  {
    at: 190,
    logMeters: 1,
    name: "Vehicle Yard",
    quip: "Traffic has become a food group",
    confidence: "MEASURED",
    realm: "macroscopic",
    palette: ["#273752", "#526f94", "#ff9c6b"],
    lesson: "Cars, trucks, boats, and small structures share metre-to-tens-of-metres scales, with mass varying far more than length alone suggests.",
    curios: [
      c("bicycle", "object", "#83d6f5", "A bicycle is mostly open space, which exposes the difference between size and mass."),
      c("compact car", "car", "#ff5e5e", "A passenger car is several metres long but contains substantial empty interior volume."),
      c("delivery van", "car", "#f2e7d6", "Vehicles make the mash wider and more mechanically awkward."),
      c("city bus", "car", "#f6cf53", "A bus is long enough to reshape the entire rolling silhouette."),
    ],
  },
  {
    at: 250,
    logMeters: 2,
    name: "Built Environment",
    quip: "The neighborhood is portable now",
    confidence: "MEASURED",
    realm: "macroscopic",
    palette: ["#28305c", "#566eaa", "#ffb76b"],
    lesson: "Buildings are composite systems with large empty volumes. Length scale is the game's progression measure, not a claim that equal-sized objects have equal mass.",
    curios: [
      c("bungalow", "house", "#ff9b8f", "A house is a structural shell enclosing mostly air."),
      c("water tower", "house", "#93c9e8", "Infrastructure mixes large dimensions with specialized functions."),
      c("office block", "house", "#aeb8cb", "A building contains many smaller-scale systems the game has already traversed."),
      c("stadium", "house", "#87df9b", "At this point the mash is a moving landscape of accumulated structures."),
    ],
  },
  {
    at: 330,
    logMeters: 4,
    name: "Landscape Scale",
    quip: "Geography becomes texture",
    confidence: "MEASURED",
    realm: "macroscopic",
    palette: ["#173f57", "#4b806c", "#a8d978"],
    lesson: "Mountains, islands, lakes, and cities span kilometres to hundreds of kilometres. Geological objects do not have crisp boundaries.",
    curios: [
      c("hill", "mountain", "#6f9c63", "A hill is a landform category without one universal size cutoff."),
      c("small island", "mountain", "#6bc4ba", "Islands are exposed land surrounded by water; their submerged structure continues below sea level."),
      c("mountain", "mountain", "#87969a", "Mountain height is tiny compared with Earth's radius."),
      c("metro area", "house", "#e0c170", "Urban areas blend continuously into their surroundings."),
    ],
  },
  {
    at: 430,
    logMeters: 7.1,
    name: "Planetary Pantry",
    quip: "Continents are crunchy",
    confidence: "MEASURED",
    realm: "cosmic",
    palette: ["#061a43", "#124d87", "#38bdf8"],
    lesson: "Earth is about 12,742 km in diameter. Planetary shapes are governed strongly by gravity, becoming nearly spherical above sufficient mass.",
    curios: [
      c("small moon", "planet", "#d8dee5", "Many small moons are irregular because their gravity is too weak to make them round."),
      c("Mercury", "planet", "#aaa39e", "Mercury is the smallest planet in our Solar System."),
      c("Earth", "planet", "#3fb9e8", "Earth is an oblate spheroid, slightly wider at the equator."),
      c("gas giant", "planet", "#f2c36f", "Gas giants have no simple solid surface like Earth's."),
    ],
  },
  {
    at: 600,
    logMeters: 9.14,
    name: "Stellar Buffet",
    quip: "A light lunch",
    confidence: "MEASURED",
    realm: "cosmic",
    palette: ["#100d32", "#41275f", "#ff745f"],
    lesson: "Stars are self-gravitating plasma spheres powered for most of their lives by nuclear fusion. Their sizes vary enormously.",
    curios: [
      c("red dwarf", "star", "#ff6b5e", "Red dwarfs are cool, low-mass stars and the most common stellar type."),
      c("Sun-like star", "star", "#ffe16b", "The Sun is about 1.39 million km in diameter."),
      c("blue giant", "star", "#76caff", "Hot, massive stars burn fuel quickly and live comparatively short lives."),
      c("red supergiant", "star", "#ff8c64", "Some supergiants would extend beyond Earth's orbit if placed at the Sun."),
    ],
  },
  {
    at: 690,
    logMeters: 13,
    name: "System Sweep",
    quip: "Orbits become the new clutter",
    confidence: "SUPPORTED MODEL",
    realm: "cosmic",
    palette: ["#0c0a2c", "#302052", "#a38cff"],
    lesson: "A planetary system is mostly empty space. Visual sizes and distances must be compressed differently or the planets would be nearly invisible.",
    curios: [
      c("planetary system", "system", "#8ca8ff", "Orbital systems are bound by gravity, not enclosed by a physical shell."),
      c("binary stars", "system", "#ffd788", "Many stars are members of binary or multiple systems."),
      c("Oort-cloud analogue", "system", "#a5e7ff", "The distant Oort Cloud is inferred from comet orbits, not directly imaged as a shell."),
      c("rogue planet", "planet", "#8490ae", "Some planets travel through interstellar space without orbiting a star."),
    ],
  },
  {
    at: 760,
    logMeters: 21,
    name: "Galaxy Garden",
    quip: "Spiral, serve, repeat",
    confidence: "MEASURED",
    realm: "cosmic",
    palette: ["#10082d", "#421e6c", "#c084fc"],
    lesson: "Galaxies contain stars, gas, dust, compact objects, and dark matter. Their visible edges are not hard boundaries.",
    curios: [
      c("dwarf galaxy", "galaxy", "#9cb9ff", "Dwarf galaxies can contain millions to billions of stars."),
      c("spiral galaxy", "galaxy", "#d1b7ff", "Spiral arms are density patterns, not permanent rows of the same stars."),
      c("elliptical galaxy", "galaxy", "#f1d39b", "Elliptical galaxies range from dwarfs to giants."),
      c("galaxy cluster", "galaxy", "#ff93d1", "Galaxy clusters are the largest gravitationally bound structures."),
    ],
  },
  {
    at: 900,
    logMeters: 26.94,
    name: "Observable Universe",
    quip: "The edge is a horizon, not a wall",
    confidence: "SUPPORTED MODEL",
    realm: "cosmic",
    palette: ["#050219", "#25124b", "#8165ff"],
    lesson: "The observable universe is limited by how far light has reached us, not by a known physical boundary of the whole universe.",
    curios: [
      c("cosmic web region", "universe", "#8d83ff", "Matter forms a web of filaments and voids on the largest mapped scales."),
      c("observable horizon", "universe", "#cc9eff", "Different observers have different observable universes."),
      c("great void", "universe", "#27316e", "Cosmic voids are underdense, not perfectly empty."),
      c("causal patch", "universe", "#ff92d3", "Causality limits which regions can influence one another."),
    ],
  },
  {
    at: 1000,
    logMeters: 60,
    name: "Metaversal Beyond",
    quip: "Science ends; play continues",
    confidence: "SPECULATIVE",
    realm: "speculative",
    palette: ["#090017", "#4c115c", "#ff4fd8"],
    lesson: "There is no established scientific 'metaversal' length scale. Everything beyond the observable-universe milestone is explicitly imaginative and infinite.",
    curios: [
      c("pocket reality", "universe", "#dc83ff", "A pocket reality is speculative fiction, not an observed object."),
      c("alternate history", "universe", "#ff88ce", "Many-worlds is an interpretation of quantum mechanics, not a set of collectible places."),
      c("causality knot", "system", "#72dbff", "This is playful geometry with no claim of physical existence."),
      c("omniverse crumb", "spark", "#fff2a8", "The game is now openly beyond established science."),
    ],
  },
];

export function eraAt(hours: number) {
  for (let i = ERAS.length - 1; i >= 0; i -= 1) {
    if (hours >= ERAS[i].at) return i;
  }
  return 0;
}

export function logMetersAt(hours: number) {
  if (hours >= JOURNEY_HOURS) {
    return 60 + Math.log2(1 + (hours - JOURNEY_HOURS) / 10) * 10;
  }
  const i = eraAt(hours);
  const current = ERAS[i];
  const next = ERAS[Math.min(i + 1, ERAS.length - 1)];
  if (current === next) return current.logMeters;
  let t = (hours - current.at) / (next.at - current.at);
  t = t * t * (3 - 2 * t);
  return current.logMeters + (next.logMeters - current.logMeters) * t;
}

export function formatScale(hours: number) {
  const log = logMetersAt(hours);
  const exponent = Math.floor(log);
  const mantissa = 10 ** (log - exponent);
  return `${mantissa.toFixed(exponent < -30 ? 3 : 2)} × 10^${exponent} m`;
}

export function formatHours(hours: number) {
  if (hours < 1 / 60) return `${Math.floor(hours * 3600)}s`;
  if (hours < 1) return `${Math.floor(hours * 60)}m`;
  return `${hours.toFixed(hours < 10 ? 2 : 1)}h`;
}
