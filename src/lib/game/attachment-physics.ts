export type Vec3Like = Readonly<{ x: number; y: number; z: number }>;

export type QuaternionLike = Readonly<{
  x: number;
  y: number;
  z: number;
  w: number;
}>;

export type AttachmentPosition = { x: number; y: number; z: number };

export type AttachmentCircleXZ = {
  x: number;
  z: number;
  radius: number;
};

export type AttachmentSphere = AttachmentCircleXZ & {
  y: number;
};

export type OrientedContactBox = Readonly<{
  center: Vec3Like;
  halfExtents: Vec3Like;
  quaternion: QuaternionLike;
}>;

export type DirectionXZ = { x: number; z: number };

export const MIN_ATTACHMENT_OUTSIDE_SHARE = 0.55;
export const DEFAULT_ATTACHMENT_OUTSIDE_SHARE = 0.6;
export const MAX_ATTACHMENT_OUTSIDE_SHARE = 0.65;

const EPSILON = 1e-8;

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function mixedUnit(seed: number, salt: number) {
  let value = (Math.trunc(finite(seed)) ^ salt) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}

/** Stable unit vector used only when a contact has no usable direction. */
function fallbackSurfaceDirection(seed: number): AttachmentPosition {
  const y = mixedUnit(seed, 0x68bc21eb) * 2 - 1;
  const angle = mixedUnit(seed, 0x02e5be93) * Math.PI * 2;
  const horizontal = Math.sqrt(Math.max(0, 1 - y * y));
  return {
    x: Math.cos(angle) * horizontal,
    y,
    z: Math.sin(angle) * horizontal,
  };
}

/**
 * Converts a world-space vector from the rolling core to the pickup/contact
 * into the rolling body's local frame. The seed makes a zero-distance contact
 * stable across saves and devices instead of placing it randomly each frame.
 */
export function contactLocalSurfaceDirection(
  worldContactDelta: Vec3Like,
  rollWorldQuaternion: QuaternionLike,
  fallbackSeed: number,
): AttachmentPosition {
  const worldX = finite(worldContactDelta.x);
  const worldY = finite(worldContactDelta.y);
  const worldZ = finite(worldContactDelta.z);
  const worldLength = Math.hypot(worldX, worldY, worldZ);
  if (worldLength <= EPSILON) return fallbackSurfaceDirection(fallbackSeed);

  const quaternionLength = Math.hypot(
    finite(rollWorldQuaternion.x),
    finite(rollWorldQuaternion.y),
    finite(rollWorldQuaternion.z),
    finite(rollWorldQuaternion.w),
  );
  if (quaternionLength <= EPSILON) {
    return {
      x: worldX / worldLength,
      y: worldY / worldLength,
      z: worldZ / worldLength,
    };
  }

  // A conjugated, normalized world quaternion rotates world space into the
  // roll body's local frame. This is the allocation-free vector form of qvq⁻¹.
  const qx = -finite(rollWorldQuaternion.x) / quaternionLength;
  const qy = -finite(rollWorldQuaternion.y) / quaternionLength;
  const qz = -finite(rollWorldQuaternion.z) / quaternionLength;
  const qw = finite(rollWorldQuaternion.w) / quaternionLength;
  const tx = 2 * (qy * worldZ - qz * worldY);
  const ty = 2 * (qz * worldX - qx * worldZ);
  const tz = 2 * (qx * worldY - qy * worldX);
  const localX = worldX + qw * tx + (qy * tz - qz * ty);
  const localY = worldY + qw * ty + (qz * tx - qx * tz);
  const localZ = worldZ + qw * tz + (qx * ty - qy * tx);
  const localLength = Math.hypot(localX, localY, localZ);

  if (localLength <= EPSILON) return fallbackSurfaceDirection(fallbackSeed);
  return {
    x: localX / localLength,
    y: localY / localLength,
    z: localZ / localLength,
  };
}

/**
 * Places an authored model so 55–65% of its radial span remains outside the
 * visible core while its inward edge still overlaps the core and reads as stuck.
 */
export function targetAttachmentCenterDistance(
  visibleCoreRadius: number,
  inwardSupport: number,
  outwardSupport = inwardSupport,
  outsideShare = DEFAULT_ATTACHMENT_OUTSIDE_SHARE,
) {
  const core = Math.max(0, finite(visibleCoreRadius));
  const inward = Math.max(0, finite(inwardSupport));
  const outward = Math.max(0, finite(outwardSupport));
  const share = Math.max(
    MIN_ATTACHMENT_OUTSIDE_SHARE,
    Math.min(MAX_ATTACHMENT_OUTSIDE_SHARE, finite(outsideShare, DEFAULT_ATTACHMENT_OUTSIDE_SHARE)),
  );
  return Math.max(0, core - outward + (inward + outward) * share);
}

/**
 * Moves an existing attachment by the visible core's positive radius delta.
 * Its distance changes, but its angular direction does not.
 */
export function relocateAttachmentForCoreGrowth(
  position: Vec3Like,
  previousCoreRadius: number,
  nextCoreRadius: number,
  fallbackSeed = 0,
): AttachmentPosition {
  const x = finite(position.x);
  const y = finite(position.y);
  const z = finite(position.z);
  const currentDistance = Math.hypot(x, y, z);
  const growth = Math.max(
    0,
    Math.max(0, finite(nextCoreRadius)) -
      Math.max(0, finite(previousCoreRadius)),
  );
  if (growth <= EPSILON) return { x, y, z };

  const direction =
    currentDistance > EPSILON
      ? { x: x / currentDistance, y: y / currentDistance, z: z / currentDistance }
      : fallbackSurfaceDirection(fallbackSeed);
  const nextDistance = currentDistance + growth;
  return {
    x: direction.x * nextDistance,
    y: direction.y * nextDistance,
    z: direction.z * nextDistance,
  };
}

/**
 * Support radius of the core plus attached circular XZ bounds toward one
 * obstacle. An attachment behind the core has a negative projection, so it
 * cannot make the forward collision envelope wider.
 */
export function directionalAttachmentEnvelopeXZ(
  coreRadius: number,
  directionX: number,
  directionZ: number,
  attachments: readonly AttachmentCircleXZ[],
) {
  return directionalAttachmentEnvelope3D(
    coreRadius,
    directionX,
    0,
    directionZ,
    attachments,
  );
}

/**
 * Support of the core plus attached solid spheres toward any 3D direction.
 * This is used both horizontally for obstacles and downward for the changing
 * ground contact of an uneven roll.
 */
export function directionalAttachmentEnvelope3D(
  coreRadius: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  attachments: readonly (AttachmentSphere | AttachmentCircleXZ)[],
) {
  let envelope = Math.max(0, finite(coreRadius));
  const dx = finite(directionX);
  const dy = finite(directionY);
  const dz = finite(directionZ);
  const directionLength = Math.hypot(dx, dy, dz);
  if (directionLength <= EPSILON) return envelope;

  const nx = dx / directionLength;
  const ny = dy / directionLength;
  const nz = dz / directionLength;
  for (const attachment of attachments) {
    const radius = Math.max(0, finite(attachment.radius));
    const support =
      finite(attachment.x) * nx +
      finite("y" in attachment ? attachment.y : 0) * ny +
      finite(attachment.z) * nz +
      radius;
    envelope = Math.max(envelope, support);
  }
  return envelope;
}

type Axis3 = { x: number; y: number; z: number };

function quaternionAxes(quaternion: QuaternionLike): [Axis3, Axis3, Axis3] {
  const length = Math.hypot(
    finite(quaternion.x),
    finite(quaternion.y),
    finite(quaternion.z),
    finite(quaternion.w),
  );
  if (length <= EPSILON) {
    return [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
    ];
  }
  const x = finite(quaternion.x) / length;
  const y = finite(quaternion.y) / length;
  const z = finite(quaternion.z) / length;
  const w = finite(quaternion.w) / length;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const xw = x * w;
  const yw = y * w;
  const zw = z * w;
  return [
    {
      x: 1 - 2 * (yy + zz),
      y: 2 * (xy + zw),
      z: 2 * (xz - yw),
    },
    {
      x: 2 * (xy - zw),
      y: 1 - 2 * (xx + zz),
      z: 2 * (yz + xw),
    },
    {
      x: 2 * (xz + yw),
      y: 2 * (yz - xw),
      z: 1 - 2 * (xx + yy),
    },
  ];
}

function dot(first: Vec3Like, second: Vec3Like) {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function cross(first: Vec3Like, second: Vec3Like): Axis3 {
  return {
    x: first.y * second.z - first.z * second.y,
    y: first.z * second.x - first.x * second.z,
    z: first.x * second.y - first.y * second.x,
  };
}

function boxProjectionRadius(
  box: OrientedContactBox,
  axes: readonly Axis3[],
  direction: Vec3Like,
) {
  return (
    Math.abs(dot(axes[0], direction)) * Math.max(0, finite(box.halfExtents.x)) +
    Math.abs(dot(axes[1], direction)) * Math.max(0, finite(box.halfExtents.y)) +
    Math.abs(dot(axes[2], direction)) * Math.max(0, finite(box.halfExtents.z))
  );
}

/** Exact support of transformed attachment boxes toward any 3D direction. */
export function directionalOrientedBoxEnvelope3D(
  coreRadius: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  attachments: readonly OrientedContactBox[],
) {
  let envelope = Math.max(0, finite(coreRadius));
  const length = Math.hypot(directionX, directionY, directionZ);
  if (length <= EPSILON) return envelope;
  const directionXNormalized = finite(directionX) / length;
  const directionYNormalized = finite(directionY) / length;
  const directionZNormalized = finite(directionZ) / length;
  for (const attachment of attachments) {
    const quaternionLength = Math.hypot(
      finite(attachment.quaternion.x),
      finite(attachment.quaternion.y),
      finite(attachment.quaternion.z),
      finite(attachment.quaternion.w),
    );
    const reciprocalLength = quaternionLength > EPSILON ? 1 / quaternionLength : 0;
    const x = finite(attachment.quaternion.x) * reciprocalLength;
    const y = finite(attachment.quaternion.y) * reciprocalLength;
    const z = finite(attachment.quaternion.z) * reciprocalLength;
    const w = quaternionLength > EPSILON
      ? finite(attachment.quaternion.w) * reciprocalLength
      : 1;
    const xx = x * x;
    const yy = y * y;
    const zz = z * z;
    const xy = x * y;
    const xz = x * z;
    const yz = y * z;
    const xw = x * w;
    const yw = y * w;
    const zw = z * w;
    const axisXDot =
      (1 - 2 * (yy + zz)) * directionXNormalized +
      2 * (xy + zw) * directionYNormalized +
      2 * (xz - yw) * directionZNormalized;
    const axisYDot =
      2 * (xy - zw) * directionXNormalized +
      (1 - 2 * (xx + zz)) * directionYNormalized +
      2 * (yz + xw) * directionZNormalized;
    const axisZDot =
      2 * (xz + yw) * directionXNormalized +
      2 * (yz - xw) * directionYNormalized +
      (1 - 2 * (xx + yy)) * directionZNormalized;
    const projectionRadius =
      Math.abs(axisXDot) * Math.max(0, finite(attachment.halfExtents.x)) +
      Math.abs(axisYDot) * Math.max(0, finite(attachment.halfExtents.y)) +
      Math.abs(axisZDot) * Math.max(0, finite(attachment.halfExtents.z));
    envelope = Math.max(
      envelope,
      finite(attachment.center.x) * directionXNormalized +
        finite(attachment.center.y) * directionYNormalized +
        finite(attachment.center.z) * directionZNormalized +
        projectionRadius,
    );
  }
  return envelope;
}

function inverseRotateByQuaternion(
  x: number,
  y: number,
  z: number,
  quaternion: QuaternionLike,
) {
  const length = Math.hypot(
    finite(quaternion.x),
    finite(quaternion.y),
    finite(quaternion.z),
    finite(quaternion.w),
  );
  if (length <= EPSILON) return { x, y, z };
  const qx = -finite(quaternion.x) / length;
  const qy = -finite(quaternion.y) / length;
  const qz = -finite(quaternion.z) / length;
  const qw = finite(quaternion.w) / length;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return {
    x: x + qw * tx + (qy * tz - qz * ty),
    y: y + qw * ty + (qz * tx - qx * tz),
    z: z + qw * tz + (qx * ty - qy * tx),
  };
}

/** Exact sphere-to-OBB overlap. Visual effects are intentionally excluded. */
export function sphereIntersectsOrientedBox(
  sphereCenter: Vec3Like,
  sphereRadius: number,
  box: OrientedContactBox,
) {
  const relative = inverseRotateByQuaternion(
    finite(sphereCenter.x) - finite(box.center.x),
    finite(sphereCenter.y) - finite(box.center.y),
    finite(sphereCenter.z) - finite(box.center.z),
    box.quaternion,
  );
  const halfX = Math.max(0, finite(box.halfExtents.x));
  const halfY = Math.max(0, finite(box.halfExtents.y));
  const halfZ = Math.max(0, finite(box.halfExtents.z));
  const nearestX = Math.max(-halfX, Math.min(halfX, relative.x));
  const nearestY = Math.max(-halfY, Math.min(halfY, relative.y));
  const nearestZ = Math.max(-halfZ, Math.min(halfZ, relative.z));
  const radius = Math.max(0, finite(sphereRadius));
  return (
    (relative.x - nearestX) ** 2 +
      (relative.y - nearestY) ** 2 +
      (relative.z - nearestZ) ** 2 <=
    radius ** 2 + EPSILON
  );
}

/** Separating-axis test for two fully oriented solid bounds. */
export function orientedContactBoxesIntersect(
  first: OrientedContactBox,
  second: OrientedContactBox,
  firstCenterOffset: Vec3Like = { x: 0, y: 0, z: 0 },
) {
  const firstAxes = quaternionAxes(first.quaternion);
  const secondAxes = quaternionAxes(second.quaternion);
  const centerDelta = {
    x:
      finite(second.center.x) -
      (finite(first.center.x) + finite(firstCenterOffset.x)),
    y:
      finite(second.center.y) -
      (finite(first.center.y) + finite(firstCenterOffset.y)),
    z:
      finite(second.center.z) -
      (finite(first.center.z) + finite(firstCenterOffset.z)),
  };
  const axes = [
    ...firstAxes,
    ...secondAxes,
    ...firstAxes.flatMap((firstAxis) =>
      secondAxes.map((secondAxis) => cross(firstAxis, secondAxis)),
    ),
  ];
  for (const axis of axes) {
    const lengthSquared = dot(axis, axis);
    if (lengthSquared <= EPSILON) continue;
    const firstRadius = boxProjectionRadius(first, firstAxes, axis);
    const secondRadius = boxProjectionRadius(second, secondAxes, axis);
    if (
      Math.abs(dot(centerDelta, axis)) >
      firstRadius + secondRadius + EPSILON
    ) {
      return false;
    }
  }
  return true;
}

/** Core sphere plus attached solid OBBs; effects and empty hull corners do not stick. */
export function stickyBodyIntersectsOrientedBox(
  coreCenter: Vec3Like,
  coreRadius: number,
  attachments: readonly OrientedContactBox[],
  box: OrientedContactBox,
) {
  if (sphereIntersectsOrientedBox(coreCenter, coreRadius, box)) return true;
  return attachments.some((attachment) =>
    orientedContactBoxesIntersect(attachment, box, coreCenter),
  );
}

/** Signed rotation needed to roll a travelled distance around current support. */
export function rollingAngleForDistance(
  distance: number,
  supportRadius: number,
) {
  return finite(distance) / Math.max(0.05, Math.max(0, finite(supportRadius)));
}

/**
 * Unit direction from a point toward its nearest AABB contact. For a point
 * already inside the box, this selects the minimum-penetration exit face in
 * the same stable left/right/back/front order as the collision resolver.
 */
export function nearestAabbContactDirectionXZ(
  pointX: number,
  pointZ: number,
  boxX: number,
  boxZ: number,
  halfWidth: number,
  halfDepth: number,
): DirectionXZ {
  const px = finite(pointX);
  const pz = finite(pointZ);
  const centerX = finite(boxX);
  const centerZ = finite(boxZ);
  const width = Math.max(0, finite(halfWidth));
  const depth = Math.max(0, finite(halfDepth));
  const minX = centerX - width;
  const maxX = centerX + width;
  const minZ = centerZ - depth;
  const maxZ = centerZ + depth;
  const nearestX = Math.max(minX, Math.min(px, maxX));
  const nearestZ = Math.max(minZ, Math.min(pz, maxZ));
  const dx = nearestX - px;
  const dz = nearestZ - pz;
  const distance = Math.hypot(dx, dz);

  if (distance > EPSILON) {
    return { x: dx / distance, z: dz / distance };
  }

  const exits = [
    { distance: px - minX, x: -1, z: 0 },
    { distance: maxX - px, x: 1, z: 0 },
    { distance: pz - minZ, x: 0, z: -1 },
    { distance: maxZ - pz, x: 0, z: 1 },
  ];
  let nearestExit = exits[0];
  for (let index = 1; index < exits.length; index += 1) {
    if (exits[index].distance < nearestExit.distance) {
      nearestExit = exits[index];
    }
  }
  return { x: nearestExit.x, z: nearestExit.z };
}
