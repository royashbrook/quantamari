# Quarkatamari release record

V15 is preserved at the annotated `v15.0.0` tag. V16 replaces the time/band
model with cumulative, collection-driven scale layers and a static PWA runtime.
The `v1.0.0` tag preserves the deployable PWA immediately before V17.

## V2 rewrite in progress

- [x] Preserve `v1.0.0` as the pre-rewrite rollback point
- [x] Replace React/Vinext with SvelteKit, Svelte 5, Vite, and `adapter-static`
- [x] Emit one client-only `dist/client` artifact with no application server
- [x] Preserve Three.js rendering, gameplay rules, physics, v4 saves, and v2/v3
      migrations behind an explicit mount/destroy lifecycle
- [x] Replace handwritten PWA build machinery with SvelteKit's generated,
      subpath-safe service worker and complete cold-install precache
- [x] Keep fast Node tests and add Playwright desktop, mobile, Scale Lab,
      persistence, and offline contracts
- [x] Require the browser contract before the automatic `main` deployment
- [x] Prepare the backward-compatible `royashbrook.com` pull/caching bridge
- [ ] Merge the site bridge, then merge v2 to `main`, verify production, and
      tag `v2.0.0`

Physics redesign is intentionally outside the mechanical framework rewrite.
Rapier.js remains a benchmark candidate only if measured scenes beat the current
collision system without changing pickup-fit, corridor, sliding, save, or scale
contracts.

## V17 complete

- [x] Long Game default pace plus a switchable Learning Tour
- [x] 34 authored layers and 220 stable collectible identities
- [x] Reorder-safe v4 saves with safe v2/v3 migration and aggregated history
- [x] Searchable animated Field Guide with facts, form notes, and references
- [x] Immediate prior-layer objects plus a second prior-layer fabric
- [x] Grounded dust, tabletop, interior/yard, city, regional, and cosmic worlds
- [x] Open room-to-yard route, connected street grids, and nested city terrain
- [x] Three-layer residency, runtime projected-size LOD, far-pickup and mash
      instancing, rich-model budgets, adaptive quality, semantic deep lens,
      stable periodic chunks, and floating origin
- [x] Subpath-safe cold-install offline service worker, full lazy-chunk
      precache, navigation-only shell fallback, and relative PWA scope
- [x] GitHub `main` automatic production deployment workflow

## V16 complete

- [x] Collection-driven logarithmic growth; movement no longer advances eras
- [x] 1.8-second grow/shrink scale transition and cumulative lower-layer substrate
- [x] Purely physical pickup fit with XZ footprints and no hidden era gate
- [x] Unmistakable next-layer sizing, cage-proof corridor spacing, and declined
      invalid spawns
- [x] Depenetrating collision with tangent sliding
- [x] One speculative Theory Playground with foam, strings, vibration, notes,
      topology, and explicit uncertainty
- [x] Particle Probe Frontier and scientifically safer Quarks & Gluons framing
- [x] Single-scrubber Scale Lab that cannot mutate journey state
- [x] Reduced HUD density, readable mobile type, focus rings, Escape handling,
      and modal/hidden simulation pause
- [x] Lower object budgets, shared geometry/material templates, incremental
      population, and deferred Three.js loading
- [x] Static export, offline service worker, manifest, maskable icons, and a
      static-only production Worker
- [x] Removed database, auth, image optimizer, remote-font, and starter assets
- [x] Regression coverage for physical fit, corridor clearance, sliding,
      transition ratios, static runtime, and PWA artifacts

## Definition of done

The release is complete when `npm run test:all` passes, phone and desktop
previews remain playable, a clean release commit reaches GitHub `main`, and the
automatic production deployment is verified.

New physics work starts from a measured v2 baseline rather than being mixed into
the framework migration.
