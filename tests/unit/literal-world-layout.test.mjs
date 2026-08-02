import assert from "node:assert/strict";
import test from "node:test";

import { BASELINE_ROLL_ENVELOPE_FACTOR, CORE_RADIUS_MAX } from "../../src/lib/game-rules.ts";
import {
  LITERAL_ARCHITECTURE,
  LITERAL_DOORWAY_CLEAR_WIDTH,
  LITERAL_PROTECTED_ROUTE,
  LITERAL_PROP_ANCHORS,
  LITERAL_ROUTE_HALF_WIDTH,
  LITERAL_ROUTE_Z_OFFSET,
  LITERAL_STAGES,
  LITERAL_STAGE_IDS,
  LITERAL_STAGE_TRANSITIONS,
  LITERAL_WORLD_LAYOUT,
  collectibleLiteralPropsForStage,
  literalArchitectureForStage,
  literalPropsForStage,
  literalStageForEra,
  literalStageSurfaceY,
  literalSupportBoundaries,
  literalSupportTopForPoint,
} from "../../src/lib/game/literal-world-layout.ts";
import { ERAS } from "../../src/lib/scale-data.ts";

const catalogCurios = new Map(
  ERAS.flatMap((era) => era.curios.map((curio) => [curio.id, curio])),
);
const overlaps = (aMin, aMax, bMin, bMax) => aMin < bMax && aMax > bMin;

test("every literal prop resolves to one exact stable catalog identity", () => {
  assert.equal(
    new Set(LITERAL_PROP_ANCHORS.map((prop) => prop.id)).size,
    LITERAL_PROP_ANCHORS.length,
  );

  for (const prop of LITERAL_PROP_ANCHORS) {
    const curio = catalogCurios.get(prop.curioId);
    assert.ok(curio, `${prop.id} references missing curio ${prop.curioId}`);
    assert.equal(curio.name, prop.curioName, `${prop.curioId} name drifted`);
    assert.ok(prop.visibleIn.length > 0, `${prop.id} is never visible`);
    assert.ok(prop.collectibleIn.length > 0, `${prop.id} is never collectible`);
    for (const stage of prop.collectibleIn) {
      assert.ok(
        prop.visibleIn.includes(stage),
        `${prop.id} can be collected while invisible in ${stage}`,
      );
    }
  }
});

test("architecture and collectible props never duplicate the same identity", () => {
  const normalize = (value) =>
    value
      .toLowerCase()
      .replace(/^architecture\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const sceneryIdentities = new Set(
    LITERAL_ARCHITECTURE.flatMap((primitive) => [
      normalize(primitive.id),
      normalize(primitive.semanticIdentity),
      normalize(primitive.label),
    ]),
  );

  for (const prop of LITERAL_PROP_ANCHORS) {
    const localCurioId = prop.curioId.split("/").at(-1);
    assert.equal(sceneryIdentities.has(normalize(prop.curioId)), false);
    assert.equal(sceneryIdentities.has(normalize(localCurioId)), false);
    assert.equal(sceneryIdentities.has(normalize(prop.curioName)), false);
  }
});

test("the protected route stays clear while moving forward along negative Z", () => {
  assert.deepEqual(
    LITERAL_PROTECTED_ROUTE.map((segment) => segment.stage),
    LITERAL_STAGE_IDS,
  );

  for (const segment of LITERAL_PROTECTED_ROUTE) {
    assert.ok(segment.nearZ > segment.farZ, `${segment.stage} reverses forward`);
    assert.equal(segment.centerX, 0);
    assert.ok(
      segment.halfWidth * 2 >=
        2 * CORE_RADIUS_MAX * BASELINE_ROLL_ENVELOPE_FACTOR,
    );

    for (const primitive of LITERAL_ARCHITECTURE) {
      if (
        primitive.collision !== "barrier" ||
        !primitive.visibleIn.includes(segment.stage)
      ) {
        continue;
      }
      const [x, , z] = primitive.position;
      const [width, , depth] = primitive.dimensions;
      if (!overlaps(z - depth / 2, z + depth / 2, segment.farZ, segment.nearZ)) {
        continue;
      }
      const corridorMin = segment.centerX - segment.halfWidth;
      const corridorMax = segment.centerX + segment.halfWidth;
      assert.equal(
        overlaps(x - width / 2, x + width / 2, corridorMin, corridorMax),
        false,
        `${primitive.id} blocks the ${segment.stage} route`,
      );
    }

    for (const prop of LITERAL_PROP_ANCHORS) {
      if (!prop.visibleIn.includes(segment.stage)) continue;
      const [x, , z] = prop.position;
      if (
        !overlaps(
          z - prop.footprintRadius,
          z + prop.footprintRadius,
          segment.farZ,
          segment.nearZ,
        )
      ) {
        continue;
      }
      if (
        Math.abs(x - segment.centerX) - prop.footprintRadius <
        segment.halfWidth
      ) {
        assert.ok(
          prop.collectibleIn.includes(segment.stage),
          `${prop.id} is an inert blocker in the ${segment.stage} route`,
        );
      }
    }
  }
});

test("the forward wall opening fits the baseline core-growth envelope", () => {
  const requiredWidth = 2 * CORE_RADIUS_MAX * BASELINE_ROLL_ENVELOPE_FACTOR;
  const opening = LITERAL_ARCHITECTURE.find(
    (primitive) => primitive.id === "architecture/forward-exit-opening",
  );

  assert.ok(LITERAL_DOORWAY_CLEAR_WIDTH >= requiredWidth);
  assert.equal(opening?.collision, "none");
  assert.equal(opening?.clearWidth, LITERAL_DOORWAY_CLEAR_WIDTH);
  assert.equal(opening?.dimensions[0], LITERAL_DOORWAY_CLEAR_WIDTH);
});

test("literal topology is one finite semantic route from slide to yard", () => {
  assert.equal(LITERAL_WORLD_LAYOUT.entryStage, "microscope-slide");
  assert.equal(LITERAL_WORLD_LAYOUT.terminalStage, "yard");
  assert.equal(LITERAL_STAGE_TRANSITIONS.length, LITERAL_STAGES.length - 1);
  assert.equal(new Set(LITERAL_STAGE_IDS).size, LITERAL_STAGE_IDS.length);

  const stages = new Map(LITERAL_STAGES.map((stage) => [stage.id, stage]));
  const outgoing = new Map(
    LITERAL_STAGE_TRANSITIONS.map((transition) => [transition.from, transition]),
  );
  const visited = new Set();
  let current = LITERAL_WORLD_LAYOUT.entryStage;

  while (current !== LITERAL_WORLD_LAYOUT.terminalStage) {
    assert.equal(visited.has(current), false, `cycle begins at ${current}`);
    visited.add(current);
    const transition = outgoing.get(current);
    assert.ok(transition, `${current} has no finite successor`);
    assert.equal(transition.atZ, stages.get(current).farZ);
    assert.equal(stages.get(transition.to).nearZ, transition.atZ);
    current = transition.to;
  }
  visited.add(current);

  assert.equal(visited.size, LITERAL_STAGES.length);
  assert.deepEqual([...visited], LITERAL_STAGE_IDS);
  assert.equal(outgoing.has(LITERAL_WORLD_LAYOUT.terminalStage), false);
  assert.deepEqual(
    LITERAL_STAGE_TRANSITIONS.map((transition) => transition.semantic),
    ["scale-reveal", "surface-drop", "portal", "threshold"],
  );
});

test("one route transform preserves every stage boundary and shared fixture", () => {
  for (const transition of LITERAL_STAGE_TRANSITIONS) {
    const from = LITERAL_STAGES.find((stage) => stage.id === transition.from);
    const to = LITERAL_STAGES.find((stage) => stage.id === transition.to);
    assert.equal(from.farZ + LITERAL_ROUTE_Z_OFFSET, transition.atZ + LITERAL_ROUTE_Z_OFFSET);
    assert.equal(to.nearZ + LITERAL_ROUTE_Z_OFFSET, transition.atZ + LITERAL_ROUTE_Z_OFFSET);
  }

  const sharedSurface = LITERAL_ARCHITECTURE.find(
    (primitive) => primitive.id === "architecture/study-work-surface",
  );
  assert.deepEqual(sharedSurface.visibleIn, ["microscope-slide", "tabletop"]);
  assert.equal(LITERAL_ROUTE_Z_OFFSET, -26);
  assert.equal(sharedSurface.position[2] + LITERAL_ROUTE_Z_OFFSET, -8);
  assert.equal(
    new Set(
      sharedSurface.visibleIn.map(
        () => sharedSurface.position[2] + LITERAL_ROUTE_Z_OFFSET,
      ),
    ).size,
    1,
  );
});

test("the microscope plate is a roomy, supported first playfield", () => {
  const byId = new Map(
    LITERAL_ARCHITECTURE.map((primitive) => [primitive.id, primitive]),
  );
  const slide = byId.get("architecture/glass-specimen-slide");
  const desk = byId.get("architecture/study-work-surface");
  const cameraApron = byId.get("architecture/study-camera-apron");
  const microscope = LITERAL_STAGES.find(
    (stage) => stage.id === "microscope-slide",
  );
  const tabletop = LITERAL_STAGES.find((stage) => stage.id === "tabletop");
  const transition = LITERAL_STAGE_TRANSITIONS.find(
    (candidate) => candidate.from === "microscope-slide",
  );
  const bounds = (primitive) => ({
    minX: primitive.position[0] - primitive.dimensions[0] / 2,
    maxX: primitive.position[0] + primitive.dimensions[0] / 2,
    minZ: primitive.position[2] - primitive.dimensions[2] / 2,
    maxZ: primitive.position[2] + primitive.dimensions[2] / 2,
  });
  const slideBounds = bounds(slide);
  const deskBounds = bounds(desk);

  assert.equal(slide.dimensions[0] * slide.dimensions[2], 896);
  assert.ok(slideBounds.maxZ > microscope.nearZ);
  assert.ok(slideBounds.minZ < microscope.farZ);
  assert.equal(microscope.farZ, tabletop.nearZ);
  assert.equal(transition.atZ, tabletop.nearZ);
  assert.ok(slideBounds.minX >= deskBounds.minX);
  assert.ok(slideBounds.maxX <= deskBounds.maxX);
  assert.ok(slideBounds.minZ >= deskBounds.minZ);
  assert.ok(slideBounds.maxZ <= deskBounds.maxZ);
  const apronBounds = bounds(cameraApron);
  assert.equal(cameraApron.collision, "none");
  assert.equal(apronBounds.minZ, deskBounds.maxZ);
  assert.ok(apronBounds.maxZ - deskBounds.maxZ >= 20);
  assert.equal(cameraApron.position[1], desk.position[1]);

  for (const fixtureId of [
    "architecture/microscope-stand",
    "architecture/microscope-objective",
  ]) {
    const fixture = bounds(byId.get(fixtureId));
    assert.equal(
      overlaps(
        fixture.minX,
        fixture.maxX,
        slideBounds.minX,
        slideBounds.maxX,
      ) &&
        overlaps(
          fixture.minZ,
          fixture.maxZ,
          slideBounds.minZ,
          slideBounds.maxZ,
        ),
      false,
      `${fixtureId} steals playable glass area`,
    );
  }

  for (const prop of LITERAL_PROP_ANCHORS.filter((candidate) =>
    candidate.visibleIn.includes("microscope-slide"),
  )) {
    assert.ok(prop.position[0] - prop.footprintRadius >= slideBounds.minX);
    assert.ok(prop.position[0] + prop.footprintRadius <= slideBounds.maxX);
    assert.ok(prop.position[2] - prop.footprintRadius >= slideBounds.minZ);
    assert.ok(prop.position[2] + prop.footprintRadius <= slideBounds.maxZ);
    assert.ok(
      Math.abs(prop.position[0]) - prop.footprintRadius >=
        LITERAL_ROUTE_HALF_WIDTH,
      `${prop.id} crowds the clear path across the plate`,
    );
  }
});

test("stage selectors expose context separately from collection eligibility", () => {
  assert.equal(literalStageForEra("virus-garden")?.id, "microscope-slide");
  assert.equal(literalStageForEra("microbe-meadow")?.id, "microscope-slide");
  assert.equal(literalStageForEra("fiber-pollen")?.id, "microscope-slide");
  assert.equal(literalStageForEra("tabletop-trek")?.id, "tabletop");
  assert.equal(literalStageForEra("room-scale")?.id, "room");
  assert.equal(literalStageForEra("house-yard")?.id, "yard");
  assert.equal(literalStageForEra("stellar-buffet"), undefined);

  assert.ok(
    literalArchitectureForStage("tabletop").some(
      (primitive) => primitive.id === "architecture/microscope-stand",
    ),
  );
  assert.equal(
    literalPropsForStage("porch").some(
      (prop) => prop.curioId === "everyday-kingdom/couch",
    ),
    false,
  );
  assert.ok(
    collectibleLiteralPropsForStage("porch").some(
      (prop) => prop.curioId === "vehicle-yard/bicycle",
    ),
  );
});

test("later stages do not retain stale props or elevated prior-stage slabs", () => {
  const stageRank = new Map(LITERAL_STAGE_IDS.map((stage, index) => [stage, index]));

  assert.equal(
    literalArchitectureForStage("room").some(
      (primitive) => primitive.id === "architecture/study-work-surface",
    ),
    false,
  );
  assert.equal(
    literalPropsForStage("room").some((prop) =>
      prop.curioId.startsWith("tabletop-trek/"),
    ),
    false,
  );
  assert.equal(
    literalPropsForStage("porch").some((prop) =>
      prop.curioId.startsWith("everyday-kingdom/"),
    ),
    false,
  );

  for (const prop of LITERAL_PROP_ANCHORS) {
    const lastCollectibleStage = Math.max(
      ...prop.collectibleIn.map((stage) => stageRank.get(stage)),
    );
    for (const stage of prop.visibleIn) {
      assert.ok(
        stageRank.get(stage) <= lastCollectibleStage,
        `${prop.id} lingers after its final collectible stage`,
      );
    }
  }
});

test("room shell leaves the chase camera open and surfaces meet without overlap", () => {
  const byId = new Map(
    LITERAL_ARCHITECTURE.map((primitive) => [primitive.id, primitive]),
  );
  const roomFloor = byId.get("architecture/room-floor");
  const westWall = byId.get("architecture/room-wall-west");
  const eastWall = byId.get("architecture/room-wall-east");
  const porch = byId.get("architecture/porch-deck");
  const yard = byId.get("architecture/yard-ground");

  assert.equal(
    byId.has("architecture/room-wall-back"),
    false,
    "an opaque rear wall can occlude the pulled-back chase camera",
  );
  assert.equal(roomFloor.position[2], westWall.position[2]);
  assert.equal(roomFloor.position[2], eastWall.position[2]);
  assert.equal(roomFloor.dimensions[2], westWall.dimensions[2]);
  assert.equal(roomFloor.dimensions[2], eastWall.dimensions[2]);

  const zEdges = (primitive) => [
    primitive.position[2] - primitive.dimensions[2] / 2,
    primitive.position[2] + primitive.dimensions[2] / 2,
  ];
  const [roomForward] = zEdges(roomFloor);
  const [porchForward, porchRear] = zEdges(porch);
  const [, yardRear] = zEdges(yard);
  assert.equal(roomForward, porchRear);
  assert.equal(porchForward, yardRear);
});

test("support contours block voids while keeping joined surfaces open", () => {
  const supports = literalArchitectureForStage("room")
    .filter(
      (primitive) =>
        primitive.collision === "support" &&
        Math.abs(
          primitive.position[1] +
            primitive.dimensions[1] / 2 -
            literalStageSurfaceY("room"),
        ) < 0.04,
    )
    .map((primitive) => ({
      minX: primitive.position[0] - primitive.dimensions[0] / 2,
      maxX: primitive.position[0] + primitive.dimensions[0] / 2,
      minZ: primitive.position[2] - primitive.dimensions[2] / 2,
      maxZ: primitive.position[2] + primitive.dimensions[2] / 2,
    }));
  const boundaries = literalSupportBoundaries(supports);

  const horizontalAt = (coordinate) =>
    boundaries
      .filter(
        (boundary) =>
          boundary.axis === "z" && boundary.coordinate === coordinate,
      )
      .map(({ min, max }) => [min, max]);
  assert.deepEqual(horizontalAt(-28), [
    [-20, -9],
    [9, 20],
  ]);
  assert.deepEqual(horizontalAt(-40), [
    [-24, -9],
    [9, 24],
  ]);
});

test("literal supports render just above the shared ground without z-fighting", () => {
  const byId = new Map(
    LITERAL_ARCHITECTURE.map((primitive) => [primitive.id, primitive]),
  );
  const top = (primitive) =>
    primitive.position[1] + primitive.dimensions[1] / 2;
  const bottom = (primitive) =>
    primitive.position[1] - primitive.dimensions[1] / 2;
  const approximately = (actual, expected) =>
    Math.abs(actual - expected) < Number.EPSILON * 16;
  const workSurface = byId.get("architecture/study-work-surface");
  const slide = byId.get("architecture/glass-specimen-slide");
  const supports = [
    [slide, literalStageSurfaceY("microscope-slide")],
    [workSurface, literalStageSurfaceY("tabletop")],
    [byId.get("architecture/room-floor"), literalStageSurfaceY("room")],
    [byId.get("architecture/porch-deck"), literalStageSurfaceY("porch")],
    [byId.get("architecture/yard-ground"), literalStageSurfaceY("yard")],
  ];

  for (const [support, expectedSurfaceY] of supports) {
    assert.ok(
      approximately(top(support), expectedSurfaceY),
      `${support.id} misses its authored walkable elevation`,
    );
  }
  assert.ok(bottom(slide) >= top(workSurface));
});

test("every authored prop is grounded on the highest literal support beneath it", () => {
  for (const prop of LITERAL_PROP_ANCHORS) {
    for (const stage of prop.visibleIn) {
      const supportTop = literalSupportTopForPoint(
        stage,
        prop.position[0],
        prop.position[2],
      );
      assert.notEqual(
        supportTop,
        null,
        `${prop.id} has no support in ${stage}`,
      );
    }
  }

  assert.ok(
    literalSupportTopForPoint("microscope-slide", -10, 31) >
      literalSupportTopForPoint("microscope-slide", 0, 8),
    "slide specimens should sit on the glass rather than intersect the desk",
  );
});
