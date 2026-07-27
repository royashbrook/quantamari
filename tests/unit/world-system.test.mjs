import assert from "node:assert/strict";
import test from "node:test";

import { ERAS } from "../../src/lib/scale-data.ts";
import {
  LEGACY_VISUAL_STAGE_ANCHORS,
  MAX_HORIZONTAL_PLAY_FOV,
  MAX_RESIDENT_LAYERS,
  PROJECTED_LOD_THRESHOLDS,
  PROJECTED_RICH_HYSTERESIS,
  RESIDENT_PRIOR_LAYER_DEPTH,
  WORLD_PERFORMANCE_BUDGETS,
  WORLD_SPECS,
  boundedVerticalFov,
  floatingOriginShift,
  horizontalFovDegrees,
  legacyVisualStageAnchor,
  localChunkCoordinate,
  lodForProjectedDiameter,
  projectedDiameterPixels,
  residentLayerIndices,
  semanticViewScale,
  stableWorldSeed,
  wantsRichProjectedDetail,
  worldAnchorSeed,
  worldChunkSeed,
  worldSpecForEra,
} from "../../src/lib/world-system.ts";

test("every authored era maps to a grounded world kind and legacy visual stage", () => {
  assert.equal(Object.keys(WORLD_SPECS).length, ERAS.length);
  for (const era of ERAS) {
    const world = worldSpecForEra(era.name);
    assert.ok(world.kind);
    assert.equal(
      legacyVisualStageAnchor(world.legacyStage),
      LEGACY_VISUAL_STAGE_ANCHORS[world.legacyStage],
    );
  }

  assert.deepEqual(worldSpecForEra("Dust Country"), {
    kind: "dust-surface",
    surface: "floor",
    legacyStage: "room",
  });
  assert.deepEqual(worldSpecForEra("Theory Playground"), {
    kind: "void",
    surface: "none",
    legacyStage: "quantum",
  });
  assert.equal(worldSpecForEra("Everyday Kingdom").kind, "interior");
  assert.equal(worldSpecForEra("Built Environment").kind, "city");
  assert.equal(worldSpecForEra("Landscape Scale").surface, "terrain");
  assert.equal(worldSpecForEra("Planetary Pantry").surface, "sphere");
  assert.throws(() => worldSpecForEra("Missing Scale"), RangeError);
});

test("world, chunk, and nested anchor seeds are deterministic and domain-separated", () => {
  assert.equal(stableWorldSeed("journey", 42, -3), 218_389_901);
  assert.equal(worldChunkSeed("roy", "Dust Country", -2, 7), 2_294_931_278);
  assert.equal(
    worldAnchorSeed("roy", "Pocket World", "Dust Country", 0),
    431_466_185,
  );
  assert.equal(
    stableWorldSeed("journey", 42, -3),
    stableWorldSeed("journey", 42, -3),
  );
  assert.equal(
    worldChunkSeed("roy", "Dust Country", -2, 7),
    worldChunkSeed("roy", "Dust Country", -2, 7),
  );
  assert.notEqual(
    worldChunkSeed("roy", "Dust Country", -2, 7),
    worldChunkSeed("roy", "Dust Country", -1, 7),
  );
  assert.notEqual(
    worldChunkSeed("roy", "Dust Country", -2, 7),
    worldAnchorSeed("roy", "Pocket World", "Dust Country", 0),
  );
  assert.notEqual(
    worldAnchorSeed("roy", "Pocket World", "Dust Country", 0),
    worldAnchorSeed("roy", "Pocket World", "Dust Country", 1),
  );
});

test("projected-size LOD thresholds keep detail until it becomes fabric", () => {
  assert.equal(lodForProjectedDiameter(PROJECTED_LOD_THRESHOLDS.rich), "rich");
  assert.equal(lodForProjectedDiameter(7.999), "simple");
  assert.equal(lodForProjectedDiameter(PROJECTED_LOD_THRESHOLDS.simple), "simple");
  assert.equal(lodForProjectedDiameter(1.999), "point");
  assert.equal(lodForProjectedDiameter(PROJECTED_LOD_THRESHOLDS.point), "point");
  assert.equal(lodForProjectedDiameter(0.499), "fabric");
  assert.equal(lodForProjectedDiameter(Number.NaN), "fabric");

  assert.ok(
    Math.abs(projectedDiameterPixels(1, 5, 90, 1_000) - 100) <
      Number.EPSILON * 1_000,
  );
  assert.equal(projectedDiameterPixels(0, 5, 90, 1_000), 0);
  assert.equal(
    projectedDiameterPixels(1, 0, 90, 1_000),
    Number.POSITIVE_INFINITY,
  );

  assert.equal(
    wantsRichProjectedDetail(PROJECTED_RICH_HYSTERESIS.enter, false),
    true,
  );
  assert.equal(
    wantsRichProjectedDetail(PROJECTED_LOD_THRESHOLDS.rich, false),
    false,
  );
  assert.equal(
    wantsRichProjectedDetail(PROJECTED_LOD_THRESHOLDS.rich, true),
    true,
  );
  assert.equal(
    wantsRichProjectedDetail(PROJECTED_RICH_HYSTERESIS.exit - 0.001, true),
    false,
  );
  assert.equal(wantsRichProjectedDetail(Number.NaN, true), false);
});

test("camera framing caps horizontal world coverage without letterboxing", () => {
  const desktopFov = boundedVerticalFov(46, 16 / 10);
  const ultrawideFov = boundedVerticalFov(46, 32 / 9);
  const portraitFov = boundedVerticalFov(56, 390 / 844);

  assert.ok(desktopFov < 46);
  assert.ok(ultrawideFov < desktopFov);
  assert.equal(portraitFov, 56);
  assert.ok(
    Math.abs(
      horizontalFovDegrees(desktopFov, 16 / 10) -
        MAX_HORIZONTAL_PLAY_FOV,
    ) < 0.000_001,
  );
  assert.ok(
    Math.abs(
      horizontalFovDegrees(ultrawideFov, 32 / 9) -
        MAX_HORIZONTAL_PLAY_FOV,
    ) < 0.000_001,
  );
});

test("resident layers retain the current view and at most two prior layers", () => {
  assert.equal(RESIDENT_PRIOR_LAYER_DEPTH, 2);
  assert.deepEqual(residentLayerIndices(0, ERAS.length), [0]);
  assert.deepEqual(
    residentLayerIndices(0, ERAS.length).filter((layer) => layer < 0),
    [],
  );
  assert.deepEqual(
    residentLayerIndices(1, ERAS.length).filter((layer) => layer < 1),
    [0],
  );
  assert.deepEqual(residentLayerIndices(2, ERAS.length), [2, 1, 0]);
  assert.deepEqual(residentLayerIndices(2.25, ERAS.length), [3, 2, 1]);
  assert.deepEqual(residentLayerIndices(20, ERAS.length), [20, 19, 18]);
  assert.deepEqual(residentLayerIndices(-10, ERAS.length), [0]);

  for (let viewScale = 0; viewScale <= ERAS.length; viewScale += 0.125) {
    const resident = residentLayerIndices(viewScale, ERAS.length);
    assert.ok(resident.length <= MAX_RESIDENT_LAYERS);
    assert.equal(new Set(resident).size, resident.length);
    assert.ok(resident.every((index) => index >= 0 && index < ERAS.length));
  }

  for (const budget of Object.values(WORLD_PERFORMANCE_BUDGETS)) {
    assert.equal(budget.maxResidentLayers, MAX_RESIDENT_LAYERS);
  }
});

test("free lens changes semantic residency without touching journey progress", () => {
  const journey = { layer: 10, progress: 0.42 };
  assert.equal(semanticViewScale(journey.layer, 1, ERAS.length), 10);
  assert.equal(semanticViewScale(journey.layer, 2, ERAS.length), 11);
  assert.equal(semanticViewScale(journey.layer, 0.5, ERAS.length), 9);
  assert.deepEqual(
    residentLayerIndices(
      semanticViewScale(journey.layer, 2 ** 0.4, ERAS.length),
      ERAS.length,
    ),
    [11, 10, 9],
  );
  assert.deepEqual(journey, { layer: 10, progress: 0.42 });
  assert.equal(semanticViewScale(0, 1 / 256, ERAS.length), 0);
  assert.equal(
    semanticViewScale(ERAS.length - 1, 256, ERAS.length),
    ERAS.length - 1,
  );
});

test("periodic chunks stay local and floating-origin shifts preserve tile phase", () => {
  assert.equal(localChunkCoordinate(63, 128), 63);
  assert.equal(localChunkCoordinate(65, 128), -63);
  assert.equal(floatingOriginShift(4_095, 128), 0);
  assert.equal(floatingOriginShift(4_160, 128), 4_224);
  assert.equal(
    localChunkCoordinate(4_160, 128),
    localChunkCoordinate(4_160 - floatingOriginShift(4_160, 128), 128),
  );
});
