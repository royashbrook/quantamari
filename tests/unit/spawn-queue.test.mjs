import assert from "node:assert/strict";
import test from "node:test";

import { createSpawnQueue } from "../../src/lib/game/spawn-queue.ts";

function drainSeeds(queue, limits = {}) {
  const seeds = [];
  const attempted = queue.drain(
    ({ seed }) => seeds.push(seed),
    {
      maxPerFrame: limits.maxPerFrame ?? Number.MAX_SAFE_INTEGER,
      budgetMs: limits.budgetMs ?? Number.MAX_SAFE_INTEGER,
      now: limits.now ?? (() => 0),
    },
  );
  return { attempted, seeds };
}

test("spawn descriptors are deterministic for a given initial seed", () => {
  const first = createSpawnQueue(42);
  const second = createSpawnQueue(42);
  const other = createSpawnQueue(43);
  for (const queue of [first, second, other]) queue.reconcile(0, 5);

  const firstSeeds = drainSeeds(first).seeds;
  assert.deepEqual(drainSeeds(second).seeds, firstSeeds);
  assert.notDeepEqual(drainSeeds(other).seeds, firstSeeds);
  assert.equal(new Set(firstSeeds).size, firstSeeds.length);
});

test("reconcile fills only the active-count gap and trims excess queued work", () => {
  const queue = createSpawnQueue(7);
  queue.reconcile(2, 6);
  assert.equal(queue.pending, 4);

  queue.reconcile(5, 6);
  assert.equal(queue.pending, 1);
  assert.deepEqual(drainSeeds(queue).seeds, [7]);

  queue.reconcile(9, 6);
  assert.equal(queue.pending, 0);
});

test("reconcile continues the deterministic sequence after work is drained", () => {
  const queue = createSpawnQueue(11);
  queue.reconcile(0, 3);
  const firstBatch = drainSeeds(queue, { maxPerFrame: 2 }).seeds;

  queue.reconcile(2, 3);
  const secondBatch = drainSeeds(queue).seeds;

  const reference = createSpawnQueue(11);
  reference.reconcile(0, 3);
  assert.deepEqual([...firstBatch, ...secondBatch], drainSeeds(reference).seeds);
});

test("drain never exceeds its hard per-frame attempt cap", () => {
  const queue = createSpawnQueue();
  queue.reconcile(0, 10);

  const result = drainSeeds(queue, { maxPerFrame: 3 });
  assert.equal(result.attempted, 3);
  assert.equal(result.seeds.length, 3);
  assert.equal(queue.pending, 7);
});

test("drain stops after its elapsed-time budget", () => {
  const queue = createSpawnQueue();
  queue.reconcile(0, 5);
  let clock = 0;
  const seeds = [];

  const attempted = queue.drain(
    ({ seed }) => {
      seeds.push(seed);
      clock += 4;
    },
    {
      maxPerFrame: 5,
      budgetMs: 5,
      now: () => clock,
    },
  );

  assert.equal(attempted, 2);
  assert.equal(seeds.length, 2);
  assert.equal(queue.pending, 3);
});

test("drain permits one attempt even with a zero budget or cap", () => {
  const queue = createSpawnQueue();
  queue.reconcile(0, 3);

  const result = drainSeeds(queue, {
    maxPerFrame: 0,
    budgetMs: 0,
    now: () => 100,
  });
  assert.equal(result.attempted, 1);
  assert.equal(queue.pending, 2);
});

test("a promotion can stop the current frame after expensive setup", () => {
  const queue = createSpawnQueue();
  queue.reconcile(0, 4);
  const seeds = [];

  const attempted = queue.drain(
    ({ seed }) => {
      seeds.push(seed);
      return false;
    },
    {
      maxPerFrame: 4,
      budgetMs: 10,
      now: () => 0,
    },
  );

  assert.equal(attempted, 1);
  assert.equal(seeds.length, 1);
  assert.equal(queue.pending, 3);
});

test("draining an empty queue does no work and does not read the clock", () => {
  const queue = createSpawnQueue();
  let clockReads = 0;

  const attempted = queue.drain(
    () => assert.fail("empty queues must not attempt a spawn"),
    {
      maxPerFrame: 8,
      budgetMs: 2,
      now: () => {
        clockReads += 1;
        return 0;
      },
    },
  );

  assert.equal(attempted, 0);
  assert.equal(clockReads, 0);
});
