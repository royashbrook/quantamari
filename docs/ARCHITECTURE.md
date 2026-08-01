# Quantamari architecture

Quantamari is a static browser game. SvelteKit prerenders the shell, Vite
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
  Registration is explicit: an installed update waits while a persistent
  top-of-game notice offers to save the current universe and activate it on
  request; the menu keeps the same action as a fallback. The page also checks
  for a fresh worker on focus, reconnection, visibility, and a quiet interval.
  `static/sw.js` permanently retires the former worker path without deleting
  another project's caches.
- `static/rescue.html` is generated as one inline IIFE with no runtime imports.
  The inline watchdog in `src/app.html` links to it even when the app module
  graph fails. Rescue validates and migrates saves with the normal domain code,
  while cache repair is restricted to Quantamari's names and scope.

The UI/runtime boundary is deliberately small. A framework render can update
HUD and collection state, but it does not rebuild the scene. Opening the native
menu, Field Guide, or Scale Lab dialog pauses input and rendering. Scale Lab
remounts a preview without mutating journey progress, and leaving the route
destroys every renderer listener and animation frame. Confirmed reset suppresses
autosave/pagehide writes, removes only the three Quantamari save generations,
broadcasts a reset generation to every open same-origin game instance, and
reloads the same static route.

## Performance contract

Collectible population is descriptor-first. The runtime reconciles a
deterministic queue without creating Three.js resources, then promotes at most
three entries per animation frame, checking the 2 ms work budget between
promotions while always permitting one so population cannot
stall. A first-time visual-template build ends that frame's promotion work.
Cached template bounds remove per-spawn scene traversals. New objects bloom for
800 ms and remain non-colliding until more than half bloomed. The first
population of every fresh layer uses the dense inner field; later
replenishments enter through an outer ring. Distant pickups shrink out before
their resources are released.

Every quality profile treats `maxDrawCalls` as a hard weighted budget. Each
cached collectible template records its render-leaf cost, while the live scene,
shadow casters, instanced silhouette families, and a measured renderer-pipeline
reserve are accounted separately. Rich pickups are admitted only while their
cost fits. Admission is spatially stable: nearby and current-layer specimens
receive the rich slots before distant work, rather than whichever objects
happened to spawn first. The remainder use one instanced family per visible
specimen so their authored silhouettes remain recognizable. All catalog
geometry is normalized before merging, and tests require every specimen to
produce its authored merged silhouette instead of silently falling back to a
generic shape. Screen-stable character badges keep active-layer simplified
specimens identifiable. The immediate prior layer is a sparse rug of exact
authored low-detail models; deeper residents collapse into points and substrate
texture rather than duplicate pickup draws. One generic instanced mesh remains
only as unreachable capacity protection for populations above the authored
limits. Transmission is disabled in battery mode so physical materials cannot
add a hidden extra pass.
Performance profile is an explicit player preference, persisted independently
from journey progress. Standard selects fixed wide or compact pacing, DPR, and
rendering budgets; Battery Optimized uses its fixed cooler settings. Nothing
samples frame rate to promote or demote the profile, so the renderer cannot
rebuild its world in a five-second feedback loop. Both profiles keep the same
semantic pickup population, environment, substrate, and attached identities.
Projected rich/simple LOD uses hysteresis. Save data retains 96 mash records and
the newest 32 remain visually resident. Of those, the newest 4–8 attached
identities remain multi-part rich toys; older visible records retain their
authored silhouettes inside one merged-geometry mesh on the rolling mash.
Cached source geometries that leave the visible window are disposed, so a long
and diverse collection cannot grow memory without bound. When the whole mash is
genuinely too small on screen, the newest toys join that same authored batch.
Battery Optimized uses the identical records with the smallest rich set. Rich
attachment admission is limited by both toy count and measured render-leaf
cost; expensive species therefore collapse to their authored batched
silhouette before they can break the profile's draw-call ceiling.

Long Game and Learning Tour share one logical layer-advance path. Long Game
keeps camera distance proportional to the physical radius and rebases both
together; Learning Tour alone runs the explicit scale-skip animation. That
animation ends at the exact next-layer player radius. Attached transforms and
their save records rebase at the same handoff. Loose outgoing pickups fold
toward the player, settle flat, and are then retired while the incoming N−1
rug crossfades underneath them. Planet-scale transitions use the same handoff
on a curved shell. Next-era blockers shrink independently instead of being
mistaken for outgoing fabric. Flat rugs are periodic and chunk-anchored;
planetary rugs wrap a small authored population continuously across the curved
surface from absolute travel. Both are non-interactive lower-scale
representations. The opening Theory Playground has
no passive environment or substrate; its first rug appears only after the next
layer is reached.

Camera framing is mobile-first without letterboxing. Portrait devices keep a
56-degree vertical field of view; wider canvases derive their vertical field of
view from a 58-degree horizontal play aperture. Desktop and ultrawide windows
therefore reveal a bounded amount of world instead of increasing the population
pressure with every extra pixel. A fixed compact/wide population budget provides
a second hard ceiling; switching performance profile does not change it.

Performance diagnostics are opt-in and never update Svelte state. Browser tests
sample frame interval, CPU frame work, simulation, population, pickup LOD,
environment/substrate rebuilds, ground-texture generation, and render
submission, then attach rolling p50/p95/max summaries. The complex baseline uses
Scale Lab layer 20 and waits for at least 120 frames. Absolute timing is
diagnostic because CI uses SwiftShader; real-device traces remain the authority
for FPS.

The profile settings also pace frame submission: Standard targets 60 fps wide
or 30 fps compact, with 30/24 fps idle ceilings; Battery Optimized targets
30 fps active and 15 fps idle. An absolute deadline keeps common 60/120 Hz
displays aligned and avoids cumulative drift or catch-up bursts on other
refresh rates after a suspended tab.

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
