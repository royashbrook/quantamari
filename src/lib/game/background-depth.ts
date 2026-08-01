import type { WorldKind } from "../world-system";
import type {
  FoundationLayer,
  FoundationPresentation,
} from "./foundation-plan";

export type BackgroundBand = "near" | "mid" | "far";

export type BackgroundDepthCue = {
  travelRate: number;
  fogMix: number;
  opacityCap: number;
};

export type FoundationLayerDepthCue = BackgroundDepthCue & {
  grounded: boolean;
  placement: Exclude<FoundationPresentation, "none">;
  verticalScale: number;
};

export type CosmicBackdropShell = {
  radius: number;
  position: [number, number, number];
};

export const COSMIC_BACKDROP_SHELLS: readonly CosmicBackdropShell[] = [
  { radius: 42, position: [0, 16, -90] },
  { radius: 68, position: [0, 26, -125] },
  { radius: 98, position: [0, 36, -160] },
];

const TAU = Math.PI * 2;
const REDUCED_MOTION_FACTOR = 0;

const BACKGROUND_CUES: Readonly<Record<BackgroundBand, BackgroundDepthCue>> = {
  near: {
    travelRate: 0.0024,
    fogMix: 0.28,
    opacityCap: 0.24,
  },
  mid: {
    travelRate: 0.0012,
    fogMix: 0.5,
    opacityCap: 0.15,
  },
  far: {
    travelRate: 0.00055,
    fogMix: 0.72,
    opacityCap: 0.075,
  },
};

const GROUNDED_WORLD_KINDS = new Set<WorldKind>([
  "microscopic-sea",
  "fiber-bed",
  "dust-surface",
  "tabletop",
  "interior",
  "yard",
  "city",
  "landscape",
  "planet-surface",
]);

export function backgroundDepthCue(
  band: BackgroundBand,
  reducedMotion = false,
): BackgroundDepthCue {
  const cue = BACKGROUND_CUES[band];
  return {
    ...cue,
    travelRate:
      cue.travelRate * (reducedMotion ? REDUCED_MOTION_FACTOR : 1),
  };
}

export function environmentDepthCue(
  kind: WorldKind,
  reducedMotion = false,
): BackgroundDepthCue | null {
  if (GROUNDED_WORLD_KINDS.has(kind)) return null;
  if (kind === "particle-field") {
    return backgroundDepthCue("near", reducedMotion);
  }
  return backgroundDepthCue("mid", reducedMotion);
}

export function foundationDepthCue(
  presentation: FoundationPresentation,
  role: FoundationLayer["role"],
  depth: number,
  reducedMotion = false,
): FoundationLayerDepthCue {
  const safeDepth = Math.max(1, Number.isFinite(depth) ? depth : 1);
  if (role === "nearest") {
    return {
      travelRate: 0,
      fogMix: 0.12,
      opacityCap: 0.76,
      grounded: true,
      placement: presentation === "shell" ? "shell" : "surface",
      verticalScale: presentation === "shell" ? 0.24 : 0.18,
    };
  }

  const grounded = presentation === "surface" || presentation === "shell";
  if (grounded) {
    return {
      travelRate: 0,
      fogMix: 0.42,
      opacityCap: 0.32,
      grounded: true,
      placement: presentation,
      verticalScale: 1,
    };
  }

  const band: BackgroundBand = safeDepth <= 2 ? "mid" : "far";
  const cue = backgroundDepthCue(band, reducedMotion);
  const presentationFactor = presentation === "distant-field" ? 0.72 : 1;
  return {
    travelRate: cue.travelRate * presentationFactor,
    fogMix: Math.min(
      0.82,
      cue.fogMix + (presentation === "distant-field" ? 0.08 : 0),
    ),
    opacityCap: Math.max(
      0.07,
      cue.opacityCap *
        (presentation === "distant-field" ? 0.82 : 1),
    ),
    grounded: false,
    placement:
      presentation === "distant-field" ? "distant-field" : "field",
    verticalScale: 1,
  };
}

export function foundationChunkAnchor(
  localPosition: number,
  originPosition: number,
  chunkSize: number,
) {
  if (
    !Number.isFinite(localPosition) ||
    !Number.isFinite(originPosition) ||
    !Number.isFinite(chunkSize) ||
    chunkSize <= 0
  ) {
    return 0;
  }
  const absolutePosition = localPosition + originPosition;
  return (
    Math.round(absolutePosition / chunkSize) * chunkSize - originPosition
  );
}

export function wrappedFoundationOffset(
  anchorPosition: number,
  playerAbsolutePosition: number,
  chunkSize: number,
) {
  if (
    !Number.isFinite(anchorPosition) ||
    !Number.isFinite(playerAbsolutePosition) ||
    !Number.isFinite(chunkSize) ||
    chunkSize <= 0
  ) {
    return 0;
  }
  const halfChunk = chunkSize / 2;
  const relative = anchorPosition - playerAbsolutePosition;
  return (
    ((relative + halfChunk) % chunkSize + chunkSize) % chunkSize -
    halfChunk
  );
}

export function wrappedTextureOffset(
  absolutePosition: number,
  repetitionsPerUnit: number,
) {
  if (
    !Number.isFinite(absolutePosition) ||
    !Number.isFinite(repetitionsPerUnit)
  ) {
    return 0;
  }
  const offset = absolutePosition * repetitionsPerUnit;
  return ((offset % 1) + 1) % 1;
}

export function foundationTextureRate(
  textureRepetitions: number,
  surfaceDiameter: number,
) {
  if (
    !Number.isFinite(textureRepetitions) ||
    !Number.isFinite(surfaceDiameter) ||
    textureRepetitions <= 0 ||
    surfaceDiameter <= 0
  ) {
    return 0;
  }
  return textureRepetitions / surfaceDiameter;
}

export function foundationShellTextureRates(
  textureRepetitions: number,
  radius: number,
) {
  if (
    !Number.isFinite(textureRepetitions) ||
    !Number.isFinite(radius) ||
    textureRepetitions <= 0 ||
    radius <= 0
  ) {
    return { longitude: 0, latitude: 0 };
  }
  return {
    longitude: textureRepetitions / (Math.PI * 2 * radius),
    latitude: textureRepetitions / (Math.PI * radius),
  };
}

export function foundationShellHeight(
  x: number,
  z: number,
  radius: number,
  centerY: number,
  lift = 0,
) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    !Number.isFinite(radius) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(lift) ||
    radius <= 0
  ) {
    return 0;
  }
  const heightSquared = Math.max(0, radius * radius - x * x - z * z);
  return centerY + Math.sqrt(heightSquared) + lift;
}

export function wrapParallaxAngle(angle: number) {
  if (!Number.isFinite(angle)) return 0;
  return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

export function parallaxYaw(absoluteX: number, travelRate: number) {
  return wrapParallaxAngle(absoluteX * travelRate);
}

export function parallaxPitch(absoluteZ: number, travelRate: number) {
  return wrapParallaxAngle(-absoluteZ * travelRate * 0.58);
}

export function sphereSurfaceClearance(
  position: readonly [number, number, number],
  radius: number,
) {
  if (!Number.isFinite(radius) || radius < 0) return 0;
  return Math.max(0, Math.hypot(...position) - radius);
}
