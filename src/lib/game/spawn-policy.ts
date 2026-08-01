export const COMPACT_SEMANTIC_PICKUP_TARGET = 96;
export const DESKTOP_SEMANTIC_PICKUP_TARGET = 128;
export const COMPACT_NEAR_PICKUP_TARGET = 28;
export const DESKTOP_NEAR_PICKUP_TARGET = 36;
export const COMPACT_BLOCKER_CAP = 4;
export const DESKTOP_BLOCKER_CAP = 5;
export const NEAR_PICKUP_RADIUS = 18;
export const REFILL_MIN_RADIUS = 24;
export const REFILL_MAX_RADIUS = 30;

export type PickupPopulationPlan = Readonly<{
  total: number;
  currentTarget: number;
  blockerCap: number;
  nearCurrentTarget: number;
}>;

export type PickupSpawnPhase = "initial" | "refill";

type PickupSourceRequest = Readonly<{
  sequence: number;
  activeEra: number;
  eraCount: number;
  activeBlockers: number;
  plan: PickupPopulationPlan;
}>;

type PickupPlacementRequest = Readonly<{
  seed: number;
  sequence: number;
  attempt?: number;
  phase: PickupSpawnPhase;
  oversized: boolean;
  playerX: number;
  playerZ: number;
  velocityX: number;
  velocityZ: number;
  plan: PickupPopulationPlan;
}>;

export type PickupSpawnPlacement = Readonly<{
  x: number;
  z: number;
  radius: number;
  angle: number;
}>;

const count = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

function unit(seed: number, salt: number) {
  let value = (Math.trunc(seed) + Math.imul(salt, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

/**
 * Logical pickup population is deliberately independent of render quality.
 * Quality tiers may change how these pickups are represented, but never how
 * many encounters the player receives.
 */
export function pickupPopulationPlan(
  viewportWidth: number,
  compactDevice: boolean,
  activeEra: number,
  eraCount: number,
): PickupPopulationPlan {
  const compact = compactDevice || viewportWidth <= 860;
  const total = compact
    ? COMPACT_SEMANTIC_PICKUP_TARGET
    : DESKTOP_SEMANTIC_PICKUP_TARGET;
  const hasNextEra = count(activeEra) < count(eraCount) - 1;
  const blockerCap = hasNextEra
    ? compact
      ? COMPACT_BLOCKER_CAP
      : DESKTOP_BLOCKER_CAP
    : 0;
  const nearCurrentTarget = compact
    ? COMPACT_NEAR_PICKUP_TARGET
    : DESKTOP_NEAR_PICKUP_TARGET;
  return {
    total,
    currentTarget: total - blockerCap,
    blockerCap,
    nearCurrentTarget,
  };
}

/**
 * Oversized next-era objects occupy their own sparse deterministic slots.
 * The protected opening slots are all collectible, so a fresh layer cannot
 * surround the player with blockers before it establishes nearby snacks.
 */
export function pickupSourceEraForSpawn({
  sequence,
  activeEra,
  eraCount,
  activeBlockers,
  plan,
}: PickupSourceRequest) {
  const safeActiveEra = Math.max(
    0,
    Math.min(Math.max(0, count(eraCount) - 1), count(activeEra)),
  );
  if (
    safeActiveEra >= count(eraCount) - 1 ||
    count(activeBlockers) >= plan.blockerCap ||
    count(sequence) < plan.nearCurrentTarget
  ) {
    return safeActiveEra;
  }

  const blockerSlots = Math.max(
    1,
    plan.total - plan.nearCurrentTarget,
  );
  const cadence = Math.max(
    1,
    Math.floor(blockerSlots / Math.max(1, plan.blockerCap)),
  );
  const eligibleSequence = count(sequence) - plan.nearCurrentTarget;
  const isBlockerSlot = eligibleSequence % cadence === cadence - 1;
  return isBlockerSlot ? safeActiveEra + 1 : safeActiveEra;
}

/**
 * Initial pickups form a dense local field. Replacements arrive in a shallow
 * fan just beyond the normal view, biased toward travel direction. Every
 * fourth regular refill hugs the center line so straight-ahead play always
 * has a reachable next encounter. Oversized blockers stay farther out and
 * off that center line.
 */
export function pickupSpawnPlacement({
  seed,
  sequence,
  attempt = 0,
  phase,
  oversized,
  playerX,
  playerZ,
  velocityX,
  velocityZ,
  plan,
}: PickupPlacementRequest): PickupSpawnPlacement {
  const safeSequence = count(sequence);
  const safeAttempt = count(attempt);
  const randomRadius = unit(seed, 101 + safeAttempt * 17);
  const randomAngle = unit(seed, 211 + safeAttempt * 29);
  let radius: number;
  let angle: number;

  if (phase === "initial") {
    if (oversized) {
      radius = 34 + randomRadius * 12;
      angle = randomAngle * Math.PI * 2;
    } else if (safeSequence < plan.nearCurrentTarget) {
      const nearOrdinal =
        safeSequence + safeAttempt * plan.nearCurrentTarget;
      const ring = nearOrdinal % 7;
      radius = 5.2 + ring * 1.72 + randomRadius * 0.42;
      angle =
        nearOrdinal * Math.PI * (3 - Math.sqrt(5)) +
        (randomAngle - 0.5) * 0.16;
    } else {
      radius = 12 + randomRadius * 16;
      angle = randomAngle * Math.PI * 2;
    }
  } else {
    const speed = Math.hypot(velocityX, velocityZ);
    const hasHeading = speed > 0.05;
    const heading = hasHeading
      ? Math.atan2(velocityZ, velocityX)
      : randomAngle * Math.PI * 2;

    if (oversized) {
      radius = 36 + randomRadius * 10;
      const side = unit(seed, 307 + safeAttempt * 11) < 0.5 ? -1 : 1;
      angle = heading + side * (1.08 + randomAngle * 0.42);
    } else {
      radius =
        REFILL_MIN_RADIUS +
        randomRadius * (REFILL_MAX_RADIUS - REFILL_MIN_RADIUS);
      const centered = safeSequence % 4 === 0 && safeAttempt === 0;
      const spread = centered ? 0.1 : 0.72;
      angle = heading + (randomAngle - 0.5) * spread * 2;
    }
  }

  return {
    x: playerX + Math.cos(angle) * radius,
    z: playerZ + Math.sin(angle) * radius,
    radius,
    angle,
  };
}

export type CollectibleRarity = "common" | "uncommon" | "rare";
export type CollectibleSpawnMode = "repeatable" | "singleton";

/**
 * The small structural contract used by curio selection. Keeping this module
 * independent from the full visual catalog makes the policy easy to test and
 * reuse for both live pickups and future background population systems.
 */
export type SpawnPolicyCurio = Readonly<{
  id: string;
  rarity: CollectibleRarity;
  spawnMode: CollectibleSpawnMode;
  subjectId?: string;
}>;

export type SpawnPityState = Readonly<{
  /** Consecutive selected curios that were not rare. */
  sinceRare: number;
  /** Consecutive selected curios that were not singletons. */
  sinceSingleton: number;
}>;

export type CurioSelectionReason =
  | "weighted"
  | "rare-pity"
  | "singleton-pity"
  | "combined-pity"
  | "repeatable-fallback";

export type CurioSelection<TCurio extends SpawnPolicyCurio> = Readonly<{
  curio: TCurio;
  reason: CurioSelectionReason;
  pity: SpawnPityState;
}>;

export type CurioSelectionRequest<TCurio extends SpawnPolicyCurio> = Readonly<{
  curios: readonly TCurio[];
  seed: number;
  sequence: number;
  pity?: Partial<SpawnPityState>;
  /**
   * May contain curio IDs, subject IDs, or both. `subjectId` is the canonical
   * singleton identity, while accepting curio IDs keeps save integration tiny.
   */
  collectedSingletonIds?: ReadonlySet<string> | readonly string[];
  /** Alias for passing persisted collection curio IDs directly. */
  collectedCurioIds?: ReadonlySet<string> | readonly string[];
  /** Curio IDs or subject IDs for singleton instances currently in the world. */
  activeSingletonIds?: ReadonlySet<string> | readonly string[];
  /** Alias for passing active pickup curio IDs directly. */
  activeCurioIds?: ReadonlySet<string> | readonly string[];
  /** Next-era blockers and periodic substrate repeats must not use landmarks. */
  repeatablesOnly?: boolean;
}>;

/** The sixth eligible selection is guaranteed to be a singleton when one exists. */
export const SINGLETON_PITY_SELECTIONS = 6;
/** The tenth eligible selection is guaranteed to be rare when one exists. */
export const RARE_PITY_SELECTIONS = 10;

export const INITIAL_SPAWN_PITY: SpawnPityState = Object.freeze({
  sinceRare: 0,
  sinceSingleton: 0,
});

const RARITY_WEIGHT: Readonly<Record<CollectibleRarity, number>> =
  Object.freeze({
    common: 12,
    uncommon: 5,
    rare: 2,
  });

const safeCounter = (value: number | undefined) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;

const identitySet = (
  values: ReadonlySet<string> | readonly string[] | undefined,
) => new Set(values ?? []);

function expandedSingletonIdentitySet(
  curios: readonly SpawnPolicyCurio[],
  ...sources: (
    | ReadonlySet<string>
    | readonly string[]
    | undefined
  )[]
) {
  const identities = new Set(sources.flatMap((source) => [...(source ?? [])]));
  for (const curio of curios) {
    if (curio.spawnMode === "singleton" && identities.has(curio.id)) {
      identities.add(singletonIdentity(curio));
    }
  }
  return identities;
}

/**
 * Named scientific subjects use a catalog-wide identity so an accidental
 * duplicate catalog entry cannot create two Earths. A curio ID remains a safe
 * fallback for singleton content that has not opted into a subject ID.
 */
export function singletonIdentity(curio: SpawnPolicyCurio) {
  return curio.subjectId ?? curio.id;
}

function identityIsPresent(
  curio: SpawnPolicyCurio,
  identities: ReadonlySet<string>,
) {
  return identities.has(curio.id) || identities.has(singletonIdentity(curio));
}

/**
 * A singleton is eligible until it is either collected or represented by a
 * live world object. Removing an uncollected object from the active set makes
 * it eligible again, so despawning can never permanently lose a landmark.
 */
export function isSingletonEligible(
  curio: SpawnPolicyCurio,
  collectedSingletonIds: ReadonlySet<string> | readonly string[] = [],
  activeSingletonIds: ReadonlySet<string> | readonly string[] = [],
) {
  if (curio.spawnMode !== "singleton") return false;
  const collected = identitySet(collectedSingletonIds);
  const active = identitySet(activeSingletonIds);
  return (
    !identityIsPresent(curio, collected) &&
    !identityIsPresent(curio, active)
  );
}

export function isCurioSpawnEligible(
  curio: SpawnPolicyCurio,
  collectedSingletonIds: ReadonlySet<string> | readonly string[] = [],
  activeSingletonIds: ReadonlySet<string> | readonly string[] = [],
) {
  return (
    curio.spawnMode === "repeatable" ||
    isSingletonEligible(
      curio,
      collectedSingletonIds,
      activeSingletonIds,
    )
  );
}

/**
 * Translate the curio IDs stored in collection records into canonical subject
 * identities. The result can be passed back to `selectCurioForSpawn`.
 */
export function singletonIdentitiesForCurioIds(
  curios: readonly SpawnPolicyCurio[],
  collectedCurioIds: Iterable<string>,
) {
  const collected = new Set(collectedCurioIds);
  return new Set(
    curios
      .filter(
        (curio) =>
          curio.spawnMode === "singleton" && collected.has(curio.id),
      )
      .map(singletonIdentity),
  );
}

function hashText(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function deterministicTicket(
  seed: number,
  sequence: number,
  candidates: readonly SpawnPolicyCurio[],
) {
  const candidateSalt = candidates.reduce(
    (hash, curio) => Math.imul(hash ^ hashText(curio.id), 0x01000193),
    0x811c9dc5,
  );
  return unit(
    Math.trunc(seed) ^ candidateSalt,
    401 + safeCounter(sequence) * 17,
  );
}

function weightedCurio<TCurio extends SpawnPolicyCurio>(
  candidates: readonly TCurio[],
  seed: number,
  sequence: number,
) {
  const ordered = [...candidates].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const weights = ordered.map(
    (curio) =>
      RARITY_WEIGHT[curio.rarity] *
      (curio.spawnMode === "singleton" ? 3 : 1),
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let ticket = deterministicTicket(seed, sequence, ordered) * totalWeight;

  for (let index = 0; index < ordered.length; index += 1) {
    ticket -= weights[index];
    if (ticket < 0) return ordered[index];
  }
  return ordered.at(-1)!;
}

/**
 * Deterministically choose an eligible curio. Ordinary selections retain a
 * rarity-weighted mix; bounded pity slots guarantee that rare content and
 * completion-critical singleton landmarks cannot be starved by random luck.
 * If both pity clocks expire without an overlapping candidate, singleton
 * completion wins this slot and rare pity remains due for the following slot.
 */
export function selectCurioForSpawn<TCurio extends SpawnPolicyCurio>({
  curios,
  seed,
  sequence,
  pity,
  collectedSingletonIds = [],
  collectedCurioIds = [],
  activeSingletonIds = [],
  activeCurioIds = [],
  repeatablesOnly = false,
}: CurioSelectionRequest<TCurio>): CurioSelection<TCurio> | null {
  const safeSequence = safeCounter(sequence);
  const effectivePity: SpawnPityState = {
    sinceRare:
      pity?.sinceRare === undefined
        ? safeSequence % RARE_PITY_SELECTIONS
        : safeCounter(pity.sinceRare),
    sinceSingleton:
      pity?.sinceSingleton === undefined
        ? safeSequence % SINGLETON_PITY_SELECTIONS
        : safeCounter(pity.sinceSingleton),
  };
  const collected = expandedSingletonIdentitySet(
    curios,
    collectedSingletonIds,
    collectedCurioIds,
  );
  const active = expandedSingletonIdentitySet(
    curios,
    activeSingletonIds,
    activeCurioIds,
  );
  const eligible = curios.filter(
    (curio) =>
      (!repeatablesOnly || curio.spawnMode === "repeatable") &&
      isCurioSpawnEligible(curio, collected, active),
  );
  if (eligible.length === 0) return null;

  const singletons = eligible.filter(
    (curio) => curio.spawnMode === "singleton",
  );
  const rares = eligible.filter((curio) => curio.rarity === "rare");
  const dueSingleton =
    singletons.length > 0 &&
    effectivePity.sinceSingleton >= SINGLETON_PITY_SELECTIONS - 1;
  const dueRare =
    rares.length > 0 &&
    effectivePity.sinceRare >= RARE_PITY_SELECTIONS - 1;

  let pool = eligible;
  let reason: CurioSelectionReason =
    singletons.length === 0 ? "repeatable-fallback" : "weighted";

  if (dueSingleton && dueRare) {
    const combined = singletons.filter((curio) => curio.rarity === "rare");
    if (combined.length > 0) {
      pool = combined;
      reason = "combined-pity";
    } else {
      pool = singletons;
      reason = "singleton-pity";
    }
  } else if (dueSingleton) {
    pool = singletons;
    reason = "singleton-pity";
  } else if (dueRare) {
    pool = rares;
    reason = "rare-pity";
  }

  const curio = weightedCurio(pool, seed, sequence);
  const pickedSingleton = curio.spawnMode === "singleton";
  const pickedRare = curio.rarity === "rare";

  return {
    curio,
    reason,
    pity: {
      sinceRare: pickedRare ? 0 : effectivePity.sinceRare + 1,
      sinceSingleton: pickedSingleton
        ? 0
        : effectivePity.sinceSingleton + 1,
    },
  };
}

/** Convenience wrapper for runtime callers that only need the selected curio. */
export function chooseCurioForSpawn<TCurio extends SpawnPolicyCurio>(
  request: CurioSelectionRequest<TCurio>,
) {
  return selectCurioForSpawn(request)?.curio ?? null;
}
