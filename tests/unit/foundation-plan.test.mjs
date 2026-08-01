import assert from "node:assert/strict";
import test from "node:test";

import { ERAS } from "../../src/lib/scale-data.ts";
import {
  FOUNDATION_MOTIF_BY_ERA_ID,
  foundationPlan,
  foundationPresentationFor,
} from "../../src/lib/game/foundation-plan.ts";

test("every era owns an explicit scientific foundation motif", () => {
  assert.equal(Object.keys(FOUNDATION_MOTIF_BY_ERA_ID).length, ERAS.length);
  assert.deepEqual(
    Object.keys(FOUNDATION_MOTIF_BY_ERA_ID).sort(),
    ERAS.map((era) => era.id).sort(),
  );
});

test("the theoretical origin is empty and becomes a volumetric memory", () => {
  assert.deepEqual(foundationPlan(0, ERAS), {
    presentation: "none",
    nearest: null,
    compressed: [],
    ancestryCount: 0,
    visibleLayerIndices: [],
    key: "none",
  });

  const probe = foundationPlan(1, ERAS);
  assert.equal(probe.presentation, "field");
  assert.equal(probe.nearest.id, "theory-playground");
  assert.equal(probe.nearest.motif, "foam");
  assert.equal(probe.nearest.relation, "memory");
});

test("foundation presentation follows physical context rather than one floor", () => {
  const indexOf = (id) => ERAS.findIndex((era) => era.id === id);
  assert.equal(
    foundationPresentationFor(indexOf("atomic-cloud"), ERAS),
    "field",
  );
  assert.equal(
    foundationPresentationFor(indexOf("dust-country"), ERAS),
    "surface",
  );
  assert.equal(
    foundationPresentationFor(indexOf("planetary-pantry"), ERAS),
    "shell",
  );
  assert.equal(
    foundationPresentationFor(indexOf("galaxy-garden"), ERAS),
    "distant-field",
  );
});

test("nearest history stays authored while three deeper layers compress", () => {
  const cityIndex = ERAS.findIndex((era) => era.id === "city-streets");
  const plan = foundationPlan(cityIndex, ERAS);
  assert.equal(plan.nearest.index, cityIndex - 1);
  assert.deepEqual(
    plan.compressed.map((layer) => layer.index),
    [cityIndex - 2, cityIndex - 3, cityIndex - 4],
  );
  assert.deepEqual(plan.visibleLayerIndices, [20, 19, 18, 17]);
  assert.equal(plan.ancestryCount, 17);
  assert.equal(plan.nearest.relation, "infrastructure");
  assert.equal(plan.key, foundationPlan(cityIndex, ERAS).key);
});

test("fractional zoom crosses foundation boundaries only at whole eras", () => {
  assert.equal(foundationPlan(4.01, ERAS).nearest.index, 4);
  assert.equal(foundationPlan(4.99, ERAS).nearest.index, 4);
  assert.equal(foundationPlan(5, ERAS).nearest.index, 4);
  assert.notEqual(foundationPlan(4, ERAS).key, foundationPlan(4.01, ERAS).key);
  assert.equal(foundationPlan(4.01, ERAS).key, foundationPlan(4.99, ERAS).key);
});
