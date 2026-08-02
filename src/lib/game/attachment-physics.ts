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

export type DirectionXZ = { x: number; z: number };

export const MIN_ATTACHMENT_OUTSIDE_SHARE = 0.55;
export const DEFAULT_ATTACHMENT_OUTSIDE_SHARE = 0.6;
export const MAX_ATTACHMENT_OUTSIDE_SHARE = 0.65;
export const MAX_ATTACHMENT_SUPPORT_CORE_SHARE = 0.6;

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
 * Returns one uniform multiplier for an attachment's already-authored scale.
 * A scalar fit preserves every axis ratio and becomes idempotent once the
 * model's radial support is within budget, so authored and batched LODs can
 * store and reuse the exact same fitted scale.
 */
export function attachmentSupportScaleFit(
  authoredSupportRadius: number,
  visibleCoreRadius: number,
  maximumSupportShare = MAX_ATTACHMENT_SUPPORT_CORE_SHARE,
) {
  const support = Math.max(0, finite(authoredSupportRadius));
  const core = Math.max(0, finite(visibleCoreRadius));
  const share = Math.max(
    0,
    finite(maximumSupportShare, MAX_ATTACHMENT_SUPPORT_CORE_SHARE),
  );
  if (support <= EPSILON || core <= EPSILON || share <= EPSILON) return 1;
  return Math.min(1, (core * share) / support);
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
  let envelope = Math.max(0, finite(coreRadius));
  const dx = finite(directionX);
  const dz = finite(directionZ);
  const directionLength = Math.hypot(dx, dz);
  if (directionLength <= EPSILON) return envelope;

  const nx = dx / directionLength;
  const nz = dz / directionLength;
  for (const attachment of attachments) {
    const radius = Math.max(0, finite(attachment.radius));
    const support = finite(attachment.x) * nx + finite(attachment.z) * nz + radius;
    envelope = Math.max(envelope, support);
  }
  return envelope;
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
