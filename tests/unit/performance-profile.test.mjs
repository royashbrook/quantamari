import assert from "node:assert/strict";
import test from "node:test";

import {
  PERFORMANCE_PROFILE_STORAGE_KEY,
  parsePerformanceProfile,
  performanceProfileSettings,
} from "../../src/lib/performance-profile.ts";

test("performance profile storage defaults safely to Standard", () => {
  assert.equal(PERFORMANCE_PROFILE_STORAGE_KEY, "quantamari-performance-profile");
  assert.equal(parsePerformanceProfile(null), "standard");
  assert.equal(parsePerformanceProfile(undefined), "standard");
  assert.equal(parsePerformanceProfile("standard"), "standard");
  assert.equal(parsePerformanceProfile("battery"), "battery");
  assert.equal(parsePerformanceProfile("balanced"), "standard");
  assert.equal(parsePerformanceProfile("{bad json"), "standard");
});

test("performance profiles have deterministic frame and rendering budgets", () => {
  assert.deepEqual(performanceProfileSettings("standard", false), {
    qualityTier: "high",
    targetFps: 60,
    idleTargetFps: 30,
    pixelRatioCap: 1.5,
    antialias: true,
    shadows: true,
  });
  assert.deepEqual(performanceProfileSettings("standard", true), {
    qualityTier: "balanced",
    targetFps: 30,
    idleTargetFps: 24,
    pixelRatioCap: 1.25,
    antialias: true,
    shadows: true,
  });
  assert.deepEqual(performanceProfileSettings("battery", false), {
    qualityTier: "battery",
    targetFps: 30,
    idleTargetFps: 15,
    pixelRatioCap: 1,
    antialias: false,
    shadows: false,
  });
  assert.deepEqual(
    performanceProfileSettings("battery", true),
    performanceProfileSettings("battery", false),
  );
});
