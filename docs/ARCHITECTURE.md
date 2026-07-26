# V2 architecture

Quarkatamari is a static browser game. SvelteKit prerenders the shell, Vite
bundles it, and `adapter-static` emits `dist/client`. There is no application
server, API, database, authentication layer, or server-side game state.

## Boundaries

- `src/routes/+page.svelte` owns browser UI state, inputs, dialogs, audio, save
  hydration, and the Three.js mount point.
- `src/lib/game/runtime.ts` owns the renderer, scene, simulation loop, rolling,
  collisions, pickups, scale transitions, and world residency. `mountGame`
  returns one synchronous cleanup function, including cancellation of a pending
  lazy Three.js import. The runtime module itself is also imported only after
  the welcome screen, keeping simulation parsing off the initial UI path.
- `src/lib/game-rules.ts`, `save-data.ts`, `scale-data.ts`, and
  `world-system.ts` are browser-independent domain modules tested directly by
  Node.
- `src/service-worker.ts` uses SvelteKit's generated build manifest to precache
  every shipped chunk. It deliberately avoids `skipWaiting` and
  `clients.claim`, so an update cannot replace code beneath an open game.

The UI/runtime boundary is deliberately small. A framework render can update
HUD and collection state, but it does not rebuild the scene. Opening a native
dialog pauses input, Scale Lab remounts a preview without mutating journey
progress, and leaving the route destroys every renderer listener and animation
frame.

## V2.1 performance contract

Collectible population is descriptor-first. The runtime reconciles a
deterministic queue without creating Three.js resources, then promotes at most
three entries per animation frame, checking the active quality tier's 2 ms work
budget between promotions while always permitting one so population cannot
stall. A first-time visual-template build ends that frame's promotion work.
Cached template bounds remove per-spawn scene traversals. New objects bloom for
800 ms and remain non-colliding until fully visible; replenishments enter
through an outer ring.

Battery quality treats `maxDrawCalls` as a hard weighted budget. Each cached
collectible template records its render-leaf cost, while the live scene is
counted without pickup roots. Rich pickups are admitted only while their cost
fits; the remainder share one instanced far-field draw. Transmission is disabled
in battery mode so physical materials cannot add a hidden extra pass.

Performance diagnostics are opt-in and never update Svelte state. Browser tests
sample frame interval, CPU frame work, simulation, population, pickup LOD,
environment/substrate rebuilds, ground-texture generation, and render
submission, then attach rolling p50/p95/max summaries. The complex baseline uses
Scale Lab layer 20 and waits for at least 120 frames. Absolute timing is
diagnostic because CI uses SwiftShader; real-device traces remain the authority
for FPS.

Environment and substrate replacement remain atomic. In the measured complex
baseline their rebuilds stayed below 4 ms and 3 ms respectively, while the large
headless outlier was first shader submission. Ground and core texture keys
already remove redundant generation. A detached two-world builder would add
geometry/material ownership and collider-swap risk, so it stays gated on a
real-device profile showing rebuild work—not shader warm-up—as the bottleneck.

## Repository layout

- `src/routes` contains the single prerendered game page and its layout.
- `src/lib/components` contains Svelte UI; `src/lib/game` contains the Three.js
  runtime; the remaining `src/lib` modules are browser-independent domain code.
- `static` contains files shipped byte-for-byte with the PWA.
- `tests/unit`, `tests/artifact`, and `tests/e2e` contain Node, built-artifact,
  and Playwright contracts. Generated browser artifacts go in the ignored
  `tests/results` directory.
- `scripts` contains build utilities, `docs` contains supporting architecture
  notes, and `.github` contains verification and deployment automation.

## Physics follow-up

Three.js remains the renderer. The current collision system remains the v2
baseline because changing frameworks and physics together would make parity
failures ambiguous.

Rapier.js is a candidate, not a commitment. Evaluate it with reproducible
desktop and mobile scenes containing dense pickup fields and grounded scenery.
Adopt it only if it materially improves frame time or object capacity after
including WASM download, initialization, memory, synchronization, and
determinism costs. The existing physical-fit, obstacle corridor, tangent
sliding, transition, save, and three-layer residency tests are migration
constraints.
