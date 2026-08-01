import assert from "node:assert/strict";
import test from "node:test";

import {
  COSMIC_BACKDROP_SHELLS,
  backgroundDepthCue,
  environmentDepthCue,
  foundationDepthCue,
  parallaxPitch,
  parallaxYaw,
  sphereSurfaceClearance,
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
    foundationDepthCue("shell", "compressed", 3).travelRate,
    0,
  );
});

test("volumetric ancestry moves less and softens as it recedes", () => {
  const nearest = foundationDepthCue("field", "nearest", 1);
  const compressed = foundationDepthCue("field", "compressed", 2);
  const oldest = foundationDepthCue("field", "compressed", 4);

  assert.ok(nearest.travelRate > compressed.travelRate);
  assert.ok(compressed.travelRate > oldest.travelRate);
  assert.ok(nearest.opacityCap > compressed.opacityCap);
  assert.ok(compressed.opacityCap > oldest.opacityCap);
  assert.ok(nearest.fogMix < compressed.fogMix);
  assert.ok(compressed.fogMix < oldest.fogMix);
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
