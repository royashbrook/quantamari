import assert from "node:assert/strict";
import test from "node:test";

import {
  ERAS,
  JOURNEY_HOURS,
  eraAt,
  logMetersAt,
} from "../app/scale-data.ts";
import {
  canCollectPickup,
  collectibleIdentityFor,
  growthContribution,
  lowPickupBudget,
  pickupBudget,
  pixelRatioCap,
  qualityTierForFps,
} from "../app/game-rules.ts";

const curios = ERAS.flatMap((era) =>
  era.curios.map((curio) => ({ ...curio, era: era.name })),
);

test("ships the complete sourced scale atlas", () => {
  assert.equal(ERAS.length, 21);
  assert.equal(curios.length, 168);
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
  const identities = curios.map(({ name, shape }) =>
    collectibleIdentityFor(name, shape),
  );
  assert.equal(new Set(identities.map((identity) => identity.id)).size, curios.length);

  for (let index = 0; index < curios.length; index += 1) {
    const curio = curios[index];
    const identity = identities[index];
    assert.deepEqual(
      identity,
      collectibleIdentityFor(curio.name, curio.shape),
    );
    assert.equal(identity.soundRatios.length, 3);
    assert.ok(identity.motionAmount > 0);
  }
});

test("pickup fit follows visible bulk while older scales remain collectible", () => {
  assert.equal(canCollectPickup(7, 7, 1.09, 1), true);
  assert.equal(canCollectPickup(4, 7, 0.7, 1), true);
  assert.equal(canCollectPickup(8, 7, 0.2, 1), false);
  assert.equal(canCollectPickup(7, 7, 1.11, 1), false);
});

test("older scales contribute less growth without disappearing", () => {
  const current = growthContribution(1.2, 0.42, 1, 0);
  const oneEraOld = growthContribution(1.2, 0.42, 1, 1);
  const sixErasOld = growthContribution(1.2, 0.42, 1, 6);
  assert.ok(current.contribution > oneEraOld.contribution);
  assert.ok(oneEraOld.contribution > sixErasOld.contribution);
  assert.ok(sixErasOld.contribution > 0);
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

test("adaptive quality uses hysteresis and meaningful mobile budgets", () => {
  assert.equal(qualityTierForFps(60, "high"), "high");
  assert.equal(qualityTierForFps(40, "high"), "balanced");
  assert.equal(qualityTierForFps(29, "balanced"), "battery");
  assert.equal(qualityTierForFps(45, "battery"), "balanced");

  assert.ok(pickupBudget(1200, "high") > pickupBudget(390, "high"));
  assert.ok(pickupBudget(390, "high") > pickupBudget(390, "battery"));
  assert.equal(
    lowPickupBudget(390, "balanced"),
    Math.floor(pickupBudget(390, "balanced") * 0.84),
  );
  assert.ok(pixelRatioCap(true, "battery") < pixelRatioCap(false, "high"));
});
