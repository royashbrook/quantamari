import assert from "node:assert/strict";
import test from "node:test";

import {
  createPhaseRecorder,
  RUNTIME_PHASES,
} from "../../src/lib/game/runtime-performance.ts";

test("runtime phase summaries keep bounded recent samples and total counts", () => {
  const recorder = createPhaseRecorder(4);
  [9, 1, 5, 3, 7].forEach((duration) =>
    recorder.record("frame", duration),
  );

  assert.deepEqual(recorder.snapshot().frame, {
    count: 5,
    latest: 7,
    p50: 3,
    p95: 7,
    max: 7,
  });
});

test("runtime phase summaries reject invalid durations and round diagnostics", () => {
  const recorder = createPhaseRecorder();
  recorder.record("spawning", Number.NaN);
  recorder.record("spawning", -1);
  recorder.record("spawning", 1.23456);

  assert.deepEqual(recorder.snapshot().spawning, {
    count: 1,
    latest: 1.235,
    p50: 1.235,
    p95: 1.235,
    max: 1.235,
  });
  assert.ok(RUNTIME_PHASES.includes("world-rebuild"));
  assert.ok(RUNTIME_PHASES.includes("frame-interval"));
});
