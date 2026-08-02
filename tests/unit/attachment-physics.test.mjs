import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ATTACHMENT_SUPPORT_CORE_SHARE,
  MAX_ATTACHMENT_OUTSIDE_SHARE,
  MIN_ATTACHMENT_OUTSIDE_SHARE,
  attachmentSupportScaleFit,
  contactLocalSurfaceDirection,
  directionalAttachmentEnvelopeXZ,
  nearestAabbContactDirectionXZ,
  relocateAttachmentForCoreGrowth,
  targetAttachmentCenterDistance,
} from "../../src/lib/game/attachment-physics.ts";

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const closeTo = (actual, expected, epsilon = 1e-10) =>
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );

test("contact side becomes the attachment's local surface direction", () => {
  assert.deepEqual(
    contactLocalSurfaceDirection({ x: 8, y: 0, z: 0 }, IDENTITY, 1),
    { x: 1, y: 0, z: 0 },
  );

  // A +90° world yaw maps local +X to world -Z. Converting that world
  // contact back into roll-local space therefore returns +X.
  const halfAngle = Math.PI / 4;
  const direction = contactLocalSurfaceDirection(
    { x: 0, y: 0, z: -4 },
    { x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) },
    2,
  );
  closeTo(direction.x, 1);
  closeTo(direction.y, 0);
  closeTo(direction.z, 0);
});

test("zero-distance contacts use a deterministic unit-vector fallback", () => {
  const first = contactLocalSurfaceDirection({ x: 0, y: 0, z: 0 }, IDENTITY, 72);
  const repeat = contactLocalSurfaceDirection({ x: 0, y: 0, z: 0 }, IDENTITY, 72);
  const other = contactLocalSurfaceDirection({ x: 0, y: 0, z: 0 }, IDENTITY, 73);

  assert.deepEqual(first, repeat);
  assert.notDeepEqual(first, other);
  closeTo(Math.hypot(first.x, first.y, first.z), 1);
});

test("target placement keeps 60% outside while retaining physical overlap", () => {
  const coreRadius = 2;
  const inwardSupport = 0.5;
  const outwardSupport = 1;
  const center = targetAttachmentCenterDistance(
    coreRadius,
    inwardSupport,
    outwardSupport,
  );
  const innerEdge = center - inwardSupport;
  const outerEdge = center + outwardSupport;
  const visibleShare = (outerEdge - coreRadius) / (inwardSupport + outwardSupport);

  closeTo(visibleShare, 0.6);
  assert.ok(innerEdge < coreRadius, "the model must overlap the core instead of floating");
  assert.ok(outerEdge > coreRadius, "the model must remain visibly outside the core");
});

test("target placement clamps unsafe requested exposure to the 55–65% band", () => {
  const core = 3;
  const inward = 0.8;
  const outward = 0.4;
  const low = targetAttachmentCenterDistance(core, inward, outward, -1);
  const high = targetAttachmentCenterDistance(core, inward, outward, 2);
  const span = inward + outward;

  closeTo((low + outward - core) / span, MIN_ATTACHMENT_OUTSIDE_SHARE);
  closeTo((high + outward - core) / span, MAX_ATTACHMENT_OUTSIDE_SHARE);
});

test("oversized attachment support is uniformly capped to the visible core", () => {
  const authoredScale = { x: 2, y: 1, z: 0.5 };
  const authoredSupport = 3.2;
  const coreRadius = 2;
  const fit = attachmentSupportScaleFit(authoredSupport, coreRadius);
  const fittedScale = {
    x: authoredScale.x * fit,
    y: authoredScale.y * fit,
    z: authoredScale.z * fit,
  };

  closeTo(
    authoredSupport * fit,
    coreRadius * MAX_ATTACHMENT_SUPPORT_CORE_SHARE,
  );
  closeTo(fittedScale.x / fittedScale.y, authoredScale.x / authoredScale.y);
  closeTo(fittedScale.y / fittedScale.z, authoredScale.y / authoredScale.z);
  assert.ok(fit > 0 && fit < 1);
});

test("attachment support fitting is idempotent and never enlarges small models", () => {
  const coreRadius = 2;
  const smallSupport = 0.8;
  assert.equal(attachmentSupportScaleFit(smallSupport, coreRadius), 1);

  const firstFit = attachmentSupportScaleFit(4, coreRadius);
  const fittedSupport = 4 * firstFit;
  assert.equal(attachmentSupportScaleFit(fittedSupport, coreRadius), 1);
  assert.equal(attachmentSupportScaleFit(4, coreRadius, 0.75), 0.375);
});

test("the default fit and placement keep the far edge within 1.72 core radii", () => {
  const coreRadius = 2;
  const authoredSupport = 8;
  const fit = attachmentSupportScaleFit(authoredSupport, coreRadius);
  const fittedSupport = authoredSupport * fit;
  const center = targetAttachmentCenterDistance(
    coreRadius,
    fittedSupport,
  );

  closeTo(center + fittedSupport, coreRadius * 1.72);
});

test("core growth pushes attachments outward without changing their angle", () => {
  const original = { x: 3, y: 4, z: 0 };
  const moved = relocateAttachmentForCoreGrowth(original, 1.2, 1.7);

  closeTo(Math.hypot(moved.x, moved.y, moved.z), 5.5);
  closeTo(moved.x / moved.y, original.x / original.y);
  assert.equal(moved.z, 0);
  assert.deepEqual(
    relocateAttachmentForCoreGrowth(original, 1.7, 1.2),
    original,
    "a shrinking core must not pull an already-visible object back inside",
  );
});

test("growth can rescue a legacy attachment at the origin deterministically", () => {
  const first = relocateAttachmentForCoreGrowth({ x: 0, y: 0, z: 0 }, 1, 1.4, 9);
  const repeat = relocateAttachmentForCoreGrowth({ x: 0, y: 0, z: 0 }, 1, 1.4, 9);
  assert.deepEqual(first, repeat);
  closeTo(Math.hypot(first.x, first.y, first.z), 0.4);
});

test("directional support ignores an attachment on the opposite side", () => {
  const attachments = [
    { x: 2, z: 0, radius: 0.5 },
    { x: -2, z: 0, radius: 0.5 },
  ];

  assert.equal(directionalAttachmentEnvelopeXZ(1, 1, 0, attachments), 2.5);
  assert.equal(
    directionalAttachmentEnvelopeXZ(1, 1, 0, [attachments[1]]),
    1,
    "a rear attachment must not block a forward corridor",
  );
  assert.equal(directionalAttachmentEnvelopeXZ(1, -1, 0, attachments), 2.5);
  assert.equal(directionalAttachmentEnvelopeXZ(1, 0, 1, attachments), 1);
});

test("directional support normalizes query vectors and retains the core floor", () => {
  const attachments = [{ x: 1.4, z: 1.4, radius: 0.2 }];
  const diagonal = directionalAttachmentEnvelopeXZ(1, 10, 10, attachments);
  closeTo(diagonal, Math.SQRT2 * 1.4 + 0.2);
  assert.equal(directionalAttachmentEnvelopeXZ(1.25, 0, 0, attachments), 1.25);
});

test("AABB direction targets the nearest wall face instead of its distant center", () => {
  assert.deepEqual(
    nearestAabbContactDirectionXZ(21, 28, 0, 0, 20, 30),
    { x: -1, z: 0 },
  );
  assert.deepEqual(
    nearestAabbContactDirectionXZ(-21, -28, 0, 0, 20, 30),
    { x: 1, z: 0 },
  );
});

test("AABB corner contacts return a normalized diagonal direction", () => {
  const direction = nearestAabbContactDirectionXZ(23, 34, 0, 0, 20, 30);
  closeTo(direction.x, -0.6);
  closeTo(direction.z, -0.8);
  closeTo(Math.hypot(direction.x, direction.z), 1);
});

test("inside an AABB selects its minimum-penetration exit deterministically", () => {
  assert.deepEqual(
    nearestAabbContactDirectionXZ(9, 0, 0, 0, 10, 100),
    { x: 1, z: 0 },
  );
  assert.deepEqual(
    nearestAabbContactDirectionXZ(0, 0, 0, 0, 10, 100),
    { x: -1, z: 0 },
    "equal left/right exits must match the resolver's stable left-first tie break",
  );
});

test("nearest AABB direction gives collision support to the contacting side only", () => {
  const direction = nearestAabbContactDirectionXZ(21, 28, 0, 0, 20, 30);
  const towardWall = { x: -2, z: 0, radius: 0.5 };
  const awayFromWall = { x: 2, z: 0, radius: 0.5 };

  assert.equal(
    directionalAttachmentEnvelopeXZ(1, direction.x, direction.z, [towardWall]),
    2.5,
  );
  assert.equal(
    directionalAttachmentEnvelopeXZ(1, direction.x, direction.z, [awayFromWall]),
    1,
  );
});
