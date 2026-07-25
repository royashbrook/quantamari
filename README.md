# Quarkatamari

Quarkatamari is an untimed, browser-based 3D rolling game about the scale of
everything. Begin with a deliberately speculative visualization near the
edge of known physics, roll through particles, atoms, cells, dust, rooms,
planets, and galaxies, then continue forever into a clearly fictional beyond.

The current release contains 21 scale layers and 168 collectible identities.
Progress is driven only by collection, saved locally, and Scale Lab can preview
any layer without changing that save. The shipped game is a static, offline-
capable PWA; all gameplay and persistence stay in the browser.

## Gameplay contract

- Visible size determines whether a pickup fits. If it looks smaller than the
  mash, it can be rolled up.
- Shape-specific gameplay bulk tunes growth; it is not presented as physical
  mass or energy.
- Collection fills one logarithmic layer. A scale-shift animation grows the
  player, shrinks the outgoing world, and bakes prior layers into a
  non-colliding substrate underfoot.
- Current-layer pickups are interactive. The next layer is at least 1.9 times
  the maximum rolling envelope, and its obstacles are spawned only when a full
  player-width corridor remains; failed placements are declined.
- Obstacles use depenetration plus tangent sliding instead of frame-dependent
  bounce impulses.
- Every named collectible has a deterministic model signature, motion
  personality, and synthesized three-note pickup voice.
- Rendering adapts pickup density, pixel ratio, and shadows from measured frame
  rate, with quieter early layers, mobile budgets, shared visual templates,
  incremental spawning, and lazy-loaded Three.js.

## Science contract

The scientifically anchored path spans roughly 62 orders of magnitude, so
scale changes are logarithmic. Deliberate theory/fantasy bookends extend below
current knowledge and beyond the observable universe without displaying
fictional metre measurements.
Authoritative references from NIST, CERN, NIH, CDC, EPA, USGS, and NASA are
attached to every era and collectible fact. Confidence labels distinguish
measured science, supported models, unresolved territory, and deliberate
speculation.

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
- `app/scale-data.ts` — 21-era progression, 168 facts, and source metadata
- `app/game-rules.ts` — deterministic identities and testable gameplay budgets
- `tests/` — render, science, progression, collision, audio-identity, and
  adaptive-quality checks

## Releases and mirrors

The Sites lifecycle owns production deployment and `.openai/hosting.json`
identifies the existing site. GitHub is a source mirror and collaboration
surface. Never force-push either remote.

See [docs/GITHUB-SITES-WORKFLOW.md](docs/GITHUB-SITES-WORKFLOW.md), or run
`npm run sync:remotes` after both remotes are configured and the tree is clean.

The release record is in [BACKLOG.md](BACKLOG.md). The annotated `v15.0.0` tag
is the rollback point before the V16 scale-layer architecture.
