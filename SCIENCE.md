# Quarkatamari science policy

Last reviewed: 2026-07-26

Quarkatamari is an educational scale journey wrapped in an impossible rolling
toy. It aims for scientific honesty without pretending the central mechanic is
literal physics.

## What the game means

- **Scale** is the characteristic length of the active era. The authored
  journey interpolates logarithmically between scale anchors.
- **Fit** is geometric: the ground-plane footprint determines whether an item can be
  collected.
- **Growth** is collection-driven. Shape-specific “gameplay bulk” creates
  satisfying variation but is not a physical mass or energy calculation.
- **Earlier layers remain nested.** The immediately previous layer stays
  recognizable as simplified objects, the layer below becomes a dense visual
  fabric, and deeper structure is implied rather than rendered individually.
  At most three semantic layers are resident at once, and all retained layers
  are non-interactive.
- **The Theory Playground, pre-matter rolling, magical adhesion, and the
  metaversal region are visual/game metaphors.** Foam, strings, musical notes,
  topology, and extra dimensions are deliberately mixed together as a playful
  speculative opening—not a proposed ladder of matter.
- **Metre labels stop after the observable universe.** The final layer says
  `FICTIONAL · UNBOUNDED`.

## Confidence labels

- `MEASURED` — directly constrained by observations or experiments at the level
  represented by the era.
- `SUPPORTED MODEL` — a well-supported scientific description whose visual form
  is still a model.
- `UNKNOWN` — no experimentally established ladder is filled in for the player.
- `SPECULATIVE` — an explicit visualization or fiction beyond established
  evidence.

## Source and fact policy

Every collectible carries a science-reference link inherited from a curated
pair of authoritative references for its era. Those links are visible after
collection, in the Field Guide, and in Scale Lab. A reference gives context for
the scientific topic and scale class; it does not imply that its publisher
endorses the game's rolling metaphor or every detail of the plush-like portrait.

Authoritative reference families:

- NIST: SI length/mass, CODATA Planck length, atomic spectra, and chemistry
- CERN: Standard Model, confinement, ALICE, and quark–gluon plasma
- NIH/NHGRI/NIGMS and CDC: DNA, cells, yeast, and viruses
- US EPA and USGS: indoor particulate matter and geological grain sizes
- NASA: planets, stars, planetary systems, galaxies, cosmic structure, and the
  observable universe

The source registry lives beside the era facts in `app/scale-data.ts`, making a
missing source a test failure.

## Deliberate simplifications

- Electron clouds are probability-inspired art, never planetary electron
  tracks.
- Quarks are not shown as collectable isolated classical beads; pickup art
  represents traces or field activity. “Quarks & Gluons” is not presented as a
  quark–gluon-plasma substrate.
- Cells and organisms use stylized, recognizable silhouettes rather than
  anatomical models.
- Field Guide portraits keep one reality-based cue and then soften it into a
  two-to-five-part, plush-friendly silhouette. Each portrait says why that cue
  was chosen and where the shorthand stops being literal.
- Macroscopic and cosmic bodies are not drawn at mutually exact ratios inside
  one playfield. Current-layer interaction plus a clearly oversized next-layer
  preview preserves readability.
- The game does not claim a confirmed physical structure below current particle
  probes or beyond the observable universe.

## Review checklist

Before adding or changing a collectible:

1. Assign a characteristic scale and confidence class.
2. Write one plain-language fact without implying more certainty than its era.
3. Add or reuse an authoritative government, laboratory, or primary scientific
   reference.
4. Verify the item has a stable visual/audio identity and does not collide with
   another collectible ID.
5. Run `npm test`.
