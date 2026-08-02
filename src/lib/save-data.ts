export type GameMode = "journey" | "learning";

export type SaveCatalogCurio = {
  id: string;
  spawnMode?: "repeatable" | "singleton";
};

export type SaveCatalogEra = {
  id: string;
  name: string;
  curios: readonly SaveCatalogCurio[];
};

export type MashRecordV4 = {
  eraId: string;
  curioId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  mergedInside: boolean;
};

export type CollectionEntry = {
  eraId: string;
  curioId: string;
  count: number;
  firstPick: number;
  lastPick: number;
};

export type SavedLiteralSceneOrigin = {
  x: number;
  z: number;
};

export type SaveDataV4 = {
  version: 4;
  mode: GameMode;
  eraId: string;
  progress: number;
  picked: number;
  unitemizedPicked: number;
  x: number;
  z: number;
  zooms: number;
  /** Completed full journeys through every layer. Absent in pre-v3.0 saves. */
  cycles: number;
  sound: boolean;
  mash: MashRecordV4[];
  /** Stable IDs for one-off authored world props already rolled up this cycle. */
  collectedAuthoredAnchors: string[];
  /** Absolute origin of the microscope-to-yard place for stable reloads. */
  literalSceneOrigin: SavedLiteralSceneOrigin | null;
  collection: CollectionEntry[];
};

export type CollectionPickup = {
  eraId: string;
  curioId: string;
  count?: number;
  pickedAt?: number;
  firstPick?: number;
  lastPick?: number;
};

export type SaveSnapshot = Omit<
  SaveDataV4,
  "version" | "collectedAuthoredAnchors" | "literalSceneOrigin"
> & {
  collectedAuthoredAnchors?: readonly string[];
  literalSceneOrigin?: SavedLiteralSceneOrigin | null;
};

export const SAVE_KEYS = Object.freeze({
  v4: "everything-roll-save-v4",
  v3: "everything-roll-save-v3",
  v2: "everything-roll-save-v2",
});

export type RawSaveCandidates = Partial<
  Record<keyof typeof SAVE_KEYS, string | null | undefined>
>;

export type LoadedSave = {
  save: SaveDataV4;
  sourceVersion: 2 | 3 | 4;
};

export const LEGACY_V3_ERA_NAMES: readonly string[] = Object.freeze([
  "Theory Playground",
  "Particle Probe Frontier",
  "Quarks & Gluons",
  "Hadron Forge",
  "Atomic Cloud",
  "Molecular Assembly",
  "Macromolecule Reef",
  "Cellular Sea",
  "Fiber & Pollen",
  "Dust Country",
  "Pocket World",
  "Everyday Kingdom",
  "Vehicle Yard",
  "Built Environment",
  "Landscape Scale",
  "Planetary Pantry",
  "Stellar Buffet",
  "System Sweep",
  "Galaxy Garden",
  "Observable Universe",
  "Metaversal Beyond",
]);

export type LegacyV2HourStop = {
  hours: number;
  eraName: string;
};

export const LEGACY_V2_HOUR_STOPS: readonly Readonly<LegacyV2HourStop>[] =
  Object.freeze(
    [
      [0, "Theory Playground"],
      [0.01, "Particle Probe Frontier"],
      [0.03, "Quarks & Gluons"],
      [0.1, "Hadron Forge"],
      [0.25, "Atomic Cloud"],
      [1, "Molecular Assembly"],
      [3, "Macromolecule Reef"],
      [5, "Cellular Sea"],
      [12.5, "Fiber & Pollen"],
      [20, "Dust Country"],
      [35, "Pocket World"],
      [60, "Everyday Kingdom"],
      [95, "Vehicle Yard"],
      [125, "Built Environment"],
      [165, "Landscape Scale"],
      [215, "Planetary Pantry"],
      [300, "Stellar Buffet"],
      [345, "System Sweep"],
      [380, "Galaxy Garden"],
      [450, "Observable Universe"],
      [500, "Metaversal Beyond"],
    ].map(([hours, eraName]) =>
      Object.freeze({
        hours: hours as number,
        eraName: eraName as string,
      }),
    ),
  );

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
) {
  const number = finiteNumber(value);
  return number === null ? fallback : Math.max(minimum, Math.min(maximum, number));
}

function nonnegativeInteger(value: unknown, fallback = 0) {
  return Math.floor(
    boundedNumber(value, fallback, 0, Number.MAX_SAFE_INTEGER),
  );
}

function tuple3(value: unknown, positive = false): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const numbers = value.map(finiteNumber);
  if (
    numbers.some(
      (number) => number === null || (positive && number <= 0),
    )
  ) {
    return null;
  }
  return numbers as [number, number, number];
}

function collectionKey(eraId: string, curioId: string) {
  return `${eraId}\u0000${curioId}`;
}

function normalizedPickup(
  pickup: CollectionPickup,
): CollectionEntry | null {
  if (!pickup.eraId || !pickup.curioId) return null;
  const count = Math.max(1, nonnegativeInteger(pickup.count, 1));
  const pickedAt = finiteNumber(pickup.pickedAt);
  const first = finiteNumber(pickup.firstPick);
  const last = finiteNumber(pickup.lastPick);
  const firstPick = Math.max(0, pickedAt ?? first ?? last ?? 0);
  const lastPick = Math.max(0, pickedAt ?? last ?? first ?? 0);
  return {
    eraId: pickup.eraId,
    curioId: pickup.curioId,
    count,
    firstPick: Math.min(firstPick, lastPick),
    lastPick: Math.max(firstPick, lastPick),
  };
}

export function aggregatePickups(
  pickups: readonly CollectionPickup[],
  startingCollection: readonly CollectionEntry[] = [],
) {
  const entries = new Map<string, CollectionEntry>();

  for (const raw of [...startingCollection, ...pickups]) {
    const pickup = normalizedPickup(raw);
    if (!pickup) continue;
    const key = collectionKey(pickup.eraId, pickup.curioId);
    const current = entries.get(key);
    if (!current) {
      entries.set(key, pickup);
      continue;
    }
    entries.set(key, {
      ...current,
      count: Math.min(
        Number.MAX_SAFE_INTEGER,
        current.count + pickup.count,
      ),
      firstPick:
        current.firstPick === 0 || pickup.firstPick === 0
          ? 0
          : Math.min(current.firstPick, pickup.firstPick),
      lastPick: Math.max(current.lastPick, pickup.lastPick),
    });
  }

  return [...entries.values()];
}

export function collectionCount(collection: readonly CollectionEntry[]) {
  return collection.reduce(
    (total, entry) =>
      Math.min(Number.MAX_SAFE_INTEGER, total + nonnegativeInteger(entry.count)),
    0,
  );
}

export function recordPickup(
  save: SaveDataV4,
  pickup: CollectionPickup,
): SaveDataV4 {
  const count = Math.max(1, nonnegativeInteger(pickup.count, 1));
  return {
    ...save,
    picked: Math.min(Number.MAX_SAFE_INTEGER, save.picked + count),
    collection: aggregatePickups([pickup], save.collection),
  };
}

export function createSaveData(snapshot: SaveSnapshot): SaveDataV4 {
  return {
    ...snapshot,
    version: 4,
    mash: snapshot.mash.slice(-96),
    collectedAuthoredAnchors: [
      ...new Set(snapshot.collectedAuthoredAnchors ?? []),
    ].slice(-256),
    literalSceneOrigin: snapshot.literalSceneOrigin
      ? { ...snapshot.literalSceneOrigin }
      : null,
    collection: snapshot.collection.map((entry) => ({ ...entry })),
  };
}

export function serializeSaveData(save: SaveDataV4) {
  return JSON.stringify(save);
}

function catalogPairExists(
  catalog: readonly SaveCatalogEra[],
  eraId: string,
  curioId: string,
) {
  return catalogCurio(catalog, eraId, curioId) !== undefined;
}

function catalogCurio(
  catalog: readonly SaveCatalogEra[],
  eraId: string,
  curioId: string,
) {
  return catalog
    .find((era) => era.id === eraId)
    ?.curios.find((curio) => curio.id === curioId);
}

function sanitizeMashRecord(
  value: unknown,
  catalog: readonly SaveCatalogEra[],
): MashRecordV4 | null {
  if (!isRecord(value)) return null;
  const eraId = typeof value.eraId === "string" ? value.eraId : "";
  const curioId = typeof value.curioId === "string" ? value.curioId : "";
  const position = tuple3(value.position);
  const rotation = tuple3(value.rotation);
  const scale = tuple3(value.scale, true);
  if (
    !catalogPairExists(catalog, eraId, curioId) ||
    !position ||
    !rotation ||
    !scale
  ) {
    return null;
  }
  return {
    eraId,
    curioId,
    position,
    rotation,
    scale,
    mergedInside: value.mergedInside === true,
  };
}

function sanitizeCollection(
  value: unknown,
  catalog: readonly SaveCatalogEra[],
) {
  if (!Array.isArray(value)) return [];
  const valid: CollectionPickup[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const eraId = typeof item.eraId === "string" ? item.eraId : "";
    const curioId = typeof item.curioId === "string" ? item.curioId : "";
    const count = finiteNumber(item.count);
    if (
      !catalogPairExists(catalog, eraId, curioId) ||
      count === null ||
      count < 1
    ) {
      continue;
    }
    valid.push({
      eraId,
      curioId,
      count,
      firstPick: boundedNumber(item.firstPick, 0, 0),
      lastPick: boundedNumber(item.lastPick, 0, 0),
    });
  }
  return aggregatePickups(valid).map((entry) =>
    catalogCurio(catalog, entry.eraId, entry.curioId)?.spawnMode ===
    "singleton"
      ? { ...entry, count: 1 }
      : entry,
  );
}

function sanitizedMash(
  value: unknown,
  catalog: readonly SaveCatalogEra[],
) {
  if (!Array.isArray(value)) return [];
  const records = value
    .map((record) => sanitizeMashRecord(record, catalog))
    .filter((record): record is MashRecordV4 => record !== null);
  const retainedSingletons = new Set<string>();
  return records
    .reverse()
    .filter((record) => {
      const curio = catalogCurio(catalog, record.eraId, record.curioId);
      if (curio?.spawnMode !== "singleton") return true;
      const key = collectionKey(record.eraId, record.curioId);
      if (retainedSingletons.has(key)) return false;
      retainedSingletons.add(key);
      return true;
    })
    .reverse()
    .slice(-96);
}

function sanitizedAuthoredAnchors(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (id): id is string =>
          typeof id === "string" &&
          id.length > 0 &&
          id.length <= 160 &&
          /^prop\/[a-z0-9][a-z0-9/-]*$/.test(id),
      ),
    ),
  ].slice(-256);
}

function sanitizedLiteralSceneOrigin(
  value: unknown,
): SavedLiteralSceneOrigin | null {
  if (!isRecord(value)) return null;
  const x = finiteNumber(value.x);
  const z = finiteNumber(value.z);
  return x === null || z === null ? null : { x, z };
}

function sanitizeV4(
  value: unknown,
  catalog: readonly SaveCatalogEra[],
): SaveDataV4 | null {
  if (!isRecord(value) || value.version !== 4 || catalog.length === 0) {
    return null;
  }
  const eraId = typeof value.eraId === "string" ? value.eraId : "";
  if (!catalog.some((era) => era.id === eraId)) return null;

  const collection = sanitizeCollection(value.collection, catalog);
  const itemized = collectionCount(collection);
  const reportedPicked = nonnegativeInteger(value.picked);
  const reportedUnitemized = nonnegativeInteger(value.unitemizedPicked);
  const unitemizedPicked = Math.max(
    reportedUnitemized,
    reportedPicked - itemized,
    0,
  );

  return {
    version: 4,
    mode: value.mode === "learning" ? "learning" : "journey",
    eraId,
    progress: boundedNumber(value.progress, 0, 0, 1),
    picked: Math.max(reportedPicked, itemized + unitemizedPicked),
    unitemizedPicked,
    x: boundedNumber(value.x, 0),
    z: boundedNumber(value.z, 0),
    zooms: nonnegativeInteger(value.zooms),
    cycles: nonnegativeInteger(value.cycles),
    sound: typeof value.sound === "boolean" ? value.sound : true,
    mash: sanitizedMash(value.mash, catalog),
    collectedAuthoredAnchors: sanitizedAuthoredAnchors(
      value.collectedAuthoredAnchors,
    ),
    literalSceneOrigin: sanitizedLiteralSceneOrigin(
      value.literalSceneOrigin,
    ),
    collection,
  };
}

function eraForLegacyName(
  name: string,
  catalog: readonly SaveCatalogEra[],
) {
  return catalog.find((era) => era.name === name) ?? catalog[0];
}

function legacyMashRecord(
  value: unknown,
  catalog: readonly SaveCatalogEra[],
): MashRecordV4 | null {
  if (!isRecord(value)) return null;
  const sourceEra = finiteNumber(value.sourceEra);
  const curioIndex = finiteNumber(value.curioIndex);
  if (
    sourceEra === null ||
    curioIndex === null ||
    !Number.isInteger(sourceEra) ||
    !Number.isInteger(curioIndex) ||
    sourceEra < 0 ||
    sourceEra >= LEGACY_V3_ERA_NAMES.length
  ) {
    return null;
  }
  const era = catalog.find(
    (candidate) => candidate.name === LEGACY_V3_ERA_NAMES[sourceEra],
  );
  const curio = era?.curios[curioIndex];
  const position = tuple3(value.position);
  const rotation = tuple3(value.rotation);
  const scale = tuple3(value.scale, true);
  if (!era || !curio || !position || !rotation || !scale) return null;
  return {
    eraId: era.id,
    curioId: curio.id,
    position,
    rotation,
    scale,
    mergedInside: value.mergedInside === true,
  };
}

function legacyMash(
  value: unknown,
  catalog: readonly SaveCatalogEra[],
) {
  if (!Array.isArray(value)) return [];
  return value
    .map((record) => legacyMashRecord(record, catalog))
    .filter((record): record is MashRecordV4 => record !== null)
    .slice(-96);
}

function collectionFromLegacyMash(mash: readonly MashRecordV4[]) {
  return aggregatePickups(
    mash.map((record) => ({
      eraId: record.eraId,
      curioId: record.curioId,
      firstPick: 0,
      lastPick: 0,
    })),
  );
}

function legacySaveFields(
  value: JsonRecord,
  eraId: string,
  progress: number,
  mash: MashRecordV4[],
): SaveDataV4 {
  const collection = collectionFromLegacyMash(mash);
  const itemized = collectionCount(collection);
  const legacyPicked = nonnegativeInteger(value.picked);
  const picked = Math.max(legacyPicked, itemized);
  return {
    version: 4,
    mode: "learning",
    eraId,
    progress,
    picked,
    unitemizedPicked: Math.max(0, picked - itemized),
    x: boundedNumber(value.x, 0),
    z: boundedNumber(value.z, 0),
    zooms: nonnegativeInteger(value.zooms),
    cycles: 0,
    sound: typeof value.sound === "boolean" ? value.sound : true,
    mash,
    collectedAuthoredAnchors: [],
    literalSceneOrigin: null,
    collection,
  };
}

export function migrateV3Save(
  value: unknown,
  catalog: readonly SaveCatalogEra[],
): SaveDataV4 | null {
  if (
    !isRecord(value) ||
    value.version !== 3 ||
    finiteNumber(value.era) === null ||
    catalog.length === 0
  ) {
    return null;
  }
  const legacyEraIndex = Math.floor(
    boundedNumber(value.era, 0, 0, LEGACY_V3_ERA_NAMES.length - 1),
  );
  const era = eraForLegacyName(LEGACY_V3_ERA_NAMES[legacyEraIndex], catalog);
  const mash = legacyMash(value.mash, catalog);
  return legacySaveFields(
    value,
    era.id,
    boundedNumber(value.progress, 0, 0, 1),
    mash,
  );
}

function legacyV2StopIndex(hours: number) {
  for (let index = LEGACY_V2_HOUR_STOPS.length - 1; index >= 0; index -= 1) {
    if (hours >= LEGACY_V2_HOUR_STOPS[index].hours) return index;
  }
  return 0;
}

export function migrateV2Save(
  value: unknown,
  catalog: readonly SaveCatalogEra[],
): SaveDataV4 | null {
  if (!isRecord(value) || finiteNumber(value.hours) === null || catalog.length === 0) {
    return null;
  }
  const hours = Math.max(0, finiteNumber(value.hours) ?? 0);
  const stopIndex = legacyV2StopIndex(hours);
  const current = LEGACY_V2_HOUR_STOPS[stopIndex];
  const next =
    LEGACY_V2_HOUR_STOPS[
      Math.min(LEGACY_V2_HOUR_STOPS.length - 1, stopIndex + 1)
    ];
  const progress =
    current === next
      ? 0
      : Math.max(
          0,
          Math.min(1, (hours - current.hours) / (next.hours - current.hours)),
        );
  const era = eraForLegacyName(current.eraName, catalog);
  return legacySaveFields(
    value,
    era.id,
    progress,
    legacyMash(value.mash, catalog),
  );
}

function parsedJson(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function loadSaveCandidates(
  candidates: RawSaveCandidates,
  catalog: readonly SaveCatalogEra[],
): LoadedSave | null {
  const v4 = sanitizeV4(parsedJson(candidates.v4), catalog);
  if (v4) return { save: v4, sourceVersion: 4 };

  const v3 = migrateV3Save(parsedJson(candidates.v3), catalog);
  if (v3) return { save: v3, sourceVersion: 3 };

  const v2 = migrateV2Save(parsedJson(candidates.v2), catalog);
  return v2 ? { save: v2, sourceVersion: 2 } : null;
}
