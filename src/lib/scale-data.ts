import catalogJson from "./data/scale-catalog.json" with { type: "json" };

export type Confidence =
  | "MEASURED"
  | "SUPPORTED MODEL"
  | "UNKNOWN"
  | "SPECULATIVE";
export type Realm =
  | "prephysical"
  | "particle"
  | "matter"
  | "macroscopic"
  | "cosmic"
  | "speculative";
export type ScienceSource = {
  label: string;
  organization: string;
  url: string;
};
export type Shape =
  | "bubble"
  | "spark"
  | "quark"
  | "hadron"
  | "atom"
  | "molecule"
  | "virus"
  | "cell"
  | "fiber"
  | "dust"
  | "stone"
  | "object"
  | "chair"
  | "car"
  | "house"
  | "mountain"
  | "planet"
  | "star"
  | "system"
  | "galaxy"
  | "universe";

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
  relativeSize: number;
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

type CatalogCurio = Omit<Curio, "id" | "source"> & {
  id: string;
  sourceIndex: number;
};
type CatalogEra = Omit<Era, "curios"> & {
  curios: CatalogCurio[];
};

const CONFIDENCE_LEVELS = new Set<Confidence>([
  "MEASURED",
  "SUPPORTED MODEL",
  "UNKNOWN",
  "SPECULATIVE",
]);
const REALMS = new Set<Realm>([
  "prephysical",
  "particle",
  "matter",
  "macroscopic",
  "cosmic",
  "speculative",
]);
const SHAPES = new Set<Shape>([
  "bubble",
  "spark",
  "quark",
  "hadron",
  "atom",
  "molecule",
  "virus",
  "cell",
  "fiber",
  "dust",
  "stone",
  "object",
  "chair",
  "car",
  "house",
  "mountain",
  "planet",
  "star",
  "system",
  "galaxy",
  "universe",
]);
const VISUAL_FORM_SET = new Set<VisualForm>(VISUAL_FORMS);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function assertCatalog(condition: unknown, message: string): asserts condition {
  if (!condition) throw new TypeError(`Invalid scale catalog: ${message}`);
}

function loadCatalog(value: unknown): Era[] {
  assertCatalog(Array.isArray(value) && value.length > 0, "root must be a non-empty array");
  const eraIds = new Set<string>();
  const curioIds = new Set<string>();
  let priorAt = Number.NEGATIVE_INFINITY;
  let priorLogMeters = Number.NEGATIVE_INFINITY;

  return value.map((candidate, eraIndex) => {
    const era = candidate as CatalogEra;
    assertCatalog(
      typeof era.id === "string" && ID_PATTERN.test(era.id) && !eraIds.has(era.id),
      `era ${eraIndex} needs a unique stable id`,
    );
    eraIds.add(era.id);
    assertCatalog(
      Number.isFinite(era.at) && era.at > priorAt,
      `${era.id}.at must increase`,
    );
    assertCatalog(
      Number.isFinite(era.logMeters) && era.logMeters > priorLogMeters,
      `${era.id}.logMeters must increase`,
    );
    priorAt = era.at;
    priorLogMeters = era.logMeters;
    assertCatalog(typeof era.name === "string" && era.name.length > 0, `${era.id}.name`);
    assertCatalog(typeof era.quip === "string" && era.quip.length > 0, `${era.id}.quip`);
    assertCatalog(
      CONFIDENCE_LEVELS.has(era.confidence),
      `${era.id}.confidence`,
    );
    assertCatalog(REALMS.has(era.realm), `${era.id}.realm`);
    assertCatalog(
      Array.isArray(era.palette) &&
        era.palette.length === 3 &&
        era.palette.every((color) => COLOR_PATTERN.test(color)),
      `${era.id}.palette`,
    );
    assertCatalog(
      typeof era.lesson === "string" && era.lesson.length >= 40,
      `${era.id}.lesson`,
    );
    assertCatalog(
      Array.isArray(era.sources) && era.sources.length >= 2,
      `${era.id}.sources`,
    );
    const sources = era.sources.map((source, sourceIndex) => {
      assertCatalog(
        source &&
          typeof source.label === "string" &&
          typeof source.organization === "string" &&
          typeof source.url === "string" &&
          source.url.startsWith("https://"),
        `${era.id}.sources[${sourceIndex}]`,
      );
      return Object.freeze({ ...source });
    });
    assertCatalog(
      Array.isArray(era.curios) && era.curios.length > 0,
      `${era.id}.curios`,
    );
    const curios = era.curios.map((curio, curioIndex): Curio => {
      assertCatalog(
        typeof curio.id === "string" && ID_PATTERN.test(curio.id),
        `${era.id}.curios[${curioIndex}].id`,
      );
      const stableId = `${era.id}/${curio.id}`;
      assertCatalog(!curioIds.has(stableId), `${stableId} is duplicated`);
      curioIds.add(stableId);
      assertCatalog(typeof curio.name === "string" && curio.name.length > 0, `${stableId}.name`);
      assertCatalog(SHAPES.has(curio.shape), `${stableId}.shape`);
      assertCatalog(
        VISUAL_FORM_SET.has(curio.visualForm),
        `${stableId}.visualForm`,
      );
      assertCatalog(COLOR_PATTERN.test(curio.color), `${stableId}.color`);
      assertCatalog(typeof curio.fact === "string" && curio.fact.length >= 20, `${stableId}.fact`);
      assertCatalog(typeof curio.symbol === "string" && curio.symbol.length > 0, `${stableId}.symbol`);
      assertCatalog(
        Number.isFinite(curio.relativeSize) &&
          curio.relativeSize >= 0.25 &&
          curio.relativeSize <= 4,
        `${stableId}.relativeSize`,
      );
      assertCatalog(
        Number.isInteger(curio.sourceIndex) &&
          curio.sourceIndex >= 0 &&
          curio.sourceIndex < sources.length,
        `${stableId}.sourceIndex`,
      );
      return Object.freeze({
        id: stableId,
        name: curio.name,
        shape: curio.shape,
        visualForm: curio.visualForm,
        color: curio.color,
        fact: curio.fact,
        symbol: curio.symbol,
        relativeSize: curio.relativeSize,
        source: sources[curio.sourceIndex],
      });
    });
    return Object.freeze({
      id: era.id,
      at: era.at,
      logMeters: era.logMeters,
      name: era.name,
      quip: era.quip,
      confidence: era.confidence,
      realm: era.realm,
      palette: Object.freeze([...era.palette]) as unknown as [
        string,
        string,
        string,
      ],
      lesson: era.lesson,
      sources: Object.freeze(sources) as unknown as ScienceSource[],
      curios: Object.freeze(curios) as unknown as Curio[],
    });
  });
}

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

export const ERAS: Era[] = loadCatalog(catalogJson);

export const AUTHORED_CATALOG_IDS = ERAS.map((era) => ({
  eraId: era.id,
  curioIds: era.curios.map((curio) => curio.id.slice(era.id.length + 1)),
}));

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
