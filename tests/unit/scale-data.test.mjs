import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AUTHORED_CATALOG_IDS,
  CURIO_RARITIES,
  CURIO_SPAWN_MODES,
  ERAS,
  JOURNEY_HOURS,
  LEGACY_V3_ERA_NAMES,
  VISUAL_FORMS,
  eraIndexForId,
  loadScaleCatalog,
  withAuthoredCatalogIds,
} from "../../src/lib/scale-data.ts";

const catalog = JSON.parse(
  await readFile(
    new URL("../../src/lib/data/scale-catalog.json", import.meta.url),
    "utf8",
  ),
);

const AUTHORITATIVE_ORGANIZATIONS =
  /^(NIST|CERN|NHGRI|NIGMS|CDC|US EPA|USGS|NASA)$/;
const CONFIDENCE_LEVELS = new Set([
  "MEASURED",
  "SUPPORTED MODEL",
  "UNKNOWN",
  "SPECULATIVE",
]);

const V35_ADDED_CURIO_IDS = new Set([
  "moon-scale/dwarf-world",
  "moon-scale/cratered-moonlet",
  "moon-scale/icy-moon-archetype",
  "planetary-pantry/venus",
  "giant-worlds/exoplanet-giant",
  "giant-worlds/ice-giant-archetype",
  "giant-worlds/ringed-giant-archetype",
  "stellar-buffet/sun",
  "system-sweep/solar-system",
  "stellar-neighborhood/pleiades",
  "stellar-neighborhood/orion-nebula-m42",
  "galaxy-garden/milky-way",
  "galaxy-garden/andromeda-galaxy",
  "galaxy-garden/triangulum-galaxy",
]);

test("the expanded journey has stable, strictly increasing layers", () => {
  assert.equal(ERAS.length, 34);
  assert.equal(
    ERAS.reduce((total, era) => total + era.curios.length, 0),
    234,
  );
  assert.equal(JOURNEY_HOURS, 500);

  for (let index = 1; index < ERAS.length; index += 1) {
    assert.ok(
      ERAS[index].at > ERAS[index - 1].at,
      `${ERAS[index].name} must start after ${ERAS[index - 1].name}`,
    );
    assert.ok(
      ERAS[index].logMeters > ERAS[index - 1].logMeters,
      `${ERAS[index].name} must be larger than ${ERAS[index - 1].name}`,
    );
  }
});

test("stable IDs are non-empty and unique across the complete catalog", () => {
  const eraIds = ERAS.map((era) => era.id);
  const curioIds = ERAS.flatMap((era) => era.curios.map((curio) => curio.id));

  assert.equal(new Set(eraIds).size, eraIds.length);
  assert.equal(new Set(curioIds).size, curioIds.length);
  assert.ok(eraIds.every((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)));
  assert.ok(
    curioIds.every((id) =>
      /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id),
    ),
  );

  assert.equal(ERAS[0].id, "theory-playground");
  assert.equal(ERAS[0].curios[0].id, "theory-playground/foam-bubble");
  assert.equal(eraIndexForId("moon-scale"), 24);
  assert.equal(eraIndexForId("not-a-real-era"), 0);
});

test("authored IDs survive display-copy changes and preserve the v4 save contract", () => {
  const savedIds = ERAS.flatMap((era) => [
    era.id,
    ...era.curios.map((curio) => curio.id),
  ]);
  assert.equal(AUTHORED_CATALOG_IDS.length, ERAS.length);
  assert.equal(
    createHash("sha256")
      .update(
        JSON.stringify(savedIds.filter((id) => !V35_ADDED_CURIO_IDS.has(id))),
      )
      .digest("hex"),
    "d3dae188178ca70eb35eb9d901ba4a67523d9fb5f04dc9c2eb840adde042da2b",
    "v3.5 additions must not rename or remove any v4 save identity",
  );

  const renamed = withAuthoredCatalogIds(
    ERAS.map((era, eraIndex) => ({
      ...era,
      id: "must-be-replaced",
      name: `Reworded scale ${eraIndex}`,
      curios: era.curios.map((curio, curioIndex) => ({
        ...curio,
        id: "must-be-replaced",
        name: `Reworded specimen ${curioIndex}`,
      })),
    })),
  );
  assert.deepEqual(
    renamed.flatMap((era) => [
      era.id,
      ...era.curios.map((curio) => curio.id),
    ]),
    savedIds,
  );
});

test("every layer and curio has valid science metadata", () => {
  for (const era of ERAS) {
    assert.ok(CONFIDENCE_LEVELS.has(era.confidence), era.name);
    assert.ok(era.lesson.length >= 40, `${era.name} needs a substantive lesson`);
    assert.equal(era.palette.length, 3);
    assert.ok(era.sources.length >= 2, `${era.name} needs two sources`);

    for (const source of era.sources) {
      assert.ok(source.label.length > 0, `${era.name} has an unlabeled source`);
      assert.match(source.organization, AUTHORITATIVE_ORGANIZATIONS);
      assert.match(source.url, /^https:\/\//);
    }

    for (const curio of era.curios) {
      assert.ok(curio.fact.length >= 20, `${curio.id} needs a fact`);
      assert.match(curio.color, /^#[0-9a-f]{6}$/i);
      assert.ok(curio.symbol.length > 0, `${curio.id} needs a symbol`);
      assert.ok(curio.source, `${curio.id} needs a source`);
      assert.ok(
        era.sources.includes(curio.source),
        `${curio.id} source must belong to its era`,
      );
      assert.ok(CURIO_RARITIES.includes(curio.rarity), `${curio.id} rarity`);
      assert.ok(
        CURIO_SPAWN_MODES.includes(curio.spawnMode),
        `${curio.id} spawn mode`,
      );
    }
  }
});

test("singleton landmarks have globally unique subjects and every layer remains replayable", () => {
  const singletonSubjects = new Set();

  for (const era of ERAS) {
    assert.ok(
      era.curios.some((curio) => curio.spawnMode === "repeatable"),
      `${era.id} needs a repeatable collectible after landmarks are found`,
    );

    for (const curio of era.curios) {
      if (curio.spawnMode === "singleton") {
        assert.equal(curio.rarity, "rare", `${curio.id} landmark rarity`);
        assert.match(
          curio.subjectId,
          /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/,
          `${curio.id} needs a stable global subject identity`,
        );
        assert.ok(
          !singletonSubjects.has(curio.subjectId),
          `${curio.subjectId} represents more than one singleton`,
        );
        singletonSubjects.add(curio.subjectId);
      } else {
        assert.equal(
          curio.subjectId,
          undefined,
          `${curio.id} is repeatable and must not claim a singleton subject`,
        );
      }
    }
  }

  assert.equal(singletonSubjects.size, 21);
});

test("catalog validation rejects invalid collection metadata", () => {
  const duplicateSubject = structuredClone(catalog);
  duplicateSubject
    .find((era) => era.id === "planetary-pantry")
    .curios.find((curio) => curio.id === "venus").subjectId =
    "solar-system/earth";
  assert.throws(
    () => loadScaleCatalog(duplicateSubject),
    /solar-system\/earth is assigned to more than one singleton/,
  );

  const invalidRarity = structuredClone(catalog);
  invalidRarity[0].curios[0].rarity = "mythic";
  assert.throws(
    () => loadScaleCatalog(invalidRarity),
    /theory-playground\/foam-bubble\.rarity/,
  );

  const noRepeatable = structuredClone(catalog);
  const moonScale = noRepeatable.find((era) => era.id === "moon-scale");
  moonScale.curios = moonScale.curios.filter(
    (curio) => curio.spawnMode === "singleton",
  );
  assert.throws(
    () => loadScaleCatalog(noRepeatable),
    /moon-scale\.curios needs at least one repeatable collectible/,
  );
});

test("named cosmic anchors are one-of-one, physical, and scale-appropriate", () => {
  const byId = new Map(
    ERAS.flatMap((era) => era.curios).map((curio) => [curio.id, curio]),
  );
  const expected = new Map([
    ["planetary-pantry/venus", "solar-system/venus"],
    ["planetary-pantry/earth", "solar-system/earth"],
    ["giant-worlds/saturn", "solar-system/saturn"],
    ["stellar-buffet/sun", "solar-system/sun"],
    ["system-sweep/solar-system", "solar-system"],
    [
      "stellar-neighborhood/orion-nebula-m42",
      "milky-way/orion-nebula-m42",
    ],
    ["galaxy-garden/milky-way", "local-group/milky-way"],
    ["galaxy-garden/andromeda-galaxy", "local-group/andromeda"],
    ["galaxy-cluster-web/local-group", "large-scale/local-group"],
  ]);

  for (const [id, subjectId] of expected) {
    assert.deepEqual(
      {
        spawnMode: byId.get(id)?.spawnMode,
        subjectId: byId.get(id)?.subjectId,
      },
      { spawnMode: "singleton", subjectId },
      `${id} should be an identifiable one-of-one landmark`,
    );
  }

  const relativeSize = (id) => byId.get(id)?.relativeSize ?? 0;
  assert.ok(
    relativeSize("planetary-pantry/mercury") <
      relativeSize("planetary-pantry/mars"),
  );
  assert.ok(
    relativeSize("planetary-pantry/mars") <
      relativeSize("planetary-pantry/venus"),
  );
  assert.ok(
    relativeSize("planetary-pantry/venus") <
      relativeSize("planetary-pantry/earth"),
  );
  assert.ok(
    relativeSize("giant-worlds/neptune") <
      relativeSize("giant-worlds/saturn"),
  );
  assert.ok(
    relativeSize("giant-worlds/saturn") <
      relativeSize("giant-worlds/jupiter"),
  );
  assert.ok(
    relativeSize("galaxy-garden/triangulum-galaxy") <
      relativeSize("galaxy-garden/milky-way"),
  );
  assert.ok(
    relativeSize("galaxy-garden/milky-way") <
      relativeSize("galaxy-garden/andromeda-galaxy"),
  );
  assert.equal(ERAS.find((era) => era.id === "giant-worlds")?.logMeters, 8.15);

  assert.deepEqual(
    {
      id: byId.get("planetary-pantry/saturn")?.id,
      name: byId.get("planetary-pantry/saturn")?.name,
      spawnMode: byId.get("planetary-pantry/saturn")?.spawnMode,
      subjectId: byId.get("planetary-pantry/saturn")?.subjectId,
    },
    {
      id: "planetary-pantry/saturn",
      name: "super-Earth",
      spawnMode: "repeatable",
      subjectId: undefined,
    },
    "the legacy duplicate Saturn ID stays save-compatible but is now Earth-scale",
  );
});

test("every collectible has an explicit plush-ready visual form", () => {
  const validForms = new Set(VISUAL_FORMS);
  const curios = ERAS.flatMap((era) => era.curios);

  assert.equal(curios.length, 234);
  for (const curio of curios) {
    assert.ok(
      validForms.has(curio.visualForm),
      `${curio.id} has invalid visual form ${curio.visualForm}`,
    );
  }

  assert.deepEqual(
    curios
      .filter(
        (curio) =>
          curio.shape === "object" && curio.visualForm === "artifact",
      )
      .map((curio) => curio.id),
    [],
    "authored object curios must not fall back to the generic artifact form",
  );

  const practicalForms = new Map([
    ["tabletop-trek/pencil", "pencil"],
    ["tabletop-trek/coffee-mug", "mug"],
    ["tabletop-trek/paperback-book", "book"],
    ["tabletop-trek/tablespoon", "spoon"],
    ["room-scale/refrigerator", "appliance"],
    ["room-scale/bathtub", "bathtub"],
    ["cellular-sea/red-blood-cell", "blood-cell"],
    ["cellular-sea/white-blood-cell", "immune-cell"],
    ["house-yard/oak-tree", "tree"],
    ["house-yard/backyard-pool", "pool"],
    ["city-streets/city-train", "train"],
    ["city-streets/park-block", "park"],
  ]);

  for (const [id, form] of practicalForms) {
    assert.equal(
      curios.find((curio) => curio.id === id)?.visualForm,
      form,
      `${id} should keep its recognizable form`,
    );
  }
});

test("the JSON catalog owns editable collectible properties", () => {
  assert.equal(catalog.length, ERAS.length);
  assert.equal(
    catalog.reduce((count, era) => count + era.curios.length, 0),
    234,
  );
  for (const era of catalog) {
    for (const curio of era.curios) {
      assert.equal(typeof curio.name, "string");
      assert.equal(typeof curio.fact, "string");
      assert.equal(typeof curio.visualForm, "string");
      assert.ok(curio.relativeSize >= 0.25 && curio.relativeSize <= 4);
    }
  }
});

test("the measured journey stays between honest theoretical bookends", () => {
  assert.deepEqual(
    {
      name: ERAS[0].name,
      confidence: ERAS[0].confidence,
      realm: ERAS[0].realm,
    },
    {
      name: "Theory Playground",
      confidence: "SPECULATIVE",
      realm: "prephysical",
    },
  );
  assert.deepEqual(
    {
      name: ERAS.at(-1).name,
      confidence: ERAS.at(-1).confidence,
      realm: ERAS.at(-1).realm,
    },
    {
      name: "Metaversal Beyond",
      confidence: "SPECULATIVE",
      realm: "speculative",
    },
  );

  const legacyNames = new Set(LEGACY_V3_ERA_NAMES);
  assert.deepEqual(
    ERAS.filter((era) => legacyNames.has(era.name)).map((era) => era.name),
    [...LEGACY_V3_ERA_NAMES],
  );
});
