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
