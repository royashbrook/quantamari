import type {
  CollectibleRarity,
  CollectibleSpawnMode,
} from "./game/spawn-policy.ts";

export type CollectionCatalogCurio = Readonly<{
  id: string;
  name: string;
  rarity: CollectibleRarity;
  spawnMode: CollectibleSpawnMode;
  subjectId?: string;
}>;

export type CollectionCatalogEra = Readonly<{
  id: string;
  name: string;
  curios: readonly CollectionCatalogCurio[];
}>;

/** Compatible with persisted v4 records and migration-tolerant UI records. */
export type CollectionProgressRecord = Readonly<{
  eraId: string;
  curioId: string;
  count: number;
  firstPick?: number;
  lastPick?: number;
}>;

export type CollectionCountSummary = Readonly<{
  found: number;
  total: number;
  missing: number;
  completionRatio: number;
  complete: boolean;
}>;

export type CurioCollectionStatus = Readonly<{
  eraId: string;
  eraName: string;
  curioId: string;
  curioName: string;
  rarity: CollectibleRarity;
  spawnMode: CollectibleSpawnMode;
  subjectId?: string;
  count: number;
  found: boolean;
  firstPick?: number;
  lastPick?: number;
}>;

export type EraCollectionSummary = CollectionCountSummary &
  Readonly<{
    eraId: string;
    eraName: string;
    landmarks: CollectionCountSummary;
    curios: readonly CurioCollectionStatus[];
  }>;

export type CatalogCollectionSummary = CollectionCountSummary &
  Readonly<{
    landmarks: CollectionCountSummary;
    eras: readonly EraCollectionSummary[];
  }>;

type AggregatedRecord = {
  count: number;
  firstPick?: number;
  lastPick?: number;
};

const recordKey = (eraId: string, curioId: string) =>
  `${eraId}\u0000${curioId}`;

const positiveCount = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

const timestamp = (value: number | undefined) =>
  Number.isFinite(value) ? value : undefined;

function mergeEarliest(left: number | undefined, right: number | undefined) {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.min(left, right);
}

function mergeLatest(left: number | undefined, right: number | undefined) {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.max(left, right);
}

function aggregateCollection(records: readonly CollectionProgressRecord[]) {
  const aggregate = new Map<string, AggregatedRecord>();
  for (const record of records) {
    const count = positiveCount(record.count);
    if (count === 0) continue;
    const key = recordKey(record.eraId, record.curioId);
    const prior = aggregate.get(key);
    aggregate.set(key, {
      count: (prior?.count ?? 0) + count,
      firstPick: mergeEarliest(
        prior?.firstPick,
        timestamp(record.firstPick),
      ),
      lastPick: mergeLatest(prior?.lastPick, timestamp(record.lastPick)),
    });
  }
  return aggregate;
}

function countSummary(found: number, total: number): CollectionCountSummary {
  const safeTotal = Math.max(0, total);
  const safeFound = Math.min(safeTotal, Math.max(0, found));
  return {
    found: safeFound,
    total: safeTotal,
    missing: safeTotal - safeFound,
    completionRatio: safeTotal === 0 ? 1 : safeFound / safeTotal,
    complete: safeFound === safeTotal,
  };
}

/**
 * Left-join persisted collection records against the authored catalog. Missing
 * curios remain visible with count zero, which gives the Field Guide a stable
 * source for silhouettes, per-era completion, and global completion.
 */
export function summarizeCollection(
  catalog: readonly CollectionCatalogEra[],
  records: readonly CollectionProgressRecord[],
): CatalogCollectionSummary {
  const aggregate = aggregateCollection(records);
  const eras = catalog.map((era): EraCollectionSummary => {
    const curios = era.curios.map((curio): CurioCollectionStatus => {
      const record = aggregate.get(recordKey(era.id, curio.id));
      const count = record?.count ?? 0;
      return {
        eraId: era.id,
        eraName: era.name,
        curioId: curio.id,
        curioName: curio.name,
        rarity: curio.rarity,
        spawnMode: curio.spawnMode,
        ...(curio.subjectId ? { subjectId: curio.subjectId } : {}),
        count,
        found: count > 0,
        ...(record?.firstPick === undefined
          ? {}
          : { firstPick: record.firstPick }),
        ...(record?.lastPick === undefined
          ? {}
          : { lastPick: record.lastPick }),
      };
    });
    const landmarks = curios.filter(
      (curio) => curio.spawnMode === "singleton",
    );
    return {
      eraId: era.id,
      eraName: era.name,
      ...countSummary(
        curios.filter((curio) => curio.found).length,
        curios.length,
      ),
      landmarks: countSummary(
        landmarks.filter((curio) => curio.found).length,
        landmarks.length,
      ),
      curios,
    };
  });
  const curios = eras.flatMap((era) => era.curios);
  const landmarks = curios.filter(
    (curio) => curio.spawnMode === "singleton",
  );

  return {
    ...countSummary(
      curios.filter((curio) => curio.found).length,
      curios.length,
    ),
    landmarks: countSummary(
      landmarks.filter((curio) => curio.found).length,
      landmarks.length,
    ),
    eras,
  };
}

export type AchievementCategory =
  | "discovery"
  | "landmark"
  | "era"
  | "collection"
  | "science-set"
  | "journey";

export type Achievement = Readonly<{
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  secret: boolean;
  unlocked: boolean;
  unlockedAt?: number;
  progress: number;
  target: number;
}>;

export type ScientificSetMember =
  | Readonly<{ curioId: string; subjectId?: never }>
  | Readonly<{ curioId?: never; subjectId: string }>;

export type ScientificAchievementSet = Readonly<{
  id: string;
  name: string;
  description: string;
  members: readonly ScientificSetMember[];
  secret?: boolean;
}>;

export const DEFAULT_SCIENTIFIC_SETS: readonly ScientificAchievementSet[] =
  Object.freeze([
    {
      id: "solar-system-survey",
      name: "Solar System Survey",
      description: "Find the Sun and every named world in our system.",
      members: [
        { subjectId: "solar-system/sun" },
        { subjectId: "solar-system/mercury" },
        { subjectId: "solar-system/venus" },
        { subjectId: "solar-system/earth" },
        { subjectId: "solar-system/moon" },
        { subjectId: "solar-system/mars" },
        { subjectId: "solar-system/ceres" },
        { subjectId: "solar-system/jupiter" },
        { subjectId: "solar-system/europa" },
        { subjectId: "solar-system/saturn" },
        { subjectId: "solar-system/uranus" },
        { subjectId: "solar-system/neptune" },
        { subjectId: "solar-system/pluto" },
      ],
    },
    {
      id: "local-group-trio",
      name: "Local Group Trio",
      description: "Find the Milky Way, Andromeda, and Triangulum galaxies.",
      members: [
        { subjectId: "local-group/milky-way" },
        { subjectId: "local-group/andromeda" },
        { subjectId: "local-group/triangulum" },
      ],
    },
    {
      id: "you-are-here",
      name: "You Are Here",
      description:
        "Trace our cosmic address from Earth through the Local Group.",
      members: [
        { subjectId: "solar-system/earth" },
        { subjectId: "solar-system/sun" },
        { subjectId: "solar-system" },
        { subjectId: "local-group/milky-way" },
        { subjectId: "large-scale/local-group" },
      ],
    },
  ]);

export type DeriveAchievementsRequest = Readonly<{
  catalog: readonly CollectionCatalogEra[];
  collection: readonly CollectionProgressRecord[];
  cycles?: number;
  sets?: readonly ScientificAchievementSet[];
}>;

function firstTimestamp(statuses: readonly CurioCollectionStatus[]) {
  const times = statuses
    .map((status) => status.firstPick)
    .filter((value): value is number => value !== undefined);
  return times.length > 0 ? Math.min(...times) : undefined;
}

function completionTimestamp(statuses: readonly CurioCollectionStatus[]) {
  const times = statuses
    .map((status) => status.firstPick)
    .filter((value): value is number => value !== undefined);
  return times.length > 0 ? Math.max(...times) : undefined;
}

function achievement(
  definition: Omit<Achievement, "unlocked"> & { unlocked?: boolean },
): Achievement {
  const unlocked = definition.unlocked ?? definition.progress >= definition.target;
  return {
    ...definition,
    unlocked,
    ...(!unlocked || definition.unlockedAt === undefined
      ? { unlockedAt: undefined }
      : { unlockedAt: definition.unlockedAt }),
  };
}

function milestoneAchievement(
  id: string,
  name: string,
  description: string,
  found: readonly CurioCollectionStatus[],
  target: number,
): Achievement {
  const progress = Math.min(found.length, target);
  const unlocked = found.length >= target;
  const ordered = [...found].sort(
    (left, right) =>
      (left.firstPick ?? Number.POSITIVE_INFINITY) -
      (right.firstPick ?? Number.POSITIVE_INFINITY),
  );
  return achievement({
    id,
    name,
    description,
    category: "collection",
    secret: false,
    progress,
    target,
    unlocked,
    unlockedAt: unlocked ? ordered[target - 1]?.firstPick : undefined,
  });
}

function statusForMember(
  statuses: readonly CurioCollectionStatus[],
  member: ScientificSetMember,
) {
  return statuses.find((status) =>
    member.curioId
      ? status.curioId === member.curioId
      : status.subjectId === member.subjectId,
  );
}

/**
 * Achievements are a projection of catalog + collection + completed cycles;
 * no parallel persistence ledger can drift out of sync with the Field Guide.
 */
export function deriveAchievements({
  catalog,
  collection,
  cycles = 0,
  sets = DEFAULT_SCIENTIFIC_SETS,
}: DeriveAchievementsRequest): readonly Achievement[] {
  const summary = summarizeCollection(catalog, collection);
  const statuses = summary.eras.flatMap((era) => era.curios);
  const found = statuses.filter((status) => status.found);
  const landmarks = statuses.filter(
    (status) => status.spawnMode === "singleton",
  );
  const foundLandmarks = landmarks.filter((status) => status.found);
  const firstFoundAt = firstTimestamp(found);
  const firstLandmarkAt = firstTimestamp(foundLandmarks);
  const safeCycles = positiveCount(cycles);

  const achievements: Achievement[] = [
    achievement({
      id: "first-find",
      name: "First Find",
      description: "Roll up your first catalog specimen.",
      category: "discovery",
      secret: false,
      progress: Math.min(1, found.length),
      target: 1,
      unlockedAt: firstFoundAt,
    }),
    achievement({
      id: "first-landmark",
      name: "One of One",
      description: "Find your first named landmark.",
      category: "landmark",
      secret: false,
      progress: Math.min(1, foundLandmarks.length),
      target: 1,
      unlockedAt: firstLandmarkAt,
    }),
  ];

  if (landmarks.length > 0) {
    achievements.push(
      achievement({
        id: "all-landmarks",
        name: "Known Universe",
        description: "Find every named landmark in the Field Guide.",
        category: "landmark",
        secret: false,
        progress: foundLandmarks.length,
        target: landmarks.length,
        unlockedAt:
          foundLandmarks.length === landmarks.length
            ? completionTimestamp(foundLandmarks)
            : undefined,
      }),
    );
  }

  achievements.push(
    milestoneAchievement(
      "catalog-25",
      "Curious Collector",
      "Find 25 different specimens.",
      found,
      25,
    ),
    milestoneAchievement(
      "catalog-100",
      "Scale Scholar",
      "Find 100 different specimens.",
      found,
      100,
    ),
    achievement({
      id: "catalog-complete",
      name: "Everything, Rolled Up",
      description: "Complete the entire Field Guide.",
      category: "collection",
      secret: false,
      progress: summary.found,
      target: summary.total,
      unlocked: summary.total > 0 && summary.complete,
      unlockedAt: summary.complete
        ? completionTimestamp(found)
        : undefined,
    }),
  );

  for (const set of sets) {
    const memberStatuses = set.members.map((member) =>
      statusForMember(statuses, member),
    );
    const setFound = memberStatuses.filter(
      (status): status is CurioCollectionStatus => status?.found === true,
    );
    const unlocked =
      set.members.length > 0 && setFound.length === set.members.length;
    achievements.push(
      achievement({
        id: `science-set:${set.id}`,
        name: set.name,
        description: set.description,
        category: "science-set",
        secret: set.secret ?? false,
        progress: setFound.length,
        target: set.members.length,
        unlocked,
        unlockedAt: unlocked ? completionTimestamp(setFound) : undefined,
      }),
    );
  }

  for (const era of summary.eras) {
    const foundInEra = era.curios.filter((curio) => curio.found);
    achievements.push(
      achievement({
        id: `era-complete:${era.eraId}`,
        name: `${era.eraName} Complete`,
        description: `Find every specimen in ${era.eraName}.`,
        category: "era",
        secret: false,
        progress: era.found,
        target: era.total,
        unlocked: era.total > 0 && era.complete,
        unlockedAt: era.complete
          ? completionTimestamp(foundInEra)
          : undefined,
      }),
    );
  }

  achievements.push(
    achievement({
      id: "journey-cycle",
      name: "There and Back Again",
      description: "Complete one journey through every scale layer.",
      category: "journey",
      secret: false,
      progress: Math.min(1, safeCycles),
      target: 1,
    }),
  );

  return achievements;
}

export type AchievementCompletionSummary = Readonly<{
  unlocked: number;
  total: number;
  missing: number;
  complete: boolean;
  secretUnlocked: number;
  secretTotal: number;
}>;

/** Secret achievements are tracked separately and never gate 100% completion. */
export function summarizeAchievements(
  achievements: readonly Achievement[],
): AchievementCompletionSummary {
  const publicAchievements = achievements.filter(
    (achievement) => !achievement.secret,
  );
  const secretAchievements = achievements.filter(
    (achievement) => achievement.secret,
  );
  const unlocked = publicAchievements.filter(
    (achievement) => achievement.unlocked,
  ).length;
  return {
    unlocked,
    total: publicAchievements.length,
    missing: publicAchievements.length - unlocked,
    complete: unlocked === publicAchievements.length,
    secretUnlocked: secretAchievements.filter(
      (achievement) => achievement.unlocked,
    ).length,
    secretTotal: secretAchievements.length,
  };
}
