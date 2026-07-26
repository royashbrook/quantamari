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

Requirements: Node.js `>=22.13.0`, Bash, GNU `timeout`, and `flock`.

```bash
npm ci
npm run dev
npm test
npm run lint
```

`npm test` performs the production build, verifies the rendered application,
and runs the pure gameplay/science regression suite.

Important code:

- `app/page.tsx` — Three.js world, rolling, pickup, sound, HUD, and Scale Lab
- `app/scale-data.ts` — 34-era progression, 220 facts, stable IDs, and sources
- `app/game-rules.ts` — deterministic identities and testable gameplay budgets
- `app/world-system.ts` — grounded world kinds, three-layer LOD, and budgets
- `app/save-data.ts` — reorder-safe v4 saves and v2/v3 migrations
- `app/field-guide.tsx` — animated, searchable collection history
- `tests/` — render, science, progression, collision, audio-identity, and
  adaptive-quality checks

## Releases and mirrors

GitHub `main` is the production source of truth. Every push to `main`
automatically deploys the static PWA. The existing Sites project is retained
only for optional isolated testing; do not publish it during a normal release.
Never force-push.

See [docs/GITHUB-SITES-WORKFLOW.md](docs/GITHUB-SITES-WORKFLOW.md).

The release record is in [BACKLOG.md](BACKLOG.md). The `v1.0.0` tag is the
rollback point immediately before the nested-world/Field Guide release.
