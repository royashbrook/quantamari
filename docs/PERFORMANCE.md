# Performance and scale budget

Quantamari stays browser-only. Rust/WASM is not currently justified: source
review and the in-game renderer counters identify render objects, draw calls,
and GPU detail as the main scaling risks, while the physics loop remains small.

## Runtime strategy

- Three.js is a deferred browser chunk and loads only when play or Scale Lab
  begins.
- The animation loop uses refresh-aligned 60/30 fps tier targets instead of
  submitting at the display's full refresh rate. A stationary world settles to
  30 fps, and long pauses drop missed frames instead of replaying them.
- At most three semantic scale layers are resident: current, recognizable prior,
  and fabric prior.
- Prior-layer objects and city buildings use `InstancedMesh`.
- Far pickups hide their multi-part models and share one colored instanced mesh.
- Rich pickup models have a quality-tier cap; battery mode tightens that cap
  from measured draw calls until it meets budget. Pickup population, pixel ratio,
  and shadows adapt through frame-rate hysteresis. Automatic quality is
  downgrade-only for a running game; reload is the explicit reset. This prevents
  viewport and layer changes from restarting a five-second promotion/downgrade
  feedback loop. Excess and distant pickups use a 600 ms shrink-out instead of
  disappearing abruptly.
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
- Native menu, Field Guide, and Scale Lab dialogs pause the renderer while open.
  The Field Guide remains CSS-only and uses `content-visibility`.

## Budgets

| Tier | Target | Draw calls | Triangles | Rich objects | Instances |
| --- | ---: | ---: | ---: | ---: | ---: |
| High | 60 fps | 180 | 600k | 64 | 4,000 |
| Balanced | 30 fps | 120 | 300k | 48 | 2,500 |
| Battery | 30 fps | 80 | 180k | 32 | 1,500 |

The desktop controls HUD reports measured FPS, draw calls, and triangle count.
Quality falls when a device misses its target and remains at the cooler tier for
the rest of that running game.

## WASM threshold

Keep the simulation in TypeScript unless a browser trace shows the CPU
simulation itself above 6 ms p95 on desktop or 8 ms p95 on mobile after spatial
and allocation fixes. WASM cannot repair GPU overdraw or excessive WebGL draw
calls, and adding it before that evidence would increase download and
maintenance cost without addressing the measured bottleneck.
