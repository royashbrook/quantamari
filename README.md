# Quarkatamari

Quarkatamari is an untimed, browser-based 3D rolling game about the scale of
everything. Begin with a deliberately speculative visualization near the
Planck regime, roll through particles, atoms, cells, dust, rooms, planets, and
galaxies, then continue forever into a clearly fictional beyond.

The current release contains 21 eras and 168 collectible identities across a
500-hour authored journey. Progress is saved locally and Scale Lab can preview
any era without changing that save.

## Gameplay contract

- Visible size determines whether a pickup fits. If it looks smaller than the
  mash, it can be rolled up.
- Mass or energy weighting determines growth. Older scales remain collectible
  but contribute progressively less.
- Only current-scale pickups remain visible on the mash. Older pickups dissolve
  silently into its mass and replenish their scale band.
- The world keeps three smaller and three larger neighboring scale bands alive.
  Oversized obstacles are separated during spawning so they cannot form cages.
- Every named collectible has a deterministic model signature, motion
  personality, and synthesized three-note pickup voice.
- Rendering adapts pickup density, pixel ratio, and shadows from measured frame
  rate, with mobile-specific budgets.

## Science contract

The game compresses roughly 95 orders of magnitude into play, so scale changes
are logarithmic and time is a game progression axis—not physical time.
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

The release record is in [BACKLOG.md](BACKLOG.md). V14 remains the rollback
point for the V15 backlog-completion release.
