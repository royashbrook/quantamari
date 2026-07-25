# Quarkatamari science policy

Last reviewed: 2026-07-25

Quarkatamari is an educational scale journey wrapped in an impossible rolling
toy. It aims for scientific honesty without pretending the central mechanic is
literal physics.

## What the game means

- **Scale** is the characteristic length of the active era. The authored
  journey interpolates logarithmically between scale anchors.
- **Fit** is geometric: visible bulk determines whether an item can be
  collected.
- **Growth** is weighted: current-era mass or energy matters most, while older
  scales add a rapidly diminishing amount.
- **Journey hours** are a progression target, not elapsed cosmic time. The
  authored path reaches the fictional beyond at 500 engaged hours, then the
  scale function continues without a cap.
- **Quantum foam, pre-matter rolling, magical adhesion, and the metaversal
  region are visual/game metaphors.** They are labeled unknown or speculative.

## Confidence labels

- `MEASURED` — directly constrained by observations or experiments at the level
  represented by the era.
- `SUPPORTED MODEL` — a well-supported scientific description whose visual form
  is still a model.
- `UNKNOWN` — no experimentally established ladder is filled in for the player.
- `SPECULATIVE` — an explicit visualization or fiction beyond established
  evidence.

## Source and fact policy

Every collectible carries an item-level source link inherited from a curated
pair of authoritative references for its era. Those links are visible both
after collection and in Scale Lab. A source supports the scientific topic and
scale class; it does not imply that the source endorses the game's rolling
metaphor.

Primary source families:

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
- Quarks are not shown as collectable isolated classical beads; early pickup
  art represents traces or field activity.
- Cells and organisms use stylized, recognizable silhouettes rather than
  anatomical models.
- Macroscopic and cosmic bodies are not drawn at mutually exact ratios inside
  one playfield. The active seven-band window preserves readability.
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
