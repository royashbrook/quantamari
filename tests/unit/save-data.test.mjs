import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_V2_HOUR_STOPS,
  LEGACY_V3_ERA_NAMES,
  SAVE_KEYS,
  aggregatePickups,
  createSaveData,
  loadSaveCandidates,
  recordPickup,
  serializeSaveData,
} from "../../src/lib/save-data.ts";

const catalog = [
  {
    id: "theory-playground",
    name: "Theory Playground",
    curios: [{ id: "foam" }],
  },
  {
    id: "nuclear-heart",
    name: "Nuclear Heart",
    curios: [{ id: "nucleus" }],
  },
  {
    id: "atomic-cloud",
    name: "Atomic Cloud",
    curios: [{ id: "hydrogen" }, { id: "helium" }],
  },
  {
    id: "vehicle-yard",
    name: "Vehicle Yard",
    curios: [{ id: "bicycle" }],
  },
  {
    id: "planetary-pantry",
    name: "Planetary Pantry",
    curios: [
      { id: "earth", spawnMode: "singleton" },
      { id: "rocky-world", spawnMode: "repeatable" },
    ],
  },
];

const mash = (overrides = {}) => ({
  eraId: "atomic-cloud",
  curioId: "hydrogen",
  position: [1, 2, 3],
  rotation: [0, 0.25, 0],
  scale: [1, 1, 1],
  mergedInside: false,
  ...overrides,
});

test("v4 loading keeps valid records while dropping malformed records", () => {
  const raw = JSON.stringify({
    version: 4,
    mode: "journey",
    eraId: "atomic-cloud",
    progress: 3,
    picked: 9,
    unitemizedPicked: 2,
    x: 12,
    z: -4,
    zooms: 3,
    sound: false,
    mash: [
      mash(),
      mash({ scale: [0, 1, 1] }),
      mash({ curioId: "not-in-the-atlas" }),
    ],
    collection: [
      {
        eraId: "atomic-cloud",
        curioId: "hydrogen",
        count: 2,
        firstPick: 10,
        lastPick: 20,
      },
      {
        eraId: "atomic-cloud",
        curioId: "hydrogen",
        count: 3,
        firstPick: 5,
        lastPick: 30,
      },
      {
        eraId: "atomic-cloud",
        curioId: "missing",
        count: 100,
        firstPick: 1,
        lastPick: 2,
      },
    ],
  });

  const loaded = loadSaveCandidates({ v4: raw }, catalog);
  assert.equal(loaded?.sourceVersion, 4);
  assert.equal(loaded?.save.mode, "journey");
  assert.equal(loaded?.save.progress, 1);
  assert.equal(loaded?.save.mash.length, 1);
  assert.deepEqual(loaded?.save.collection, [
    {
      eraId: "atomic-cloud",
      curioId: "hydrogen",
      count: 5,
      firstPick: 5,
      lastPick: 30,
    },
  ]);
  assert.equal(loaded?.save.unitemizedPicked, 4);
  assert.equal(loaded?.save.picked, 9);
  assert.equal(loaded?.save.sound, false);
  // Pre-v3.0 saves carry no cycles field and default to cycle 0.
  assert.equal(loaded?.save.cycles, 0);
});

test("completed journey cycles survive a save round trip and legacy saves default to zero", () => {
  const snapshot = {
    mode: "journey",
    eraId: "theory-playground",
    progress: 0.5,
    picked: 700,
    unitemizedPicked: 0,
    x: 3,
    z: 4,
    zooms: 40,
    cycles: 2,
    sound: true,
    mash: [],
    collection: [],
  };
  const raw = serializeSaveData(createSaveData(snapshot));
  const loaded = loadSaveCandidates({ v4: raw }, catalog);
  assert.equal(loaded?.save.cycles, 2);

  const negative = loadSaveCandidates(
    { v4: JSON.stringify({ ...JSON.parse(raw), cycles: -3 }) },
    catalog,
  );
  assert.equal(negative?.save.cycles, 0);
});

test("v4 migration collapses newly one-of-one collection and mash records", () => {
  const earthMash = mash({
    eraId: "planetary-pantry",
    curioId: "earth",
  });
  const raw = JSON.stringify({
    version: 4,
    mode: "journey",
    eraId: "planetary-pantry",
    progress: 0.8,
    picked: 7,
    unitemizedPicked: 0,
    x: 0,
    z: 0,
    zooms: 0,
    sound: false,
    mash: [earthMash, { ...earthMash, position: [4, 5, 6] }],
    collection: [
      {
        eraId: "planetary-pantry",
        curioId: "earth",
        count: 3,
        firstPick: 10,
        lastPick: 20,
      },
      {
        eraId: "planetary-pantry",
        curioId: "earth",
        count: 4,
        firstPick: 5,
        lastPick: 30,
      },
    ],
  });

  const loaded = loadSaveCandidates({ v4: raw }, catalog);
  assert.equal(loaded?.save.mash.length, 1);
  assert.deepEqual(loaded?.save.mash[0].position, [4, 5, 6]);
  assert.deepEqual(loaded?.save.collection, [
    {
      eraId: "planetary-pantry",
      curioId: "earth",
      count: 1,
      firstPick: 5,
      lastPick: 30,
    },
  ]);
  assert.equal(loaded?.save.picked, 7);
  assert.equal(loaded?.save.unitemizedPicked, 6);
});

test("a corrupt v4 falls back to v3 and maps numeric eras through the frozen atlas", () => {
  const oldMash = {
    sourceEra: 4,
    curioIndex: 0,
    position: [1, 2, 3],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    mergedInside: false,
  };
  const loaded = loadSaveCandidates(
    {
      v4: '{"version":4,"eraId":null}',
      v3: JSON.stringify({
        version: 3,
        era: 4,
        progress: 0.4,
        picked: 7,
        x: 3,
        z: 5,
        zooms: 2,
        sound: true,
        mash: [
          oldMash,
          { ...oldMash },
          { ...oldMash, curioIndex: 99 },
          { ...oldMash, position: ["broken", 2, 3] },
        ],
      }),
    },
    catalog,
  );

  assert.equal(LEGACY_V3_ERA_NAMES[4], "Atomic Cloud");
  assert.equal(loaded?.sourceVersion, 3);
  assert.equal(loaded?.save.eraId, "atomic-cloud");
  assert.equal(loaded?.save.mode, "learning");
  assert.equal(loaded?.save.progress, 0.4);
  assert.equal(loaded?.save.mash.length, 2);
  assert.equal(loaded?.save.collection[0].count, 2);
  assert.equal(loaded?.save.unitemizedPicked, 5);
});

test("v2 migration uses the original hour stops instead of the expanded atlas", () => {
  const loaded = loadSaveCandidates(
    {
      v4: "not json",
      v3: '{"version":3}',
      v2: JSON.stringify({
        version: 2,
        hours: 100,
        picked: 4,
        x: -8,
        z: 9,
        sound: false,
      }),
    },
    catalog,
  );

  assert.equal(loaded?.sourceVersion, 2);
  assert.equal(loaded?.save.eraId, "vehicle-yard");
  assert.ok(Math.abs((loaded?.save.progress ?? 0) - 1 / 6) < 1e-12);
  assert.equal(loaded?.save.unitemizedPicked, 4);
  assert.equal(loaded?.save.sound, false);
  assert.equal(LEGACY_V2_HOUR_STOPS.length, 21);
  assert.ok(Object.isFrozen(LEGACY_V2_HOUR_STOPS));
  assert.ok(LEGACY_V2_HOUR_STOPS.every(Object.isFrozen));
});

test("collection helpers aggregate identities without mutating prior state", () => {
  const starting = [
    {
      eraId: "atomic-cloud",
      curioId: "hydrogen",
      count: 2,
      firstPick: 10,
      lastPick: 20,
    },
  ];
  const aggregate = aggregatePickups(
    [
      {
        eraId: "atomic-cloud",
        curioId: "hydrogen",
        pickedAt: 30,
      },
      {
        eraId: "atomic-cloud",
        curioId: "helium",
        count: 2,
        firstPick: 12,
        lastPick: 18,
      },
    ],
    starting,
  );

  assert.equal(starting[0].count, 2);
  assert.deepEqual(aggregate, [
    {
      eraId: "atomic-cloud",
      curioId: "hydrogen",
      count: 3,
      firstPick: 10,
      lastPick: 30,
    },
    {
      eraId: "atomic-cloud",
      curioId: "helium",
      count: 2,
      firstPick: 12,
      lastPick: 18,
    },
  ]);
});

test("recordPickup and serialization provide a small page integration API", () => {
  const initial = createSaveData({
    mode: "journey",
    eraId: "atomic-cloud",
    progress: 0.25,
    picked: 4,
    unitemizedPicked: 4,
    x: 0,
    z: 0,
    zooms: 1,
    sound: true,
    mash: [],
    collection: [],
  });
  const next = recordPickup(initial, {
    eraId: "atomic-cloud",
    curioId: "helium",
    pickedAt: 1234,
  });

  assert.equal(initial.picked, 4);
  assert.equal(initial.collection.length, 0);
  assert.equal(next.picked, 5);
  assert.equal(next.unitemizedPicked, 4);
  assert.deepEqual(next.collection[0], {
    eraId: "atomic-cloud",
    curioId: "helium",
    count: 1,
    firstPick: 1234,
    lastPick: 1234,
  });
  assert.deepEqual(JSON.parse(serializeSaveData(next)), next);
  assert.equal(SAVE_KEYS.v4, "everything-roll-save-v4");
});

test("malformed candidates do not manufacture a reset save", () => {
  assert.equal(
    loadSaveCandidates(
      {
        v4: "{}",
        v3: '{"version":3}',
        v2: '{"hours":"nope"}',
      },
      catalog,
    ),
    null,
  );
});
