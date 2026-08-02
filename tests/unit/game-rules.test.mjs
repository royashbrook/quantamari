import assert from "node:assert/strict";
import test from "node:test";

import {
  ERAS,
  JOURNEY_HOURS,
  eraAt,
  logMetersAt,
} from "../../src/lib/scale-data.ts";
import {
  CORE_RADIUS_MAX,
  CORE_RADIUS_MIN,
  PHYSICAL_SEED_RADIUS,
  canCollectPickup,
  canStartPointerSteering,
  circleAabbClearance,
  collectionProgressGain,
  collectibleIdentityFor,
  deepLensUnlocked,
  mashProxyScale,
  nextLayerAdvance,
  nextLayerObstacleRadius,
  obstacleCenterGap,
  physicalSeedRadiusFor,
  progressAfterPickup,
  radiusForLayerProgress,
  resolveCircleAabbCollision,
  resolveCircularCollision,
  scaleTransitionDuration,
  scaleTransitionFrame,
} from "../../src/lib/game-rules.ts";

const curios = ERAS.flatMap((era) =>
  era.curios.map((curio) => ({ ...curio, era: era.name })),
);

test("ships the complete sourced scale atlas", () => {
  assert.equal(ERAS.length, 34);
  assert.equal(curios.length, 234);
  assert.equal(JOURNEY_HOURS, 500);

  for (const era of ERAS) {
    assert.ok(era.sources.length >= 2, `${era.name} needs two era sources`);
    for (const curio of era.curios) {
      assert.ok(curio.fact.length >= 20, `${era.name}/${curio.name} needs a fact`);
      assert.ok(curio.source, `${era.name}/${curio.name} needs a source`);
      assert.match(curio.source.url, /^https:\/\//);
      assert.match(
        curio.source.organization,
        /^(NIST|CERN|NHGRI|NIGMS|CDC|US EPA|USGS|NASA)$/,
      );
    }
  }
});

test("every collectible has a stable, distinct audiovisual identity", () => {
  const identities = curios.map(({ id, shape }) =>
    collectibleIdentityFor(id, shape),
  );
  assert.equal(new Set(identities.map((identity) => identity.id)).size, curios.length);

  for (let index = 0; index < curios.length; index += 1) {
    const curio = curios[index];
    const identity = identities[index];
    assert.deepEqual(
      identity,
      collectibleIdentityFor(curio.id, curio.shape),
    );
    assert.equal(identity.soundRatios.length, 3);
    assert.ok(identity.motionAmount > 0);
  }
});

test("pickup fit is purely physical instead of secretly gated by era", () => {
  assert.equal(canCollectPickup(7, 7, 1.07, 1), true);
  assert.equal(canCollectPickup(4, 7, 0.7, 1), true);
  assert.equal(canCollectPickup(8, 7, 0.2, 1), true);
  assert.equal(canCollectPickup(7, 7, 1.09, 1), false);
});

test("touch steering never starts through an open modal or interactive UI", () => {
  assert.equal(canStartPointerSteering(true, false, false), true);
  assert.equal(canStartPointerSteering(false, false, false), false);
  assert.equal(canStartPointerSteering(true, true, false), false);
  assert.equal(canStartPointerSteering(true, false, true), false);
});

test("reaching the final authored layer unlocks the deep lens for new and migrated saves", () => {
  assert.equal(deepLensUnlocked(ERAS.length - 2, ERAS.length), false);
  assert.equal(deepLensUnlocked(ERAS.length - 1, ERAS.length), true);
  assert.equal(deepLensUnlocked(ERAS.length, ERAS.length), true);
  assert.equal(deepLensUnlocked(0, 0), false);
  // The deep lens stays unlocked after the journey wraps back to layer 0.
  assert.equal(deepLensUnlocked(0, ERAS.length, 1), true);
  assert.equal(deepLensUnlocked(5, ERAS.length, 3), true);
  assert.equal(deepLensUnlocked(0, ERAS.length, 0), false);
  assert.equal(deepLensUnlocked(0, 0, 1), false);
});

test("the final authored layer folds back to layer 0 as a new cycle", () => {
  assert.deepEqual(nextLayerAdvance(0, ERAS.length), {
    nextIndex: 1,
    wrapped: false,
  });
  assert.deepEqual(nextLayerAdvance(ERAS.length - 2, ERAS.length), {
    nextIndex: ERAS.length - 1,
    wrapped: false,
  });
  assert.deepEqual(nextLayerAdvance(ERAS.length - 1, ERAS.length), {
    nextIndex: 0,
    wrapped: true,
  });
  // Out-of-range indices past the end still wrap home instead of sticking.
  assert.deepEqual(nextLayerAdvance(ERAS.length + 4, ERAS.length), {
    nextIndex: 0,
    wrapped: true,
  });
  assert.deepEqual(nextLayerAdvance(0, 0), { nextIndex: 0, wrapped: false });
});

test("collection drives one bounded logarithmic layer transition", () => {
  assert.equal(radiusForLayerProgress(0), CORE_RADIUS_MIN);
  assert.equal(radiusForLayerProgress(1), CORE_RADIUS_MAX);
  assert.equal(radiusForLayerProgress(-2), CORE_RADIUS_MIN);
  assert.equal(radiusForLayerProgress(3), CORE_RADIUS_MAX);
  const light = collectionProgressGain(1.2, 0.35, 0.3);
  const chunky = collectionProgressGain(1.2, 0.7, 1.2);
  const journey = collectionProgressGain(1.2, 0.7, 1.2, "journey");
  assert.ok(light > 0);
  assert.ok(chunky > light);
  assert.ok(chunky <= 0.095);
  assert.equal(journey, chunky * 0.025);
  assert.equal(progressAfterPickup(0.2, 4, 4, chunky), 0.2 + chunky);
  assert.equal(progressAfterPickup(0.2, 3, 4, chunky), 0.2);
  assert.equal(progressAfterPickup(0.2, 5, 4, chunky), 0.2);
});

test("the physical bootstrap seed stays tiny and independent of progression radius", () => {
  assert.equal(PHYSICAL_SEED_RADIUS, 0.11);
  assert.ok(PHYSICAL_SEED_RADIUS < CORE_RADIUS_MIN * 0.1);
  assert.equal(physicalSeedRadiusFor(CORE_RADIUS_MIN), PHYSICAL_SEED_RADIUS);
  assert.equal(physicalSeedRadiusFor(CORE_RADIUS_MAX), PHYSICAL_SEED_RADIUS);
  assert.equal(
    physicalSeedRadiusFor(Number.POSITIVE_INFINITY),
    PHYSICAL_SEED_RADIUS,
  );
});

test("next-layer obstacles are unmistakable and leave a full rolling corridor", () => {
  const envelope = 1.72;
  const obstacle = nextLayerObstacleRadius(envelope);
  assert.ok(obstacle >= envelope * 1.9);
  assert.ok(
    obstacleCenterGap(obstacle, obstacle, envelope) >
      obstacle * 2 + envelope * 2,
  );
});

test("obstacle response depenetrates and preserves tangent sliding", () => {
  const result = resolveCircularCollision(0.5, 0, -4, 3, 0, 0, 1);
  assert.ok(result.x > 0.99);
  assert.equal(result.vx, 0);
  assert.equal(result.vz, 3);
});

test("grounded scenery depenetrates without killing tangent motion", () => {
  const result = resolveCircleAabbCollision(
    1.4,
    0.5,
    -4,
    3,
    1,
    0,
    0,
    1,
    4,
  );
  assert.ok(result.x > 1.99);
  assert.equal(result.vx, 0);
  assert.equal(result.vz, 3);
  assert.ok(circleAabbClearance(0, 0, 0.5, 0, 0, 1, 1) < 0);
  assert.ok(circleAabbClearance(3, 0, 0.5, 0, 0, 1, 1) > 1);
});

test("learning scale shift lands continuously on the rebased player radius", () => {
  const start = scaleTransitionFrame(0);
  const middle = scaleTransitionFrame(0.5);
  const finish = scaleTransitionFrame(1);
  assert.deepEqual(start, { playerScale: 1, worldScale: 1 });
  assert.ok(middle.playerScale > 1.3);
  assert.ok(middle.worldScale < 0.7);
  assert.ok(finish.worldScale < 0.25);
  assert.ok(middle.playerScale / middle.worldScale > 2);
  assert.ok(
    Math.abs(CORE_RADIUS_MAX * finish.playerScale - CORE_RADIUS_MIN) <
      Number.EPSILON * 10,
  );
  assert.equal(scaleTransitionDuration("journey"), 0);
  assert.equal(scaleTransitionDuration("learning"), 1_800);
});

test("old mash proxies keep shrinking instead of popping at the fabric handoff", () => {
  const rebasedScale =
    0.36 * (CORE_RADIUS_MIN / CORE_RADIUS_MAX) ** 3;
  assert.ok(rebasedScale < 0.07);
  assert.equal(mashProxyScale(rebasedScale), rebasedScale);
  assert.ok(
    mashProxyScale(rebasedScale * (CORE_RADIUS_MIN / CORE_RADIUS_MAX)) <
      mashProxyScale(rebasedScale),
  );
  assert.equal(
    mashProxyScale(1.35),
    1.35,
    "a couch must keep its authored scale when it enters the mash proxy",
  );
});

test("the authored scale increases and infinite play has no scale cap", () => {
  let previous = logMetersAt(0);
  for (let hours = 1; hours <= JOURNEY_HOURS; hours += 1) {
    const current = logMetersAt(hours);
    assert.ok(current >= previous, `scale regressed at hour ${hours}`);
    previous = current;
  }
  assert.equal(eraAt(JOURNEY_HOURS), ERAS.length - 1);
  assert.ok(logMetersAt(JOURNEY_HOURS + 10) > logMetersAt(JOURNEY_HOURS));
  assert.ok(logMetersAt(JOURNEY_HOURS + 10_000) > logMetersAt(JOURNEY_HOURS + 10));
});
