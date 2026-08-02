import assert from "node:assert/strict";
import test from "node:test";

import {
  CORE_CONTACT_OWNER,
  MAX_ATTACHMENT_OUTSIDE_SHARE,
  MIN_ATTACHMENT_OUTSIDE_SHARE,
  NO_CONTACT_OWNER,
  contactLocalSurfaceDirection,
  deepGlomAttachmentCenterDistance,
  directionalAttachmentEnvelope3D,
  directionalAttachmentEnvelopeXZ,
  directionalOrientedBoxEnvelope3D,
  nearestAabbContactDirectionXZ,
  orientedContactBoxesIntersect,
  orientedBoxAttachmentSupports,
  relocateAttachmentForCoreGrowth,
  rollingAngleForDistance,
  sphereIntersectsOrientedBox,
  stickyBodyIntersectsOrientedBox,
  stickyBodyOrientedBoxContact,
  targetAttachmentCenterDistance,
} from "../../src/lib/game/attachment-physics.ts";

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const closeTo = (actual, expected, epsilon = 1e-10) =>
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
const contactResult = () => ({
  ownerIndex: 999,
  normalX: 999,
  normalY: 999,
  normalZ: 999,
  penetration: 999,
});

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

test("scaled off-center OBB support is asymmetric about the pickup origin", () => {
  const box = {
    center: { x: 0.25, y: 0, z: 0 },
    halfExtents: { x: 1, y: 0.5, z: 0.25 },
    quaternion: IDENTITY,
  };
  const supports = orientedBoxAttachmentSupports(
    box,
    { x: 10, y: 0, z: 0 },
    { x: 2, y: 1, z: 1 },
  );

  closeTo(supports.inwardSupport, 1.5);
  closeTo(supports.outwardSupport, 2.5);
});

test("OBB support follows authored rotation in the attachment's local frame", () => {
  const halfAngle = Math.PI / 4;
  const supports = orientedBoxAttachmentSupports(
    {
      center: { x: 0.25, y: 0, z: 0 },
      halfExtents: { x: 1, y: 0.5, z: 0.25 },
      quaternion: {
        x: 0,
        y: Math.sin(halfAngle),
        z: 0,
        w: Math.cos(halfAngle),
      },
    },
    { x: 0, y: 0, z: -1 },
    { x: 2, y: 1, z: 1 },
  );

  closeTo(supports.inwardSupport, 1.5);
  closeTo(supports.outwardSupport, 2.5);
});

test("deep glom moves a just-contacting OBB inward but never pulls one outward", () => {
  const supports = { inwardSupport: 1.5, outwardSupport: 2.5 };
  const justContactingDistance = 4 + supports.inwardSupport;
  const desiredDistance = targetAttachmentCenterDistance(
    4,
    supports.inwardSupport,
    supports.outwardSupport,
  );

  closeTo(
    deepGlomAttachmentCenterDistance(4, justContactingDistance, supports),
    desiredDistance,
  );
  assert.ok(desiredDistance < justContactingDistance);
  assert.equal(
    deepGlomAttachmentCenterDistance(4, 3.2, supports),
    3.2,
    "an already-deeper attachment must not move back toward the surface",
  );
});

test("degenerate attachment directions have no directional support", () => {
  assert.deepEqual(
    orientedBoxAttachmentSupports(
      {
        center: { x: 1, y: 2, z: 3 },
        halfExtents: { x: 4, y: 5, z: 6 },
        quaternion: IDENTITY,
      },
      { x: 0, y: 0, z: 0 },
    ),
    { inwardSupport: 0, outwardSupport: 0 },
  );
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

test("core manifold reports owner, outward normal, and world-space penetration", () => {
  const result = contactResult();
  assert.equal(
    stickyBodyOrientedBoxContact(
      { x: 0, y: 0, z: 0 },
      1,
      [],
      {
        center: { x: 1.75, y: 0, z: 0 },
        halfExtents: { x: 0.8, y: 0.4, z: 0.4 },
        quaternion: IDENTITY,
      },
      result,
    ),
    true,
  );
  assert.equal(result.ownerIndex, CORE_CONTACT_OWNER);
  closeTo(result.normalX, 1);
  closeTo(result.normalY, 0);
  closeTo(result.normalZ, 0);
  closeTo(result.penetration, 0.05);
});

test("sphere manifold follows a rotated OBB face and resolves inside centers", () => {
  const halfAngle = Math.PI / 4;
  const quaternion = {
    x: 0,
    y: Math.sin(halfAngle),
    z: 0,
    w: Math.cos(halfAngle),
  };
  const result = contactResult();
  assert.equal(
    stickyBodyOrientedBoxContact(
      { x: 0, y: 0, z: 0 },
      1,
      [],
      {
        center: { x: 0, y: 0, z: -1.4 },
        halfExtents: { x: 0.5, y: 0.4, z: 0.3 },
        quaternion,
      },
      result,
    ),
    true,
  );
  closeTo(result.normalX, 0);
  closeTo(result.normalY, 0);
  closeTo(result.normalZ, -1);
  closeTo(result.penetration, 0.1);

  assert.equal(
    stickyBodyOrientedBoxContact(
      { x: 0.25, y: 0, z: 0 },
      0.5,
      [],
      {
        center: { x: 0, y: 0, z: 0 },
        halfExtents: { x: 1, y: 1, z: 1 },
        quaternion: IDENTITY,
      },
      result,
    ),
    true,
  );
  closeTo(result.normalX, -1);
  closeTo(result.normalY, 0);
  closeTo(result.normalZ, 0);
  closeTo(result.penetration, 1.25);
});

test("rotated attachment OBB owns the contact with its face normal", () => {
  const halfAngle = Math.PI / 4;
  const quaternion = {
    x: 0,
    y: Math.sin(halfAngle),
    z: 0,
    w: Math.cos(halfAngle),
  };
  const result = contactResult();
  assert.equal(
    stickyBodyOrientedBoxContact(
      { x: 0, y: 0, z: 0 },
      0.05,
      [{
        center: { x: 0, y: 0, z: 0 },
        halfExtents: { x: 0.5, y: 0.5, z: 0.25 },
        quaternion,
      }],
      {
        center: { x: 0, y: 0, z: -0.85 },
        halfExtents: { x: 0.4, y: 0.4, z: 0.2 },
        quaternion,
      },
      result,
    ),
    true,
  );
  assert.equal(result.ownerIndex, 0);
  closeTo(result.normalX, 0);
  closeTo(result.normalY, 0);
  closeTo(result.normalZ, -1);
  closeTo(result.penetration, 0.05);
});

test("OBB manifold rejects a cross-axis-only separation", () => {
  const result = contactResult();
  const first = {
    center: { x: 0, y: 0, z: 0 },
    halfExtents: { x: 1, y: 0.5, z: 0.3 },
    quaternion: IDENTITY,
  };
  const separated = {
    center: { x: -2, y: -1.1, z: 0.1 },
    halfExtents: first.halfExtents,
    quaternion: {
      x: 0.12940952255126037,
      y: 0.12940952255126037,
      z: 0.01703708685546585,
      w: 0.9829629131445341,
    },
  };

  assert.equal(
    stickyBodyOrientedBoxContact(
      { x: 0, y: 0, z: 0 },
      0,
      [first],
      separated,
      result,
    ),
    false,
  );
});

test("near-parallel cross-axis penetration is normalized to world units", () => {
  const result = contactResult();
  const halfExtents = { x: 1, y: 0.5, z: 0.3 };
  assert.equal(
    stickyBodyOrientedBoxContact(
      { x: 0, y: 0, z: 0 },
      0,
      [{ center: { x: 0, y: 0, z: 0 }, halfExtents, quaternion: IDENTITY }],
      {
        center: { x: -1.98, y: -0.98, z: -0.3 },
        halfExtents,
        quaternion: {
          x: 0.008726203218641756,
          y: 0.008726203218641756,
          z: 0.00007615242180438042,
          w: 0.9999238475781956,
        },
      },
      result,
    ),
    true,
  );
  assert.equal(result.ownerIndex, 0);
  closeTo(result.normalX, 0);
  closeTo(result.normalY, -0.9998476951563913);
  closeTo(result.normalZ, -0.017452406437283515);
  closeTo(result.penetration, 0.0200731063249322);
});

test("compound manifold chooses the deepest owner with stable ties", () => {
  const result = contactResult();
  const candidate = {
    center: { x: 1.6, y: 0, z: 0 },
    halfExtents: { x: 0.7, y: 0.7, z: 0.7 },
    quaternion: IDENTITY,
  };
  const first = {
    center: { x: 0, y: 0, z: 0 },
    halfExtents: { x: 1, y: 1, z: 1 },
    quaternion: IDENTITY,
  };
  const deeper = {
    ...first,
    center: { x: 0.2, y: 0, z: 0 },
  };

  assert.equal(
    stickyBodyOrientedBoxContact(
      { x: 0, y: 0, z: 0 },
      0,
      [first, deeper],
      candidate,
      result,
    ),
    true,
  );
  assert.equal(result.ownerIndex, 1);
  closeTo(result.penetration, 0.3);

  stickyBodyOrientedBoxContact(
    { x: 0, y: 0, z: 0 },
    0,
    [first, first],
    candidate,
    result,
  );
  assert.equal(result.ownerIndex, 0, "equal attachments keep the lower index");
});

test("core wins a penetration tie and exact touching still produces a contact", () => {
  const result = contactResult();
  const candidate = {
    center: { x: 1.5, y: 0, z: 0 },
    halfExtents: { x: 0.6, y: 0.6, z: 0.6 },
    quaternion: IDENTITY,
  };
  assert.equal(
    stickyBodyOrientedBoxContact(
      { x: 0, y: 0, z: 0 },
      1,
      [{
        center: { x: 0, y: 0, z: 0 },
        halfExtents: { x: 1, y: 1, z: 1 },
        quaternion: IDENTITY,
      }],
      candidate,
      result,
    ),
    true,
  );
  assert.equal(result.ownerIndex, CORE_CONTACT_OWNER);
  closeTo(result.penetration, 0.1);

  assert.equal(
    stickyBodyOrientedBoxContact(
      { x: 0, y: 0, z: 0 },
      1,
      [],
      {
        center: { x: 2, y: 0, z: 0 },
        halfExtents: { x: 1, y: 0.5, z: 0.5 },
        quaternion: IDENTITY,
      },
      result,
    ),
    true,
  );
  assert.equal(result.ownerIndex, CORE_CONTACT_OWNER);
  closeTo(result.penetration, 0);
});

test("manifold miss clears stale output and inward motion deepens contact", () => {
  const result = contactResult();
  const candidate = {
    center: { x: 1.75, y: 0, z: 0 },
    halfExtents: { x: 0.8, y: 0.4, z: 0.4 },
    quaternion: IDENTITY,
  };
  stickyBodyOrientedBoxContact(
    { x: 0, y: 0, z: 0 },
    1,
    [],
    candidate,
    result,
  );
  const initialPenetration = result.penetration;
  stickyBodyOrientedBoxContact(
    { x: 0, y: 0, z: 0 },
    1,
    [],
    { ...candidate, center: { x: 1.55, y: 0, z: 0 } },
    result,
  );
  closeTo(result.penetration - initialPenetration, 0.2);

  assert.equal(
    stickyBodyOrientedBoxContact(
      { x: 0, y: 0, z: 0 },
      0.1,
      [],
      { ...candidate, center: { x: 10, y: 0, z: 0 } },
      result,
    ),
    false,
  );
  assert.deepEqual(result, {
    ownerIndex: NO_CONTACT_OWNER,
    normalX: 0,
    normalY: 0,
    normalZ: 0,
    penetration: 0,
  });
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
