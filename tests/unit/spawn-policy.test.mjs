import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPACT_BLOCKER_CAP,
  COMPACT_SEMANTIC_PICKUP_TARGET,
  NEAR_PICKUP_RADIUS,
  REFILL_MAX_RADIUS,
  pickupPopulationPlan,
  pickupSourceEraForSpawn,
  pickupSpawnPlacement,
} from "../../src/lib/game/spawn-policy.ts";

const ERA_COUNT = 34;
const ACTIVE_ERA = 0;

function compactPopulation(seed = 1234) {
  const plan = pickupPopulationPlan(390, true, ACTIVE_ERA, ERA_COUNT);
  let activeBlockers = 0;
  const pickups = [];

  for (let sequence = 0; sequence < plan.total; sequence += 1) {
    const sourceEra = pickupSourceEraForSpawn({
      sequence,
      activeEra: ACTIVE_ERA,
      eraCount: ERA_COUNT,
      activeBlockers,
      plan,
    });
    const oversized = sourceEra > ACTIVE_ERA;
    if (oversized) activeBlockers += 1;
    const placement = pickupSpawnPlacement({
      seed: seed + sequence * 37,
      sequence,
      phase: "initial",
      oversized,
      playerX: 0,
      playerZ: 0,
      velocityX: 0,
      velocityZ: 0,
      plan,
    });
    pickups.push({ sourceEra, oversized, ...placement });
  }

  return { plan, pickups };
}

test("compact semantic population is deterministic and mostly collectible", () => {
  const first = compactPopulation();
  const second = compactPopulation();
  assert.deepEqual(second, first);
  assert.equal(first.plan.total, COMPACT_SEMANTIC_PICKUP_TARGET);
  assert.equal(first.pickups.length, 96);

  const current = first.pickups.filter(
    (pickup) => pickup.sourceEra === ACTIVE_ERA,
  );
  const blockers = first.pickups.filter((pickup) => pickup.oversized);
  assert.ok(current.length >= 88);
  assert.equal(current.length, first.plan.currentTarget);
  assert.equal(blockers.length, COMPACT_BLOCKER_CAP);
});

test("a fresh compact layer guarantees at least 24 current pickups within 18 units", () => {
  const { pickups, plan } = compactPopulation(818);
  const nearbyCurrent = pickups.filter(
    (pickup) =>
      pickup.sourceEra === ACTIVE_ERA &&
      pickup.radius <= NEAR_PICKUP_RADIUS,
  );

  assert.ok(nearbyCurrent.length >= 24);
  assert.ok(nearbyCurrent.length >= plan.nearCurrentTarget);
  assert.ok(
    pickups
      .filter((pickup) => pickup.oversized)
      .every((pickup) => pickup.radius > NEAR_PICKUP_RADIUS),
  );
});

test("oversized next-era blockers never exceed their independent cap", () => {
  const plan = pickupPopulationPlan(390, true, 12, ERA_COUNT);
  let activeBlockers = 0;
  let maximumBlockers = 0;

  for (let sequence = 0; sequence < 2_000; sequence += 1) {
    const sourceEra = pickupSourceEraForSpawn({
      sequence,
      activeEra: 12,
      eraCount: ERA_COUNT,
      activeBlockers,
      plan,
    });
    if (sourceEra > 12) activeBlockers += 1;
    maximumBlockers = Math.max(maximumBlockers, activeBlockers);
  }

  assert.equal(maximumBlockers, plan.blockerCap);
  assert.equal(maximumBlockers, COMPACT_BLOCKER_CAP);

  const finalPlan = pickupPopulationPlan(
    390,
    true,
    ERA_COUNT - 1,
    ERA_COUNT,
  );
  assert.equal(finalPlan.blockerCap, 0);
  assert.equal(
    pickupSourceEraForSpawn({
      sequence: 999,
      activeEra: ERA_COUNT - 1,
      eraCount: ERA_COUNT,
      activeBlockers: 0,
      plan: finalPlan,
    }),
    ERA_COUNT - 1,
  );
});

test("regular refills are forward-biased and include a center-line lane", () => {
  const plan = pickupPopulationPlan(390, true, 8, ERA_COUNT);
  const placements = Array.from({ length: 96 }, (_, index) =>
    pickupSpawnPlacement({
      seed: 9001 + index * 71,
      sequence: plan.total + index,
      phase: "refill",
      oversized: false,
      playerX: 0,
      playerZ: 0,
      velocityX: 7,
      velocityZ: 0,
      plan,
    }),
  );

  assert.ok(placements.every((placement) => placement.x > 0));
  const meanForward =
    placements.reduce((sum, placement) => sum + placement.x, 0) /
    placements.length;
  const meanLateral =
    placements.reduce(
      (sum, placement) => sum + Math.abs(placement.z),
      0,
    ) / placements.length;
  assert.ok(meanForward > meanLateral * 2);

  const centerLine = placements.filter(
    (placement) =>
      Math.abs(Math.atan2(placement.z, placement.x)) <= 0.11,
  );
  assert.ok(centerLine.length >= 24);

  const northbound = pickupSpawnPlacement({
    seed: 77,
    sequence: plan.total,
    phase: "refill",
    oversized: false,
    playerX: 0,
    playerZ: 0,
    velocityX: 0,
    velocityZ: -5,
    plan,
  });
  assert.ok(northbound.z < 0);
});

test("a normal refill never places the next encounter over four travel seconds away", () => {
  const plan = pickupPopulationPlan(390, true, 2, ERA_COUNT);
  const normalTopSpeed = 9.75;
  const worstReconcileDelaySeconds = 0.5;
  const collisionBloomDelaySeconds = 0.2;
  let maximumTravelSeconds = 0;

  for (let index = 0; index < 512; index += 1) {
    const placement = pickupSpawnPlacement({
      seed: index * 193 + 5,
      sequence: plan.total + index,
      phase: "refill",
      oversized: false,
      playerX: index * 0.5,
      playerZ: -index * 0.25,
      velocityX: 8,
      velocityZ: -2,
      plan,
    });
    maximumTravelSeconds = Math.max(
      maximumTravelSeconds,
      worstReconcileDelaySeconds +
        collisionBloomDelaySeconds +
        placement.radius / normalTopSpeed,
    );
  }

  assert.ok(
    worstReconcileDelaySeconds +
      collisionBloomDelaySeconds +
      REFILL_MAX_RADIUS / normalTopSpeed <
      4,
  );
  assert.ok(maximumTravelSeconds < 4);
});
