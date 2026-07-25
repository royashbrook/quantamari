# Quarkatamari release backlog

V15 closes the agreed gameplay and hardening backlog. V14 (`9cc1150`) is the
preserved rollback point.

## Complete

- [x] True 3D rolling player with attached, silhouette-changing pickups
- [x] Quantum-foam start and visually distinct theoretical, particle, atomic,
      biological, domestic, planetary, and cosmic environments
- [x] Current-scale-only visible mash composition
- [x] Silent, replenishing older-scale pickups with diminishing growth
- [x] Visible-size pickup eligibility and mass/energy-weighted growth
- [x] Three scale bands above and below the current era
- [x] Separation rules for oversized obstacles
- [x] Mobile HUD reduction, pulled-back camera, touch rolling, and faster motion
- [x] 21 eras, 168 collectible types, Scale Lab, local saves, and infinite play
- [x] Deterministic bespoke detail geometry and motion for every collectible
- [x] Deterministic unique synthesized pickup voice for every collectible
- [x] Era and item-level authoritative science sources with confidence labels
- [x] Adaptive graphics quality for mobile and lower-performing devices
- [x] Automated build, render, progression, collision, identity, source, and
      performance-budget regression tests
- [x] GitHub/Sites dual-remote synchronization workflow and release docs

## Definition of done

The release is complete when `npm test` and `npm run lint` pass, phone and
desktop previews remain playable, a clean release commit is checkpointed to the
existing Sites project, and the deployment reaches a terminal success state.

New ideas belong in a future release rather than reopening V15.
