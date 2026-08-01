import assert from "node:assert/strict";
import test from "node:test";

import {
  RARE_PITY_SELECTIONS,
  SINGLETON_PITY_SELECTIONS,
  chooseCurioForSpawn,
  isCurioSpawnEligible,
  isSingletonEligible,
  selectCurioForSpawn,
  singletonIdentitiesForCurioIds,
  singletonIdentity,
} from "../../src/lib/game/spawn-policy.ts";

const repeatable = (id, rarity = "common") => ({
  id,
  rarity,
  spawnMode: "repeatable",
});

const singleton = (id, subjectId, rarity = "rare") => ({
  id,
  subjectId,
  rarity,
  spawnMode: "singleton",
});

test("singleton eligibility follows the live, fading, disposed, and collected lifecycle", () => {
  const earth = singleton("planetary-worlds/earth", "solar-system/earth");
  const dust = repeatable("planetary-worlds/rocky-world");

  assert.equal(singletonIdentity(earth), "solar-system/earth");
  assert.equal(isSingletonEligible(earth), true);
  assert.equal(
    isSingletonEligible(earth, [], ["planetary-worlds/earth"]),
    false,
  );
  assert.equal(
    isSingletonEligible(earth, [], ["solar-system/earth"]),
    false,
  );
  assert.equal(
    isSingletonEligible(earth, ["solar-system/earth"], []),
    false,
  );
  assert.equal(
    isSingletonEligible(earth, ["planetary-worlds/earth"], []),
    false,
  );

  // A fading visual stays reserved until disposal, preventing a duplicate
  // overlap. Once disposed, an uncollected landmark becomes eligible again.
  assert.equal(
    isSingletonEligible(earth, [], ["planetary-worlds/earth"]),
    false,
  );
  assert.equal(isSingletonEligible(earth, [], []), true);
  assert.equal(isSingletonEligible(dust), false);
  assert.equal(isCurioSpawnEligible(dust, [dust.id], [dust.id]), true);
});

test("persisted curio IDs translate to canonical singleton subject IDs", () => {
  const curios = [
    singleton("worlds/earth", "solar-system/earth"),
    singleton("worlds/mars", "solar-system/mars"),
    repeatable("worlds/rocky-world"),
  ];
  assert.deepEqual(
    singletonIdentitiesForCurioIds(curios, [
      "worlds/earth",
      "worlds/rocky-world",
      "not-in-catalog",
    ]),
    new Set(["solar-system/earth"]),
  );
});

test("selection is deterministic even when catalog input order changes", () => {
  const curios = [
    repeatable("era/common-a"),
    repeatable("era/uncommon", "uncommon"),
    repeatable("era/common-b"),
    singleton("era/landmark", "landmark/example"),
  ];
  const request = {
    curios,
    seed: 92741,
    sequence: 2,
    pity: { sinceRare: 1, sinceSingleton: 1 },
  };
  const first = selectCurioForSpawn(request);
  const second = selectCurioForSpawn(request);
  const reordered = selectCurioForSpawn({
    ...request,
    curios: [...curios].reverse(),
  });

  assert.deepEqual(second, first);
  assert.equal(reordered?.curio.id, first?.curio.id);
  assert.equal(reordered?.reason, first?.reason);
});

test("bounded singleton pity surfaces every completion-critical curio", () => {
  const curios = [
    repeatable("era/common-a"),
    repeatable("era/common-b"),
    singleton("era/alpha", "subject/alpha", "uncommon"),
    singleton("era/beta", "subject/beta", "common"),
    singleton("era/gamma", "subject/gamma", "rare"),
  ];
  const collected = new Set();
  const singletonSelections = [];

  for (
    let sequence = 0;
    sequence < SINGLETON_PITY_SELECTIONS * 3;
    sequence += 1
  ) {
    const choice = selectCurioForSpawn({
      curios,
      seed: 44,
      sequence,
      collectedCurioIds: collected,
    });
    assert.ok(choice);
    if (choice.curio.spawnMode === "singleton") {
      collected.add(choice.curio.id);
      singletonSelections.push({ id: choice.curio.id, sequence });
    }
  }

  assert.deepEqual(
    new Set(singletonSelections.map(({ id }) => id)),
    new Set(["era/alpha", "era/beta", "era/gamma"]),
  );
  assert.ok(
    singletonSelections.every(
      ({ sequence }, index) =>
        sequence < SINGLETON_PITY_SELECTIONS * (index + 1),
    ),
  );
});

test("rare pity and combined pity cannot be starved by weighted selection", () => {
  const rare = repeatable("era/rare", "rare");
  const rareChoice = selectCurioForSpawn({
    curios: [repeatable("era/common"), rare],
    seed: 1,
    sequence: RARE_PITY_SELECTIONS - 1,
  });
  assert.equal(rareChoice?.curio, rare);
  assert.equal(rareChoice?.reason, "rare-pity");
  assert.equal(rareChoice?.pity.sinceRare, 0);

  const rareLandmark = singleton(
    "era/rare-landmark",
    "subject/rare-landmark",
  );
  const combined = selectCurioForSpawn({
    curios: [repeatable("era/common"), rareLandmark],
    seed: 2,
    sequence: 0,
    pity: {
      sinceRare: RARE_PITY_SELECTIONS - 1,
      sinceSingleton: SINGLETON_PITY_SELECTIONS - 1,
    },
  });
  assert.equal(combined?.curio, rareLandmark);
  assert.equal(combined?.reason, "combined-pity");
});

test("repeatables remain available after landmarks are active or collected", () => {
  const snack = repeatable("era/snack");
  const earth = singleton("era/earth", "solar-system/earth");
  const curios = [snack, earth];

  const activeFallback = selectCurioForSpawn({
    curios,
    seed: 10,
    sequence: SINGLETON_PITY_SELECTIONS - 1,
    activeCurioIds: [earth.id],
  });
  assert.equal(activeFallback?.curio, snack);
  assert.equal(activeFallback?.reason, "repeatable-fallback");

  const collectedFallback = chooseCurioForSpawn({
    curios,
    seed: 11,
    sequence: SINGLETON_PITY_SELECTIONS - 1,
    collectedCurioIds: [earth.id],
  });
  assert.equal(collectedFallback, snack);

  const blocker = chooseCurioForSpawn({
    curios,
    seed: 12,
    sequence: SINGLETON_PITY_SELECTIONS - 1,
    repeatablesOnly: true,
  });
  assert.equal(blocker, snack);
});

test("shared subject identity prevents duplicate named landmarks", () => {
  const firstEarth = singleton("era/earth-a", "solar-system/earth");
  const accidentalSecondEarth = singleton(
    "era/earth-b",
    "solar-system/earth",
  );
  const snack = repeatable("era/snack");

  const choice = chooseCurioForSpawn({
    curios: [snack, firstEarth, accidentalSecondEarth],
    seed: 99,
    sequence: SINGLETON_PITY_SELECTIONS - 1,
    collectedCurioIds: [firstEarth.id],
  });
  assert.equal(choice, snack);
});
