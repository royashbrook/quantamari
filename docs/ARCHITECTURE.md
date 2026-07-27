# V2 architecture

Quarkatamari is a static browser game. SvelteKit prerenders the shell, Vite
bundles it, and `adapter-static` emits `dist/client`. There is no application
server, API, database, authentication layer, or server-side game state.

## Boundaries

- `src/routes/+page.svelte` owns browser UI state, inputs, dialogs, save
  hydration, and the Three.js mount point. `src/lib/game/audio.ts` owns its
  Web Audio graph and shutdown.
- `src/lib/game/runtime.ts` owns the renderer, scene, simulation loop, rolling,
  collisions, pickups, scale transitions, and world residency. `mountGame`
  returns one synchronous cleanup function. The runtime module, including
  Three.js, is imported only after the welcome screen, keeping simulation
  parsing off the initial UI path.
- `src/lib/game/collectible-visuals.ts`, `collectible-markers.ts`, and
  `collectible-lod.ts` own rich geometry, generated marker sprites, and
  per-specimen instanced silhouettes. Runtime chooses representation but does
  not define the assets.
- `src/lib/data/scale-catalog.json` is the editable content boundary.
  `scale-data.ts` validates stable IDs, science metadata, relative size, and
  visual-form references before publishing the typed catalog.
- `src/lib/game-rules.ts`, `save-data.ts`, `scale-data.ts`, and
  `world-system.ts` are browser-independent domain modules tested directly by
  Node.
- `src/service-worker.ts` uses SvelteKit's generated build manifest to precache
  every shipped chunk. It deliberately avoids `skipWaiting` and
  `clients.claim`, so an update cannot replace code beneath an open game.
  Registration is explicit: an installed update waits until the menu can save
  the current universe and activate it on request. `static/sw.js` permanently
  retires the former worker path without deleting another project's caches.
- `static/rescue.html` is generated as one inline IIFE with no runtime imports.
  The inline watchdog in `src/app.html` links to it even when the app module
  graph fails. Rescue validates and migrates saves with the normal domain code,
  while cache repair is restricted to Quarkatamari's names and scope.

The UI/runtime boundary is deliberately small. A framework render can update
HUD and collection state, but it does not rebuild the scene. Opening the native
menu, Field Guide, or Scale Lab dialog pauses input and rendering. Scale Lab
remounts a preview without mutating journey progress, and leaving the route
destroys every renderer listener and animation frame. Confirmed reset suppresses
autosave/pagehide writes, removes only the three Quarkatamari save generations,
broadcasts a reset generation to every open same-origin game instance, and
reloads the same static route.

## V2.1 performance contract

Collectible population is descriptor-first. The runtime reconciles a
deterministic queue without creating Three.js resources, then promotes at most
three entries per animation frame, checking the active quality tier's 2 ms work
budget between promotions while always permitting one so population cannot
stall. A first-time visual-template build ends that frame's promotion work.
Cached template bounds remove per-spawn scene traversals. New objects bloom for
800 ms and remain non-colliding until fully visible. Only the first population
uses the inner field; replenishments and post-transition populations enter
through an outer ring. Distant pickups shrink out before their resources are
released.

Battery quality treats `maxDrawCalls` as a hard weighted budget. Each cached
collectible template records its render-leaf cost, while the live scene is
counted without pickup roots. Rich pickups are admitted only while their cost
fits; the remainder use one instanced family per visible specimen so their
authored silhouettes remain recognizable. Screen-stable character badges keep
active-layer simplified specimens identifiable; the immediate prior layer keeps
its silhouettes, and deeper residents are represented by the substrate rather
than duplicate pickup draws. The generic mesh remains overflow protection only
and is asserted to stay unused for normal catalogued populations. Transmission
is disabled in battery mode so physical materials cannot add a hidden extra
pass.
Automatic quality is downgrade-only for the lifetime of a renderer. Semantic
world and viewport changes do not unlock promotion. A downgrade rebuilds world
instances once at the lower authored density; excess peripheral pickups shrink
out individually until the lower population is reached. The promotion lock
prevents either representation from being rebuilt in a five-second loop.
Projected rich/simple LOD uses hysteresis, and attached identities stay rich
until their whole mash is genuinely too small on screen. Battery mode uses the
same mash records through one instanced proxy draw.

Long Game and Learning Tour share one logical layer-advance path. Long Game
keeps camera distance proportional to the physical radius and rebases both
together; Learning Tour alone runs the explicit scale-skip animation. That
animation ends at the exact next-layer player radius. Attached transforms and
their save records rebase at the same handoff, and one prior pickup population
remains as recognizable lower-scale context. The opening Theory Playground has
no passive environment or substrate; its first rug appears only after the next
layer is reached.

Performance diagnostics are opt-in and never update Svelte state. Browser tests
sample frame interval, CPU frame work, simulation, population, pickup LOD,
environment/substrate rebuilds, ground-texture generation, and render
submission, then attach rolling p50/p95/max summaries. The complex baseline uses
Scale Lab layer 20 and waits for at least 120 frames. Absolute timing is
diagnostic because CI uses SwiftShader; real-device traces remain the authority
for FPS.

The existing quality budgets also pace active frame submission to 60 or 30 fps,
with a 30 fps idle ceiling. An absolute deadline preserves those
keeps common 60/120 Hz displays aligned and avoids cumulative drift or
catch-up bursts on other refresh rates after a
suspended tab.

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
  and Playwright contracts. The full renderer suite stays on Chromium while a
  focused production boot/recovery suite also runs on desktop WebKit and iPhone.
  Generated browser artifacts go in the ignored `tests/results` directory.
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
