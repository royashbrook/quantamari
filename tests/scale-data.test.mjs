import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  AUTHORED_CATALOG_IDS,
  ERAS,
  JOURNEY_HOURS,
  LEGACY_V3_ERA_NAMES,
  VISUAL_FORMS,
  eraIndexForId,
  withAuthoredCatalogIds,
} from "../app/scale-data.ts";

const AUTHORITATIVE_ORGANIZATIONS =
  /^(NIST|CERN|NHGRI|NIGMS|CDC|US EPA|USGS|NASA)$/;
const CONFIDENCE_LEVELS = new Set([
  "MEASURED",
  "SUPPORTED MODEL",
  "UNKNOWN",
  "SPECULATIVE",
]);

test("the expanded journey has stable, strictly increasing layers", () => {
  assert.equal(ERAS.length, 34);
  assert.equal(
    ERAS.reduce((total, era) => total + era.curios.length, 0),
    220,
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
    createHash("sha256").update(JSON.stringify(savedIds)).digest("hex"),
    "d3dae188178ca70eb35eb9d901ba4a67523d9fb5f04dc9c2eb840adde042da2b",
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
    }
  }
});

test("every collectible has an explicit plush-ready visual form", () => {
  const validForms = new Set(VISUAL_FORMS);
  const curios = ERAS.flatMap((era) => era.curios);

  assert.equal(curios.length, 220);
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
