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
