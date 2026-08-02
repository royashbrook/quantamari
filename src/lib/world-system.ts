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
  | "giant-atmosphere"
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
  | "sphere"
  | "atmosphere";

/**
 * The visual promise made by a scale tier. This is deliberately independent
 * from LOD: lowering detail may simplify a silhouette, but it must not turn a
 * literal chair or a recognizable cell back into an abstract particle glyph.
 */
export type WorldRepresentation =
  | "diagrammatic-micro"
  | "recognizable-organism"
  | "literal-object-place"
  | "astronomical"
  | "speculative";

/**
 * How a world occupies space. `finite` worlds have authored boundaries,
 * `tiled` worlds repeat a bounded layout, and `streamed` worlds continuously
 * generate new space around the player. `void` means there is no substrate.
 */
export type WorldTopology = "void" | "finite" | "tiled" | "streamed";

/** A continuous authored setting that spans more than one scale tier. */
export type WorldSceneId = "microscope-study-room";

export type WorldSpec = {
  kind: WorldKind;
  surface: WorldSurface;
  legacyStage: LegacyVisualStage;
  representation: WorldRepresentation;
  topology: WorldTopology;
  sceneId?: WorldSceneId;
};

const spec = (
  kind: WorldKind,
  surface: WorldSurface,
  legacyStage: LegacyVisualStage,
  representation: WorldRepresentation,
  topology: WorldTopology,
  sceneId?: WorldSceneId,
): WorldSpec => ({
  kind,
  surface,
  legacyStage,
  representation,
  topology,
  ...(sceneId ? { sceneId } : {}),
});

const MICROSCOPE_STUDY_ROOM: WorldSceneId = "microscope-study-room";

export const WORLD_SPECS: Readonly<Record<string, WorldSpec>> = {
  "Theory Playground": spec(
    "void",
    "none",
    "quantum",
    "speculative",
    "void",
  ),
  "Particle Probe Frontier": spec(
    "void",
    "none",
    "quantum",
    "speculative",
    "void",
  ),
  "Quarks & Gluons": spec(
    "particle-field",
    "field",
    "quantum",
    "diagrammatic-micro",
    "streamed",
  ),
  "Hadron Forge": spec(
    "particle-field",
    "field",
    "quantum",
    "diagrammatic-micro",
    "streamed",
  ),
  "Nuclear Heart": spec(
    "particle-field",
    "field",
    "quantum",
    "diagrammatic-micro",
    "streamed",
  ),
  "Atomic Cloud": spec(
    "microscopic-sea",
    "field",
    "micro",
    "diagrammatic-micro",
    "streamed",
  ),
  "Molecular Assembly": spec(
    "microscopic-sea",
    "field",
    "micro",
    "diagrammatic-micro",
    "streamed",
  ),
  "Macromolecule Reef": spec(
    "microscopic-sea",
    "field",
    "micro",
    "diagrammatic-micro",
    "streamed",
  ),
  "Virus Garden": spec(
    "microscopic-sea",
    "field",
    "micro",
    "recognizable-organism",
    "finite",
    MICROSCOPE_STUDY_ROOM,
  ),
  "Cellular Sea": spec(
    "microscopic-sea",
    "field",
    "micro",
    "recognizable-organism",
    "finite",
    MICROSCOPE_STUDY_ROOM,
  ),
  "Microbe Meadow": spec(
    "microscopic-sea",
    "field",
    "micro",
    "recognizable-organism",
    "finite",
    MICROSCOPE_STUDY_ROOM,
  ),
  "Fiber & Pollen": spec(
    "fiber-bed",
    "fiber",
    "micro",
    "recognizable-organism",
    "finite",
    MICROSCOPE_STUDY_ROOM,
  ),
  "Dust Country": spec(
    "dust-surface",
    "floor",
    "room",
    "literal-object-place",
    "finite",
    MICROSCOPE_STUDY_ROOM,
  ),
  "Granule Ground": spec(
    "dust-surface",
    "floor",
    "room",
    "literal-object-place",
    "finite",
    MICROSCOPE_STUDY_ROOM,
  ),
  "Pocket World": spec(
    "tabletop",
    "tabletop",
    "room",
    "literal-object-place",
    "finite",
    MICROSCOPE_STUDY_ROOM,
  ),
  "Tabletop Trek": spec(
    "tabletop",
    "tabletop",
    "room",
    "literal-object-place",
    "finite",
    MICROSCOPE_STUDY_ROOM,
  ),
  "Everyday Kingdom": spec(
    "interior",
    "interior-floor",
    "room",
    "literal-object-place",
    "finite",
    MICROSCOPE_STUDY_ROOM,
  ),
  "Room Scale": spec(
    "interior",
    "interior-floor",
    "room",
    "literal-object-place",
    "finite",
    MICROSCOPE_STUDY_ROOM,
  ),
  "Vehicle Yard": spec(
    "yard",
    "road",
    "neighborhood",
    "literal-object-place",
    "finite",
  ),
  "House & Yard": spec(
    "yard",
    "road",
    "neighborhood",
    "literal-object-place",
    "finite",
  ),
  "Built Environment": spec(
    "city",
    "road",
    "neighborhood",
    "literal-object-place",
    "tiled",
  ),
  "City Streets": spec(
    "city",
    "road",
    "neighborhood",
    "literal-object-place",
    "tiled",
  ),
  "Landscape Scale": spec(
    "landscape",
    "terrain",
    "planet",
    "literal-object-place",
    "streamed",
  ),
  "Regional Map": spec(
    "landscape",
    "terrain",
    "planet",
    "literal-object-place",
    "streamed",
  ),
  "Moon Scale": spec(
    "planet-surface",
    "sphere",
    "planet",
    "astronomical",
    "streamed",
  ),
  "Planetary Pantry": spec(
    "planet-surface",
    "sphere",
    "planet",
    "astronomical",
    "streamed",
  ),
  "Giant Worlds": spec(
    "giant-atmosphere",
    "atmosphere",
    "planet",
    "astronomical",
    "streamed",
  ),
  "Stellar Buffet": spec(
    "stellar-field",
    "none",
    "cosmic",
    "astronomical",
    "streamed",
  ),
  "System Sweep": spec(
    "orbital-system",
    "none",
    "cosmic",
    "astronomical",
    "streamed",
  ),
  "Stellar Neighborhood": spec(
    "stellar-field",
    "none",
    "cosmic",
    "astronomical",
    "streamed",
  ),
  "Galaxy Garden": spec(
    "galaxy-field",
    "none",
    "cosmic",
    "astronomical",
    "streamed",
  ),
  "Galaxy Cluster Web": spec(
    "cosmic-web",
    "none",
    "cosmic",
    "astronomical",
    "streamed",
  ),
  "Observable Universe": spec(
    "cosmic-web",
    "none",
    "cosmic",
    "astronomical",
    "streamed",
  ),
  "Metaversal Beyond": spec(
    "speculative-beyond",
    "none",
    "cosmic",
    "speculative",
    "streamed",
  ),
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
 * journey progress. Pushing in resolves earlier, smaller layers; pulling back
 * changes the optical framing but can never reveal an unreached larger layer.
 * Residency remains clamped between the atlas origin and the active layer.
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
  const active = Math.max(
    0,
    Math.min(count - 1, Math.trunc(Number.isFinite(activeLayer) ? activeLayer : 0)),
  );
  return Math.max(
    0,
    Math.min(active, active + Math.log2(safeLens)),
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
  maxSceneryProxyInstances: number;
  maxSpawnWorkMs: number;
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
    maxSceneryProxyInstances: 4_000,
    maxSpawnWorkMs: 2,
    maxResidentLayers: MAX_RESIDENT_LAYERS,
  },
  balanced: {
    // Standard compact mode uses this fixed detail ceiling; frame pacing lives
    // in the explicit performance profile rather than changing this tier.
    targetFps: 60,
    maxDrawCalls: 120,
    maxTriangles: 300_000,
    maxRichObjects: 48,
    maxSceneryProxyInstances: 2_500,
    maxSpawnWorkMs: 2,
    maxResidentLayers: MAX_RESIDENT_LAYERS,
  },
  battery: {
    targetFps: 30,
    // Keep enough headroom for every authored environment and retained
    // substrate. Battery savings come from pacing, DPR, shadows, triangles,
    // and rich-object limits—not by hiding whole world layers.
    maxDrawCalls: 120,
    maxTriangles: 180_000,
    maxRichObjects: 32,
    maxSceneryProxyInstances: 1_500,
    maxSpawnWorkMs: 2,
    maxResidentLayers: MAX_RESIDENT_LAYERS,
  },
};

export function worldPerformanceBudget(tier: WorldQualityTier) {
  return WORLD_PERFORMANCE_BUDGETS[tier];
}
