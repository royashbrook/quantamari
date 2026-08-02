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

export type AttachmentDirectionalSupports = Readonly<{
  inwardSupport: number;
  outwardSupport: number;
}>;

export type StickyContactManifold = {
  ownerIndex: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  penetration: number;
};

export type DirectionXZ = { x: number; z: number };

export const MIN_ATTACHMENT_OUTSIDE_SHARE = 0.55;
export const DEFAULT_ATTACHMENT_OUTSIDE_SHARE = 0.6;
export const MAX_ATTACHMENT_OUTSIDE_SHARE = 0.65;
export const NO_CONTACT_OWNER = -2;
export const CORE_CONTACT_OWNER = -1;

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
 * Measures a scaled authored OBB from its pickup origin along the local
 * outward direction. An off-center bound can therefore have different inward
 * and outward supports even when its half-extents are symmetric.
 */
export function orientedBoxAttachmentSupports(
  box: OrientedContactBox,
  outwardDirection: Vec3Like,
  scale: Vec3Like = { x: 1, y: 1, z: 1 },
): AttachmentDirectionalSupports {
  const directionX = finite(outwardDirection.x);
  const directionY = finite(outwardDirection.y);
  const directionZ = finite(outwardDirection.z);
  const directionLength = Math.hypot(directionX, directionY, directionZ);
  if (directionLength <= EPSILON) {
    return { inwardSupport: 0, outwardSupport: 0 };
  }

  const direction = {
    x: directionX / directionLength,
    y: directionY / directionLength,
    z: directionZ / directionLength,
  };
  const scaleX = finite(scale.x, 1);
  const scaleY = finite(scale.y, 1);
  const scaleZ = finite(scale.z, 1);
  const axes = quaternionAxes(box.quaternion);
  const axisXProjection = dot(axes[0], direction);
  const axisYProjection = dot(axes[1], direction);
  const axisZProjection = dot(axes[2], direction);
  const centerProjection =
    finite(box.center.x) * scaleX * axisXProjection +
    finite(box.center.y) * scaleY * axisYProjection +
    finite(box.center.z) * scaleZ * axisZProjection;
  const projectionRadius =
    Math.abs(axisXProjection) * Math.max(0, finite(box.halfExtents.x)) * Math.abs(scaleX) +
    Math.abs(axisYProjection) * Math.max(0, finite(box.halfExtents.y)) * Math.abs(scaleY) +
    Math.abs(axisZProjection) * Math.max(0, finite(box.halfExtents.z)) * Math.abs(scaleZ);

  return {
    inwardSupport: Math.max(0, projectionRadius - centerProjection),
    outwardSupport: Math.max(0, projectionRadius + centerProjection),
  };
}

/**
 * Deepens a pickup to the requested visible overlap without ever moving an
 * attachment outward when it is already at least that deeply embedded.
 */
export function deepGlomAttachmentCenterDistance(
  visibleCoreRadius: number,
  currentCenterDistance: number,
  supports: AttachmentDirectionalSupports,
  outsideShare = DEFAULT_ATTACHMENT_OUTSIDE_SHARE,
) {
  const current = Math.max(0, finite(currentCenterDistance));
  const target = targetAttachmentCenterDistance(
    visibleCoreRadius,
    supports.inwardSupport,
    supports.outwardSupport,
    outsideShare,
  );
  return Math.min(current, target);
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

type ContactAxisResult = Pick<
  StickyContactManifold,
  "normalX" | "normalY" | "normalZ" | "penetration"
>;

function clearContactAxis(out: ContactAxisResult) {
  out.normalX = 0;
  out.normalY = 0;
  out.normalZ = 0;
  out.penetration = 0;
}

function sphereOrientedBoxContact(
  sphereCenter: Vec3Like,
  sphereRadius: number,
  box: OrientedContactBox,
  out: ContactAxisResult,
) {
  let qx = finite(box.quaternion.x);
  let qy = finite(box.quaternion.y);
  let qz = finite(box.quaternion.z);
  let qw = finite(box.quaternion.w);
  const quaternionLength = Math.hypot(qx, qy, qz, qw);
  if (quaternionLength <= EPSILON) {
    qx = 0;
    qy = 0;
    qz = 0;
    qw = 1;
  } else {
    qx /= quaternionLength;
    qy /= quaternionLength;
    qz /= quaternionLength;
    qw /= quaternionLength;
  }

  const worldX = finite(sphereCenter.x) - finite(box.center.x);
  const worldY = finite(sphereCenter.y) - finite(box.center.y);
  const worldZ = finite(sphereCenter.z) - finite(box.center.z);
  const inverseX = -qx;
  const inverseY = -qy;
  const inverseZ = -qz;
  const localTx = 2 * (inverseY * worldZ - inverseZ * worldY);
  const localTy = 2 * (inverseZ * worldX - inverseX * worldZ);
  const localTz = 2 * (inverseX * worldY - inverseY * worldX);
  const relativeX =
    worldX + qw * localTx + (inverseY * localTz - inverseZ * localTy);
  const relativeY =
    worldY + qw * localTy + (inverseZ * localTx - inverseX * localTz);
  const relativeZ =
    worldZ + qw * localTz + (inverseX * localTy - inverseY * localTx);
  const halfX = Math.max(0, finite(box.halfExtents.x));
  const halfY = Math.max(0, finite(box.halfExtents.y));
  const halfZ = Math.max(0, finite(box.halfExtents.z));
  const nearestX = Math.max(-halfX, Math.min(halfX, relativeX));
  const nearestY = Math.max(-halfY, Math.min(halfY, relativeY));
  const nearestZ = Math.max(-halfZ, Math.min(halfZ, relativeZ));
  const deltaX = nearestX - relativeX;
  const deltaY = nearestY - relativeY;
  const deltaZ = nearestZ - relativeZ;
  const distanceSquared = deltaX ** 2 + deltaY ** 2 + deltaZ ** 2;
  const radius = Math.max(0, finite(sphereRadius));
  if (distanceSquared > radius ** 2 + EPSILON) {
    clearContactAxis(out);
    return false;
  }

  let localNormalX: number;
  let localNormalY: number;
  let localNormalZ: number;
  if (distanceSquared > EPSILON) {
    const distance = Math.sqrt(distanceSquared);
    localNormalX = deltaX / distance;
    localNormalY = deltaY / distance;
    localNormalZ = deltaZ / distance;
    out.penetration = Math.max(0, radius - distance);
  } else {
    // The sphere center is inside the box. Choose the nearest exit face, then
    // point opposite it: translating the queried box along this normal is its
    // minimum separating motion relative to the sphere owner.
    let faceDistance = halfX + relativeX;
    let faceX = -1;
    let faceY = 0;
    let faceZ = 0;
    const positiveXDistance = halfX - relativeX;
    if (positiveXDistance < faceDistance) {
      faceDistance = positiveXDistance;
      faceX = 1;
    }
    const negativeYDistance = halfY + relativeY;
    if (negativeYDistance < faceDistance) {
      faceDistance = negativeYDistance;
      faceX = 0;
      faceY = -1;
    }
    const positiveYDistance = halfY - relativeY;
    if (positiveYDistance < faceDistance) {
      faceDistance = positiveYDistance;
      faceX = 0;
      faceY = 1;
    }
    const negativeZDistance = halfZ + relativeZ;
    if (negativeZDistance < faceDistance) {
      faceDistance = negativeZDistance;
      faceX = 0;
      faceY = 0;
      faceZ = -1;
    }
    const positiveZDistance = halfZ - relativeZ;
    if (positiveZDistance < faceDistance) {
      faceDistance = positiveZDistance;
      faceX = 0;
      faceY = 0;
      faceZ = 1;
    }
    localNormalX = -faceX;
    localNormalY = -faceY;
    localNormalZ = -faceZ;
    out.penetration = radius + Math.max(0, faceDistance);
  }

  const normalTx = 2 * (qy * localNormalZ - qz * localNormalY);
  const normalTy = 2 * (qz * localNormalX - qx * localNormalZ);
  const normalTz = 2 * (qx * localNormalY - qy * localNormalX);
  out.normalX =
    localNormalX + qw * normalTx + (qy * normalTz - qz * normalTy);
  out.normalY =
    localNormalY + qw * normalTy + (qz * normalTx - qx * normalTz);
  out.normalZ =
    localNormalZ + qw * normalTz + (qx * normalTy - qy * normalTx);
  const normalLength = Math.hypot(out.normalX, out.normalY, out.normalZ);
  if (normalLength > EPSILON) {
    out.normalX /= normalLength;
    out.normalY /= normalLength;
    out.normalZ /= normalLength;
  }
  return true;
}

function considerOrientedBoxAxis(
  axisX: number,
  axisY: number,
  axisZ: number,
  signedDistance: number,
  firstRadius: number,
  secondRadius: number,
  out: ContactAxisResult,
) {
  const lengthSquared = axisX ** 2 + axisY ** 2 + axisZ ** 2;
  if (lengthSquared <= EPSILON) return true;
  const axisLength = Math.sqrt(lengthSquared);
  const penetration =
    (firstRadius + secondRadius - Math.abs(signedDistance)) / axisLength;
  if (penetration < -EPSILON) return false;
  if (Math.max(0, penetration) + EPSILON >= out.penetration) return true;

  let normalX = axisX / axisLength;
  let normalY = axisY / axisLength;
  let normalZ = axisZ / axisLength;
  const canonicalAxisIsNegative =
    normalX < -EPSILON ||
    (Math.abs(normalX) <= EPSILON && normalY < -EPSILON) ||
    (Math.abs(normalX) <= EPSILON &&
      Math.abs(normalY) <= EPSILON &&
      normalZ < 0);
  if (
    signedDistance < -EPSILON ||
    (Math.abs(signedDistance) <= EPSILON && canonicalAxisIsNegative)
  ) {
    normalX = -normalX;
    normalY = -normalY;
    normalZ = -normalZ;
  }
  out.normalX = normalX;
  out.normalY = normalY;
  out.normalZ = normalZ;
  out.penetration = Math.max(0, penetration);
  return true;
}

function considerOrientedBoxCrossAxis(
  firstAxisX: number,
  firstAxisY: number,
  firstAxisZ: number,
  secondAxisX: number,
  secondAxisY: number,
  secondAxisZ: number,
  centerDeltaX: number,
  centerDeltaY: number,
  centerDeltaZ: number,
  firstRadius: number,
  secondRadius: number,
  out: ContactAxisResult,
) {
  const axisX = firstAxisY * secondAxisZ - firstAxisZ * secondAxisY;
  const axisY = firstAxisZ * secondAxisX - firstAxisX * secondAxisZ;
  const axisZ = firstAxisX * secondAxisY - firstAxisY * secondAxisX;
  return considerOrientedBoxAxis(
    axisX,
    axisY,
    axisZ,
    centerDeltaX * axisX + centerDeltaY * axisY + centerDeltaZ * axisZ,
    firstRadius,
    secondRadius,
    out,
  );
}

function orientedBoxesContact(
  first: OrientedContactBox,
  second: OrientedContactBox,
  firstCenterOffset: Vec3Like,
  out: ContactAxisResult,
) {
  let firstQx = finite(first.quaternion.x);
  let firstQy = finite(first.quaternion.y);
  let firstQz = finite(first.quaternion.z);
  let firstQw = finite(first.quaternion.w);
  const firstQuaternionLength = Math.hypot(firstQx, firstQy, firstQz, firstQw);
  if (firstQuaternionLength <= EPSILON) {
    firstQx = 0;
    firstQy = 0;
    firstQz = 0;
    firstQw = 1;
  } else {
    firstQx /= firstQuaternionLength;
    firstQy /= firstQuaternionLength;
    firstQz /= firstQuaternionLength;
    firstQw /= firstQuaternionLength;
  }
  let secondQx = finite(second.quaternion.x);
  let secondQy = finite(second.quaternion.y);
  let secondQz = finite(second.quaternion.z);
  let secondQw = finite(second.quaternion.w);
  const secondQuaternionLength = Math.hypot(
    secondQx,
    secondQy,
    secondQz,
    secondQw,
  );
  if (secondQuaternionLength <= EPSILON) {
    secondQx = 0;
    secondQy = 0;
    secondQz = 0;
    secondQw = 1;
  } else {
    secondQx /= secondQuaternionLength;
    secondQy /= secondQuaternionLength;
    secondQz /= secondQuaternionLength;
    secondQw /= secondQuaternionLength;
  }

  const firstXx = firstQx * firstQx;
  const firstYy = firstQy * firstQy;
  const firstZz = firstQz * firstQz;
  const firstXy = firstQx * firstQy;
  const firstXz = firstQx * firstQz;
  const firstYz = firstQy * firstQz;
  const firstXw = firstQx * firstQw;
  const firstYw = firstQy * firstQw;
  const firstZw = firstQz * firstQw;
  const firstAxis0X = 1 - 2 * (firstYy + firstZz);
  const firstAxis0Y = 2 * (firstXy + firstZw);
  const firstAxis0Z = 2 * (firstXz - firstYw);
  const firstAxis1X = 2 * (firstXy - firstZw);
  const firstAxis1Y = 1 - 2 * (firstXx + firstZz);
  const firstAxis1Z = 2 * (firstYz + firstXw);
  const firstAxis2X = 2 * (firstXz + firstYw);
  const firstAxis2Y = 2 * (firstYz - firstXw);
  const firstAxis2Z = 1 - 2 * (firstXx + firstYy);

  const secondXx = secondQx * secondQx;
  const secondYy = secondQy * secondQy;
  const secondZz = secondQz * secondQz;
  const secondXy = secondQx * secondQy;
  const secondXz = secondQx * secondQz;
  const secondYz = secondQy * secondQz;
  const secondXw = secondQx * secondQw;
  const secondYw = secondQy * secondQw;
  const secondZw = secondQz * secondQw;
  const secondAxis0X = 1 - 2 * (secondYy + secondZz);
  const secondAxis0Y = 2 * (secondXy + secondZw);
  const secondAxis0Z = 2 * (secondXz - secondYw);
  const secondAxis1X = 2 * (secondXy - secondZw);
  const secondAxis1Y = 1 - 2 * (secondXx + secondZz);
  const secondAxis1Z = 2 * (secondYz + secondXw);
  const secondAxis2X = 2 * (secondXz + secondYw);
  const secondAxis2Y = 2 * (secondYz - secondXw);
  const secondAxis2Z = 1 - 2 * (secondXx + secondYy);

  const centerDeltaX =
    finite(second.center.x) -
    (finite(first.center.x) + finite(firstCenterOffset.x));
  const centerDeltaY =
    finite(second.center.y) -
    (finite(first.center.y) + finite(firstCenterOffset.y));
  const centerDeltaZ =
    finite(second.center.z) -
    (finite(first.center.z) + finite(firstCenterOffset.z));
  const firstHalfX = Math.max(0, finite(first.halfExtents.x));
  const firstHalfY = Math.max(0, finite(first.halfExtents.y));
  const firstHalfZ = Math.max(0, finite(first.halfExtents.z));
  const secondHalfX = Math.max(0, finite(second.halfExtents.x));
  const secondHalfY = Math.max(0, finite(second.halfExtents.y));
  const secondHalfZ = Math.max(0, finite(second.halfExtents.z));
  const rotation00 =
    firstAxis0X * secondAxis0X +
    firstAxis0Y * secondAxis0Y +
    firstAxis0Z * secondAxis0Z;
  const rotation01 =
    firstAxis0X * secondAxis1X +
    firstAxis0Y * secondAxis1Y +
    firstAxis0Z * secondAxis1Z;
  const rotation02 =
    firstAxis0X * secondAxis2X +
    firstAxis0Y * secondAxis2Y +
    firstAxis0Z * secondAxis2Z;
  const rotation10 =
    firstAxis1X * secondAxis0X +
    firstAxis1Y * secondAxis0Y +
    firstAxis1Z * secondAxis0Z;
  const rotation11 =
    firstAxis1X * secondAxis1X +
    firstAxis1Y * secondAxis1Y +
    firstAxis1Z * secondAxis1Z;
  const rotation12 =
    firstAxis1X * secondAxis2X +
    firstAxis1Y * secondAxis2Y +
    firstAxis1Z * secondAxis2Z;
  const rotation20 =
    firstAxis2X * secondAxis0X +
    firstAxis2Y * secondAxis0Y +
    firstAxis2Z * secondAxis0Z;
  const rotation21 =
    firstAxis2X * secondAxis1X +
    firstAxis2Y * secondAxis1Y +
    firstAxis2Z * secondAxis1Z;
  const rotation22 =
    firstAxis2X * secondAxis2X +
    firstAxis2Y * secondAxis2Y +
    firstAxis2Z * secondAxis2Z;
  const absolute00 = Math.abs(rotation00);
  const absolute01 = Math.abs(rotation01);
  const absolute02 = Math.abs(rotation02);
  const absolute10 = Math.abs(rotation10);
  const absolute11 = Math.abs(rotation11);
  const absolute12 = Math.abs(rotation12);
  const absolute20 = Math.abs(rotation20);
  const absolute21 = Math.abs(rotation21);
  const absolute22 = Math.abs(rotation22);
  const firstDistance0 =
    centerDeltaX * firstAxis0X +
    centerDeltaY * firstAxis0Y +
    centerDeltaZ * firstAxis0Z;
  const firstDistance1 =
    centerDeltaX * firstAxis1X +
    centerDeltaY * firstAxis1Y +
    centerDeltaZ * firstAxis1Z;
  const firstDistance2 =
    centerDeltaX * firstAxis2X +
    centerDeltaY * firstAxis2Y +
    centerDeltaZ * firstAxis2Z;
  const secondDistance0 =
    centerDeltaX * secondAxis0X +
    centerDeltaY * secondAxis0Y +
    centerDeltaZ * secondAxis0Z;
  const secondDistance1 =
    centerDeltaX * secondAxis1X +
    centerDeltaY * secondAxis1Y +
    centerDeltaZ * secondAxis1Z;
  const secondDistance2 =
    centerDeltaX * secondAxis2X +
    centerDeltaY * secondAxis2Y +
    centerDeltaZ * secondAxis2Z;

  out.normalX = 0;
  out.normalY = 0;
  out.normalZ = 0;
  out.penetration = Number.POSITIVE_INFINITY;
  if (!considerOrientedBoxAxis(
    firstAxis0X,
    firstAxis0Y,
    firstAxis0Z,
    firstDistance0,
    firstHalfX,
    secondHalfX * absolute00 +
      secondHalfY * absolute01 +
      secondHalfZ * absolute02,
    out,
  )) return false;
  if (!considerOrientedBoxAxis(
    firstAxis1X,
    firstAxis1Y,
    firstAxis1Z,
    firstDistance1,
    firstHalfY,
    secondHalfX * absolute10 +
      secondHalfY * absolute11 +
      secondHalfZ * absolute12,
    out,
  )) return false;
  if (!considerOrientedBoxAxis(
    firstAxis2X,
    firstAxis2Y,
    firstAxis2Z,
    firstDistance2,
    firstHalfZ,
    secondHalfX * absolute20 +
      secondHalfY * absolute21 +
      secondHalfZ * absolute22,
    out,
  )) return false;
  if (!considerOrientedBoxAxis(
    secondAxis0X,
    secondAxis0Y,
    secondAxis0Z,
    secondDistance0,
    firstHalfX * absolute00 +
      firstHalfY * absolute10 +
      firstHalfZ * absolute20,
    secondHalfX,
    out,
  )) return false;
  if (!considerOrientedBoxAxis(
    secondAxis1X,
    secondAxis1Y,
    secondAxis1Z,
    secondDistance1,
    firstHalfX * absolute01 +
      firstHalfY * absolute11 +
      firstHalfZ * absolute21,
    secondHalfY,
    out,
  )) return false;
  if (!considerOrientedBoxAxis(
    secondAxis2X,
    secondAxis2Y,
    secondAxis2Z,
    secondDistance2,
    firstHalfX * absolute02 +
      firstHalfY * absolute12 +
      firstHalfZ * absolute22,
    secondHalfZ,
    out,
  )) return false;

  if (!considerOrientedBoxCrossAxis(
    firstAxis0X, firstAxis0Y, firstAxis0Z,
    secondAxis0X, secondAxis0Y, secondAxis0Z,
    centerDeltaX, centerDeltaY, centerDeltaZ,
    firstHalfY * absolute20 + firstHalfZ * absolute10,
    secondHalfY * absolute02 + secondHalfZ * absolute01,
    out,
  )) return false;
  if (!considerOrientedBoxCrossAxis(
    firstAxis0X, firstAxis0Y, firstAxis0Z,
    secondAxis1X, secondAxis1Y, secondAxis1Z,
    centerDeltaX, centerDeltaY, centerDeltaZ,
    firstHalfY * absolute21 + firstHalfZ * absolute11,
    secondHalfX * absolute02 + secondHalfZ * absolute00,
    out,
  )) return false;
  if (!considerOrientedBoxCrossAxis(
    firstAxis0X, firstAxis0Y, firstAxis0Z,
    secondAxis2X, secondAxis2Y, secondAxis2Z,
    centerDeltaX, centerDeltaY, centerDeltaZ,
    firstHalfY * absolute22 + firstHalfZ * absolute12,
    secondHalfX * absolute01 + secondHalfY * absolute00,
    out,
  )) return false;
  if (!considerOrientedBoxCrossAxis(
    firstAxis1X, firstAxis1Y, firstAxis1Z,
    secondAxis0X, secondAxis0Y, secondAxis0Z,
    centerDeltaX, centerDeltaY, centerDeltaZ,
    firstHalfX * absolute20 + firstHalfZ * absolute00,
    secondHalfY * absolute12 + secondHalfZ * absolute11,
    out,
  )) return false;
  if (!considerOrientedBoxCrossAxis(
    firstAxis1X, firstAxis1Y, firstAxis1Z,
    secondAxis1X, secondAxis1Y, secondAxis1Z,
    centerDeltaX, centerDeltaY, centerDeltaZ,
    firstHalfX * absolute21 + firstHalfZ * absolute01,
    secondHalfX * absolute12 + secondHalfZ * absolute10,
    out,
  )) return false;
  if (!considerOrientedBoxCrossAxis(
    firstAxis1X, firstAxis1Y, firstAxis1Z,
    secondAxis2X, secondAxis2Y, secondAxis2Z,
    centerDeltaX, centerDeltaY, centerDeltaZ,
    firstHalfX * absolute22 + firstHalfZ * absolute02,
    secondHalfX * absolute11 + secondHalfY * absolute10,
    out,
  )) return false;
  if (!considerOrientedBoxCrossAxis(
    firstAxis2X, firstAxis2Y, firstAxis2Z,
    secondAxis0X, secondAxis0Y, secondAxis0Z,
    centerDeltaX, centerDeltaY, centerDeltaZ,
    firstHalfX * absolute10 + firstHalfY * absolute00,
    secondHalfY * absolute22 + secondHalfZ * absolute21,
    out,
  )) return false;
  if (!considerOrientedBoxCrossAxis(
    firstAxis2X, firstAxis2Y, firstAxis2Z,
    secondAxis1X, secondAxis1Y, secondAxis1Z,
    centerDeltaX, centerDeltaY, centerDeltaZ,
    firstHalfX * absolute11 + firstHalfY * absolute01,
    secondHalfX * absolute22 + secondHalfZ * absolute20,
    out,
  )) return false;
  if (!considerOrientedBoxCrossAxis(
    firstAxis2X, firstAxis2Y, firstAxis2Z,
    secondAxis2X, secondAxis2Y, secondAxis2Z,
    centerDeltaX, centerDeltaY, centerDeltaZ,
    firstHalfX * absolute12 + firstHalfY * absolute02,
    secondHalfX * absolute21 + secondHalfY * absolute20,
    out,
  )) return false;
  return true;
}

const ZERO_VECTOR: Vec3Like = { x: 0, y: 0, z: 0 };
const BOOLEAN_CONTACT_SCRATCH: StickyContactManifold = {
  ownerIndex: NO_CONTACT_OWNER,
  normalX: 0,
  normalY: 0,
  normalZ: 0,
  penetration: 0,
};

/** Exact sphere-to-OBB overlap. Visual effects are intentionally excluded. */
export function sphereIntersectsOrientedBox(
  sphereCenter: Vec3Like,
  sphereRadius: number,
  box: OrientedContactBox,
) {
  return sphereOrientedBoxContact(
    sphereCenter,
    sphereRadius,
    box,
    BOOLEAN_CONTACT_SCRATCH,
  );
}

/** Separating-axis test for two fully oriented solid bounds. */
export function orientedContactBoxesIntersect(
  first: OrientedContactBox,
  second: OrientedContactBox,
  firstCenterOffset: Vec3Like = ZERO_VECTOR,
) {
  return orientedBoxesContact(
    first,
    second,
    firstCenterOffset,
    BOOLEAN_CONTACT_SCRATCH,
  );
}

/**
 * Reports the deepest core/attachment contact with `box` without allocating.
 * The unit normal points from the winning sticky-body owner toward `box`.
 */
export function stickyBodyOrientedBoxContact(
  coreCenter: Vec3Like,
  coreRadius: number,
  attachments: readonly OrientedContactBox[],
  box: OrientedContactBox,
  out: StickyContactManifold,
) {
  let bestOwner = NO_CONTACT_OWNER;
  let bestNormalX = 0;
  let bestNormalY = 0;
  let bestNormalZ = 0;
  let bestPenetration = 0;
  if (sphereOrientedBoxContact(coreCenter, coreRadius, box, out)) {
    bestOwner = CORE_CONTACT_OWNER;
    bestNormalX = out.normalX;
    bestNormalY = out.normalY;
    bestNormalZ = out.normalZ;
    bestPenetration = out.penetration;
  }
  for (let index = 0; index < attachments.length; index += 1) {
    if (!orientedBoxesContact(attachments[index], box, coreCenter, out)) {
      continue;
    }
    if (
      bestOwner !== NO_CONTACT_OWNER &&
      out.penetration <= bestPenetration + EPSILON
    ) {
      continue;
    }
    bestOwner = index;
    bestNormalX = out.normalX;
    bestNormalY = out.normalY;
    bestNormalZ = out.normalZ;
    bestPenetration = out.penetration;
  }
  out.ownerIndex = bestOwner;
  out.normalX = bestNormalX;
  out.normalY = bestNormalY;
  out.normalZ = bestNormalZ;
  out.penetration = bestPenetration;
  return bestOwner !== NO_CONTACT_OWNER;
}

/** Compatibility predicate for callers that do not need the contact manifold. */
export function stickyBodyIntersectsOrientedBox(
  coreCenter: Vec3Like,
  coreRadius: number,
  attachments: readonly OrientedContactBox[],
  box: OrientedContactBox,
) {
  return stickyBodyOrientedBoxContact(
    coreCenter,
    coreRadius,
    attachments,
    box,
    BOOLEAN_CONTACT_SCRATCH,
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
