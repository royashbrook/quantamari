export type QualityTier = "high" | "balanced" | "battery";
export type GameMode = "journey" | "learning";

export type PickupMotion =
  | "bob"
  | "flutter"
  | "orbit"
  | "pulse"
  | "shimmy"
  | "spin"
  | "tumble"
  | "wobble";

export type SoundWave = "sine" | "square" | "sawtooth" | "triangle";

export const CORE_RADIUS_MIN = 1.12;
export const CORE_RADIUS_MAX = 2.28;
/**
 * Tiny physical/rendered core that bootstraps an otherwise empty aggregate.
 * `game.radius` remains the semantic progression radius used for collection
 * eligibility, spawn scale, and camera framing; it must not inflate this seed.
 */
export const PHYSICAL_SEED_RADIUS = 0.11;
export const BASELINE_ROLL_ENVELOPE_FACTOR = 1.72;
export const NEXT_LAYER_OBSTACLE_FACTOR = 1.9;
export const LEARNING_SCALE_TRANSITION_MS = 1_800;

export type CollectibleIdentity = {
  id: string;
  seed: number;
  visualVariant: number;
  detailVariant: number;
  motion: PickupMotion;
  motionRate: number;
  motionAmount: number;
  soundRatios: [number, number, number];
  soundWave: SoundWave;
  soundBrightness: number;
  soundRhythm: number;
  soundNoise: number;
};

const MOTIONS: PickupMotion[] = [
  "bob",
  "flutter",
  "orbit",
  "pulse",
  "shimmy",
  "spin",
  "tumble",
  "wobble",
];

const WAVES: SoundWave[] = ["sine", "triangle", "square", "sawtooth"];

export function stableNameSeed(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function unit(seed: number, salt: number) {
  let value = (seed + Math.imul(salt, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

/**
 * Every named collectible receives a deterministic visual motion and a
 * three-note generative sound signature. The identity is stable across saves,
 * devices, and releases as long as the collectible stable ID and shape stay stable.
 */
export function collectibleIdentityFor(stableId: string, shape: string): CollectibleIdentity {
  const seed = stableNameSeed(`${shape}:${stableId}`);
  const fifth = 1.45 + unit(seed, 5) * 0.18;
  const colorTone = 1.12 + unit(seed, 7) * 0.32;
  const octave = unit(seed, 11) > 0.72 ? 2 : 1;
  return {
    id: `${shape}-${seed.toString(36)}`,
    seed,
    visualVariant: seed % 8,
    detailVariant: Math.floor(seed / 8) % 12,
    motion: MOTIONS[Math.floor(unit(seed, 13) * MOTIONS.length)],
    motionRate: 0.62 + unit(seed, 17) * 1.7,
    motionAmount: 0.035 + unit(seed, 19) * 0.085,
    soundRatios: [1, colorTone, fifth * octave],
    soundWave: WAVES[Math.floor(unit(seed, 23) * WAVES.length)],
    soundBrightness: 0.55 + unit(seed, 29) * 0.45,
    soundRhythm: 0.012 + unit(seed, 31) * 0.045,
    soundNoise: unit(seed, 37) * 0.7,
  };
}

export function canCollectPickup(
  _sourceEra: number,
  _activeEra: number,
  pickupBulkRadius: number,
  rollingRadius: number,
) {
  return pickupBulkRadius <= rollingRadius * 1.08;
}

export function canStartPointerSteering(
  started: boolean,
  modalOpen: boolean,
  insideInteractiveUi: boolean,
) {
  return started && !modalOpen && !insideInteractiveUi;
}

export function deepLensUnlocked(
  activeLayer: number,
  layerCount: number,
  completedCycles = 0,
) {
  return (
    layerCount > 0 &&
    (completedCycles > 0 || activeLayer >= layerCount - 1)
  );
}

/**
 * Completing the final authored layer folds the journey back to layer 0 as a
 * new cycle: the Metaversal Beyond and the Theory Playground are both
 * SPECULATIVE-realm bookends, so the wrap is a narrative loop, not a claim
 * that the universe is literally a quantum foam bubble.
 */
export function nextLayerAdvance(currentLayer: number, layerCount: number) {
  if (layerCount <= 0) return { nextIndex: 0, wrapped: false };
  const wrapped = currentLayer >= layerCount - 1;
  return {
    nextIndex: wrapped ? 0 : Math.min(layerCount - 1, currentLayer + 1),
    wrapped,
  };
}

export function radiusForLayerProgress(progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  return Math.cbrt(
    CORE_RADIUS_MIN ** 3 +
      (CORE_RADIUS_MAX ** 3 - CORE_RADIUS_MIN ** 3) * t,
  );
}

/** Fixed by design: aggregate growth comes from attached objects, not this seed. */
export function physicalSeedRadiusFor(_progressionRadius: number) {
  return PHYSICAL_SEED_RADIUS;
}

export function collectionProgressGain(
  rollingRadius: number,
  pickupBulkRadius: number,
  gameplayBulkFactor: number,
  mode: GameMode = "learning",
) {
  const relativeBulk = pickupBulkRadius / Math.max(0.001, rollingRadius);
  const learningGain = Math.max(
    0.022,
    Math.min(0.095, relativeBulk ** 2 * gameplayBulkFactor * 0.15),
  );
  return learningGain * (mode === "journey" ? 0.025 : 1);
}

export function progressAfterPickup(
  progress: number,
  sourceEra: number,
  activeEra: number,
  gain: number,
) {
  const current = Math.max(0, Math.min(1, progress));
  if (sourceEra !== activeEra) return current;
  return Math.max(0, Math.min(1, current + Math.max(0, gain)));
}

export function nextLayerObstacleRadius(rollingEnvelope: number) {
  return rollingEnvelope * NEXT_LAYER_OBSTACLE_FACTOR;
}

export function obstacleCenterGap(
  firstRadius: number,
  secondRadius: number,
  rollingEnvelope: number,
) {
  return (
    firstRadius +
    secondRadius +
    rollingEnvelope * 2 +
    Math.max(0.8, rollingEnvelope * 0.24)
  );
}

export function resolveCircularCollision(
  playerX: number,
  playerZ: number,
  velocityX: number,
  velocityZ: number,
  obstacleX: number,
  obstacleZ: number,
  combinedRadius: number,
) {
  const dx = playerX - obstacleX;
  const dz = playerZ - obstacleZ;
  const distance = Math.hypot(dx, dz);
  const normalX = distance > 0.0001 ? dx / distance : 1;
  const normalZ = distance > 0.0001 ? dz / distance : 0;
  const overlap = Math.max(0, combinedRadius - distance + 0.002);
  const normalVelocity = velocityX * normalX + velocityZ * normalZ;
  return {
    x: playerX + normalX * overlap,
    z: playerZ + normalZ * overlap,
    vx:
      normalVelocity < 0
        ? velocityX - normalVelocity * normalX
        : velocityX,
    vz:
      normalVelocity < 0
        ? velocityZ - normalVelocity * normalZ
        : velocityZ,
  };
}

export function resolveCircleAabbCollision(
  playerX: number,
  playerZ: number,
  velocityX: number,
  velocityZ: number,
  radius: number,
  boxX: number,
  boxZ: number,
  halfWidth: number,
  halfDepth: number,
) {
  const nearestX = Math.max(
    boxX - halfWidth,
    Math.min(playerX, boxX + halfWidth),
  );
  const nearestZ = Math.max(
    boxZ - halfDepth,
    Math.min(playerZ, boxZ + halfDepth),
  );
  const dx = playerX - nearestX;
  const dz = playerZ - nearestZ;
  const distance = Math.hypot(dx, dz);
  if (distance >= radius) {
    return { x: playerX, z: playerZ, vx: velocityX, vz: velocityZ };
  }

  if (distance > 0.0001) {
    const normalX = dx / distance;
    const normalZ = dz / distance;
    const overlap = radius - distance + 0.002;
    const normalVelocity = velocityX * normalX + velocityZ * normalZ;
    return {
      x: playerX + normalX * overlap,
      z: playerZ + normalZ * overlap,
      vx:
        normalVelocity < 0
          ? velocityX - normalVelocity * normalX
          : velocityX,
      vz:
        normalVelocity < 0
          ? velocityZ - normalVelocity * normalZ
          : velocityZ,
    };
  }

  const exits = [
    {
      distance: playerX - (boxX - halfWidth - radius),
      x: boxX - halfWidth - radius - 0.002,
      z: playerZ,
      nx: -1,
      nz: 0,
    },
    {
      distance: boxX + halfWidth + radius - playerX,
      x: boxX + halfWidth + radius + 0.002,
      z: playerZ,
      nx: 1,
      nz: 0,
    },
    {
      distance: playerZ - (boxZ - halfDepth - radius),
      x: playerX,
      z: boxZ - halfDepth - radius - 0.002,
      nx: 0,
      nz: -1,
    },
    {
      distance: boxZ + halfDepth + radius - playerZ,
      x: playerX,
      z: boxZ + halfDepth + radius + 0.002,
      nx: 0,
      nz: 1,
    },
  ].sort((a, b) => a.distance - b.distance);
  const exit = exits[0];
  const normalVelocity = velocityX * exit.nx + velocityZ * exit.nz;
  return {
    x: exit.x,
    z: exit.z,
    vx:
      normalVelocity < 0
        ? velocityX - normalVelocity * exit.nx
        : velocityX,
    vz:
      normalVelocity < 0
        ? velocityZ - normalVelocity * exit.nz
        : velocityZ,
  };
}

export function circleAabbClearance(
  circleX: number,
  circleZ: number,
  radius: number,
  boxX: number,
  boxZ: number,
  halfWidth: number,
  halfDepth: number,
) {
  const nearestX = Math.max(
    boxX - halfWidth,
    Math.min(circleX, boxX + halfWidth),
  );
  const nearestZ = Math.max(
    boxZ - halfDepth,
    Math.min(circleZ, boxZ + halfDepth),
  );
  return Math.hypot(circleX - nearestX, circleZ - nearestZ) - radius;
}

export function scaleTransitionFrame(progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  const eased = t * t * (3 - 2 * t);
  const rebaseScale = CORE_RADIUS_MIN / CORE_RADIUS_MAX;
  return {
    playerScale:
      1 -
      (1 - rebaseScale) * eased +
      Math.sin(t * Math.PI) * 0.64,
    worldScale: 1 - eased * 0.78,
  };
}

export function scaleTransitionDuration(mode: GameMode) {
  return mode === "learning" ? LEARNING_SCALE_TRANSITION_MS : 0;
}

export function mashProxyScale(authoredScale: number) {
  // A mash LOD is a cheaper rendering of the same collected object, not a
  // smaller replacement. Clamping here made couches, trees, and houses pop
  // down to generic crumbs as soon as they entered the batched proxy.
  return Math.max(0.001, Math.abs(authoredScale));
}
