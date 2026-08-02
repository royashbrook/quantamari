import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ATTACHMENT_OUTSIDE_SHARE,
  MIN_ATTACHMENT_OUTSIDE_SHARE,
  contactLocalSurfaceDirection,
  directionalAttachmentEnvelope3D,
  directionalAttachmentEnvelopeXZ,
  directionalOrientedBoxEnvelope3D,
  nearestAabbContactDirectionXZ,
  orientedContactBoxesIntersect,
  relocateAttachmentForCoreGrowth,
  rollingAngleForDistance,
  sphereIntersectsOrientedBox,
  stickyBodyIntersectsOrientedBox,
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

test("3D support makes only an attachment beneath the core change ride height", () => {
  const attachments = [
    { x: 0, y: -1.7, z: 0, radius: 0.45 },
    { x: 0, y: 1.9, z: 0, radius: 0.6 },
  ];

  assert.equal(
    directionalAttachmentEnvelope3D(1, 0, -1, 0, attachments),
    2.15,
  );
  assert.equal(
    directionalAttachmentEnvelope3D(1, 0, 1, 0, attachments),
    2.5,
  );
});

test("sphere-to-oriented-box contact rejects horizontal and vertical air gaps", () => {
  const halfAngle = Math.PI / 4;
  const box = {
    center: { x: 4, y: 1, z: 0 },
    halfExtents: { x: 1, y: 0.25, z: 0.4 },
    quaternion: {
      x: 0,
      y: Math.sin(halfAngle),
      z: 0,
      w: Math.cos(halfAngle),
    },
  };

  assert.equal(
    sphereIntersectsOrientedBox({ x: 4, y: 1.3, z: 1.3 }, 0.7, box),
    true,
    "the sphere reaches the rotated long face",
  );
  assert.equal(
    sphereIntersectsOrientedBox({ x: 4, y: 2.01, z: 1.3 }, 0.7, box),
    false,
    "horizontal overlap cannot collect through a vertical gap",
  );
  assert.equal(
    sphereIntersectsOrientedBox({ x: 4, y: 1.3, z: 1.71 }, 0.7, box),
    false,
    "a visible horizontal gap cannot be treated as attraction",
  );
});

test("sticky contact uses the touching attachment, never one on the far side", () => {
  const box = {
    center: { x: 3.2, y: 0, z: 0 },
    halfExtents: { x: 0.25, y: 0.25, z: 0.25 },
    quaternion: IDENTITY,
  };
  const core = { x: 0, y: 0, z: 0 };

  assert.equal(stickyBodyIntersectsOrientedBox(core, 1, [], box), false);
  assert.equal(
    stickyBodyIntersectsOrientedBox(
      core,
      1,
      [{
        center: { x: 2.5, y: 0, z: 0 },
        halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
        quaternion: IDENTITY,
      }],
      box,
    ),
    true,
  );
  assert.equal(
    stickyBodyIntersectsOrientedBox(
      core,
      1,
      [{
        center: { x: -2.5, y: 0, z: 0 },
        halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
        quaternion: IDENTITY,
      }],
      box,
    ),
    false,
  );
});

test("a long thin attachment has no sticky bounding-sphere corners", () => {
  const attachment = {
    center: { x: 2, y: 0, z: 0 },
    halfExtents: { x: 1.5, y: 0.15, z: 0.15 },
    quaternion: IDENTITY,
  };
  const emptyCorner = {
    center: { x: 3.25, y: 0, z: 0.72 },
    halfExtents: { x: 0.1, y: 0.1, z: 0.1 },
    quaternion: IDENTITY,
  };
  const touchingTip = {
    ...emptyCorner,
    center: { x: 3.55, y: 0, z: 0 },
  };

  assert.equal(orientedContactBoxesIntersect(attachment, emptyCorner), false);
  assert.equal(orientedContactBoxesIntersect(attachment, touchingTip), true);
  assert.equal(
    stickyBodyIntersectsOrientedBox(
      { x: 0, y: 0, z: 0 },
      0.5,
      [attachment],
      emptyCorner,
    ),
    false,
  );
});

test("oriented attachment support changes as its long axis rotates underfoot", () => {
  const halfAngle = Math.PI / 4;
  const horizontal = {
    center: { x: 0, y: -1, z: 0 },
    halfExtents: { x: 1.5, y: 0.2, z: 0.2 },
    quaternion: IDENTITY,
  };
  const vertical = {
    ...horizontal,
    quaternion: {
      x: 0,
      y: 0,
      z: Math.sin(halfAngle),
      w: Math.cos(halfAngle),
    },
  };

  closeTo(directionalOrientedBoxEnvelope3D(0.8, 0, -1, 0, [horizontal]), 1.2);
  closeTo(directionalOrientedBoxEnvelope3D(0.8, 0, -1, 0, [vertical]), 2.5);
});

test("uneven ground support changes angular travel instead of rolling uniformly", () => {
  closeTo(rollingAngleForDistance(1, 1), 1);
  closeTo(rollingAngleForDistance(1, 2.5), 0.4);
  closeTo(rollingAngleForDistance(-1, 2.5), -0.4);
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
