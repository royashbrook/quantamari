import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SCIENTIFIC_SETS,
  deriveAchievements,
  summarizeAchievements,
  summarizeCollection,
} from "../../src/lib/collection-progress.ts";

const catalog = [
  {
    id: "small-worlds",
    name: "Small Worlds",
    curios: [
      {
        id: "small-worlds/rubble",
        name: "Rubble pile",
        rarity: "common",
        spawnMode: "repeatable",
      },
      {
        id: "small-worlds/earth",
        name: "Earth",
        rarity: "rare",
        spawnMode: "singleton",
        subjectId: "solar-system/earth",
      },
    ],
  },
  {
    id: "stars",
    name: "Stars",
    curios: [
      {
        id: "stars/starlight",
        name: "Starlight",
        rarity: "common",
        spawnMode: "repeatable",
      },
      {
        id: "stars/sun",
        name: "Sun",
        rarity: "rare",
        spawnMode: "singleton",
        subjectId: "solar-system/sun",
      },
    ],
  },
];

test("catalog summaries left-join missing curios and aggregate duplicate records", () => {
  const summary = summarizeCollection(catalog, [
    {
      eraId: "small-worlds",
      curioId: "small-worlds/earth",
      count: 1,
      firstPick: 20,
      lastPick: 20,
    },
    {
      eraId: "small-worlds",
      curioId: "small-worlds/earth",
      count: 2,
      firstPick: 10,
      lastPick: 30,
    },
    {
      eraId: "stars",
      curioId: "stars/starlight",
      count: 4,
    },
    {
      eraId: "not-an-era",
      curioId: "not-a-curio",
      count: 999,
    },
  ]);

  assert.deepEqual(
    {
      found: summary.found,
      total: summary.total,
      missing: summary.missing,
      completionRatio: summary.completionRatio,
      complete: summary.complete,
    },
    {
      found: 2,
      total: 4,
      missing: 2,
      completionRatio: 0.5,
      complete: false,
    },
  );
  assert.deepEqual(summary.landmarks, {
    found: 1,
    total: 2,
    missing: 1,
    completionRatio: 0.5,
    complete: false,
  });
  assert.equal(summary.eras[0].found, 1);
  assert.equal(summary.eras[0].missing, 1);
  assert.equal(summary.eras[1].found, 1);

  const earth = summary.eras[0].curios[1];
  assert.equal(earth.count, 3);
  assert.equal(earth.firstPick, 10);
  assert.equal(earth.lastPick, 30);
  const missing = summary.eras[0].curios[0];
  assert.equal(missing.count, 0);
  assert.equal(missing.found, false);
});

test("achievement derivation covers landmarks, eras, scientific sets, and cycles", () => {
  const collection = [
    {
      eraId: "small-worlds",
      curioId: "small-worlds/rubble",
      count: 3,
      firstPick: 10,
      lastPick: 12,
    },
    {
      eraId: "small-worlds",
      curioId: "small-worlds/earth",
      count: 1,
      firstPick: 20,
      lastPick: 20,
    },
    {
      eraId: "stars",
      curioId: "stars/starlight",
      count: 9,
      firstPick: 30,
      lastPick: 38,
    },
    {
      eraId: "stars",
      curioId: "stars/sun",
      count: 1,
      firstPick: 40,
      lastPick: 40,
    },
  ];
  const achievements = deriveAchievements({
    catalog,
    collection,
    cycles: 1,
    sets: [
      {
        id: "home-system",
        name: "Home System",
        description: "Find Earth and the Sun.",
        members: [
          { subjectId: "solar-system/earth" },
          { subjectId: "solar-system/sun" },
        ],
      },
    ],
  });
  const byId = new Map(achievements.map((entry) => [entry.id, entry]));

  assert.deepEqual(
    {
      unlocked: byId.get("first-find")?.unlocked,
      unlockedAt: byId.get("first-find")?.unlockedAt,
    },
    { unlocked: true, unlockedAt: 10 },
  );
  assert.equal(byId.get("first-landmark")?.unlockedAt, 20);
  assert.equal(byId.get("all-landmarks")?.unlockedAt, 40);
  assert.equal(byId.get("era-complete:small-worlds")?.unlocked, true);
  assert.equal(byId.get("era-complete:small-worlds")?.unlockedAt, 20);
  assert.equal(byId.get("era-complete:stars")?.unlockedAt, 40);
  assert.deepEqual(
    {
      progress: byId.get("science-set:home-system")?.progress,
      target: byId.get("science-set:home-system")?.target,
      unlocked: byId.get("science-set:home-system")?.unlocked,
      unlockedAt: byId.get("science-set:home-system")?.unlockedAt,
    },
    { progress: 2, target: 2, unlocked: true, unlockedAt: 40 },
  );
  assert.equal(byId.get("catalog-complete")?.unlocked, true);
  assert.equal(byId.get("catalog-complete")?.unlockedAt, 40);
  assert.equal(byId.get("journey-cycle")?.unlocked, true);
  assert.equal(byId.get("catalog-25")?.unlocked, false);
  assert.equal(byId.get("catalog-100")?.unlocked, false);
});

test("catalog milestone timestamps follow the discovery that crossed each target", () => {
  const largeCatalog = [
    {
      id: "many",
      name: "Many Things",
      curios: Array.from({ length: 105 }, (_, index) => ({
        id: `many/item-${index + 1}`,
        name: `Item ${index + 1}`,
        rarity: "common",
        spawnMode: "repeatable",
      })),
    },
  ];
  const collection = largeCatalog[0].curios.map((curio, index) => ({
    eraId: "many",
    curioId: curio.id,
    count: 1,
    firstPick: (index + 1) * 10,
    lastPick: (index + 1) * 10,
  }));
  const byId = new Map(
    deriveAchievements({
      catalog: largeCatalog,
      collection,
      sets: [],
    }).map((entry) => [entry.id, entry]),
  );

  assert.equal(byId.get("catalog-25")?.unlocked, true);
  assert.equal(byId.get("catalog-25")?.unlockedAt, 250);
  assert.equal(byId.get("catalog-100")?.unlocked, true);
  assert.equal(byId.get("catalog-100")?.unlockedAt, 1_000);
  assert.equal(byId.get("catalog-complete")?.unlockedAt, 1_050);
});

test("secret achievements never gate public achievement completion", () => {
  const result = summarizeAchievements([
    {
      id: "public",
      name: "Public",
      description: "Visible achievement",
      category: "collection",
      secret: false,
      unlocked: true,
      progress: 1,
      target: 1,
    },
    {
      id: "secret",
      name: "Secret",
      description: "Hidden achievement",
      category: "science-set",
      secret: true,
      unlocked: false,
      progress: 0,
      target: 1,
    },
  ]);

  assert.deepEqual(result, {
    unlocked: 1,
    total: 1,
    missing: 0,
    complete: true,
    secretUnlocked: 0,
    secretTotal: 1,
  });
});

test("default scientific sets use explicit stable subject identities", () => {
  assert.deepEqual(
    DEFAULT_SCIENTIFIC_SETS.map((set) => set.id),
    ["solar-system-survey", "local-group-trio", "you-are-here"],
  );
  assert.ok(
    DEFAULT_SCIENTIFIC_SETS.every(
      (set) =>
        set.members.length > 0 &&
        set.members.every(
          (member) => Boolean(member.subjectId) !== Boolean(member.curioId),
        ),
    ),
  );
});
