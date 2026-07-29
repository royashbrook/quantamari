export type LegacyVisualStage =
  | "quantum"
  | "micro"
  | "room"
  | "neighborhood"
  | "planet"
  | "cosmic";

export type WorldKind =
  | "void"
  | "particle-field"
  | "microscopic-sea"
  | "fiber-bed"
  | "dust-surface"
  | "tabletop"
  | "interior"
  | "yard"
  | "city"
  | "landscape"
  | "planet-surface"
  | "stellar-field"
  | "orbital-system"
  | "galaxy-field"
  | "cosmic-web"
  | "speculative-beyond";

export type WorldSurface =
  | "none"
  | "field"
  | "fiber"
  | "floor"
  | "tabletop"
  | "interior-floor"
  | "road"
  | "terrain"
  | "sphere";

export type WorldSpec = {
  kind: WorldKind;
  surface: WorldSurface;
  legacyStage: LegacyVisualStage;
};

const spec = (
  kind: WorldKind,
  surface: WorldSurface,
  legacyStage: LegacyVisualStage,
): WorldSpec => ({ kind, surface, legacyStage });

export const WORLD_SPECS: Readonly<Record<string, WorldSpec>> = {
  "Theory Playground": spec("void", "none", "quantum"),
  "Particle Probe Frontier": spec("void", "none", "quantum"),
  "Quarks & Gluons": spec("particle-field", "field", "quantum"),
  "Hadron Forge": spec("particle-field", "field", "quantum"),
  "Nuclear Heart": spec("particle-field", "field", "quantum"),
  "Atomic Cloud": spec("microscopic-sea", "field", "micro"),
  "Molecular Assembly": spec("microscopic-sea", "field", "micro"),
  "Macromolecule Reef": spec("microscopic-sea", "field", "micro"),
  "Virus Garden": spec("microscopic-sea", "field", "micro"),
  "Cellular Sea": spec("microscopic-sea", "field", "micro"),
  "Microbe Meadow": spec("microscopic-sea", "field", "micro"),
  "Fiber & Pollen": spec("fiber-bed", "fiber", "micro"),
  "Dust Country": spec("dust-surface", "floor", "room"),
  "Granule Ground": spec("dust-surface", "floor", "room"),
  "Pocket World": spec("tabletop", "tabletop", "room"),
  "Tabletop Trek": spec("tabletop", "tabletop", "room"),
  "Everyday Kingdom": spec("interior", "interior-floor", "room"),
  "Room Scale": spec("interior", "interior-floor", "room"),
  "Vehicle Yard": spec("yard", "road", "neighborhood"),
  "House & Yard": spec("yard", "road", "neighborhood"),
  "Built Environment": spec("city", "road", "neighborhood"),
  "City Streets": spec("city", "road", "neighborhood"),
  "Landscape Scale": spec("landscape", "terrain", "planet"),
  "Regional Map": spec("landscape", "terrain", "planet"),
  "Moon Scale": spec("planet-surface", "sphere", "planet"),
  "Planetary Pantry": spec("planet-surface", "sphere", "planet"),
  "Giant Worlds": spec("planet-surface", "sphere", "planet"),
  "Stellar Buffet": spec("stellar-field", "none", "cosmic"),
  "System Sweep": spec("orbital-system", "none", "cosmic"),
  "Stellar Neighborhood": spec("stellar-field", "none", "cosmic"),
  "Galaxy Garden": spec("galaxy-field", "none", "cosmic"),
  "Galaxy Cluster Web": spec("cosmic-web", "none", "cosmic"),
  "Observable Universe": spec("cosmic-web", "none", "cosmic"),
  "Metaversal Beyond": spec("speculative-beyond", "none", "cosmic"),
};

export const LEGACY_VISUAL_STAGE_ANCHORS: Readonly<
  Record<LegacyVisualStage, string>
> = {
  quantum: "Theory Playground",
  micro: "Atomic Cloud",
  room: "Dust Country",
  neighborhood: "Vehicle Yard",
  planet: "Landscape Scale",
  cosmic: "Stellar Buffet",
};

export function worldSpecForEra(eraName: string) {
  const world = WORLD_SPECS[eraName];
  if (!world) throw new RangeError(`No world specification for era "${eraName}"`);
  return world;
}

export function legacyVisualStageAnchor(stage: LegacyVisualStage) {
  return LEGACY_VISUAL_STAGE_ANCHORS[stage];
}

type SeedPart = string | number;

export function stableWorldSeed(...parts: readonly SeedPart[]) {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const value = `${typeof part === "number" ? "n" : "s"}:${String(part)}`;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0xff;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function worldChunkSeed(
  journeySeed: SeedPart,
  eraName: string,
  chunkX: number,
  chunkZ: number,
) {
  return stableWorldSeed("chunk", journeySeed, eraName, chunkX, chunkZ);
}

export function worldAnchorSeed(
  journeySeed: SeedPart,
  parentEraName: string,
  childEraName: string,
  slot = 0,
) {
  return stableWorldSeed(
    "anchor",
    journeySeed,
    parentEraName,
    childEraName,
    slot,
  );
}

export type ProjectedLod = "rich" | "simple" | "point" | "fabric";

export const PROJECTED_LOD_THRESHOLDS = {
  rich: 8,
  simple: 2,
  point: 0.5,
} as const;

export const PROJECTED_RICH_HYSTERESIS = {
  enter: 9,
  exit: 6,
} as const;

export const MAX_HORIZONTAL_PLAY_FOV = 58;

export function horizontalFovDegrees(
  verticalFovDegrees: number,
  viewportAspect: number,
) {
  const vertical = Math.max(
    1,
    Math.min(179, Number.isFinite(verticalFovDegrees) ? verticalFovDegrees : 1),
  );
  const aspect = Math.max(
    0.2,
    Number.isFinite(viewportAspect) ? viewportAspect : 1,
  );
  return (
    (360 / Math.PI) *
    Math.atan(Math.tan((vertical * Math.PI) / 360) * aspect)
  );
}

export function boundedVerticalFov(
  preferredVerticalFov: number,
  viewportAspect: number,
  maxHorizontalFov = MAX_HORIZONTAL_PLAY_FOV,
) {
  const aspect = Math.max(
    0.2,
    Number.isFinite(viewportAspect) ? viewportAspect : 1,
  );
  const horizontal = Math.max(
    1,
    Math.min(179, Number.isFinite(maxHorizontalFov) ? maxHorizontalFov : 1),
  );
  const horizontalBound =
    (360 / Math.PI) *
    Math.atan(Math.tan((horizontal * Math.PI) / 360) / aspect);
  return Math.min(preferredVerticalFov, horizontalBound);
}

export function lodForProjectedDiameter(projectedDiameterPixels: number): ProjectedLod {
  if (Number.isNaN(projectedDiameterPixels) || projectedDiameterPixels <= 0) {
    return "fabric";
  }
  if (projectedDiameterPixels >= PROJECTED_LOD_THRESHOLDS.rich) return "rich";
  if (projectedDiameterPixels >= PROJECTED_LOD_THRESHOLDS.simple) return "simple";
  if (projectedDiameterPixels >= PROJECTED_LOD_THRESHOLDS.point) return "point";
  return "fabric";
}

export function wantsRichProjectedDetail(
  projectedDiameterPixels: number,
  currentlyRich: boolean,
) {
  if (
    !Number.isFinite(projectedDiameterPixels) ||
    projectedDiameterPixels <= 0
  ) {
    return false;
  }
  return (
    projectedDiameterPixels >=
    (currentlyRich
      ? PROJECTED_RICH_HYSTERESIS.exit
      : PROJECTED_RICH_HYSTERESIS.enter)
  );
}

export function projectedDiameterPixels(
  worldDiameter: number,
  cameraDistance: number,
  verticalFovDegrees: number,
  viewportHeightPixels: number,
) {
  if (
    worldDiameter <= 0 ||
    viewportHeightPixels <= 0 ||
    verticalFovDegrees <= 0 ||
    verticalFovDegrees >= 180
  ) {
    return 0;
  }
  if (cameraDistance <= 0) return Number.POSITIVE_INFINITY;
  const focalLength =
    viewportHeightPixels /
    (2 * Math.tan((verticalFovDegrees * Math.PI) / 360));
  return (worldDiameter * focalLength) / cameraDistance;
}

export const MAX_RESIDENT_LAYERS = 3;
export const RESIDENT_PRIOR_LAYER_DEPTH = MAX_RESIDENT_LAYERS - 1;

/**
 * Turns the camera lens into a continuous semantic scale without touching
 * journey progress. A 2× pullback reveals one larger authored layer; a 2×
 * push-in resolves one smaller layer. Residency remains clamped to the atlas.
 */
export function semanticViewScale(
  activeLayer: number,
  lens: number,
  layerCount: number,
) {
  const count = Math.max(0, Math.trunc(layerCount));
  if (count === 0) return 0;
  const safeLens =
    Number.isFinite(lens) && lens > 0 ? Math.max(1 / 256, lens) : 1;
  return Math.max(
    0,
    Math.min(
      count - 1,
      Math.max(0, activeLayer) + Math.log2(safeLens),
    ),
  );
}

export function localChunkCoordinate(position: number, chunkSize: number) {
  if (!Number.isFinite(position) || !Number.isFinite(chunkSize) || chunkSize <= 0) {
    return 0;
  }
  return position - Math.round(position / chunkSize) * chunkSize;
}

export function floatingOriginShift(
  position: number,
  chunkSize: number,
  threshold = 4_096,
) {
  if (
    !Number.isFinite(position) ||
    !Number.isFinite(chunkSize) ||
    chunkSize <= 0 ||
    Math.abs(position) < threshold
  ) {
    return 0;
  }
  return Math.round(position / chunkSize) * chunkSize;
}

export function residentLayerIndices(viewScale: number, layerCount: number) {
  const count = Math.max(0, Math.trunc(layerCount));
  if (count === 0) return [];
  const clampedView = Math.max(
    0,
    Math.min(count - 1, Number.isFinite(viewScale) ? viewScale : 0),
  );
  const lower = Math.floor(clampedView);
  const upper = Math.ceil(clampedView);
  const candidates =
    upper === lower
      ? [lower, lower - 1, lower - RESIDENT_PRIOR_LAYER_DEPTH]
      : [upper, lower, lower - 1];
  return candidates.filter((index, position) => {
    return (
      index >= 0 &&
      index < count &&
      candidates.indexOf(index) === position
    );
  });
}

export type WorldQualityTier = "high" | "balanced" | "battery";

export type WorldPerformanceBudget = {
  targetFps: number;
  maxDrawCalls: number;
  maxTriangles: number;
  maxRichObjects: number;
  maxInstances: number;
  maxChunkWorkMs: number;
  maxResidentLayers: number;
};

export const WORLD_PERFORMANCE_BUDGETS: Readonly<
  Record<WorldQualityTier, WorldPerformanceBudget>
> = {
  high: {
    targetFps: 60,
    maxDrawCalls: 180,
    maxTriangles: 600_000,
    maxRichObjects: 64,
    maxInstances: 4_000,
    maxChunkWorkMs: 2,
    maxResidentLayers: MAX_RESIDENT_LAYERS,
  },
  balanced: {
    // Modern phones boot into balanced; they deserve 60fps submission while
    // the draw/triangle budgets stay at the cooler balanced ceiling. Devices
    // that cannot reach it simply render fewer frames — the battery demotion
    // threshold (<24fps) is unchanged.
    targetFps: 60,
    maxDrawCalls: 120,
    maxTriangles: 300_000,
    maxRichObjects: 48,
    maxInstances: 2_500,
    maxChunkWorkMs: 2,
    maxResidentLayers: MAX_RESIDENT_LAYERS,
  },
  battery: {
    targetFps: 30,
    maxDrawCalls: 80,
    maxTriangles: 180_000,
    maxRichObjects: 32,
    maxInstances: 1_500,
    maxChunkWorkMs: 2,
    maxResidentLayers: MAX_RESIDENT_LAYERS,
  },
};

export function worldPerformanceBudget(tier: WorldQualityTier) {
  return WORLD_PERFORMANCE_BUDGETS[tier];
}
