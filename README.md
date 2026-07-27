# Quarkatamari

Quarkatamari is an untimed, browser-based 3D rolling game about the scale of
everything. Begin with a deliberately speculative visualization near the
edge of known physics, roll through particles, atoms, cells, dust, rooms,
planets, and galaxies, then continue forever into a clearly fictional beyond.

The current release contains 34 scale layers and 220 collectible identities.
The default Long Game pace is forty times the Learning Tour pace; switching
pace never rewrites earned progress. Every find is saved by stable ID in an
animated, searchable Field Guide. Scale Lab can preview any layer without
changing the journey. Escape opens a pause menu with sound, reset, About, and
the exact running build. The shipped game is a static, offline-capable PWA; all
gameplay and persistence stay in the browser.

## Gameplay contract

- Visible size determines whether a pickup fits. If it looks smaller than the
  mash, it can be rolled up.
- Shape-specific gameplay bulk tunes growth; it is not presented as physical
  mass or energy.
- Collection fills one logarithmic layer. Long Game is the default 40× journey;
  Learning Tour keeps the former fast testing pace. Only current-layer pickups
  advance progress.
- Long Game crosses scale boundaries continuously: camera distance grows with
  the physical ball, then rebases with it without replaying a level animation
  or braking momentum. Learning Tour keeps a deliberate scale-skip animation
  whose endpoint matches the next layer. Attached toys and the immediate prior
  pickup field rebase with the ball, while the next lower layer becomes dense,
  non-colliding fabric.
- Theory Playground begins in unsupported empty space: its playful foam,
  strings, notes, and other ideas are pickups rather than a claimed floor.
  Ambient density and the first prior-layer rug appear only after scaling up.
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
- The native game menu pauses simulation without changing journey state. Reset
  requires confirmation and removes only Quarkatamari's browser save keys.

## Science contract

Last reviewed: 2026-07-26.

Quarkatamari is an educational scale journey wrapped in an impossible rolling
toy. It aims for scientific honesty without pretending the central mechanic is
literal physics. The scientifically anchored path spans roughly 62 orders of
magnitude, so scale changes are logarithmic.

What the game means:

- **Scale** is the characteristic length of the active era. The authored
  journey interpolates logarithmically between scale anchors.
- **Fit** is geometric: the ground-plane footprint determines whether an item
  can be collected.
- **Growth** is collection-driven. Shape-specific gameplay bulk creates
  satisfying variation but is not a physical mass or energy calculation.
- **Earlier layers remain nested.** The immediately previous layer stays
  recognizable as simplified objects, the layer below becomes a dense visual
  fabric, and deeper structure is implied rather than rendered individually.
  At most three semantic layers are resident at once, and retained lower layers
  are non-interactive.
- **The Theory Playground, pre-matter rolling, magical adhesion, and the
  metaversal region are visual/game metaphors.** Foam, strings, musical notes,
  topology, and extra dimensions are deliberately mixed together as a playful
  speculative opening—not a proposed ladder of matter.
- **Metre labels stop after the observable universe.** The final layer says
  `FICTIONAL · UNBOUNDED`.

Confidence labels:

- `MEASURED` — directly constrained by observations or experiments at the
  represented scale.
- `SUPPORTED MODEL` — a well-supported scientific description whose visual
  form is still a model.
- `UNKNOWN` — no experimentally established ladder is filled in for the player.
- `SPECULATIVE` — an explicit visualization or fiction beyond established
  evidence.

Every collectible carries a science-reference link inherited from a curated
pair of authoritative references for its era. Those links appear after
collection, in the Field Guide, and in Scale Lab. A reference gives context for
the scientific topic and scale class; it does not imply that its publisher
endorses the rolling metaphor or every detail of a plush-like portrait.

Authoritative reference families:

- NIST: SI length/mass, CODATA Planck length, atomic spectra, and chemistry
- CERN: Standard Model, confinement, ALICE, and quark–gluon plasma
- NIH/NHGRI/NIGMS and CDC: DNA, cells, yeast, and viruses
- US EPA and USGS: indoor particulate matter and geological grain sizes
- NASA: planets, stars, planetary systems, galaxies, cosmic structure, and the
  observable universe

The source registry lives beside the era facts in `src/lib/scale-data.ts`, so a
missing source is a test failure.

Deliberate simplifications:

- Electron clouds are probability-inspired art, never planetary electron
  tracks.
- Quarks are not collectable isolated classical beads; pickup art represents
  traces or field activity. “Quarks & Gluons” is not presented as a
  quark–gluon-plasma substrate.
- Cells and organisms use stylized, recognizable silhouettes rather than
  anatomical models.
- Field Guide portraits keep one reality-based cue and soften it into a
  two-to-five-part, plush-friendly silhouette. Each portrait says why that cue
  was chosen and where the shorthand stops being literal.
- Macroscopic and cosmic bodies are not drawn at mutually exact ratios inside
  one playfield. Current-layer interaction plus a clearly oversized next-layer
  preview preserves readability.
- The game does not claim a confirmed physical structure below current
  particle probes or beyond the observable universe.

Before adding or changing a collectible:

1. Assign a characteristic scale and confidence class.
2. Write one plain-language fact without implying more certainty than its era.
3. Add or reuse an authoritative government, laboratory, or primary scientific
   reference.
4. Verify the item has a stable visual/audio identity and does not collide with
   another collectible ID.
5. Run `npm test`.

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
Playwright. Browser artifacts are written under `tests/results/e2e` and ignored.
`npm run test:all` is the release and CI contract.

Important code:

- `src/routes/+page.svelte` — browser game shell, sound, HUD, and Scale Lab
- `src/lib/game/runtime.ts` — mounted Three.js world and simulation lifecycle
- `src/lib/game/runtime-performance.ts` — opt-in named phase measurements
- `src/lib/game/spawn-queue.ts` — deterministic, time-budgeted world population
- `src/lib/scale-data.ts` — 34-era progression, 220 facts, stable IDs, and sources
- `src/lib/game-rules.ts` — deterministic identities and gameplay budgets
- `src/lib/world-system.ts` — grounded world kinds, three-layer LOD, and budgets
- `src/lib/save-data.ts` — reorder-safe v4 saves and v2/v3 migrations
- `src/lib/components/FieldGuide.svelte` — animated collection history
- `src/lib/components/GameMenu.svelte` — pause, About, sound, and safe reset
- `src/service-worker.ts` — generated, subpath-safe offline runtime
- `tests/unit`, `tests/artifact`, and `tests/e2e` — Node, build, and browser
  contracts

The app is SvelteKit with `adapter-static`: `npm run build` emits only
`dist/client`, and all gameplay and persistence remain in the browser. Three.js
is lazy-loaded after the welcome screen. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Releases and mirrors

GitHub `main` is the production source of truth. Every production-affecting push
to `main` automatically verifies and deploys the static PWA; documentation-only
pushes do not redeploy it. Never force-push.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

The `v15.0.0` tag preserves the final time/band version, `v1.0.0` is the
rollback point before the breaking SvelteKit rewrite, and `v2.0.0` marks that
rewrite in production. The v2.1 performance work is tracked in
[issue #8](https://github.com/royashbrook/quarkatamari/issues/8); v2.2 adds the
pause, reset, and About menu tracked in
[issue #20](https://github.com/royashbrook/quarkatamari/issues/20), and v2.2.1
adopts Roy's shared maker mark under
[issue #22](https://github.com/royashbrook/quarkatamari/issues/22).
