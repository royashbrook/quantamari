# Quantamari

[Quantamari](https://quantamari.royashbrook.com/) is an untimed, browser-based
3D rolling game about the scale of everything. Begin with a deliberately
speculative visualization near the edge of known physics, roll through
particles, atoms, cells, dust, rooms, planets, and galaxies, then continue
forever: completing the fictional beyond folds the journey back into a fresh
quantum foam as a new cycle.

The current release contains 34 scale layers and 234 collectible identities.
The default Long Game pace is forty times the Learning Tour pace; switching
pace never rewrites earned progress. Every find is saved by stable ID in an
animated, searchable Field Guide. Scale Lab can preview any layer without
changing the journey. Escape opens a pause menu with sound, reset, About, save
rescue, and the exact running build. The shipped game is a static,
offline-capable PWA designed mobile-first for modern iPhones and Android
phones: drag anywhere to roll, pinch to zoom the free lens, and read journey
progress from one touch-through bottom dock that
respects notch and home-indicator safe areas. Eligible phones and tablets get
compact first-visit installation coaching after play begins, with native
Android installation and current Apple Home Screen steps; the menu keeps those
steps available later. All gameplay and persistence stay in the browser.

## Gameplay contract

- Visible size determines whether a pickup fits. If it looks smaller than the
  mash, it can be rolled up.
- A collected object sticks on the side where contact happened, keeps its
  authored color, proportions, and silhouette, and rotates with the rolling
  body. Furniture, trees, buildings, and worlds are uniformly fitted only when
  needed to stay inside the supported physical envelope; they are never
  absorbed into an anonymous ball.
- Shape-specific gameplay bulk tunes growth; it is not presented as physical
  mass or energy.
- Collection fills one logarithmic layer. Long Game is the default 40× journey;
  Learning Tour keeps the former fast testing pace. Only current-layer pickups
  advance progress. Reaching 100% makes the next scale ready but never forces
  the jump: the mash and collision envelope stay capped while the player keeps
  collecting, and a visible Grow action advances whenever they choose.
- When the player chooses to grow, Long Game crosses scale boundaries
  continuously: camera distance has already grown with the physical ball, then
  rebases with it without replaying a level animation or braking momentum.
  Learning Tour keeps a deliberate scale-skip animation whose endpoint matches
  the next layer. Attached toys and the immediate prior pickup field rebase
  with the ball, while the next lower layer becomes dense, non-colliding
  fabric.
- Theory Playground begins in unsupported empty space: its playful foam,
  strings, notes, and other ideas are pickups rather than a claimed floor.
  Ambient density and the first prior-layer rug appear only after scaling up.
- Recognizable organisms resolve on a microscope slide. Dust and grains live
  on its surrounding work surface, tabletop objects live on furniture, and
  shared catalog models become collectible room props. The room opens forward
  through a real doorway to a porch and yard; city blocks connect through
  streets, and cities remain visible as small texture inside regional terrain.
- Current-layer pickups are interactive. The next layer is at least 1.9 times
  the maximum rolling envelope, and its obstacles are spawned only when a full
  player-width corridor remains; failed placements are declined.
- Obstacles use depenetration plus tangent sliding instead of frame-dependent
  bounce impulses.
- Completing the final fictional layer folds the journey back into a fresh
  Theory Playground as a new cycle. The Field Guide, collection history, and
  pace choice persist across cycles; the mash and position are reborn. The
  wrap is a narrative loop between the two SPECULATIVE bookend eras, not a
  claim that the universe is literally a quantum foam bubble.
- Every named collectible has a stable-ID model signature, motion personality,
  synthesized three-note pickup voice, Field Guide portrait, reality-based form
  note, fact, confidence label, and authoritative scale/topic reference.
- Catalog entries are common, uncommon, or rare. Repeatable specimens keep a
  scale populated; named landmarks use a globally unique subject ID, appear
  only once at a time, and never respawn after collection. Deterministic pity
  prevents completion-critical landmarks from being starved by luck. The Field
  Guide shows the complete catalog, locked silhouette clues, scale and landmark
  completion, scientific sets, and achievements.
- Rendering uses a fixed, player-selected profile instead of changing the world
  from frame-rate samples. Standard is the default; Battery Optimized is an
  explicit persistent choice that lowers frame rate and GPU detail without
  removing semantic population or whole environment layers. Only three
  semantic layers remain resident; the immediate prior layer is either
  instanced or baked into a finite place's underfoot surface, distant pickups
  retain authored silhouettes in per-specimen instanced families, rich models
  have a hard budget, and Three.js stays lazy-loaded. See
  [docs/PERFORMANCE.md](docs/PERFORMANCE.md).
- The native game menu pauses simulation without changing journey state. Reset
  requires confirmation and removes only Quantamari's browser save keys.

## Science contract

Last reviewed: 2026-08-01.

Quantamari is an educational scale journey wrapped in an impossible rolling
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
- **Earlier layers remain nested.** The immediately previous layer becomes an
  underfoot rug of flattened, recognizable objects and its scientific motif.
  Older layers soften into visual fabric and distant depth rather than sharing
  the current play plane. At most three semantic layers are resident at once,
  and retained lower layers are non-interactive.
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

The facts, stable IDs, visual forms, relative sizes, and source registry live in
`src/lib/data/scale-catalog.json`. `src/lib/scale-data.ts` validates that catalog
before exposing it to the game, so malformed or unsourced content is a test
failure.

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
- Adjacent named astronomical landmarks form a compressed scale gallery, not a
  literal spatial map. The Orion Nebula is a physical star-forming cloud; the
  perspective-defined Orion constellation is not treated as an object or
  cluster.
- The game does not claim a confirmed physical structure below current
  particle probes or beyond the observable universe.

Before adding or changing a collectible:

1. Add the specimen to `src/lib/data/scale-catalog.json` with a stable ID,
   relative size, authored visual form, rarity, and spawn mode. A singleton
   also needs a globally unique scientific `subjectId`.
2. Assign a characteristic scale and confidence class.
3. Write one plain-language fact without implying more certainty than its era.
4. Add or reuse an authoritative government, laboratory, or primary scientific
   reference.
5. Verify the item has a stable visual/audio identity and does not collide with
   another collectible ID.
6. Run `npm test`.

## Development

Requirements: Node.js `>=22.13.0`. Install Playwright's browser once before
running the end-to-end suite.

```bash
npm ci
npx playwright install chromium webkit
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
Playwright. The long gameplay, install, and mobile matrix uses Vite's static
preview; a separate short Wrangler pass verifies Cloudflare routing, headers,
rescue, and offline recovery. Browser artifacts are written under
`tests/results/e2e*` and ignored.
`npm run test:all` is the release and CI contract.

Important code:

- `src/routes/+page.svelte` — browser game shell, HUD, and Scale Lab
- `src/lib/game/runtime.ts` — mounted Three.js world and simulation lifecycle
- `src/lib/game/audio.ts` — synthesized pickup and transition audio
- `src/lib/game/collectible-visuals.ts` — authored rich collectible geometry
- `src/lib/game/collectible-lod.ts` — recognizable instanced LOD silhouettes
- `src/lib/game/collectible-markers.ts` — generated character marker sprites
- `src/lib/game/attachment-physics.ts` — contact placement and directional
  mash envelope
- `src/lib/game/literal-world-layout.ts` — finite microscope, tabletop, room,
  porch, and yard layout
- `src/lib/game/runtime-performance.ts` — opt-in named phase measurements
- `src/lib/game/spawn-queue.ts` — deterministic, time-budgeted world population
- `src/lib/game/spawn-policy.ts` — rarity weighting, singleton eligibility, and
  deterministic pity
- `src/lib/collection-progress.ts` — catalog completion and derived achievements
- `src/lib/data/scale-catalog.json` — editable era and collectible catalog
- `src/lib/scale-data.ts` — catalog validation and scale helpers
- `src/lib/game-rules.ts` — deterministic identities and gameplay budgets
- `src/lib/world-system.ts` — grounded world kinds, three-layer LOD, and budgets
- `src/lib/save-data.ts` — reorder-safe v4 saves and v2/v3 migrations
- `src/lib/components/FieldGuide.svelte` — animated collection history
- `src/lib/components/GameMenu.svelte` — pause, About, sound, and safe reset
- `src/lib/components/InstallCoach.svelte` — mobile PWA installation coach
- `src/lib/pwa-install.ts` — install eligibility and dismissal policy
- `src/service-worker.ts` — generated, root-scoped offline runtime
- `src/rescue.template.html` — dependency-free installed-save recovery hatch
- `tests/unit`, `tests/artifact`, and `tests/e2e` — Node, build, and browser
  contracts

The app is SvelteKit with `adapter-static`: `npm run build` emits only
`dist/client`, and all gameplay and persistence remain in the browser. Three.js
is lazy-loaded after the welcome screen. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Releases

GitHub `main` is the production source of truth. Every production-affecting push
to `main` automatically verifies and deploys the static PWA; documentation-only
pushes do not redeploy it. Never force-push.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

The `v15.0.0` tag preserves the final time/band version, `v1.0.0` is the
rollback point before the breaking SvelteKit rewrite, and `v2.0.0` marks that
rewrite in production. The v2.1 performance work is tracked in
[issue #8](https://github.com/royashbrook/quantamari/issues/8); v2.2 adds the
pause, reset, and About menu tracked in
[issue #20](https://github.com/royashbrook/quantamari/issues/20), and v2.2.1
adopts Roy's shared maker mark under
[issue #22](https://github.com/royashbrook/quantamari/issues/22). v2.2.2 adds
the standalone rescue hatch, legacy-worker cleanup, safe update handoff,
production sourcemaps, and WebKit recovery coverage under
[issue #24](https://github.com/royashbrook/quantamari/issues/24). v2.3 splits
runtime assets and audio into owned modules, moves collectible content to
validated JSON, and replaces generic non-rich pickups with authored instanced
silhouettes under [issues #25](https://github.com/royashbrook/quantamari/issues/25)
and [#28](https://github.com/royashbrook/quantamari/issues/28).
v2.3.1 surfaces waiting PWA builds in a persistent update banner and checks for
fresh builds while the game remains open under
[issue #30](https://github.com/royashbrook/quantamari/issues/30).
v2.4 bounds desktop and ultrawide world framing, prioritizes nearby authored
pickup detail, and rebuilds the nearest prior-layer rug from recognizable
low-detail catalog models under
[issue #32](https://github.com/royashbrook/quantamari/issues/32).
v3.0 rebrands the game as Quantamari, makes the PWA mobile-first
(pointer-id-safe drag steering, pinch-to-zoom lens, safe-area
HUD, compact fact card, dedicated maskable icons), targets 60 fps on the
balanced tier, moves service-worker cache writes off the critical path, and
folds the completed journey back into a fresh quantum foam as an eternal
cycle under [issue #34](https://github.com/royashbrook/quantamari/issues/34).
v3.0.1 completes the root-subdomain PWA cutover with exact-artifact deployment,
offline production proof, and scoped retirement of the old path workers under
[issue #36](https://github.com/royashbrook/quantamari/issues/36).
v3.1 keeps Long Game dense without changing its 40× progression, replaces
automatic quality switching with persistent Standard and Battery Optimized
profiles, bounds rendering work, gives every catalog form an intentional
silhouette, prevents the free lens from revealing unearned scale layers, and
turns Giant Worlds into an atmospheric cloud-top scene. Its compact welcome
screen also launches Long Game or Learning Tour directly without hiding either
action below a small-iPhone viewport. These changes are tracked under
[issues #10](https://github.com/royashbrook/quantamari/issues/10),
[#11](https://github.com/royashbrook/quantamari/issues/11),
[#28](https://github.com/royashbrook/quantamari/issues/28), and
[#32](https://github.com/royashbrook/quantamari/issues/32), with the launch
screen fix under
[#38](https://github.com/royashbrook/quantamari/issues/38).
v3.1.1 gives iPhone gameplay back to the world: it removes the installed-PWA
bottom gap, reduces the permanent mobile HUD to compact status and touch
controls, waits for a real pickup before showing a fact, and keeps every guide
exit visible without triggering iOS input zoom. The fix is tracked under
[issue #40](https://github.com/royashbrook/quantamari/issues/40).
v3.1.2 removes Surge, keeps only the brand and Menu above the mobile world,
and collapses scale, frontier progress, and run totals into one translucent,
touch-through bottom dock. Pickups temporarily replace that dock with a
bounded fact notice before progress returns, including in installed iPhone
landscape. The redesign is tracked under
[issue #42](https://github.com/royashbrook/quantamari/issues/42).
v3.2 makes scale history spatial instead of decorative. The theoretical
origin remains floorless; later layers present their nearest constituent as
an authored volumetric field, physical surface, curved shell, or distant
field, while three deeper layers compress into deterministic scientific
motifs. Collectibles now retain separate solid and membrane/glow silhouettes
through world LOD, the foundation, and the rolled-up mash. The universal
circular LOD badge is gone, exposing the distinct low-poly forms without
increasing the former two-draw representation budget. A translucent surface
memory keeps that history visible over floors, roads, and cities, while shell
textures and volumetric fields carry it through planetary and cosmic scales.
This work is tracked
under [issue #44](https://github.com/royashbrook/quantamari/issues/44).
v3.3 helps phone and tablet players install Quantamari without crowding the
launcher or permanent game HUD. Eligible Apple players receive current Add to
Home Screen guidance after starting; browsers with a native install prompt get
its one-tap action. Dismissal snoozes the coach for fourteen days, installed
apps suppress it, and the pause menu keeps installation available on demand.
This work is tracked under
[issue #47](https://github.com/royashbrook/quantamari/issues/47).
v3.4 gives environmental and older-scale backdrops restrained, floating-origin
safe parallax while keeping grounded play surfaces stable. v3.4.1 separates
that depth from the immediate prior scale: N−1 is flattened into the rug,
periodically tiled on flat worlds, and wrapped around planetary ground shells;
only N−2 and older history may recede. Loose outgoing pickups fold toward the
player during Learning Tour transitions and are retired when their rug takes
over. This work
is tracked under [issues #52](https://github.com/royashbrook/quantamari/issues/52)
and [#54](https://github.com/royashbrook/quantamari/issues/54).
v3.5 makes scale growth player-paced: reaching 100% unlocks Grow while play and
collection continue at a capped physical size. It expands the catalog to 234
specimens, adds deterministic rarity and one-of-one landmarks, keeps unique
subjects out of repeated rugs, turns the Field Guide into a complete found and
missing catalog, and derives achievements and scientific collection sets from
the same stable save records. This work is tracked under
[issue #56](https://github.com/royashbrook/quantamari/issues/56).
v3.5.2 makes PWA updates build-aware. A service worker matching the document
already on screen activates silently; only a genuinely different build shows
the persistent update action, failed activation returns to a retryable state,
and a completed document update leaves one concise version toast. This work is
tracked under [issue #60](https://github.com/royashbrook/quantamari/issues/60).
v3.6 makes collection visibly physical. Pickups attach on their contact side,
retain authored silhouettes through every LOD profile, contribute only their
directional support to collision, and stay within the supported rolling
envelope. Recognizable organisms now resolve on a microscope slide; dust,
tabletop objects, furniture, a forward room exit, porch, and yard form one
finite literal route whose movable props use the same catalog models seen on
the mash. Its absolute scene origin and collected one-off props survive reloads,
and finite population stays inside its authored support perimeter. Finite
floors carry prior-scale memory in their own materials instead of a global rug
plane or old objects standing upright through the place. This work is tracked under
[issue #62](https://github.com/royashbrook/quantamari/issues/62).
Legacy save keys, cache names, and browser test hooks deliberately retain their
historical `quarkatamari` identifiers so existing installed copies can update
and repair themselves without abandoning local progress.
