import type { WorldKind } from "../world-system";

export const LITERAL_STAGE_IDS = [
  "microscope-slide",
  "tabletop",
  "room",
  "porch",
  "yard",
] as const;

export type LiteralStageId = (typeof LITERAL_STAGE_IDS)[number];
export type LiteralPoint = readonly [x: number, y: number, z: number];
export type LiteralRotation = readonly [x: number, y: number, z: number];

export type LiteralStage = {
  id: LiteralStageId;
  label: string;
  worldKinds: readonly WorldKind[];
  eligibleEraIds: readonly string[];
  nearZ: number;
  farZ: number;
};

export type LiteralArchitecturePrimitive = {
  id: string;
  label: string;
  semanticIdentity: string;
  primitive: "box" | "cylinder" | "portal";
  collision: "support" | "barrier" | "none";
  position: LiteralPoint;
  dimensions: LiteralPoint;
  rotation: LiteralRotation;
  visibleIn: readonly LiteralStageId[];
  clearWidth?: number;
};

export type LiteralPropAnchor = {
  id: string;
  curioId: string;
  curioName: string;
  position: LiteralPoint;
  rotation: LiteralRotation;
  footprintRadius: number;
  visibleIn: readonly LiteralStageId[];
  collectibleIn: readonly LiteralStageId[];
};

export type LiteralRouteSegment = {
  stage: LiteralStageId;
  centerX: number;
  halfWidth: number;
  nearZ: number;
  farZ: number;
};

export type LiteralStageTransition = {
  from: LiteralStageId;
  to: LiteralStageId;
  atZ: number;
  semantic: "scale-reveal" | "surface-drop" | "portal" | "threshold";
  viaArchitectureId?: string;
};

export type LiteralSupportRegion = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type LiteralSupportBoundary = {
  axis: "x" | "z";
  coordinate: number;
  min: number;
  max: number;
  outward: -1 | 1;
};

export const LITERAL_SLIDE_SURFACE_Y = 5.19;
export const LITERAL_TABLE_SURFACE_Y = 5.1;
export const LITERAL_FLOOR_SURFACE_Y = 0.02;

export const literalStageSurfaceY = (stage: LiteralStageId) =>
  stage === "microscope-slide"
    ? LITERAL_SLIDE_SURFACE_Y
    : stage === "tabletop"
      ? LITERAL_TABLE_SURFACE_Y
      : LITERAL_FLOOR_SURFACE_Y;

const uncoveredIntervals = (
  min: number,
  max: number,
  covered: ReadonlyArray<readonly [number, number]>,
) => {
  const intervals = covered
    .map(([start, end]) => [Math.max(min, start), Math.min(max, end)] as const)
    .filter(([start, end]) => end - start > 1e-6)
    .sort(([left], [right]) => left - right);
  const uncovered: Array<readonly [number, number]> = [];
  let cursor = min;
  intervals.forEach(([start, end]) => {
    if (start > cursor + 1e-6) uncovered.push([cursor, start]);
    cursor = Math.max(cursor, end);
  });
  if (cursor < max - 1e-6) uncovered.push([cursor, max]);
  return uncovered;
};

/** Exposed contour only: shared edges between touching supports stay open. */
export const literalSupportBoundaries = (
  regions: readonly LiteralSupportRegion[],
) => {
  const boundaries: LiteralSupportBoundary[] = [];
  regions.forEach((region, index) => {
    const others = regions.filter((_, otherIndex) => otherIndex !== index);
    const vertical = [
      {
        coordinate: region.minX,
        outward: -1 as const,
        covered: others
          .filter(
            (other) =>
              other.minX < region.minX - 1e-6 &&
              other.maxX >= region.minX - 1e-6,
          )
          .map((other) => [other.minZ, other.maxZ] as const),
      },
      {
        coordinate: region.maxX,
        outward: 1 as const,
        covered: others
          .filter(
            (other) =>
              other.minX <= region.maxX + 1e-6 &&
              other.maxX > region.maxX + 1e-6,
          )
          .map((other) => [other.minZ, other.maxZ] as const),
      },
    ];
    vertical.forEach(({ coordinate, outward, covered }) => {
      uncoveredIntervals(region.minZ, region.maxZ, covered).forEach(
        ([min, max]) =>
          boundaries.push({ axis: "x", coordinate, min, max, outward }),
      );
    });

    const horizontal = [
      {
        coordinate: region.minZ,
        outward: -1 as const,
        covered: others
          .filter(
            (other) =>
              other.minZ < region.minZ - 1e-6 &&
              other.maxZ >= region.minZ - 1e-6,
          )
          .map((other) => [other.minX, other.maxX] as const),
      },
      {
        coordinate: region.maxZ,
        outward: 1 as const,
        covered: others
          .filter(
            (other) =>
              other.minZ <= region.maxZ + 1e-6 &&
              other.maxZ > region.maxZ + 1e-6,
          )
          .map((other) => [other.minX, other.maxX] as const),
      },
    ];
    horizontal.forEach(({ coordinate, outward, covered }) => {
      uncoveredIntervals(region.minX, region.maxX, covered).forEach(
        ([min, max]) =>
          boundaries.push({ axis: "z", coordinate, min, max, outward }),
      );
    });
  });
  return boundaries;
};

/**
 * The protected lane is wider than the bare core's normal growth envelope.
 * Unusually long, honestly simulated attachments can still require the player
 * to turn, collect differently, or grow before passing the authored room exit.
 */
export const LITERAL_DOORWAY_CLEAR_WIDTH = 10;
export const LITERAL_ROUTE_HALF_WIDTH = LITERAL_DOORWAY_CLEAR_WIDTH / 2;

/**
 * A finite, authored progression. Negative Z is always forward, including the
 * room exit, so a camera or minimap never has to reinterpret the route.
 */
export const LITERAL_STAGES: readonly LiteralStage[] = [
  {
    id: "microscope-slide",
    label: "Microscope slide",
    worldKinds: ["microscopic-sea", "fiber-bed"],
    eligibleEraIds: [
      "virus-garden",
      "cellular-sea",
      "microbe-meadow",
      "fiber-pollen",
    ],
    nearZ: 34,
    farZ: 18,
  },
  {
    id: "tabletop",
    label: "Study tabletop",
    worldKinds: ["dust-surface", "tabletop"],
    eligibleEraIds: [
      "dust-country",
      "granule-ground",
      "pocket-world",
      "tabletop-trek",
    ],
    nearZ: 18,
    farZ: 4,
  },
  {
    id: "room",
    label: "Study room",
    worldKinds: ["interior"],
    eligibleEraIds: ["everyday-kingdom", "room-scale"],
    nearZ: 4,
    farZ: -28,
  },
  {
    id: "porch",
    label: "Porch",
    worldKinds: ["yard"],
    eligibleEraIds: ["vehicle-yard"],
    nearZ: -28,
    farZ: -40,
  },
  {
    id: "yard",
    label: "Front yard",
    worldKinds: ["yard"],
    eligibleEraIds: ["vehicle-yard", "house-yard"],
    nearZ: -40,
    farZ: -76,
  },
];

/**
 * One route-wide Z transform keeps shared architecture in the same world
 * coordinates as scale focus moves from slide to table, room, porch, and yard.
 */
export const LITERAL_ROUTE_Z_OFFSET =
  -(LITERAL_STAGES[0].nearZ + LITERAL_STAGES[0].farZ) / 2;

/**
 * Permanent architecture only: supports, walls, and thresholds. Movable
 * furniture is deliberately absent and comes from LITERAL_PROP_ANCHORS using
 * the same stable curio identity the pickup renderer uses.
 */
export const LITERAL_ARCHITECTURE: readonly LiteralArchitecturePrimitive[] = [
  {
    id: "architecture/glass-specimen-slide",
    label: "Glass specimen slide",
    semanticIdentity: "glass-specimen-slide",
    primitive: "box",
    collision: "support",
    position: [0, 5.15, 26],
    dimensions: [32, 0.08, 28],
    rotation: [0, 0, 0],
    visibleIn: ["microscope-slide", "tabletop"],
  },
  {
    id: "architecture/microscope-stand",
    label: "Microscope stand",
    semanticIdentity: "microscope-stand",
    primitive: "box",
    collision: "barrier",
    position: [-18, 8.2, 27],
    dimensions: [4, 6.4, 5],
    rotation: [0, 0, 0],
    visibleIn: ["microscope-slide", "tabletop"],
  },
  {
    id: "architecture/microscope-objective",
    label: "Microscope objective",
    semanticIdentity: "microscope-objective",
    primitive: "cylinder",
    collision: "barrier",
    position: [-18.5, 7.2, 25],
    dimensions: [2.5, 4, 2.5],
    rotation: [0, 0, 0],
    visibleIn: ["microscope-slide", "tabletop"],
  },
  {
    id: "architecture/study-work-surface",
    label: "Built-in study work surface",
    semanticIdentity: "study-work-surface",
    primitive: "box",
    collision: "support",
    position: [0, 4.8, 18],
    dimensions: [40, 0.6, 44],
    rotation: [0, 0, 0],
    visibleIn: ["microscope-slide", "tabletop"],
  },
  {
    id: "architecture/study-camera-apron",
    label: "Non-playable study camera apron",
    semanticIdentity: "study-work-surface-camera-apron",
    primitive: "box",
    collision: "none",
    position: [0, 4.8, 50],
    dimensions: [40, 0.6, 20],
    rotation: [0, 0, 0],
    visibleIn: ["microscope-slide", "tabletop"],
  },
  {
    id: "architecture/room-floor",
    label: "Study room floor",
    semanticIdentity: "study-room-floor",
    primitive: "box",
    collision: "support",
    position: [0, -0.13, -2],
    dimensions: [40, 0.3, 52],
    rotation: [0, 0, 0],
    visibleIn: ["tabletop", "room", "porch"],
  },
  {
    id: "architecture/room-wall-west",
    label: "West room wall",
    semanticIdentity: "room-wall-west",
    primitive: "box",
    collision: "barrier",
    position: [-20.5, 5, -2],
    dimensions: [1, 10, 52],
    rotation: [0, 0, 0],
    visibleIn: ["tabletop", "room", "porch"],
  },
  {
    id: "architecture/room-wall-east",
    label: "East room wall",
    semanticIdentity: "room-wall-east",
    primitive: "box",
    collision: "barrier",
    position: [20.5, 5, -2],
    dimensions: [1, 10, 52],
    rotation: [0, 0, 0],
    visibleIn: ["tabletop", "room", "porch"],
  },
  {
    id: "architecture/forward-wall-west",
    label: "West half of the forward wall",
    semanticIdentity: "forward-wall-west",
    primitive: "box",
    collision: "barrier",
    position: [-12.5, 5, -28.5],
    dimensions: [15, 10, 1],
    rotation: [0, 0, 0],
    visibleIn: ["room", "porch"],
  },
  {
    id: "architecture/forward-wall-east",
    label: "East half of the forward wall",
    semanticIdentity: "forward-wall-east",
    primitive: "box",
    collision: "barrier",
    position: [12.5, 5, -28.5],
    dimensions: [15, 10, 1],
    rotation: [0, 0, 0],
    visibleIn: ["room", "porch"],
  },
  {
    id: "architecture/forward-exit-opening",
    label: "Forward wall opening",
    semanticIdentity: "forward-exit-opening",
    primitive: "portal",
    collision: "none",
    position: [0, 4.5, -28.5],
    dimensions: [LITERAL_DOORWAY_CLEAR_WIDTH, 9, 1],
    rotation: [0, 0, 0],
    visibleIn: ["room", "porch"],
    clearWidth: LITERAL_DOORWAY_CLEAR_WIDTH,
  },
  {
    id: "architecture/porch-deck",
    label: "Porch deck",
    semanticIdentity: "porch-deck",
    primitive: "box",
    collision: "support",
    position: [0, -0.08, -34],
    dimensions: [18, 0.2, 12],
    rotation: [0, 0, 0],
    visibleIn: ["room", "porch", "yard"],
  },
  {
    id: "architecture/porch-rail-west",
    label: "West porch rail",
    semanticIdentity: "porch-rail-west",
    primitive: "box",
    collision: "barrier",
    position: [-9.5, 1, -34],
    dimensions: [1, 2, 12],
    rotation: [0, 0, 0],
    visibleIn: ["porch", "yard"],
  },
  {
    id: "architecture/porch-rail-east",
    label: "East porch rail",
    semanticIdentity: "porch-rail-east",
    primitive: "box",
    collision: "barrier",
    position: [9.5, 1, -34],
    dimensions: [1, 2, 12],
    rotation: [0, 0, 0],
    visibleIn: ["porch", "yard"],
  },
  {
    id: "architecture/yard-ground",
    label: "Front yard ground",
    semanticIdentity: "front-yard-ground",
    primitive: "box",
    collision: "support",
    position: [0, -0.13, -58],
    dimensions: [48, 0.3, 36],
    rotation: [0, 0, 0],
    visibleIn: ["room", "porch", "yard"],
  },
];

/**
 * Authored prop anchors reference catalog identities instead of duplicating
 * geometry as scenery. visibleIn controls context; collectibleIn controls when
 * the prop can participate in physics and be attached to the roll.
 */
export const LITERAL_PROP_ANCHORS: readonly LiteralPropAnchor[] = [
  {
    id: "prop/slide-pollen",
    curioId: "fiber-pollen/pollen-grain",
    curioName: "pollen grain",
    position: [-10, 5.3, 31],
    rotation: [0, 0.4, 0],
    footprintRadius: 0.35,
    visibleIn: ["microscope-slide"],
    collectibleIn: ["microscope-slide"],
  },
  {
    id: "prop/slide-tardigrade",
    curioId: "fiber-pollen/tardigrade",
    curioName: "tardigrade",
    position: [10, 5.3, 26],
    rotation: [0, -0.65, 0],
    footprintRadius: 0.5,
    visibleIn: ["microscope-slide"],
    collectibleIn: ["microscope-slide"],
  },
  {
    id: "prop/slide-hair-fiber",
    curioId: "fiber-pollen/hair-fiber",
    curioName: "hair fiber",
    position: [-9, 5.25, 20],
    rotation: [0, 1.1, 0],
    footprintRadius: 0.65,
    visibleIn: ["microscope-slide"],
    collectibleIn: ["microscope-slide"],
  },
  {
    id: "prop/tabletop-crumb",
    curioId: "dust-country/crumb",
    curioName: "crumb",
    position: [-6, 5.2, 16],
    rotation: [0, 0.2, 0],
    footprintRadius: 0.45,
    visibleIn: ["tabletop"],
    collectibleIn: ["tabletop"],
  },
  {
    id: "prop/tabletop-button",
    curioId: "pocket-world/button",
    curioName: "button",
    position: [7, 5.2, 16],
    rotation: [0, -0.3, 0],
    footprintRadius: 0.65,
    visibleIn: ["tabletop"],
    collectibleIn: ["tabletop"],
  },
  {
    id: "prop/tabletop-pencil",
    curioId: "tabletop-trek/pencil",
    curioName: "pencil",
    position: [-8, 5.2, 11],
    rotation: [0, 0.75, 0],
    footprintRadius: 1.5,
    visibleIn: ["tabletop"],
    collectibleIn: ["tabletop"],
  },
  {
    id: "prop/tabletop-coffee-mug",
    curioId: "tabletop-trek/coffee-mug",
    curioName: "coffee mug",
    position: [9, 5.3, 9],
    rotation: [0, -0.5, 0],
    footprintRadius: 1.2,
    visibleIn: ["tabletop"],
    collectibleIn: ["tabletop"],
  },
  {
    id: "prop/tabletop-paperback",
    curioId: "tabletop-trek/paperback-book",
    curioName: "paperback book",
    position: [-10, 5.2, 5.8],
    rotation: [0, -0.25, 0],
    footprintRadius: 1.5,
    visibleIn: ["tabletop"],
    collectibleIn: ["tabletop"],
  },
  {
    id: "prop/room-shoe",
    curioId: "everyday-kingdom/shoe",
    curioName: "shoe",
    position: [-8.2, 0.5, 1],
    rotation: [0, 0.4, 0],
    footprintRadius: 1.2,
    visibleIn: ["room"],
    collectibleIn: ["room"],
  },
  {
    id: "prop/room-chair",
    curioId: "everyday-kingdom/chair",
    curioName: "chair",
    position: [9.5, 1.3, -4],
    rotation: [0, -0.45, 0],
    footprintRadius: 2,
    visibleIn: ["room"],
    collectibleIn: ["room"],
  },
  {
    id: "prop/room-couch",
    curioId: "everyday-kingdom/couch",
    curioName: "couch",
    position: [-13, 1.5, -11],
    rotation: [0, Math.PI / 2, 0],
    footprintRadius: 3,
    visibleIn: ["room"],
    collectibleIn: ["room"],
  },
  {
    id: "prop/room-floor-lamp",
    curioId: "everyday-kingdom/floor-lamp",
    curioName: "floor lamp",
    position: [14, 2, -18],
    rotation: [0, 0, 0],
    footprintRadius: 1.5,
    visibleIn: ["room"],
    collectibleIn: ["room"],
  },
  {
    id: "prop/room-guitar",
    curioId: "everyday-kingdom/guitar",
    curioName: "guitar",
    position: [-9.2, 1.2, -22],
    rotation: [0, -0.35, 0],
    footprintRadius: 1.5,
    visibleIn: ["room"],
    collectibleIn: ["room"],
  },
  {
    id: "prop/room-potted-plant",
    curioId: "everyday-kingdom/potted-plant",
    curioName: "potted plant",
    position: [10, 1.4, -24],
    rotation: [0, 0.6, 0],
    footprintRadius: 1.5,
    visibleIn: ["room"],
    collectibleIn: ["room"],
  },
  {
    id: "prop/porch-bicycle",
    curioId: "vehicle-yard/bicycle",
    curioName: "bicycle",
    position: [-7.2, 1.1, -34],
    rotation: [0, 0.2, 0],
    footprintRadius: 1.7,
    visibleIn: ["porch", "yard"],
    collectibleIn: ["porch", "yard"],
  },
  {
    id: "prop/yard-oak-tree",
    curioId: "house-yard/oak-tree",
    curioName: "oak tree",
    position: [-13, 4, -48],
    rotation: [0, 0.5, 0],
    footprintRadius: 3.5,
    visibleIn: ["porch", "yard"],
    collectibleIn: ["yard"],
  },
  {
    id: "prop/yard-garden-shed",
    curioId: "house-yard/garden-shed",
    curioName: "garden shed",
    position: [13, 2.8, -59],
    rotation: [0, -0.25, 0],
    footprintRadius: 4,
    visibleIn: ["porch", "yard"],
    collectibleIn: ["yard"],
  },
  {
    id: "prop/yard-compact-car",
    curioId: "vehicle-yard/compact-car",
    curioName: "compact car",
    position: [-10, 1.2, -68],
    rotation: [0, 0.15, 0],
    footprintRadius: 2.5,
    visibleIn: ["yard"],
    collectibleIn: ["yard"],
  },
];

export const LITERAL_PROTECTED_ROUTE = LITERAL_STAGES.map((stage) => ({
  stage: stage.id,
  centerX: 0,
  halfWidth: LITERAL_ROUTE_HALF_WIDTH,
  nearZ: stage.nearZ,
  farZ: stage.farZ,
})) satisfies readonly LiteralRouteSegment[];

export const LITERAL_STAGE_TRANSITIONS = [
  {
    from: "microscope-slide",
    to: "tabletop",
    atZ: 18,
    semantic: "scale-reveal",
  },
  {
    from: "tabletop",
    to: "room",
    atZ: 4,
    semantic: "surface-drop",
  },
  {
    from: "room",
    to: "porch",
    atZ: -28,
    semantic: "portal",
    viaArchitectureId: "architecture/forward-exit-opening",
  },
  {
    from: "porch",
    to: "yard",
    atZ: -40,
    semantic: "threshold",
  },
] as const satisfies readonly LiteralStageTransition[];

export const LITERAL_WORLD_LAYOUT = {
  entryStage: "microscope-slide",
  terminalStage: "yard",
  stages: LITERAL_STAGES,
  architecture: LITERAL_ARCHITECTURE,
  props: LITERAL_PROP_ANCHORS,
  route: LITERAL_PROTECTED_ROUTE,
  transitions: LITERAL_STAGE_TRANSITIONS,
} as const;

export function literalStageForEra(eraId: string) {
  return LITERAL_STAGES.find((stage) => stage.eligibleEraIds.includes(eraId));
}

export function literalArchitectureForStage(stage: LiteralStageId) {
  return LITERAL_ARCHITECTURE.filter((primitive) =>
    primitive.visibleIn.includes(stage),
  );
}

/** Highest authored support directly beneath an X/Z point, in layout space. */
export function literalSupportTopForPoint(
  stage: LiteralStageId,
  x: number,
  z: number,
) {
  let supportTop: number | null = null;
  for (const primitive of literalArchitectureForStage(stage)) {
    if (primitive.collision !== "support") continue;
    const [supportX, supportY, supportZ] = primitive.position;
    const [width, height, depth] = primitive.dimensions;
    if (
      Math.abs(x - supportX) > width / 2 ||
      Math.abs(z - supportZ) > depth / 2
    ) {
      continue;
    }
    supportTop = Math.max(
      supportTop ?? Number.NEGATIVE_INFINITY,
      supportY + height / 2,
    );
  }
  return supportTop;
}

export function literalPropsForStage(stage: LiteralStageId) {
  return LITERAL_PROP_ANCHORS.filter((prop) => prop.visibleIn.includes(stage));
}

export function collectibleLiteralPropsForStage(stage: LiteralStageId) {
  return LITERAL_PROP_ANCHORS.filter((prop) =>
    prop.collectibleIn.includes(stage),
  );
}
