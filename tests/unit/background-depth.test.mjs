import assert from "node:assert/strict";
import test from "node:test";

import {
  COSMIC_BACKDROP_SHELLS,
  backgroundDepthCue,
  environmentDepthCue,
  foundationChunkAnchor,
  foundationDepthCue,
  foundationShellHeight,
  foundationShellTextureRates,
  foundationTextureRate,
  parallaxPitch,
  parallaxYaw,
  sphereSurfaceClearance,
  wrappedFoundationOffset,
  wrappedTextureOffset,
} from "../../src/lib/game/background-depth.ts";
import { floatingOriginShift } from "../../src/lib/world-system.ts";

test("background bands keep a monotonic depth hierarchy", () => {
  const near = backgroundDepthCue("near");
  const mid = backgroundDepthCue("mid");
  const far = backgroundDepthCue("far");

  assert.ok(near.travelRate > mid.travelRate);
  assert.ok(mid.travelRate > far.travelRate);
  assert.ok(near.opacityCap > mid.opacityCap);
  assert.ok(mid.opacityCap > far.opacityCap);
  assert.ok(near.fogMix < mid.fogMix);
  assert.ok(mid.fogMix < far.fogMix);
});

test("reduced motion keeps depth styling while disabling parallax", () => {
  for (const band of ["near", "mid", "far"]) {
    const standard = backgroundDepthCue(band);
    const reduced = backgroundDepthCue(band, true);
    assert.ok(standard.travelRate > 0);
    assert.equal(reduced.travelRate, 0);
    assert.equal(reduced.fogMix, standard.fogMix);
    assert.equal(reduced.opacityCap, standard.opacityCap);
  }
});

test("grounded worlds and rugs remain spatially aligned", () => {
  assert.equal(environmentDepthCue("city"), null);
  assert.equal(environmentDepthCue("interior"), null);
  assert.equal(environmentDepthCue("planet-surface"), null);
  assert.equal(
    foundationDepthCue("surface", "nearest", 1).travelRate,
    0,
  );
  assert.equal(
    foundationDepthCue("field", "nearest", 1).travelRate,
    0,
  );
  assert.equal(
    foundationDepthCue("distant-field", "nearest", 1).placement,
    "surface",
  );
  assert.equal(
    foundationDepthCue("shell", "nearest", 1).placement,
    "shell",
  );
  assert.equal(
    foundationDepthCue("shell", "compressed", 3).travelRate,
    0,
  );
});

test("nearest history becomes a rug while volumetric ancestry recedes", () => {
  const nearest = foundationDepthCue("field", "nearest", 1);
  const compressed = foundationDepthCue("field", "compressed", 2);
  const oldest = foundationDepthCue("field", "compressed", 4);

  assert.equal(nearest.travelRate, 0);
  assert.equal(nearest.grounded, true);
  assert.equal(nearest.placement, "surface");
  assert.ok(nearest.verticalScale < 0.25);
  assert.ok(compressed.travelRate > 0);
  assert.ok(compressed.travelRate > oldest.travelRate);
  assert.ok(nearest.opacityCap > compressed.opacityCap);
  assert.ok(compressed.opacityCap > oldest.opacityCap);
  assert.ok(nearest.fogMix < compressed.fogMix);
  assert.ok(compressed.fogMix < oldest.fogMix);
});

test("rug anchors and texture offsets survive floating-origin shifts", () => {
  const beforeLocal = 4_160;
  const beforeOrigin = 0;
  const shift = floatingOriginShift(beforeLocal, 128);
  const afterLocal = beforeLocal - shift;
  const afterOrigin = beforeOrigin + shift;
  const beforeAnchor = foundationChunkAnchor(
    beforeLocal,
    beforeOrigin,
    128,
  );
  const afterAnchor = foundationChunkAnchor(
    afterLocal,
    afterOrigin,
    128,
  );

  assert.equal(beforeAnchor + beforeOrigin, afterAnchor + afterOrigin);
  assert.equal(
    wrappedTextureOffset(beforeLocal + beforeOrigin, 0.018),
    wrappedTextureOffset(afterLocal + afterOrigin, 0.018),
  );
  assert.ok(wrappedTextureOffset(1e12, 0.018) >= 0);
  assert.ok(wrappedTextureOffset(1e12, 0.018) < 1);
});

test("the moving rug texture and shell details stay fixed to their worlds", () => {
  const diameter = 188;
  const rate = foundationTextureRate(9, diameter);
  const playerTravel = 12;
  const textureTravel = playerTravel * rate;

  assert.ok(
    Math.abs(textureTravel * diameter / 9 - playerTravel) <
      Number.EPSILON * 16,
  );
  assert.equal(foundationTextureRate(0, diameter), 0);
  assert.equal(foundationTextureRate(9, 0), 0);
  assert.ok(
    Math.abs(foundationShellHeight(0, 0, 80, -79, 0.08) - 1.08) <
      Number.EPSILON * 8,
  );
  assert.ok(foundationShellHeight(24, 0, 80, -79, 0.08) < 1.08);
  const shellRates = foundationShellTextureRates(9, 80);
  assert.ok(
    Math.abs(shellRates.longitude * Math.PI * 2 * 80 - 9) <
      Number.EPSILON * 32,
  );
  assert.ok(
    Math.abs(shellRates.latitude * Math.PI * 80 - 9) <
      Number.EPSILON * 32,
  );
  assert.equal(wrappedFoundationOffset(4, 0, 56), 4);
  assert.equal(wrappedFoundationOffset(4, 60, 56), 0);
  assert.equal(wrappedFoundationOffset(4, -60, 56), 8);
  assert.equal(wrappedFoundationOffset(4, 60 + 56 * 1_000_000, 56), 0);
  assert.equal(wrappedFoundationOffset(4, 60, 0), 0);
});

test("absolute travel keeps parallax continuous across a floating-origin shift", () => {
  const beforeLocal = 4_160;
  const beforeOrigin = 0;
  const shift = floatingOriginShift(beforeLocal, 128);
  const afterLocal = beforeLocal - shift;
  const afterOrigin = beforeOrigin + shift;
  const rate = backgroundDepthCue("near").travelRate;

  assert.equal(
    parallaxYaw(beforeLocal + beforeOrigin, rate),
    parallaxYaw(afterLocal + afterOrigin, rate),
  );
  assert.equal(
    parallaxPitch(beforeLocal + beforeOrigin, rate),
    parallaxPitch(afterLocal + afterOrigin, rate),
  );
  assert.ok(Math.abs(parallaxYaw(1e12, rate)) <= Math.PI);
  assert.ok(Math.abs(parallaxPitch(-1e12, rate)) <= Math.PI);
});

test("cosmic wire shells stay wholly beyond the playable foreground", () => {
  for (const shell of COSMIC_BACKDROP_SHELLS) {
    assert.ok(
      sphereSurfaceClearance(shell.position, shell.radius) >= 48,
      `radius ${shell.radius} shell crosses the foreground`,
    );
  }
});
