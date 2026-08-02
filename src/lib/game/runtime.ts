import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  type Curio,
  ERAS,
  type Era,
  LEGACY_V3_ERA_NAMES,
  type ScienceSource,
  journeyHoursForEraProgress,
} from "../scale-data";
import {
  CORE_RADIUS_MIN,
  CORE_RADIUS_MAX,
  MAX_ROLL_ENVELOPE_FACTOR,
  type CollectibleIdentity,
  type QualityTier,
  canCollectPickup,
  circleAabbClearance,
  collectionProgressGain,
  collectibleIdentityFor,
  mashProxyScale,
  nextLayerAdvance,
  nextLayerObstacleRadius,
  obstacleCenterGap,
  progressAfterPickup,
  radiusForLayerProgress,
  resolveCircleAabbCollision,
  resolveCircularCollision,
  scaleTransitionDuration,
  scaleTransitionFrame,
} from "../game-rules";
import {
  type LegacyVisualStage,
  type WorldKind,
  boundedVerticalFov,
  floatingOriginShift,
  horizontalFovDegrees,
  legacyVisualStageAnchor,
  localChunkCoordinate,
  lodForProjectedDiameter,
  projectedDiameterPixels,
  semanticViewScale,
  stableWorldSeed,
  wantsRichProjectedDetail,
  worldPerformanceBudget,
  worldSpecForEra,
} from "../world-system";
import {
  aggregatePickups,
  type CollectionEntry,
  type GameMode,
  type MashRecordV4,
} from "../save-data";
import { deriveAchievements } from "../collection-progress";
import {
  type PerformanceProfile,
  performanceProfileSettings,
} from "../performance-profile";
import {
  advanceFrameDeadline,
  createPhaseRecorder,
  type RuntimePhase,
} from "./runtime-performance";
import {
  type BackgroundBand,
  COSMIC_BACKDROP_SHELLS,
  backgroundDepthCue,
  environmentDepthCue,
  foundationChunkAnchor,
  foundationDepthCue,
  foundationShellHeight,
  foundationShellTextureRates,
  foundationTextureRate,
  parallaxPitch,
  parallaxYaw,
  wrappedFoundationOffset,
  wrappedTextureOffset,
} from "./background-depth";
import {
  attachmentSupportScaleFit,
  contactLocalSurfaceDirection,
  directionalAttachmentEnvelopeXZ,
  nearestAabbContactDirectionXZ,
  relocateAttachmentForCoreGrowth,
  targetAttachmentCenterDistance,
  type AttachmentCircleXZ,
} from "./attachment-physics";
import {
  type CollectibleGeometryLibrary,
  createCollectibleGeometryLibrary,
  createCollectibleLodPool,
} from "./collectible-lod";
import { createCollectibleMarkerFactory } from "./collectible-markers";
import { createCollectibleVisualFactory } from "./collectible-visuals";
import {
  literalArchitectureForStage,
  literalPropsForStage,
  literalStageForEra,
  literalStageSurfaceY,
  literalSupportBoundaries,
  literalSupportTopForPoint,
  LITERAL_ROUTE_HALF_WIDTH,
  LITERAL_ROUTE_Z_OFFSET,
  type LiteralArchitecturePrimitive,
  type LiteralPropAnchor,
  type LiteralStage,
  type LiteralSupportRegion,
} from "./literal-world-layout";
import {
  type FoundationMotif,
  type FoundationPlan,
  foundationPlan,
} from "./foundation-plan";
import {
  pickupPopulationPlan,
  pickupSourceEraForSpawn,
  pickupSpawnPlacement,
  selectCurioForSpawn,
  type PickupSpawnPhase,
  type SpawnPityState,
} from "./spawn-policy";
import { createSpawnQueue } from "./spawn-queue";

type Pickup = {
  root: THREE.Group;
  visual: THREE.Object3D;
  marker: THREE.Sprite | null;
  curio: Curio;
  sourceEra: number;
  size: number;
  visualRadius: number;
  bulkRadius: number;
  big: boolean;
  baseY: number;
  grounded: boolean;
  wiggle: number;
  identity: CollectibleIdentity;
  drawCalls: number;
  bornAt: number;
  retireStartedAt: number | null;
  wantsRichDetail: boolean;
  richAdmitted: boolean;
  handoffX: number | null;
  handoffY: number | null;
  handoffZ: number | null;
  renderedScale: THREE.Vector3;
  renderedScaleY: number;
  authoredAnchorId: string | null;
};

function pseudo(seed: number) {
  const value = Math.sin(seed * 9283.312 + 77.13) * 43758.5453;
  return value - Math.floor(value);
}

const PERIODIC_CAPABLE_WORLD_KINDS = new Set<WorldKind>([
  "microscopic-sea",
  "fiber-bed",
  "dust-surface",
  "tabletop",
  "interior",
  "yard",
  "city",
  "landscape",
]);
const MASH_HISTORY_LIMIT = 96;
const MAX_VISIBLE_MASH_PIECES = 32;
const FOUNDATION_OVERLAY_RADIUS = 94;
const LOCAL_FOUNDATION_CHUNK_SIZE = 56;
const PLANET_FOUNDATION_CHUNK_SIZE = 80;
const PLANET_FOUNDATION_ACTIVE_RADIUS = 32;
const PLANET_FOUNDATION_RADIUS = 80;
const PLANET_FOUNDATION_CENTER_Y = -79;

function worldChunkSize(kind: WorldKind) {
  return kind === "interior" ? 256 : 128;
}

function worldUsesPeriodicTiles(eraName: string) {
  const world = worldSpecForEra(eraName);
  return (
    world.topology !== "finite" &&
    PERIODIC_CAPABLE_WORLD_KINDS.has(world.kind)
  );
}

function legacyVisualIndexForEra(index: number) {
  const era = ERAS[index];
  const exact = LEGACY_V3_ERA_NAMES.findIndex((name) => name === era.name);
  if (exact >= 0) return exact;
  const authoredFallbacks: Record<string, number> = {
    "Nuclear Heart": 3,
    "Virus Garden": 7,
    "Microbe Meadow": 7,
    "Granule Ground": 9,
    "Tabletop Trek": 10,
    "Room Scale": 11,
    "House & Yard": 12,
    "City Streets": 13,
    "Regional Map": 14,
    "Moon Scale": 15,
    "Giant Worlds": 15,
    "Stellar Neighborhood": 16,
    "Galaxy Cluster Web": 19,
  };
  if (era.name in authoredFallbacks) return authoredFallbacks[era.name];
  const anchor = legacyVisualStageAnchor(
    worldSpecForEra(era.name).legacyStage,
  );
  return LEGACY_V3_ERA_NAMES.findIndex((name) => name === anchor);
}

const WORLD_NAMES: Record<WorldKind, string> = {
  void: "a foaming spacetime void",
  "particle-field": "a crowded particle field",
  "microscopic-sea": "a living microscopic sea",
  "fiber-bed": "a woven forest of fibers",
  "dust-surface": "a sunlit floor of grains",
  tabletop: "a giant tabletop landscape",
  interior: "a furnished room with a way outside",
  yard: "a connected house, yard, and street",
  city: "a traversable city grid",
  landscape: "a continuous region of land and water",
  "planet-surface": "the curved surface of a world",
  "giant-atmosphere": "the cloud tops above a giant world",
  "stellar-field": "a stellar neighborhood",
  "orbital-system": "an ocean of orbital systems",
  "galaxy-field": "a garden of galaxies",
  "cosmic-web": "the luminous cosmic web",
  "speculative-beyond": "a speculative infinity of realities",
};

const GAMEPLAY_BULK_FACTORS: Record<Curio["shape"], number> = {
  bubble: 0.18,
  spark: 0.38,
  quark: 0.72,
  hadron: 1.05,
  atom: 0.9,
  molecule: 0.68,
  virus: 0.48,
  cell: 0.62,
  fiber: 0.24,
  dust: 0.52,
  stone: 1.25,
  object: 0.58,
  chair: 0.32,
  car: 0.7,
  house: 0.18,
  mountain: 1.25,
  planet: 1,
  star: 1.08,
  system: 0.52,
  galaxy: 0.6,
  universe: 0.5,
};

const MAX_PICKUP_PROMOTIONS_PER_FRAME = 3;
const PICKUP_ENTRANCE_MS = 800;
const PICKUP_RETIRE_MS = 600;
const PICKUP_COLLISION_SCALE = 0.55;
const PICKUP_RETIRE_DISTANCE = 54;
const PICKUP_RICH_NEAR_DISTANCE = 18;
const MAX_POP_BURSTS = 12;

const pickupEntranceScale = (bornAt: number, now: number) => {
  const progress = Math.min(
    1,
    Math.max(0, (now - bornAt) / PICKUP_ENTRANCE_MS),
  );
  return 1 - (1 - progress) ** 3;
};
const pickupLifecycleScale = (pickup: Pickup, now: number) => {
  const entranceScale = pickupEntranceScale(pickup.bornAt, now);
  if (pickup.retireStartedAt === null) return entranceScale;
  const progress = Math.min(
    1,
    Math.max(0, (now - pickup.retireStartedAt) / PICKUP_RETIRE_MS),
  );
  const eased = progress * progress * (3 - 2 * progress);
  return entranceScale * (1 - eased);
};

export type MutableRef<T> = { current: T };

export type GameState = {
  x: number;
  z: number;
  originX: number;
  originZ: number;
  literalSceneOriginX: number | null;
  literalSceneOriginZ: number | null;
  vx: number;
  vz: number;
  radius: number;
  lens: number;
  progress: number;
  picked: number;
  zooms: number;
  cycles: number;
  era: number;
  mode: GameMode;
  running: boolean;
  sound: boolean;
  lastPickup: number;
  lastSave: number;
  id: number;
};

export type HudState = {
  hours: number;
  picked: number;
  era: number;
  journeyEra: number;
  progress: number;
  radius: number;
  lens: number;
  zooms: number;
  cycles: number;
};

export type FactCard = {
  name: string;
  fact: string;
  source: ScienceSource;
  symbol?: string;
  color?: string;
};

export type FactKind = "pickup" | "era" | "lab";

export type RuntimeBindings = {
  gameRef: MutableRef<GameState>;
  keysRef: MutableRef<Record<string, boolean>>;
  joystickRef: MutableRef<{
    active: boolean;
    x: number;
    y: number;
    originX: number;
    originY: number;
  }>;
  modalOpenRef: MutableRef<boolean>;
  mashHistoryRef: MutableRef<MashRecordV4[]>;
  collectedAuthoredAnchorIdsRef: MutableRef<Set<string>>;
  collectionRef: MutableRef<CollectionEntry[]>;
  advanceLayerRef: MutableRef<(() => boolean) | null>;
  labEra: number | null;
  performanceProfile: PerformanceProfile;
  setToast: (message: string) => void;
  setAchievement: (message: string) => void;
  setPickupMilestone: (message: string) => void;
  setLastFact: (fact: FactCard, kind: FactKind) => void;
  setCollection: (entries: CollectionEntry[]) => void;
  setHud: (hud: HudState) => void;
  ping: (pitch?: number, fanfare?: boolean) => void;
  playPickupSound: (curio: Curio, sourceEra: number) => void;
  persistSnapshot: () => void;
};

/**
 * Owns one Three.js scene and every GPU/browser resource it creates.
 *
 * The returned destroy function is synchronous even though Three is lazy-loaded.
 * This keeps Svelte effects leak-free when Scale Lab restarts during the import.
 */
export function mountGame(
  mount: HTMLDivElement,
  bindings: RuntimeBindings,
): () => void {
  const {
    gameRef,
    keysRef,
    joystickRef,
    modalOpenRef,
    mashHistoryRef,
    collectedAuthoredAnchorIdsRef,
    collectionRef,
    advanceLayerRef,
    labEra,
    performanceProfile: requestedPerformanceProfile,
    setToast,
    setAchievement,
    setPickupMilestone,
    setLastFact,
    setCollection,
    setHud,
    ping,
    playPickupSound,
    persistSnapshot,
  } = bindings;

  let disposed = false;
  let disposeScene: (() => void) | undefined;
  const bootScene = async () => {
  if (disposed) return;
  const game = gameRef.current;
  const debugWindow = window as typeof window & {
    __QUARKATAMARI_PERFORMANCE_REQUESTED__?: boolean;
    __QUARKATAMARI_FORCED_QUALITY__?: QualityTier;
    __QUARKATAMARI_PERFORMANCE__?: {
      snapshot: () => unknown;
      removePickups: (count: number) => {
        removed: number;
        active: number;
        queued: number;
      };
      completeLayer: () => boolean;
      previewEra: (index: number) => number;
      setPlayerPosition: (x: number, z: number) => { x: number; z: number };
      setLens: (value: number) => number;
      emitPickupBursts: (count: number) => number;
      collectCurrentPickup: () => string | null;
      collectSingletonPickup: () => string | null;
      retireSingletonPickup: () => string | null;
    };
  };
  const phaseRecorder = debugWindow.__QUARKATAMARI_PERFORMANCE_REQUESTED__
    ? createPhaseRecorder()
    : null;
  const readPerformanceClock = () => performance.now();
  const phaseStart = () => (phaseRecorder ? readPerformanceClock() : 0);
  const phaseEnd = (phase: RuntimePhase, startedAt: number) => {
    if (phaseRecorder) {
      phaseRecorder.record(phase, readPerformanceClock() - startedAt);
    }
  };
  // A coarse primary pointer marks phones and tablets regardless of
  // orientation — a landscape iPhone Pro Max is 932 CSS px wide and would
  // otherwise be classified as a desktop GPU.
  const coarsePointer =
    window.matchMedia?.("(pointer: coarse)").matches === true;
  const reducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const midBackdropTravelRate = backgroundDepthCue(
    "mid",
    reducedMotion,
  ).travelRate;
  const nearBackdropTravelRate = backgroundDepthCue(
    "near",
    reducedMotion,
  ).travelRate;
  const farBackdropTravelRate = backgroundDepthCue(
    "far",
    reducedMotion,
  ).travelRate;
  const isCompactView = (viewportWidth: number) =>
    coarsePointer || viewportWidth <= 860;
  const compactGpu = isCompactView(window.innerWidth);
  const forcedQualityTier =
    debugWindow.__QUARKATAMARI_FORCED_QUALITY__ ?? null;
  const performanceProfile: PerformanceProfile = forcedQualityTier
    ? forcedQualityTier === "battery"
      ? "battery"
      : "standard"
    : requestedPerformanceProfile;
  const profileSettings = performanceProfileSettings(
    performanceProfile,
    compactGpu,
  );
  const qualityTier: QualityTier =
    forcedQualityTier ?? profileSettings.qualityTier;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.06, 220);
  const renderer = new THREE.WebGLRenderer({
    antialias: profileSettings.antialias,
    alpha: false,
  });
  const richPickupLimit = worldPerformanceBudget(qualityTier).maxRichObjects;
  const reducedWorldDetail = () =>
    compactGpu || qualityTier !== "high";
  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio || 1,
      profileSettings.pixelRatioCap,
    ),
  );
  renderer.shadowMap.enabled = profileSettings.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.className = "three-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  mount.prepend(renderer.domElement);

  let activeIndex = labEra ?? game.era;
  let debugEraOverride: number | null = null;
  let activeEra = ERAS[activeIndex];
  let early =
    activeEra.realm === "prephysical" || activeEra.realm === "particle";

  const deepColor = new THREE.Color(activeEra.palette[0]);
  const middleColor = new THREE.Color(activeEra.palette[1]);
  scene.background = deepColor;
  scene.fog = new THREE.FogExp2(deepColor, early ? 0.017 : 0.024);

  const hemisphere = new THREE.HemisphereLight(0xdff8ff, 0x28112f, early ? 1.5 : 1.1);
  scene.add(hemisphere);
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
  keyLight.position.set(-7, 12, 8);
  keyLight.castShadow = profileSettings.shadows;
  keyLight.shadow.mapSize.set(
    qualityTier === "high" ? (compactGpu ? 1024 : 2048) : 1024,
    qualityTier === "high" ? (compactGpu ? 1024 : 2048) : 1024,
  );
  keyLight.shadow.camera.left = -22;
  keyLight.shadow.camera.right = 22;
  keyLight.shadow.camera.top = 22;
  keyLight.shadow.camera.bottom = -22;
  scene.add(keyLight);
  const glowLight = new THREE.PointLight(activeEra.palette[2], 8, 22, 2);
  glowLight.position.set(4, 5, -3);
  scene.add(glowLight);

  const groundMaterial = new THREE.MeshStandardMaterial({
    color: middleColor.clone().lerp(new THREE.Color("#ffdff1"), 0.18).multiplyScalar(0.82),
    roughness: 0.78,
    metalness: 0,
  });
  const foundationSurfaceMaterials = new Set<THREE.MeshStandardMaterial>();
  const literalFoundationSurfaceMaterials = new Set<THREE.MeshStandardMaterial>();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(95, 96), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.visible = true;
  scene.add(ground);
  const foundationOverlayMaterial = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const foundationOverlay = new THREE.Mesh(
    new THREE.CircleGeometry(FOUNDATION_OVERLAY_RADIUS, 72),
    foundationOverlayMaterial,
  );
  foundationOverlay.name = "foundation:surface-memory";
  foundationOverlay.rotation.x = -Math.PI / 2;
  foundationOverlay.position.y = 0.18;
  foundationOverlay.renderOrder = 2;
  foundationOverlay.visible = false;
  scene.add(foundationOverlay);
  let foundationOverlayHeight = 0.18;
  let foundationMemoryVisible = false;
  const transitionRugMaterial = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const transitionRug = new THREE.Mesh(
    new THREE.CircleGeometry(FOUNDATION_OVERLAY_RADIUS, 72),
    transitionRugMaterial,
  );
  transitionRug.name = "foundation:incoming-rug";
  transitionRug.rotation.x = -Math.PI / 2;
  transitionRug.renderOrder = 3;
  transitionRug.visible = false;
  scene.add(transitionRug);
  const transitionShellMaterial = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const transitionShell = new THREE.Mesh(
    new THREE.SphereGeometry(
      PLANET_FOUNDATION_RADIUS,
      compactGpu ? 40 : 56,
      compactGpu ? 28 : 38,
    ),
    transitionShellMaterial,
  );
  transitionShell.name = "foundation:incoming-shell";
  transitionShell.rotation.x = Math.PI / 2;
  transitionShell.renderOrder = 3;
  transitionShell.visible = false;
  scene.add(transitionShell);
  let transitionRugTexture: THREE.CanvasTexture | null = null;
  let transitionRugKey = "";
  let transitionRugMode: "none" | "plane" | "shell" = "none";
  let transitionRugHeight = 0.035;
  let transitionRugTargetOpacity = 0;
  let transitionHandoffBlend = 0;
  const grid = new THREE.GridHelper(170, 90, activeEra.palette[2], activeEra.palette[2]);
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  gridMaterials.forEach((material) => {
    material.transparent = true;
    material.opacity = activeEra.realm === "matter" ? 0.12 : 0.08;
  });
  grid.position.y = 0.012;
  grid.visible = true;
  scene.add(grid);

  const dustPositions: number[] = [];
  const dustColors: number[] = [];
  const pop = new THREE.Color(activeEra.palette[2]);
  for (let i = 0; i < 620; i += 1) {
    const angle = pseudo(i * 3.17) * Math.PI * 2;
    const radius = 8 + pseudo(i * 7.31) * 75;
    dustPositions.push(
      Math.cos(angle) * radius,
      -3 + pseudo(i * 1.91) * 18,
      Math.sin(angle) * radius,
    );
    const color = pop.clone().lerp(new THREE.Color(0xffffff), pseudo(i * 8.3) * 0.7);
    dustColors.push(color.r, color.g, color.b);
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.Float32BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute("color", new THREE.Float32BufferAttribute(dustColors, 3));
  const dustMaterial = new THREE.PointsMaterial({
    size: early ? 0.11 : 0.06,
    transparent: true,
    opacity: early ? 0.72 : 0.35,
    vertexColors: true,
    depthWrite: false,
  });
  const dustField = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dustField);

  const farPickupMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshToonMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.88,
    }),
    512,
  );
  farPickupMesh.count = 0;
  farPickupMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  farPickupMesh.frustumCulled = false;
  scene.add(farPickupMesh);
  const pickupColorCache = new Map<string, THREE.Color>();
  let baseSceneDrawCalls = 0;
  let baseSceneDrawCallsDirty = true;
  let richPickupDrawCallBudget = 0;
  let richPickupDrawCalls = 0;
  const minimumDrawCallPipelineReserve = profileSettings.shadows ? 16 : 4;
  let unaccountedDrawCallReserve = minimumDrawCallPipelineReserve;

  const environmentGroup = new THREE.Group();
  environmentGroup.name = "environment:physical";
  scene.add(environmentGroup);
  const nearBackdropGroup = new THREE.Group();
  nearBackdropGroup.name = "environment:near";
  nearBackdropGroup.renderOrder = -10;
  scene.add(nearBackdropGroup);
  const midBackdropGroup = new THREE.Group();
  midBackdropGroup.name = "environment:mid";
  midBackdropGroup.renderOrder = -20;
  scene.add(midBackdropGroup);
  const farBackdropGroup = new THREE.Group();
  farBackdropGroup.name = "environment:far";
  farBackdropGroup.renderOrder = -30;
  scene.add(farBackdropGroup);
  const substrateGroup = new THREE.Group();
  substrateGroup.name = "substrate:root";
  const substrateNearestGroup = new THREE.Group();
  substrateNearestGroup.name = "substrate:nearest";
  substrateNearestGroup.renderOrder = -10;
  const substrateCompressedGroup = new THREE.Group();
  substrateCompressedGroup.name = "substrate:compressed";
  substrateCompressedGroup.renderOrder = -20;
  substrateGroup.add(substrateNearestGroup, substrateCompressedGroup);
  scene.add(substrateGroup);
  const backdropRenderOrder: Readonly<Record<BackgroundBand, number>> = {
    near: -10,
    mid: -20,
    far: -30,
  };
  const stampBackdropRenderOrder = (
    root: THREE.Object3D,
    band: BackgroundBand,
  ) => {
    root.traverse((object) => {
      if (object instanceof THREE.Group) {
        object.renderOrder = backdropRenderOrder[band];
      }
    });
  };
  let centralSceneryCompact: boolean | null = null;

  const PERIODIC_TILE_OFFSETS = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ] as const;

  const addPeriodicSubstrateCopies = (
    root: THREE.Group,
    chunkSize: number,
  ) => {
    const authoredChildren = [...root.children];
    const allTiles = [[0, 0], ...PERIODIC_TILE_OFFSETS] as const;
    authoredChildren.forEach((child) => {
      if (child instanceof THREE.InstancedMesh) {
        const combined = new THREE.InstancedMesh(
          child.geometry,
          child.material,
          child.count * allTiles.length,
        );
        combined.userData.periodicCopy = true;
        combined.userData.sharedCollectibleGeometry =
          child.userData.sharedCollectibleGeometry;
        const sourceMatrix = new THREE.Matrix4();
        const tileMatrix = new THREE.Matrix4();
        const combinedMatrix = new THREE.Matrix4();
        const instanceColor = new THREE.Color();
        let target = 0;
        allTiles.forEach(([tileX, tileZ]) => {
          tileMatrix.makeTranslation(
            tileX * chunkSize,
            0,
            tileZ * chunkSize,
          );
          for (let source = 0; source < child.count; source += 1) {
            child.getMatrixAt(source, sourceMatrix);
            combinedMatrix.multiplyMatrices(tileMatrix, sourceMatrix);
            combined.setMatrixAt(target, combinedMatrix);
            if (child.instanceColor) {
              child.getColorAt(source, instanceColor);
              combined.setColorAt(target, instanceColor);
            }
            target += 1;
          }
        });
        combined.count = target;
        combined.instanceMatrix.needsUpdate = true;
        if (combined.instanceColor) {
          combined.instanceColor.needsUpdate = true;
        }
        combined.castShadow = false;
        combined.receiveShadow = false;
        child.dispose();
        root.remove(child);
        root.add(combined);
        return;
      }
      if (child instanceof THREE.Points) {
        const sourcePositions = child.geometry.getAttribute("position");
        const sourceColors = child.geometry.getAttribute("color");
        const positions: number[] = [];
        const colors: number[] = [];
        allTiles.forEach(([tileX, tileZ]) => {
          for (let point = 0; point < sourcePositions.count; point += 1) {
            positions.push(
              sourcePositions.getX(point) + tileX * chunkSize,
              sourcePositions.getY(point),
              sourcePositions.getZ(point) + tileZ * chunkSize,
            );
            if (sourceColors) {
              colors.push(
                sourceColors.getX(point),
                sourceColors.getY(point),
                sourceColors.getZ(point),
              );
            }
          }
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        if (colors.length > 0) {
          geometry.setAttribute(
            "color",
            new THREE.Float32BufferAttribute(colors, 3),
          );
        }
        const combined = new THREE.Points(geometry, child.material);
        combined.userData.periodicCopy = true;
        root.remove(child);
        child.geometry.dispose();
        root.add(combined);
      }
    });
  };

  const addPeriodicEnvironmentLod = (
    root: THREE.Group,
    chunkSize: number,
  ) => {
    const authoredChildren = [...root.children];
    const instancedFamilies: THREE.InstancedMesh[] = [];
    const proxyDescriptors: {
      center: THREE.Vector3;
      size: THREE.Vector3;
      color: THREE.Color;
    }[] = [];
    root.updateMatrixWorld(true);

    authoredChildren.forEach((child) => {
      let containsInstancedMesh = false;
      let color = new THREE.Color(activeEra.palette[1]);
      child.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) {
          containsInstancedMesh = true;
          instancedFamilies.push(object);
        }
        if (object instanceof THREE.Mesh) {
          const firstMaterial = Array.isArray(object.material)
            ? object.material[0]
            : object.material;
          if (firstMaterial && "color" in firstMaterial) {
            color = (
              firstMaterial as THREE.MeshBasicMaterial
            ).color.clone();
          }
        }
      });
      if (containsInstancedMesh) {
        return;
      }
      const bounds = new THREE.Box3().setFromObject(child);
      if (bounds.isEmpty()) return;
      const center = bounds.getCenter(new THREE.Vector3());
      root.worldToLocal(center);
      const size = bounds.getSize(new THREE.Vector3());
      if (size.lengthSq() <= 0.0001) return;
      child.userData.authoredSceneryDetail = true;
      proxyDescriptors.push({ center, size, color });
    });

    const rootInverse = root.matrixWorld.clone().invert();
    instancedFamilies.forEach((family) => {
      family.updateMatrixWorld(true);
      const familyToRoot = new THREE.Matrix4().multiplyMatrices(
        rootInverse,
        family.matrixWorld,
      );
      const combined = new THREE.InstancedMesh(
        family.geometry,
        family.material,
        family.count * PERIODIC_TILE_OFFSETS.length,
      );
      combined.userData.periodicCopy = true;
      const sourceMatrix = new THREE.Matrix4();
      const tileMatrix = new THREE.Matrix4();
      const rootedMatrix = new THREE.Matrix4();
      const combinedMatrix = new THREE.Matrix4();
      const instanceColor = new THREE.Color();
      let target = 0;
      PERIODIC_TILE_OFFSETS.forEach(([tileX, tileZ]) => {
        tileMatrix.makeTranslation(
          tileX * chunkSize,
          0,
          tileZ * chunkSize,
        );
        for (let source = 0; source < family.count; source += 1) {
          family.getMatrixAt(source, sourceMatrix);
          rootedMatrix.multiplyMatrices(familyToRoot, sourceMatrix);
          combinedMatrix.multiplyMatrices(tileMatrix, rootedMatrix);
          combined.setMatrixAt(target, combinedMatrix);
          if (family.instanceColor) {
            family.getColorAt(source, instanceColor);
            combined.setColorAt(target, instanceColor);
          }
          target += 1;
        }
      });
      combined.count = target;
      combined.instanceMatrix.needsUpdate = true;
      if (combined.instanceColor) {
        combined.instanceColor.needsUpdate = true;
      }
      combined.castShadow = false;
      combined.receiveShadow = false;
      root.add(combined);
    });

    const addProxyTiles = (
      tileOffsets: readonly (readonly [number, number])[],
      maximumInstances: number,
      opacity: number,
      central = false,
    ) => {
      const instanceLimit = Math.min(
        proxyDescriptors.length * tileOffsets.length,
        maximumInstances,
      );
      if (instanceLimit === 0) return;
      const proxies = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshToonMaterial({
          color: "#ffffff",
          transparent: true,
          opacity,
        }),
        instanceLimit,
      );
      proxies.userData.periodicCopy = true;
      proxies.userData.centralSceneryProxy = central;
      proxies.visible = !central;
      const dummy = new THREE.Object3D();
      let instance = 0;
      for (const [tileX, tileZ] of tileOffsets) {
        for (const descriptor of proxyDescriptors) {
          if (instance >= instanceLimit) break;
          dummy.position.set(
            descriptor.center.x + tileX * chunkSize,
            descriptor.center.y,
            descriptor.center.z + tileZ * chunkSize,
          );
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(
            Math.max(0.04, descriptor.size.x),
            Math.max(0.04, descriptor.size.y),
            Math.max(0.04, descriptor.size.z),
          );
          dummy.updateMatrix();
          proxies.setMatrixAt(instance, dummy.matrix);
          proxies.setColorAt(instance, descriptor.color);
          instance += 1;
        }
      }
      proxies.count = instance;
      proxies.instanceMatrix.needsUpdate = true;
      if (proxies.instanceColor) proxies.instanceColor.needsUpdate = true;
      proxies.castShadow = false;
      proxies.receiveShadow = false;
      root.add(proxies);
    };
    const instanceBudget =
      worldPerformanceBudget(qualityTier).maxSceneryProxyInstances;
    addProxyTiles(
      PERIODIC_TILE_OFFSETS,
      Math.floor(instanceBudget * 0.45),
      0.68,
    );
    addProxyTiles([[0, 0]], Math.floor(instanceBudget * 0.1), 0.78, true);
  };

  const setCentralSceneryLod = (compact: boolean) => {
    if (compact === centralSceneryCompact) return;
    centralSceneryCompact = compact;
    environmentGroup.children.forEach((child) => {
      if (child.userData.authoredSceneryDetail) {
        child.visible = !compact;
      } else if (child.userData.centralSceneryProxy) {
        child.visible = compact;
      }
    });
    baseSceneDrawCallsDirty = true;
  };

  type SceneryCollider = {
    x: number;
    z: number;
    halfWidth: number;
    halfDepth: number;
  };
  let sceneryColliders: SceneryCollider[] = [];
  let literalPlayableBounds: LiteralSupportRegion | null = null;
  let literalPlayableRegions: LiteralSupportRegion[] = [];
  let semanticResidencyKey = "";
  let substrateLayerIndices: number[] = [];
  let substrateAuthoredInstances = 0;
  let substrateGenericInstances = 0;
  let substrateRenderedAuthoredInstances = 0;
  let substrateRenderedGenericInstances = 0;
  let substrateFoundationPlan: FoundationPlan = foundationPlan(0, ERAS);
  let substrateNearestUsesPeriodicCopies = false;
  let substrateNearestUsesPlanetWrap = false;
  let substrateCompressedUsesPeriodicCopies = false;
  let substrateNearestChunkSize = LOCAL_FOUNDATION_CHUNK_SIZE;
  let environmentTravelRate = 0;
  let substrateNearestTravelRate = 0;
  let substrateCompressedTravelRate = 0;
  let substrateNearestGrounded = false;
  let substrateNearestPlacement: FoundationPlan["presentation"] = "none";
  let substrateNearestVerticalScale = 1;
  let substrateNearestLocalRadius = 0;
  let substrateNearestMinY = 0;
  let substrateNearestMaxY = 0;
  let substrateNearestSampleX = 0;
  let substrateNearestSampleZ = 0;
  let substrateNearestUnderfootInstances = 0;
  let substratePlanetFoundationPhaseX = Number.NaN;
  let substratePlanetFoundationPhaseZ = Number.NaN;
  let substrateCompressedGrounded = false;
  let substrateCompressedPlacement: FoundationPlan["presentation"] = "none";
  type PlanetFoundationTransform = {
    anchorX: number;
    anchorZ: number;
    yaw: number;
    scale: number;
    verticalScale: number;
  };
  type PlanetFoundationBatch = {
    transforms: PlanetFoundationTransform[];
    meshes: THREE.InstancedMesh[];
  };
  const substratePlanetFoundationBatches: PlanetFoundationBatch[] = [];
  const substratePlanetFoundationDummy = new THREE.Object3D();
  const substratePlanetFoundationNormal = new THREE.Vector3();
  const substratePlanetFoundationUp = new THREE.Vector3(0, 1, 0);
  let collectibleGeometryLibrary: CollectibleGeometryLibrary | null = null;

  const substrateKeyFor = (viewScale: number) =>
    foundationPlan(viewScale, ERAS).key;

  const substratePosition = (
    presentation: FoundationPlan["presentation"],
    motif: FoundationMotif,
    seed: number,
    depth: number,
  ) => {
    const angle = pseudo(seed * 1.71 + depth * 19) * Math.PI * 2;
    const radius = 2.4 + pseudo(seed * 4.37 + depth * 31) * 68;
    if (presentation === "field") {
      if (["field", "bond", "protein", "fiber"].includes(motif)) {
        const x = (pseudo(seed * 2.13) - 0.5) * 136;
        const lane = Math.floor(pseudo(seed * 5.27) * 9) - 4;
        return new THREE.Vector3(
          x,
          -0.6 + pseudo(seed * 7.13 + depth) * 6.2,
          lane * 7.5 + Math.sin(x * 0.12 + lane * 1.7 + depth) * 5.5,
        );
      }
      if (["atom", "orbit"].includes(motif)) {
        const shell = 8 + (Math.floor(seed) % 4) * 8;
        return new THREE.Vector3(
          Math.cos(angle) * shell,
          -0.8 + (Math.floor(seed * 0.7) % 5) * 1.7,
          Math.sin(angle) * shell,
        );
      }
      if (
        ["foam", "particle", "nucleus", "virus", "cell", "microbe"].includes(
          motif,
        )
      ) {
        const cluster = Math.abs(Math.floor(seed)) % 13;
        const clusterAngle = pseudo(cluster * 3.7 + depth) * Math.PI * 2;
        const clusterRadius = 9 + pseudo(cluster * 8.1 + depth) * 49;
        const localRadius = 1.2 + pseudo(seed * 9.3) * 6;
        return new THREE.Vector3(
          Math.cos(clusterAngle) * clusterRadius + Math.cos(angle) * localRadius,
          -0.8 + pseudo(seed * 7.13 + depth) * 7.5,
          Math.sin(clusterAngle) * clusterRadius + Math.sin(angle) * localRadius,
        );
      }
      return new THREE.Vector3(
        Math.cos(angle) * radius,
        -1.2 + pseudo(seed * 7.13 + depth) * 9.5,
        Math.sin(angle) * radius,
      );
    }
    if (presentation === "distant-field") {
      if (motif === "orbit") {
        const orbitRadius = 12 + (Math.abs(Math.floor(seed)) % 5) * 11;
        return new THREE.Vector3(
          Math.cos(angle) * orbitRadius,
          (pseudo(seed * 8.41 + depth) - 0.5) * 5,
          Math.sin(angle) * orbitRadius,
        );
      }
      if (motif === "galaxy") {
        const spiralRadius = 4 + pseudo(seed * 2.93) * 62;
        const spiralAngle = angle + spiralRadius * 0.16;
        return new THREE.Vector3(
          Math.cos(spiralAngle) * spiralRadius,
          (pseudo(seed * 8.41 + depth) - 0.5) * 7,
          Math.sin(spiralAngle) * spiralRadius,
        );
      }
      if (["web", "horizon", "speculative"].includes(motif)) {
        const x = (pseudo(seed * 2.13) - 0.5) * 144;
        const lane = Math.floor(pseudo(seed * 5.27) * 7) - 3;
        return new THREE.Vector3(
          x,
          lane * 5 + Math.sin(x * 0.08 + depth) * 8,
          Math.sin(x * 0.045 + lane) * 32 + lane * 6,
        );
      }
      if (["star", "planet"].includes(motif)) {
        const cluster = Math.abs(Math.floor(seed)) % 11;
        const centerAngle = pseudo(cluster * 3.7 + depth) * Math.PI * 2;
        const centerRadius = 14 + pseudo(cluster * 8.1) * 50;
        const spread = 1 + pseudo(seed * 9.3) * 7;
        return new THREE.Vector3(
          Math.cos(centerAngle) * centerRadius + Math.cos(angle) * spread,
          (pseudo(seed * 8.41 + depth) - 0.45) * 24,
          Math.sin(centerAngle) * centerRadius + Math.sin(angle) * spread,
        );
      }
      const elevation = (pseudo(seed * 8.41 + depth) - 0.38) * 34;
      const distance = 8 + pseudo(seed * 2.93 + depth) * 72;
      return new THREE.Vector3(
        Math.cos(angle) * distance,
        elevation,
        Math.sin(angle) * distance,
      );
    }

    let x = Math.cos(angle) * radius;
    let z = Math.sin(angle) * radius;
    if (["road", "city", "room"].includes(motif)) {
      const lane = Math.floor(pseudo(seed * 11.2) * 17) - 8;
      const along = (pseudo(seed * 13.7) - 0.5) * 136;
      if (Math.floor(seed) % 2 === 0) {
        x = lane * 7.2 + (pseudo(seed + 2) - 0.5) * 1.8;
        z = along;
      } else {
        x = along;
        z = lane * 7.2 + (pseudo(seed + 3) - 0.5) * 1.8;
      }
    } else if (["fiber", "bond", "web"].includes(motif)) {
      x = (pseudo(seed * 2.6) - 0.5) * 138;
      z = Math.sin(x * 0.09 + depth) * (8 + (seed % 5) * 2.4) +
        (pseudo(seed * 3.8) - 0.5) * 54;
    }
    const shellDrop =
      presentation === "shell" ? (x * x + z * z) / 230 : 0;
    return new THREE.Vector3(x, 0.025 - shellDrop - depth * 0.004, z);
  };

  const nearestSubstratePosition = (
    placement: Exclude<FoundationPlan["presentation"], "none">,
    motif: FoundationMotif,
    seed: number,
    depth: number,
    compact: boolean,
  ) => {
    const position = substratePosition(placement, motif, seed, depth);
    if (!compact) return position;
    position.x *= 0.38;
    position.z *= 0.38;
    position.y =
      placement === "shell" && activeWorldKind === "planet-surface"
        ? foundationShellHeight(
            position.x,
            position.z,
            PLANET_FOUNDATION_RADIUS,
            PLANET_FOUNDATION_CENTER_Y,
            0.08,
          ) - PLANET_FOUNDATION_CENTER_Y
        : 0.035;
    return position;
  };

  const applyPlanetFoundationTransform = (
    target: THREE.Object3D,
    transform: PlanetFoundationTransform,
    absoluteX: number,
    absoluteZ: number,
  ) => {
    const x = wrappedFoundationOffset(
      transform.anchorX,
      absoluteX,
      substrateNearestChunkSize,
    );
    const z = wrappedFoundationOffset(
      transform.anchorZ,
      absoluteZ,
      substrateNearestChunkSize,
    );
    const y =
      foundationShellHeight(
        x,
        z,
        PLANET_FOUNDATION_RADIUS,
        PLANET_FOUNDATION_CENTER_Y,
        0.08,
      ) - PLANET_FOUNDATION_CENTER_Y;
    target.position.set(x, y, z);
    substratePlanetFoundationNormal
      .set(x, y - 0.08, z)
      .normalize();
    target.quaternion.setFromUnitVectors(
      substratePlanetFoundationUp,
      substratePlanetFoundationNormal,
    );
    target.rotateY(transform.yaw);
    const halfChunk = substrateNearestChunkSize / 2;
    const edgeDistance = Math.max(Math.abs(x), Math.abs(z));
    const edgeFade =
      1 -
      THREE.MathUtils.smoothstep(
        edgeDistance,
        PLANET_FOUNDATION_ACTIVE_RADIUS,
        halfChunk,
      );
    const visibleScale = transform.scale * edgeFade;
    target.scale.set(
      visibleScale,
      visibleScale * transform.verticalScale,
      visibleScale,
    );
    target.updateMatrix();
  };

  const updatePlanetFoundationShell = (
    absoluteX: number,
    absoluteZ: number,
  ) => {
    if (
      absoluteX === substratePlanetFoundationPhaseX &&
      absoluteZ === substratePlanetFoundationPhaseZ
    ) {
      return;
    }
    substratePlanetFoundationPhaseX = absoluteX;
    substratePlanetFoundationPhaseZ = absoluteZ;
    substrateNearestSampleX = 0;
    substrateNearestSampleZ = 0;
    substrateNearestUnderfootInstances = 0;
    let logicalIndex = 0;
    substratePlanetFoundationBatches.forEach((batch) => {
      batch.transforms.forEach((transform, instance) => {
        applyPlanetFoundationTransform(
          substratePlanetFoundationDummy,
          transform,
          absoluteX,
          absoluteZ,
        );
        const x = substratePlanetFoundationDummy.position.x;
        const z = substratePlanetFoundationDummy.position.z;
        if (logicalIndex === 0) {
          substrateNearestSampleX = x;
          substrateNearestSampleZ = z;
        }
        if (
          Math.hypot(x, z) <= PLANET_FOUNDATION_ACTIVE_RADIUS
        ) {
          substrateNearestUnderfootInstances += 1;
        }
        batch.meshes.forEach((mesh) => {
          mesh.setMatrixAt(instance, substratePlanetFoundationDummy.matrix);
        });
        logicalIndex += 1;
      });
      batch.meshes.forEach((mesh) => {
        mesh.instanceMatrix.needsUpdate = true;
      });
    });
  };

  const foundationMemoryStyle = (
    presentation: FoundationPlan["presentation"],
    worldKind: WorldKind,
  ) => {
    if (presentation === "field") {
      return { overlayVisible: true, height: 0.035, opacity: 0.34 };
    }
    if (presentation === "distant-field") {
      return { overlayVisible: true, height: 0.035, opacity: 0.3 };
    }
    if (presentation === "shell") {
      return worldKind === "planet-surface"
        ? { overlayVisible: false, height: 1.08, opacity: 0.24 }
        : { overlayVisible: true, height: 0.035, opacity: 0.2 };
    }
    return {
      overlayVisible: true,
      height: 0.18,
      opacity:
        worldKind === "city" || worldKind === "yard"
          ? 0.24
          : worldKind === "interior"
            ? 0.2
            : 0.18,
    };
  };

  const buildSubstrate = (viewScale: number) => {
    const startedAt = phaseStart();
    substrateGroup.visible = true;
    const ownedGeometries = new Set<THREE.BufferGeometry>();
    const ownedMaterials = new Set<THREE.Material>();
    substrateGroup.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        if (object instanceof THREE.InstancedMesh) object.dispose();
        if (!object.userData.sharedCollectibleGeometry) {
          ownedGeometries.add(object.geometry);
        }
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => ownedMaterials.add(material));
      }
    });
    ownedGeometries.forEach((geometry) => geometry.dispose());
    ownedMaterials.forEach((material) => material.dispose());
    substrateNearestGroup.clear();
    substrateCompressedGroup.clear();
    substrateNearestGroup.visible = true;
    substrateCompressedGroup.visible = true;
    substrateAuthoredInstances = 0;
    substrateGenericInstances = 0;
    substrateRenderedAuthoredInstances = 0;
    substrateRenderedGenericInstances = 0;

    const plan = foundationPlan(viewScale, ERAS);
    substrateFoundationPlan = plan;
    substrateLayerIndices = [...plan.visibleLayerIndices];
    substrateNearestTravelRate = 0;
    substrateCompressedTravelRate = 0;
    substrateNearestUsesPeriodicCopies = false;
    substrateNearestUsesPlanetWrap = false;
    substrateCompressedUsesPeriodicCopies = false;
    substratePlanetFoundationBatches.length = 0;
    substrateNearestChunkSize = LOCAL_FOUNDATION_CHUNK_SIZE;
    substrateNearestGrounded = false;
    substrateNearestPlacement = "none";
    substrateNearestVerticalScale = 1;
    substrateNearestLocalRadius = 0;
    substrateNearestMinY = 0;
    substrateNearestMaxY = 0;
    substrateNearestSampleX = 0;
    substrateNearestSampleZ = 0;
    substrateNearestUnderfootInstances = 0;
    substratePlanetFoundationPhaseX = Number.NaN;
    substratePlanetFoundationPhaseZ = Number.NaN;
    substrateCompressedGrounded = false;
    substrateCompressedPlacement = "none";
    const memoryStyle = foundationMemoryStyle(
      plan.presentation,
      activeWorldKind,
    );
    foundationMemoryVisible = plan.nearest !== null;
    foundationOverlay.visible =
      foundationMemoryVisible && memoryStyle.overlayVisible;
    foundationOverlayHeight = memoryStyle.height;
    foundationOverlayMaterial.opacity = memoryStyle.opacity;
    if (!plan.nearest) {
      substrateGroup.visible = false;
      foundationOverlay.visible = false;
      foundationMemoryVisible = false;
      semanticResidencyKey = plan.key;
      baseSceneDrawCallsDirty = true;
      phaseEnd("substrate-rebuild", startedAt);
      return;
    }

    // Finite literal places already have an authored slide, table, floors,
    // thresholds, and yard. Bake the prior scale onto the active support
    // instead of leaving a player-centered field five metres below it or
    // standing old objects upright through the room as duplicate scenery.
    const activeWorldSpec = worldSpecForEra(activeEra.name);
    const usesBakedLiteralRug =
      activeWorldSpec.topology === "finite" &&
      activeLiteralStage !== null;
    if (usesBakedLiteralRug) {
      substrateGroup.visible = false;
      substrateNearestGroup.visible = false;
      substrateCompressedGroup.visible = false;
      // The authored floor/table meshes own the same foundation texture. A
      // player-centered overlay would extend beyond their finite edges and
      // falsely turn a desk or room back into an infinite plane.
      foundationOverlay.visible = false;
      semanticResidencyKey = plan.key;
      baseSceneDrawCallsDirty = true;
      phaseEnd("substrate-rebuild", startedAt);
      return;
    }

    if (!collectibleGeometryLibrary) {
      throw new TypeError("Collectible geometry library is not ready");
    }
    const era = ERAS[plan.nearest.index];
    const nearestCue = foundationDepthCue(
      plan.presentation,
      "nearest",
      plan.nearest.depth,
      reducedMotion,
    );
    substrateNearestTravelRate = nearestCue.travelRate;
    substrateNearestGrounded = nearestCue.grounded;
    substrateNearestPlacement = nearestCue.placement;
    substrateNearestVerticalScale = nearestCue.verticalScale;
    const fogColor =
      scene.fog instanceof THREE.FogExp2 || scene.fog instanceof THREE.Fog
        ? scene.fog.color
        : deepColor;
    const alreadyPeriodicSurface =
      plan.presentation === "surface" &&
      worldUsesPeriodicTiles(activeEra.name);
    const playerCenteredPlanetShell =
      plan.presentation === "shell" &&
      activeWorldKind === "planet-surface";
    const substrateChunkSize = worldChunkSize(activeWorldKind);
    substrateNearestChunkSize = playerCenteredPlanetShell
      ? PLANET_FOUNDATION_CHUNK_SIZE
      : alreadyPeriodicSurface
        ? substrateChunkSize
        : LOCAL_FOUNDATION_CHUNK_SIZE;
    substrateNearestUsesPlanetWrap = playerCenteredPlanetShell;
    substrateNearestLocalRadius = 0;
    substrateNearestMinY = Number.POSITIVE_INFINITY;
    substrateNearestMaxY = Number.NEGATIVE_INFINITY;
    const count = playerCenteredPlanetShell
      ? qualityTier === "high"
        ? 64
        : qualityTier === "balanced"
          ? 48
          : 32
      : alreadyPeriodicSurface
        ? qualityTier === "high"
          ? 128
          : qualityTier === "balanced"
            ? 96
            : 64
        : qualityTier === "high"
          ? 32
          : qualityTier === "balanced"
            ? 24
            : 16;
    const planetGridColumns = Math.ceil(Math.sqrt(count));
    const planetGridRows = Math.ceil(count / planetGridColumns);
    // Named one-of-one landmarks belong to the collectible world, never to a
    // periodically repeated foundation texture. The rug remembers archetypes.
    const rugCurios = era.curios.filter(
      (curio) => curio.spawnMode === "repeatable",
    );
    const substrateCurios = rugCurios.length > 0 ? rugCurios : era.curios;
    const families = new Map<string, { curio: Curio; items: number[] }>();
    for (let item = 0; item < count; item += 1) {
      const curio = substrateCurios[item % substrateCurios.length];
      const family = families.get(curio.id) ?? { curio, items: [] };
      family.items.push(item);
      families.set(curio.id, family);
    }
    const volumetricFoundation = !nearestCue.grounded;
    const solidMaterial = new THREE.MeshToonMaterial({
      color: new THREE.Color("#ffffff").lerp(
        fogColor,
        nearestCue.fogMix * 0.34,
      ),
      vertexColors: true,
      transparent: volumetricFoundation,
      opacity: volumetricFoundation ? nearestCue.opacityCap : 1,
      depthWrite: !volumetricFoundation,
    });
    const effectMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#ffffff").lerp(
        fogColor,
        nearestCue.fogMix * 0.52,
      ),
      vertexColors: true,
      transparent: true,
      opacity: Math.min(nearestCue.opacityCap * 0.72, 0.2),
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const dummy = new THREE.Object3D();
    families.forEach(({ curio, items }) => {
      const transforms = items.map((item) => {
        const position = nearestSubstratePosition(
          nearestCue.placement,
          plan.nearest!.motif,
          plan.nearest!.index * 379 + item * 17.3,
          1,
          !alreadyPeriodicSurface,
        );
        if (playerCenteredPlanetShell) {
          const column = item % planetGridColumns;
          const row = Math.floor(item / planetGridColumns);
          const jitterX = (pseudo(item * 17.3 + 5) - 0.5) * 0.48;
          const jitterZ = (pseudo(item * 29.7 + 11) - 0.5) * 0.48;
          position.x =
            ((column + 0.5 + jitterX) / planetGridColumns - 0.5) *
            PLANET_FOUNDATION_CHUNK_SIZE;
          position.z =
            ((row + 0.5 + jitterZ) / planetGridRows - 0.5) *
            PLANET_FOUNDATION_CHUNK_SIZE;
          position.y =
            foundationShellHeight(
              position.x,
              position.z,
              PLANET_FOUNDATION_RADIUS,
              PLANET_FOUNDATION_CENTER_Y,
              0.08,
            ) - PLANET_FOUNDATION_CENTER_Y;
        }
        const scaleBase =
          nearestCue.placement === "distant-field"
            ? 0.52
            : nearestCue.placement === "surface"
              ? 0.48
              : nearestCue.placement === "shell"
                ? 0.38
                : 0.42;
        const scaleRange =
          nearestCue.placement === "distant-field"
            ? 0.7
            : nearestCue.placement === "surface"
              ? 0.48
              : nearestCue.placement === "shell"
                ? 0.4
                : 0.5;
        const scale =
          scaleBase +
          pseudo(item + plan.nearest!.index * 23) * scaleRange;
        return {
          position,
          planet: {
            anchorX: position.x,
            anchorZ: position.z,
            yaw: pseudo(item + 47) * Math.PI * 2,
            scale,
            verticalScale: nearestCue.verticalScale,
          } satisfies PlanetFoundationTransform,
        };
      });
      const planetTransforms = transforms.map(({ planet }) => planet);
      const matrices = transforms.map(({ position, planet }) => {
        if (playerCenteredPlanetShell) {
          applyPlanetFoundationTransform(dummy, planet, 0, 0);
        } else {
          dummy.position.copy(position);
          dummy.rotation.set(0, planet.yaw, 0);
          dummy.scale.set(
            planet.scale,
            planet.scale * planet.verticalScale,
            planet.scale,
          );
          dummy.updateMatrix();
        }
        return dummy.matrix.clone();
      });
      const geometries = collectibleGeometryLibrary!.geometryFor(curio, false);
      const planetMeshes: THREE.InstancedMesh[] = [];
      const addInstances = (
        geometry: THREE.BufferGeometry | null,
        material: THREE.Material,
        layer: "solid" | "effect",
      ) => {
        if (!geometry) return;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        if (geometry.boundingBox) {
          const transformedBounds = new THREE.Box3();
          matrices.forEach((matrix) => {
            transformedBounds.copy(geometry.boundingBox!).applyMatrix4(matrix);
            const maxX = Math.max(
              Math.abs(transformedBounds.min.x),
              Math.abs(transformedBounds.max.x),
            );
            const maxZ = Math.max(
              Math.abs(transformedBounds.min.z),
              Math.abs(transformedBounds.max.z),
            );
            const pivotY = playerCenteredPlanetShell
              ? PLANET_FOUNDATION_CENTER_Y
              : 0;
            substrateNearestLocalRadius = Math.max(
              substrateNearestLocalRadius,
              Math.hypot(maxX, maxZ),
            );
            substrateNearestMinY = Math.min(
              substrateNearestMinY,
              transformedBounds.min.y + pivotY,
            );
            substrateNearestMaxY = Math.max(
              substrateNearestMaxY,
              transformedBounds.max.y + pivotY,
            );
          });
        }
        const instances = new THREE.InstancedMesh(
          geometry,
          material,
          items.length,
        );
        instances.name = `substrate:${layer}:${era.id}:${curio.id}`;
        instances.userData.sharedCollectibleGeometry = true;
        matrices.forEach((matrix, instance) => {
          instances.setMatrixAt(instance, matrix);
        });
        instances.instanceMatrix.needsUpdate = true;
        instances.receiveShadow = false;
        instances.castShadow = false;
        if (playerCenteredPlanetShell) {
          instances.frustumCulled = false;
          instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          planetMeshes.push(instances);
        }
        substrateNearestGroup.add(instances);
      };
      addInstances(geometries.solid, solidMaterial, "solid");
      addInstances(geometries.effect, effectMaterial, "effect");
      if (playerCenteredPlanetShell) {
        substratePlanetFoundationBatches.push({
          transforms: planetTransforms,
          meshes: planetMeshes,
        });
      }
      substrateAuthoredInstances += items.length;
    });
    if (playerCenteredPlanetShell) updatePlanetFoundationShell(0, 0);
    if (!Number.isFinite(substrateNearestMinY)) substrateNearestMinY = 0;
    if (!Number.isFinite(substrateNearestMaxY)) substrateNearestMaxY = 0;

    if (
      plan.presentation !== "shell" &&
      (plan.compressed.length > 0 || plan.ancestryCount > 0)
    ) {
      const compressedDepth = Math.max(
        plan.ancestryCount > 0 ? 4 : 2,
        ...plan.compressed.map((layer) => layer.depth),
      );
      const compressedCue = foundationDepthCue(
        plan.presentation,
        "compressed",
        compressedDepth,
        reducedMotion,
      );
      substrateCompressedTravelRate = compressedCue.travelRate;
      substrateCompressedGrounded = compressedCue.grounded;
      substrateCompressedPlacement = compressedCue.placement;
      const positions: number[] = [];
      const colors: number[] = [];
      const pointCount = reducedWorldDetail() ? 320 : 520;
      for (let point = 0; point < pointCount; point += 1) {
        const layer =
          plan.compressed[point % plan.compressed.length] ?? plan.nearest;
        const position = substratePosition(
          compressedCue.placement,
          layer.motif,
          layer.index * 317 + point * 11.3,
          layer.depth,
        );
        positions.push(position.x, position.y, position.z);
        const faded = new THREE.Color(ERAS[layer.index].palette[2]).lerp(
          fogColor,
          Math.min(
            0.86,
            compressedCue.fogMix + Math.max(0, layer.depth - 2) * 0.04,
          ),
        );
        colors.push(faded.r, faded.g, faded.b);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3),
      );
      const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          size: plan.presentation === "distant-field" ? 0.12 : 0.07,
          transparent: true,
          opacity: compressedCue.opacityCap,
          vertexColors: true,
          depthWrite: false,
        }),
      );
      points.name = "substrate:compressed-ancestry";
      substrateCompressedGroup.add(points);
      substrateGenericInstances = pointCount;
    }

    const periodicCompressedFoundation =
      plan.presentation === "surface" &&
      worldUsesPeriodicTiles(activeEra.name);
    substrateNearestUsesPeriodicCopies =
      !playerCenteredPlanetShell &&
      worldSpecForEra(activeEra.name).topology !== "finite";
    substrateCompressedUsesPeriodicCopies = periodicCompressedFoundation;
    if (substrateNearestUsesPeriodicCopies) {
      addPeriodicSubstrateCopies(
        substrateNearestGroup,
        substrateNearestChunkSize,
      );
    }
    if (periodicCompressedFoundation) {
      addPeriodicSubstrateCopies(
        substrateCompressedGroup,
        substrateChunkSize,
      );
    }
    const nearestRenderedCopies = substrateNearestUsesPeriodicCopies
      ? PERIODIC_TILE_OFFSETS.length + 1
      : 1;
    const compressedRenderedCopies = periodicCompressedFoundation
      ? PERIODIC_TILE_OFFSETS.length + 1
      : 1;
    substrateRenderedAuthoredInstances =
      substrateAuthoredInstances * nearestRenderedCopies;
    substrateRenderedGenericInstances =
      substrateGenericInstances * compressedRenderedCopies;
    semanticResidencyKey = plan.key;
    baseSceneDrawCallsDirty = true;
    phaseEnd("substrate-rebuild", startedAt);
  };

  const playerRoot = new THREE.Group();
  const rollGroup = new THREE.Group();
  const mashGroup = new THREE.Group();
  playerRoot.add(rollGroup);
  rollGroup.add(mashGroup);
  scene.add(playerRoot);

  const makeBallFaceTexture = (expression: "smile" | "chomp" | "joy" = "smile") => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.fillStyle = "rgba(255, 131, 178, .72)";
    context.beginPath();
    context.ellipse(55, 154, 26, 14, -0.12, 0, Math.PI * 2);
    context.ellipse(201, 154, 26, 14, 0.12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#26143a";
    if (expression === "joy") {
      // Closed ^-^ eyes, a big open smile, and sparkles for layer advances.
      context.lineWidth = 15;
      context.strokeStyle = "#26143a";
      context.beginPath();
      context.arc(86, 116, 24, Math.PI + 0.35, -0.35);
      context.stroke();
      context.beginPath();
      context.arc(170, 116, 24, Math.PI + 0.35, -0.35);
      context.stroke();
      context.beginPath();
      context.arc(128, 148, 34, 0.25, Math.PI - 0.25);
      context.closePath();
      context.fill();
      context.fillStyle = "#ff8ab8";
      context.beginPath();
      context.ellipse(128, 172, 18, 9, 0, 0, Math.PI);
      context.fill();
      context.fillStyle = "#fff8c2";
      for (const [x, y, r] of [
        [34, 74, 9],
        [222, 66, 7],
        [206, 196, 6],
      ] as const) {
        context.beginPath();
        for (let point = 0; point < 8; point += 1) {
          const angle = (point * Math.PI) / 4;
          const radius = point % 2 === 0 ? r : r * 0.42;
          context.lineTo(
            x + Math.cos(angle) * radius,
            y + Math.sin(angle) * radius,
          );
        }
        context.closePath();
        context.fill();
      }
    } else if (expression === "chomp") {
      context.lineWidth = 15;
      context.strokeStyle = "#26143a";
      context.beginPath();
      context.arc(86, 104, 24, 0.12, Math.PI - 0.12);
      context.arc(170, 104, 24, 0.12, Math.PI - 0.12);
      context.stroke();
      context.beginPath();
      context.ellipse(128, 166, 30, 36, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#ff8ab8";
      context.beginPath();
      context.ellipse(128, 180, 17, 10, 0, 0, Math.PI * 2);
      context.fill();
    } else {
      [88, 168].forEach((x) => {
        context.beginPath();
        context.ellipse(x, 106, 19, 27, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.arc(x - 6, 97, 6, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#26143a";
      });
      context.lineWidth = 14;
      context.strokeStyle = "#26143a";
      context.beginPath();
      context.arc(128, 142, 38, 0.15, Math.PI - 0.15);
      context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  const happyFaceTexture = makeBallFaceTexture();
  const chompFaceTexture = makeBallFaceTexture("chomp");
  const joyFaceTexture = makeBallFaceTexture("joy");
  const ballFaceMaterial = new THREE.SpriteMaterial({
    map: happyFaceTexture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const ballFace = new THREE.Sprite(ballFaceMaterial);
  ballFace.renderOrder = 50;
  playerRoot.add(ballFace);
  let faceReactionUntil = 0;

  const coreMaterial = new THREE.MeshPhysicalMaterial({
    color: early ? activeEra.palette[2] : 0xffb83e,
    emissive: early ? activeEra.palette[2] : 0x5b1629,
    emissiveIntensity: early ? 1.35 : 0.18,
    roughness: early ? 0.18 : 0.62,
    metalness: early ? 0.05 : 0,
    transmission:
      activeEra.realm === "prephysical" && qualityTier !== "battery"
        ? 0.42
        : 0,
    transparent: activeEra.realm === "prephysical",
    opacity: activeEra.realm === "prephysical" ? 0.78 : 1,
    clearcoat: 0.65,
    clearcoatRoughness: 0.2,
  });
  coreMaterial.userData.authoredTransmission =
    activeEra.realm === "prephysical" ? 0.42 : 0;
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 6), coreMaterial);
  core.castShadow = !early;
  core.receiveShadow = !early;
  rollGroup.add(core);

  const innerGlowMaterial = new THREE.MeshBasicMaterial({
    color: activeEra.palette[2],
    transparent: true,
    opacity: early ? 0.18 : 0.06,
    side: THREE.BackSide,
  });
  const innerGlow = new THREE.Mesh(new THREE.SphereGeometry(1.12, 32, 24), innerGlowMaterial);
  core.add(innerGlow);

  const foamCluster = new THREE.Group();
  const foamMaterials: THREE.MeshPhysicalMaterial[] = [];
  for (let index = 0; index < 6; index += 1) {
    const foamMaterial = coreMaterial.clone();
    foamMaterial.opacity = 0.48;
    foamMaterial.transparent = true;
    foamMaterial.depthWrite = false;
    foamMaterials.push(foamMaterial);
    const lobe = new THREE.Mesh(
      new THREE.SphereGeometry(0.25 + pseudo(index + 4) * 0.18, 18, 14),
      foamMaterial,
    );
    const angle = (index / 6) * Math.PI * 2;
    lobe.position.set(
      Math.cos(angle) * (0.5 + pseudo(index + 11) * 0.18),
      (pseudo(index + 21) - 0.42) * 0.7,
      Math.sin(angle) * (0.5 + pseudo(index + 31) * 0.18),
    );
    foamCluster.add(lobe);
  }
  rollGroup.add(foamCluster);

  type EnvironmentMode = LegacyVisualStage;

  const environmentModeFor = (index: number): EnvironmentMode =>
    worldSpecForEra(ERAS[index].name).legacyStage;

  const environmentNames: Record<EnvironmentMode, string> = {
    quantum: "the quantum void",
    micro: "a microscopic sea",
    room: "a very rollable house",
    neighborhood: "the neighborhood",
    planet: "a whole curved world",
    cosmic: "deep space",
  };

  let environmentMode = environmentModeFor(activeIndex);
  let activeWorldKind = worldSpecForEra(activeEra.name).kind;
  let eraTransitionAge = 99;
  let worldGeneration = 0;

  const disposeEnvironment = () => {
    [
      environmentGroup,
      nearBackdropGroup,
      midBackdropGroup,
      farBackdropGroup,
    ].forEach((group) => {
      group.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Points ||
          object instanceof THREE.Line
        ) {
          if (object instanceof THREE.InstancedMesh) object.dispose();
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      group.clear();
      group.rotation.set(0, 0, 0);
    });
    foundationSurfaceMaterials.clear();
    literalFoundationSurfaceMaterials.clear();
    sceneryColliders = [];
    literalPlayableBounds = null;
    literalPlayableRegions = [];
  };

  const addScenery = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
    parent: THREE.Object3D = environmentGroup,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.scale.set(...scale);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  };

  const addSceneryCollider = (
    x: number,
    z: number,
    halfWidth: number,
    halfDepth: number,
  ) => {
    sceneryColliders.push({ x, z, halfWidth, halfDepth });
  };

  const sceneryToon = (color: THREE.ColorRepresentation) =>
    new THREE.MeshToonMaterial({ color });

  const sceneryGlow = (
    color: THREE.ColorRepresentation,
    opacity = 0.45,
    wireframe = false,
  ) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      wireframe,
      depthWrite: false,
    });

  let activeLiteralStage: LiteralStage | null = null;
  let literalSceneOriginX = 0;
  let literalSceneOriginZ = 0;
  let literalPlayerSurfaceY = 0;
  const literalWorldPosition = (
    _stage: LiteralStage,
    position: readonly [number, number, number],
  ): [number, number, number] => [
    literalSceneOriginX + position[0],
    position[1],
    literalSceneOriginZ + position[2] + LITERAL_ROUTE_Z_OFFSET,
  ];
  const literalPlayableClearanceAt = (
    x: number,
    z: number,
    radius: number,
  ) => {
    if (literalPlayableRegions.length === 0) return Number.POSITIVE_INFINITY;
    return literalPlayableRegions.reduce(
      (best, region) =>
        Math.max(
          best,
          Math.min(
            x - region.minX - radius,
            region.maxX - x - radius,
            z - region.minZ - radius,
            region.maxZ - z - radius,
          ),
        ),
      Number.NEGATIVE_INFINITY,
    );
  };
  const literalArchitectureColor = (
    primitive: LiteralArchitecturePrimitive,
  ) => {
    const identity = primitive.semanticIdentity;
    if (identity.includes("slide")) return "#d9fbff";
    if (identity.includes("microscope")) return "#675884";
    if (identity.includes("work-surface")) return "#a96b4e";
    if (identity.includes("floor")) return "#aa7064";
    if (identity.includes("wall")) return "#ffd8c8";
    if (identity.includes("porch")) return "#b97861";
    if (identity.includes("yard")) return "#72ad63";
    return "#f4d4c7";
  };
  const buildLiteralArchitecture = (stage: LiteralStage) => {
    activeLiteralStage = stage;
    literalPlayerSurfaceY = literalStageSurfaceY(stage.id);
    const transientPreview = labEra !== null || debugEraOverride !== null;
    const stageCenterZ =
      (stage.nearZ + stage.farZ) / 2 + LITERAL_ROUTE_Z_OFFSET;
    if (transientPreview) {
      literalSceneOriginX = game.x;
      literalSceneOriginZ = game.z - stageCenterZ;
    } else {
      game.literalSceneOriginX ??= game.x + game.originX;
      game.literalSceneOriginZ ??= game.z + game.originZ - stageCenterZ;
      literalSceneOriginX = game.literalSceneOriginX - game.originX;
      literalSceneOriginZ = game.literalSceneOriginZ - game.originZ;
    }
    const sky =
      stage.id === "yard" || stage.id === "porch" ? "#82d7f3" : "#f4c6d2";
    scene.background = new THREE.Color(sky);
    scene.fog = new THREE.FogExp2(sky, stage.id === "room" ? 0.014 : 0.009);
    groundMaterial.color.set(
      stage.id === "yard" || stage.id === "porch"
        ? "#72ad63"
        : stage.id === "room"
          ? "#aa7064"
          : "#a96b4e",
    );
    dustMaterial.size = stage.id === "microscope-slide" ? 0.07 : 0.04;
    dustMaterial.opacity = stage.id === "room" ? 0.1 : 0.16;
    hemisphere.intensity = stage.id === "yard" ? 1.55 : 1.3;
    keyLight.intensity = stage.id === "yard" ? 2.8 : 2.5;
    ground.visible = false;

    literalArchitectureForStage(stage.id).forEach((primitive) => {
      if (primitive.primitive === "portal") return;
      const [width, height, depth] = primitive.dimensions;
      const geometry =
        primitive.primitive === "cylinder"
          ? new THREE.CylinderGeometry(width / 2, width / 2, height, 16)
          : new THREE.BoxGeometry(width, height, depth);
      const color = literalArchitectureColor(primitive);
      const mapsLiteralFoundation =
        primitive.collision === "support" &&
        Math.abs(
          primitive.position[1] +
            primitive.dimensions[1] / 2 -
            literalPlayerSurfaceY,
        ) < 0.04;
      let material: THREE.Material;
      if (primitive.semanticIdentity.includes("slide")) {
        const slideMaterial = new THREE.MeshStandardMaterial({
          color,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
          roughness: 0.22,
          metalness: 0,
          map: mapsLiteralFoundation ? literalGroundTexture : null,
        });
        if (mapsLiteralFoundation) {
          literalFoundationSurfaceMaterials.add(slideMaterial);
        }
        material = slideMaterial;
      } else if (primitive.collision === "support") {
        const supportMaterial = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.88,
          metalness: 0,
          flatShading: true,
          map: mapsLiteralFoundation ? literalGroundTexture : null,
        });
        if (mapsLiteralFoundation) {
          literalFoundationSurfaceMaterials.add(supportMaterial);
        }
        material = supportMaterial;
      } else {
        material = sceneryToon(color);
      }
      const mesh = addScenery(
        geometry,
        material,
        literalWorldPosition(stage, primitive.position),
        [...primitive.rotation],
      );
      mesh.name = `literal:${primitive.id}`;
      if (primitive.collision === "barrier") {
        const [x, , z] = literalWorldPosition(stage, primitive.position);
        addSceneryCollider(x, z, width / 2, depth / 2);
      }
    });

    const playableSupports = literalArchitectureForStage(stage.id).filter(
      (primitive) => {
        if (primitive.collision !== "support") return false;
        const [, worldY] = literalWorldPosition(stage, primitive.position);
        return (
          Math.abs(
            worldY + primitive.dimensions[1] / 2 - literalPlayerSurfaceY,
          ) < 0.04
        );
      },
    );
    if (playableSupports.length > 0) {
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minZ = Number.POSITIVE_INFINITY;
      let maxZ = Number.NEGATIVE_INFINITY;
      playableSupports.forEach((support) => {
        const [supportX, , supportZ] = literalWorldPosition(
          stage,
          support.position,
        );
        const [supportWidth, , supportDepth] = support.dimensions;
        const region = {
          minX: supportX - supportWidth / 2,
          maxX: supportX + supportWidth / 2,
          minZ: supportZ - supportDepth / 2,
          maxZ: supportZ + supportDepth / 2,
        };
        literalPlayableRegions.push(region);
        minX = Math.min(minX, region.minX);
        maxX = Math.max(maxX, region.maxX);
        minZ = Math.min(minZ, region.minZ);
        maxZ = Math.max(maxZ, region.maxZ);
      });
      literalPlayableBounds = { minX, maxX, minZ, maxZ };
      const edge = 0.35;
      literalSupportBoundaries(literalPlayableRegions).forEach((boundary) => {
        const center = (boundary.min + boundary.max) / 2;
        const halfLength = (boundary.max - boundary.min) / 2;
        if (boundary.axis === "x") {
          addSceneryCollider(
            boundary.coordinate + boundary.outward * edge,
            center,
            edge,
            halfLength,
          );
        } else {
          addSceneryCollider(
            center,
            boundary.coordinate + boundary.outward * edge,
            halfLength,
            edge,
          );
        }
      });

      if (!transientPreview && literalPlayableClearanceAt(game.x, game.z, 0.75) < 0) {
        let bestX = game.x;
        let bestZ = game.z;
        let bestDistance = Number.POSITIVE_INFINITY;
        literalPlayableRegions.forEach((region) => {
          const inset = Math.min(
            0.75,
            (region.maxX - region.minX) / 2 - 0.05,
            (region.maxZ - region.minZ) / 2 - 0.05,
          );
          const x = THREE.MathUtils.clamp(
            game.x,
            region.minX + inset,
            region.maxX - inset,
          );
          const z = THREE.MathUtils.clamp(
            game.z,
            region.minZ + inset,
            region.maxZ - inset,
          );
          const distance = Math.hypot(x - game.x, z - game.z);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestX = x;
            bestZ = z;
          }
        });
        game.x = bestX;
        game.z = bestZ;
        game.vx = 0;
        game.vz = 0;
      }
    }
  };

  const backdropGlow = (
    color: THREE.ColorRepresentation,
    band: BackgroundBand,
    opacity: number,
    wireframe = false,
  ) => {
    const cue = backgroundDepthCue(band, reducedMotion);
    const fogColor =
      scene.fog instanceof THREE.FogExp2 || scene.fog instanceof THREE.Fog
        ? scene.fog.color
        : deepColor;
    return sceneryGlow(
      new THREE.Color(color).lerp(fogColor, cue.fogMix),
      Math.min(opacity, cue.opacityCap),
      wireframe,
    );
  };

  const addStarField = (count: number, radius: number, seed: number) => {
    const positions: number[] = [];
    const colors: number[] = [];
    const warm = new THREE.Color("#ffd6f3");
    const cool = new THREE.Color("#b4f4ff");
    for (let index = 0; index < count; index += 1) {
      const theta = pseudo(index * 4.73 + seed) * Math.PI * 2;
      const phi = Math.acos(2 * pseudo(index * 7.17 + seed + 4) - 1);
      const distance = radius * (0.42 + pseudo(index * 8.91 + seed + 9) * 0.58);
      positions.push(
        Math.sin(phi) * Math.cos(theta) * distance,
        Math.cos(phi) * distance,
        Math.sin(phi) * Math.sin(theta) * distance,
      );
      const color = warm.clone().lerp(cool, pseudo(index * 3.39 + seed));
      colors.push(color.r, color.g, color.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const farCue = backgroundDepthCue("far", reducedMotion);
    const material = new THREE.PointsMaterial({
      size: reducedWorldDetail() ? 0.17 : 0.22,
      transparent: true,
      opacity: Math.max(0.48, farCue.opacityCap),
      vertexColors: true,
      depthWrite: false,
    });
    farBackdropGroup.add(new THREE.Points(geometry, material));
  };

  let groundTexture: THREE.CanvasTexture | null = null;
  let literalGroundTexture: THREE.Texture | null = null;
  let coreSurfaceTexture: THREE.CanvasTexture | null = null;
  let groundTextureKey = "";
  let coreSurfaceTextureKey = -1;

  const makeScalePatternTexture = (index: number, forCore = false) => {
    const visualIndex = legacyVisualIndexForEra(index);
    const canvas = document.createElement("canvas");
    canvas.width = forCore ? 384 : 512;
    canvas.height = forCore ? 384 : 512;
    const context = canvas.getContext("2d")!;
    const size = canvas.width;
    const palette = ERAS[index].palette;
    const base = new THREE.Color(palette[1]).lerp(
      new THREE.Color(forCore ? "#fff0c7" : "#d8f2e4"),
      forCore ? 0.36 : 0.18,
    );
    const ink = new THREE.Color(palette[2]).lerp(
      new THREE.Color("#ffffff"),
      0.2,
    );
    const shadow = new THREE.Color(palette[0]).lerp(
      new THREE.Color("#20102e"),
      0.3,
    );
    const inkRgba = (alpha: number) =>
      `rgba(${Math.round(ink.r * 255)}, ${Math.round(ink.g * 255)}, ${Math.round(ink.b * 255)}, ${alpha})`;
    context.fillStyle = base.getStyle();
    context.fillRect(0, 0, size, size);
    context.lineCap = "round";
    context.lineJoin = "round";

    const dot = (x: number, y: number, radius: number, color = ink.getStyle()) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    };

    if (visualIndex <= 1) {
      for (let motif = 0; motif < 44; motif += 1) {
        const x = pseudo(motif + index * 17) * size;
        const y = pseudo(motif * 3.7 + index * 31) * size;
        const radius = 5 + pseudo(motif * 6.1) * 24;
        context.strokeStyle = motif % 2 ? ink.getStyle() : "#a8efff";
        context.globalAlpha = 0.18 + pseudo(motif + 7) * 0.28;
        context.lineWidth = 2 + pseudo(motif + 9) * 5;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.stroke();
      }
    } else if (visualIndex <= 3) {
      for (let motif = 0; motif < 72; motif += 1) {
        const x = pseudo(motif * 2.3 + index) * size;
        const y = pseudo(motif * 5.9 + index) * size;
        const colors = ["#ff667d", "#63b8ff", "#ffe36c"];
        dot(x, y, 2.5 + pseudo(motif) * 7, colors[motif % 3]);
        if (motif % 3 === 0) {
          context.strokeStyle = ink.getStyle();
          context.globalAlpha = 0.28;
          context.lineWidth = 2;
          context.beginPath();
          context.arc(x, y, 12 + pseudo(motif + 4) * 16, 0, Math.PI * 2);
          context.stroke();
        }
      }
    } else if (visualIndex === 4) {
      for (let cloud = 0; cloud < 34; cloud += 1) {
        const x = pseudo(cloud * 4.7) * size;
        const y = pseudo(cloud * 8.2) * size;
        const radius = 10 + pseudo(cloud + 4) * 25;
        const gradient = context.createRadialGradient(x, y, 1, x, y, radius);
        gradient.addColorStop(0, inkRgba(0.8));
        gradient.addColorStop(0.35, inkRgba(0.34));
        gradient.addColorStop(1, inkRgba(0));
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        dot(x, y, 2.5, "#fff3a5");
      }
    } else if (visualIndex <= 6) {
      context.strokeStyle = shadow.getStyle();
      context.globalAlpha = 0.34;
      context.lineWidth = visualIndex === 5 ? 5 : 8;
      for (let chain = 0; chain < 24; chain += 1) {
        const x = pseudo(chain * 4.3) * size;
        const y = pseudo(chain * 9.7) * size;
        const angle = pseudo(chain + 11) * Math.PI * 2;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + Math.cos(angle) * 45, y + Math.sin(angle) * 45);
        context.stroke();
        dot(x, y, 6 + (chain % 3) * 2);
        dot(
          x + Math.cos(angle) * 45,
          y + Math.sin(angle) * 45,
          5 + ((chain + 1) % 3) * 2,
          chain % 2 ? "#fff0b2" : ink.getStyle(),
        );
      }
    } else if (visualIndex === 7) {
      for (let cell = 0; cell < 26; cell += 1) {
        const x = pseudo(cell * 6.7) * size;
        const y = pseudo(cell * 2.9) * size;
        const radius = 12 + pseudo(cell + 5) * 24;
        context.strokeStyle = cell % 2 ? ink.getStyle() : "#f4b4dd";
        context.globalAlpha = 0.38;
        context.lineWidth = 5;
        context.beginPath();
        context.ellipse(x, y, radius * 1.3, radius, pseudo(cell) * Math.PI, 0, Math.PI * 2);
        context.stroke();
        dot(x + radius * 0.2, y, radius * 0.22, shadow.getStyle());
      }
    } else if (visualIndex === 8) {
      context.globalAlpha = 0.38;
      context.lineWidth = 6;
      for (let fiber = -8; fiber < 18; fiber += 1) {
        context.strokeStyle = fiber % 3 ? ink.getStyle() : "#fff2c5";
        context.beginPath();
        context.moveTo(-40, fiber * 28);
        context.bezierCurveTo(120, fiber * 28 + 45, 360, fiber * 28 - 45, size + 40, fiber * 28 + 8);
        context.stroke();
      }
    } else if (visualIndex === 9) {
      for (let speck = 0; speck < 620; speck += 1) {
        dot(
          pseudo(speck * 3.71) * size,
          pseudo(speck * 8.33) * size,
          0.5 + pseudo(speck + 9) * 3.2,
          speck % 5 ? shadow.getStyle() : ink.getStyle(),
        );
      }
    } else if (visualIndex <= 11) {
      context.globalAlpha = 0.34;
      for (let grain = 0; grain < 28; grain += 1) {
        context.strokeStyle = grain % 2 ? shadow.getStyle() : ink.getStyle();
        context.lineWidth = 2 + (grain % 4);
        context.beginPath();
        const y = grain * 20 + pseudo(grain) * 8;
        context.moveTo(0, y);
        context.bezierCurveTo(size * 0.3, y - 12, size * 0.7, y + 15, size, y - 3);
        context.stroke();
      }
    } else {
      context.globalAlpha = 0.32;
      context.strokeStyle = shadow.getStyle();
      context.lineWidth = visualIndex === 12 ? 5 : 3;
      const step = visualIndex === 12 ? 64 : 38;
      for (let line = 0; line <= size; line += step) {
        context.beginPath();
        context.moveTo(line, 0);
        context.lineTo(line, size);
        context.moveTo(0, line);
        context.lineTo(size, line);
        context.stroke();
      }
    }

    if (!forCore && index > 0) {
      for (let layer = 0; layer < index; layer += 1) {
        const buriedColor = new THREE.Color(ERAS[layer].palette[2])
          .lerp(base, 0.38)
          .getStyle();
        context.globalAlpha = Math.max(0.035, 0.15 - layer * 0.003);
        for (let trace = 0; trace < 7; trace += 1) {
          dot(
            pseudo(layer * 97 + trace * 13.1) * size,
            pseudo(layer * 151 + trace * 7.7) * size,
            0.7 + pseudo(layer * 31 + trace) * 1.8,
            buriedColor,
          );
        }
      }
    }

    context.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(
      forCore ? 1.8 : visualIndex <= 8 ? 22 : 12,
      forCore ? 1.8 : visualIndex <= 8 ? 22 : 12,
    );
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  };

  const drawFoundationMotif = (
    context: CanvasRenderingContext2D,
    motif: FoundationMotif,
    palette: readonly string[],
    size: number,
    seed: number,
    alpha: number,
  ) => {
    const ink = new THREE.Color(palette[2]);
    const dark = new THREE.Color(palette[0]).lerp(ink, 0.22);
    const pale = new THREE.Color(palette[1]).lerp(
      new THREE.Color("#fff6d9"),
      0.28,
    );
    const point = (
      x: number,
      y: number,
      radius: number,
      color = ink.getStyle(),
    ) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    };
    const randomX = (index: number) => pseudo(seed + index * 3.71) * size;
    const randomY = (index: number) => pseudo(seed + index * 8.33 + 17) * size;
    context.globalAlpha = alpha;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = ink.getStyle();
    context.fillStyle = ink.getStyle();

    if (motif === "foam" || motif === "field") {
      for (let cell = 0; cell < 34; cell += 1) {
        const x = randomX(cell);
        const y = randomY(cell);
        const radius = 5 + pseudo(seed + cell * 5.2) * 23;
        context.lineWidth = 1.5 + (cell % 4);
        context.strokeStyle = cell % 3 ? ink.getStyle() : pale.getStyle();
        context.beginPath();
        if (motif === "foam") {
          context.arc(x, y, radius, 0, Math.PI * 2);
        } else {
          context.moveTo(x - radius, y);
          context.bezierCurveTo(
            x - radius * 0.3,
            y - radius,
            x + radius * 0.3,
            y + radius,
            x + radius,
            y,
          );
        }
        context.stroke();
      }
      return;
    }

    if (["particle", "nucleus"].includes(motif)) {
      const colors = ["#ff667d", "#63b8ff", "#ffe36c"];
      for (let particle = 0; particle < 72; particle += 1) {
        const x = randomX(particle);
        const y = randomY(particle);
        point(x, y, 2 + (particle % 4), colors[particle % colors.length]);
        if (particle % 5 === 0) {
          context.lineWidth = 1.5;
          context.strokeStyle = dark.getStyle();
          context.beginPath();
          context.arc(x, y, 8 + (particle % 3) * 5, 0, Math.PI * 2);
          context.stroke();
        }
      }
      return;
    }

    if (motif === "atom" || motif === "orbit") {
      for (let atom = 0; atom < 26; atom += 1) {
        const x = randomX(atom);
        const y = randomY(atom);
        point(x, y, 2.4, pale.getStyle());
        context.strokeStyle = atom % 2 ? ink.getStyle() : dark.getStyle();
        context.lineWidth = 1.6 + (atom % 3);
        for (let ring = 0; ring < (motif === "orbit" ? 3 : 2); ring += 1) {
          context.beginPath();
          context.ellipse(
            x,
            y,
            12 + ring * 8,
            5 + ring * 4,
            ring * 1.05 + atom,
            0,
            Math.PI * 2,
          );
          context.stroke();
        }
      }
      return;
    }

    if (["bond", "protein", "fiber"].includes(motif)) {
      for (let strand = 0; strand < 24; strand += 1) {
        const y = (strand / 23) * size;
        const wave = 12 + (strand % 4) * 5;
        context.strokeStyle = strand % 3 ? ink.getStyle() : pale.getStyle();
        context.lineWidth = motif === "fiber" ? 4 + (strand % 3) : 2.4;
        context.beginPath();
        context.moveTo(-20, y);
        context.bezierCurveTo(
          size * 0.28,
          y + wave,
          size * 0.72,
          y - wave,
          size + 20,
          y + (strand % 2 ? 7 : -7),
        );
        context.stroke();
        if (motif !== "fiber" && strand % 2 === 0) {
          for (let node = 1; node < 5; node += 1) {
            point((node / 5) * size, y, 3 + (node % 2), dark.getStyle());
          }
        }
      }
      return;
    }

    if (["virus", "cell", "microbe"].includes(motif)) {
      for (let body = 0; body < 24; body += 1) {
        const x = randomX(body);
        const y = randomY(body);
        const radius = 8 + (body % 5) * 2.5;
        context.strokeStyle = body % 2 ? ink.getStyle() : pale.getStyle();
        context.lineWidth = 3;
        context.beginPath();
        context.ellipse(
          x,
          y,
          motif === "microbe" ? radius * 1.55 : radius,
          radius,
          pseudo(seed + body) * Math.PI,
          0,
          Math.PI * 2,
        );
        context.stroke();
        point(x + radius * 0.18, y, radius * 0.22, dark.getStyle());
        if (motif === "virus") {
          for (let spike = 0; spike < 8; spike += 1) {
            const angle = (spike / 8) * Math.PI * 2;
            context.beginPath();
            context.moveTo(
              x + Math.cos(angle) * radius,
              y + Math.sin(angle) * radius,
            );
            context.lineTo(
              x + Math.cos(angle) * (radius + 5),
              y + Math.sin(angle) * (radius + 5),
            );
            context.stroke();
          }
        }
      }
      return;
    }

    if (motif === "grain") {
      for (let speck = 0; speck < 520; speck += 1) {
        point(
          randomX(speck),
          randomY(speck),
          0.5 + pseudo(seed + speck * 1.9) * 2.8,
          speck % 5 ? dark.getStyle() : ink.getStyle(),
        );
      }
      return;
    }

    if (["object", "room"].includes(motif)) {
      for (let object = 0; object < 42; object += 1) {
        const x = randomX(object);
        const y = randomY(object);
        const width = 6 + (object % 5) * 3;
        const height = 5 + ((object + 2) % 4) * 3;
        context.strokeStyle = object % 3 ? dark.getStyle() : ink.getStyle();
        context.lineWidth = 2.4;
        context.strokeRect(x, y, width, height);
        if (object % 2 === 0) {
          context.beginPath();
          context.moveTo(x + 2, y + height);
          context.lineTo(x, y + height + 7);
          context.moveTo(x + width - 2, y + height);
          context.lineTo(x + width, y + height + 7);
          context.stroke();
        }
      }
      return;
    }

    if (motif === "road" || motif === "city") {
      const step = motif === "city" ? 48 : 66;
      context.strokeStyle = dark.getStyle();
      context.lineWidth = motif === "city" ? 8 : 13;
      for (let line = -step; line < size + step; line += step) {
        context.beginPath();
        context.moveTo(line, 0);
        context.lineTo(line, size);
        context.moveTo(0, line);
        context.lineTo(size, line);
        context.stroke();
      }
      if (motif === "city") {
        context.fillStyle = ink.getStyle();
        for (let block = 0; block < 70; block += 1) {
          context.fillRect(
            randomX(block),
            randomY(block),
            7 + (block % 4) * 3,
            6 + ((block + 1) % 5) * 2,
          );
        }
      }
      return;
    }

    if (["terrain", "moon", "planet"].includes(motif)) {
      for (let contour = 0; contour < 34; contour += 1) {
        const x = randomX(contour);
        const y = randomY(contour);
        const radius = 7 + (contour % 6) * 5;
        context.strokeStyle = contour % 3 ? ink.getStyle() : dark.getStyle();
        context.lineWidth = 1.5 + (contour % 3);
        context.beginPath();
        context.ellipse(
          x,
          y,
          radius * (motif === "terrain" ? 1.6 : 1),
          radius,
          pseudo(seed + contour) * Math.PI,
          0,
          Math.PI * 2,
        );
        context.stroke();
        if (motif === "planet" && contour % 4 === 0) {
          context.beginPath();
          context.moveTo(x - radius * 2, y);
          context.bezierCurveTo(x - radius, y - 7, x + radius, y + 7, x + radius * 2, y);
          context.stroke();
        }
      }
      return;
    }

    if (motif === "star" || motif === "galaxy") {
      for (let star = 0; star < 110; star += 1) {
        const x = randomX(star);
        const y = randomY(star);
        point(x, y, star % 13 === 0 ? 3.5 : 1.2, star % 3 ? ink.getStyle() : pale.getStyle());
        if (motif === "galaxy" && star % 18 === 0) {
          context.strokeStyle = pale.getStyle();
          context.lineWidth = 2;
          context.beginPath();
          context.ellipse(x, y, 20, 7, star * 0.31, 0, Math.PI * 2);
          context.stroke();
        }
      }
      return;
    }

    if (["web", "horizon", "speculative"].includes(motif)) {
      const nodes = Array.from({ length: 32 }, (_, node) => ({
        x: randomX(node),
        y: randomY(node),
      }));
      context.strokeStyle = ink.getStyle();
      context.lineWidth = 2.2;
      nodes.forEach((node, index) => {
        const neighbor = nodes[(index * 7 + 5) % nodes.length];
        context.beginPath();
        context.moveTo(node.x, node.y);
        if (motif === "speculative") {
          context.bezierCurveTo(
            node.x + 30,
            node.y - 24,
            neighbor.x - 30,
            neighbor.y + 24,
            neighbor.x,
            neighbor.y,
          );
        } else {
          context.lineTo(neighbor.x, neighbor.y);
        }
        context.stroke();
        point(node.x, node.y, motif === "horizon" ? 4 : 2.5, pale.getStyle());
      });
    }
  };

  const makeFoundationPatternTexture = (plan: FoundationPlan) => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d")!;
    const palette = plan.nearest
      ? ERAS[plan.nearest.index].palette
      : activeEra.palette;
    const base = new THREE.Color(palette[1]).lerp(
      new THREE.Color("#e8ead0"),
      0.2,
    );
    context.fillStyle = base.getStyle();
    context.fillRect(0, 0, canvas.width, canvas.height);

    [...plan.compressed].reverse().forEach((layer) => {
      drawFoundationMotif(
        context,
        layer.motif,
        ERAS[layer.index].palette,
        canvas.width,
        layer.index * 101 + layer.depth,
        Math.max(0.08, 0.22 - layer.depth * 0.035),
      );
    });
    if (plan.nearest) {
      drawFoundationMotif(
        context,
        plan.nearest.motif,
        ERAS[plan.nearest.index].palette,
        canvas.width,
        plan.nearest.index * 101,
        0.42,
      );
    }
    if (plan.ancestryCount > 0) {
      context.globalAlpha = 0.055;
      context.fillStyle = ERAS[0].palette[2];
      for (let trace = 0; trace < 72; trace += 1) {
        context.beginPath();
        context.arc(
          pseudo(trace * 7.7 + plan.ancestryCount) * canvas.width,
          pseudo(trace * 13.1 + plan.ancestryCount) * canvas.height,
          0.6 + (trace % 3) * 0.5,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    }
    context.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    const repeat = ["road", "city", "terrain", "room", "object"].includes(
      plan.nearest?.motif ?? "foam",
    )
      ? 5
      : 9;
    texture.repeat.set(repeat, repeat);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  };

  const clearTransitionRug = () => {
    if (transitionRug.visible || transitionShell.visible) {
      baseSceneDrawCallsDirty = true;
    }
    transitionRug.visible = false;
    transitionRug.scale.setScalar(1);
    transitionShell.visible = false;
    transitionShell.scale.setScalar(1);
    transitionRugMaterial.opacity = 0;
    transitionShellMaterial.opacity = 0;
    transitionRugMaterial.map = null;
    transitionRugMaterial.needsUpdate = true;
    transitionShellMaterial.map = null;
    transitionShellMaterial.needsUpdate = true;
    transitionRugTexture?.dispose();
    transitionRugTexture = null;
    transitionRugKey = "";
    transitionRugMode = "none";
    transitionRugTargetOpacity = 0;
    transitionHandoffBlend = 0;
  };

  const prepareTransitionRug = (nextIndex: number) => {
    clearTransitionRug();
    const plan = foundationPlan(nextIndex, ERAS);
    if (!plan.nearest) return;
    const nextWorldKind = worldSpecForEra(ERAS[nextIndex].name).kind;
    const style = foundationMemoryStyle(plan.presentation, nextWorldKind);
    transitionRugMode =
      plan.presentation === "shell" && nextWorldKind === "planet-surface"
        ? "shell"
        : style.overlayVisible
          ? "plane"
          : "none";
    if (transitionRugMode === "none") return;
    transitionRugTexture = makeFoundationPatternTexture(plan);
    transitionRugKey = plan.key;
    const material =
      transitionRugMode === "shell"
        ? transitionShellMaterial
        : transitionRugMaterial;
    material.map = transitionRugTexture;
    material.needsUpdate = true;
    transitionRugHeight = style.height;
    transitionRugTargetOpacity =
      transitionRugMode === "shell" ? 0.72 : style.opacity;
  };

  const applyGroundScaleTexture = (viewScale: number) => {
    const plan = foundationPlan(viewScale, ERAS);
    if (plan.key === groundTextureKey) return;
    const startedAt = phaseStart();
    groundTexture?.dispose();
    if (transitionRugTexture && transitionRugKey === plan.key) {
      groundTexture = transitionRugTexture;
      transitionRugTexture = null;
      transitionRugKey = "";
      transitionRugMaterial.map = null;
      transitionRugMaterial.needsUpdate = true;
      transitionShellMaterial.map = null;
      transitionShellMaterial.needsUpdate = true;
    } else {
      groundTexture = makeFoundationPatternTexture(plan);
    }
    groundTextureKey = plan.key;
    groundMaterial.map = groundTexture;
    groundMaterial.needsUpdate = true;
    foundationOverlayMaterial.map = groundTexture;
    foundationOverlayMaterial.needsUpdate = true;
    foundationSurfaceMaterials.forEach((material) => {
      material.map = groundTexture;
      material.needsUpdate = true;
    });
    literalGroundTexture?.dispose();
    literalGroundTexture = groundTexture.clone();
    literalGroundTexture.offset.set(0, 0);
    literalGroundTexture.needsUpdate = true;
    literalFoundationSurfaceMaterials.forEach((material) => {
      material.map = literalGroundTexture;
      material.needsUpdate = true;
    });
    phaseEnd("ground-texture", startedAt);
  };

  const applyScaleTextures = (index: number) => {
    applyGroundScaleTexture(index);
    if (coreSurfaceTextureKey === index) return;
    coreSurfaceTexture?.dispose();
    coreSurfaceTexture = makeScalePatternTexture(index, true);
    coreSurfaceTextureKey = index;
    coreMaterial.map = coreSurfaceTexture;
    coreMaterial.needsUpdate = true;
  };

  const addEraSignature = (index: number) => {
    const visualIndex = legacyVisualIndexForEra(index);
    if (visualIndex === 0) {
      for (let bubble = 0; bubble < 18; bubble += 1) {
        addScenery(
          new THREE.SphereGeometry(0.6 + pseudo(bubble) * 2.2, 18, 12),
          sceneryGlow(bubble % 2 ? "#ff73ca" : "#75e8ff", 0.1, true),
          [
            (pseudo(bubble * 3.7) - 0.5) * 54,
            1.5 + pseudo(bubble * 8.1) * 15,
            (pseudo(bubble * 5.2) - 0.5) * 56,
          ],
        );
      }
    } else if (visualIndex === 1) {
      [-16, 0, 16].forEach((x, plane) => {
        addScenery(
          new THREE.PlaneGeometry(22, 22, 9, 9),
          sceneryGlow(plane === 1 ? "#67ddff" : "#a993ff", 0.13, true),
          [x, 8 + plane * 2, -28 - plane * 5],
          [0.15, plane * 0.45, 0],
        );
      });
    } else if (visualIndex === 2) {
      for (let knot = 0; knot < 12; knot += 1) {
        const angle = (knot / 12) * Math.PI * 2;
        addScenery(
          new THREE.TorusKnotGeometry(1.2 + (knot % 3) * 0.45, 0.09, 72, 7, 2, 3),
          sceneryGlow(["#ff5575", "#57a7ff", "#ffd94f"][knot % 3], 0.5),
          [Math.cos(angle) * 28, 3 + (knot % 4) * 2.2, Math.sin(angle) * 28],
          [pseudo(knot) * Math.PI, pseudo(knot + 8) * Math.PI, 0],
        );
      }
    } else if (visualIndex === 3) {
      for (let cluster = 0; cluster < 13; cluster += 1) {
        const angle = (cluster / 13) * Math.PI * 2;
        const parent = new THREE.Group();
        parent.position.set(Math.cos(angle) * 31, 3 + (cluster % 4) * 2, Math.sin(angle) * 31);
        environmentGroup.add(parent);
        [
          [-0.7, 0.2, 0.1],
          [0.7, 0.2, -0.1],
          [0, -0.65, 0],
        ].forEach((position, part) => {
          addScenery(
            new THREE.SphereGeometry(0.72, 18, 12),
            sceneryGlow(["#ff657c", "#62aaff", "#ffe06b"][part], 0.5),
            position as [number, number, number],
            [0, 0, 0],
            [1, 1, 1],
            parent,
          );
        });
      }
    } else if (visualIndex === 4) {
      for (let cloud = 0; cloud < 16; cloud += 1) {
        const angle = (cloud / 16) * Math.PI * 2;
        addScenery(
          new THREE.SphereGeometry(1.5 + (cloud % 3) * 0.7, 20, 14),
          sceneryGlow(cloud % 2 ? "#6ee8be" : "#b9fff0", 0.12, true),
          [Math.cos(angle) * 31, 2 + (cloud % 5) * 1.7, Math.sin(angle) * 31],
          [0, cloud * 0.3, 0],
          [1.4, 0.75 + (cloud % 2) * 0.35, 1],
        );
      }
    } else if (visualIndex === 5) {
      for (let molecule = 0; molecule < 18; molecule += 1) {
        const angle = (molecule / 18) * Math.PI * 2;
        const parent = new THREE.Group();
        parent.position.set(Math.cos(angle) * 30, 2.5 + (molecule % 4), Math.sin(angle) * 30);
        parent.rotation.set(pseudo(molecule), pseudo(molecule + 3) * Math.PI, pseudo(molecule + 9));
        environmentGroup.add(parent);
        for (let atom = 0; atom < 4; atom += 1) {
          addScenery(
            new THREE.SphereGeometry(0.34 + atom * 0.05, 14, 10),
            sceneryGlow(atom % 2 ? "#f7f0c6" : activeEra.palette[2], 0.62),
            [(atom - 1.5) * 0.75, Math.sin(atom * 2.2) * 0.45, 0],
            [0, 0, 0],
            [1, 1, 1],
            parent,
          );
        }
      }
    } else if (visualIndex === 6) {
      for (let helix = 0; helix < 12; helix += 1) {
        const angle = (helix / 12) * Math.PI * 2;
        addScenery(
          new THREE.TorusKnotGeometry(1.8, 0.14, 96, 8, 2, 5),
          sceneryGlow(helix % 2 ? "#ff9ac4" : "#8be8ff", 0.42),
          [Math.cos(angle) * 29, 3 + (helix % 4) * 2.1, Math.sin(angle) * 29],
          [Math.PI / 2, angle, 0],
          [0.7, 1.35, 0.7],
        );
      }
    } else if (visualIndex === 7) {
      for (let cell = 0; cell < 14; cell += 1) {
        const angle = (cell / 14) * Math.PI * 2;
        const cellGroup = new THREE.Group();
        cellGroup.position.set(
          Math.cos(angle) * 30,
          2.5 + (cell % 3) * 2.6,
          Math.sin(angle) * 30,
        );
        cellGroup.rotation.set(pseudo(cell), angle, pseudo(cell + 5));
        environmentGroup.add(cellGroup);
        addScenery(
          new THREE.IcosahedronGeometry(2.2 + (cell % 4) * 0.45, 3),
          sceneryGlow(cell % 3 ? "#8ee69e" : "#ff8295", 0.12),
          [0, 0, 0],
          [0, 0, 0],
          [1.2, 0.72, 1],
          cellGroup,
        );
        addScenery(
          new THREE.SphereGeometry(0.46 + (cell % 3) * 0.08, 12, 8),
          sceneryGlow(cell % 2 ? "#512a68" : "#714255", 0.58),
          [0.45, 0.08, 0.28],
          [0, 0, 0],
          [1.15, 0.82, 1],
          cellGroup,
        );
      }
    } else if (visualIndex === 8) {
      for (let fiber = 0; fiber < 22; fiber += 1) {
        const angle = (fiber / 22) * Math.PI * 2;
        addScenery(
          new THREE.CapsuleGeometry(0.16 + (fiber % 3) * 0.06, 5 + (fiber % 4), 5, 10),
          sceneryGlow(fiber % 3 ? "#e8dfcf" : "#f5dd54", 0.42),
          [Math.cos(angle) * (25 + (fiber % 3) * 4), 3.5, Math.sin(angle) * (25 + (fiber % 3) * 4)],
          [0.2 + pseudo(fiber) * 0.5, angle, 0.25],
        );
      }
    } else if (visualIndex === 9) {
      for (let mote = 0; mote < 38; mote += 1) {
        addScenery(
          new THREE.DodecahedronGeometry(0.14 + pseudo(mote) * 0.24, 0),
          sceneryGlow(mote % 3 ? "#f1cf83" : "#d9a2ab", 0.5),
          [
            (pseudo(mote * 4.1) - 0.5) * 48,
            0.4 + pseudo(mote * 8.3) * 7,
            (pseudo(mote * 2.7) - 0.5) * 48,
          ],
        );
      }
    } else if (visualIndex === 10) {
      addScenery(new THREE.CylinderGeometry(17, 17, 0.7, 48), sceneryToon("#b97861"), [0, -0.34, 0]);
    } else if (visualIndex === 11) {
      addScenery(new THREE.BoxGeometry(18, 9, 4), sceneryToon("#ec9d69"), [-28, 4.5, -29]);
    } else if (visualIndex === 12) {
      for (let barrier = -4; barrier <= 4; barrier += 1) {
        addScenery(new THREE.BoxGeometry(3.5, 0.5, 0.5), sceneryToon(barrier % 2 ? "#fff0d1" : "#ff7469"), [barrier * 5, 0.4, -28]);
      }
    } else if (visualIndex === 13) {
      for (let tower = 0; tower < 9; tower += 1) {
        addScenery(
          new THREE.BoxGeometry(3 + (tower % 3), 9 + (tower % 4) * 4, 3 + ((tower + 1) % 3)),
          sceneryToon(["#a9b7d0", "#ffb19f", "#91d5c4"][tower % 3]),
          [-28 + tower * 7, 4.5 + (tower % 4) * 2, -34],
        );
      }
    } else if (visualIndex === 16) {
      for (let flare = 0; flare < 9; flare += 1) {
        const angle = (flare / 9) * Math.PI * 2;
        addScenery(
          new THREE.IcosahedronGeometry(1.2 + (flare % 3) * 0.8, 3),
          sceneryGlow(["#ff765f", "#ffe374", "#78caff"][flare % 3], 0.72),
          [Math.cos(angle) * 35, 8 + (flare % 4) * 6, Math.sin(angle) * 35],
        );
      }
    } else if (visualIndex === 17) {
      [13, 22, 34, 48].forEach((radius, orbit) => {
        addScenery(
          new THREE.TorusGeometry(radius, 0.04 + orbit * 0.015, 5, 96),
          sceneryGlow(orbit % 2 ? "#bca6ff" : "#8ce9ff", 0.24),
          [0, 6 + orbit * 2, 0],
          [Math.PI / 2 + orbit * 0.12, orbit * 0.35, 0],
        );
      });
    }
  };

  const addBackdropEraSignature = (
    index: number,
    band: BackgroundBand,
  ) => {
    const firstNewChild = environmentGroup.children.length;
    addEraSignature(index);
    const cue = backgroundDepthCue(band, reducedMotion);
    const fogColor =
      scene.fog instanceof THREE.FogExp2 || scene.fog instanceof THREE.Fog
        ? scene.fog.color
        : deepColor;
    const newRoots = environmentGroup.children.slice(firstNewChild);
    newRoots.forEach((root) => {
      stampBackdropRenderOrder(root, band);
      root.traverse((object) => {
        if (
          !(
            object instanceof THREE.Mesh ||
            object instanceof THREE.Points ||
            object instanceof THREE.Line
          )
        ) {
          return;
        }
        object.castShadow = false;
        object.receiveShadow = false;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => {
          if ("color" in material) {
            (material as THREE.MeshBasicMaterial).color.lerp(
              fogColor,
              cue.fogMix,
            );
          }
          if (material.transparent) {
            material.opacity = Math.min(material.opacity, cue.opacityCap);
            material.depthWrite = false;
          }
          material.needsUpdate = true;
        });
      });
    });
    const targetGroup =
      band === "mid"
        ? midBackdropGroup
        : band === "far"
          ? farBackdropGroup
          : nearBackdropGroup;
    newRoots.forEach((root) => targetGroup.add(root));
  };

  const buildEnvironment = (index: number) => {
    disposeEnvironment();
    activeLiteralStage = null;
    literalPlayerSurfaceY = 0;
    environmentGroup.visible = true;
    applyScaleTextures(index);
    environmentMode = environmentModeFor(index);
    activeWorldKind = worldSpecForEra(ERAS[index].name).kind;
    environmentTravelRate =
      environmentDepthCue(activeWorldKind, reducedMotion)?.travelRate ?? 0;
    ground.visible = true;
    grid.visible = false;
    dustField.visible = true;
    environmentGroup.rotation.set(0, 0, 0);
    nearBackdropGroup.visible = true;
    midBackdropGroup.visible = true;
    farBackdropGroup.visible = true;

    const literalStage = literalStageForEra(ERAS[index].id);
    if (literalStage) {
      buildLiteralArchitecture(literalStage);
      return;
    }

    if (
      activeWorldKind === "void" ||
      activeWorldKind === "particle-field"
    ) {
      const voidColor = deepColor.clone().multiplyScalar(0.54);
      scene.background = voidColor;
      scene.fog = new THREE.FogExp2(voidColor, 0.009);
      ground.visible = false;
      dustMaterial.size = 0.13;
      dustMaterial.opacity = 0.82;
      hemisphere.intensity = 1.55;
      keyLight.intensity = 1.6;
      if (index === 0) {
        dustField.visible = false;
        return;
      }
      addStarField(reducedWorldDetail() ? 150 : 240, 72, index + 2);
      if (activeWorldKind === "particle-field") {
        const foamCount = reducedWorldDetail() ? 72 : 110;
        const foam = new THREE.InstancedMesh(
          new THREE.IcosahedronGeometry(0.42, 1),
          backdropGlow(activeEra.palette[2], "mid", 0.18, true),
          foamCount,
        );
        const dummy = new THREE.Object3D();
        for (let cell = 0; cell < foamCount; cell += 1) {
          const angle = pseudo(cell * 5.17 + index) * Math.PI * 2;
          const radius = 24 + pseudo(cell * 8.73 + index) * 48;
          dummy.position.set(
            Math.cos(angle) * radius,
            -0.2 + pseudo(cell * 3.11 + 8) * 5.4,
            Math.sin(angle) * radius,
          );
          dummy.rotation.set(
            pseudo(cell + 7),
            pseudo(cell + 13) * Math.PI,
            pseudo(cell + 19),
          );
          dummy.scale.setScalar(0.5 + pseudo(cell + 23) * 1.8);
          dummy.updateMatrix();
          foam.setMatrixAt(cell, dummy.matrix);
        }
        foam.instanceMatrix.needsUpdate = true;
        midBackdropGroup.add(foam);
      }
      for (let ring = 0; ring < 11; ring += 1) {
        const radius = 1.8 + pseudo(ring + 17) * 5.2;
        const angle = pseudo(ring + 31) * Math.PI * 2;
        const distance = 30 + pseudo(ring + 51) * 31;
        addScenery(
          new THREE.TorusGeometry(radius, 0.025 + pseudo(ring + 5) * 0.05, 5, 42),
          backdropGlow(
            ring % 2 ? activeEra.palette[2] : "#baf8ff",
            "mid",
            0.13 + pseudo(ring) * 0.08,
          ),
          [
            Math.cos(angle) * distance,
            2.5 + pseudo(ring + 41) * 13,
            Math.sin(angle) * distance,
          ],
          [
            pseudo(ring + 61) * Math.PI,
            pseudo(ring + 71) * Math.PI,
            pseudo(ring + 81) * Math.PI,
          ],
          [1, 1, 1],
          midBackdropGroup,
        );
      }
      for (let bubble = 0; bubble < 8; bubble += 1) {
        const angle = pseudo(bubble + 101) * Math.PI * 2;
        const distance = 48 + pseudo(bubble + 121) * 24;
        addScenery(
          new THREE.IcosahedronGeometry(0.8 + pseudo(bubble + 90) * 2.4, 2),
          backdropGlow(activeEra.palette[2], "far", 0.075, true),
          [
            Math.cos(angle) * distance,
            6 + pseudo(bubble + 111) * 14,
            Math.sin(angle) * distance,
          ],
          [0, 0, 0],
          [1, 1, 1],
          farBackdropGroup,
        );
      }
      addBackdropEraSignature(index, "near");
      return;
    }

    if (
      activeWorldKind === "microscopic-sea" ||
      activeWorldKind === "fiber-bed"
    ) {
      // Cells, molecules, and microbes occupy a medium rather than standing on
      // a literal floor. Fiber & Pollen is the first woven bed in this family.
      ground.visible = activeWorldKind === "fiber-bed";
      const seaColor = new THREE.Color("#062e39").lerp(deepColor, 0.35);
      scene.background = seaColor;
      scene.fog = new THREE.FogExp2(seaColor, 0.018);
      groundMaterial.color.set("#174f55");
      dustMaterial.size = 0.085;
      dustMaterial.opacity = 0.5;
      hemisphere.intensity = 1.4;
      keyLight.intensity = 2;
      for (let cell = 0; cell < 16; cell += 1) {
        const angle = (cell / 16) * Math.PI * 2 + pseudo(cell + 4) * 0.4;
        const distance = 20 + pseudo(cell + 22) * 24;
        const cellGroup = new THREE.Group();
        cellGroup.position.set(
          Math.cos(angle) * distance,
          2.2 + pseudo(cell + 32) * 8,
          Math.sin(angle) * distance,
        );
        cellGroup.rotation.set(
          pseudo(cell + 42),
          pseudo(cell + 52) * Math.PI,
          pseudo(cell + 62),
        );
        stampBackdropRenderOrder(cellGroup, "near");
        nearBackdropGroup.add(cellGroup);
        addScenery(
          new THREE.IcosahedronGeometry(2.2 + pseudo(cell + 72) * 2.4, 2),
          sceneryGlow(cell % 2 ? "#62e6cb" : "#ff8ad8", 0.13),
          [0, 0, 0],
          [0, 0, 0],
          [1.3, 0.62, 1],
          cellGroup,
        );
        addScenery(
          new THREE.SphereGeometry(0.42, 12, 8),
          sceneryGlow("#fff2a6", 0.55),
          [0.3, 0.1, 0],
          [0, 0, 0],
          [1.2, 0.72, 1],
          cellGroup,
        );
      }
      for (let strand = 0; strand < 7; strand += 1) {
        addScenery(
          new THREE.TorusKnotGeometry(2.4, 0.08, 56, 5, 2, 3),
          backdropGlow(
            strand % 2 ? "#84f7ff" : "#ffb3e1",
            "mid",
            0.15,
          ),
          [
            (pseudo(strand + 142) - 0.5) * 48,
            3 + pseudo(strand + 152) * 7,
            (pseudo(strand + 162) - 0.5) * 48,
          ],
          [pseudo(strand) * Math.PI, pseudo(strand + 2) * Math.PI, 0],
          [1, 1, 1],
          midBackdropGroup,
        );
      }
      addBackdropEraSignature(index, "near");
      return;
    }

    if (
      activeWorldKind === "dust-surface" ||
      activeWorldKind === "tabletop"
    ) {
      const tabletop = activeWorldKind === "tabletop";
      scene.background = new THREE.Color(tabletop ? "#f3bfd0" : "#efc9ad");
      scene.fog = new THREE.FogExp2(
        tabletop ? 0xf3bfd0 : 0xefc9ad,
        tabletop ? 0.009 : 0.013,
      );
      groundMaterial.color.set(tabletop ? "#9d684d" : "#a96f52");
      dustMaterial.size = tabletop ? 0.04 : 0.052;
      dustMaterial.opacity = tabletop ? 0.14 : 0.22;
      hemisphere.intensity = 1.28;
      keyLight.intensity = 2.55;

      if (tabletop) {
        addScenery(
          new THREE.CylinderGeometry(72, 72, 1.5, 64),
          sceneryToon("#a96b4e"),
          [0, -0.78, 0],
        );
        [-34, 34].forEach((x) => {
          [-31, 31].forEach((z) => {
            addScenery(
              new THREE.BoxGeometry(5, 34, 5),
              sceneryToon("#744737"),
              [x, -17.7, z],
            );
          });
        });
        addScenery(
          new THREE.BoxGeometry(18, 0.6, 13),
          sceneryToon("#e6d9bd"),
          [31, 0.55, -25],
          [0, -0.24, 0],
        );
        addScenery(
          new THREE.CylinderGeometry(4.7, 4.7, 7, 32, 1, true),
          sceneryToon("#71b8cc"),
          [-29, 3.5, -27],
        );
        addSceneryCollider(31, -25, 9, 6.5);
        addSceneryCollider(-29, -27, 5.2, 5.2);
      } else {
        for (let board = -11; board <= 11; board += 1) {
          addScenery(
            new THREE.BoxGeometry(170, 0.025, 0.09),
            sceneryToon(board % 2 ? "#754a3e" : "#cf9070"),
            [0, 0.025, board * 7.2],
          );
        }
        addScenery(
          new THREE.PlaneGeometry(170, 42),
          sceneryToon("#f6d7c0"),
          [0, 21, -70],
        );
        addScenery(
          new THREE.BoxGeometry(170, 0.7, 0.6),
          sceneryToon("#fff0df"),
          [0, 0.35, -69.6],
        );
        [-48, 48].forEach((x) => {
          addScenery(
            new THREE.CylinderGeometry(3.6, 4.2, 32, 12),
            sceneryToon("#73504a"),
            [x, 16, -47],
          );
        });
      }
      addEraSignature(index);
      return;
    }

    if (activeWorldKind === "interior") {
      scene.background = new THREE.Color("#f6b8cb");
      scene.fog = new THREE.FogExp2(0xf6b8cb, 0.012);
      groundMaterial.color.set("#9a5d57");
      dustMaterial.size = 0.045;
      dustMaterial.opacity = 0.18;
      hemisphere.intensity = 1.22;
      keyLight.intensity = 2.45;
      const wallMaterial = sceneryToon("#ffd8c8");
      addScenery(new THREE.PlaneGeometry(92, 30), wallMaterial, [0, 15, -40]);
      addScenery(
        new THREE.PlaneGeometry(86, 30),
        sceneryToon("#f7c4b8"),
        [-46, 15, 0],
        [0, Math.PI / 2, 0],
      );
      addScenery(
        new THREE.PlaneGeometry(86, 30),
        sceneryToon("#f7c4b8"),
        [46, 15, 0],
        [0, -Math.PI / 2, 0],
      );
      addSceneryCollider(-46, 0, 0.45, 43);
      addSceneryCollider(46, 0, 0.45, 43);
      addSceneryCollider(0, -40, 46, 0.45);
      for (let board = -8; board <= 8; board += 1) {
        addScenery(
          new THREE.BoxGeometry(92, 0.025, 0.08),
          sceneryToon(board % 2 ? "#7d4948" : "#b87568"),
          [0, 0.025, board * 4.7],
        );
      }
      addScenery(
        new THREE.PlaneGeometry(14, 11),
        sceneryToon("#89d9ed"),
        [-16, 17, -39.8],
      );
      addScenery(new THREE.BoxGeometry(15.2, 0.45, 0.25), sceneryToon("#fff5dd"), [-16, 17, -39.5]);
      addScenery(new THREE.BoxGeometry(0.45, 12, 0.25), sceneryToon("#fff5dd"), [-16, 17, -39.5]);
      addScenery(
        new THREE.BoxGeometry(15, 0.5, 0.5),
        sceneryToon("#fff5dd"),
        [-16, 11.6, -39.2],
      );
      const furniture = new THREE.Group();
      furniture.position.set(25, 0, -26);
      environmentGroup.add(furniture);
      addScenery(new THREE.BoxGeometry(13, 1.1, 8), sceneryToon("#6f3c68"), [0, 8.5, 0], [0, 0, 0], [1, 1, 1], furniture);
      [-5, 5].forEach((x) => {
        [-2.8, 2.8].forEach((z) => {
          addScenery(new THREE.BoxGeometry(0.8, 8, 0.8), sceneryToon("#56304f"), [x, 4.2, z], [0, 0, 0], [1, 1, 1], furniture);
        });
      });
      addSceneryCollider(25, -26, 6.8, 4.4);
      addScenery(
        new THREE.BoxGeometry(120, 0.05, 48),
        sceneryToon("#76a968"),
        [0, 0.035, 65],
      );
      addScenery(
        new THREE.BoxGeometry(120, 0.06, 12),
        sceneryToon("#4d5561"),
        [0, 0.08, 83],
      );
      [-11.5, 11.5].forEach((x) => {
        addScenery(
          new THREE.BoxGeometry(1.1, 12, 1.1),
          sceneryToon("#fff0df"),
          [x, 6, 39],
        );
      });
      addScenery(
        new THREE.BoxGeometry(24, 1.1, 1.1),
        sceneryToon("#fff0df"),
        [0, 11.5, 39],
      );
      [-32, 32].forEach((x, house) => {
        addScenery(
          new THREE.BoxGeometry(18, 12, 14),
          sceneryToon(house ? "#a8d2df" : "#ffd1ac"),
          [x, 6, 104],
        );
        addScenery(
          new THREE.ConeGeometry(13, 6, 4),
          sceneryToon("#72485a"),
          [x, 15, 104],
          [0, Math.PI / 4, 0],
        );
      });
      addEraSignature(index);
      return;
    }

    if (activeWorldKind === "yard") {
      scene.background = new THREE.Color("#82d7f3");
      scene.fog = new THREE.FogExp2(0x82d7f3, 0.009);
      groundMaterial.color.set(
        activeEra.name === "Vehicle Yard" ? "#779667" : "#6ea25c",
      );
      dustMaterial.size = 0.035;
      dustMaterial.opacity = 0.12;
      hemisphere.intensity = 1.55;
      keyLight.intensity = 2.8;
      addScenery(new THREE.BoxGeometry(13, 0.08, 190), sceneryToon("#49515f"), [0, 0.08, 0]);
      addScenery(new THREE.BoxGeometry(190, 0.07, 13), sceneryToon("#535967"), [0, 0.075, 0]);
      for (let dash = -7; dash <= 7; dash += 1) {
        addScenery(new THREE.BoxGeometry(0.22, 0.025, 3.3), sceneryToon("#ffe894"), [0, 0.14, dash * 8]);
        addScenery(new THREE.BoxGeometry(3.3, 0.025, 0.22), sceneryToon("#ffe894"), [dash * 8, 0.14, 0]);
      }
      for (let house = 0; house < 8; house += 1) {
        // Diagonal placement leaves the connected north/south/east/west
        // streets as explicit gateways even at the largest roll envelope.
        const angle = (house / 8) * Math.PI * 2 + Math.PI / 8;
        const distance = 32 + (house % 3) * 5;
        const houseGroup = new THREE.Group();
        houseGroup.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
        houseGroup.rotation.y = -angle + Math.PI / 2;
        environmentGroup.add(houseGroup);
        const houseColor = ["#ffafbd", "#ffd67d", "#94d8c5", "#bea7ef"][house % 4];
        addScenery(new THREE.BoxGeometry(7.8, 6.4, 6.8), sceneryToon(houseColor), [0, 3.2, 0], [0, 0, 0], [1, 1, 1], houseGroup);
        addScenery(new THREE.ConeGeometry(5.8, 3.3, 4), sceneryToon("#71455c"), [0, 8, 0], [0, Math.PI / 4, 0], [1, 1, 1], houseGroup);
        addScenery(new THREE.BoxGeometry(1.6, 3.2, 0.15), sceneryToon("#563b65"), [0, 1.65, 3.48], [0, 0, 0], [1, 1, 1], houseGroup);
        const treeX = house % 2 ? 5.5 : -5.5;
        addScenery(new THREE.CylinderGeometry(0.45, 0.62, 4, 7), sceneryToon("#7c5138"), [treeX, 2, 0], [0, 0, 0], [1, 1, 1], houseGroup);
        addScenery(new THREE.IcosahedronGeometry(2.1, 1), sceneryToon("#45a957"), [treeX, 5.1, 0], [0, 0, 0], [1, 1, 1], houseGroup);
        addScenery(
          new THREE.BoxGeometry(3.2, 0.035, 12),
          sceneryToon("#d9ccb6"),
          [0, 0.11, 9],
          [0, 0, 0],
          [1, 1, 1],
          houseGroup,
        );
        addSceneryCollider(
          houseGroup.position.x,
          houseGroup.position.z,
          4.8,
          4.8,
        );
      }
      addEraSignature(index);
      return;
    }

    if (activeWorldKind === "city") {
      scene.background = new THREE.Color("#88cde7");
      scene.fog = new THREE.FogExp2(0x88cde7, 0.0065);
      groundMaterial.color.set("#768b7b");
      dustMaterial.size = 0.026;
      dustMaterial.opacity = 0.08;
      hemisphere.intensity = 1.45;
      keyLight.intensity = 2.85;

      const roadCenters = [-64, -32, 0, 32, 64];
      roadCenters.forEach((position) => {
        addScenery(
          new THREE.BoxGeometry(10, 0.055, 180),
          sceneryToon("#404a55"),
          [position, 0.075, 0],
        );
        addScenery(
          new THREE.BoxGeometry(180, 0.05, 10),
          sceneryToon("#46505a"),
          [0, 0.07, position],
        );
      });

      const blockCenters = [-48, -16, 16, 48];
      const buildingGroups = ["#a7b7cc", "#efad9e", "#9fc7b4"].map(
        (color) =>
          new THREE.InstancedMesh(
            new THREE.BoxGeometry(1, 1, 1),
            sceneryToon(color),
            16,
          ),
      );
      const buildingCounts = [0, 0, 0];
      const dummy = new THREE.Object3D();
      blockCenters.forEach((x, column) => {
        blockCenters.forEach((z, row) => {
          addScenery(
            new THREE.BoxGeometry(22, 0.09, 22),
            sceneryToon("#d7d0bd"),
            [x, 0.1, z],
          );
          const slot = column * blockCenters.length + row;
          if (slot % 7 === 0) {
            addScenery(
              new THREE.CylinderGeometry(1.1, 1.35, 5.5, 8),
              sceneryToon("#6b4a37"),
              [x, 2.75, z],
            );
            addScenery(
              new THREE.IcosahedronGeometry(3.3, 1),
              sceneryToon("#48a45b"),
              [x, 7, z],
            );
            return;
          }
          const family = slot % buildingGroups.length;
          const height = 8 + pseudo(slot + index * 41) * 27;
          dummy.position.set(x, height / 2 + 0.15, z);
          dummy.scale.set(
            10 + pseudo(slot + 13) * 5,
            height,
            10 + pseudo(slot + 29) * 5,
          );
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          buildingGroups[family].setMatrixAt(
            buildingCounts[family],
            dummy.matrix,
          );
          buildingCounts[family] += 1;
          addSceneryCollider(x, z, 7.8, 7.8);
        });
      });
      buildingGroups.forEach((buildings, family) => {
        buildings.count = buildingCounts[family];
        buildings.instanceMatrix.needsUpdate = true;
        environmentGroup.add(buildings);
      });
      addEraSignature(index);
      return;
    }

    if (activeWorldKind === "landscape") {
      scene.background = new THREE.Color("#72b9d6");
      scene.fog = new THREE.FogExp2(0x72b9d6, 0.0052);
      groundMaterial.color.set("#668f58");
      dustMaterial.size = 0.025;
      dustMaterial.opacity = 0.075;
      hemisphere.intensity = 1.55;
      keyLight.intensity = 2.9;

      const river = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-86, 0.16, -58),
        new THREE.Vector3(-44, 0.16, -12),
        new THREE.Vector3(-7, 0.16, -2),
        new THREE.Vector3(31, 0.16, 25),
        new THREE.Vector3(83, 0.16, 62),
      ]);
      addScenery(
        new THREE.TubeGeometry(river, 72, 2.8, 8, false),
        sceneryToon("#5cb9d5"),
        [0, 0, 0],
      );
      for (let ridge = 0; ridge < 24; ridge += 1) {
        const side = ridge % 2 === 0 ? -1 : 1;
        const x = -74 + (ridge % 12) * 13.5;
        const z = side * (36 + pseudo(ridge + 44) * 24);
        const height = 4 + pseudo(ridge + 63) * 10;
        addScenery(
          new THREE.ConeGeometry(
            3.5 + pseudo(ridge + 72) * 4,
            height,
            7,
          ),
          sceneryToon(ridge % 3 ? "#648161" : "#7e7c69"),
          [x, height / 2, z],
          [0, pseudo(ridge + 81) * Math.PI, 0],
        );
      }
      for (let town = 0; town < 38; town += 1) {
        const x = 38 + (town % 7) * 2.4;
        const z = -35 + Math.floor(town / 7) * 2.7;
        addScenery(
          new THREE.BoxGeometry(1.5, 0.8 + (town % 4) * 0.35, 1.5),
          sceneryToon(["#d9c5a3", "#b9c5cd", "#e2b29e"][town % 3]),
          [x, 0.5 + (town % 4) * 0.18, z],
        );
      }
      addScenery(
        new THREE.BoxGeometry(72, 0.04, 1.1),
        sceneryToon("#d9c38c"),
        [9, 0.13, 45],
        [0, -0.28, 0],
      );
      addEraSignature(index);
      return;
    }

    if (activeWorldKind === "planet-surface") {
      const atmosphere = activeEra.name === "Planetary Pantry";
      const skyColor = atmosphere
        ? new THREE.Color("#3e87b7")
        : new THREE.Color("#071946");
      scene.background = skyColor;
      scene.fog = new THREE.FogExp2(skyColor, atmosphere ? 0.006 : 0.0035);
      ground.visible = false;
      dustMaterial.size = 0.04;
      dustMaterial.opacity = atmosphere ? 0.12 : 0.42;
      hemisphere.intensity = 1.25;
      keyLight.intensity = 3;
      const planetSurfaceMaterial = new THREE.MeshStandardMaterial({
        color: atmosphere ? "#5f9d63" : "#3c77ad",
        roughness: 0.92,
        metalness: 0,
        flatShading: true,
        map: groundTexture,
      });
      foundationSurfaceMaterials.add(planetSurfaceMaterial);
      addScenery(
        new THREE.SphereGeometry(
          80,
          reducedWorldDetail() ? 48 : 72,
          reducedWorldDetail() ? 32 : 48,
        ),
        planetSurfaceMaterial,
        [0, -79, 0],
        [Math.PI / 2, 0, 0],
      );
      addScenery(
        new THREE.SphereGeometry(82.5, 42, 28),
        sceneryGlow("#8ce7ff", 0.1),
        [0, -79, 0],
      );
      for (let mountain = 0; mountain < 18; mountain += 1) {
        const angle = (mountain / 18) * Math.PI * 2;
        const distance = 27 + pseudo(mountain + 211) * 16;
        addScenery(
          new THREE.ConeGeometry(2.5 + pseudo(mountain + 221) * 2.5, 4 + pseudo(mountain + 231) * 5, 6),
          sceneryToon(mountain % 3 ? "#6a7f6d" : "#8b7891"),
          [Math.cos(angle) * distance, 2.3, Math.sin(angle) * distance],
          [0, pseudo(mountain + 241) * Math.PI, 0],
          [1, 1, 1],
          midBackdropGroup,
        );
      }
      if (!atmosphere) {
        addStarField(reducedWorldDetail() ? 260 : 430, 100, 315);
      }
      addBackdropEraSignature(index, "near");
      return;
    }

    if (activeWorldKind === "giant-atmosphere") {
      const skyColor = new THREE.Color("#594b69");
      scene.background = skyColor;
      scene.fog = new THREE.FogExp2(skyColor, 0.0045);
      ground.visible = false;
      dustField.visible = false;
      hemisphere.intensity = 1.32;
      keyLight.intensity = 3.1;

      // Giant planets have no solid surface to roll on. The player occupies a
      // deliberately airy cloud-top/orbital metaphor while the banded planet
      // hangs well below the play plane.
      const giantSurfaceMaterial = new THREE.MeshStandardMaterial({
        color: "#c99a6f",
        roughness: 0.88,
        metalness: 0,
        flatShading: true,
        map: groundTexture,
      });
      foundationSurfaceMaterials.add(giantSurfaceMaterial);
      addScenery(
        new THREE.SphereGeometry(
          42,
          reducedWorldDetail() ? 36 : 56,
          reducedWorldDetail() ? 24 : 38,
        ),
        giantSurfaceMaterial,
        [0, -58, -48],
      );
      [-14, -7, 1, 9, 16].forEach((latitude, band) => {
        const radius = Math.sqrt(42 ** 2 - latitude ** 2);
        addScenery(
          new THREE.TorusGeometry(radius, band % 2 ? 0.8 : 1.35, 6, 72),
          sceneryGlow(
            ["#f2c78d", "#b86f62", "#ffe0a6"][band % 3],
            0.24,
          ),
          [0, -58 + latitude, -48],
          [Math.PI / 2, 0, 0],
        );
      });
      addScenery(
        new THREE.TorusGeometry(55, 0.32, 6, 96),
        sceneryGlow("#ead7aa", 0.28),
        [0, -58, -48],
        [Math.PI / 2 + 0.22, 0, -0.18],
        [1, 1, 0.34],
      );

      const cloudCount = reducedWorldDetail() ? 46 : 72;
      const clouds = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(1, 2),
        sceneryGlow("#f8dcbf", 0.13),
        cloudCount,
      );
      clouds.name = "giant-atmosphere:cloud-top";
      const cloud = new THREE.Object3D();
      for (let cell = 0; cell < cloudCount; cell += 1) {
        const angle = pseudo(cell * 7.13 + index) * Math.PI * 2;
        const distance = 7 + pseudo(cell * 11.29 + 3) * 55;
        cloud.position.set(
          Math.cos(angle) * distance,
          -1.8 + pseudo(cell * 3.71 + 5) * 3.8,
          Math.sin(angle) * distance,
        );
        cloud.rotation.set(
          pseudo(cell + 11) * 0.4,
          pseudo(cell + 17) * Math.PI,
          pseudo(cell + 23) * 0.3,
        );
        const cloudScale = 1.2 + pseudo(cell * 5.3 + 29) * 3.4;
        cloud.scale.set(cloudScale * 1.8, cloudScale * 0.42, cloudScale);
        cloud.updateMatrix();
        clouds.setMatrixAt(cell, cloud.matrix);
      }
      clouds.instanceMatrix.needsUpdate = true;
      clouds.castShadow = false;
      clouds.receiveShadow = false;
      environmentGroup.add(clouds);
      addStarField(reducedWorldDetail() ? 180 : 300, 104, index * 29);
      addBackdropEraSignature(index, "mid");
      return;
    }

    scene.background = new THREE.Color("#02020e");
    scene.fog = new THREE.FogExp2(0x02020e, 0.0015);
    ground.visible = false;
    dustField.visible = false;
    hemisphere.intensity = 0.72;
    keyLight.intensity = 3.3;
    addStarField(reducedWorldDetail() ? 520 : 900, 108, index * 19);
    const galaxyCount = [
      "galaxy-field",
      "cosmic-web",
      "speculative-beyond",
    ].includes(activeWorldKind)
      ? reducedWorldDetail()
        ? 7
        : 11
      : 4;
    for (let galaxy = 0; galaxy < galaxyCount; galaxy += 1) {
      const galaxyGroup = new THREE.Group();
      const angle = (galaxy / galaxyCount) * Math.PI * 2 + 0.35;
      const distance = 31 + (galaxy % 4) * 10;
      galaxyGroup.position.set(
        Math.cos(angle) * distance,
        7 + pseudo(galaxy + 301) * 23,
        Math.sin(angle) * distance,
      );
      galaxyGroup.rotation.set(
        pseudo(galaxy + 311) * Math.PI,
        pseudo(galaxy + 321) * Math.PI,
        pseudo(galaxy + 331) * Math.PI,
      );
      stampBackdropRenderOrder(galaxyGroup, "mid");
      midBackdropGroup.add(galaxyGroup);
      const galaxyColor = ["#c5b4ff", "#ffafd9", "#9ef6ff"][galaxy % 3];
      for (let ring = 0; ring < 3; ring += 1) {
        addScenery(
          new THREE.TorusGeometry(2.2 + ring * 1.1, 0.1, 5, 54),
          backdropGlow(galaxyColor, "mid", 0.15 - ring * 0.025),
          [0, 0, 0],
          [Math.PI / 2, ring * 0.28, 0],
          [1.8, 1, 0.72],
          galaxyGroup,
        );
      }
      addScenery(
        new THREE.IcosahedronGeometry(0.62, 1),
        backdropGlow("#fff4b0", "mid", 0.15),
        [0, 0, 0],
        [0, 0, 0],
        [1, 1, 1],
        galaxyGroup,
      );
    }
    if (
      activeWorldKind === "cosmic-web" ||
      activeWorldKind === "speculative-beyond"
    ) {
      COSMIC_BACKDROP_SHELLS.forEach(({ radius, position }, shell) => {
        addScenery(
          new THREE.SphereGeometry(radius, 28, 18),
          backdropGlow(
            shell === 1 ? "#7c71ff" : "#ff78ca",
            "far",
            0.065,
            true,
          ),
          position,
          [0, 0, 0],
          [1, 1, 1],
          farBackdropGroup,
        );
      });
    }
    if (activeWorldKind === "speculative-beyond") {
      for (let bubble = 0; bubble < 9; bubble += 1) {
        const angle = (bubble / 9) * Math.PI * 2;
        addScenery(
          new THREE.SphereGeometry(5 + (bubble % 3) * 2, 18, 12),
          backdropGlow(
            ["#8cf3ff", "#ff85d2", "#c9a0ff"][bubble % 3],
            "far",
            0.075,
            true,
          ),
          [
            Math.cos(angle) * (40 + (bubble % 2) * 18),
            9 + (bubble % 4) * 8,
            Math.sin(angle) * (40 + (bubble % 2) * 18),
          ],
          [0, 0, 0],
          [1, 1, 1],
          farBackdropGroup,
        );
      }
    }
    addBackdropEraSignature(index, "mid");
  };

  const rebuildEnvironment = (index: number) => {
    const startedAt = phaseStart();
    buildEnvironment(index);
    if (worldUsesPeriodicTiles(activeEra.name)) {
      addPeriodicEnvironmentLod(
        environmentGroup,
        worldChunkSize(activeWorldKind),
      );
    }
    centralSceneryCompact = null;
    worldGeneration += 1;
    baseSceneDrawCallsDirty = true;
    phaseEnd("world-rebuild", startedAt);
  };

  const applyEraTheme = (index: number, announce = false) => {
    activeIndex = index;
    activeEra = ERAS[index];
    if (labEra === null && debugEraOverride === null) game.era = index;
    early =
      activeEra.realm === "prephysical" || activeEra.realm === "particle";

    deepColor.set(activeEra.palette[0]);
    middleColor.set(activeEra.palette[1]);
    pop.set(activeEra.palette[2]);
    groundMaterial.color
      .copy(middleColor)
      .lerp(new THREE.Color("#ffdff1"), 0.18)
      .multiplyScalar(0.82);
    gridMaterials.forEach((material) => {
      if ("color" in material) {
        (material as THREE.LineBasicMaterial).color.set(activeEra.palette[2]);
      }
      material.opacity = activeEra.realm === "matter" ? 0.12 : 0.08;
    });
    hemisphere.intensity = early ? 1.5 : 1.1;
    glowLight.color.set(activeEra.palette[2]);
    dustMaterial.size = early ? 0.11 : 0.06;
    dustMaterial.opacity = early ? 0.72 : 0.35;
    coreMaterial.color.set(early ? activeEra.palette[2] : 0xffb83e);
    coreMaterial.emissive.set(early ? activeEra.palette[2] : 0x5b1629);
    coreMaterial.emissiveIntensity = early ? 1.35 : 0.18;
    coreMaterial.roughness = early ? 0.18 : 0.62;
    coreMaterial.metalness = early ? 0.05 : 0;
    const authoredCoreTransmission =
      activeEra.realm === "prephysical" ? 0.42 : 0;
    coreMaterial.userData.authoredTransmission = authoredCoreTransmission;
    coreMaterial.transmission =
      qualityTier === "battery" ? 0 : authoredCoreTransmission;
    coreMaterial.transparent = true;
    coreMaterial.needsUpdate = true;
    innerGlowMaterial.color.set(activeEra.palette[2]);
    foamMaterials.forEach((material) => {
      material.color.set(activeEra.palette[2]);
      material.emissive.set(activeEra.palette[2]);
      material.userData.authoredTransmission = authoredCoreTransmission;
      material.transmission =
        qualityTier === "battery" ? 0 : authoredCoreTransmission;
      material.needsUpdate = true;
    });
    core.castShadow = !early;
    core.receiveShadow = !early;
    rebuildEnvironment(index);
    buildSubstrate(index);

    if (announce) {
      eraTransitionAge = 0;
      setToast(
        `ZOOMING OUT! ${activeEra.name} opens into ${WORLD_NAMES[activeWorldKind] ?? environmentNames[environmentMode]}.`,
      );
      setLastFact(
        {
          name: activeEra.name,
          fact: activeEra.lesson,
          source: activeEra.sources[0],
        },
        "era",
      );
      ping(360 + index * 18, true);
    }
  };

  const { buildVisual, applyPhysicalMaterialQuality } =
    createCollectibleVisualFactory({
      isEarly: () => early,
      getQualityTier: () => qualityTier,
      sceneryGlow,
    });
  collectibleGeometryLibrary = createCollectibleGeometryLibrary(buildVisual);
  rebuildEnvironment(activeIndex);
  buildSubstrate(activeIndex);

  const collectibleLodPool = createCollectibleLodPool(
    scene,
    camera,
    buildVisual,
    collectibleGeometryLibrary,
  );
  let silhouetteLodInstances = 0;
  let silhouetteBadgeInstances = 0;
  let silhouetteLodDrawCalls = 0;

  type VisualTemplate = {
    root: THREE.Object3D;
    visualRadius: number;
    bulkRadius: number;
    minY: number;
    drawCalls: number;
  };
  const visualTemplates = new Map<string, VisualTemplate>();
  const makeVisual = (curio: Curio, rich = true) => {
    const key = `${curio.id}:${rich ? "rich" : "simple"}`;
    let template = visualTemplates.get(key);
    let builtTemplate = false;
    if (!template) {
      const root = buildVisual(curio, rich);
      applyPhysicalMaterialQuality(root);
      root.updateMatrixWorld(true);
      const dimensions = new THREE.Vector3();
      const bounds = new THREE.Box3().setFromObject(root);
      bounds.getSize(dimensions);
      let drawCalls = 0;
      root.traverse((child) => {
        if (
          child instanceof THREE.Mesh ||
          child instanceof THREE.Points ||
          child instanceof THREE.Line ||
          child instanceof THREE.Sprite
        ) {
          drawCalls += 1;
        }
      });
      template = {
        root,
        visualRadius: Math.max(dimensions.x, dimensions.z) / 2,
        bulkRadius:
          Math.cbrt(
            Math.max(
              0.000001,
              dimensions.x * dimensions.y * dimensions.z,
            ),
          ) / 2,
        minY: bounds.min.y,
        drawCalls,
      };
      visualTemplates.set(key, template);
      builtTemplate = true;
    }
    const visual = template.root.clone(true);
    visual.userData.sharedResources = true;
    return {
      visual,
      visualRadius: template.visualRadius,
      bulkRadius: template.bulkRadius,
      minY: template.minY,
      drawCalls: template.drawCalls,
      builtTemplate,
    };
  };

  const collectibleMarkers = createCollectibleMarkerFactory();
  const makeMarker = collectibleMarkers.make;

  let pickups: Pickup[] = [];
  const historyEnabled = labEra === null;
  const attachments: THREE.Object3D[] = [];
  const mashProxySolidMaterial = new THREE.MeshToonMaterial({
    color: "#ffffff",
    vertexColors: true,
  });
  const mashProxyEffectMaterial = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    vertexColors: true,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mashProxySolidMesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    mashProxySolidMaterial,
  );
  const mashProxyEffectMesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    mashProxyEffectMaterial,
  );
  [mashProxySolidMesh, mashProxyEffectMesh].forEach((mesh, index) => {
    mesh.name = `mash-lod:${index === 0 ? "solid" : "effect"}-batch`;
    mesh.userData.mashProxy = true;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mashGroup.add(mesh);
  });
  const mashProxyDummy = new THREE.Object3D();
  const mashProxyRecords: {
    record: MashRecordV4;
    color: string;
  }[] = [];
  const visibleMashPieceCount = () =>
    Math.min(
      MAX_VISIBLE_MASH_PIECES,
      attachments.length + mashProxyRecords.length,
    );
  const coreShareFor = (pieceCount: number) =>
    early
      ? Math.max(0.18, 0.82 - pieceCount * 0.05)
      : Math.max(0.32, 0.78 - pieceCount * 0.009);
  const visibleCoreRadiusFor = (radius: number, pieceCount = visibleMashPieceCount()) =>
    radius * coreShareFor(pieceCount);
  const attachmentSupportCache = new Map<string, number>();
  const supportRadiusForCurio = (curio: Curio) => {
    const cached = attachmentSupportCache.get(curio.id);
    if (cached !== undefined) return cached;
    const geometries = collectibleGeometryLibrary!.geometryFor(curio, false);
    let support = 0.01;
    // Halos, clouds, wires, and other transparent accents are visual effects,
    // not matter. They must not enlarge the rolling collision envelope or
    // force the recognizable solid model to be shrunk.
    const physicalGeometry = geometries.solid ?? geometries.effect;
    physicalGeometry?.computeBoundingSphere();
    const bounds = physicalGeometry?.boundingSphere;
    if (bounds) support = Math.max(support, bounds.center.length() + bounds.radius);
    attachmentSupportCache.set(curio.id, support);
    return support;
  };
  const makeMashAttachment = (curio: Curio) => {
    const group = new THREE.Group();
    group.name = `mash:authored:${curio.id}`;
    group.userData.sharedResources = true;
    const geometries = collectibleGeometryLibrary!.geometryFor(
      curio,
      qualityTier === "high",
    );
    let drawCalls = 0;
    if (geometries.solid) {
      const solid = new THREE.Mesh(geometries.solid, mashProxySolidMaterial);
      solid.userData.sharedCollectibleGeometry = true;
      solid.castShadow = profileSettings.shadows;
      solid.receiveShadow = profileSettings.shadows;
      group.add(solid);
      drawCalls += 1;
    }
    if (geometries.effect) {
      const effect = new THREE.Mesh(geometries.effect, mashProxyEffectMaterial);
      effect.userData.sharedCollectibleGeometry = true;
      group.add(effect);
      drawCalls += 1;
    }
    group.userData.mashSupportRadius = supportRadiusForCurio(curio);
    group.userData.mashDrawCalls = Math.max(1, drawCalls);
    return group;
  };
  let mashProxyIncludesRich = false;
  const richMashLimit = () =>
    qualityTier === "high" ? 8 : qualityTier === "balanced" ? 6 : 4;
  const richMashDrawCallLimit = () =>
    qualityTier === "high" ? 32 : qualityTier === "balanced" ? 18 : 12;
  const attachmentDrawCalls = (visual: THREE.Object3D) =>
    Math.max(1, Number(visual.userData.mashDrawCalls ?? 1));
  const richMashDrawCalls = () =>
    attachments.reduce(
      (total, visual) => total + attachmentDrawCalls(visual),
      0,
    );
  let mashProxyPieceCount = 0;
  let visibleMashProxyFamilyCount = 0;
  const refreshMashProxy = () => {
    const visibleProxyRecords = [
      ...mashProxyRecords,
      ...(mashProxyIncludesRich
        ? attachments.flatMap((visual) => {
            const record = visual.userData.mashRecord as
              | MashRecordV4
              | undefined;
            return record
              ? [
                  {
                    record,
                    color: String(
                      visual.userData.mashColor ?? activeEra.palette[2],
                    ),
                  },
                ]
              : [];
          })
        : []),
    ].slice(-MAX_VISIBLE_MASH_PIECES);
    const activeSpeciesIds = new Set<string>();
    const transformedSolidParts: THREE.BufferGeometry[] = [];
    const transformedEffectParts: THREE.BufferGeometry[] = [];
    visibleProxyRecords.forEach(({ record }) => {
      const sourceEra = ERAS.find((era) => era.id === record.eraId);
      const curio = sourceEra?.curios.find(
        (candidate) => candidate.id === record.curioId,
      );
      if (!curio) return;
      activeSpeciesIds.add(curio.id);
      mashProxyDummy.position.set(...record.position);
      mashProxyDummy.rotation.set(...record.rotation);
      const authoredScale = Math.max(...record.scale.map(Math.abs));
      mashProxyDummy.scale.setScalar(mashProxyScale(authoredScale));
      mashProxyDummy.updateMatrix();
      const geometries = collectibleGeometryLibrary!.geometryFor(curio, false);
      if (geometries.solid) {
        transformedSolidParts.push(
          geometries.solid.clone().applyMatrix4(mashProxyDummy.matrix),
        );
      }
      if (geometries.effect) {
        transformedEffectParts.push(
          geometries.effect.clone().applyMatrix4(mashProxyDummy.matrix),
        );
      }
    });
    const mergeProxyParts = (parts: THREE.BufferGeometry[]) => {
      if (parts.length === 0) return new THREE.BufferGeometry();
      const merged = mergeGeometries(parts, false);
      if (!merged) {
        parts.forEach((geometry) => geometry.dispose());
        throw new TypeError("Visible mash silhouettes could not be batched");
      }
      merged.computeBoundingSphere();
      return merged;
    };
    const nextSolidGeometry = mergeProxyParts(transformedSolidParts);
    const nextEffectGeometry = mergeProxyParts(transformedEffectParts);
    transformedSolidParts.forEach((geometry) => geometry.dispose());
    transformedEffectParts.forEach((geometry) => geometry.dispose());
    mashProxySolidMesh.geometry.dispose();
    mashProxyEffectMesh.geometry.dispose();
    mashProxySolidMesh.geometry = nextSolidGeometry;
    mashProxyEffectMesh.geometry = nextEffectGeometry;
    mashProxyPieceCount = visibleProxyRecords.length;
    visibleMashProxyFamilyCount = activeSpeciesIds.size;
    mashProxySolidMesh.visible = transformedSolidParts.length > 0;
    mashProxyEffectMesh.visible = transformedEffectParts.length > 0;
    baseSceneDrawCallsDirty = true;
  };
  const setMashProxyLod = (_compact: boolean) => {
    // Collected objects must never blink between their authored form and the
    // combined proxy as the camera crosses a projected-size threshold. Older
    // pieces are already batched when the fixed authored budget is exceeded.
    if (!mashProxyIncludesRich && attachments.every((visual) => visual.visible)) {
      return;
    }
    mashProxyIncludesRich = false;
    attachments.forEach((visual) => {
      visual.visible = true;
    });
    refreshMashProxy();
  };
  const trimMashProxyRecords = () => {
    const proxyLimit = Math.max(
      0,
      MAX_VISIBLE_MASH_PIECES - attachments.length,
    );
    while (mashProxyRecords.length > proxyLimit) mashProxyRecords.shift();
  };
  const addMashProxy = (
    record: MashRecordV4,
    color: string,
    refresh = true,
  ) => {
    mashProxyRecords.push({ record, color });
    trimMashProxyRecords();
    if (refresh) refreshMashProxy();
  };
  const popBurstGeometry = new THREE.TorusGeometry(1, 0.1, 6, 28);
  const popBurstMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  const popBurstMesh = new THREE.InstancedMesh(
    popBurstGeometry,
    popBurstMaterial,
    MAX_POP_BURSTS,
  );
  popBurstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  popBurstMesh.count = 0;
  popBurstMesh.visible = false;
  popBurstMesh.frustumCulled = false;
  scene.add(popBurstMesh);
  const popBurstDummy = new THREE.Object3D();
  const popBursts: {
    position: THREE.Vector3;
    color: THREE.Color;
    radius: number;
    born: number;
  }[] = [];
  const retiredPopBursts: (typeof popBursts)[number][] = [];
  const activatePopBurst = (
    position: THREE.Vector3,
    visualRadius: number,
    color: THREE.ColorRepresentation,
    born: number,
  ) => {
    const burst =
      retiredPopBursts.pop() ??
      (popBursts.length >= MAX_POP_BURSTS
        ? popBursts.shift()
        : undefined) ?? {
        position: new THREE.Vector3(),
        color: new THREE.Color(),
        radius: 1,
        born,
      };
    burst.position.copy(position);
    burst.color.set(color);
    burst.radius = Math.max(0.32, visualRadius * 0.72);
    burst.born = born;
    popBursts.push(burst);
    popBurstMesh.count = popBursts.length;
    popBurstMesh.visible = true;
    baseSceneDrawCallsDirty = true;
    return popBursts.length;
  };
  let spawnClock = 0;

  const makeFieldLike = (visual: THREE.Object3D) => {
    visual.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = Array.isArray(child.material)
          ? child.material.map((material) => material.clone())
          : child.material.clone();
        child.userData.ownsMaterial = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          material.transparent = true;
          material.opacity = Math.min(material.opacity, 0.68);
          material.depthWrite = false;
        });
      }
    });
  };

  const disposeVisual = (visual: THREE.Object3D) => {
    if (visual.userData.sharedResources) {
      visual.traverse((child) => {
        if (child instanceof THREE.Sprite) {
          child.material.dispose();
        } else if (child instanceof THREE.Mesh && child.userData.ownsMaterial) {
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];
          materials.forEach((material) => material.dispose());
        }
      });
      return;
    }
    visual.traverse((child) => {
      if (
        child instanceof THREE.Mesh ||
        child instanceof THREE.Points ||
        child instanceof THREE.Line
      ) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((material) => material.dispose());
      } else if (child instanceof THREE.Sprite) {
        child.material.dispose();
      }
    });
  };
  const deferredVisualDisposals: THREE.Object3D[] = [];
  const drainDeferredVisualDisposals = (limit: number) => {
    const count = Math.min(
      Math.max(0, Math.floor(limit)),
      deferredVisualDisposals.length,
    );
    for (let index = 0; index < count; index += 1) {
      const visual = deferredVisualDisposals.shift();
      if (visual) disposeVisual(visual);
    }
  };

  const retainedMashRecords = mashHistoryRef.current.filter((record) => {
    const sourceEraIndex = ERAS.findIndex((era) => era.id === record.eraId);
    return sourceEraIndex >= 0 && sourceEraIndex <= activeIndex;
  });
  const visibleMashRecords = retainedMashRecords.slice(
    -MAX_VISIBLE_MASH_PIECES,
  );
  if (historyEnabled) {
    mashHistoryRef.current = retainedMashRecords.slice(-MASH_HISTORY_LIMIT);
  }
  const residentRichRecords = visibleMashRecords.filter((record) => {
    const sourceEraIndex = ERAS.findIndex((era) => era.id === record.eraId);
    return sourceEraIndex >= Math.max(0, activeIndex - 2);
  });
  const restoredRichRecords = new Set(
    residentRichRecords.slice(-richMashLimit()),
  );
  visibleMashRecords.forEach((record, recordIndex) => {
    const sourceEraIndex = ERAS.findIndex((era) => era.id === record.eraId);
    const sourceEra = ERAS[sourceEraIndex];
    const curio = sourceEra?.curios.find(
      (candidate) => candidate.id === record.curioId,
    );
    if (!curio || sourceEraIndex < 0) return;
    const sourceRepresentation = worldSpecForEra(sourceEra.name).representation;
    if (
      !record.mergedInside &&
      sourceRepresentation !== "diagrammatic-micro" &&
      sourceRepresentation !== "speculative"
    ) {
      let authoredScale = Math.max(...record.scale.map(Math.abs));
      const visibleCoreRadius = visibleCoreRadiusFor(
        game.radius,
        visibleMashRecords.length,
      );
      const scaleFit = attachmentSupportScaleFit(
        supportRadiusForCurio(curio) * authoredScale,
        visibleCoreRadius,
      );
      if (scaleFit < 1) {
        record.scale = record.scale.map((value) => value * scaleFit) as [
          number,
          number,
          number,
        ];
        authoredScale *= scaleFit;
      }
      const support = supportRadiusForCurio(curio) * authoredScale;
      const targetDistance = targetAttachmentCenterDistance(
        visibleCoreRadius,
        support,
      );
      const restoredDistance = Math.hypot(...record.position);
      if (restoredDistance < targetDistance) {
        const direction = contactLocalSurfaceDirection(
          {
            x: record.position[0],
            y: record.position[1],
            z: record.position[2],
          },
          { x: 0, y: 0, z: 0, w: 1 },
          collectibleIdentityFor(curio.id, curio.shape).seed + recordIndex,
        );
        record.position = [
          direction.x * targetDistance,
          direction.y * targetDistance,
          direction.z * targetDistance,
        ];
      }
    }
    if (!restoredRichRecords.has(record)) {
      addMashProxy(record, curio.color, false);
      return;
    }
    const restoredPosition = new THREE.Vector3(...record.position);
    const legacyInside =
      record.mergedInside && restoredPosition.length() < game.radius * 0.58;
    if (legacyInside) {
      if (restoredPosition.lengthSq() < 0.001) {
        restoredPosition.set(
          pseudo(recordIndex + 1) - 0.5,
          pseudo(recordIndex + 7) - 0.28,
          pseudo(recordIndex + 13) - 0.5,
        );
      }
      restoredPosition.normalize().multiplyScalar(game.radius * 0.74);
      record.position = restoredPosition.toArray() as [number, number, number];
      record.scale = record.scale.map((value) => value * 2.05) as [
        number,
        number,
        number,
      ];
    }
    const visual = makeMashAttachment(curio);
    visual.userData.sourceEra = sourceEraIndex;
    visual.position.copy(restoredPosition);
    visual.rotation.set(...record.rotation);
    visual.scale.set(...record.scale);
    visual.userData.mashRecord = record;
    visual.userData.mashColor = curio.color;
    mashGroup.add(visual);
    attachments.push(visual);
  });
  const stickingPieces: {
    visual: THREE.Object3D;
    startPosition: THREE.Vector3;
    targetPosition: THREE.Vector3;
    targetScale: THREE.Vector3;
    startedAt: number;
  }[] = [];
  const relocateMashForCoreGrowth = (
    previousCoreRadius: number,
    nextCoreRadius: number,
  ) => {
    if (nextCoreRadius <= previousCoreRadius) return;
    const relocateVector = (vector: THREE.Vector3, seed: number) => {
      const moved = relocateAttachmentForCoreGrowth(
        vector,
        previousCoreRadius,
        nextCoreRadius,
        seed,
      );
      vector.set(moved.x, moved.y, moved.z);
    };
    attachments.forEach((visual, index) => {
      relocateVector(visual.position, index + 1);
    });
    stickingPieces.forEach((piece, index) => {
      relocateVector(piece.startPosition, index + 101);
      relocateVector(piece.targetPosition, index + 201);
    });
    const relocatedRecords = new Set<MashRecordV4>();
    const relocateRecord = (record: MashRecordV4 | undefined, seed: number) => {
      if (!record || record.mergedInside || relocatedRecords.has(record)) return;
      const moved = relocateAttachmentForCoreGrowth(
        { x: record.position[0], y: record.position[1], z: record.position[2] },
        previousCoreRadius,
        nextCoreRadius,
        seed,
      );
      record.position = [moved.x, moved.y, moved.z];
      relocatedRecords.add(record);
    };
    attachments.forEach((visual, index) => {
      relocateRecord(
        visual.userData.mashRecord as MashRecordV4 | undefined,
        index + 301,
      );
    });
    mashProxyRecords.forEach(({ record }, index) =>
      relocateRecord(record, index + 401),
    );
    mashHistoryRef.current.forEach((record, index) =>
      relocateRecord(record, index + 501),
    );
  };

  const removePickup = (
    pickup: Pickup,
    preserveVisual = false,
    deferDisposal = false,
  ) => {
    scene.remove(pickup.root);
    if (!preserveVisual) {
      if (deferDisposal) deferredVisualDisposals.push(pickup.visual);
      else disposeVisual(pickup.visual);
    }
  };

  const retireVisibleMash = () => {
    attachments.forEach((attachment) => {
      mashGroup.remove(attachment);
      disposeVisual(attachment);
    });
    attachments.length = 0;
    mashProxyRecords.length = 0;
    refreshMashProxy();
    stickingPieces.length = 0;
    if (historyEnabled) mashHistoryRef.current = [];
  };

  const collapseRichMashToBudget = () => {
    let changed = false;
    while (
      attachments.length > 1 &&
      (attachments.length > richMashLimit() ||
        richMashDrawCalls() > richMashDrawCallLimit())
    ) {
      const oldestIndex = attachments.findIndex(
        (visual) =>
          !stickingPieces.some((piece) => piece.visual === visual),
      );
      // A freshly collected object gets 280 ms to visibly travel from the
      // contact point onto the roll. Temporarily exceeding the rich budget is
      // preferable to teleporting that active piece into the merged batch.
      if (oldestIndex < 0) break;
      const [oldest] = attachments.splice(oldestIndex, 1);
      if (!oldest) break;
      const record = oldest.userData.mashRecord as MashRecordV4 | undefined;
      if (record) {
        addMashProxy(
          record,
          String(oldest.userData.mashColor ?? activeEra.palette[2]),
          false,
        );
      }
      mashGroup.remove(oldest);
      disposeVisual(oldest);
      changed = true;
    }
    const proxyCountBeforeTrim = mashProxyRecords.length;
    trimMashProxyRecords();
    changed ||= mashProxyRecords.length !== proxyCountBeforeTrim;
    if (changed) refreshMashProxy();
    return changed;
  };
  trimMashProxyRecords();
  if (!collapseRichMashToBudget()) refreshMashProxy();
  const collapseDistantMash = (nextIndex: number) => {
    let collapsed = false;
    for (let index = attachments.length - 1; index >= 0; index -= 1) {
      const visual = attachments[index];
      const sourceEra = Number(visual.userData.sourceEra ?? nextIndex);
      if (sourceEra >= nextIndex - 2) continue;
      const record = visual.userData.mashRecord as MashRecordV4 | undefined;
      attachments.splice(index, 1);
      if (record) {
        addMashProxy(
          record,
          String(visual.userData.mashColor ?? activeEra.palette[2]),
          false,
        );
      }
      const stickingIndex = stickingPieces.findIndex(
        (piece) => piece.visual === visual,
      );
      if (stickingIndex >= 0) stickingPieces.splice(stickingIndex, 1);
      mashGroup.remove(visual);
      disposeVisual(visual);
      collapsed = true;
    }
    if (collapsed) refreshMashProxy();
  };
  const rebaseMash = (scale: number) => {
    const rebasedRecords = new Set<MashRecordV4>();
    const rebaseRecord = (record: MashRecordV4 | undefined) => {
      if (!record || rebasedRecords.has(record)) return;
      record.position = record.position.map((value) => value * scale) as [
        number,
        number,
        number,
      ];
      record.scale = record.scale.map((value) => value * scale) as [
        number,
        number,
        number,
      ];
      rebasedRecords.add(record);
    };
    attachments.forEach((visual) => {
      visual.position.multiplyScalar(scale);
      visual.scale.multiplyScalar(scale);
      rebaseRecord(visual.userData.mashRecord as MashRecordV4 | undefined);
    });
    stickingPieces.forEach((piece) => {
      piece.startPosition.multiplyScalar(scale);
      piece.targetPosition.multiplyScalar(scale);
      piece.targetScale.multiplyScalar(scale);
    });
    mashProxyRecords.forEach(({ record }) => rebaseRecord(record));
    mashHistoryRef.current.forEach((record) => rebaseRecord(record));
    refreshMashProxy();
  };

  const pickupSpawnProjection = new THREE.Vector3();
  const spawnPityByEra = new Map<number, SpawnPityState>();
  const pickupSpawnPointVisible = (x: number, y: number, z: number) => {
    pickupSpawnProjection.set(x, y, z).project(camera);
    return (
      pickupSpawnProjection.z >= -1 &&
      pickupSpawnProjection.z <= 1 &&
      Math.abs(pickupSpawnProjection.x) <= 1.15 &&
      Math.abs(pickupSpawnProjection.y) <= 1.15
    );
  };
  const spawnPickup = (
    seed: number,
    sequence: number,
    bornAt: number,
    phase: PickupSpawnPhase,
    authoredAnchor: LiteralPropAnchor | null = null,
  ) => {
    const populationPlan = pickupPopulationPlan(
      width,
      coarsePointer,
      activeIndex,
      ERAS.length,
    );
    const anchoredSourceEra = authoredAnchor
      ? ERAS.findIndex((era) =>
          era.curios.some((curio) => curio.id === authoredAnchor.curioId),
        )
      : -1;
    const sourceEra = authoredAnchor
      ? anchoredSourceEra
      : pickupSourceEraForSpawn({
          sequence,
          activeEra: activeIndex,
          eraCount: ERAS.length,
          activeBlockers: pickups.filter(
            (pickup) =>
              pickup.sourceEra > activeIndex &&
              pickup.retireStartedAt === null,
          ).length,
          plan: populationPlan,
        });
    if (sourceEra < 0) return { spawned: false, builtTemplate: false };
    const levelDelta = sourceEra - activeIndex;
    const source = ERAS[sourceEra];
    const collectedCurioIds = collectionRef.current
      .filter((entry) => entry.eraId === source.id && entry.count > 0)
      .map((entry) => entry.curioId);
    const activeCurioIds = pickups
      .filter(
        (pickup) =>
          pickup.sourceEra === sourceEra &&
          pickup.curio.spawnMode === "singleton",
      )
      .map((pickup) => pickup.curio.id);
    const curioSelection = authoredAnchor
      ? null
      : selectCurioForSpawn({
          curios: source.curios,
          seed: seed + 67,
          sequence,
          ...(levelDelta <= 0
            ? { pity: spawnPityByEra.get(sourceEra) }
            : {}),
          collectedCurioIds,
          activeCurioIds,
          repeatablesOnly: levelDelta > 0,
        });
    const curio = authoredAnchor
      ? source.curios.find((candidate) => candidate.id === authoredAnchor.curioId)
      : curioSelection?.curio;
    if (!curio) return { spawned: false, builtTemplate: false };
    const identity = collectibleIdentityFor(curio.id, curio.shape);
    let big = levelDelta > 0;
    const sizeTicket =
      curio.spawnMode === "singleton" ? 0.5 : pseudo(seed + 53);
    let size = Math.max(
      0.11,
      0.18 + sizeTicket * game.radius * 0.52,
    ) * curio.relativeSize;
    const root = new THREE.Group();
    const {
      visual,
      visualRadius: unitVisualRadius,
      bulkRadius: unitBulkRadius,
      minY: unitMinY,
      drawCalls,
      builtTemplate,
    } = makeVisual(curio, sourceEra >= activeIndex);
    if (authoredAnchor) {
      const semanticScale = 2 ** (sourceEra - activeIndex);
      const targetFootprint = THREE.MathUtils.clamp(
        authoredAnchor.footprintRadius * semanticScale,
        0.08,
        14,
      );
      size = targetFootprint / Math.max(0.01, unitVisualRadius);
    }
    visual.userData.sourceEra = sourceEra;
    visual.scale.setScalar(size);
    let visualRadius = unitVisualRadius * size;
    let bulkRadius = unitBulkRadius * size;
    if (!authoredAnchor && levelDelta <= 0 && visualRadius > game.radius * 0.82) {
      const targetRadius = game.radius * (0.42 + pseudo(seed + 139) * 0.34);
      const fit = targetRadius / visualRadius;
      size *= fit;
      visualRadius *= fit;
      bulkRadius *= fit;
      visual.scale.multiplyScalar(fit);
    } else if (!authoredAnchor && levelDelta > 0) {
      const targetRadius = nextLayerObstacleRadius(
        CORE_RADIUS_MAX * MAX_ROLL_ENVELOPE_FACTOR,
      );
      const enlarge = Math.max(
        targetRadius / Math.max(0.01, visualRadius),
        targetRadius / Math.max(0.01, bulkRadius),
      );
      size *= enlarge;
      visualRadius *= enlarge;
      bulkRadius *= enlarge;
      visual.scale.multiplyScalar(enlarge);
    }
    big = visualRadius > game.radius * 1.02;
    visual.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });
    const sourceWorld = worldSpecForEra(source.name);
    const grounded =
      activeLiteralStage !== null ||
      sourceWorld.representation === "literal-object-place" ||
      authoredAnchor !== null;
    const marker =
      sourceEra >= activeIndex &&
      (sourceWorld.representation === "diagrammatic-micro" ||
        sourceWorld.representation === "speculative")
        ? makeMarker(curio.symbol)
        : null;
    if (marker) visual.add(marker);
    root.add(visual);
    let spawnX = game.x;
    let spawnZ = game.z;
    let bestClearance = authoredAnchor
      ? Number.POSITIVE_INFINITY
      : Number.NEGATIVE_INFINITY;
    let bestOffscreen = false;
    const attempts = big ? 36 : 18;
    // Oversized next-layer previews must never materialize in the settled
    // chase-camera lane. On finite stages the only roomy pocket behind the
    // player can otherwise become the deterministic "best" candidate, then
    // the camera eases straight through a house-sized silhouette as the roll
    // grows. Treat every blocker like buffered scenery, including the initial
    // population, and reserve the full future camera arm below.
    const outerRing = phase === "refill" || big;
    const rollingEnvelope = CORE_RADIUS_MAX * MAX_ROLL_ENVELOPE_FACTOR;
    const settledCameraArm =
      CORE_RADIUS_MAX *
      (isCompactView(width) ? 11.8 : 10.6) *
      Math.min(1.25, game.lens);
    const chunkSize = worldChunkSize(activeWorldKind);
    if (authoredAnchor && activeLiteralStage) {
      const anchoredPosition = literalWorldPosition(
        activeLiteralStage,
        authoredAnchor.position,
      );
      spawnX = anchoredPosition[0];
      spawnZ = anchoredPosition[2];
    }
    const sceneryClearanceAt = (x: number, z: number) => {
      if (!environmentGroup.visible) return Number.POSITIVE_INFINITY;
      const requiredRadius =
        visualRadius + (big ? rollingEnvelope : 0) + 0.45;
      const playableClearance = literalPlayableClearanceAt(
        x,
        z,
        requiredRadius,
      );
      if (playableClearance < 0) return playableClearance;
      const topology = worldSpecForEra(activeEra.name).topology;
      const localX = worldUsesPeriodicTiles(activeEra.name)
        ? localChunkCoordinate(x, chunkSize)
        : topology === "finite"
          ? x
          : x - game.x;
      const localZ = worldUsesPeriodicTiles(activeEra.name)
        ? localChunkCoordinate(z, chunkSize)
        : topology === "finite"
          ? z
          : z - game.z;
      const sceneryClearance = sceneryColliders.reduce(
        (minimum, collider) =>
          Math.min(
            minimum,
            circleAabbClearance(
              localX,
              localZ,
              requiredRadius,
              collider.x,
              collider.z,
              collider.halfWidth,
              collider.halfDepth,
            ),
          ),
        Number.POSITIVE_INFINITY,
      );
      return Math.min(playableClearance, sceneryClearance);
    };
    for (
      let attempt = 0;
      !authoredAnchor && attempt < attempts;
      attempt += 1
    ) {
      const placement = pickupSpawnPlacement({
        seed,
        sequence,
        attempt,
        phase,
        oversized: big,
        playerX: game.x,
        playerZ: game.z,
        velocityX: game.vx,
        velocityZ: game.vz,
        plan: populationPlan,
      });
      const candidateRadius = big
        ? Math.max(
            placement.radius,
            game.radius + visualRadius + 3.2,
          )
        : placement.radius;
      const candidateAngle = placement.angle;
      let candidateX = game.x + Math.cos(candidateAngle) * candidateRadius;
      let candidateZ = game.z + Math.sin(candidateAngle) * candidateRadius;
      if (literalPlayableBounds) {
        const finiteMargin =
          visualRadius + (big ? rollingEnvelope : 0) + 0.55;
        const minX = literalPlayableBounds.minX + finiteMargin;
        const maxX = literalPlayableBounds.maxX - finiteMargin;
        const minZ = literalPlayableBounds.minZ + finiteMargin;
        const maxZ = literalPlayableBounds.maxZ - finiteMargin;
        if (minX > maxX || minZ > maxZ) continue;
        candidateX = THREE.MathUtils.lerp(
          minX,
          maxX,
          pseudo(seed + sequence * 0.37 + attempt * 17.31),
        );
        candidateZ = THREE.MathUtils.lerp(
          minZ,
          maxZ,
          pseudo(seed + sequence * 0.73 + attempt * 29.17),
        );
        if (!outerRing && activeLiteralStage === null) {
          candidateX = THREE.MathUtils.lerp(game.x, candidateX, 0.55);
          candidateZ = THREE.MathUtils.lerp(game.z, candidateZ, 0.55);
        }
      }
      const pickupClearance = big
        ? pickups.reduce((minimum, other) => {
            if (!other.big) return minimum;
            const separation = Math.hypot(
              other.root.position.x - candidateX,
              other.root.position.z - candidateZ,
            );
            const required = obstacleCenterGap(
              visualRadius,
              other.visualRadius,
              rollingEnvelope,
            );
            return Math.min(minimum, separation - required);
          }, Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
      const playerSpawnEnvelope =
        activeLiteralStage !== null && !big
          ? Math.max(game.radius, effectiveRollRadius)
          : rollingEnvelope;
      const playerClearance =
        Math.hypot(candidateX - game.x, candidateZ - game.z) -
        (playerSpawnEnvelope + visualRadius + 0.75);
      const localX = worldUsesPeriodicTiles(activeEra.name)
        ? localChunkCoordinate(candidateX, chunkSize)
        : candidateX;
      const localZ = worldUsesPeriodicTiles(activeEra.name)
        ? localChunkCoordinate(candidateZ, chunkSize)
        : candidateZ;
      const corridorClearance =
        big &&
        ((worldUsesPeriodicTiles(activeEra.name) &&
          (Math.abs(localX) < 16 || Math.abs(localZ) < 16)) ||
          (activeLiteralStage !== null &&
            Math.abs(candidateX - literalSceneOriginX) <
              LITERAL_ROUTE_HALF_WIDTH + visualRadius &&
            candidateZ <=
              literalSceneOriginZ +
                activeLiteralStage.nearZ +
                LITERAL_ROUTE_Z_OFFSET &&
            candidateZ >=
              literalSceneOriginZ +
                activeLiteralStage.farZ +
                LITERAL_ROUTE_Z_OFFSET))
          ? -1
          : Number.POSITIVE_INFINITY;
      const cameraLaneProgress = THREE.MathUtils.clamp(
        (candidateZ - game.z) / Math.max(0.001, settledCameraArm),
        0,
        1,
      );
      const cameraLaneZ = game.z + settledCameraArm * cameraLaneProgress;
      const cameraLaneClearance = big
        ? Math.hypot(candidateX - game.x, candidateZ - cameraLaneZ) -
          (visualRadius + 0.8)
        : Number.POSITIVE_INFINITY;
      const clearance = Math.min(
        playerClearance,
        pickupClearance,
        sceneryClearanceAt(candidateX, candidateZ),
        corridorClearance,
        cameraLaneClearance,
      );
      const candidateOffscreen =
        outerRing &&
        !pickupSpawnPointVisible(
          candidateX,
          Math.max(0.22, size * 0.48),
          candidateZ,
        );
      if (
        (candidateOffscreen && clearance >= 0 && !bestOffscreen) ||
        (candidateOffscreen === bestOffscreen && clearance > bestClearance)
      ) {
        bestClearance = clearance;
        bestOffscreen = candidateOffscreen;
        spawnX = candidateX;
        spawnZ = candidateZ;
      }
      if (clearance >= 0 && (!outerRing || candidateOffscreen)) break;
    }
    if (bestClearance < 0) {
      disposeVisual(visual);
      return { spawned: false, builtTemplate };
    }
    const literalSupportTop =
      activeLiteralStage
        ? literalSupportTopForPoint(
            activeLiteralStage.id,
            spawnX - literalSceneOriginX,
            spawnZ - literalSceneOriginZ - LITERAL_ROUTE_Z_OFFSET,
          )
        : null;
    const groundedSurfaceY =
      literalSupportTop ?? (activeLiteralStage ? literalPlayerSurfaceY : 0.01);
    const spawnY = grounded
      ? Math.max(
          0.015,
          groundedSurfaceY - unitMinY * size + 0.008,
        )
      : Math.max(0.22, size * 0.48);
    root.position.set(spawnX, spawnY, spawnZ);
    const baseY = root.position.y;
    const wiggle = pseudo(seed + 181) * Math.PI * 2;
    root.rotation.y = authoredAnchor
      ? authoredAnchor.rotation[1]
      : pseudo(seed + 91) * Math.PI * 2;
    root.scale.setScalar(0);
    scene.add(root);
    pickups.push({
      root,
      visual,
      marker,
      curio,
      sourceEra,
      size,
      visualRadius,
      bulkRadius,
      big,
      baseY,
      grounded,
      wiggle,
      identity,
      drawCalls: drawCalls + (marker ? 1 : 0),
      bornAt,
      retireStartedAt: null,
      wantsRichDetail: false,
      richAdmitted: false,
      handoffX: null,
      handoffY: null,
      handoffZ: null,
      renderedScale: new THREE.Vector3(),
      renderedScaleY: 0,
      authoredAnchorId: authoredAnchor?.id ?? null,
    });
    if (levelDelta <= 0 && curioSelection) {
      spawnPityByEra.set(sourceEra, curioSelection.pity);
    }
    game.id += 1;
    return { spawned: true, builtTemplate };
  };

  const activePickupBudget = () =>
    pickupPopulationPlan(
      width,
      coarsePointer,
      activeIndex,
      ERAS.length,
    ).total;
  const activeScalePickupCount = () =>
    pickups.filter(
      (pickup) =>
        pickup.sourceEra >= activeIndex && pickup.retireStartedAt === null,
    ).length;

  let pickupSpawnQueue = createSpawnQueue(
    (game.id + Math.imul(activeIndex + 1, 0x9e3779b9)) >>> 0,
  );
  let initialQueuedPickups = 0;
  let populationQueued = false;
  let needsInnerSpawnRing = true;
  let totalSpawned = 0;
  let spawnedLastFrame = 0;
  let maxSpawnedPerFrame = 0;
  let pickupRetireClock = 0;
  const collectedAuthoredAnchorIds = collectedAuthoredAnchorIdsRef.current;
  let pendingLiteralAnchors: LiteralPropAnchor[] = [];
  let literalAnchorStageId = "";
  let literalAnchorReconcileKey = "";

  const reconcileLiteralPropAnchors = () => {
    const stage = activeLiteralStage;
    const reconcileKey = `${stage?.id ?? "none"}:${activeIndex}:${collectedAuthoredAnchorIds.size}`;
    if (literalAnchorReconcileKey === reconcileKey) return;
    literalAnchorReconcileKey = reconcileKey;
    const desired = stage
      ? literalPropsForStage(stage.id).filter((anchor) => {
          const sourceIndex = ERAS.findIndex((era) =>
            era.curios.some((curio) => curio.id === anchor.curioId),
          );
          // The next layer already has procedural oversized previews. Authored
          // one-off props appear only once their own scale is active, so they
          // cannot be collected early and disappear from the intended scene.
          return sourceIndex >= 0 && sourceIndex <= activeIndex;
        })
      : [];
    const desiredIds = new Set(desired.map((anchor) => anchor.id));
    pickups = pickups.filter((pickup) => {
      if (
        pickup.authoredAnchorId === null ||
        desiredIds.has(pickup.authoredAnchorId)
      ) {
        return true;
      }
      removePickup(pickup);
      return false;
    });
    if (literalAnchorStageId !== (stage?.id ?? "")) {
      pendingLiteralAnchors = [];
      literalAnchorStageId = stage?.id ?? "";
    }
    const activeAnchorIds = new Set(
      pickups.flatMap((pickup) =>
        pickup.authoredAnchorId ? [pickup.authoredAnchorId] : [],
      ),
    );
    const queuedAnchorIds = new Set(pendingLiteralAnchors.map((anchor) => anchor.id));
    desired.forEach((anchor) => {
      if (
        !activeAnchorIds.has(anchor.id) &&
        !queuedAnchorIds.has(anchor.id) &&
        !collectedAuthoredAnchorIds.has(anchor.id)
      ) {
        pendingLiteralAnchors.push(anchor);
      }
    });
  };

  const drainLiteralAnchorQueue = (now: number) => {
    while (
      pendingLiteralAnchors.length > 0 &&
      spawnedLastFrame < MAX_PICKUP_PROMOTIONS_PER_FRAME
    ) {
      const anchor = pendingLiteralAnchors.shift();
      if (!anchor) break;
      const seed = stableWorldSeed("literal-prop", anchor.id, activeIndex);
      const result = spawnPickup(
        seed,
        seed,
        now,
        "initial",
        anchor,
      );
      if (result.spawned) {
        spawnedLastFrame += 1;
        totalSpawned += 1;
      }
    }
    maxSpawnedPerFrame = Math.max(maxSpawnedPerFrame, spawnedLastFrame);
  };

  const resetPickupQueue = () => {
    pickupSpawnQueue = createSpawnQueue(
      (game.id + Math.imul(activeIndex + 1, 0x9e3779b9)) >>> 0,
    );
    initialQueuedPickups = 0;
    populationQueued = false;
  };

  const reconcilePickupQueue = () => {
    const desiredPickupCount = activePickupBudget();
    pickupSpawnQueue.reconcile(
      activeScalePickupCount(),
      desiredPickupCount,
    );
    if (!populationQueued && pickupSpawnQueue.pending > 0) {
      initialQueuedPickups = needsInnerSpawnRing
        ? pickupSpawnQueue.pending
        : 0;
      needsInnerSpawnRing = false;
      populationQueued = true;
    }
    initialQueuedPickups = Math.min(
      initialQueuedPickups,
      pickupSpawnQueue.pending,
    );
  };
  const retireOnePeripheralPickup = (now: number) => {
    const overBudget = activeScalePickupCount() > activePickupBudget();
    let farthestIndex = -1;
    let farthestDistance = Number.NEGATIVE_INFINITY;
    pickups.forEach((pickup, index) => {
      if (
        pickup.retireStartedAt !== null ||
        pickup.authoredAnchorId !== null
      ) {
        return;
      }
      const distance = Math.hypot(
        pickup.root.position.x - game.x,
        pickup.root.position.z - game.z,
      );
      const distant = distance >= PICKUP_RETIRE_DISTANCE;
      if (!distant && (!overBudget || pickup.sourceEra < activeIndex)) return;
      if (distance > farthestDistance) {
        farthestIndex = index;
        farthestDistance = distance;
      }
    });
    if (farthestIndex >= 0) pickups[farthestIndex].retireStartedAt = now;
  };

  const drainPickupQueue = (now: number) => {
    if (
      pickupSpawnQueue.pending === 0 ||
      spawnedLastFrame >= MAX_PICKUP_PROMOTIONS_PER_FRAME
    ) {
      return;
    }
    camera.updateMatrixWorld();
    const startedAt = phaseStart();
    const { maxSpawnWorkMs } = worldPerformanceBudget(qualityTier);
    pickupSpawnQueue.drain(
      ({ seed, sequence }) => {
        const phase: PickupSpawnPhase =
          initialQueuedPickups === 0 ? "refill" : "initial";
        if (initialQueuedPickups > 0) initialQueuedPickups -= 1;
        const result = spawnPickup(seed, sequence, now, phase);
        if (result.spawned) {
          spawnedLastFrame += 1;
          totalSpawned += 1;
        }
        return !result.builtTemplate;
      },
      {
        maxPerFrame: Math.max(
          0,
          MAX_PICKUP_PROMOTIONS_PER_FRAME - spawnedLastFrame,
        ),
        budgetMs: maxSpawnWorkMs,
        now: readPerformanceClock,
      },
    );
    maxSpawnedPerFrame = Math.max(
      maxSpawnedPerFrame,
      spawnedLastFrame,
    );
    phaseEnd("spawning", startedAt);
  };

  let transitionWorldScale = 1;
  let scaleTransitionStarted = -1;
  let scaleTransitionDurationMs = 0;
  let transitionSurfaceFromY = 0;
  let transitionSurfaceToY = 0;
  let pendingLayerAdvance = false;
  const unlockedAchievementIds = new Set(
    deriveAchievements({
      catalog: ERAS,
      collection: collectionRef.current,
      cycles: game.cycles,
    })
      .filter((achievement) => achievement.unlocked)
      .map((achievement) => achievement.id),
  );

  const preparePickupHandoff = () => {
    const outgoingEra = game.era;
    const nextIndex = nextLayerAdvance(outgoingEra, ERAS.length).nextIndex;
    transitionSurfaceFromY = literalPlayerSurfaceY;
    const nextLiteralStage = literalStageForEra(ERAS[nextIndex].id);
    transitionSurfaceToY = nextLiteralStage
      ? literalStageSurfaceY(nextLiteralStage.id)
      : 0;
    pickups.forEach((pickup) => {
      if (pickup.sourceEra === outgoingEra) {
        pickup.handoffX = pickup.root.position.x;
        pickup.handoffY = pickup.baseY;
        pickup.handoffZ = pickup.root.position.z;
      } else {
        pickup.handoffX = null;
        pickup.handoffY = null;
        pickup.handoffZ = null;
      }
    });
    prepareTransitionRug(nextIndex);
  };

  const advanceLayer = (animated: boolean) => {
    const previousIndex = game.era;
    const { nextIndex, wrapped } = nextLayerAdvance(
      previousIndex,
      ERAS.length,
    );
    // Only the first arrival at the final layer announces the unlock; after a
    // wrap the lens has been open the whole time (deepLensUnlocked cycles>0).
    const unlockedDeepLens =
      nextIndex === ERAS.length - 1 &&
      previousIndex < nextIndex &&
      game.cycles === 0;

    game.era = nextIndex;
    game.progress = 0;
    game.radius = CORE_RADIUS_MIN;
    game.zooms += 1;
    if (wrapped) {
      // The Metaversal Beyond folds back into fresh quantum foam: the ball is
      // reborn, so the mash, pickups, and floating-origin drift all reset
      // rather than carrying 94 decades of scale across the seam.
      game.cycles += 1;
      unlockedAchievementIds.add("journey-cycle");
      game.x = 0;
      game.z = 0;
      game.originX = 0;
      game.originZ = 0;
      game.vx = 0;
      game.vz = 0;
      retireVisibleMash();
      collectedAuthoredAnchorIds.clear();
      literalAnchorReconcileKey = "";
      game.literalSceneOriginX = null;
      game.literalSceneOriginZ = null;
    }
    if (animated) {
      game.vx *= 0.25;
      game.vz *= 0.25;
    }
    const radiusRebase = CORE_RADIUS_MIN / CORE_RADIUS_MAX;
    rebaseMash(radiusRebase);
    collapseDistantMash(nextIndex);
    playerRoot.scale.setScalar(1);
    core.scale.multiplyScalar(radiusRebase);
    foamCluster.scale.multiplyScalar(radiusRebase);
    ballFace.position.multiplyScalar(radiusRebase);
    ballFace.scale.multiplyScalar(radiusRebase);
    effectiveRollRadius = CORE_RADIUS_MIN;
    rollRadiusClock = 0.12;
    const nextLiteralStage = literalStageForEra(ERAS[nextIndex].id);
    literalPlayerSurfaceY = nextLiteralStage
      ? literalStageSurfaceY(nextLiteralStage.id)
      : 0;
    const nextFloatHeight = literalPlayerSurfaceY + CORE_RADIUS_MIN * 0.94;
    const mobileView = isCompactView(width);
    playerRoot.position.set(game.x, nextFloatHeight, game.z);
    camera.position.set(
      game.x + game.vx * 0.24 * game.lens,
      nextFloatHeight +
        CORE_RADIUS_MIN * (mobileView ? 6.6 : 6.05) * game.lens,
      game.z + CORE_RADIUS_MIN * (mobileView ? 11.8 : 10.6) * game.lens,
    );

    transitionWorldScale = 1;
    environmentGroup.scale.setScalar(1);
    nearBackdropGroup.scale.setScalar(1);
    midBackdropGroup.scale.setScalar(1);
    farBackdropGroup.scale.setScalar(1);
    substrateGroup.scale.setScalar(1);
    ground.scale.setScalar(1);
    foundationOverlay.scale.setScalar(1);
    grid.scale.setScalar(1);
    dustField.scale.setScalar(1);

    pickups.forEach((pickup) => removePickup(pickup, false, true));
    pickups = [];
    applyEraTheme(nextIndex, false);
    clearTransitionRug();
    attachments.forEach((attachment) => {
      const sourceEra = Number(attachment.userData.sourceEra ?? previousIndex);
      attachment.traverse((child) => {
        if (child instanceof THREE.Sprite) child.visible = sourceEra >= nextIndex;
      });
    });
    needsInnerSpawnRing = true;
    resetPickupQueue();
    reconcilePickupQueue();

    faceReactionUntil = readPerformanceClock() + 1400;
    ballFaceMaterial.map = joyFaceTexture;

    if (wrapped) {
      setToast(
        game.cycles === 1
          ? `Achievement unlocked: There and Back Again. The ${ERAS[previousIndex].name} folds into fresh quantum foam; cycle ${game.cycles + 1} begins.`
          : `The ${ERAS[previousIndex].name} folds into fresh quantum foam. Cycle ${game.cycles + 1} begins — the scale of everything, again.`,
      );
      ping(880, true);
    } else {
      setToast(
        animated
          ? `${ERAS[nextIndex].name} resolves around you; ${ERAS[previousIndex].name} remains beneath it.`
          : `Scale crossed smoothly into ${ERAS[nextIndex].name}. The prior layer is now part of the world beneath you.`,
      );
      if (!animated) ping(300 + nextIndex * 12, true);
    }
    if (unlockedDeepLens) {
      setToast(
        "Known-universe journey complete! The free lens now opens from 1/256× to 256× — and the top of scale folds back into the bottom.",
      );
    }
    scaleTransitionStarted = -1;
    scaleTransitionDurationMs = 0;
  };

  const requestLayerAdvance = (forceReady = false) => {
    if (
      labEra !== null ||
      scaleTransitionStarted >= 0 ||
      pendingLayerAdvance ||
      (!forceReady && game.progress < 1)
    ) {
      return false;
    }
    const nextIndex = nextLayerAdvance(game.era, ERAS.length).nextIndex;
    const nextLiteralStage = literalStageForEra(ERAS[nextIndex].id);
    const nextSurfaceY = nextLiteralStage
      ? literalStageSurfaceY(nextLiteralStage.id)
      : 0;
    const surfaceHandoff = Math.abs(nextSurfaceY - literalPlayerSurfaceY) > 0.1;
    scaleTransitionDurationMs = Math.max(
      scaleTransitionDuration(game.mode),
      surfaceHandoff ? 850 : 0,
    );
    if (scaleTransitionDurationMs > 0) {
      preparePickupHandoff();
      scaleTransitionStarted = readPerformanceClock();
      setToast(
        "Learning jump! You grow while this whole layer settles beneath you.",
      );
      ping(350 + activeIndex * 18, true);
    } else {
      pendingLayerAdvance = true;
    }
    return true;
  };
  const playerLayerAdvance = () => requestLayerAdvance(false);
  advanceLayerRef.current = playerLayerAdvance;

  const collect = (pickup: Pickup, now: number) => {
    baseSceneDrawCallsDirty = true;
    game.picked += 1;
    game.lastPickup = now / 1000;
    if (pickup.authoredAnchorId) {
      collectedAuthoredAnchorIds.add(pickup.authoredAnchorId);
    }
    const sourceEra = ERAS[pickup.sourceEra];
    pickup.root.updateMatrixWorld(true);
    pickup.visual.updateMatrixWorld(true);
    const pickupWorldPosition = pickup.visual.getWorldPosition(
      new THREE.Vector3(),
    );
    const pickupWorldQuaternion = pickup.visual.getWorldQuaternion(
      new THREE.Quaternion(),
    );
    const playerWorldPosition = playerRoot.getWorldPosition(new THREE.Vector3());
    const rollWorldQuaternion = rollGroup.getWorldQuaternion(
      new THREE.Quaternion(),
    );
    const pickupContactDelta = pickupWorldPosition
      .clone()
      .sub(playerWorldPosition);
    // The rich and instanced LOD paths both write this authoritative authored
    // scale. A half-grown or simplified pickup must not jump size on contact.
    const pickupRenderedScale =
      pickup.renderedScale.lengthSq() > 0.000001
        ? pickup.renderedScale.clone()
        : new THREE.Vector3().setScalar(
            pickup.size * pickupLifecycleScale(pickup, now),
          );
    const firstDiscovery = !collectionRef.current.some(
      (entry) =>
        entry.eraId === sourceEra.id &&
        entry.curioId === pickup.curio.id &&
        entry.count > 0,
    );
    collectionRef.current = aggregatePickups(
      [
        {
          eraId: sourceEra.id,
          curioId: pickup.curio.id,
          pickedAt: Date.now(),
        },
      ],
      collectionRef.current,
    );
    const currentAchievements = firstDiscovery
      ? deriveAchievements({
          catalog: ERAS,
          collection: collectionRef.current,
          cycles: game.cycles,
        })
      : [];
    const newlyUnlockedAchievements = currentAchievements.filter(
      (achievement) =>
        achievement.unlocked &&
        !unlockedAchievementIds.has(achievement.id),
    );
    currentAchievements
      .filter((achievement) => achievement.unlocked)
      .forEach((achievement) =>
        unlockedAchievementIds.add(achievement.id),
      );
    setCollection([...collectionRef.current]);
    const isCurrentScale = pickup.sourceEra === activeIndex;
    const attachesToMash = isCurrentScale || pickup.authoredAnchorId !== null;
    const announcesCollection = isCurrentScale || pickup.authoredAnchorId !== null;
    const gameplayBulkFactor = GAMEPLAY_BULK_FACTORS[pickup.curio.shape];
    const previousProgress = game.progress;
    const previousVisibleCoreRadius = visibleCoreRadiusFor(game.radius);
    game.progress = progressAfterPickup(
      game.progress,
      pickup.sourceEra,
      activeIndex,
      collectionProgressGain(
        game.radius,
        pickup.bulkRadius,
        gameplayBulkFactor,
        game.mode,
      ),
    );
    if (isCurrentScale) {
      game.radius = radiusForLayerProgress(game.progress);
      relocateMashForCoreGrowth(
        previousVisibleCoreRadius,
        visibleCoreRadiusFor(game.radius),
      );
      if (previousProgress < 1 && game.progress >= 1) {
        ping(350 + activeIndex * 18, true);
      }
    }
    if (announcesCollection) {
      setLastFact(
        {
          name: pickup.curio.name,
          fact: pickup.curio.fact,
          source: pickup.curio.source ?? sourceEra.sources[0],
          symbol: pickup.curio.symbol,
          color: pickup.curio.color,
        },
        "pickup",
      );
      if (isCurrentScale && previousProgress < 1 && game.progress >= 1) {
        setPickupMilestone(
          `${activeEra.name} is ready · keep hunting here, or grow when you choose`,
        );
      }
      playPickupSound(pickup.curio, pickup.sourceEra);
      faceReactionUntil = now + 240;
      ballFaceMaterial.map = chompFaceTexture;
      ballFaceMaterial.needsUpdate = true;
      activatePopBurst(
        pickup.root.position,
        pickup.visualRadius,
        pickup.curio.color,
        now,
      );
      if (newlyUnlockedAchievements.length > 0) {
        const names = newlyUnlockedAchievements
          .map((achievement) => achievement.name)
          .join(" + ");
        const detail =
          newlyUnlockedAchievements.length === 1
            ? ` — ${newlyUnlockedAchievements[0].description}`
            : "";
        setAchievement(
          `${newlyUnlockedAchievements.length === 1 ? "Achievement" : "Achievements"} unlocked: ${names}${detail}`,
        );
        if (!(previousProgress < 1 && game.progress >= 1)) ping(620, true);
      }
    }

    if (pickup.marker) {
      pickup.visual.remove(pickup.marker);
      pickup.marker.material.dispose();
      pickup.marker = null;
    }
    if (attachesToMash) {
      const fieldLike =
        sourceEra.realm === "prephysical" || sourceEra.realm === "particle";
      const direction = contactLocalSurfaceDirection(
        pickupContactDelta,
        rollWorldQuaternion,
        pickup.identity.seed,
      );
      const attachment = makeMashAttachment(pickup.curio);
      const mashWorldQuaternion = mashGroup.getWorldQuaternion(
        new THREE.Quaternion(),
      );
      attachment.quaternion
        .copy(mashWorldQuaternion.invert())
        .multiply(pickupWorldQuaternion);
      const targetScale = pickupRenderedScale.multiplyScalar(
        fieldLike ? 1.02 : 1,
      );
      const attachmentCoreRadius = visibleCoreRadiusFor(
        game.radius,
        visibleMashPieceCount() + 1,
      );
      const unitSupportRadius = Number(
        attachment.userData.mashSupportRadius ?? 0.5,
      );
      const authoredSupportRadius =
        unitSupportRadius *
        Math.max(
          Math.abs(targetScale.x),
          Math.abs(targetScale.y),
          Math.abs(targetScale.z),
        );
      targetScale.multiplyScalar(
        attachmentSupportScaleFit(
          authoredSupportRadius,
          attachmentCoreRadius,
        ),
      );
      attachment.scale.copy(targetScale);
      const supportRadius =
        unitSupportRadius *
        Math.max(
          Math.abs(targetScale.x),
          Math.abs(targetScale.y),
          Math.abs(targetScale.z),
        );
      const targetDistance = targetAttachmentCenterDistance(
        attachmentCoreRadius,
        supportRadius,
      );
      const targetPosition = new THREE.Vector3(
        direction.x,
        direction.y,
        direction.z,
      ).multiplyScalar(targetDistance);
      mashGroup.updateMatrixWorld(true);
      const startPosition = mashGroup.worldToLocal(pickupWorldPosition.clone());
      if (
        startPosition.distanceTo(targetPosition) >
        Math.max(game.radius * 1.5, supportRadius * 2)
      ) {
        startPosition.copy(targetPosition).multiplyScalar(1.08);
      }
      attachment.position.copy(startPosition);
      attachment.scale.copy(targetScale).multiplyScalar(0.9);
      attachment.userData.sourceEra = pickup.sourceEra;
      mashGroup.add(attachment);
      attachments.push(attachment);
      stickingPieces.push({
        visual: attachment,
        startPosition: startPosition.clone(),
        targetPosition: targetPosition.clone(),
        targetScale,
        startedAt: now,
      });
      const mashRecord: MashRecordV4 = {
        eraId: sourceEra.id,
        curioId: pickup.curio.id,
        position: targetPosition.toArray() as [number, number, number],
        rotation: [
          attachment.rotation.x,
          attachment.rotation.y,
          attachment.rotation.z,
        ],
        scale: targetScale.toArray() as [number, number, number],
        mergedInside: fieldLike,
      };
      attachment.userData.mashRecord = mashRecord;
      attachment.userData.mashColor = pickup.curio.color;
      if (historyEnabled) {
        mashHistoryRef.current.push(mashRecord);
        if (mashHistoryRef.current.length > MASH_HISTORY_LIMIT) {
          mashHistoryRef.current.shift();
        }
      }
      const mashProxyChanged = collapseRichMashToBudget();
      if (!mashProxyChanged) refreshMashProxy();
      removePickup(pickup);
    } else {
      removePickup(pickup);
    }
  };

  let width = 0;
  let height = 0;
  const resize = () => {
    const box = mount.getBoundingClientRect();
    width = box.width;
    height = box.height;
    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        profileSettings.pixelRatioCap,
      ),
    );
    renderer.setSize(width, height, false);
    camera.aspect = Math.max(0.2, width / height);
    camera.fov = boundedVerticalFov(
      isCompactView(width) ? 56 : 46,
      camera.aspect,
    );
    camera.updateProjectionMatrix();
  };

  resize();
  reconcilePickupQueue();
  window.addEventListener("resize", resize);
  // iOS URL-bar collapse and the software keyboard resize the visual
  // viewport without firing a window resize.
  window.visualViewport?.addEventListener("resize", resize);

  // iOS Safari reclaims WebGL contexts from backgrounded PWAs. Preventing
  // the default on loss lets the browser restore the same context, and
  // Three.js reinitializes its GL state on the restored context.
  const onContextLost = (event: Event) => {
    event.preventDefault();
    persistSnapshot();
  };
  const onContextRestored = () => {
    resize();
    setToast("Graphics restarted. Your universe is safe.");
  };
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);
  renderer.domElement.addEventListener(
    "webglcontextrestored",
    onContextRestored,
  );

  const semanticWorldDiagnostics = () => {
    const viewScale = semanticViewScale(
      activeIndex,
      game.lens,
      ERAS.length,
    );
    return {
      semanticViewScale: viewScale,
      foundationLayers: [...substrateLayerIndices],
      foundationPresentation: substrateFoundationPlan.presentation,
      foundationNearest: substrateFoundationPlan.nearest?.id ?? null,
      foundationCompressed: substrateFoundationPlan.compressed.map(
        (layer) => layer.id,
      ),
      foundationAncestryCount: substrateFoundationPlan.ancestryCount,
      foundationKey: substrateFoundationPlan.key,
    };
  };

  const transitionFoundationHeight = (
    relativeX: number,
    relativeZ: number,
  ) =>
    transitionRugMode === "shell"
      ? foundationShellHeight(
          relativeX,
          relativeZ,
          PLANET_FOUNDATION_RADIUS,
          PLANET_FOUNDATION_CENTER_Y,
          0.08,
        )
      : 0.035;

  const handoffPickupDiagnostics = () => {
    const outgoing = pickups.filter((pickup) => pickup.handoffX !== null);
    const incoming = pickups.filter(
      (pickup) =>
        pickup.handoffX === null && pickup.sourceEra > activeIndex,
    );
    const mean = (
      values: readonly number[],
    ) =>
      values.length > 0
        ? values.reduce((total, value) => total + value, 0) / values.length
        : 0;
    const outgoingSurfaceClearances = outgoing.map(
      (pickup) =>
        pickup.root.position.y -
        transitionFoundationHeight(
          pickup.root.position.x - game.x,
          pickup.root.position.z - game.z,
        ),
    );
    return {
      transitionOutgoingPickups: outgoing.length,
      transitionIncomingPickups: incoming.length,
      transitionOutgoingMeanDistance: mean(
        outgoing.map((pickup) =>
          Math.hypot(
            pickup.root.position.x - game.x,
            pickup.root.position.z - game.z,
          ),
        ),
      ),
      transitionOutgoingMeanBaseY: mean(
        outgoing.map((pickup) => pickup.baseY),
      ),
      transitionOutgoingMeanSurfaceClearance: mean(
        outgoingSurfaceClearances,
      ),
      transitionOutgoingMeanRenderedY: mean(
        outgoing.map((pickup) => pickup.root.position.y),
      ),
      transitionOutgoingMeanAbsoluteSurfaceClearance: mean(
        outgoingSurfaceClearances.map(Math.abs),
      ),
      transitionOutgoingMaxAbsoluteSurfaceClearance:
        outgoingSurfaceClearances.reduce(
          (largest, clearance) =>
            Math.max(largest, Math.abs(clearance)),
          0,
        ),
      transitionOutgoingMinSurfaceClearance:
        outgoingSurfaceClearances.length > 0
          ? Math.min(...outgoingSurfaceClearances)
          : 0,
      transitionOutgoingMeanRenderedScaleY: mean(
        outgoing.map((pickup) => pickup.renderedScaleY),
      ),
      transitionIncomingMaxRenderedScaleY: incoming.reduce(
        (largest, pickup) => Math.max(largest, pickup.renderedScaleY),
        0,
      ),
    };
  };

  const performanceDebug = phaseRecorder
    ? {
        snapshot: () => ({
          phases: phaseRecorder.snapshot(),
          runtime: {
            era: activeIndex,
            mode: game.mode,
            picked: game.picked,
            progress: game.progress,
            readyToGrow:
              labEra === null &&
              game.progress >= 1 &&
              scaleTransitionStarted < 0 &&
              !pendingLayerAdvance,
            radius: game.radius,
            playerScale: playerRoot.scale.x,
            worldScale: transitionWorldScale,
            performanceProfile,
            adaptiveQuality: false,
            quality: qualityTier,
            profileSettings,
            worldGeneration,
            transitionActive: scaleTransitionStarted >= 0,
            backgroundDepth: {
              reducedMotion,
              environmentRate: environmentTravelRate,
              environmentScale: environmentGroup.scale.x,
              environmentYaw: environmentGroup.rotation.y,
              environmentPitch: environmentGroup.rotation.x,
              environmentChildren: environmentGroup.children.length,
              nearRate: nearBackdropTravelRate,
              nearYaw: nearBackdropGroup.rotation.y,
              nearPitch: nearBackdropGroup.rotation.x,
              nearChildren: nearBackdropGroup.children.length,
              midRate: midBackdropTravelRate,
              midYaw: midBackdropGroup.rotation.y,
              midPitch: midBackdropGroup.rotation.x,
              midChildren: midBackdropGroup.children.length,
              farRate: farBackdropTravelRate,
              farYaw: farBackdropGroup.rotation.y,
              farPitch: farBackdropGroup.rotation.x,
              farChildren: farBackdropGroup.children.length,
              foundationNearestRate: substrateNearestTravelRate,
              foundationNearestYaw: substrateNearestGroup.rotation.y,
              foundationNearestPitch: substrateNearestGroup.rotation.x,
              foundationNearestRoll: substrateNearestGroup.rotation.z,
              foundationNearestChildren:
                substrateNearestGroup.children.length,
              foundationNearestGrounded: substrateNearestGrounded,
              foundationNearestPlacement: substrateNearestPlacement,
              foundationNearestVerticalScale:
                substrateNearestVerticalScale,
              foundationNearestChunkSize: substrateNearestChunkSize,
              foundationNearestLocalRadius: substrateNearestLocalRadius,
              foundationNearestMinY: substrateNearestMinY,
              foundationNearestMaxY: substrateNearestMaxY,
              foundationNearestSampleX: substrateNearestSampleX,
              foundationNearestSampleZ: substrateNearestSampleZ,
              foundationNearestUnderfootInstances:
                substrateNearestUnderfootInstances,
              foundationNearestAnchorX:
                substrateGroup.position.x +
                substrateNearestGroup.position.x,
              foundationNearestAnchorZ:
                substrateGroup.position.z +
                substrateNearestGroup.position.z,
              foundationCompressedRate: substrateCompressedTravelRate,
              foundationCompressedYaw: substrateCompressedGroup.rotation.y,
              foundationCompressedPitch: substrateCompressedGroup.rotation.x,
              foundationCompressedChildren:
                substrateCompressedGroup.children.length,
              foundationCompressedGrounded: substrateCompressedGrounded,
              foundationCompressedPlacement: substrateCompressedPlacement,
              foundationRugVisible: foundationMemoryVisible,
              foundationOverlayVisible: foundationOverlay.visible,
              foundationRugOffsetX: groundTexture?.offset.x ?? 0,
              foundationRugOffsetY: groundTexture?.offset.y ?? 0,
              literalFoundationOffsetX: literalGroundTexture?.offset.x ?? 0,
              literalFoundationOffsetY: literalGroundTexture?.offset.y ?? 0,
              transitionRugVisible:
                transitionRug.visible || transitionShell.visible,
              transitionRugMode,
              transitionRugOpacity: Math.max(
                transitionRugMaterial.opacity,
                transitionShellMaterial.opacity,
              ),
              transitionHandoffFlatten:
                1 - transitionHandoffBlend * 0.9,
              ...handoffPickupDiagnostics(),
              transitionIncomingScale:
                transitionWorldScale *
                (1 - transitionHandoffBlend * 0.82),
            },
            pickups: {
              active: pickups.length,
              current: activeScalePickupCount(),
              resident: pickups.filter(
                (pickup) =>
                  pickup.sourceEra < activeIndex &&
                  pickup.retireStartedAt === null,
              ).length,
              retiring: pickups.filter(
                (pickup) => pickup.retireStartedAt !== null,
              ).length,
              queued: pickupSpawnQueue.pending,
              target: activePickupBudget(),
              totalSpawned,
              spawnedLastFrame,
              maxSpawnedPerFrame,
              maxPerFrame: MAX_PICKUP_PROMOTIONS_PER_FRAME,
              workBudgetMs:
                worldPerformanceBudget(qualityTier).maxSpawnWorkMs,
              deferredDisposals: deferredVisualDisposals.length,
              singletonIds: pickups
                .filter(
                  (pickup) => pickup.curio.spawnMode === "singleton",
                )
                .map((pickup) => pickup.curio.id),
              authoredAnchorIds: pickups.flatMap((pickup) =>
                pickup.authoredAnchorId ? [pickup.authoredAnchorId] : [],
              ),
              authoredForms: pickups.flatMap((pickup) =>
                pickup.authoredAnchorId
                  ? [{
                      anchorId: pickup.authoredAnchorId,
                      curioId: pickup.curio.id,
                      form: pickup.curio.visualForm,
                      x: pickup.root.position.x,
                      z: pickup.root.position.z,
                    }]
                  : [],
              ),
              genericMinBaseY: Math.min(
                ...pickups
                  .filter(
                    (pickup) =>
                      pickup.authoredAnchorId === null &&
                      pickup.sourceEra === activeIndex,
                  )
                  .map((pickup) => pickup.baseY),
                Number.POSITIVE_INFINITY,
              ),
              genericCount: pickups.filter(
                (pickup) =>
                  pickup.authoredAnchorId === null &&
                  pickup.sourceEra === activeIndex,
              ).length,
              genericMaxBaseY: Math.max(
                ...pickups
                  .filter(
                    (pickup) =>
                      pickup.authoredAnchorId === null &&
                      pickup.sourceEra === activeIndex,
                  )
                  .map((pickup) => pickup.baseY),
                Number.NEGATIVE_INFINITY,
              ),
              outsidePlayable: pickups.filter(
                (pickup) =>
                  literalPlayableClearanceAt(
                    pickup.root.position.x,
                    pickup.root.position.z,
                    pickup.visualRadius + 0.45,
                  ) < 0,
              ).length,
              oversizedCameraClearance: pickups
                .filter((pickup) => pickup.big)
                .reduce(
                  (minimum, pickup) =>
                    Math.min(
                      minimum,
                      Math.hypot(
                        pickup.root.position.x - camera.position.x,
                        pickup.root.position.z - camera.position.z,
                      ) - pickup.visualRadius,
                    ),
                  Number.POSITIVE_INFINITY,
                ),
            },
            representations: {
              richPickups: pickups.filter((pickup) => pickup.root.visible).length,
              simplePickups:
                farPickupMesh.count + silhouetteLodInstances,
              silhouetteDrawCalls: silhouetteLodDrawCalls,
              silhouetteBadgeInstances,
              genericPickups: farPickupMesh.count,
              attachments: attachments.length,
              proxyPieces: mashProxyPieceCount,
              proxyFamilies: visibleMashProxyFamilyCount,
              richMashDrawCalls: richMashDrawCalls(),
              visibleAttachments: attachments.filter((visual) => visual.visible)
                .length,
              attachmentProxyActive: mashProxyIncludesRich,
              attachmentScale:
                attachments.length > 0
                  ? Math.max(
                      Math.abs(attachments[0].scale.x),
                      Math.abs(attachments[0].scale.y),
                      Math.abs(attachments[0].scale.z),
                    )
                  : 0,
              attachmentDistance:
                attachments[0]?.position.length() ?? 0,
              effectiveRadius: effectiveRollRadius,
              attachmentIds: [
                ...attachments.flatMap((visual) => {
                  const record = visual.userData.mashRecord as
                    | MashRecordV4
                    | undefined;
                  return record ? [record.curioId] : [];
                }),
                ...mashProxyRecords.map(({ record }) => record.curioId),
              ],
              attachmentDistances: attachments.map((visual) =>
                visual.position.length(),
              ),
            },
            world: {
              ...worldSpecForEra(activeEra.name),
              literalStage: activeLiteralStage?.id ?? null,
              literalSceneOrigin:
                activeLiteralStage &&
                game.literalSceneOriginX !== null &&
                game.literalSceneOriginZ !== null
                  ? {
                      x: game.literalSceneOriginX,
                      z: game.literalSceneOriginZ,
                    }
                  : null,
              literalPlayableBounds: literalPlayableBounds
                ? { ...literalPlayableBounds }
                : null,
              literalPlayableRegions: literalPlayableRegions.length,
              foundationMappedSurfaces:
                literalFoundationSurfaceMaterials.size,
              ...semanticWorldDiagnostics(),
              groundVisible: ground.visible,
              foundationSurfaceMemory: foundationMemoryVisible,
              dustVisible: dustField.visible,
              environmentChildren:
                environmentGroup.children.length +
                nearBackdropGroup.children.length +
                midBackdropGroup.children.length +
                farBackdropGroup.children.length,
              atmosphericCloudTop: Boolean(
                environmentGroup.getObjectByName(
                  "giant-atmosphere:cloud-top",
                ),
              ),
              substrateChildren:
                substrateNearestGroup.children.length +
                substrateCompressedGroup.children.length,
              substrateAuthoredInstances,
              substrateGenericInstances,
              substrateRenderedAuthoredInstances,
              substrateRenderedGenericInstances,
            },
            player: {
              x: game.x,
              y: playerRoot.position.y,
              z: game.z,
              surfaceY: literalPlayerSurfaceY,
              literalPlayableClearance: literalPlayableClearanceAt(
                game.x,
                game.z,
                0,
              ),
              cameraX: camera.position.x,
              cameraY: camera.position.y,
              cameraZ: camera.position.z,
              cameraLiteralPlayableClearance: literalPlayableClearanceAt(
                camera.position.x,
                camera.position.z,
                0,
              ),
              cameraDistance: camera.position.distanceTo(playerRoot.position),
              projectedDiameter: projectedDiameterPixels(
                game.radius * playerRoot.scale.x * 2,
                camera.position.distanceTo(playerRoot.position),
                camera.fov,
                height,
              ),
              horizontalFov: horizontalFovDegrees(
                camera.fov,
                camera.aspect,
              ),
            },
            drawBudget: {
              base: baseSceneDrawCalls,
              pipelineReserve: unaccountedDrawCallReserve,
              richBudget: richPickupDrawCallBudget,
              richUsed: richPickupDrawCalls,
              environmentSuppressed: false,
              substrateSuppressed: false,
            },
            bursts: {
              active: popBursts.length,
              limit: MAX_POP_BURSTS,
            },
            drawCalls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            budget: worldPerformanceBudget(qualityTier),
          },
        }),
        removePickups: (count: number) => {
          const removalCount = Math.min(
            pickups.length,
            Math.max(0, Math.floor(count)),
          );
          const removed = pickups.splice(
            pickups.length - removalCount,
            removalCount,
          );
          removed.forEach((pickup) => removePickup(pickup));
          reconcilePickupQueue();
          return {
            removed: removed.length,
            active: pickups.length,
            queued: pickupSpawnQueue.pending,
          };
        },
        completeLayer: () => {
          // Completing the final layer is allowed: it wraps into a new cycle.
          if (
            labEra !== null ||
            scaleTransitionStarted >= 0 ||
            pendingLayerAdvance
          ) {
            return false;
          }
          game.progress = 1;
          game.radius = CORE_RADIUS_MAX;
          return requestLayerAdvance(true);
        },
        previewEra: (index: number) => {
          const requestedIndex = Number.isFinite(index)
            ? Math.floor(index)
            : activeIndex;
          debugEraOverride = Math.max(
            0,
            Math.min(ERAS.length - 1, requestedIndex),
          );
          return debugEraOverride;
        },
        setPlayerPosition: (x: number, z: number) => {
          if (Number.isFinite(x)) game.x = x;
          if (Number.isFinite(z)) game.z = z;
          game.vx = 0;
          game.vz = 0;
          return { x: game.x, z: game.z };
        },
        setLens: (value: number) => {
          game.lens = Math.max(
            1 / 256,
            Math.min(256, Number.isFinite(value) ? value : game.lens),
          );
          return game.lens;
        },
        emitPickupBursts: (count: number) => {
          const burstCount = Math.max(0, Math.min(100, Math.floor(count)));
          const now = performance.now();
          for (let index = 0; index < burstCount; index += 1) {
            activatePopBurst(
              playerRoot.position,
              game.radius,
              activeEra.palette[index % activeEra.palette.length],
              now,
            );
          }
          return popBursts.length;
        },
        collectCurrentPickup: () => {
          const pickupIndex = pickups.findIndex(
            (pickup) => pickup.sourceEra === activeIndex,
          );
          if (pickupIndex < 0) return null;
          const [pickup] = pickups.splice(pickupIndex, 1);
          const name = pickup.curio.name;
          collect(pickup, performance.now());
          reconcilePickupQueue();
          return name;
        },
        collectSingletonPickup: () => {
          const pickupIndex = pickups.findIndex(
            (pickup) =>
              pickup.sourceEra === activeIndex &&
              pickup.curio.spawnMode === "singleton" &&
              pickup.retireStartedAt === null,
          );
          if (pickupIndex < 0) return null;
          const [pickup] = pickups.splice(pickupIndex, 1);
          const id = pickup.curio.id;
          collect(pickup, performance.now());
          reconcilePickupQueue();
          return id;
        },
        retireSingletonPickup: () => {
          const pickup = pickups.find(
            (candidate) =>
              candidate.sourceEra === activeIndex &&
              candidate.curio.spawnMode === "singleton" &&
              candidate.retireStartedAt === null,
          );
          if (!pickup) return null;
          pickup.retireStartedAt = performance.now();
          reconcilePickupQueue();
          return pickup.curio.id;
        },
      }
    : null;
  if (performanceDebug) {
    debugWindow.__QUARKATAMARI_PERFORMANCE__ = performanceDebug;
  }

  let last = performance.now();
  let lastBlockerContactAt = Number.NEGATIVE_INFINITY;
  let nextFrameDeadline = last;
  let framePacingIdle = true;
  let frame = 0;
  let hudClock = 0;
  let rollRadiusClock = 0;
  let performanceWindowStarted = performance.now();
  let performanceFrames = 0;
  let measuredFps = 60;
  let effectiveRollRadius = game.radius;
  const mashCurioById = new Map(
    ERAS.flatMap((era) => era.curios.map((curio) => [curio.id, curio] as const)),
  );
  const directionalAttachmentCircles: AttachmentCircleXZ[] = [];
  const directionalSeenRecords = new Set<MashRecordV4>();
  const directionalAttachmentPosition = new THREE.Vector3();
  const directionalRollQuaternion = new THREE.Quaternion();
  const refreshDirectionalAttachmentCircles = () => {
    rollGroup.getWorldQuaternion(directionalRollQuaternion);
    directionalSeenRecords.clear();
    let circleCount = 0;
    const addRecord = (record: MashRecordV4 | undefined) => {
      if (!record || directionalSeenRecords.has(record)) return;
      directionalSeenRecords.add(record);
      const curio = mashCurioById.get(record.curioId);
      if (!curio) return;
      directionalAttachmentPosition
        .set(...record.position)
        .applyQuaternion(directionalRollQuaternion);
      const authoredScale = Math.max(
        Math.abs(record.scale[0]),
        Math.abs(record.scale[1]),
        Math.abs(record.scale[2]),
      );
      const circle = directionalAttachmentCircles[circleCount] ?? {
        x: 0,
        z: 0,
        radius: 0,
      };
      circle.x = directionalAttachmentPosition.x;
      circle.z = directionalAttachmentPosition.z;
      circle.radius = supportRadiusForCurio(curio) * authoredScale;
      directionalAttachmentCircles[circleCount] = circle;
      circleCount += 1;
    };
    attachments.forEach((visual) =>
      addRecord(visual.userData.mashRecord as MashRecordV4 | undefined),
    );
    mashProxyRecords.forEach(({ record }) => addRecord(record));
    directionalAttachmentCircles.length = circleCount;
  };
  const directionalRollRadius = (directionX: number, directionZ: number) =>
    Math.min(
      game.radius * MAX_ROLL_ENVELOPE_FACTOR,
      directionalAttachmentEnvelopeXZ(
        game.radius,
        directionX,
        directionZ,
        directionalAttachmentCircles,
      ),
    );
  const refreshEffectiveRollRadius = () => {
    refreshDirectionalAttachmentCircles();
    effectiveRollRadius = game.radius;
    for (let sample = 0; sample < 16; sample += 1) {
      const angle = (sample / 16) * Math.PI * 2;
      effectiveRollRadius = Math.max(
        effectiveRollRadius,
        directionalRollRadius(Math.cos(angle), Math.sin(angle)),
      );
    }
    rollRadiusClock = 0;
  };
  const desiredCamera = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const farPickupDummy = new THREE.Object3D();
  const drawBudgetFrustum = new THREE.Frustum();
  const drawBudgetProjection = new THREE.Matrix4();
  const countVisibleBaseDrawCalls = () => {
    let drawCalls = 0;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    drawBudgetProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    drawBudgetFrustum.setFromProjectionMatrix(drawBudgetProjection);
    scene.traverseVisible((object) => {
      if (
        !(
          object instanceof THREE.Mesh ||
          object instanceof THREE.Points ||
          object instanceof THREE.Line ||
          object instanceof THREE.Sprite
        ) ||
        (object instanceof THREE.InstancedMesh && object.count === 0)
      ) {
        return;
      }
      const inCameraView =
        !object.frustumCulled ||
        (object instanceof THREE.Sprite
          ? drawBudgetFrustum.intersectsSprite(object)
          : drawBudgetFrustum.intersectsObject(object));
      if (!inCameraView) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const visibleMaterials = materials.filter(
        (material) => material.visible,
      ).length;
      drawCalls += visibleMaterials;
      if (renderer.shadowMap.enabled && object.castShadow) {
        drawCalls += visibleMaterials;
      }
    });
    return drawCalls;
  };
  const refreshBaseSceneDrawCalls = () => {
    pickups.forEach((pickup) => {
      pickup.root.visible = false;
    });
    farPickupMesh.visible = false;
    baseSceneDrawCalls = countVisibleBaseDrawCalls();
    baseSceneDrawCallsDirty = false;
  };
  const animate = (now: number) => {
    if (
      document.hidden ||
      modalOpenRef.current ||
      now - last > 1_000
    ) {
      last = now;
      nextFrameDeadline = now;
      performanceWindowStarted = now;
      performanceFrames = 0;
      frame = requestAnimationFrame(animate);
      return;
    }
    const keys = keysRef.current;
    const controlsActive =
      joystickRef.current.active ||
      keys.w ||
      keys.a ||
      keys.s ||
      keys.d ||
      keys.arrowup ||
      keys.arrowdown ||
      keys.arrowleft ||
      keys.arrowright;
    const nextFramePacingIdle =
      scaleTransitionStarted < 0 &&
      !pendingLayerAdvance &&
      !controlsActive &&
      Math.hypot(game.vx, game.vz) < 0.04;
    if (nextFramePacingIdle !== framePacingIdle) {
      framePacingIdle = nextFramePacingIdle;
      nextFrameDeadline = now;
      performanceWindowStarted = now;
      performanceFrames = 0;
    }
    const advancedDeadline = advanceFrameDeadline(
      now,
      nextFrameDeadline,
      framePacingIdle
        ? profileSettings.idleTargetFps
        : profileSettings.targetFps,
    );
    if (advancedDeadline === null) {
      frame = requestAnimationFrame(animate);
      return;
    }
    nextFrameDeadline = advancedDeadline;
    const frameStartedAt = phaseStart();
    const frameInterval = now - last;
    const dt = Math.min(0.05, frameInterval / 1000);
    last = now;
    phaseRecorder?.record("frame-interval", frameInterval);
    const simulationStartedAt = phaseStart();
    drainDeferredVisualDisposals(8);
    performanceFrames += 1;
    const performanceWindow = now - performanceWindowStarted;
    if (performanceWindow >= 5000) {
      measuredFps = (performanceFrames * 1000) / performanceWindow;
      performanceWindowStarted = now;
      performanceFrames = 0;
    }
    pickupRetireClock += dt;
    if (pickupRetireClock >= 0.18) {
      retireOnePeripheralPickup(now);
      pickupRetireClock = 0;
    }
    pickups = pickups.filter((pickup) => {
      if (
        pickup.retireStartedAt === null ||
        now - pickup.retireStartedAt < PICKUP_RETIRE_MS
      ) {
        return true;
      }
      removePickup(pickup);
      baseSceneDrawCallsDirty = true;
      return false;
    });
    rollRadiusClock += dt;
    if (rollRadiusClock > 0.12) {
      refreshEffectiveRollRadius();
    }

    if (game.running && scaleTransitionStarted < 0) {
      let inputX = 0;
      let inputZ = 0;
      if (keysRef.current.w || keysRef.current.arrowup) inputZ -= 1;
      if (keysRef.current.s || keysRef.current.arrowdown) inputZ += 1;
      if (keysRef.current.a || keysRef.current.arrowleft) inputX -= 1;
      if (keysRef.current.d || keysRef.current.arrowright) inputX += 1;
      const joystick = joystickRef.current;
      if (joystick.active) {
        inputX += Math.max(-1, Math.min(1, (joystick.x - joystick.originX) / 62));
        inputZ += Math.max(-1, Math.min(1, (joystick.y - joystick.originY) / 62));
      }
      const length = Math.hypot(inputX, inputZ);
      if (length > 0.05) {
        inputX /= Math.max(1, length);
        inputZ /= Math.max(1, length);
        game.vx += inputX * 17.8125 * dt;
        game.vz += inputZ * 17.8125 * dt;
      }
      const drag = Math.pow(0.09, dt);
      game.vx *= drag;
      game.vz *= drag;
      const speed = Math.hypot(game.vx, game.vz);
      const maxSpeed = 9.75;
      if (speed > maxSpeed) {
        game.vx = (game.vx / speed) * maxSpeed;
        game.vz = (game.vz / speed) * maxSpeed;
      }
      game.x += game.vx * dt;
      game.z += game.vz * dt;
      const colliderChunkSize = worldChunkSize(activeWorldKind);
      const activeWorldTopology = worldSpecForEra(activeEra.name).topology;
      const shiftX = floatingOriginShift(
        game.x,
        colliderChunkSize,
      );
      const shiftZ = floatingOriginShift(
        game.z,
        colliderChunkSize,
      );
      if (shiftX !== 0 || shiftZ !== 0) {
        game.originX += shiftX;
        game.originZ += shiftZ;
        game.x -= shiftX;
        game.z -= shiftZ;
        pickups.forEach((pickup) => {
          pickup.root.position.x -= shiftX;
          pickup.root.position.z -= shiftZ;
        });
        if (activeLiteralStage) {
          literalSceneOriginX -= shiftX;
          literalSceneOriginZ -= shiftZ;
          environmentGroup.children.forEach((child) => {
            child.position.x -= shiftX;
            child.position.z -= shiftZ;
          });
          sceneryColliders.forEach((collider) => {
            collider.x -= shiftX;
            collider.z -= shiftZ;
          });
          if (literalPlayableBounds) {
            literalPlayableBounds.minX -= shiftX;
            literalPlayableBounds.maxX -= shiftX;
            literalPlayableBounds.minZ -= shiftZ;
            literalPlayableBounds.maxZ -= shiftZ;
          }
          literalPlayableRegions.forEach((region) => {
            region.minX -= shiftX;
            region.maxX -= shiftX;
            region.minZ -= shiftZ;
            region.maxZ -= shiftZ;
          });
        }
        popBursts.forEach((burst) => {
          burst.position.x -= shiftX;
          burst.position.z -= shiftZ;
        });
        camera.position.x -= shiftX;
        camera.position.z -= shiftZ;
      }
      const colliderChunkX = worldUsesPeriodicTiles(activeEra.name)
        ? Math.round(game.x / colliderChunkSize) * colliderChunkSize
        : activeWorldTopology === "finite"
          ? 0
          : game.x;
      const colliderChunkZ = worldUsesPeriodicTiles(activeEra.name)
        ? Math.round(game.z / colliderChunkSize) * colliderChunkSize
        : activeWorldTopology === "finite"
          ? 0
          : game.z;
      refreshDirectionalAttachmentCircles();
      if (environmentGroup.visible) sceneryColliders.forEach((collider) => {
        const colliderX = colliderChunkX + collider.x;
        const colliderZ = colliderChunkZ + collider.z;
        const contactDirection = nearestAabbContactDirectionXZ(
          game.x,
          game.z,
          colliderX,
          colliderZ,
          collider.halfWidth,
          collider.halfDepth,
        );
        const collisionEnvelope = directionalRollRadius(
          contactDirection.x,
          contactDirection.z,
        );
        const collision = resolveCircleAabbCollision(
          game.x,
          game.z,
          game.vx,
          game.vz,
          collisionEnvelope,
          colliderX,
          colliderZ,
          collider.halfWidth,
          collider.halfDepth,
        );
        game.x = collision.x;
        game.z = collision.z;
        game.vx = collision.vx;
        game.vz = collision.vz;
      });
      rollGroup.rotation.x += (game.vz * dt) / Math.max(0.5, game.radius);
      rollGroup.rotation.z -= (game.vx * dt) / Math.max(0.5, game.radius);

      for (const pickup of pickups) {
        if (
          (pickup.sourceEra < activeIndex && pickup.authoredAnchorId === null) ||
          pickup.retireStartedAt !== null
        ) {
          continue;
        }
        const entranceScale = pickupLifecycleScale(pickup, now);
        if (entranceScale < PICKUP_COLLISION_SCALE) continue;
        const collisionRadius = pickup.visualRadius * entranceScale;
        const dx = pickup.root.position.x - game.x;
        const dz = pickup.root.position.z - game.z;
        const distance = Math.hypot(dx, dz);
        const collisionEnvelope = directionalRollRadius(dx, dz);
        if (
          labEra === null &&
          distance < collisionEnvelope + collisionRadius
        ) {
          if (
            canCollectPickup(
              pickup.sourceEra,
              activeIndex,
              pickup.visualRadius,
              collisionEnvelope,
            )
          ) {
            collect(pickup, now);
            pickup.root.position.x = Number.POSITIVE_INFINITY;
          } else {
            const collision = resolveCircularCollision(
              game.x,
              game.z,
              game.vx,
              game.vz,
              pickup.root.position.x,
              pickup.root.position.z,
              collisionEnvelope + collisionRadius,
            );
            game.x = collision.x;
            game.z = collision.z;
            game.vx = collision.vx;
            game.vz = collision.vz;
            const newBlockerEncounter = now - lastBlockerContactAt > 1_000;
            lastBlockerContactAt = now;
            if (
              newBlockerEncounter &&
              now / 1000 - game.lastPickup > 0.8
            ) {
              setToast(`Oof! ${pickup.curio.name} is still too chunky. Snack smaller first.`);
            }
          }
        }
      }
      pickups = pickups.filter((pickup) => Number.isFinite(pickup.root.position.x));
    }

    if (pendingLayerAdvance) {
      pendingLayerAdvance = false;
      advanceLayer(false);
    }

    if (scaleTransitionStarted >= 0) {
      const progress = Math.min(
        1,
        (now - scaleTransitionStarted) /
          Math.max(1, scaleTransitionDurationMs),
      );
      const transition = scaleTransitionFrame(progress);
      transitionWorldScale = transition.worldScale;
      const surfaceProgress = progress * progress * (3 - 2 * progress);
      literalPlayerSurfaceY = THREE.MathUtils.lerp(
        transitionSurfaceFromY,
        transitionSurfaceToY,
        surfaceProgress,
      );
      const rugProgress = THREE.MathUtils.clamp(
        (progress - 0.48) / 0.52,
        0,
        1,
      );
      transitionHandoffBlend =
        rugProgress * rugProgress * (3 - 2 * rugProgress);
      const transitionMemoryVisible =
        transitionRugTexture !== null && transitionHandoffBlend > 0;
      const transitionPlaneVisible =
        transitionMemoryVisible && transitionRugMode === "plane";
      const transitionShellVisible =
        transitionMemoryVisible && transitionRugMode === "shell";
      if (
        transitionRug.visible !== transitionPlaneVisible ||
        transitionShell.visible !== transitionShellVisible
      ) {
        transitionRug.visible = transitionPlaneVisible;
        transitionShell.visible = transitionShellVisible;
        baseSceneDrawCallsDirty = true;
      }
      transitionRugMaterial.opacity =
        transitionRugTargetOpacity * transitionHandoffBlend;
      transitionShellMaterial.opacity =
        transitionRugTargetOpacity * transitionHandoffBlend;
      transitionRug.scale.setScalar(
        0.92 + transitionHandoffBlend * 0.08,
      );
      playerRoot.scale.setScalar(transition.playerScale);
      pickups.forEach((pickup) => {
        if (
          pickup.handoffX === null ||
          pickup.handoffY === null ||
          pickup.handoffZ === null
        ) {
          return;
        }
        pickup.root.position.x =
          game.x + (pickup.handoffX - game.x) * transitionWorldScale;
        pickup.root.position.z =
          game.z + (pickup.handoffZ - game.z) * transitionWorldScale;
        const foundationY = transitionFoundationHeight(
          pickup.root.position.x - game.x,
          pickup.root.position.z - game.z,
        );
        pickup.baseY = THREE.MathUtils.lerp(
          pickup.handoffY * transitionWorldScale,
          foundationY,
          transitionHandoffBlend,
        );
      });
      // Persistent literal architecture is the place the scale change happens
      // inside; shrinking it and rebuilding it at 1× creates a two-step pop.
      // Pickups and prior-layer fabric still perform the learning handoff.
      environmentGroup.scale.setScalar(
        activeLiteralStage ? 1 : transitionWorldScale,
      );
      nearBackdropGroup.scale.setScalar(transitionWorldScale);
      midBackdropGroup.scale.setScalar(transitionWorldScale);
      farBackdropGroup.scale.setScalar(transitionWorldScale);
      substrateGroup.scale.setScalar(transitionWorldScale);
      ground.scale.setScalar(transitionWorldScale);
      foundationOverlay.scale.setScalar(transitionWorldScale);
      grid.scale.setScalar(transitionWorldScale);
      dustField.scale.setScalar(transitionWorldScale);
      if (progress >= 1) {
        advanceLayer(true);
      }
    }

    const nextActiveIndex = debugEraOverride ?? labEra ?? game.era;
    if (nextActiveIndex !== activeIndex) {
      if (debugEraOverride === null) retireVisibleMash();
      applyEraTheme(nextActiveIndex, true);
      pickups = pickups.filter((pickup) => {
        const inActiveBand =
          pickup.sourceEra >= activeIndex - 3 && pickup.sourceEra <= activeIndex + 3;
        const insideLiteralPlace =
          pickup.authoredAnchorId !== null ||
          literalPlayableClearanceAt(
            pickup.root.position.x,
            pickup.root.position.z,
            pickup.visualRadius + 0.45,
          ) >= 0;
        if (!inActiveBand || !insideLiteralPlace) removePickup(pickup);
        return inActiveBand && insideLiteralPlace;
      });
      pickups.forEach((pickup) => {
        if (pickup.marker) pickup.marker.visible = pickup.sourceEra >= activeIndex;
      });
      attachments.forEach((attachment) => {
        const sourceEra = Number(attachment.userData.sourceEra ?? activeIndex);
        attachment.traverse((child) => {
          if (child instanceof THREE.Sprite) child.visible = sourceEra >= activeIndex;
        });
      });
      needsInnerSpawnRing = true;
      resetPickupQueue();
      reconcilePickupQueue();
    }

    const continuousViewScale = semanticViewScale(
      activeIndex,
      game.lens,
      ERAS.length,
    );
    const nextResidencyKey = substrateKeyFor(continuousViewScale);
    if (nextResidencyKey !== semanticResidencyKey) {
      buildSubstrate(continuousViewScale);
      applyGroundScaleTexture(continuousViewScale);
    }

    spawnClock += frameInterval / 1000;
    spawnedLastFrame = 0;
    const lowPickupThreshold = Math.floor(activePickupBudget() * 0.84);
    if (scaleTransitionStarted < 0) {
      reconcileLiteralPropAnchors();
      drainLiteralAnchorQueue(now);
      if (
        spawnClock > 0.5 ||
        activeScalePickupCount() + pickupSpawnQueue.pending <
          lowPickupThreshold
      ) {
        reconcilePickupQueue();
        spawnClock = 0;
      }
      drainPickupQueue(now);
      if (
        pickupSpawnQueue.pending === 0 &&
        activeScalePickupCount() < activePickupBudget()
      ) {
        reconcilePickupQueue();
      }
    }
    phaseEnd("simulation", simulationStartedAt);

    const displayedPlayerRadius = game.radius * playerRoot.scale.x;
    const floatHeight =
      literalPlayerSurfaceY +
      displayedPlayerRadius * 0.94 +
      (early ? Math.sin(now * 0.0017) * 0.035 : 0);
    playerRoot.position.set(game.x, floatHeight, game.z);
    if (rollRadiusClock >= 0.12) refreshEffectiveRollRadius();
    const mashProjectedSize = projectedDiameterPixels(
      Math.max(displayedPlayerRadius, effectiveRollRadius) * 2,
      camera.position.distanceTo(playerRoot.position),
      camera.fov,
      height,
    );
    setMashProxyLod(
      !wantsRichProjectedDetail(
        mashProjectedSize,
        !mashProxyIncludesRich,
      ),
    );
    const sceneryProjectedSize = projectedDiameterPixels(
      3 * transitionWorldScale,
      camera.position.distanceTo(playerRoot.position),
      camera.fov,
      height,
    );
    setCentralSceneryLod(
      worldUsesPeriodicTiles(activeEra.name) &&
        !wantsRichProjectedDetail(
          sceneryProjectedSize,
          centralSceneryCompact === false,
        ),
    );
    const activeChunkSize = worldChunkSize(activeWorldKind);
    const chunkX = Math.round(game.x / activeChunkSize) * activeChunkSize;
    const chunkZ = Math.round(game.z / activeChunkSize) * activeChunkSize;
    const activeTopology = worldSpecForEra(activeEra.name).topology;
    if (worldUsesPeriodicTiles(activeEra.name)) {
      environmentGroup.position.set(chunkX, 0, chunkZ);
    } else if (activeTopology === "finite") {
      environmentGroup.position.set(0, 0, 0);
    } else {
      // Streamed sky/planet/cosmic dioramas stay resident around the player;
      // their depth bands rotate from absolute travel below.
      environmentGroup.position.set(game.x, 0, game.z);
    }
    nearBackdropGroup.position.set(game.x, 0, game.z);
    midBackdropGroup.position.set(game.x, 0, game.z);
    farBackdropGroup.position.set(game.x, 0, game.z);
    substrateGroup.position.set(game.x, 0, game.z);
    const nearestAnchorX = substrateNearestUsesPeriodicCopies
      ? foundationChunkAnchor(
          game.x,
          game.originX,
          substrateNearestChunkSize,
        )
      : game.x;
    const nearestAnchorZ = substrateNearestUsesPeriodicCopies
      ? foundationChunkAnchor(
          game.z,
          game.originZ,
          substrateNearestChunkSize,
        )
      : game.z;
    substrateNearestGroup.position.set(
      nearestAnchorX - game.x,
      substrateNearestUsesPlanetWrap
        ? PLANET_FOUNDATION_CENTER_Y
        : 0,
      nearestAnchorZ - game.z,
    );
    const compressedAnchorX = substrateCompressedUsesPeriodicCopies
      ? foundationChunkAnchor(game.x, game.originX, activeChunkSize)
      : game.x;
    const compressedAnchorZ = substrateCompressedUsesPeriodicCopies
      ? foundationChunkAnchor(game.z, game.originZ, activeChunkSize)
      : game.z;
    substrateCompressedGroup.position.set(
      compressedAnchorX - game.x,
      0,
      compressedAnchorZ - game.z,
    );
    const absoluteX = game.x + game.originX;
    const absoluteZ = game.z + game.originZ;
    if (activeTopology === "finite") {
      environmentGroup.rotation.set(0, 0, 0);
    } else {
      environmentGroup.rotation.set(
        parallaxPitch(absoluteZ, environmentTravelRate),
        parallaxYaw(absoluteX, environmentTravelRate),
        0,
      );
    }
    nearBackdropGroup.rotation.set(
      parallaxPitch(absoluteZ, nearBackdropTravelRate),
      parallaxYaw(absoluteX, nearBackdropTravelRate),
      0,
    );
    midBackdropGroup.rotation.set(
      parallaxPitch(absoluteZ, midBackdropTravelRate),
      parallaxYaw(absoluteX, midBackdropTravelRate),
      0,
    );
    farBackdropGroup.rotation.set(
      parallaxPitch(absoluteZ, farBackdropTravelRate),
      parallaxYaw(absoluteX, farBackdropTravelRate),
      0,
    );
    if (substrateNearestUsesPlanetWrap) {
      substrateNearestGroup.rotation.set(0, 0, 0);
      updatePlanetFoundationShell(absoluteX, absoluteZ);
    } else {
      substrateNearestGroup.rotation.set(
        parallaxPitch(absoluteZ, substrateNearestTravelRate),
        parallaxYaw(absoluteX, substrateNearestTravelRate),
        0,
      );
    }
    substrateCompressedGroup.rotation.set(
      parallaxPitch(absoluteZ, substrateCompressedTravelRate),
      parallaxYaw(absoluteX, substrateCompressedTravelRate),
      0,
    );
    ground.position.set(game.x, 0, game.z);
    foundationOverlay.position.set(
      game.x,
      foundationOverlayHeight,
      game.z,
    );
    transitionRug.position.set(game.x, transitionRugHeight, game.z);
    transitionShell.position.set(
      game.x,
      PLANET_FOUNDATION_CENTER_Y,
      game.z,
    );
    if (groundTexture) {
      const shellMappedTexture =
        activeWorldKind === "planet-surface" &&
        substrateFoundationPlan.presentation === "shell";
      const shellRates = foundationShellTextureRates(
        groundTexture.repeat.x,
        PLANET_FOUNDATION_RADIUS,
      );
      const xRate = shellMappedTexture
        ? shellRates.longitude
        : foundationTextureRate(
            groundTexture.repeat.x,
            FOUNDATION_OVERLAY_RADIUS * 2,
          );
      const zRate = shellMappedTexture ? shellRates.latitude : xRate;
      groundTexture.offset.set(
        wrappedTextureOffset(game.x + game.originX, xRate),
        wrappedTextureOffset(
          -(game.z + game.originZ),
          zRate,
        ),
      );
    }
    if (transitionRugTexture) {
      const shellRates = foundationShellTextureRates(
        transitionRugTexture.repeat.x,
        PLANET_FOUNDATION_RADIUS,
      );
      const xRate =
        transitionRugMode === "shell"
          ? shellRates.longitude
          : foundationTextureRate(
              transitionRugTexture.repeat.x,
              FOUNDATION_OVERLAY_RADIUS * 2,
            );
      const zRate = transitionRugMode === "shell"
        ? shellRates.latitude
        : xRate;
      transitionRugTexture.offset.set(
        wrappedTextureOffset(game.x + game.originX, xRate),
        wrappedTextureOffset(
          -(game.z + game.originZ),
          zRate,
        ),
      );
    }
    const gridCell = 170 / 90;
    const phaseX = game.x + game.originX;
    const phaseZ = game.z + game.originZ;
    grid.position.set(
      phaseX -
        THREE.MathUtils.euclideanModulo(phaseX, gridCell) -
        game.originX,
      0.012,
      phaseZ -
        THREE.MathUtils.euclideanModulo(phaseZ, gridCell) -
        game.originZ,
    );
    dustField.position.set(game.x, 0, game.z);
    const faceScale = game.radius * 0.94;
    ballFace.position.set(0, game.radius * 0.1, game.radius * 0.86);
    ballFace.scale.set(faceScale, faceScale, 1);
    if (faceReactionUntil && now >= faceReactionUntil) {
      faceReactionUntil = 0;
      ballFaceMaterial.map = happyFaceTexture;
      ballFaceMaterial.needsUpdate = true;
    }
    const mashPieceCount = visibleMashPieceCount();
    const wobble = early ? 0.055 : Math.min(0.035, mashPieceCount * 0.0007);
    const coreShare = coreShareFor(mashPieceCount);
    coreMaterial.opacity = early
      ? Math.max(0.08, 0.58 - mashPieceCount * 0.04)
      : Math.max(0.1, 0.56 - mashPieceCount * 0.012);
    core.scale.set(
      game.radius * coreShare * (1 + Math.sin(now * 0.0021) * wobble),
      game.radius * coreShare * (1 + Math.sin(now * 0.0027 + 1.3) * wobble),
      game.radius * coreShare * (1 + Math.sin(now * 0.0019 + 2.4) * wobble),
    );
    const nextFoamVisibility = early && mashPieceCount < 11;
    if (foamCluster.visible !== nextFoamVisibility) {
      foamCluster.visible = nextFoamVisibility;
      baseSceneDrawCallsDirty = true;
    }
    foamCluster.scale.setScalar(
      game.radius * Math.max(0.38, 0.95 - mashPieceCount * 0.055),
    );
    foamCluster.rotation.y += dt * 0.18;
    foamCluster.rotation.x -= dt * 0.09;
    innerGlow.rotation.y += dt * 0.3;
    dustField.rotation.y += dt * (early ? 0.014 : 0.003);
    glowLight.position.set(game.x + 4, floatHeight + 4, game.z - 3);

    const pickupLodStartedAt = phaseStart();
    const renderBudget = worldPerformanceBudget(qualityTier);
    richPickupDrawCalls = 0;
    richPickupDrawCallBudget = renderBudget.maxDrawCalls;
    collectibleLodPool.beginFrame();
    const farPickupReserve = pickups.length > 0 ? 1 : 0;
    const activeSilhouetteFamilies = new Set(
      pickups
        .filter((pickup) => pickup.sourceEra >= activeIndex)
        .map((pickup) => pickup.curio.id),
    ).size;
    const fabricSilhouetteFamilies = new Set(
      pickups
        .filter((pickup) => pickup.sourceEra === activeIndex - 1)
        .map((pickup) => pickup.curio.id),
    ).size;
    const silhouetteReserve =
      (activeSilhouetteFamilies + fabricSilhouetteFamilies) * 2;
    if (baseSceneDrawCallsDirty) {
      refreshBaseSceneDrawCalls();
    }
    richPickupDrawCallBudget = Math.max(
      0,
      renderBudget.maxDrawCalls -
        baseSceneDrawCalls -
        farPickupReserve -
        silhouetteReserve -
        unaccountedDrawCallReserve,
    );
    let farPickupCount = 0;
    const richPickupBudget = richPickupLimit;
    const pickupDetail = pickups.map((pickup, index) => {
      const entranceScale = pickupLifecycleScale(pickup, now);
      const outgoingHandoff = pickup.handoffX !== null;
      const pickupWorldScale = outgoingHandoff
        ? transitionWorldScale
        : transitionWorldScale * (1 - transitionHandoffBlend * 0.82);
      const handoffVerticalScale = outgoingHandoff
        ? 1 - transitionHandoffBlend * 0.9
        : 1;
      const distance = Math.hypot(
        pickup.root.position.x - game.x,
        pickup.root.position.z - game.z,
      );
      pickup.big = pickup.visualRadius > effectiveRollRadius * 1.08;
      const projectedSize = projectedDiameterPixels(
        pickup.visualRadius * 2 * pickupWorldScale,
        camera.position.distanceTo(pickup.root.position),
        camera.fov,
        height,
      );
      const projectedLod = lodForProjectedDiameter(projectedSize);
      const nearLargePickup =
        pickup.big &&
        projectedLod === "simple" &&
        distance < (pickup.wantsRichDetail ? 34 : 28);
      pickup.wantsRichDetail =
        wantsRichProjectedDetail(
          projectedSize,
          pickup.wantsRichDetail,
        ) || nearLargePickup;
      return {
        pickup,
        index,
        entranceScale,
        pickupWorldScale,
        handoffVerticalScale,
        distance,
        projectedSize,
        projectedLod,
        nearField: distance <= PICKUP_RICH_NEAR_DISTANCE,
      };
    });
    const richPickupSet = new Set<Pickup>();
    const richCandidates = pickupDetail
      .filter(
        ({ pickup }) =>
          (pickup.sourceEra >= activeIndex || pickup.authoredAnchorId !== null) &&
          pickup.wantsRichDetail,
      )
      .sort((first, second) => {
        const nearPriority =
          Number(second.nearField) - Number(first.nearField);
        if (nearPriority !== 0) return nearPriority;
        const authoredPriority =
          Number(second.pickup.authoredAnchorId !== null) -
          Number(first.pickup.authoredAnchorId !== null);
        if (authoredPriority !== 0) return authoredPriority;
        const currentPriority =
          Number(second.pickup.sourceEra === activeIndex) -
          Number(first.pickup.sourceEra === activeIndex);
        if (currentPriority !== 0) return currentPriority;
        const retainedPriority =
          Number(second.pickup.richAdmitted) -
          Number(first.pickup.richAdmitted);
        if (retainedPriority !== 0) return retainedPriority;
        const distancePriority = first.distance - second.distance;
        if (Math.abs(distancePriority) > 0.001) return distancePriority;
        return first.index - second.index;
      });
    for (const { pickup } of richCandidates) {
      if (richPickupSet.size >= richPickupBudget) break;
      if (
        richPickupDrawCalls + pickup.drawCalls > richPickupDrawCallBudget
      ) {
        continue;
      }
      richPickupSet.add(pickup);
      richPickupDrawCalls += pickup.drawCalls;
    }
    pickupDetail.forEach(({
      pickup,
      index,
      entranceScale,
      pickupWorldScale,
      handoffVerticalScale,
      distance,
      projectedSize,
      projectedLod,
    }) => {
      pickup.renderedScale.set(0, 0, 0);
      pickup.renderedScaleY = 0;
      const useRichVisual = richPickupSet.has(pickup);
      pickup.richAdmitted = useRichVisual;
      pickup.root.visible = useRichVisual;
      if (pickup.marker) {
        pickup.marker.visible =
          useRichVisual &&
          pickup.sourceEra >= activeIndex &&
          projectedSize >= 9;
      }
      const identity = pickup.identity;
      const motionTime =
        now * 0.001 * identity.motionRate + pickup.wiggle + index * 0.017;
      const motionAmount =
        identity.motionAmount *
        (early ? 1.35 : 1) *
        (pickup.big ? 0.65 : 1) *
        (pickup.handoffX !== null ? 1 - transitionHandoffBlend : 1);
      const baseSpin = pickup.big ? 0.07 : 0.18;
      pickup.root.position.y = pickup.baseY;
      if (!pickup.grounded && identity.motion !== "tumble") {
        pickup.root.rotation.x *= Math.pow(0.002, dt);
      }
      if (!pickup.grounded) pickup.root.rotation.z *= Math.pow(0.002, dt);
      const motionScale =
        !pickup.grounded && identity.motion === "pulse"
          ? 1 + Math.sin(motionTime * 3.1) * 0.045
          : 1;

      if (!useRichVisual) {
        if (
          pickup.sourceEra < activeIndex - 1 &&
          pickup.authoredAnchorId === null
        ) {
          return;
        }
        farPickupDummy.position.set(
          pickup.root.position.x,
          pickup.grounded
            ? pickup.baseY
            : pickup.baseY + Math.sin(motionTime * 1.7) * motionAmount * 0.45,
          pickup.root.position.z,
        );
        farPickupDummy.rotation.set(
          0,
          pickup.grounded ? pickup.root.rotation.y : motionTime * 0.13,
          pickup.grounded ? 0 : Math.sin(motionTime) * 0.12,
        );
        let farColor = pickupColorCache.get(pickup.curio.color);
        if (!farColor) {
          farColor = new THREE.Color(pickup.curio.color);
          pickupColorCache.set(pickup.curio.color, farColor);
        }
        const readabilityScale =
          !pickup.grounded && pickup.sourceEra >= activeIndex && projectedSize > 0
            ? THREE.MathUtils.clamp(6 / projectedSize, 1, 2.5)
            : 1;
        const silhouetteScale =
          pickup.size *
          motionScale *
          pickupWorldScale *
          entranceScale *
          readabilityScale;
        farPickupDummy.scale.set(
          silhouetteScale,
          silhouetteScale * handoffVerticalScale,
          silhouetteScale,
        );
        pickup.renderedScale.copy(farPickupDummy.scale);
        pickup.renderedScaleY = farPickupDummy.scale.y;
        farPickupDummy.updateMatrix();
        if (
          collectibleLodPool.add(
            pickup.curio,
            farPickupDummy.matrix,
          )
        ) {
          return;
        }
        const fallbackScale =
          pickup.visualRadius *
          motionScale *
          pickupWorldScale *
          entranceScale;
        farPickupDummy.scale.set(
          fallbackScale,
          fallbackScale * handoffVerticalScale,
          fallbackScale,
        );
        const fallbackAuthoredScale =
          pickup.size * motionScale * pickupWorldScale * entranceScale;
        pickup.renderedScale.set(
          fallbackAuthoredScale,
          fallbackAuthoredScale * handoffVerticalScale,
          fallbackAuthoredScale,
        );
        pickup.renderedScaleY = pickup.renderedScale.y;
        farPickupDummy.updateMatrix();
        farPickupMesh.setMatrixAt(farPickupCount, farPickupDummy.matrix);
        farPickupMesh.setColorAt(
          farPickupCount,
          farColor,
        );
        farPickupCount += 1;
        return;
      }

      const richScale = motionScale * pickupWorldScale * entranceScale;
      pickup.root.scale.set(
        richScale,
        richScale * handoffVerticalScale,
        richScale,
      );
      pickup.renderedScale.set(
        pickup.size * pickup.root.scale.x,
        pickup.size * pickup.root.scale.y,
        pickup.size * pickup.root.scale.z,
      );
      pickup.renderedScaleY = pickup.root.scale.y * pickup.size;

      if (pickup.grounded) {
        pickup.root.rotation.x = 0;
        pickup.root.rotation.z = 0;
        return;
      }

      switch (identity.motion) {
        case "bob":
          pickup.root.position.y += Math.sin(motionTime * 2.2) * motionAmount;
          pickup.root.rotation.y += dt * baseSpin;
          break;
        case "flutter":
          pickup.root.position.y += Math.sin(motionTime * 3.7) * motionAmount * 0.7;
          pickup.root.rotation.z =
            Math.sin(motionTime * 7.2) * motionAmount * 2.3;
          break;
        case "orbit":
          pickup.root.position.y += Math.cos(motionTime * 1.8) * motionAmount * 0.45;
          pickup.root.rotation.x =
            Math.sin(motionTime * 2.1) * motionAmount * 1.8;
          pickup.root.rotation.y += dt * (baseSpin + identity.motionRate * 0.35);
          break;
        case "pulse":
          pickup.root.position.y +=
            (0.35 + Math.sin(motionTime * 3.1) * 0.65) * motionAmount;
          pickup.root.rotation.y += dt * baseSpin;
          pickup.root.rotation.z =
            Math.sin(motionTime * 1.55) * motionAmount * 0.6;
          break;
        case "shimmy":
          pickup.root.position.y += Math.sin(motionTime * 2) * motionAmount * 0.35;
          pickup.root.rotation.z =
            Math.sin(motionTime * 8.5) * motionAmount * 2;
          break;
        case "spin":
          pickup.root.position.y += Math.sin(motionTime * 1.5) * motionAmount * 0.4;
          pickup.root.rotation.y += dt * (0.55 + identity.motionRate * 0.55);
          break;
        case "tumble":
          pickup.root.position.y += Math.abs(Math.sin(motionTime * 1.9)) * motionAmount;
          pickup.root.rotation.x += dt * (0.45 + identity.motionRate * 0.32);
          pickup.root.rotation.y += dt * (0.35 + identity.motionRate * 0.2);
          break;
        case "wobble":
          pickup.root.position.y += Math.sin(motionTime * 2.4) * motionAmount * 0.55;
          pickup.root.rotation.x =
            Math.sin(motionTime * 2.7) * motionAmount * 1.4;
          pickup.root.rotation.z =
            Math.cos(motionTime * 2.1) * motionAmount * 1.8;
          break;
      }
    });
    const silhouetteLod = collectibleLodPool.endFrame();
    silhouetteLodInstances = silhouetteLod.instances;
    silhouetteBadgeInstances = silhouetteLod.badges;
    silhouetteLodDrawCalls = silhouetteLod.drawCalls;
    farPickupMesh.count = farPickupCount;
    farPickupMesh.visible = farPickupCount > 0;
    farPickupMesh.instanceMatrix.needsUpdate = true;
    if (farPickupMesh.instanceColor) {
      farPickupMesh.instanceColor.needsUpdate = true;
    }
    phaseEnd("pickup-lod", pickupLodStartedAt);

    let stickingPieceSettled = false;
    for (let index = stickingPieces.length - 1; index >= 0; index -= 1) {
      const piece = stickingPieces[index];
      const progress = Math.min(1, (now - piece.startedAt) / 280);
      const ease = 1 - (1 - progress) ** 3;
      const pop = 0.9 + ease * 0.1 + Math.sin(progress * Math.PI) * 0.055;
      piece.visual.position.lerpVectors(
        piece.startPosition,
        piece.targetPosition,
        ease,
      );
      piece.visual.scale.copy(piece.targetScale).multiplyScalar(pop);
      if (progress >= 1) {
        piece.visual.position.copy(piece.targetPosition);
        piece.visual.scale.copy(piece.targetScale);
        stickingPieces.splice(index, 1);
        stickingPieceSettled = true;
      }
    }
    if (stickingPieceSettled) collapseRichMashToBudget();

    let popBurstOpacity = 0;
    for (let index = popBursts.length - 1; index >= 0; index -= 1) {
      const burst = popBursts[index];
      const progress = Math.min(1, (now - burst.born) / 360);
      if (progress >= 1) {
        popBursts.splice(index, 1);
        retiredPopBursts.push(burst);
        baseSceneDrawCallsDirty = true;
      }
    }
    popBursts.forEach((burst, index) => {
      const progress = Math.max(0, Math.min(1, (now - burst.born) / 360));
      popBurstDummy.position.copy(burst.position);
      popBurstDummy.position.y += progress * 0.24;
      popBurstDummy.rotation.set(Math.PI / 2, 0, 0);
      popBurstDummy.scale.setScalar(
        burst.radius * (0.35 + progress * 2.4),
      );
      popBurstDummy.updateMatrix();
      popBurstMesh.setMatrixAt(index, popBurstDummy.matrix);
      popBurstMesh.setColorAt(index, burst.color);
      popBurstOpacity = Math.max(popBurstOpacity, (1 - progress) * 0.86);
    });
    popBurstMesh.count = popBursts.length;
    popBurstMesh.visible = popBursts.length > 0;
    popBurstMaterial.opacity = popBurstOpacity;
    popBurstMesh.instanceMatrix.needsUpdate = popBursts.length > 0;
    if (popBurstMesh.instanceColor) {
      popBurstMesh.instanceColor.needsUpdate = popBursts.length > 0;
    }

    const mobileView = isCompactView(width);
    // A learning transition briefly overshoots the rendered ball for delight,
    // but that cosmetic scale must not lengthen the physical chase arm beyond
    // the finite room it is depicting.
    const cameraFramingRadius =
      activeLiteralStage && scaleTransitionStarted >= 0
        ? Math.min(displayedPlayerRadius, game.radius)
        : displayedPlayerRadius;
    desiredCamera.set(
      game.x + game.vx * 0.24 * game.lens,
      floatHeight +
        cameraFramingRadius * (mobileView ? 6.6 : 6.05) * game.lens,
      game.z +
        cameraFramingRadius * (mobileView ? 11.8 : 10.6) * game.lens,
    );
    eraTransitionAge = Math.min(3, eraTransitionAge + dt);
    if (eraTransitionAge < 2.6) {
      const pullback = Math.sin((eraTransitionAge / 2.6) * Math.PI);
      desiredCamera.y += pullback * (mobileView ? 5.2 : 7) * game.lens;
      desiredCamera.z += pullback * (mobileView ? 8 : 11) * game.lens;
    }
    const desiredNear = Math.max(
      0.0005,
      0.06 * Math.min(1, game.lens),
    );
    const desiredFar = Math.max(220, game.lens * 96);
    if (
      Math.abs(camera.near - desiredNear) > 0.0001 ||
      Math.abs(camera.far - desiredFar) > 1
    ) {
      camera.near = desiredNear;
      camera.far = desiredFar;
      camera.updateProjectionMatrix();
    }
    camera.position.lerp(desiredCamera, 1 - Math.pow(0.002, dt));
    if (activeLiteralStage && literalPlayableRegions.length > 0) {
      const playerRegion = literalPlayableRegions.reduce(
        (best, region) => {
          const clearance = Math.min(
            game.x - region.minX,
            region.maxX - game.x,
            game.z - region.minZ,
            region.maxZ - game.z,
          );
          return clearance > best.clearance ? { region, clearance } : best;
        },
        {
          region: literalPlayableRegions[0],
          clearance: Number.NEGATIVE_INFINITY,
        },
      ).region;
      const cameraInset = 0.4;
      camera.position.x = THREE.MathUtils.clamp(
        camera.position.x,
        playerRegion.minX + cameraInset,
        playerRegion.maxX - cameraInset,
      );
      camera.position.z = THREE.MathUtils.clamp(
        camera.position.z,
        playerRegion.minZ + cameraInset,
        playerRegion.maxZ - cameraInset,
      );
    }
    cameraTarget.set(
      game.x,
      literalPlayerSurfaceY +
        (floatHeight - literalPlayerSurfaceY) * 0.82,
      game.z - 0.7,
    );
    camera.lookAt(cameraTarget);

    hudClock += dt;
    if (hudClock > 0.14) {
      const journeyEra = game.era;
      const displayIndex = labEra ?? journeyEra;
      const progress =
        labEra !== null
          ? 0
          : game.progress;
      setHud({
        hours: journeyHoursForEraProgress(journeyEra, game.progress),
        picked: game.picked,
        era: displayIndex,
        journeyEra,
        progress,
        radius: game.radius,
        lens: game.lens,
        zooms: game.zooms,
        cycles: game.cycles,
      });
      hudClock = 0;
    }

    if (labEra === null && now - game.lastSave > 5000) {
      persistSnapshot();
      game.lastSave = now;
    }

    const renderStartedAt = phaseStart();
    renderer.render(scene, camera);
    const accountedDrawCalls =
      baseSceneDrawCalls +
      richPickupDrawCalls +
      silhouetteLodDrawCalls +
      (farPickupCount > 0 ? 1 : 0);
    const observedUnaccountedDrawCalls = Math.max(
      0,
      renderer.info.render.calls - accountedDrawCalls,
    );
    unaccountedDrawCallReserve = Math.min(
      worldPerformanceBudget(qualityTier).maxDrawCalls,
      Math.max(
        unaccountedDrawCallReserve,
        minimumDrawCallPipelineReserve,
        Math.ceil(observedUnaccountedDrawCalls) + 2,
      ),
    );
    phaseEnd("render-submit", renderStartedAt);
    phaseEnd("frame", frameStartedAt);
    frame = requestAnimationFrame(animate);
  };
  frame = requestAnimationFrame(animate);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    window.visualViewport?.removeEventListener("resize", resize);
    renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
    renderer.domElement.removeEventListener(
      "webglcontextrestored",
      onContextRestored,
    );
    if (debugWindow.__QUARKATAMARI_PERFORMANCE__ === performanceDebug) {
      delete debugWindow.__QUARKATAMARI_PERFORMANCE__;
    }
    if (advanceLayerRef.current === playerLayerAdvance) {
      advanceLayerRef.current = null;
    }
    pickups.forEach((pickup) => removePickup(pickup));
    drainDeferredVisualDisposals(deferredVisualDisposals.length);
    clearTransitionRug();
    disposeEnvironment();
    collectibleLodPool.dispose();
    collectibleGeometryLibrary?.dispose();
    collectibleGeometryLibrary = null;
    substrateGroup.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) {
        object.dispose();
      }
      if (object instanceof THREE.Points) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (!object.userData.sharedCollectibleGeometry) {
          object.geometry.dispose();
        }
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      } else if (object instanceof THREE.Sprite) {
        object.material.dispose();
      }
    });
    collectibleMarkers.dispose();
    visualTemplates.forEach((template) => disposeVisual(template.root));
    visualTemplates.clear();
    happyFaceTexture.dispose();
    chompFaceTexture.dispose();
    joyFaceTexture.dispose();
    groundTexture?.dispose();
    literalGroundTexture?.dispose();
    coreSurfaceTexture?.dispose();
    dustGeometry.dispose();
    dustMaterial.dispose();
    grid.geometry.dispose();
    gridMaterials.forEach((material) => material.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  };
  void bootScene()
    .then((cleanup) => {
      if (disposed) cleanup?.();
      else disposeScene = cleanup;
    })
    .catch((error) => {
      if (disposed) return;
      gameRef.current.running = false;
      setToast("The 3D world could not start. Reload to try again.");
      console.error("Quantamari 3D boot failed", error);
    });
  return () => {
    disposed = true;
    disposeScene?.();
  };
}
