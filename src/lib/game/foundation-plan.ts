import type { Era } from "../scale-data";

export type FoundationPresentation =
  | "none"
  | "field"
  | "surface"
  | "shell"
  | "distant-field";

export type FoundationMotif =
  | "foam"
  | "field"
  | "particle"
  | "nucleus"
  | "atom"
  | "bond"
  | "protein"
  | "virus"
  | "cell"
  | "microbe"
  | "fiber"
  | "grain"
  | "object"
  | "room"
  | "road"
  | "city"
  | "terrain"
  | "moon"
  | "planet"
  | "star"
  | "orbit"
  | "galaxy"
  | "web"
  | "horizon"
  | "speculative";

export type FoundationRelation =
  | "memory"
  | "constituent"
  | "suspended"
  | "surface-debris"
  | "contained"
  | "infrastructure"
  | "map"
  | "orbital"
  | "population"
  | "network";

export type FoundationLayer = {
  index: number;
  id: string;
  name: string;
  motif: FoundationMotif;
  relation: FoundationRelation;
  depth: number;
  role: "nearest" | "compressed";
};

export type FoundationPlan = {
  presentation: FoundationPresentation;
  nearest: FoundationLayer | null;
  compressed: FoundationLayer[];
  ancestryCount: number;
  visibleLayerIndices: number[];
  key: string;
};

export const FOUNDATION_MOTIF_BY_ERA_ID: Readonly<
  Record<string, FoundationMotif>
> = {
  "theory-playground": "foam",
  "particle-probe-frontier": "field",
  "quarks-gluons": "particle",
  "hadron-forge": "particle",
  "nuclear-heart": "nucleus",
  "atomic-cloud": "atom",
  "molecular-assembly": "bond",
  "macromolecule-reef": "protein",
  "virus-garden": "virus",
  "cellular-sea": "cell",
  "microbe-meadow": "microbe",
  "fiber-pollen": "fiber",
  "dust-country": "grain",
  "granule-ground": "grain",
  "pocket-world": "object",
  "tabletop-trek": "object",
  "everyday-kingdom": "room",
  "room-scale": "room",
  "vehicle-yard": "road",
  "house-yard": "road",
  "built-environment": "city",
  "city-streets": "city",
  "landscape-scale": "terrain",
  "regional-map": "terrain",
  "moon-scale": "moon",
  "planetary-pantry": "planet",
  "giant-worlds": "planet",
  "stellar-buffet": "star",
  "system-sweep": "orbit",
  "stellar-neighborhood": "star",
  "galaxy-garden": "galaxy",
  "galaxy-cluster-web": "web",
  "observable-universe": "horizon",
  "metaversal-beyond": "speculative",
};

const FIELD_ERA_IDS = new Set([
  "particle-probe-frontier",
  "quarks-gluons",
  "hadron-forge",
  "nuclear-heart",
  "atomic-cloud",
  "molecular-assembly",
  "macromolecule-reef",
  "virus-garden",
  "cellular-sea",
  "microbe-meadow",
]);

const SURFACE_ERA_IDS = new Set([
  "fiber-pollen",
  "dust-country",
  "granule-ground",
  "pocket-world",
  "tabletop-trek",
  "everyday-kingdom",
  "room-scale",
  "vehicle-yard",
  "house-yard",
  "built-environment",
  "city-streets",
  "landscape-scale",
  "regional-map",
]);

const SHELL_ERA_IDS = new Set([
  "moon-scale",
  "planetary-pantry",
  "giant-worlds",
]);

export function foundationPresentationFor(
  currentIndex: number,
  eras: readonly Era[],
): FoundationPresentation {
  if (currentIndex <= 0 || eras.length === 0) return "none";
  const era = eras[Math.min(eras.length - 1, Math.floor(currentIndex))];
  if (FIELD_ERA_IDS.has(era.id)) return "field";
  if (SURFACE_ERA_IDS.has(era.id)) return "surface";
  if (SHELL_ERA_IDS.has(era.id)) return "shell";
  return "distant-field";
}

function relationFor(eraId: string, presentation: FoundationPresentation) {
  if (presentation === "field") {
    if (eraId === "particle-probe-frontier") return "memory";
    return [
      "atomic-cloud",
      "molecular-assembly",
      "macromolecule-reef",
      "virus-garden",
      "cellular-sea",
      "microbe-meadow",
    ].includes(eraId)
      ? "suspended"
      : "constituent";
  }
  if (presentation === "shell") return "map";
  if (presentation === "distant-field") {
    if (eraId === "system-sweep") return "orbital";
    if (eraId === "galaxy-garden") return "population";
    if (["galaxy-cluster-web", "observable-universe"].includes(eraId)) {
      return "network";
    }
    return "memory";
  }
  if (["fiber-pollen", "dust-country", "granule-ground"].includes(eraId)) {
    return "surface-debris";
  }
  if (
    ["pocket-world", "tabletop-trek", "everyday-kingdom", "room-scale"].includes(
      eraId,
    )
  ) {
    return "contained";
  }
  if (
    ["vehicle-yard", "house-yard", "built-environment", "city-streets"].includes(
      eraId,
    )
  ) {
    return "infrastructure";
  }
  if (["landscape-scale", "regional-map"].includes(eraId)) return "map";
  return "memory";
}

export function foundationPlan(
  viewScale: number,
  eras: readonly Era[],
  compressedDepth = 3,
): FoundationPlan {
  const currentIndex = Math.max(
    0,
    Math.min(eras.length - 1, Math.ceil(viewScale)),
  );
  const presentation = foundationPresentationFor(currentIndex, eras);
  if (presentation === "none" || currentIndex === 0) {
    return {
      presentation: "none",
      nearest: null,
      compressed: [],
      ancestryCount: 0,
      visibleLayerIndices: [],
      key: "none",
    };
  }

  const relation = relationFor(eras[currentIndex].id, presentation);
  const layerFor = (
    index: number,
    role: FoundationLayer["role"],
  ): FoundationLayer => {
    const era = eras[index];
    const motif = FOUNDATION_MOTIF_BY_ERA_ID[era.id];
    if (!motif) {
      throw new RangeError(`No foundation motif for era "${era.id}"`);
    }
    return {
      index,
      id: era.id,
      name: era.name,
      motif,
      relation,
      depth: currentIndex - index,
      role,
    };
  };

  const nearest = layerFor(currentIndex - 1, "nearest");
  const compressed: FoundationLayer[] = [];
  const oldestVisible = Math.max(
    0,
    currentIndex - 1 - Math.max(0, Math.floor(compressedDepth)),
  );
  for (let index = currentIndex - 2; index >= oldestVisible; index -= 1) {
    compressed.push(layerFor(index, "compressed"));
  }
  const ancestryCount = oldestVisible;
  const visibleLayerIndices = [
    nearest.index,
    ...compressed.map((layer) => layer.index),
  ];
  const key = [
    presentation,
    nearest.id,
    ...compressed.map((layer) => layer.id),
    `older:${ancestryCount}`,
  ].join(":");

  return {
    presentation,
    nearest,
    compressed,
    ancestryCount,
    visibleLayerIndices,
    key,
  };
}
