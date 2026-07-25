export type QualityTier = "high" | "balanced" | "battery";

export type PickupMotion =
  | "bob"
  | "flutter"
  | "orbit"
  | "pulse"
  | "shimmy"
  | "spin"
  | "tumble"
  | "wobble";

export type SoundWave = "sine" | "square" | "sawtooth" | "triangle";

export type CollectibleIdentity = {
  id: string;
  seed: number;
  visualVariant: number;
  detailVariant: number;
  motion: PickupMotion;
  motionRate: number;
  motionAmount: number;
  soundRatios: [number, number, number];
  soundWave: SoundWave;
  soundBrightness: number;
  soundRhythm: number;
  soundNoise: number;
};

const MOTIONS: PickupMotion[] = [
  "bob",
  "flutter",
  "orbit",
  "pulse",
  "shimmy",
  "spin",
  "tumble",
  "wobble",
];

const WAVES: SoundWave[] = ["sine", "triangle", "square", "sawtooth"];

export function stableNameSeed(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function unit(seed: number, salt: number) {
  let value = (seed + Math.imul(salt, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

/**
 * Every named collectible receives a deterministic visual motion and a
 * three-note generative sound signature. The identity is stable across saves,
 * devices, and releases as long as the collectible name and shape stay stable.
 */
export function collectibleIdentityFor(name: string, shape: string): CollectibleIdentity {
  const seed = stableNameSeed(`${shape}:${name}`);
  const fifth = 1.45 + unit(seed, 5) * 0.18;
  const colorTone = 1.12 + unit(seed, 7) * 0.32;
  const octave = unit(seed, 11) > 0.72 ? 2 : 1;
  return {
    id: `${shape}-${seed.toString(36)}`,
    seed,
    visualVariant: seed % 8,
    detailVariant: Math.floor(seed / 8) % 12,
    motion: MOTIONS[Math.floor(unit(seed, 13) * MOTIONS.length)],
    motionRate: 0.62 + unit(seed, 17) * 1.7,
    motionAmount: 0.035 + unit(seed, 19) * 0.085,
    soundRatios: [1, colorTone, fifth * octave],
    soundWave: WAVES[Math.floor(unit(seed, 23) * WAVES.length)],
    soundBrightness: 0.55 + unit(seed, 29) * 0.45,
    soundRhythm: 0.012 + unit(seed, 31) * 0.045,
    soundNoise: unit(seed, 37) * 0.7,
  };
}

export function canCollectPickup(
  sourceEra: number,
  activeEra: number,
  pickupBulkRadius: number,
  rollingRadius: number,
) {
  return sourceEra <= activeEra && pickupBulkRadius <= rollingRadius * 1.1;
}

export function growthContribution(
  rollingRadius: number,
  pickupBulkRadius: number,
  massEnergyFactor: number,
  scaleGap: number,
) {
  const growthFactor = scaleGap === 0 ? 1 : Math.max(0.0002, 0.14 ** scaleGap);
  const rawContribution =
    pickupBulkRadius ** 3 * massEnergyFactor * growthFactor * 0.42;
  return {
    growthFactor,
    contribution: Math.min(
      rollingRadius ** 3 * 0.014,
      Math.max(0.000008, rawContribution),
    ),
  };
}

/**
 * Uses hysteresis so a device does not flap between quality tiers when its
 * frame rate sits on a boundary.
 */
export function qualityTierForFps(
  framesPerSecond: number,
  current: QualityTier,
): QualityTier {
  if (current === "high") return framesPerSecond < 44 ? "balanced" : "high";
  if (current === "balanced") {
    if (framesPerSecond < 31) return "battery";
    if (framesPerSecond > 56) return "high";
    return "balanced";
  }
  return framesPerSecond > 43 ? "balanced" : "battery";
}

export function pickupBudget(viewportWidth: number, tier: QualityTier) {
  const mobile = viewportWidth <= 860;
  if (tier === "high") return mobile ? 392 : 544;
  if (tier === "balanced") return mobile ? 304 : 424;
  return mobile ? 224 : 312;
}

export function lowPickupBudget(viewportWidth: number, tier: QualityTier) {
  return Math.floor(pickupBudget(viewportWidth, tier) * 0.84);
}

export function pixelRatioCap(mobile: boolean, tier: QualityTier) {
  if (tier === "high") return mobile ? 1.75 : 2;
  if (tier === "balanced") return mobile ? 1.4 : 1.6;
  return mobile ? 1.1 : 1.25;
}
