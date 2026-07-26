export type SpawnDescriptor = Readonly<{
  seed: number;
}>;

type DrainLimits = {
  maxPerFrame: number;
  budgetMs: number;
  now: () => number;
};

const SEED_STEP = 0x9e3779b9;

const count = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export function createSpawnQueue(initialSeed = 0) {
  const descriptors: SpawnDescriptor[] = [];
  const seedBase = Number.isFinite(initialSeed) ? Math.trunc(initialSeed) : 0;
  let sequence = 0;

  return {
    get pending() {
      return descriptors.length;
    },

    reconcile(activeCount: number, targetCount: number) {
      const desired = Math.max(0, count(targetCount) - count(activeCount));
      if (descriptors.length > desired) {
        descriptors.length = desired;
      }
      while (descriptors.length < desired) {
        descriptors.push({
          seed: (seedBase + Math.imul(sequence, SEED_STEP)) >>> 0,
        });
        sequence += 1;
      }
    },

    drain(
      attempt: (descriptor: SpawnDescriptor) => boolean | void,
      { maxPerFrame, budgetMs, now }: DrainLimits,
    ) {
      if (descriptors.length === 0) return 0;

      const attemptLimit = Math.max(1, count(maxPerFrame));
      const timeLimit = Number.isFinite(budgetMs)
        ? Math.max(0, budgetMs)
        : 0;
      const startedAt = now();
      let attempted = 0;

      while (descriptors.length > 0 && attempted < attemptLimit) {
        if (attempted > 0 && now() - startedAt >= timeLimit) break;
        const shouldContinue = attempt(descriptors.shift()!) !== false;
        attempted += 1;
        if (!shouldContinue) break;
      }

      return attempted;
    },
  };
}
