export const RUNTIME_PHASES = [
  "frame",
  "frame-interval",
  "simulation",
  "spawning",
  "pickup-lod",
  "world-rebuild",
  "substrate-rebuild",
  "ground-texture",
  "render-submit",
] as const;

export type RuntimePhase = (typeof RUNTIME_PHASES)[number];

export type PhaseSummary = {
  count: number;
  latest: number;
  p50: number;
  p95: number;
  max: number;
};

type PhaseSamples = {
  count: number;
  latest: number;
  next: number;
  values: number[];
};

const rounded = (value: number) => Math.round(value * 1_000) / 1_000;

const percentile = (sorted: number[], fraction: number) =>
  sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;

export function advanceFrameDeadline(
  now: number,
  deadline: number,
  targetFps: number,
) {
  const interval = 1_000 / targetFps;
  const tolerance = Math.min(4, interval * 0.25);
  if (now + tolerance < deadline) return null;
  const elapsed = Math.max(0, now - deadline);
  return deadline + (Math.floor((elapsed + tolerance) / interval) + 1) * interval;
}

export function createPhaseRecorder(sampleLimit = 180) {
  const limit = Math.max(1, Math.floor(sampleLimit));
  const phases = new Map<RuntimePhase, PhaseSamples>();

  return {
    record(phase: RuntimePhase, duration: number) {
      if (!Number.isFinite(duration) || duration < 0) return;
      const samples = phases.get(phase) ?? {
        count: 0,
        latest: 0,
        next: 0,
        values: [],
      };
      samples.count += 1;
      samples.latest = duration;
      if (samples.values.length < limit) {
        samples.values.push(duration);
      } else {
        samples.values[samples.next] = duration;
        samples.next = (samples.next + 1) % limit;
      }
      phases.set(phase, samples);
    },

    snapshot(): Partial<Record<RuntimePhase, PhaseSummary>> {
      return Object.fromEntries(
        [...phases].map(([phase, samples]) => {
          const sorted = [...samples.values].sort((left, right) => left - right);
          return [
            phase,
            {
              count: samples.count,
              latest: rounded(samples.latest),
              p50: rounded(percentile(sorted, 0.5)),
              p95: rounded(percentile(sorted, 0.95)),
              max: rounded(sorted.at(-1) ?? 0),
            },
          ];
        }),
      );
    },
  };
}
