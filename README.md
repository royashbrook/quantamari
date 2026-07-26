# Quarkatamari

Quarkatamari is an untimed, browser-based 3D rolling game about the scale of
everything. Begin with a deliberately speculative visualization near the
edge of known physics, roll through particles, atoms, cells, dust, rooms,
planets, and galaxies, then continue forever into a clearly fictional beyond.

The current release contains 34 scale layers and 220 collectible identities.
The default Long Game pace is forty times the Learning Tour pace; switching
pace never rewrites earned progress. Every find is saved by stable ID in an
animated, searchable Field Guide. Scale Lab can preview any layer without
changing the journey. The shipped game is a static, offline-capable PWA; all
gameplay and persistence stay in the browser.

## Gameplay contract

- Visible size determines whether a pickup fits. If it looks smaller than the
  mash, it can be rolled up.
- Shape-specific gameplay bulk tunes growth; it is not presented as physical
  mass or energy.
- Collection fills one logarithmic layer. Long Game is the default 40× journey;
  Learning Tour keeps the former fast testing pace. Only current-layer pickups
  advance progress.
- A scale-shift animation grows the player, shrinks the outgoing world, and
  retains the immediate prior layer as recognizable low-poly objects. The next
  lower layer becomes a dense, non-colliding fabric underfoot.
- Dust and grains live on a floor, tabletop objects live on furniture, rooms
  open into yards, city blocks connect through streets, and cities remain
  visible as small texture inside regional terrain.
- Current-layer pickups are interactive. The next layer is at least 1.9 times
  the maximum rolling envelope, and its obstacles are spawned only when a full
  player-width corridor remains; failed placements are declined.
- Obstacles use depenetration plus tangent sliding instead of frame-dependent
  bounce impulses.
- Every named collectible has a stable-ID model signature, motion personality,
  synthesized three-note pickup voice, Field Guide portrait, reality-based form
  note, fact, confidence label, and authoritative scale/topic reference.
- Rendering adapts pickup density, pixel ratio, and shadows from measured frame
  rate. Only three semantic layers remain resident; the immediate prior layer is
  instanced, distant pickups collapse into one instanced draw, rich models have
  a hard budget, and Three.js stays lazy-loaded. See
  [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## Science contract

The scientifically anchored path spans roughly 62 orders of magnitude, so
scale changes are logarithmic. Deliberate theory/fantasy bookends extend below
current knowledge and beyond the observable universe without displaying
fictional metre measurements.
Authoritative references from NIST, CERN, NIH, CDC, EPA, USGS, and NASA give
each collectible scale or topic context; they are not presented as citations
for every playful one-line fact. Confidence labels distinguish measured
science, supported models, unresolved territory, and deliberate speculation.

See [SCIENCE.md](SCIENCE.md) for the editorial policy, source registry, and
known game metaphors.

## Development

Requirements: Node.js `>=22.13.0`. Install Playwright's browser once before
running the end-to-end suite.

```bash
npm ci
npx playwright install chromium
npm run dev
npm run check
npm test
npm run test:e2e
npm run test:all
```

`npm ci` also activates the tracked commit-message hook. Every commit must
reference its GitHub issue using `#<number>`.

`npm test` runs the fast Node gameplay/science/save suite. `npm run test:e2e`
builds the production PWA, verifies the static artifact, and exercises it with
Playwright. `npm run test:all` is the release and CI contract.

Important code:

- `src/routes/+page.svelte` — browser game shell, sound, HUD, and Scale Lab
- `src/lib/game/runtime.ts` — mounted Three.js world and simulation lifecycle
- `src/lib/scale-data.ts` — 34-era progression, 220 facts, stable IDs, and sources
- `src/lib/game-rules.ts` — deterministic identities and gameplay budgets
- `src/lib/world-system.ts` — grounded world kinds, three-layer LOD, and budgets
- `src/lib/save-data.ts` — reorder-safe v4 saves and v2/v3 migrations
- `src/lib/components/FieldGuide.svelte` — animated collection history
- `src/service-worker.ts` — generated, subpath-safe offline runtime
- `tests/unit`, `tests/artifact`, and `tests/e2e` — Node, build, and browser
  contracts

The app is SvelteKit with `adapter-static`: `npm run build` emits only
`dist/client`, and all gameplay and persistence remain in the browser. Three.js
is lazy-loaded after the welcome screen. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Releases and mirrors

GitHub `main` is the production source of truth. Every push to `main`
automatically deploys the static PWA. The existing Sites project is retained
only for optional isolated testing; do not publish it during a normal release.
Never force-push.

See [docs/GITHUB-SITES-WORKFLOW.md](docs/GITHUB-SITES-WORKFLOW.md).

The release record is in [BACKLOG.md](BACKLOG.md). The `v1.0.0` tag is the
rollback point before the v2 SvelteKit rewrite; `v2.0.0` will be tagged only
after the branch is reviewed, merged, and deployed.
