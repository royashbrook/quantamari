<script lang="ts">
  import { version as buildVersion } from "$app/environment";
  import { onDestroy, onMount, tick } from "svelte";
  import { version as appVersion } from "../../package.json";
  import FieldGuide from "$lib/components/FieldGuide.svelte";
  import {
    type Curio,
    ERAS,
    type Era,
    type ScienceSource,
    formatEraScale,
    journeyHoursForEraProgress,
  } from "$lib/scale-data";
  import {
    CORE_RADIUS_MIN,
    type QualityTier,
    canStartPointerSteering,
    collectibleIdentityFor,
    deepLensUnlocked,
    radiusForLayerProgress,
  } from "$lib/game-rules";
  import {
    SAVE_KEYS,
    createSaveData,
    loadSaveCandidates,
    serializeSaveData,
    type CollectionEntry,
    type GameMode,
    type MashRecordV4,
    type SaveDataV4,
  } from "$lib/save-data";
  import {
    semanticViewScale,
  } from "$lib/world-system";
  import type {
    FactCard,
    GameState,
    HudState,
    MutableRef,
  } from "$lib/game/runtime";

  type PickupSoundProfile = {
    wave: OscillatorType;
    base: number;
    glide: number;
    interval: number;
    decay: number;
  };

  const PICKUP_SOUND_PROFILES: Record<Curio["shape"], PickupSoundProfile> = {
    bubble: { wave: "sine", base: 180, glide: 1.8, interval: 1.5, decay: 0.2 },
    spark: { wave: "triangle", base: 620, glide: 2.2, interval: 2, decay: 0.11 },
    quark: { wave: "square", base: 280, glide: 1.4, interval: 1.25, decay: 0.13 },
    hadron: { wave: "sawtooth", base: 150, glide: 0.72, interval: 1.5, decay: 0.16 },
    atom: { wave: "sine", base: 440, glide: 1.5, interval: 2, decay: 0.18 },
    molecule: { wave: "triangle", base: 350, glide: 1.25, interval: 1.33, decay: 0.2 },
    virus: { wave: "sawtooth", base: 240, glide: 1.8, interval: 1.5, decay: 0.15 },
    cell: { wave: "sine", base: 300, glide: 0.78, interval: 1.25, decay: 0.24 },
    fiber: { wave: "triangle", base: 520, glide: 0.65, interval: 1.5, decay: 0.12 },
    dust: { wave: "square", base: 700, glide: 0.55, interval: 1.6, decay: 0.07 },
    stone: { wave: "triangle", base: 170, glide: 0.62, interval: 1.25, decay: 0.12 },
    object: { wave: "square", base: 360, glide: 1.2, interval: 1.5, decay: 0.1 },
    chair: { wave: "sawtooth", base: 230, glide: 0.75, interval: 1.33, decay: 0.13 },
    car: { wave: "sawtooth", base: 180, glide: 0.58, interval: 2, decay: 0.16 },
    house: { wave: "triangle", base: 130, glide: 0.7, interval: 1.5, decay: 0.2 },
    mountain: { wave: "sine", base: 95, glide: 1.33, interval: 2, decay: 0.24 },
    planet: { wave: "sine", base: 120, glide: 1.8, interval: 1.5, decay: 0.28 },
    star: { wave: "triangle", base: 480, glide: 1.65, interval: 2, decay: 0.24 },
    system: { wave: "sine", base: 260, glide: 1.25, interval: 1.618, decay: 0.28 },
    galaxy: { wave: "sine", base: 210, glide: 0.72, interval: 1.5, decay: 0.32 },
    universe: { wave: "triangle", base: 160, glide: 2.1, interval: 2, decay: 0.35 },
  };
  const buildHash = buildVersion.match(
    /(?:^|g)([0-9a-f]{7,40})(?:-dirty)?$/,
  )?.[1];
  const buildLabel = `${buildHash?.slice(0, 7) ?? buildVersion}${
    buildVersion.endsWith("-dirty") ? "+dirty" : ""
  }`;

  const showAtlasRef: MutableRef<boolean> = { current: false };
  const showGuideRef: MutableRef<boolean> = { current: false };
  const modalOpenRef: MutableRef<boolean> = { current: false };
  const labReturnRef: MutableRef<{
    x: number;
    z: number;
    originX: number;
    originZ: number;
    vx: number;
    vz: number;
    lens: number;
    factCard: FactCard;
  } | null> = { current: null };
  const mashHistoryRef: MutableRef<MashRecordV4[]> = { current: [] };
  const collectionRef: MutableRef<CollectionEntry[]> = { current: [] };
  const unitemizedPickedRef: MutableRef<number> = { current: 0 };
  const keysRef: MutableRef<Record<string, boolean>> = { current: {} };
  const joystickRef = {
    current: { active: false, x: 0, y: 0, originX: 0, originY: 0 },
  };
  const audioRef: MutableRef<AudioContext | null> = { current: null };
  const gameRef: MutableRef<GameState> = {
    current: {
      x: 0,
      z: 0,
      originX: 0,
      originZ: 0,
      vx: 0,
      vz: 0,
      radius: CORE_RADIUS_MIN,
      lens: 1,
      progress: 0,
      picked: 0,
      zooms: 0,
      era: 0,
      mode: "journey",
      running: false,
      sound: true,
      lastPickup: -99,
      lastSave: 0,
      id: 0,
    },
  };

  let mount = $state<HTMLDivElement | null>(null);
  let atlasDialog = $state<HTMLDialogElement | null>(null);
  let atlasOpener: HTMLElement | null = null;
  let started = $state(false);
  let showAtlas = $state(false);
  let showGuide = $state(false);
  let atlasEra = $state(0);
  let labEra = $state<number | null>(null);
  let sound = $state(true);
  let gameMode = $state<GameMode>("journey");
  let collection = $state<CollectionEntry[]>([]);
  let legacyUnitemizedCount = $state(0);
  let toast = $state(
    "Current-scale things stick. Older specks dissolve quietly into mass.",
  );
  let lastFact = $state<FactCard>({
    name: "Spacetime fluctuation",
    fact: ERAS[0].lesson,
    source: ERAS[0].curios[0].source ?? ERAS[0].sources[0],
  });
  let hud = $state<HudState>({
    hours: 0,
    picked: 0,
    era: 0,
    journeyEra: 0,
    progress: 0,
    radius: CORE_RADIUS_MIN,
    lens: 1,
    zooms: 0,
    quality: "high" as QualityTier,
    fps: 60,
    drawCalls: 0,
    triangles: 0,
  });
  const saveStatus = { errorReported: false };

  function updateToast(message: string) {
    toast = message;
  }
  function updateLastFact(fact: FactCard) {
    lastFact = fact;
  }
  function updateCollection(entries: CollectionEntry[]) {
    collection = entries;
  }
  function updateHud(next: HudState) {
    hud = next;
  }

  function confidenceClass(confidence: Era["confidence"]) {
    return confidence.toLowerCase().replaceAll(" ", "-");
  }

  function formatLens(lens: number) {
    return lens >= 100 || lens < 0.01
      ? lens.toExponential(1)
      : lens.toFixed(2);
  }

  $effect(() => {
    showAtlasRef.current = showAtlas;
    showGuideRef.current = showGuide;
    modalOpenRef.current = showAtlas || showGuide;
    if (showAtlas || showGuide) {
      joystickRef.current.active = false;
      keysRef.current = {};
    }
  });

  $effect(() => {
    const dialog = atlasDialog;
    if (!showAtlas || !dialog) return;

    atlasOpener = document.activeElement as HTMLElement | null;
    let cancelled = false;
    void tick().then(() => {
      if (cancelled || !dialog.isConnected) return;
      if (!dialog.open) dialog.showModal();
      dialog.querySelector<HTMLButtonElement>(".atlas-close")?.focus();
    });

    return () => {
      cancelled = true;
      if (dialog.open) dialog.close();
      const opener = atlasOpener;
      window.requestAnimationFrame(() => opener?.focus());
    };
  });

  function ensureAudioContext() {
    const AudioConstructor =
      window.AudioContext ||
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
    if (!AudioConstructor) return null;
    const context = audioRef.current ?? new AudioConstructor();
    audioRef.current = context;
    return context;
  }

  function ping(pitch = 440, fanfare = false) {
    if (!gameRef.current.sound) return;
    const context = ensureAudioContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = fanfare ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(pitch, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      pitch * (fanfare ? 2.25 : 1.4),
      now + (fanfare ? 0.38 : 0.1),
    );
    gain.gain.setValueAtTime(fanfare ? 0.1 : 0.045, now);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      now + (fanfare ? 0.46 : 0.13),
    );
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(now + (fanfare ? 0.47 : 0.14));
  }

  function playPickupSound(curio: Curio, sourceEra: number) {
    if (!gameRef.current.sound) return;
    const context = ensureAudioContext();
    if (!context) return;
    const profile = PICKUP_SOUND_PROFILES[curio.shape];
    const identity = collectibleIdentityFor(curio.id, curio.shape);
    const itemPitch = 2 ** (((identity.seed % 17) - 8) / 38);
    const eraPitch = 2 ** ((sourceEra % 6) / 18);
    const basePitch = profile.base * itemPitch * eraPitch;
    const start =
      context.currentTime +
      (gameRef.current.picked % 3) * 0.009 +
      identity.soundRhythm * 0.18;
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = identity.seed % 4 === 0 ? "bandpass" : "lowpass";
    filter.Q.setValueAtTime(0.7 + identity.soundBrightness * 4.2, start);
    filter.frequency.setValueAtTime(
      Math.min(7600, basePitch * (5 + identity.soundBrightness * 5)),
      start,
    );
    master.gain.setValueAtTime(0.0001, start);
    master.gain.exponentialRampToValueAtTime(0.034, start + 0.012);
    master.gain.exponentialRampToValueAtTime(
      0.0001,
      start + profile.decay + identity.soundRhythm,
    );
    filter.connect(master);
    master.connect(context.destination);

    identity.soundRatios.forEach((signatureRatio, index) => {
      const oscillator = context.createOscillator();
      const ratio =
        signatureRatio * (index === 1 ? profile.interval / 1.5 : 1);
      oscillator.type =
        index === 0
          ? profile.wave
          : index === 1
            ? identity.soundWave
            : "sine";
      const noteStart = start + index * identity.soundRhythm;
      oscillator.detune.setValueAtTime(
        index === 2 ? ((identity.seed >>> 8) % 13) - 6 : 0,
        noteStart,
      );
      oscillator.frequency.setValueAtTime(basePitch * ratio, noteStart);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(35, basePitch * ratio * profile.glide),
        noteStart + profile.decay * (0.62 + index * 0.12),
      );
      oscillator.connect(filter);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + profile.decay + 0.035);
    });

    if (identity.soundNoise > 0.34) {
      const sampleCount = Math.max(
        1,
        Math.floor(context.sampleRate * 0.045),
      );
      const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
      const samples = buffer.getChannelData(0);
      let noiseState = identity.seed || 1;
      for (let index = 0; index < samples.length; index += 1) {
        noiseState ^= noiseState << 13;
        noiseState ^= noiseState >>> 17;
        noiseState ^= noiseState << 5;
        samples[index] =
          (((noiseState >>> 0) / 0xffffffff) * 2 - 1) *
          (1 - index / samples.length);
      }
      const noise = context.createBufferSource();
      const noiseGain = context.createGain();
      noise.buffer = buffer;
      noiseGain.gain.setValueAtTime(identity.soundNoise * 0.018, start);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
      noise.connect(noiseGain);
      noiseGain.connect(master);
      noise.start(start);
    }
  }

  function chooseMode(mode: GameMode) {
    gameRef.current.mode = mode;
    gameMode = mode;
    if (gameRef.current.running) {
      toast =
        mode === "journey"
          ? "Long game pace selected. Your progress stays exactly where it is."
          : "Learning tour selected. Same world, much faster scale shifts.";
    }
  }

  function adjustLens(factor: number) {
    const game = gameRef.current;
    const finishedJourney = deepLensUnlocked(game.era, ERAS.length);
    const minimumLens = finishedJourney ? 1 / 256 : 1 / 8;
    const maximumLens = finishedJourney ? 256 : 8;
    game.lens = Math.max(
      minimumLens,
      Math.min(maximumLens, game.lens * factor),
    );
    hud = { ...hud, lens: game.lens };
  }

  function begin() {
    gameRef.current.running = true;
    started = true;
    toast =
      gameRef.current.mode === "journey"
        ? "Long journey begun. You are not quite matter yet—go roll up uncertainty."
        : "Learning tour begun. Roll up a quick path through every scale.";
    if (gameRef.current.sound) {
      void ensureAudioContext()?.resume();
    }
  }

  function toggleSound() {
    const next = !gameRef.current.sound;
    gameRef.current.sound = next;
    sound = next;
    if (next) ping(520);
  }

  function previewEra(index: number) {
    const game = gameRef.current;
    labReturnRef.current ??= {
      x: game.x,
      z: game.z,
      originX: game.originX,
      originZ: game.originZ,
      vx: game.vx,
      vz: game.vz,
      lens: game.lens,
      factCard: lastFact,
    };
    game.running = true;
    started = true;
    labEra = index;
    showAtlas = false;
    toast = `Scale Lab: ${ERAS[index].name}. Journey progress is paused.`;
    lastFact = {
      name: ERAS[index].name,
      fact: ERAS[index].lesson,
      source: ERAS[index].sources[0],
    };
  }

  function returnToJourney() {
    const snapshot = labReturnRef.current;
    if (snapshot) {
      const { factCard, ...journeyState } = snapshot;
      Object.assign(gameRef.current, journeyState);
      hud = { ...hud, lens: snapshot.lens };
      lastFact = factCard;
    }
    labReturnRef.current = null;
    labEra = null;
    toast = "Journey restored exactly where you left it.";
  }

  function persistSnapshot() {
    const game = gameRef.current;
    const labSnapshot = labReturnRef.current;
    const save: SaveDataV4 = createSaveData({
      mode: game.mode,
      eraId: ERAS[game.era].id,
      progress: game.progress,
      picked: game.picked,
      unitemizedPicked: unitemizedPickedRef.current,
      x: labSnapshot
        ? labSnapshot.x + labSnapshot.originX
        : game.x + game.originX,
      z: labSnapshot
        ? labSnapshot.z + labSnapshot.originZ
        : game.z + game.originZ,
      zooms: game.zooms,
      sound: game.sound,
      mash: mashHistoryRef.current,
      collection: collectionRef.current,
    });
    storeSave(save);
  }

  function storeSave(save: SaveDataV4) {
    try {
      localStorage.setItem(SAVE_KEYS.v4, serializeSaveData(save));
    } catch {
      if (!saveStatus.errorReported) {
        saveStatus.errorReported = true;
        toast = "This browser blocked local saves. The current run still works.";
      }
    }
  }

  onMount(() => {
    let loaded: ReturnType<typeof loadSaveCandidates>;
    try {
      loaded = loadSaveCandidates(
        {
          v4: localStorage.getItem(SAVE_KEYS.v4),
          v3: localStorage.getItem(SAVE_KEYS.v3),
          v2: localStorage.getItem(SAVE_KEYS.v2),
        },
        ERAS,
      );
    } catch {
      saveStatus.errorReported = true;
      toast = "This browser blocked local saves. The current run still works.";
      return;
    }
    if (!loaded) return;

    const saved = loaded.save;
    const game = gameRef.current;
    game.era = Math.max(
      0,
      ERAS.findIndex((era) => era.id === saved.eraId),
    );
    game.mode = saved.mode;
    game.progress = saved.progress;
    game.picked = saved.picked;
    game.x = saved.x;
    game.z = saved.z;
    game.originX = 0;
    game.originZ = 0;
    game.radius = radiusForLayerProgress(game.progress);
    game.zooms = saved.zooms;
    game.sound = saved.sound;
    mashHistoryRef.current = saved.mash;
    collectionRef.current = saved.collection;
    unitemizedPickedRef.current = saved.unitemizedPicked;

    gameMode = game.mode;
    sound = game.sound;
    collection = saved.collection;
    legacyUnitemizedCount = saved.unitemizedPicked;
    hud = {
      ...hud,
      hours: journeyHoursForEraProgress(game.era, game.progress),
      picked: game.picked,
      era: game.era,
      journeyEra: game.era,
      progress: game.progress,
      radius: game.radius,
      zooms: game.zooms,
    };

    if (loaded.sourceVersion < 4) {
      storeSave(saved);
    }
  });

  onMount(() => {
    const onPageHide = () => persistSnapshot();
    const onVisibilityChange = () => {
      if (document.hidden) persistSnapshot();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

  onMount(() => {
    const onDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const interactive = target?.closest(
        "button, a, input, select, textarea, [contenteditable='true']",
      );
      if (key === "escape" && showAtlasRef.current) {
        showAtlas = false;
        return;
      }
      if (key === "escape" && showGuideRef.current) {
        showGuide = false;
        return;
      }
      if (interactive) return;
      keysRef.current[key] = true;
      if (
        ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(
          key,
        )
      ) {
        event.preventDefault();
      }
      if (key === "m") toggleSound();
      if (key === "i") showAtlas = !showAtlas;
      if (key === "g") showGuide = !showGuide;
      if (!gameRef.current.running && [" ", "enter"].includes(key)) begin();
    };
    const onUp = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = false;
    };
    const clearInput = () => {
      keysRef.current = {};
      joystickRef.current.active = false;
    };
    const onVisibilityChange = () => {
      if (document.hidden) clearInput();
    };
    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clearInput);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

  $effect(() => {
    const target = mount;
    const preview = labEra;
    if (!started || !target) return;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    void import("$lib/game/runtime")
      .then(({ mountGame }) => {
        if (cancelled) return;
        destroy = mountGame(target, {
          gameRef,
          keysRef,
          joystickRef,
          modalOpenRef,
          mashHistoryRef,
          collectionRef,
          labEra: preview,
          setToast: updateToast,
          setLastFact: updateLastFact,
          setCollection: updateCollection,
          setHud: updateHud,
          ping,
          playPickupSound,
          persistSnapshot,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        gameRef.current.running = false;
        toast = "The game code could not start. Reload to try again.";
        console.error("Quarkatamari runtime boot failed", error);
      });
    return () => {
      cancelled = true;
      destroy?.();
    };
  });

  onDestroy(() => {
    if (audioRef.current?.state !== "closed") {
      void audioRef.current?.close();
    }
  });

  function pointerDown(event: PointerEvent) {
    const target = event.target as HTMLElement;
    const insideInteractiveUi = Boolean(
      target.closest("button, a, input, select, textarea, .modal, dialog"),
    );
    if (
      !canStartPointerSteering(
        started,
        modalOpenRef.current,
        insideInteractiveUi,
      )
    ) {
      return;
    }
    joystickRef.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      originX: event.clientX,
      originY: event.clientY,
    };
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent) {
    if (!joystickRef.current.active) return;
    joystickRef.current.x = event.clientX;
    joystickRef.current.y = event.clientY;
  }

  function pointerUp() {
    joystickRef.current.active = false;
  }

  function wheelLens(event: WheelEvent) {
    if (!started || modalOpenRef.current) return;
    event.preventDefault();
    adjustLens(event.deltaY > 0 ? 1.08 : 0.92);
  }

  const collectibleCount = ERAS.reduce(
    (total, item) => total + item.curios.length,
    0,
  );
  const scienceSourceCount = new Set(
    ERAS.flatMap((item) => item.sources.map((source) => source.url)),
  ).size;

  let era = $derived(ERAS[hud.era]);
  let journeyIndex = $derived(hud.journeyEra);
  let nextEra = $derived(
    ERAS[Math.min(journeyIndex + 1, ERAS.length - 1)],
  );
  let scale = $derived(
    labEra === null
      ? formatEraScale(journeyIndex, hud.progress)
      : formatEraScale(labEra, 0),
  );
  let atlasItem = $derived(ERAS[atlasEra]);
  let semanticScale = $derived(
    semanticViewScale(labEra ?? journeyIndex, hud.lens, ERAS.length),
  );
  let semanticFoundationIndex = $derived(Math.ceil(semanticScale) - 1);
  let semanticFoundation = $derived(
    semanticFoundationIndex >= 0
      ? ERAS[semanticFoundationIndex]
      : null,
  );
</script>

<svelte:head>
  <title>Quarkatamari — Roll up the scale of everything</title>
  <meta
    name="description"
    content="A browser-only rolling game from the theory below known physics to the fiction beyond the observable universe."
  />
  <meta name="application-name" content="Quarkatamari" />
</svelte:head>

<main class="shell" data-release="v2-sveltekit">
  <div
    bind:this={mount}
    class:started
    class:awaiting-start={!started}
    class:empty-origin={started && hud.era === 0}
    class="world"
    style={`--pop: ${era.palette[2]}; --deep: ${era.palette[0]}`}
    onpointerdown={pointerDown}
    onpointermove={pointerMove}
    onpointerup={pointerUp}
    onpointercancel={pointerUp}
    onwheel={wheelLens}
    role="group"
    aria-label="Quarkatamari game world and controls"
  >
    <header class="topbar hud">
      <div class="brand">
        <div class="brand-ball" aria-hidden="true">✦</div>
        <div>
          <b>QUARKATAMARI</b>
          <small class="tagline">the scale of everything</small>
          <small
            class="version-stamp"
            data-testid="build-stamp"
            title={`Quarkatamari v${appVersion}, build ${buildVersion}`}
          >
            v{appVersion} · {buildLabel}
          </small>
        </div>
      </div>
      <div class="actions">
        <button
          aria-label="Open rolled-up field guide"
          onclick={() => {
            showAtlas = false;
            showGuide = true;
          }}
        >
          <span aria-hidden="true">✦</span> <span>Field guide</span>
        </button>
        <button
          onclick={() => {
            showGuide = false;
            atlasEra = journeyIndex;
            showAtlas = true;
          }}
          aria-label="Open scale and science atlas"
        >
          <span aria-hidden="true">⌁</span> <span>Scale & science</span>
        </button>
        <button
          class="sound"
          onclick={toggleSound}
          aria-label={sound ? "Mute sound" : "Turn on sound"}
        >
          {sound ? "♪" : "×"}
        </button>
      </div>
    </header>

    {#if labEra !== null}
      <div class="lab-banner hud">
        <span>Scale Lab preview · progress paused</span>
        <button onclick={returnToJourney}>Return to journey</button>
      </div>
    {/if}

    <section class="scale-card hud">
      <div class="kicker">
        <span>{era.name}</span>
        <span class={`confidence ${confidenceClass(era.confidence)}`}>
          {era.confidence}
        </span>
      </div>
      <div class="scale">{scale}</div>
      <div class="quip">{era.quip}</div>
      <div class="track">
        <i style={`width: ${Math.max(1.5, hud.progress * 100)}%`}></i>
      </div>
      <div class="meta">
        <span>
          {labEra === null ? `Next: ${nextEra.name}` : "Scale Lab specimen"}
        </span>
        <span>
          {labEra === null ? `${(hud.progress * 100).toFixed(2)}%` : "PREVIEW"}
        </span>
      </div>
      <div
        class="lens-control"
        aria-label="Free scale lens"
        title="Optical zoom also selects which earlier layer is resolved as the non-interactive fabric underfoot; it never changes journey progress."
      >
        <button
          type="button"
          onclick={() => adjustLens(0.82)}
          aria-label="Zoom camera in"
        >
          −
        </button>
        <span>
          {formatLens(hud.lens)}× lens ·
          {semanticFoundation
            ? `${semanticFoundation.name} fabric`
            : "no prior fabric"}
        </span>
        <button
          type="button"
          onclick={() => adjustLens(1.22)}
          aria-label="Zoom camera out"
        >
          +
        </button>
      </div>
    </section>

    <aside class="stats hud">
      <div>
        <b>{hud.picked.toLocaleString()}</b>
        <small>things collected</small>
      </div>
      <i></i>
      <div><b>{journeyIndex}</b><small>layers underfoot</small></div>
      <i></i>
      <div><b>{hud.zooms}</b><small>scale shifts</small></div>
    </aside>

    <aside class="fact-card hud">
      <div class="fact-kicker">WHAT YOU JUST ROLLED UP</div>
      <h2>{lastFact.name}</h2>
      <p>{lastFact.fact}</p>
      <div class="fact-actions">
        <a
          class="fact-source"
          href={lastFact.source.url}
          target="_blank"
          rel="noreferrer"
        >
          {lastFact.source.organization} · {lastFact.source.label} ↗
        </a>
        <button
          type="button"
          onclick={() => {
            showAtlas = false;
            showGuide = true;
          }}
        >
          See every find
        </button>
      </div>
    </aside>

    <div class="toast hud" role="status" aria-live="polite">
      <span>✦</span>
      {toast}
    </div>

    <div class="controls hud">
      <span><kbd>WASD</kbd> / arrows to roll</span>
      <span><kbd>SPACE</kbd> to surge</span>
      <span><kbd>I</kbd> science</span>
      <span><kbd>G</kbd> field guide</span>
      <span class="quality-mode">
        {hud.quality} · {Math.round(hud.fps)} fps · {hud.drawCalls} draws ·
        {Math.round(hud.triangles / 1000)}k tris
      </span>
    </div>
    <div class="touch-tip hud">◎ drag anywhere to roll</div>

    {#if !started}
      <section class="welcome modal">
        <div class="eyebrow">BEGIN WHERE THE MAP RUNS OUT</div>
        <h1>
          You are not a ball.
          <br />
          <em>Not yet.</em>
        </h1>
        <p class="welcome-lead">
          Start in a deliberately silly theory playground: foam bubbles,
          vibrating strings, topology questions, even musical notes. Collect
          enough of the current layer to grow. At each scale shift, the old
          world shrinks into the textured field beneath you.
        </p>
        <div class="science-caveat">
          <b>Scientific honesty:</b> everything in the opening playground is
          explicitly speculative. “Rolling” before matter exists is a navigation
          metaphor. Physical footprint alone decides what fits; shape-specific
          gameplay bulk only tunes growth. Experimental anchoring begins at
          the particle frontier, named measured particles follow, and metre
          labels stop when known cosmology does.
        </div>
        <div class="mode-picker" role="group" aria-label="Choose game pace">
          <button
            type="button"
            class:selected={gameMode === "journey"}
            aria-pressed={gameMode === "journey"}
            onclick={() => chooseMode("journey")}
          >
            <b>Long game</b>
            <span>40× the collecting journey · default</span>
          </button>
          <button
            type="button"
            class:selected={gameMode === "learning"}
            aria-pressed={gameMode === "learning"}
            onclick={() => chooseMode("learning")}
          >
            <b>Learning tour</b>
            <span>See every scale quickly</span>
          </button>
        </div>
        <button class="start" onclick={begin}>
          <span>Begin becoming</span>
          <b>→</b>
        </button>
        <div class="welcome-foot">
          <span>{collectibleCount} UNIQUE SPECIMENS</span><span>•</span>
          <span>{ERAS.length} SCALE LAYERS</span><span>•</span>
          <span>{scienceSourceCount} PRIMARY LINKS</span><span>•</span>
          <span>THEORY ON BOTH ENDS</span>
        </div>
      </section>
    {/if}

    {#if showAtlas}
      <dialog
        bind:this={atlasDialog}
        class="atlas-bg modal"
        aria-label="Scale and science atlas"
        oncancel={(event) => {
          event.preventDefault();
          showAtlas = false;
        }}
      >
        <div class="atlas">
          <header>
            <div>
              <div class="eyebrow">THE RIDICULOUSLY LONG, HONEST VIEW</div>
              <h2>Scale & science</h2>
              <p>
                Preview any era without changing your save. Confidence labels
                separate observations from models, unknowns, and deliberate fiction.
              </p>
              <div class="atlas-mode" role="group" aria-label="Game pace">
                <span>GAME PACE</span>
                <button
                  type="button"
                  aria-pressed={gameMode === "journey"}
                  onclick={() => chooseMode("journey")}
                >
                  Long game · 40×
                </button>
                <button
                  type="button"
                  aria-pressed={gameMode === "learning"}
                  onclick={() => chooseMode("learning")}
                >
                  Learning tour
                </button>
              </div>
            </div>
            <button
              class="atlas-close"
              onclick={() => (showAtlas = false)}
              aria-label="Close atlas"
            >
              ×
            </button>
          </header>
          <div class="era-list">
            <div class="scale-scrubber">
              <div>
                <span>UNKNOWN BELOW</span>
                <b>drag across all {ERAS.length} layers</b>
                <span>FICTION BEYOND</span>
              </div>
              <input
                type="range"
                min="0"
                max={ERAS.length - 1}
                step="1"
                bind:value={atlasEra}
                aria-label="Choose a scale layer"
              />
              <div class="scrubber-meta">
                <span>Layer {atlasEra + 1} of {ERAS.length}</span>
                <span>{atlasEra <= journeyIndex ? "REACHED" : "AHEAD"}</span>
              </div>
            </div>
            <article class="era-feature current">
              <div
                class="era-dot"
                style={`background: ${atlasItem.palette[2]}`}
              >
                {atlasEra + 1}
              </div>
              <div class="era-copy">
                <span>
                  {atlasEra === 0 ? "THEORY PLAYGROUND" : "SCALE LAYER"}
                </span>
                <h3>{atlasItem.name}</h3>
                <p>{atlasItem.lesson}</p>
                <div class={`confidence ${confidenceClass(atlasItem.confidence)}`}>
                  {atlasItem.confidence}
                </div>
              </div>
              <div class="era-actions">
                <code>{formatEraScale(atlasEra, 0)}</code>
                <a
                  href={atlasItem.sources[0].url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {atlasItem.sources[0].organization} reference ↗
                </a>
                <button onclick={() => previewEra(atlasEra)}>
                  {labEra === atlasEra ? "Viewing" : "Preview in 3D"}
                </button>
              </div>
            </article>
            <article class="sources">
              <div>
                <span>AUTHORITATIVE REFERENCES</span>
                <h3>Built to teach without pretending certainty</h3>
                <p>
                  The progression compresses scale and uses magical adhesion. Each
                  collectible links to an authoritative scale or topic reference;
                  that link is context, not a citation for every playful sentence.
                  Confidence labels keep observation, models, unknowns, and fiction
                  visibly separate.
                </p>
              </div>
              <div class="source-links">
                <a
                  href="https://physics.nist.gov/cgi-bin/cuu/Value?plkl"
                  target="_blank"
                  rel="noreferrer"
                >NIST · Planck length ↗</a>
                <a
                  href="https://home.cern/partons-hadrons/"
                  target="_blank"
                  rel="noreferrer"
                >CERN · Quark confinement ↗</a>
                <a
                  href="https://home.cern/science/experiments/alice/"
                  target="_blank"
                  rel="noreferrer"
                >CERN ALICE · Matter ↗</a>
                <a
                  href="https://home.cern/science/physics/standard-model"
                  target="_blank"
                  rel="noreferrer"
                >CERN · Standard Model ↗</a>
              </div>
            </article>
          </div>
        </div>
      </dialog>
    {/if}

    <FieldGuide
      open={showGuide}
      entries={collection}
      {legacyUnitemizedCount}
      onClose={() => (showGuide = false)}
    />
  </div>
</main>
