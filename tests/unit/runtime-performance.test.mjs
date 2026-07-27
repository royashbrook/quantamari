import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceFrameDeadline,
  createPhaseRecorder,
  RUNTIME_PHASES,
} from "../../src/lib/game/runtime-performance.ts";

test("absolute frame deadlines preserve each target across display refresh rates", () => {
  for (const displayFps of [60, 120, 144]) {
    for (const targetFps of [60, 30]) {
      let deadline = 0;
      let rendered = 0;
      const seconds = 10;
      for (let sample = 0; sample < displayFps * seconds; sample += 1) {
        const now = (sample * 1_000) / displayFps;
        const nextDeadline = advanceFrameDeadline(
          now,
          deadline,
          targetFps,
        );
        if (nextDeadline === null) continue;
        deadline = nextDeadline;
        rendered += 1;
      }
      assert.equal(rendered / seconds, targetFps);
    }
  }
});

test("absolute frame deadlines skip missed frames instead of catching up", () => {
  for (const targetFps of [60, 30]) {
    const initialDeadline = advanceFrameDeadline(0, 0, targetFps);
    assert.notEqual(initialDeadline, null);
    const resumedDeadline = advanceFrameDeadline(
      10_000,
      initialDeadline,
      targetFps,
    );
    assert.ok(resumedDeadline > 10_000);
    assert.equal(
      advanceFrameDeadline(10_000, resumedDeadline, targetFps),
      null,
    );
  }
});

test("frame deadlines tolerate display callbacks that arrive slightly early", () => {
  const targetFps = 30;
  const interval = 1_000 / targetFps;
  let deadline = 0;

  for (let sample = 0; sample < 300; sample += 1) {
    const idealNow = sample * interval;
    const now = sample === 0 ? idealNow : idealNow - 1.5;
    const nextDeadline = advanceFrameDeadline(now, deadline, targetFps);
    assert.notEqual(nextDeadline, null);
    deadline = nextDeadline;
  }
});

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
