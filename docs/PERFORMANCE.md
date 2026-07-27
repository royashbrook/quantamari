# Performance and scale budget

Quarkatamari stays browser-only. Rust/WASM is not currently justified: source
review and the in-game renderer counters identify render objects, draw calls,
and GPU detail as the main scaling risks, while the physics loop remains small.

## Runtime strategy

- Three.js is a deferred browser chunk and loads only when play or Scale Lab
  begins.
- At most three semantic scale layers are resident: current, recognizable prior,
  and fabric prior.
- Prior-layer objects and city buildings use `InstancedMesh`.
- Far pickups hide their multi-part models and share one colored instanced mesh.
- Rich pickup models have a quality-tier cap; battery mode tightens that cap
  from measured draw calls until it meets budget. Pickup population, pixel ratio,
  and shadows adapt through frame-rate hysteresis. Once a rendered world
  downgrades, quality promotion is locked until the world or viewport changes,
  preventing a five-second balanced/battery feedback loop. Excess pickups retire
  one at a time with a 600 ms shrink-out instead of disappearing as a batch.
- The mash keeps only 12–24 recent rich toys; older pieces collapse into one
  colored instanced proxy draw. When the mash itself projects below rich-detail
  size—or battery quality is required—its remaining toys use that same proxy
  draw without changing their saved identities.
- Projected pixel size—not a fixed distance—selects rich versus simplified
  pickup detail. Separate rich-detail enter and exit thresholds keep pickups and
  attached toys from flickering at an LOD edge. The logarithmic free lens also
  changes semantic layer residency without changing saved journey progress.
- Grounded scenery keeps a stable 3×3 periodic neighborhood while a floating
  origin recenters logical coordinates at deterministic chunk boundaries.
  Accumulated origin phase is preserved in saves and Scale Lab returns. Tiny
  central scenery swaps to one box-proxy draw while instanced families remain
  batched.
- The Field Guide is CSS-only, uses `content-visibility`, and pauses the game
  renderer while open.

## Budgets

| Tier | Target | Draw calls | Triangles | Rich objects | Instances |
| --- | ---: | ---: | ---: | ---: | ---: |
| High | 55 fps | 180 | 600k | 64 | 4,000 |
| Balanced | 40 fps | 120 | 300k | 48 | 2,500 |
| Battery | 30 fps | 80 | 180k | 32 | 1,500 |

The desktop controls HUD reports measured FPS, draw calls, and triangle count.
Quality falls quickly when a device misses its target and rises only after a
sustained recovery.

## WASM threshold

Keep the simulation in TypeScript unless a browser trace shows the CPU
simulation itself above 6 ms p95 on desktop or 8 ms p95 on mobile after spatial
and allocation fixes. WASM cannot repair GPU overdraw or excessive WebGL draw
calls, and adding it before that evidence would increase download and
maintenance cost without addressing the measured bottleneck.
