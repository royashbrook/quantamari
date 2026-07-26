export type Confidence = "MEASURED" | "SUPPORTED MODEL" | "UNKNOWN" | "SPECULATIVE";
export type Realm = "prephysical" | "particle" | "matter" | "macroscopic" | "cosmic" | "speculative";
export type ScienceSource = {
  label: string;
  organization: string;
  url: string;
};
export type Shape =
  | "bubble" | "spark" | "quark" | "hadron" | "atom" | "molecule"
  | "virus" | "cell" | "fiber" | "dust" | "stone" | "object"
  | "chair" | "car" | "house" | "mountain" | "planet" | "star"
  | "system" | "galaxy" | "universe";

export const VISUAL_FORMS = [
  "foam",
  "field-ripple",
  "spark",
  "string",
  "quark",
  "hadron",
  "nuclear-cluster",
  "atom-cloud",
  "molecule",
  "molecule-bent",
  "molecule-linear",
  "protein",
  "double-helix",
  "vesicle",
  "antibody",
  "virus-enveloped",
  "virus-faceted",
  "bacteriophage",
  "cell-soft",
  "bacterium",
  "blood-cell",
  "immune-cell",
  "plant-cell",
  "neuron",
  "sperm",
  "ciliate",
  "diatom",
  "pollen",
  "tardigrade",
  "mite",
  "worm",
  "fiber",
  "dust-cluster",
  "grain",
  "crystal",
  "seed",
  "bead",
  "button",
  "brick",
  "bottle-cap",
  "coin",
  "key",
  "die",
  "pencil",
  "mug",
  "book",
  "spoon",
  "shoe",
  "lamp",
  "chair",
  "couch",
  "guitar",
  "table",
  "screen",
  "potted-plant",
  "bed",
  "appliance",
  "bathtub",
  "doorway",
  "bicycle",
  "motorcycle",
  "sailboat",
  "vehicle",
  "train",
  "tree",
  "pool",
  "house",
  "tower",
  "bridge",
  "stadium",
  "park",
  "landform",
  "river-system",
  "forest",
  "weather-front",
  "world",
  "ringed-world",
  "asteroid",
  "comet",
  "star",
  "dense-star",
  "orbit-system",
  "star-cluster",
  "nebula",
  "galaxy",
  "galaxy-cluster",
  "cosmic-web",
  "cosmic-void",
  "horizon",
  "speculative-reality",
  "artifact",
] as const;

export type VisualForm = (typeof VISUAL_FORMS)[number];

export type Curio = {
  id: string;
  name: string;
  shape: Shape;
  visualForm: VisualForm;
  color: string;
  fact: string;
  symbol: string;
  source?: ScienceSource;
};

export type Era = {
  id: string;
  at: number;
  logMeters: number;
  name: string;
  quip: string;
  confidence: Confidence;
  realm: Realm;
  palette: [string, string, string];
  lesson: string;
  curios: Curio[];
  sources: ScienceSource[];
};

type CurioDraft = Omit<Curio, "id" | "source">;
type EraDraft = Omit<Era, "id" | "curios" | "sources"> & {
  curios: CurioDraft[];
};

const SHAPE_SYMBOLS: Record<Shape, string> = {
  bubble: "∿",
  spark: "✦",
  quark: "q",
  hadron: "●",
  atom: "⚛",
  molecule: "⬡",
  virus: "✣",
  cell: "◉",
  fiber: "≋",
  dust: "✺",
  stone: "◆",
  object: "▣",
  chair: "⌑",
  car: "▰",
  house: "⌂",
  mountain: "▲",
  planet: "◍",
  star: "★",
  system: "◎",
  galaxy: "〰",
  universe: "∞",
};

const FORM_NAMES: Partial<Record<VisualForm, readonly string[]>> = {
  foam: ["foam bubble", "geometry pulse", "topology question"],
  "field-ripple": [
    "field ripple",
    "unresolved structure",
    "field excitation",
    "probe limit",
  ],
  string: ["vibrating string", "extra-dimensional chord"],
  "nuclear-cluster": [
    "deuteron",
    "helium-4 nucleus",
    "carbon-12 nucleus",
    "fission fragment",
  ],
  "molecule-bent": ["water molecule"],
  "molecule-linear": ["carbon dioxide"],
  protein: ["protein complex", "ribosome"],
  "double-helix": ["dna loop"],
  vesicle: ["membrane vesicle"],
  antibody: ["antibody"],
  "virus-faceted": ["adenovirus", "giant virus"],
  "virus-enveloped": [
    "small virus",
    "influenza virion",
    "coronavirus virion",
  ],
  bacteriophage: ["bacteriophage"],
  bacterium: ["bacterium", "e. coli bacterium", "cyanobacterium"],
  "blood-cell": ["red blood cell"],
  "immune-cell": ["white blood cell"],
  "plant-cell": ["plant cell"],
  neuron: ["neuron"],
  sperm: ["sperm cell"],
  ciliate: ["paramecium"],
  diatom: ["diatom"],
  pollen: ["pollen grain", "moss spore"],
  tardigrade: ["tardigrade"],
  mite: ["dust mite"],
  worm: ["tiny nematode"],
  crystal: ["salt crystal", "salt formula unit"],
  seed: ["rice grain", "lentil"],
  bead: ["glass bead", "glass marble", "hail pellet"],
  button: ["button"],
  brick: ["toy brick"],
  "bottle-cap": ["bottle cap"],
  coin: ["coin"],
  key: ["house key"],
  die: ["six-sided die"],
  pencil: ["pencil"],
  mug: ["coffee mug"],
  book: ["paperback book"],
  spoon: ["tablespoon"],
  shoe: ["shoe"],
  lamp: ["floor lamp"],
  couch: ["couch"],
  guitar: ["guitar"],
  table: ["kitchen table"],
  screen: ["television"],
  "potted-plant": ["potted plant"],
  bed: ["bed"],
  appliance: ["refrigerator"],
  bathtub: ["bathtub"],
  doorway: ["doorway"],
  bicycle: ["bicycle"],
  motorcycle: ["motorcycle"],
  sailboat: ["sailboat"],
  train: ["city train"],
  tree: ["oak tree"],
  pool: ["backyard pool"],
  tower: [
    "water tower",
    "office block",
    "skyscraper",
    "apartment tower",
    "lighthouse",
  ],
  bridge: ["suspension bridge", "river bridge"],
  stadium: ["stadium"],
  park: ["park block"],
  "river-system": ["river basin", "lake system"],
  forest: ["forest belt"],
  "weather-front": ["storm front"],
  "ringed-world": ["saturn"],
  asteroid: ["asteroid", "small moon"],
  comet: ["comet nucleus"],
  "dense-star": ["white dwarf", "neutron star"],
  "star-cluster": [
    "open star cluster",
    "globular cluster",
    "binary stars",
    "triple-star system",
  ],
  nebula: ["emission nebula", "molecular cloud"],
  "galaxy-cluster": [
    "galaxy cluster",
    "galaxy group",
    "local group",
    "virgo cluster",
  ],
  "cosmic-web": [
    "supercluster strand",
    "cosmic web region",
    "cosmic filament",
    "supercluster region",
  ],
  "cosmic-void": ["cosmic void", "great void"],
  horizon: [
    "observable horizon",
    "causal patch",
    "last-scattering patch",
    "hubble volume",
  ],
  "speculative-reality": [
    "pocket reality",
    "alternate history",
    "causality knot",
    "omniverse crumb",
    "brane bubble",
    "timeline braid",
    "simulation shard",
    "reality seed",
  ],
};

const FORM_BY_NAME = new Map<string, VisualForm>(
  Object.entries(FORM_NAMES).flatMap(([form, names]) =>
    (names ?? []).map((name) => [name, form as VisualForm]),
  ),
);

const DEFAULT_FORM_BY_SHAPE: Record<Shape, VisualForm> = {
  bubble: "foam",
  spark: "spark",
  quark: "quark",
  hadron: "hadron",
  atom: "atom-cloud",
  molecule: "molecule",
  virus: "virus-enveloped",
  cell: "cell-soft",
  fiber: "fiber",
  dust: "dust-cluster",
  stone: "grain",
  object: "artifact",
  chair: "chair",
  car: "vehicle",
  house: "house",
  mountain: "landform",
  planet: "world",
  star: "star",
  system: "orbit-system",
  galaxy: "galaxy",
  universe: "horizon",
};

export function visualFormFor(name: string, shape: Shape): VisualForm {
  return FORM_BY_NAME.get(name.toLowerCase()) ?? DEFAULT_FORM_BY_SHAPE[shape];
}

const c = (
  name: string,
  shape: Shape,
  color: string,
  fact: string,
  symbol = SHAPE_SYMBOLS[shape],
): CurioDraft => ({
  name,
  shape,
  visualForm: visualFormFor(name, shape),
  color,
  fact,
  symbol,
});

export const JOURNEY_HOURS = 500;

export const LEGACY_V3_ERA_NAMES = [
  "Theory Playground",
  "Particle Probe Frontier",
  "Quarks & Gluons",
  "Hadron Forge",
  "Atomic Cloud",
  "Molecular Assembly",
  "Macromolecule Reef",
  "Cellular Sea",
  "Fiber & Pollen",
  "Dust Country",
  "Pocket World",
  "Everyday Kingdom",
  "Vehicle Yard",
  "Built Environment",
  "Landscape Scale",
  "Planetary Pantry",
  "Stellar Buffet",
  "System Sweep",
  "Galaxy Garden",
  "Observable Universe",
  "Metaversal Beyond",
] as const;

export const AUTHORED_CATALOG_IDS = [
  {
    eraId: "theory-playground",
    curioIds: [
      "foam-bubble", "vibrating-string", "resonance-note", "vacuum-shimmer",
      "geometry-pulse", "causal-uncertainty", "topology-question",
      "extra-dimensional-chord",
    ],
  },
  {
    eraId: "particle-probe-frontier",
    curioIds: [
      "field-ripple", "energy-packet", "unresolved-structure",
      "measurement-horizon", "symmetry-echo", "field-excitation",
      "unknown-resonance", "probe-limit",
    ],
  },
  {
    eraId: "quarks-gluons",
    curioIds: [
      "up-quark-trace", "down-quark-trace", "gluon-field",
      "quark-antiquark-pair", "strange-quark-trace", "charm-quark-trace",
      "color-field-knot", "gluon-spray",
    ],
  },
  {
    eraId: "hadron-forge",
    curioIds: [
      "proton", "neutron", "pion", "antiproton", "kaon", "lambda-baryon",
      "rho-meson", "delta-baryon",
    ],
  },
  {
    eraId: "nuclear-heart",
    curioIds: [
      "deuteron", "helium-4-nucleus", "carbon-12-nucleus", "fission-fragment",
    ],
  },
  {
    eraId: "atomic-cloud",
    curioIds: [
      "hydrogen-atom", "helium-atom", "carbon-atom", "oxygen-atom",
      "nitrogen-atom", "silicon-atom", "iron-atom", "uranium-atom",
    ],
  },
  {
    eraId: "molecular-assembly",
    curioIds: [
      "water-molecule", "glucose", "amino-acid", "lipid", "methane",
      "carbon-dioxide", "caffeine", "salt-formula-unit",
    ],
  },
  {
    eraId: "macromolecule-reef",
    curioIds: [
      "protein-complex", "dna-loop", "membrane-vesicle", "small-virus",
      "ribosome", "antibody", "collagen-fiber", "bacteriophage",
    ],
  },
  {
    eraId: "virus-garden",
    curioIds: [
      "influenza-virion", "adenovirus", "coronavirus-virion", "giant-virus",
    ],
  },
  {
    eraId: "cellular-sea",
    curioIds: [
      "bacterium", "red-blood-cell", "yeast-cell", "plant-cell",
      "white-blood-cell", "neuron", "amoeba", "sperm-cell",
    ],
  },
  {
    eraId: "microbe-meadow",
    curioIds: [
      "e-coli-bacterium", "cyanobacterium", "diatom", "paramecium",
    ],
  },
  {
    eraId: "fiber-pollen",
    curioIds: [
      "pollen-grain", "hair-fiber", "paper-fiber", "tardigrade", "moss-spore",
      "skin-flake", "fungal-hypha", "tiny-nematode",
    ],
  },
  {
    eraId: "dust-country",
    curioIds: [
      "dust-mite", "sand-grain", "fabric-lint", "crumb", "soot-fleck",
      "salt-crystal", "insect-scale", "microplastic",
    ],
  },
  {
    eraId: "granule-ground",
    curioIds: ["rice-grain", "lentil", "hail-pellet", "glass-bead"],
  },
  {
    eraId: "pocket-world",
    curioIds: [
      "pebble", "button", "toy-brick", "bottle-cap", "coin", "house-key",
      "six-sided-die", "glass-marble",
    ],
  },
  {
    eraId: "tabletop-trek",
    curioIds: ["pencil", "coffee-mug", "paperback-book", "tablespoon"],
  },
  {
    eraId: "everyday-kingdom",
    curioIds: [
      "shoe", "floor-lamp", "chair", "couch", "guitar", "kitchen-table",
      "television", "potted-plant",
    ],
  },
  {
    eraId: "room-scale",
    curioIds: ["bed", "refrigerator", "bathtub", "doorway"],
  },
  {
    eraId: "vehicle-yard",
    curioIds: [
      "bicycle", "compact-car", "delivery-van", "city-bus", "motorcycle",
      "pickup-truck", "sailboat", "fire-engine",
    ],
  },
  {
    eraId: "house-yard",
    curioIds: ["garden-shed", "oak-tree", "garage", "backyard-pool"],
  },
  {
    eraId: "built-environment",
    curioIds: [
      "bungalow", "water-tower", "office-block", "stadium", "townhouse",
      "lighthouse", "suspension-bridge", "skyscraper",
    ],
  },
  {
    eraId: "city-streets",
    curioIds: [
      "apartment-tower", "city-train", "park-block", "river-bridge",
    ],
  },
  {
    eraId: "landscape-scale",
    curioIds: [
      "hill", "small-island", "mountain", "metro-area", "volcano", "glacier",
      "canyon", "megacity",
    ],
  },
  {
    eraId: "regional-map",
    curioIds: ["river-basin", "forest-belt", "lake-system", "storm-front"],
  },
  {
    eraId: "moon-scale",
    curioIds: ["ceres", "europa", "earth-s-moon", "pluto"],
  },
  {
    eraId: "planetary-pantry",
    curioIds: [
      "small-moon", "mercury", "earth", "gas-giant", "asteroid",
      "comet-nucleus", "mars", "saturn",
    ],
  },
  {
    eraId: "giant-worlds",
    curioIds: ["jupiter", "saturn", "uranus", "neptune"],
  },
  {
    eraId: "stellar-buffet",
    curioIds: [
      "red-dwarf", "sun-like-star", "blue-giant", "red-supergiant",
      "white-dwarf", "neutron-star", "orange-subgiant", "blue-hypergiant",
    ],
  },
  {
    eraId: "system-sweep",
    curioIds: [
      "planetary-system", "binary-stars", "oort-cloud-analogue",
      "rogue-planet", "asteroid-belt", "protoplanetary-disk",
      "triple-star-system", "kuiper-belt-analogue",
    ],
  },
  {
    eraId: "stellar-neighborhood",
    curioIds: [
      "open-star-cluster", "globular-cluster", "emission-nebula",
      "molecular-cloud",
    ],
  },
  {
    eraId: "galaxy-garden",
    curioIds: [
      "dwarf-galaxy", "spiral-galaxy", "elliptical-galaxy", "galaxy-cluster",
      "irregular-galaxy", "barred-spiral", "active-galaxy", "galaxy-group",
    ],
  },
  {
    eraId: "galaxy-cluster-web",
    curioIds: [
      "local-group", "virgo-cluster", "cosmic-void", "supercluster-strand",
    ],
  },
  {
    eraId: "observable-universe",
    curioIds: [
      "cosmic-web-region", "observable-horizon", "great-void", "causal-patch",
      "cosmic-filament", "supercluster-region", "last-scattering-patch",
      "hubble-volume",
    ],
  },
  {
    eraId: "metaversal-beyond",
    curioIds: [
      "pocket-reality", "alternate-history", "causality-knot",
      "omniverse-crumb", "brane-bubble", "timeline-braid", "simulation-shard",
      "reality-seed",
    ],
  },
] as const;

const BASE_ERAS: EraDraft[] = [
  {
    at: 0,
    logMeters: Math.log10(1.616255e-35),
    name: "Theory Playground",
    quip: "Foam, strings, notes—and a very honest question mark",
    confidence: "SPECULATIVE",
    realm: "prephysical",
    palette: ["#07041d", "#281754", "#ff62c7"],
    lesson: "The Planck length is well defined; what lies below present knowledge is not. This entire opening layer is a playful gallery of unconfirmed ideas—foam, strings, vibration, topology—not a claim that any of them are real objects.",
    curios: [
      c("foam bubble", "bubble", "#ff76c8", "Spacetime foam is a speculative image for Planck-scale geometry; no experiment has photographed it."),
      c("vibrating string", "fiber", "#8b8cff", "Fundamental strings are a mathematical proposal, not experimentally observed threads."),
      c("resonance note", "spark", "#ffe875", "The music note is a joke about vibration modes, not evidence that spacetime literally makes sound.", "♪"),
      c("vacuum shimmer", "spark", "#63e7ff", "A quantum vacuum is not classical emptiness, though this visible shimmer is purely playful language."),
    ],
  },
  {
    at: 0.01,
    logMeters: -20,
    name: "Particle Probe Frontier",
    quip: "The map resumes at the edge of experiment",
    confidence: "UNKNOWN",
    realm: "prephysical",
    palette: ["#07142c", "#173d6e", "#65dbff"],
    lesson: "There is no confirmed ladder of constituents between the Planck scale and present particle probes. This frontier marks experimental limits without inventing material to fill the gap.",
    curios: [
      c("field ripple", "bubble", "#65dbff", "Modern particle physics describes fields extending through space."),
      c("energy packet", "spark", "#ffe37a", "Particles are excitations of fields—not tiny classical beads."),
      c("unresolved structure", "bubble", "#c797ff", "This object is intentionally labeled unknown rather than inventing a particle."),
      c("measurement horizon", "spark", "#ff8ea8", "Below current experimental reach, uncertainty should remain visible."),
    ],
  },
  {
    at: 0.03,
    logMeters: -18,
    name: "Quarks & Gluons",
    quip: "Point-like in probes, confined in matter",
    confidence: "MEASURED",
    realm: "particle",
    palette: ["#170526", "#58185e", "#ff5c9e"],
    lesson: "Quarks and gluons are experimentally established, while quarks remain consistent with point-like particles at current resolution. This field is a scale metaphor—not a claim that ordinary space is filled with quark–gluon plasma.",
    curios: [
      c("up-quark trace", "quark", "#ff5575", "Up quarks help make protons and neutrons, but cannot be collected as isolated free objects."),
      c("down-quark trace", "quark", "#57a7ff", "Down quarks are confined by the strong interaction."),
      c("gluon field", "spark", "#ffd94f", "Gluons carry the strong force and bind quarks."),
      c("quark–antiquark pair", "quark", "#b7f35d", "High-energy interactions can produce pairs that hadronize into composite particles."),
    ],
  },
  {
    at: 0.1,
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
    at: 0.16,
    logMeters: -14,
    name: "Nuclear Heart",
    quip: "Whole atoms have not arrived, but their centers have",
    confidence: "MEASURED",
    realm: "particle",
    palette: ["#151344", "#4f4b99", "#ff8b6f"],
    lesson: "Atomic nuclei are compact quantum systems made from protons and neutrons. Nuclear size grows roughly with the cube root of nucleon count, not in direct proportion to atomic diameter.",
    curios: [
      c("deuteron", "hadron", "#78b9ff", "A deuteron is the nucleus of heavy hydrogen, containing one proton and one neutron.", "D"),
      c("helium-4 nucleus", "hadron", "#ffd66f", "A helium-4 nucleus contains two protons and two neutrons and is also called an alpha particle.", "α"),
      c("carbon-12 nucleus", "hadron", "#85e2ba", "Carbon-12 has six protons and six neutrons in its nucleus.", "C"),
      c("fission fragment", "hadron", "#ff8f9d", "Heavy nuclear fission produces energetic daughter nuclei rather than tiny pieces of classical solid.", "ƒ"),
    ],
  },
  {
    at: 0.25,
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
    at: 1,
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
    at: 3,
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
    at: 4,
    logMeters: -7,
    name: "Virus Garden",
    quip: "Tiny packages built to borrow a cell",
    confidence: "MEASURED",
    realm: "matter",
    palette: ["#183543", "#396c72", "#d59bff"],
    lesson: "Viruses span a broad range of nanometre-scale forms. Their capsids and envelopes have recognizable structures, but viruses depend on host cells for reproduction.",
    curios: [
      c("influenza virion", "virus", "#9ec9ff", "Influenza virions carry segmented RNA inside a protein shell and lipid envelope.", "I"),
      c("adenovirus", "virus", "#f1c96e", "Adenoviruses have an icosahedral capsid with fibers projecting from its vertices.", "A"),
      c("coronavirus virion", "virus", "#ff9fb4", "Coronaviruses are enveloped RNA viruses whose spike proteins form a crown-like fringe.", "Co"),
      c("giant virus", "virus", "#b18bea", "Some giant viruses are larger than many bacteria and carry unusually large genomes.", "G"),
    ],
  },
  {
    at: 5,
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
    at: 8,
    logMeters: -4.5,
    name: "Microbe Meadow",
    quip: "One drop can hold a whole neighborhood",
    confidence: "MEASURED",
    realm: "matter",
    palette: ["#153b32", "#478159", "#83df8f"],
    lesson: "Micrometre-scale life includes bacteria, archaea, protists, and microscopic algae with radically different body plans. A round blob is not a universal microbe shape.",
    curios: [
      c("E. coli bacterium", "cell", "#a7e66d", "Escherichia coli cells are typically rod-shaped bacteria with flexible flagella on many strains.", "E"),
      c("cyanobacterium", "cell", "#6cd5c3", "Many cyanobacteria form chains or colonies and perform oxygen-producing photosynthesis.", "Cy"),
      c("diatom", "cell", "#f0d979", "Diatoms build intricate silica cell walls with species-specific geometry.", "Di"),
      c("paramecium", "cell", "#d4a6f0", "Paramecia are single-celled ciliates whose many beating cilia drive movement and feeding.", "P"),
    ],
  },
  {
    at: 12.5,
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
    at: 20,
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
    at: 27,
    logMeters: -2.5,
    name: "Granule Ground",
    quip: "The specks are big enough to cast opinions",
    confidence: "MEASURED",
    realm: "macroscopic",
    palette: ["#423a29", "#8d7547", "#f2b96e"],
    lesson: "Millimetre-scale grains bridge dust and hand-held objects. Shape, porosity, and surface texture now dominate how pieces roll and pack together.",
    curios: [
      c("rice grain", "object", "#f2e4bf", "A rice grain is an elongated seed whose size and shape depend on its variety.", "R"),
      c("lentil", "stone", "#c7855b", "A lentil is a flattened lens-shaped seed rather than a miniature sphere.", "L"),
      c("hail pellet", "stone", "#dceeff", "Small hailstones grow as layered ice while moving through storm updrafts.", "H"),
      c("glass bead", "object", "#77d9d2", "Manufactured beads show how regular millimetre-scale geometry differs from natural grains.", "●"),
    ],
  },
  {
    at: 35,
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
    at: 48,
    logMeters: -1,
    name: "Tabletop Trek",
    quip: "The surface is a landscape now",
    confidence: "MEASURED",
    realm: "macroscopic",
    palette: ["#49343a", "#98645b", "#77cbe6"],
    lesson: "At decimetre scales, ordinary desk and kitchen objects become recognizable terrain. Hollow and thin objects can have large footprints without comparable gameplay bulk.",
    curios: [
      c("pencil", "object", "#f2c94f", "A pencil is a long wooden composite built around a graphite-rich writing core.", "✎"),
      c("coffee mug", "object", "#79b8d7", "A mug is a hollow ceramic vessel whose handle creates a distinctive side loop.", "U"),
      c("paperback book", "object", "#e8859d", "A closed paperback is a layered block of paper joined along one flexible spine.", "B"),
      c("tablespoon", "object", "#b9c6d2", "A spoon combines a shallow bowl with a long narrow handle.", "S"),
    ],
  },
  {
    at: 60,
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
    at: 78,
    logMeters: 0.6,
    name: "Room Scale",
    quip: "Walls, doors, and the route outside",
    confidence: "MEASURED",
    realm: "macroscopic",
    palette: ["#26485f", "#5e8f91", "#f4a66e"],
    lesson: "A room is a nested container holding furniture, people, air, and all smaller layers already visited. Doorways turn indoor scale into outdoor traversal.",
    curios: [
      c("bed", "chair", "#9aa9df", "A bed is a raised frame supporting flexible layered materials and a mostly hollow space beneath.", "Z"),
      c("refrigerator", "object", "#c8dde4", "A refrigerator is an insulated cabinet surrounding pumps, coils, shelves, and air.", "F"),
      c("bathtub", "object", "#8fd2e8", "A bathtub is a hollow basin whose familiar footprint is much larger than its material volume.", "U"),
      c("doorway", "house", "#dda46d", "A doorway is an opening in a wall and a useful transition between nested environments.", "Π"),
    ],
  },
  {
    at: 95,
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
    at: 110,
    logMeters: 1.5,
    name: "House & Yard",
    quip: "The room opens into weather",
    confidence: "MEASURED",
    realm: "macroscopic",
    palette: ["#294b49", "#659a5a", "#ffd46f"],
    lesson: "Homes sit inside yards, streets, drainage, vegetation, and neighboring structures. The building is no longer the world; it is one object inside a larger place.",
    curios: [
      c("garden shed", "house", "#d58a62", "A small shed is a framed enclosure whose walls hide mostly empty interior volume.", "⌂"),
      c("oak tree", "object", "#5bad65", "A mature tree is a branching living structure rooted in soil and filled with transport tissue.", "♣"),
      c("garage", "house", "#a3abb8", "A garage is a vehicle-sized room connected to a driveway and the surrounding street network.", "G"),
      c("backyard pool", "house", "#67cde7", "A pool is a lined container whose visible volume is mostly water rather than structure.", "▱"),
    ],
  },
  {
    at: 125,
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
    at: 145,
    logMeters: 3,
    name: "City Streets",
    quip: "Blocks connect instead of floating",
    confidence: "MEASURED",
    realm: "macroscopic",
    palette: ["#273b55", "#596f83", "#ffbb69"],
    lesson: "Cities are connected networks of streets, blocks, utilities, buildings, parks, and people. A skyline alone is not a city; the spaces between structures make it traversable.",
    curios: [
      c("apartment tower", "house", "#9cb3cf", "A residential tower stacks many rooms around shared structure, services, stairs, and elevators.", "▥"),
      c("city train", "car", "#ed6c62", "Urban rail vehicles follow connected tracks rather than moving as isolated road traffic.", "T"),
      c("park block", "house", "#72bd6a", "An urban park is a managed open space embedded in the surrounding street grid.", "▦"),
      c("river bridge", "house", "#8daab9", "A city bridge carries a connected route across water, rail, or another road.", "⌒"),
    ],
  },
  {
    at: 165,
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
    at: 190,
    logMeters: 5.5,
    name: "Regional Map",
    quip: "Roads thin into lines and cities into texture",
    confidence: "MEASURED",
    realm: "macroscopic",
    palette: ["#17445b", "#4e8977", "#a8d16b"],
    lesson: "At regional scales, rivers, forests, coastlines, weather systems, and urban networks become the readable structure. The city remains present as a small patch inside the land.",
    curios: [
      c("river basin", "mountain", "#65b9d0", "A drainage basin is the land area whose water flows toward a shared outlet.", "Y"),
      c("forest belt", "mountain", "#4f9e5c", "A forest seen regionally is a mosaic of habitats, disturbances, waterways, and human land use.", "♣"),
      c("lake system", "mountain", "#6ec6de", "Connected lakes and rivers form networks shaped by geology and water flow.", "≈"),
      c("storm front", "system", "#a8b7d8", "A weather front is a moving boundary between air masses, not a solid object.", "⌁"),
    ],
  },
  {
    at: 205,
    logMeters: 6.8,
    name: "Moon Scale",
    quip: "Whole worlds fit before Earth does",
    confidence: "MEASURED",
    realm: "cosmic",
    palette: ["#122442", "#4d6480", "#d5dcdf"],
    lesson: "Moons and dwarf planets span hundreds to thousands of kilometres. Gravity rounds the largest bodies while smaller ones retain irregular shapes.",
    curios: [
      c("Ceres", "planet", "#aaa9a4", "Ceres is the largest object in the asteroid belt and is massive enough to be rounded by gravity.", "C"),
      c("Europa", "planet", "#d6c89f", "Europa is an icy moon of Jupiter with strong evidence for a subsurface ocean.", "E"),
      c("Earth's Moon", "planet", "#c8c8c3", "The Moon is about 3,475 kilometres across and tidally locked to Earth.", "☾"),
      c("Pluto", "planet", "#d7b799", "Pluto is a dwarf planet with a nitrogen-rich surface and a large moon named Charon.", "P"),
    ],
  },
  {
    at: 215,
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
    at: 260,
    logMeters: 8.8,
    name: "Giant Worlds",
    quip: "Atmospheres wider than smaller planets",
    confidence: "MEASURED",
    realm: "cosmic",
    palette: ["#152044", "#4a4f82", "#efb967"],
    lesson: "Giant planets are dominated by deep atmospheres and fluid interiors. Rings and moons make each planet the center of a nested local system.",
    curios: [
      c("Jupiter", "planet", "#d8aa72", "Jupiter is the Solar System's largest planet and has a deep atmosphere dominated by hydrogen and helium.", "J"),
      c("Saturn", "planet", "#e6cb85", "Saturn's broad rings are made from countless orbiting particles rather than a solid disc.", "♄"),
      c("Uranus", "planet", "#8fd7df", "Uranus rotates on its side relative to its orbit and has a cold hydrogen-helium-methane atmosphere.", "U"),
      c("Neptune", "planet", "#638ddf", "Neptune is an ice giant with powerful winds and a deep blue atmospheric appearance.", "N"),
    ],
  },
  {
    at: 300,
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
    at: 345,
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
    at: 365,
    logMeters: 17,
    name: "Stellar Neighborhood",
    quip: "Stars become points inside a shared cloud",
    confidence: "SUPPORTED MODEL",
    realm: "cosmic",
    palette: ["#0c1231", "#303969", "#8fcfff"],
    lesson: "Light-years separate neighboring stars. Clusters, nebulae, and molecular clouds reveal structure between a planetary system and an entire galaxy.",
    curios: [
      c("open star cluster", "system", "#b9d7ff", "Open clusters are loose groups of stars formed from the same molecular cloud.", "∴"),
      c("globular cluster", "system", "#ffe4a2", "Globular clusters are dense, roughly spherical populations of old stars.", "●"),
      c("emission nebula", "galaxy", "#ef9fd1", "An emission nebula glows when energetic starlight ionizes surrounding gas.", "N"),
      c("molecular cloud", "system", "#8996bd", "Cold molecular clouds are dense interstellar regions where new stars can form.", "☁"),
    ],
  },
  {
    at: 380,
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
    at: 415,
    logMeters: 23.5,
    name: "Galaxy Cluster Web",
    quip: "Galaxies become beads on enormous filaments",
    confidence: "SUPPORTED MODEL",
    realm: "cosmic",
    palette: ["#0b0628", "#37205d", "#aa8cff"],
    lesson: "Galaxy groups and clusters trace a large-scale web shaped by gravity and dark matter. Voids and filaments are regions of a continuous cosmic distribution, not hard-edged objects.",
    curios: [
      c("Local Group", "galaxy", "#9dbdff", "The Local Group contains the Milky Way, Andromeda, Triangulum, and many smaller galaxies.", "L"),
      c("Virgo Cluster", "galaxy", "#d2b2ff", "The Virgo Cluster is the nearest large galaxy cluster and contains well over a thousand member galaxies.", "V"),
      c("cosmic void", "universe", "#45508a", "Cosmic voids are vast underdense regions surrounded by denser filaments and walls.", "○"),
      c("supercluster strand", "universe", "#e9a1dd", "Supercluster-scale associations trace the cosmic web but are not generally bound as one object.", "≋"),
    ],
  },
  {
    at: 450,
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
    at: 500,
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

const EXTRA_CURIOS: Record<string, CurioDraft[]> = {
  "Theory Playground": [
    c("geometry pulse", "bubble", "#ff9bdd", "This pulse is a visual metaphor for unknown Planck-scale geometry, not an observed object.", "≈"),
    c("causal uncertainty", "spark", "#fff18a", "Known physics does not yet provide an experimentally tested description of causality at the Planck scale.", "?"),
    c("topology question", "bubble", "#9ea1ff", "Quantum gravity might alter how geometry is described, but no microscopic topology has been observed.", "∩"),
    c("extra-dimensional chord", "fiber", "#78f2ff", "Extra dimensions appear in some theories, but this glowing chord is delighted speculation.", "♫"),
  ],
  "Particle Probe Frontier": [
    c("symmetry echo", "spark", "#8de8ff", "Symmetries organize modern particle theories, but unknown new physics may lie beyond present experiments.", "◇"),
    c("field excitation", "bubble", "#6fc9ff", "In quantum field theory, particles are excitations of underlying fields.", "∿"),
    c("unknown resonance", "spark", "#ff92c9", "This deliberately unnamed resonance represents possibilities that experiments have not established.", "?"),
    c("probe limit", "bubble", "#d5a8ff", "Smaller structure requires higher-energy probes; present measurements set limits rather than revealing a ladder.", "⊣"),
  ],
  "Quarks & Gluons": [
    c("strange-quark trace", "quark", "#9b7cff", "Strange quarks appear in short-lived hadrons but are not isolated as free particles.", "s"),
    c("charm-quark trace", "quark", "#ff9a61", "Charm quarks are heavy quarks produced in energetic interactions.", "c"),
    c("color-field knot", "spark", "#68f0c1", "Color charge is the charge of the strong interaction; it is unrelated to visible color.", "3"),
    c("gluon spray", "spark", "#ffe45c", "Energetic quarks and gluons form jets of hadrons rather than emerging alone.", "g"),
  ],
  "Hadron Forge": [
    c("kaon", "hadron", "#b58cff", "Kaons are mesons containing a strange quark or antiquark.", "K"),
    c("lambda baryon", "hadron", "#7ed9c4", "A lambda baryon contains up, down, and strange valence quarks.", "Λ"),
    c("rho meson", "hadron", "#ff9f76", "Rho mesons are extremely short-lived quark–antiquark states.", "ρ"),
    c("delta baryon", "hadron", "#6fb7ff", "Delta baryons are excited relatives of protons and neutrons.", "Δ"),
  ],
  "Atomic Cloud": [
    c("nitrogen atom", "atom", "#77b8ff", "Nitrogen has seven protons and is central to proteins and nucleic acids.", "N"),
    c("silicon atom", "atom", "#d4c6a3", "Silicon is abundant in Earth's crust and foundational to modern electronics.", "Si"),
    c("iron atom", "atom", "#e69a74", "Iron nuclei sit near the peak of nuclear binding energy per nucleon.", "Fe"),
    c("uranium atom", "atom", "#9fe37a", "All uranium isotopes are radioactive; uranium has 92 protons.", "U"),
  ],
  "Molecular Assembly": [
    c("methane", "molecule", "#d7e8ef", "Methane has one carbon bonded tetrahedrally to four hydrogens.", "CH₄"),
    c("carbon dioxide", "molecule", "#a8d7e8", "Carbon dioxide is a linear molecule with one carbon and two oxygen atoms.", "CO₂"),
    c("caffeine", "molecule", "#d6a66b", "Caffeine is a relatively small organic molecule that blocks adenosine receptors.", "Cf"),
    c("salt formula unit", "molecule", "#f3f5ff", "Solid sodium chloride forms an ionic lattice rather than separate NaCl molecules.", "Na"),
  ],
  "Macromolecule Reef": [
    c("ribosome", "molecule", "#f5a1ce", "Ribosomes translate messenger RNA into proteins.", "R"),
    c("antibody", "molecule", "#8de2ff", "Antibodies are Y-shaped proteins whose binding regions recognize molecular targets.", "Y"),
    c("collagen fiber", "fiber", "#f2cab7", "Collagen proteins assemble into strong structural fibers in animals.", "≋"),
    c("bacteriophage", "virus", "#bd9cff", "Bacteriophages are viruses that infect bacteria.", "Φ"),
  ],
  "Cellular Sea": [
    c("white blood cell", "cell", "#f4f1db", "White blood cells are diverse immune cells rather than one single cell type.", "W"),
    c("neuron", "cell", "#f2d45e", "Neurons transmit information through electrical and chemical signaling.", "Ψ"),
    c("amoeba", "cell", "#8ae0a5", "Amoebae change shape using extensions called pseudopodia.", "A"),
    c("sperm cell", "cell", "#78d9ef", "A sperm cell is a specialized motile reproductive cell.", "↝"),
  ],
  "Fiber & Pollen": [
    c("moss spore", "cell", "#a9dc63", "Spores are reproductive cells whose sizes and structures vary widely.", "•"),
    c("skin flake", "fiber", "#e7c5aa", "Many dust particles are fragments of biological material, including shed skin.", "◇"),
    c("fungal hypha", "fiber", "#e8dfb5", "Hyphae are branching filaments that form much of a fungus.", "Y"),
    c("tiny nematode", "cell", "#dbb7a4", "Nematodes span a huge size range; the smallest are microscopic multicellular animals.", "S"),
  ],
  "Dust Country": [
    c("soot fleck", "dust", "#58525c", "Soot contains carbon-rich particles produced by incomplete combustion.", "✦"),
    c("salt crystal", "stone", "#e9f0ff", "Table salt crystals form a cubic ionic lattice.", "□"),
    c("insect scale", "fiber", "#d5a6e8", "Butterfly and moth wings are covered with tiny overlapping scales.", "◈"),
    c("microplastic", "dust", "#55c9e8", "Microplastics are plastic particles smaller than five millimetres.", "P"),
  ],
  "Pocket World": [
    c("coin", "object", "#e4c75c", "Coins are thin metal discs whose familiar size makes a useful centimetre-scale reference.", "¢"),
    c("house key", "object", "#aeb7c4", "A key's thin teeth create an especially uneven protrusion.", "⚿"),
    c("six-sided die", "object", "#f2eee5", "A standard gaming die is a small cube with numbered faces.", "⚄"),
    c("glass marble", "stone", "#65d6d0", "A marble is a manufactured glass sphere, often around a centimetre across.", "●"),
  ],
  "Everyday Kingdom": [
    c("guitar", "object", "#d99055", "An acoustic guitar's hollow body amplifies vibrating strings.", "♪"),
    c("kitchen table", "chair", "#b97b50", "A table is mostly empty space bounded by a top and supporting legs.", "T"),
    c("television", "object", "#586a82", "A modern flat-panel display is thin relative to its width.", "▣"),
    c("potted plant", "object", "#76c66f", "A potted plant combines living tissue, soil, water, air, and a container.", "♣"),
  ],
  "Vehicle Yard": [
    c("motorcycle", "car", "#ef6f62", "A motorcycle is much narrower and lighter than a car of similar length.", "M"),
    c("pickup truck", "car", "#6aa4d8", "A pickup combines a passenger cab with an open cargo bed.", "P"),
    c("sailboat", "car", "#f3f0df", "A sailboat converts aerodynamic force on its sails into motion through water.", "⛵"),
    c("fire engine", "car", "#ef4f47", "Emergency vehicles carry specialized equipment and large water or ladder systems.", "F"),
  ],
  "Built Environment": [
    c("townhouse", "house", "#e88e76", "Attached townhouses share walls while remaining separate dwellings.", "⌂"),
    c("lighthouse", "house", "#f2e5c4", "Lighthouses elevate a navigational light above surrounding terrain and water.", "L"),
    c("suspension bridge", "house", "#8da7b9", "Suspension bridges carry their deck using cables anchored at both ends.", "⌒"),
    c("skyscraper", "house", "#91bdd7", "Tall buildings must resist wind as well as support their own weight.", "▥"),
  ],
  "Landscape Scale": [
    c("volcano", "mountain", "#a26f5d", "A volcano is a geological vent and the landform built around it.", "△"),
    c("glacier", "mountain", "#a7e1ed", "Glaciers are flowing bodies of compacted ice.", "≋"),
    c("canyon", "mountain", "#c69560", "Canyons are erosional landforms rather than separate solid objects.", "V"),
    c("megacity", "house", "#e8c865", "A megacity is a dense human system whose boundary depends on the definition used.", "▦"),
  ],
  "Planetary Pantry": [
    c("asteroid", "stone", "#a8a29a", "Most asteroids are irregular rocky or metallic bodies.", "◆"),
    c("comet nucleus", "stone", "#d8eef2", "A comet nucleus is a dark mixture of ice, dust, and rock.", "☄"),
    c("Mars", "planet", "#e17655", "Mars is a rocky planet with a diameter a little over half Earth's.", "♂"),
    c("Saturn", "planet", "#e6c77c", "Saturn is a gas giant surrounded by a broad, thin ring system.", "♄"),
  ],
  "Stellar Buffet": [
    c("white dwarf", "star", "#eef5ff", "A white dwarf is the dense remnant core left by many low- and medium-mass stars.", "W"),
    c("neutron star", "star", "#b9d8ff", "Neutron stars pack more mass than the Sun into a city-sized sphere.", "N"),
    c("orange subgiant", "star", "#ffae68", "A subgiant has exhausted hydrogen in its core and begun expanding.", "K"),
    c("blue hypergiant", "star", "#73bfff", "Hypergiants are extremely luminous, massive, and short-lived stars.", "H"),
  ],
  "System Sweep": [
    c("asteroid belt", "system", "#b1a69a", "An asteroid belt is a broad population of separate orbiting objects, not a dense ring.", "⋯"),
    c("protoplanetary disk", "system", "#e8b98b", "Planets form within rotating disks of gas and dust around young stars.", "⊙"),
    c("triple-star system", "system", "#ffe2a6", "Stable hierarchical systems can contain three or more gravitationally bound stars.", "3"),
    c("Kuiper-belt analogue", "system", "#9ad7e8", "Icy small bodies can occupy broad regions beyond a system's major planets.", "K"),
  ],
  "Galaxy Garden": [
    c("irregular galaxy", "galaxy", "#8db8ff", "Irregular galaxies lack a dominant spiral or elliptical structure.", "≈"),
    c("barred spiral", "galaxy", "#c5a8ff", "Many spiral galaxies have a central bar-shaped stellar structure.", "S"),
    c("active galaxy", "galaxy", "#ff9bd6", "An active galactic nucleus is powered by matter falling toward a supermassive black hole.", "✦"),
    c("galaxy group", "galaxy", "#f0c99c", "Galaxy groups are smaller gravitationally bound collections than rich clusters.", "∴"),
  ],
  "Observable Universe": [
    c("cosmic filament", "universe", "#9790ff", "Galaxies and dark matter trace enormous filaments around cosmic voids.", "⌁"),
    c("supercluster region", "universe", "#d1a5ff", "Superclusters describe large associations that are not generally bound as single objects.", "∷"),
    c("last-scattering patch", "universe", "#ffb0d9", "The cosmic microwave background comes from the era when the universe became transparent.", "C"),
    c("Hubble volume", "universe", "#7d86ff", "A Hubble volume is a cosmological scale related to the universe's expansion rate.", "H"),
  ],
  "Metaversal Beyond": [
    c("brane bubble", "universe", "#bd83ff", "Branes appear in some speculative physical models; this collectible is fiction.", "B"),
    c("timeline braid", "system", "#ff87d5", "A timeline braid is playful visual language, not established cosmology.", "≋"),
    c("simulation shard", "universe", "#76e4ff", "The simulation hypothesis does not currently supply a measurable outer scale.", "◇"),
    c("reality seed", "spark", "#fff08a", "This marks the fully fictional infinite-play region beyond the science atlas.", "✦"),
  ],
};

const source = (
  label: string,
  organization: string,
  url: string,
): ScienceSource => ({ label, organization, url });

/**
 * Curated, authoritative starting points for every era. Each collectible is
 * assigned one of its era's sources below so the fact card always provides a
 * direct path out of the game and into the underlying science.
 */
const SCIENCE_SOURCES: Record<string, ScienceSource[]> = {
  "Theory Playground": [
    source(
      "CODATA Planck length",
      "NIST",
      "https://physics.nist.gov/cgi-bin/cuu/Value?plkl",
    ),
    source(
      "SI base-unit definitions",
      "NIST",
      "https://www.nist.gov/si-redefinition/definitions-si-base-units",
    ),
  ],
  "Particle Probe Frontier": [
    source(
      "The Standard Model",
      "CERN",
      "https://home.cern/science/physics/standard-model",
    ),
    source(
      "Fundamental physical constants",
      "NIST",
      "https://physics.nist.gov/cuu/Constants/",
    ),
  ],
  "Quarks & Gluons": [
    source(
      "ALICE experiment",
      "CERN",
      "https://home.cern/science/experiments/alice/",
    ),
    source(
      "Heavy ions and quark–gluon plasma",
      "CERN",
      "https://home.cern/science/physics/heavy-ions-and-quark-gluon-plasma/",
    ),
  ],
  "Hadron Forge": [
    source(
      "From partons to hadrons",
      "CERN",
      "https://home.cern/partons-hadrons/",
    ),
    source(
      "The Standard Model",
      "CERN",
      "https://home.cern/science/physics/standard-model",
    ),
  ],
  "Nuclear Heart": [
    source(
      "Atomic weights and isotopic compositions",
      "NIST",
      "https://physics.nist.gov/cgi-bin/Compositions/stand_alone.pl?all=all&ascii=ascii2&isotype=all",
    ),
    source(
      "The Standard Model",
      "CERN",
      "https://home.cern/science/physics/standard-model",
    ),
  ],
  "Atomic Cloud": [
    source(
      "Atomic Spectra Database",
      "NIST",
      "https://physics.nist.gov/PhysRefData/ASD/",
    ),
    source(
      "Atomic energy levels and spectra",
      "NIST",
      "https://physics.nist.gov/cgi-bin/ASBib1/ELevBib.cgi",
    ),
  ],
  "Molecular Assembly": [
    source(
      "Chemistry WebBook",
      "NIST",
      "https://webbook.nist.gov/chemistry/",
    ),
    source(
      "DNA fact sheet",
      "NHGRI",
      "https://www.genome.gov/about-genomics/fact-sheets/Deoxyribonucleic-Acid-Fact-Sheet",
    ),
  ],
  "Macromolecule Reef": [
    source(
      "DNA fact sheet",
      "NHGRI",
      "https://www.genome.gov/about-genomics/fact-sheets/Deoxyribonucleic-Acid-Fact-Sheet",
    ),
    source(
      "Viruses at the edge of life",
      "CDC",
      "https://wwwnc.cdc.gov/eid/article/26/1/AC-2601_article.htm",
    ),
  ],
  "Virus Garden": [
    source(
      "Viruses at the edge of life",
      "CDC",
      "https://wwwnc.cdc.gov/eid/article/26/1/AC-2601_article.htm",
    ),
    source(
      "Types of influenza viruses",
      "CDC",
      "https://www.cdc.gov/flu/about/viruses-types.html",
    ),
  ],
  "Cellular Sea": [
    source(
      "Inside the cell",
      "NIGMS",
      "https://nigms.nih.gov/biobeat/2016/12/youve-got-questions-weve-got-answers-cell-day-2016",
    ),
    source(
      "Yeast cell microscopy",
      "NIGMS",
      "https://www.nigms.nih.gov/image-gallery/1092",
    ),
  ],
  "Microbe Meadow": [
    source(
      "Cells by the numbers",
      "NIGMS",
      "https://nigms.nih.gov/biobeat/2024/09/cells-by-the-numbers-2",
    ),
    source(
      "Bacteria shapes",
      "NIGMS",
      "https://www.nigms.nih.gov/image-gallery/1158",
    ),
  ],
  "Fiber & Pollen": [
    source(
      "Inside the cell",
      "NIGMS",
      "https://nigms.nih.gov/biobeat/2016/12/youve-got-questions-weve-got-answers-cell-day-2016",
    ),
    source(
      "Indoor particulate matter sources",
      "US EPA",
      "https://www.epa.gov/indoor-air-quality-iaq/sources-indoor-particulate-matter-pm",
    ),
  ],
  "Dust Country": [
    source(
      "Indoor particulate matter sources",
      "US EPA",
      "https://www.epa.gov/indoor-air-quality-iaq/sources-indoor-particulate-matter-pm",
    ),
    source(
      "Wentworth grain-size scale",
      "USGS",
      "https://pubs.usgs.gov/of/2006/1046/htmldocs/nomenclature.htm",
    ),
  ],
  "Granule Ground": [
    source(
      "Wentworth grain-size scale",
      "USGS",
      "https://pubs.usgs.gov/of/2006/1046/htmldocs/nomenclature.htm",
    ),
    source(
      "SI units: length",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-length",
    ),
  ],
  "Pocket World": [
    source(
      "SI units: length",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-length",
    ),
    source(
      "Wentworth grain-size scale",
      "USGS",
      "https://pubs.usgs.gov/of/2006/1046/htmldocs/nomenclature.htm",
    ),
  ],
  "Tabletop Trek": [
    source(
      "SI units: length",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-length",
    ),
    source(
      "SI units: mass",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-mass",
    ),
  ],
  "Everyday Kingdom": [
    source(
      "SI units: length",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-length",
    ),
    source(
      "SI units: mass",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-mass",
    ),
  ],
  "Room Scale": [
    source(
      "SI units: length",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-length",
    ),
    source(
      "SI base units",
      "NIST",
      "https://www.nist.gov/pml/owm/metric-si/si-units",
    ),
  ],
  "Vehicle Yard": [
    source(
      "SI units: length",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-length",
    ),
    source(
      "SI units: mass",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-mass",
    ),
  ],
  "House & Yard": [
    source(
      "SI units: length",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-length",
    ),
    source(
      "SI units: mass",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-mass",
    ),
  ],
  "Built Environment": [
    source(
      "SI units: length",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-length",
    ),
    source(
      "SI base units",
      "NIST",
      "https://www.nist.gov/pml/owm/metric-si/si-units",
    ),
  ],
  "City Streets": [
    source(
      "SI units: length",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-length",
    ),
    source(
      "SI base units",
      "NIST",
      "https://www.nist.gov/pml/owm/metric-si/si-units",
    ),
  ],
  "Landscape Scale": [
    source(
      "Geology and landforms",
      "USGS",
      "https://www.usgs.gov/programs/national-cooperative-geologic-mapping-program/science",
    ),
    source(
      "SI units: length",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-length",
    ),
  ],
  "Regional Map": [
    source(
      "Geology and landforms",
      "USGS",
      "https://www.usgs.gov/programs/national-cooperative-geologic-mapping-program/science",
    ),
    source(
      "SI units: length",
      "NIST",
      "https://www.nist.gov/pml/owm/si-units-length",
    ),
  ],
  "Moon Scale": [
    source(
      "Moons",
      "NASA",
      "https://science.nasa.gov/solar-system/moons/",
    ),
    source(
      "Dwarf planets",
      "NASA",
      "https://science.nasa.gov/dwarf-planets/",
    ),
  ],
  "Planetary Pantry": [
    source(
      "About the planets",
      "NASA",
      "https://science.nasa.gov/solar-system/planets/",
    ),
    source(
      "Solar System facts",
      "NASA",
      "https://science.nasa.gov/solar-system/solar-system-facts/",
    ),
  ],
  "Giant Worlds": [
    source(
      "About the planets",
      "NASA",
      "https://science.nasa.gov/solar-system/planets/",
    ),
    source(
      "Solar System facts",
      "NASA",
      "https://science.nasa.gov/solar-system/solar-system-facts/",
    ),
  ],
  "Stellar Buffet": [
    source(
      "Stars",
      "NASA",
      "https://science.nasa.gov/universe/stars/",
    ),
    source(
      "How stars form and evolve",
      "NASA",
      "https://science.nasa.gov/exoplanets/stars/",
    ),
  ],
  "System Sweep": [
    source(
      "Planetary systems",
      "NASA",
      "https://science.nasa.gov/universe/stars/planetary-system/",
    ),
    source(
      "Solar System facts",
      "NASA",
      "https://science.nasa.gov/solar-system/solar-system-facts/",
    ),
  ],
  "Stellar Neighborhood": [
    source(
      "Stars",
      "NASA",
      "https://science.nasa.gov/universe/stars/",
    ),
    source(
      "Nebulae",
      "NASA",
      "https://science.nasa.gov/mission/hubble/science/universe-uncovered/hubble-nebulae/",
    ),
  ],
  "Galaxy Garden": [
    source(
      "Galaxies",
      "NASA",
      "https://science.nasa.gov/universe/galaxies/",
    ),
    source(
      "Large-scale structures",
      "NASA",
      "https://science.nasa.gov/universe/galaxies/large-scale-structures/",
    ),
  ],
  "Galaxy Cluster Web": [
    source(
      "Galaxies",
      "NASA",
      "https://science.nasa.gov/universe/galaxies/",
    ),
    source(
      "Large-scale structures",
      "NASA",
      "https://science.nasa.gov/universe/galaxies/large-scale-structures/",
    ),
  ],
  "Observable Universe": [
    source(
      "What is the universe?",
      "NASA",
      "https://science.nasa.gov/exoplanets/what-is-the-universe/",
    ),
    source(
      "The cosmic web",
      "NASA",
      "https://science.nasa.gov/universe/galaxies/large-scale-structures/",
    ),
  ],
  "Metaversal Beyond": [
    source(
      "Observable-universe boundary",
      "NASA",
      "https://science.nasa.gov/exoplanets/what-is-the-universe/",
    ),
    source(
      "Where measured cosmology ends",
      "NASA",
      "https://science.nasa.gov/universe/galaxies/large-scale-structures/",
    ),
  ],
};

const SOURCE_OVERRIDES: Record<string, number> = {
  "small virus": 1,
  "virus capsid": 1,
  "viral envelope": 1,
  "yeast cell": 1,
  "sand grain": 1,
  pebble: 1,
};

export function withAuthoredCatalogIds<
  TEra extends { curios: readonly object[] },
>(
  eras: readonly TEra[],
): Array<
  Omit<TEra, "id" | "curios"> & {
    id: string;
    curios: Array<TEra["curios"][number] & { id: string }>;
  }
> {
  if (eras.length !== AUTHORED_CATALOG_IDS.length) {
    throw new RangeError("Authored era IDs do not match the scale catalog");
  }
  return eras.map((era, eraIndex) => {
    const authored = AUTHORED_CATALOG_IDS[eraIndex];
    if (era.curios.length !== authored.curioIds.length) {
      throw new RangeError(
        `Authored curio IDs do not match era ${authored.eraId}`,
      );
    }
    return {
      ...era,
      id: authored.eraId,
      curios: era.curios.map((curio, curioIndex) => ({
        ...curio,
        id: `${authored.eraId}/${authored.curioIds[curioIndex]}`,
      })),
    };
  });
}

export const ERAS: Era[] = withAuthoredCatalogIds(
  BASE_ERAS.map((era) => ({
    ...era,
    sources: SCIENCE_SOURCES[era.name],
    curios: [...era.curios, ...(EXTRA_CURIOS[era.name] ?? [])].map(
      (curio) => ({
        ...curio,
        source:
          SCIENCE_SOURCES[era.name][SOURCE_OVERRIDES[curio.name] ?? 0],
      }),
    ),
  })),
);

export function eraIndexForId(id: string) {
  const index = ERAS.findIndex((era) => era.id === id);
  return index < 0 ? 0 : index;
}

export function journeyHoursForEraProgress(index: number, progress: number) {
  const current = ERAS[Math.max(0, Math.min(ERAS.length - 1, index))];
  const next = ERAS[Math.min(ERAS.length - 1, index + 1)];
  if (current === next) return JOURNEY_HOURS;
  return current.at + (next.at - current.at) * Math.max(0, Math.min(1, progress));
}

export function formatEraScale(index: number, progress: number) {
  const current = ERAS[Math.max(0, Math.min(ERAS.length - 1, index))];
  if (current.realm === "speculative") return "FICTIONAL · UNBOUNDED";
  const next = ERAS[Math.min(ERAS.length - 1, index + 1)];
  const t = Math.max(0, Math.min(1, progress));
  const eased = t * t * (3 - 2 * t);
  const log =
    current === next
      ? current.logMeters
      : current.logMeters + (next.logMeters - current.logMeters) * eased;
  const exponent = Math.floor(log);
  const mantissa = 10 ** (log - exponent);
  return `${mantissa.toFixed(exponent < -30 ? 3 : 2)} × 10^${exponent} m`;
}

export function eraAt(hours: number) {
  for (let i = ERAS.length - 1; i >= 0; i -= 1) {
    if (hours >= ERAS[i].at) return i;
  }
  return 0;
}

export function logMetersAt(hours: number) {
  if (hours >= JOURNEY_HOURS) {
    return 60 + Math.log2(1 + (hours - JOURNEY_HOURS) / 5) * 10;
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
