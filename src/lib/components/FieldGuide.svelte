<script module lang="ts">
  import type { VisualForm } from "$lib/scale-data";

  export type CollectionEntry = {
    eraId: string;
    curioId: string;
    count: number;
    firstPick?: number;
    lastPick?: number;
  };

  export type FieldGuideProps = {
    open: boolean;
    entries: readonly CollectionEntry[];
    legacyUnitemizedCount?: number;
    onClose: () => void;
  };

  export const SPECIMEN_FORM_NOTES: Record<VisualForm, string> = {
    foam:
      "A soft translucent ring keeps the bubble metaphor visible. At the theory bookend it is playful shorthand, not an observed object.",
    "field-ripple":
      "A broad wave with no hard center suggests a field disturbance rather than a tiny classical bead.",
    spark:
      "A bright point with rays marks an energetic event or unresolved signal. The rays are an icon, not a measured outline.",
    string:
      "A long vibrating strand preserves the proposed mode-of-vibration idea. It is mathematical imagery, not a photographed thread.",
    quark:
      "A tiny bead stands in for something point-like in present probes. Its bright color nods to color charge, not literal paint.",
    hadron:
      "A rounded bundle with inner beads recalls the valence-quark picture. Real hadrons are dynamic quantum systems.",
    "nuclear-cluster":
      "A compact cluster distinguishes a nucleus from a whole atom. The packed beads stand for nucleons, not hard little balls.",
    "atom-cloud":
      "A fuzzy cloud surrounds a compact center, avoiding the false picture of electrons traveling on planetary tracks.",
    molecule:
      "Connected lobes preserve bonding and three-dimensional shape. The atoms are softened into toy parts rather than hard spheres.",
    "molecule-bent":
      "Two bonds meet at an angle so water reads as bent instead of linear. The angle is recognizable rather than scale-exact.",
    "molecule-linear":
      "Three aligned lobes preserve carbon dioxide's linear geometry while keeping the atoms plush-soft.",
    protein:
      "A folded, knotted body suggests that a protein's useful shape comes from a long chain folding in three dimensions.",
    "double-helix":
      "Two winding rails and short cross-links preserve DNA's double-helix cue without pretending the strand is a rope.",
    vesicle:
      "A hollow membrane ring suggests a closed lipid compartment. The visible rim is an explanatory cutaway.",
    antibody:
      "A soft Y silhouette preserves the antibody's two binding arms and central stem.",
    "virus-enveloped":
      "A rounded envelope with a fringe echoes common enveloped virions. The number and spacing of spikes are simplified.",
    "virus-faceted":
      "A many-sided shell and vertex projections preserve the capsid cue used by adenoviruses and several giant-virus diagrams.",
    bacteriophage:
      "A faceted head, narrow tail, and little feet preserve the bacteriophage body plan in plush-friendly parts.",
    "cell-soft":
      "A flexible membrane and off-center interior preserve a cell-like body without pretending every cell is round.",
    bacterium:
      "A short rod with a trailing filament preserves the most recognizable cue for rod-shaped bacteria.",
    "blood-cell":
      "A flattened disc with a central dip preserves the distinctive biconcave red-blood-cell silhouette.",
    "immune-cell":
      "A soft irregular sphere around a visible nucleus distinguishes a white blood cell from the biconcave red-cell disc.",
    "plant-cell":
      "A firmer rectangular wall around a softer interior distinguishes a plant cell from an unsupported round blob.",
    neuron:
      "A small body with one long process and branching tips preserves the neuron's signal-carrying silhouette.",
    sperm:
      "A compact head and long flagellum preserve the sperm cell's motile silhouette without inventing internal detail.",
    ciliate:
      "An oval body with a fuzzy edge suggests the many cilia that move and feed a paramecium.",
    diatom:
      "A symmetric shell with fine ribs recalls a diatom's patterned silica wall.",
    pollen:
      "A rounded grain with a textured fringe preserves the species-varying sculpted surface of pollen and spores.",
    tardigrade:
      "A segmented body with several stubby legs preserves the tiny-animal cue instead of drawing another generic cell.",
    mite:
      "A compact oval body with paired legs keeps the dust mite recognizable as an eight-legged animal, not a speck of dust.",
    worm:
      "A narrow curling body preserves the nematode's unsegmented worm shape without adding legs it does not have.",
    fiber:
      "A long flexible strand preserves the object's strongest cue. Wavy threads are simplified so they read at toy scale.",
    "dust-cluster":
      "Several uneven specks form the silhouette because dust is a mixture, not one universal particle shape.",
    grain:
      "A low irregular lump suggests fracture or wear without claiming one mineral or exact crystal habit.",
    crystal:
      "A crisp faceted block distinguishes repeating crystal structure from a rounded grain.",
    seed:
      "An elongated or lens-like seed body keeps the biological grain readable instead of turning it into a pebble.",
    bead:
      "A smooth regular sphere marks a manufactured bead or rounded ice pellet rather than a fractured natural grain.",
    button:
      "A thin disc with visible sewing holes preserves the button's functional geometry.",
    brick:
      "A low rectangular block with top studs makes the toy brick recognizable from silhouette alone.",
    "bottle-cap":
      "A shallow ridged disc preserves the crimped edge and hollow underside of a bottle cap.",
    coin:
      "A thin circular disc and raised rim keep the coin readable without reproducing any currency design.",
    key:
      "A round bow, narrow shaft, and jagged teeth preserve the key's distinctive side profile.",
    die:
      "A soft cube with pip-like marks keeps the six-sided die recognizable.",
    pencil:
      "A long hexagonal body, sharpened tip, and eraser preserve the pencil's functional silhouette.",
    mug:
      "A hollow cup body and open side handle make the mug recognizable even as a soft toy.",
    book:
      "A layered rectangle with one emphasized spine preserves the paperback's pages-and-binding construction.",
    spoon:
      "A long narrow handle ending in a shallow oval bowl preserves the utensil's silhouette.",
    shoe:
      "A long sole, raised heel, and opening preserve a shoe profile without choosing one specific style.",
    lamp:
      "A weighted base, tall stem, and broad shade keep the floor lamp readable at a glance.",
    chair:
      "A back, seat, and visible legs preserve the chair's familiar load-bearing structure.",
    couch:
      "A long padded seat, back, and two arms preserve an upholstered couch silhouette.",
    guitar:
      "A pinched hollow body, long neck, and small headstock preserve the acoustic-guitar outline.",
    table:
      "A broad top over separated legs emphasizes that a table is mostly open space.",
    screen:
      "A wide thin panel and small base preserve a modern television's proportions.",
    "potted-plant":
      "A tapered pot supports a branching leafy crown, keeping container and living plant visibly separate.",
    bed:
      "A long mattress, raised frame, headboard, and short legs preserve the bed as furniture rather than a chair.",
    appliance:
      "A tall insulated cabinet with a door seam and handle preserves a refrigerator's enclosing form.",
    bathtub:
      "A long hollow basin with a raised rim preserves the tub's large footprint and empty interior.",
    doorway:
      "Two uprights and a lintel frame an actual opening, keeping the doorway distinct from a tiny house.",
    bicycle:
      "Two large wheels, an open triangular frame, and handlebars preserve the bicycle's mostly-empty silhouette.",
    motorcycle:
      "Two wheels, a compact frame, and raised handlebar distinguish a motorcycle from a car body.",
    sailboat:
      "A curved hull, mast, and triangular sail preserve how the boat meets both water and wind.",
    vehicle:
      "A low body, cabin, and visible wheels preserve the familiar road-vehicle profile.",
    train:
      "A long carriage with repeated windows and rail wheels distinguishes a city train from road traffic.",
    tree:
      "A branching trunk supports an irregular crown, preserving the tree as a living structure rather than a green ball.",
    pool:
      "A low rim encloses a visible water surface, emphasizing that a pool is mostly contained water.",
    house:
      "Walls, roof, and door make an enclosure readable while remaining neutral about architectural style.",
    tower:
      "A tall narrow body with repeated levels preserves vertical infrastructure or stacked rooms.",
    bridge:
      "A long deck between supports preserves the connected route and the open span below it.",
    stadium:
      "A broad oval ring around an open center preserves the stadium's enclosing seating bowl.",
    park:
      "A green block with paths and a tree keeps managed open space distinct from another building.",
    landform:
      "A broad irregular base and raised relief preserve terrain without drawing a hard boundary around real geology.",
    "river-system":
      "Branching blue paths join toward shared water, preserving a drainage or connected-lake network.",
    forest:
      "Many small crowns merge into a textured belt, showing a regional mosaic rather than one giant tree.",
    "weather-front":
      "A long curling boundary separates two air regions; it is deliberately not drawn as a solid object.",
    world:
      "A round globe with limited markings reflects gravity's tendency to make large worlds nearly spherical.",
    "ringed-world":
      "A round world crossed by a thin broad ring keeps Saturn's orbiting-particle system unmistakable.",
    asteroid:
      "A compact irregular body preserves the weak-gravity shape of a small moon or asteroid.",
    comet:
      "A dark irregular nucleus with a soft trailing plume preserves the sunlight-driven comet cue.",
    star:
      "A round luminous center gets soft rays so brightness reads at toy scale; real stars do not have pointed arms.",
    "dense-star":
      "A very compact bright sphere with a tight halo distinguishes a stellar remnant from a broad ordinary star.",
    "orbit-system":
      "A central body and several paths show gravitational hierarchy. Distances and orbit sizes are deliberately compressed.",
    "star-cluster":
      "Several bright points share one loose envelope, preserving a group without inventing a physical outer shell.",
    nebula:
      "An asymmetric translucent cloud with embedded light points suggests glowing or star-forming gas.",
    galaxy:
      "A flattened curl or oval preserves a galaxy-scale stellar distribution without claiming a hard visible edge.",
    "galaxy-cluster":
      "Several small galaxy-like swirls gather loosely, preserving a population rather than one giant galaxy.",
    "cosmic-web":
      "Connected filaments and nodes preserve the large-scale web while leaving the spaces between visibly underdense.",
    "cosmic-void":
      "A dark open center ringed by sparse structure preserves an underdense region rather than perfect emptiness.",
    horizon:
      "A nested boundary suggests an observational or causal limit, not a wall at the edge of the universe.",
    "speculative-reality":
      "Nested playful horizons mark explicit fiction beyond measured cosmology; no outer shell is being claimed.",
    artifact:
      "A deliberately generic toy form is reserved for uncatalogued future artifacts and should not appear in the authored guide.",
  };
</script>

<script lang="ts">
  import { tick } from "svelte";
  import {
    ERAS,
    formatEraScale,
    type Curio,
    type Era,
  } from "$lib/scale-data";
  import styles from "./field-guide.module.css";

  type ResolvedEntry = {
    entry: CollectionEntry;
    era: Era;
    eraIndex: number;
    curio: Curio;
    formNote: string;
  };

  let {
    open,
    entries,
    legacyUnitemizedCount = 0,
    onClose,
  }: FieldGuideProps = $props();

  const componentId = $props.id();
  const titleId = `${componentId}-title`;
  const descriptionId = `${componentId}-description`;

  let dialog = $state<HTMLDialogElement>();
  let searchInput = $state<HTMLInputElement>();
  let search = $state("");
  let eraFilter = $state("");
  let view = $state<"recent" | "scale">("recent");

  function positiveInteger(value: number | undefined) {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;
  }

  function specimenSeed(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function portraitStyleFor(era: Era, curio: Curio) {
    const seed = specimenSeed(`${era.id}:${curio.id}:${curio.name}`);
    return `--specimen-color: ${curio.color}; --specimen-tilt: ${(seed % 15) - 7}deg; --bob-delay: ${-(seed % 1800)}ms`;
  }

  function resolveEntries(collectionEntries: readonly CollectionEntry[]) {
    const eraById = new Map(ERAS.map((era, index) => [era.id, { era, index }]));
    const combined = new Map<string, CollectionEntry>();
    let unresolvedCount = 0;

    collectionEntries.forEach((rawEntry) => {
      const count = positiveInteger(rawEntry.count);
      if (count === 0) return;
      const eraMatch = eraById.get(rawEntry.eraId);
      const curio = eraMatch?.era.curios.find(
        (item) => item.id === rawEntry.curioId,
      );
      if (!eraMatch || !curio) {
        unresolvedCount += count;
        return;
      }
      const key = `${rawEntry.eraId}\u0000${rawEntry.curioId}`;
      const previous = combined.get(key);
      combined.set(key, {
        eraId: rawEntry.eraId,
        curioId: rawEntry.curioId,
        count: (previous?.count ?? 0) + count,
        firstPick: Math.min(
          previous?.firstPick ?? Number.POSITIVE_INFINITY,
          rawEntry.firstPick ?? Number.POSITIVE_INFINITY,
        ),
        lastPick: Math.max(previous?.lastPick ?? 0, rawEntry.lastPick ?? 0),
      });
    });

    const records: ResolvedEntry[] = [];
    combined.forEach((entry) => {
      const eraMatch = eraById.get(entry.eraId);
      const curio = eraMatch?.era.curios.find(
        (item) => item.id === entry.curioId,
      );
      if (!eraMatch || !curio) return;
      records.push({
        entry,
        era: eraMatch.era,
        eraIndex: eraMatch.index,
        curio,
        formNote: SPECIMEN_FORM_NOTES[curio.visualForm],
      });
    });

    return { records, unresolvedCount };
  }

  const resolvedCollection = $derived.by(() => resolveEntries(entries));

  const filteredRecords = $derived.by(() => {
    const query = search.trim().toLocaleLowerCase();
    return resolvedCollection.records
      .filter((record) => !eraFilter || record.era.id === eraFilter)
      .filter((record) => {
        if (!query) return true;
        return [
          record.curio.name,
          record.curio.fact,
          record.era.name,
          record.formNote,
        ].some((value) => value.toLocaleLowerCase().includes(query));
      })
      .sort((left, right) => {
        if (view === "recent") {
          const timeDifference =
            (right.entry.lastPick ?? 0) - (left.entry.lastPick ?? 0);
          if (timeDifference !== 0) return timeDifference;
          if (left.eraIndex !== right.eraIndex) {
            return right.eraIndex - left.eraIndex;
          }
        } else if (left.eraIndex !== right.eraIndex) {
          return left.eraIndex - right.eraIndex;
        }
        return left.curio.name.localeCompare(right.curio.name);
      });
  });

  const groupedRecords = $derived.by(() => {
    if (view === "recent") {
      return [{ era: null, records: filteredRecords }];
    }
    const groups = new Map<string, { era: Era; records: ResolvedEntry[] }>();
    filteredRecords.forEach((record) => {
      const group = groups.get(record.era.id) ?? {
        era: record.era,
        records: [],
      };
      group.records.push(record);
      groups.set(record.era.id, group);
    });
    return [...groups.values()];
  });

  const totalRolled = $derived(
    resolvedCollection.records.reduce(
      (sum, record) => sum + record.entry.count,
      0,
    ) +
      resolvedCollection.unresolvedCount +
      positiveInteger(legacyUnitemizedCount),
  );
  const representedScales = $derived(
    new Set(resolvedCollection.records.map((record) => record.era.id)).size,
  );
  const availableThings = ERAS.reduce(
    (sum, era) => sum + era.curios.length,
    0,
  );
  const hiddenCount = $derived(
    resolvedCollection.unresolvedCount +
      positiveInteger(legacyUnitemizedCount),
  );
  const hasFilters = $derived(
    search.trim().length > 0 || eraFilter.length > 0,
  );

  function clearFilters() {
    search = "";
    eraFilter = "";
    searchInput?.focus();
  }

  function handleCancel(event: Event) {
    event.preventDefault();
    onClose();
  }

  function handleDialogClick(event: MouseEvent) {
    if (event.target === event.currentTarget) onClose();
  }

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      void tick().then(() => searchInput?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });
</script>

{#snippet SpecimenPortrait(era: Era, curio: Curio)}
  <div
    class={styles.portrait}
    data-shape={curio.shape}
    data-form={curio.visualForm}
    style={portraitStyleFor(era, curio)}
    aria-hidden="true"
  >
    <span class={styles.shadow}></span>
    <span class={styles.silhouette}>
      <span class={styles.cueA}></span>
      <span class={styles.cueB}></span>
      <span class={styles.face}>
        <i></i>
        <i></i>
        <b></b>
      </span>
    </span>
    <span class={styles.symbol}>{curio.symbol}</span>
  </div>
{/snippet}

{#snippet EntryCard(record: ResolvedEntry)}
  {@const { entry, era, eraIndex, curio, formNote } = record}
  {@const source = curio.source ?? era.sources[0]}
  <article class={styles.card}>
    {@render SpecimenPortrait(era, curio)}
    <div class={styles.cardCopy}>
      <div class={styles.cardMeta}>
        <span>{era.name}</span>
        <span>{formatEraScale(eraIndex, 0)}</span>
      </div>
      <div class={styles.cardTitle}>
        <h4>{curio.name}</h4>
        <span aria-label={`${entry.count.toLocaleString()} collected`}>
          ×{entry.count.toLocaleString()}
        </span>
      </div>
      <p class={styles.fact}>{curio.fact}</p>
      <p class={styles.formNote}>
        <b>Why this shape</b>
        {formNote}
      </p>
      <div class={styles.cardFooter}>
        <span
          class={styles.certainty}
          data-certainty={era.confidence.toLowerCase().replaceAll(" ", "-")}
        >
          {era.confidence}
        </span>
        {#if source}
          <a href={source.url} target="_blank" rel="noreferrer">
            Science reference · {source.organization}: {source.label} ↗
          </a>
        {:else}
          <span class={styles.noSource}>Reference unavailable</span>
        {/if}
      </div>
    </div>
  </article>
{/snippet}

<dialog
  bind:this={dialog}
  class={styles.dialog}
  aria-labelledby={titleId}
  aria-describedby={descriptionId}
  oncancel={handleCancel}
  onclick={handleDialogClick}
>
  <div class={styles.panel}>
    <header class={styles.header}>
      <div>
        <span class={styles.kicker}>EVERYTHING RIDING ALONG</span>
        <h2 id={titleId}>Your rolled-up field guide</h2>
        <p id={descriptionId}>
          Every portrait keeps one real shape cue, then softens it into
          something that could become a very small plush friend.
        </p>
      </div>
      <button
        class={styles.close}
        type="button"
        onclick={onClose}
        aria-label="Close field guide"
      >
        ×
      </button>
    </header>

    <div class={styles.summary} aria-label="Collection totals">
      <dl>
        <div>
          <dt>Total roll-ups</dt>
          <dd>{totalRolled.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Different things</dt>
          <dd>{resolvedCollection.records.length.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Scales represented</dt>
          <dd>{representedScales.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Guide found</dt>
          <dd>
            {resolvedCollection.records.length.toLocaleString()}
            <small> / {availableThings.toLocaleString()}</small>
          </dd>
        </div>
      </dl>
    </div>

    <div class={styles.filters}>
      <label class={styles.search}>
        <span>Find a rolled-up thing</span>
        <input
          bind:this={searchInput}
          bind:value={search}
          type="search"
          placeholder="Try atom, mushroom, galaxy..."
        />
      </label>
      <div class={styles.viewChoice} role="group" aria-label="Guide order">
        <button
          type="button"
          aria-pressed={view === "recent"}
          onclick={() => (view = "recent")}
        >
          Recent
        </button>
        <button
          type="button"
          aria-pressed={view === "scale"}
          onclick={() => (view = "scale")}
        >
          By scale
        </button>
      </div>
      <label class={styles.eraFilter}>
        <span>Scale</span>
        <select bind:value={eraFilter}>
          <option value="">All scales</option>
          {#each ERAS as era (era.id)}
            <option value={era.id}>{era.name}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class={styles.results}>
      <div class={styles.resultsMeta} role="status" aria-live="polite">
        <span>
          {filteredRecords.length.toLocaleString()}
          {filteredRecords.length === 1 ? "specimen" : "specimens"}
        </span>
        <span>
          {view === "recent" ? "Newest finds first" : "Grouped by scale"}
        </span>
      </div>

      {#if hiddenCount > 0}
        <aside class={styles.legacyNote}>
          <b>{hiddenCount.toLocaleString()} earlier roll-ups are still counted.</b>
          <span>
            Their save data did not include identities this guide can draw. New
            finds will get portraits automatically.
          </span>
        </aside>
      {/if}

      {#if resolvedCollection.records.length === 0 && hiddenCount === 0}
        <div class={styles.emptyState}>
          <div aria-hidden="true">○</div>
          <h3>Your guide is waiting</h3>
          <p>
            Roll over your first small thing. Its portrait, fact, and source
            will appear here.
          </p>
          <button type="button" onclick={onClose}>Go find something</button>
        </div>
      {:else if resolvedCollection.records.length === 0}
        <div class={styles.emptyState}>
          <div aria-hidden="true">?</div>
          <h3>Older finds, unnamed</h3>
          <p>
            Your total is safe. The old save simply did not record which
            individual things were rolled up.
          </p>
          <button type="button" onclick={onClose}>Add a new portrait</button>
        </div>
      {:else if filteredRecords.length === 0}
        <div class={styles.emptyState}>
          <div aria-hidden="true">⌕</div>
          <h3>
            {hasFilters ? "No matching plush candidates" : "Nothing here yet"}
          </h3>
          <p>
            Try another name or scale. Your collected things are still safe.
          </p>
          <button type="button" onclick={clearFilters}>Clear filters</button>
        </div>
      {:else}
        {#each groupedRecords as group (group.era?.id ?? "recent")}
          <section
            class={styles.group}
            aria-label={group.era?.name ?? "Recent finds"}
          >
            {#if group.era}
              <header class={styles.groupHeader}>
                <h3>{group.era.name}</h3>
                <span>
                  {group.records.length.toLocaleString()}
                  {group.records.length === 1 ? "kind" : "kinds"}
                </span>
              </header>
            {/if}
            <div class={styles.grid}>
              {#each group.records as record (`${record.era.id}:${record.curio.id}`)}
                {@render EntryCard(record)}
              {/each}
            </div>
          </section>
        {/each}
      {/if}
    </div>
  </div>
</dialog>
