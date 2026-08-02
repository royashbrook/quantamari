# Performance and scale budget

Quantamari stays browser-only. Rust/WASM is not currently justified: source
review and the in-game renderer counters identify render objects, draw calls,
and GPU detail as the main scaling risks, while the physics loop remains small.

## Runtime strategy

- Three.js is a deferred browser chunk and loads only when play or Scale Lab
  begins.
- The animation loop uses fixed, refresh-aligned profile targets instead of
  submitting at the display's full refresh rate. Standard targets 60 fps on a
  wide viewport and 30 fps on a compact viewport, settling to 30 or 24 fps
  while idle. Battery Optimized targets 30 fps active and 15 fps idle. Long
  pauses drop missed frames instead of replaying them.
- At most three semantic scale layers are resident: current, recognizable prior,
  and fabric prior.
- Prior-layer objects and city buildings use `InstancedMesh` where their 3D
  form remains legible. Finite literal rooms and yards bake the prior layer
  into the authored floor instead of drawing a second upright object field.
- Far pickups hide their multi-part models and join per-specimen instanced
  authored silhouettes; the generic fallback is used only if an authored pool
  is exhausted.
- Rich pickup models have a fixed profile cap. Standard caps device pixel ratio
  at 1.5 on wide views and 1.25 on compact views. Battery Optimized caps it at
  1 and disables antialiasing and transmission. Both compact Standard and
  Battery disable shadow maps so mobile play remains inside its hard draw-call
  ceiling; Battery also uses the tighter rich-model budget. The selected
  profile is persisted and changes only through the game menu: measured frame
  rate never switches profile, population, environment, or substrate. Excess
  and distant pickups use a 600 ms shrink-out instead of disappearing
  abruptly.
- Save data retains the newest 96 mash records for continuity and the Field
  Guide; the newest 32 remain visually resident on the rolling ball. Of those,
  the newest 4–8 are multi-part rich toys. Older visible pieces retain their
  real authored silhouettes inside one bounded merged-geometry batch, rather
  than becoming generic balls or adding one draw call per species. The newest
  toys stay as visible authored meshes in every profile; lens and projected
  size changes never replace the entire mash with the batch. Battery keeps the
  same semantic contents with the tightest rich-toy cap. Rich toys are capped
  by their actual render-leaf cost as well as their count, so one unusually
  elaborate specimen cannot consume the whole mobile draw budget.
- Pickup contact determines attachment direction in the rolling body's local
  frame. A uniform support fit preserves the model's axis ratios while keeping
  its far edge within the same 1.72× directional envelope used by collision.
  Collision queries only attachments facing the obstacle, so a couch on the
  rear of the mash cannot make a clear doorway impassable in front.
- Projected pixel size—not a fixed distance—selects rich versus simplified
  pickup detail. Separate rich-detail enter and exit thresholds keep pickups and
  attached toys from flickering at an LOD edge. The logarithmic free lens also
  changes semantic layer residency without changing saved journey progress.
- Grounded scenery keeps a stable 3×3 periodic neighborhood while a floating
  origin recenters logical coordinates at deterministic chunk boundaries.
  Accumulated origin phase is preserved in saves and Scale Lab returns. Tiny
  central scenery swaps to one box-proxy draw while instanced families remain
  batched.
- Decorative near, mid, and far backdrop bands derive small angular parallax
  from that same accumulated origin phase. Only the band roots move each
  frame; instance matrices and materials remain unchanged. The immediate prior
  layer never uses backdrop parallax. On repeating flat worlds its flattened
  authored models use a periodic, chunk-anchored root. Finite literal places
  map that memory onto their finite authored support materials with no global
  overlay plane, preventing both old upright objects and an infinite-looking
  desk or room. On planetary worlds 32–64
  dynamic instance transforms wrap outside the visible active patch, fade at
  that seam, and align to the local surface normal. Their buffers update only
  after travel. Motif texture phase comes from the same absolute travel, so the
  models and fabric both read as the rug underfoot. Only compressed
  N−2-and-older history may recede.
- Native menu, Field Guide, and Scale Lab dialogs pause the renderer while open.
  The Field Guide remains CSS-only and uses `content-visibility`.
- Rarity and singleton selection is a bounded deterministic pass over one
  era's tiny catalog, not a scene traversal. Pity state advances only after a
  successful current-era spawn. Unique landmarks are never copied into rugs,
  so completion rules do not add substrate instances or draw calls.

## Budgets

| Profile / view | Active | Idle | DPR cap | Draw calls | Triangles | Rich objects | Instances |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Standard / wide | 60 fps | 30 fps | 1.5 | 180 | 600k | 64 | 4,000 |
| Standard / compact | 30 fps | 24 fps | 1.25 | 120 | 300k | 48 | 2,500 |
| Battery Optimized | 30 fps | 15 fps | 1 | 120 | 180k | 32 | 1,500 |

Viewport class determines only framing, frame pacing, DPR, and rendering
budget. The selected profile never changes the authored encounter population
or removes an entire environment, prior-layer rug, or substrate. Opt-in browser
diagnostics report measured FPS, draw calls, and triangle count without
changing the profile.

## WASM threshold

Keep the simulation in TypeScript unless a browser trace shows the CPU
simulation itself above 6 ms p95 on desktop or 8 ms p95 on mobile after spatial
and allocation fixes. WASM cannot repair GPU overdraw or excessive WebGL draw
calls, and adding it before that evidence would increase download and
maintenance cost without addressing the measured bottleneck.
