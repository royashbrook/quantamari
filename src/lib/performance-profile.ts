import type { QualityTier } from "./game-rules";

export type PerformanceProfile = "standard" | "battery";

export const PERFORMANCE_PROFILE_STORAGE_KEY =
  "quantamari-performance-profile";

export type PerformanceProfileSettings = {
  qualityTier: QualityTier;
  targetFps: number;
  idleTargetFps: number;
  pixelRatioCap: number;
  antialias: boolean;
  shadows: boolean;
};

export function parsePerformanceProfile(
  value: string | null | undefined,
): PerformanceProfile {
  return value === "battery" ? "battery" : "standard";
}

/**
 * A profile is chosen by the player and never inferred from measured frame
 * rate. Compact and wide viewports have fixed pacing/DPR ceilings, but neither
 * changes the authored population or collectible identity.
 */
export function performanceProfileSettings(
  profile: PerformanceProfile,
  compact: boolean,
): PerformanceProfileSettings {
  if (profile === "battery") {
    return {
      qualityTier: "battery",
      targetFps: 30,
      idleTargetFps: 15,
      pixelRatioCap: 1,
      antialias: false,
      shadows: false,
    };
  }

  return {
    qualityTier: compact ? "balanced" : "high",
    targetFps: compact ? 30 : 60,
    idleTargetFps: compact ? 24 : 30,
    pixelRatioCap: compact ? 1.25 : 1.5,
    antialias: true,
    shadows: true,
  };
}
