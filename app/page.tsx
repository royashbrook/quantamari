"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import {
  Curio,
  ERAS,
  Era,
  LEGACY_V3_ERA_NAMES,
  ScienceSource,
  formatEraScale,
  journeyHoursForEraProgress,
} from "./scale-data";
import {
  CORE_RADIUS_MIN,
  CORE_RADIUS_MAX,
  MAX_ROLL_ENVELOPE_FACTOR,
  CollectibleIdentity,
  QualityTier,
  canCollectPickup,
  canStartPointerSteering,
  circleAabbClearance,
  collectionProgressGain,
  collectibleIdentityFor,
  deepLensUnlocked,
  nextLayerObstacleRadius,
  obstacleCenterGap,
  pickupBudget,
  pixelRatioCap,
  progressAfterPickup,
  qualityTierForFps,
  radiusForLayerProgress,
  resolveCircleAabbCollision,
  resolveCircularCollision,
  scaleTransitionFrame,
} from "./game-rules";
import {
  LegacyVisualStage,
  WorldKind,
  floatingOriginShift,
  legacyVisualStageAnchor,
  localChunkCoordinate,
  lodForProjectedDiameter,
  projectedDiameterPixels,
  residentLayerIndices,
  semanticViewScale,
  worldPerformanceBudget,
  worldSpecForEra,
} from "./world-system";
import { FieldGuide } from "./field-guide";
import {
  SAVE_KEYS,
  aggregatePickups,
  createSaveData,
  loadSaveCandidates,
  serializeSaveData,
  type CollectionEntry,
  type GameMode,
  type MashRecordV4,
  type SaveDataV4,
} from "./save-data";

type Pickup = {
  root: THREE.Group;
  visual: THREE.Object3D;
  marker: THREE.Sprite | null;
  curio: Curio;
  sourceEra: number;
  size: number;
  visualRadius: number;
  bulkRadius: number;
  big: boolean;
  baseY: number;
  wiggle: number;
  identity: CollectibleIdentity;
};

function pseudo(seed: number) {
  const value = Math.sin(seed * 9283.312 + 77.13) * 43758.5453;
  return value - Math.floor(value);
}

function confidenceClass(confidence: Era["confidence"]) {
  return confidence.toLowerCase().replaceAll(" ", "-");
}

const PERIODIC_WORLD_KINDS = new Set<WorldKind>([
  "microscopic-sea",
  "fiber-bed",
  "dust-surface",
  "tabletop",
  "interior",
  "yard",
  "city",
  "landscape",
]);

function worldChunkSize(kind: WorldKind) {
  return kind === "interior" ? 256 : 128;
}

function formatLens(lens: number) {
  return lens >= 100 || lens < 0.01
    ? lens.toExponential(1)
    : lens.toFixed(2);
}

function legacyVisualIndexForEra(index: number) {
  const era = ERAS[index];
  const exact = LEGACY_V3_ERA_NAMES.findIndex((name) => name === era.name);
  if (exact >= 0) return exact;
  const authoredFallbacks: Record<string, number> = {
    "Nuclear Heart": 3,
    "Virus Garden": 7,
    "Microbe Meadow": 7,
    "Granule Ground": 9,
    "Tabletop Trek": 10,
    "Room Scale": 11,
    "House & Yard": 12,
    "City Streets": 13,
    "Regional Map": 14,
    "Moon Scale": 15,
    "Giant Worlds": 15,
    "Stellar Neighborhood": 16,
    "Galaxy Cluster Web": 19,
  };
  if (era.name in authoredFallbacks) return authoredFallbacks[era.name];
  const anchor = legacyVisualStageAnchor(
    worldSpecForEra(era.name).legacyStage,
  );
  return LEGACY_V3_ERA_NAMES.findIndex((name) => name === anchor);
}

const WORLD_NAMES: Record<WorldKind, string> = {
  void: "a foaming spacetime void",
  "particle-field": "a crowded particle field",
  "microscopic-sea": "a living microscopic sea",
  "fiber-bed": "a woven forest of fibers",
  "dust-surface": "a sunlit floor of grains",
  tabletop: "a giant tabletop landscape",
  interior: "a furnished room with a way outside",
  yard: "a connected house, yard, and street",
  city: "a traversable city grid",
  landscape: "a continuous region of land and water",
  "planet-surface": "the curved surface of a world",
  "stellar-field": "a stellar neighborhood",
  "orbital-system": "an ocean of orbital systems",
  "galaxy-field": "a garden of galaxies",
  "cosmic-web": "the luminous cosmic web",
  "speculative-beyond": "a speculative infinity of realities",
};

const GAMEPLAY_BULK_FACTORS: Record<Curio["shape"], number> = {
  bubble: 0.18,
  spark: 0.38,
  quark: 0.72,
  hadron: 1.05,
  atom: 0.9,
  molecule: 0.68,
  virus: 0.48,
  cell: 0.62,
  fiber: 0.24,
  dust: 0.52,
  stone: 1.25,
  object: 0.58,
  chair: 0.32,
  car: 0.7,
  house: 0.18,
  mountain: 1.25,
  planet: 1,
  star: 1.08,
  system: 0.52,
  galaxy: 0.6,
  universe: 0.5,
};

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

const PICKUP_QUIPS = [
  "plop! permanent passenger",
  "squished into the friendship ball",
  "yoinked for science",
  "now 100% part of the situation",
  "welcome aboard, tiny thing",
  "stuck forever—adorable",
  "the mash says nom",
  "rolled up with excellent manners",
];

export default function Home() {
  const mountRef = useRef<HTMLDivElement>(null);
  const atlasDialogRef = useRef<HTMLDialogElement>(null);
  const atlasOpenerRef = useRef<HTMLElement | null>(null);
  const showAtlasRef = useRef(false);
  const showGuideRef = useRef(false);
  const modalOpenRef = useRef(false);
  const labReturnRef = useRef<{
    x: number;
    z: number;
    originX: number;
    originZ: number;
    vx: number;
    vz: number;
    lens: number;
    factCard: {
      name: string;
      fact: string;
      source: ScienceSource;
    };
  } | null>(null);
  const mashHistoryRef = useRef<MashRecordV4[]>([]);
  const collectionRef = useRef<CollectionEntry[]>([]);
  const unitemizedPickedRef = useRef(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const joystickRef = useRef({ active: false, x: 0, y: 0, originX: 0, originY: 0 });
  const audioRef = useRef<AudioContext | null>(null);
  const gameRef = useRef({
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
    mode: "journey" as GameMode,
    running: false,
    sound: true,
    lastPickup: -99,
    lastSave: 0,
    id: 0,
  });

  const [started, setStarted] = useState(false);
  const [showAtlas, setShowAtlas] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [atlasEra, setAtlasEra] = useState(0);
  const [labEra, setLabEra] = useState<number | null>(null);
  const [sound, setSound] = useState(true);
  const [gameMode, setGameMode] = useState<GameMode>("journey");
  const [collection, setCollection] = useState<CollectionEntry[]>([]);
  const [legacyUnitemizedCount, setLegacyUnitemizedCount] = useState(0);
  const [toast, setToast] = useState(
    "Current-scale things stick. Older specks dissolve quietly into mass.",
  );
  const [lastFact, setLastFact] = useState({
    name: "Spacetime fluctuation",
    fact: ERAS[0].lesson,
    source: ERAS[0].curios[0].source as ScienceSource,
  });
  const [hud, setHud] = useState({
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

  useEffect(() => {
    showAtlasRef.current = showAtlas;
    modalOpenRef.current = showAtlas || showGuide;
    if (showAtlas || showGuide) {
      joystickRef.current.active = false;
      keysRef.current = {};
    }
    if (showAtlas) {
      atlasOpenerRef.current = document.activeElement as HTMLElement | null;
    }
  }, [showAtlas, showGuide]);

  useEffect(() => {
    const dialog = atlasDialogRef.current;
    if (!showAtlas || !dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLButtonElement>(".atlas-close")?.focus();
    return () => {
      if (dialog.open) dialog.close();
      const opener = atlasOpenerRef.current;
      window.requestAnimationFrame(() => opener?.focus());
    };
  }, [showAtlas]);

  useEffect(() => {
    showGuideRef.current = showGuide;
  }, [showGuide]);

  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      // Register RELATIVE to the current page, so it works at a domain root and under a subpath
      // (royashbrook.com/quarkatamari) alike. A service worker's scope is its own directory, so a
      // root-absolute "/sw.js" would 404 (or take the wrong scope) when served under a subpath.
      void navigator.serviceWorker.register("./sw.js");
    }
  }, []);

  const ping = useCallback((pitch = 440, fanfare = false) => {
    if (!gameRef.current.sound) return;
    const AudioConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioConstructor) return;
    const context = audioRef.current ?? new AudioConstructor();
    audioRef.current = context;
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
    gain.gain.exponentialRampToValueAtTime(0.001, now + (fanfare ? 0.46 : 0.13));
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(now + (fanfare ? 0.47 : 0.14));
  }, []);

  const playPickupSound = useCallback((curio: Curio, sourceEra: number) => {
    if (!gameRef.current.sound) return;
    const AudioConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioConstructor) return;
    const context = audioRef.current ?? new AudioConstructor();
    audioRef.current = context;
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
      const ratio = signatureRatio * (index === 1 ? profile.interval / 1.5 : 1);
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
      const sampleCount = Math.max(1, Math.floor(context.sampleRate * 0.045));
      const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
      const samples = buffer.getChannelData(0);
      let noiseState = identity.seed || 1;
      for (let index = 0; index < samples.length; index += 1) {
        noiseState ^= noiseState << 13;
        noiseState ^= noiseState >>> 17;
        noiseState ^= noiseState << 5;
        samples[index] =
          ((noiseState >>> 0) / 0xffffffff) * 2 - 1;
        samples[index] *= 1 - index / samples.length;
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
  }, []);

  const chooseMode = useCallback((mode: GameMode) => {
    gameRef.current.mode = mode;
    setGameMode(mode);
    if (gameRef.current.running) {
      setToast(
        mode === "journey"
          ? "Long game pace selected. Your progress stays exactly where it is."
          : "Learning tour selected. Same world, much faster scale shifts.",
      );
    }
  }, []);

  const adjustLens = useCallback((factor: number) => {
    const game = gameRef.current;
    const finishedJourney = deepLensUnlocked(game.era, ERAS.length);
    const minimumLens = finishedJourney ? 1 / 256 : 1 / 8;
    const maximumLens = finishedJourney ? 256 : 8;
    game.lens = Math.max(
      minimumLens,
      Math.min(maximumLens, game.lens * factor),
    );
    setHud((current) => ({ ...current, lens: game.lens }));
  }, []);

  const begin = useCallback(() => {
    gameRef.current.running = true;
    setStarted(true);
    setToast(
      gameRef.current.mode === "journey"
        ? "Long journey begun. You are not quite matter yet—go roll up uncertainty."
        : "Learning tour begun. Roll up a quick path through every scale.",
    );
    audioRef.current?.resume();
  }, []);

  const toggleSound = useCallback(() => {
    const next = !gameRef.current.sound;
    gameRef.current.sound = next;
    setSound(next);
    if (next) ping(520);
  }, [ping]);

  const previewEra = (index: number) => {
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
    gameRef.current.running = true;
    setStarted(true);
    setLabEra(index);
    setShowAtlas(false);
    setToast(`Scale Lab: ${ERAS[index].name}. Journey progress is paused.`);
    setLastFact({
      name: ERAS[index].name,
      fact: ERAS[index].lesson,
      source: ERAS[index].sources[0],
    });
  };

  const returnToJourney = () => {
    const snapshot = labReturnRef.current;
    if (snapshot) {
      const { factCard, ...journeyState } = snapshot;
      Object.assign(gameRef.current, journeyState);
      setHud((current) => ({ ...current, lens: snapshot.lens }));
      setLastFact(factCard);
    }
    labReturnRef.current = null;
    setLabEra(null);
    setToast("Journey restored exactly where you left it.");
  };

  const persistSnapshot = useCallback(() => {
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
    localStorage.setItem(SAVE_KEYS.v4, serializeSaveData(save));
  }, []);

  useEffect(() => {
    const loaded = loadSaveCandidates(
      {
        v4: localStorage.getItem(SAVE_KEYS.v4),
        v3: localStorage.getItem(SAVE_KEYS.v3),
        v2: localStorage.getItem(SAVE_KEYS.v2),
      },
      ERAS,
    );
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

    setGameMode(game.mode);
    setSound(game.sound);
    setCollection(saved.collection);
    setLegacyUnitemizedCount(saved.unitemizedPicked);
    setHud((current) => ({
      ...current,
      hours: journeyHoursForEraProgress(game.era, game.progress),
      picked: game.picked,
      era: game.era,
      journeyEra: game.era,
      progress: game.progress,
      radius: game.radius,
      zooms: game.zooms,
    }));

    if (loaded.sourceVersion < 4) {
      localStorage.setItem(SAVE_KEYS.v4, serializeSaveData(saved));
    }
  }, []);

  useEffect(() => {
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
  }, [persistSnapshot]);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const interactive = target?.closest(
        "button, a, input, select, textarea, [contenteditable='true']",
      );
      if (key === "escape" && showAtlasRef.current) {
        setShowAtlas(false);
        return;
      }
      if (key === "escape" && showGuideRef.current) {
        setShowGuide(false);
        return;
      }
      if (interactive) return;
      keysRef.current[key] = true;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
        event.preventDefault();
      }
      if (key === "m") toggleSound();
      if (key === "i") setShowAtlas((value) => !value);
      if (key === "g") setShowGuide((value) => !value);
      if (!gameRef.current.running && [" ", "enter"].includes(key)) begin();
    };
    const onUp = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [begin, toggleSound]);

  useEffect(() => {
    if (!started) return;
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let disposeScene: (() => void) | undefined;
    const bootScene = async () => {
    const THREE = await import("three");
    if (disposed) return;
    const game = gameRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.06, 220);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    const compactGpu = window.innerWidth <= 860;
    let qualityTier: QualityTier = compactGpu ? "balanced" : "high";
    const reducedWorldDetail = () =>
      compactGpu || qualityTier !== "high";
    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        pixelRatioCap(compactGpu, qualityTier),
      ),
    );
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.className = "three-canvas";
    mount.prepend(renderer.domElement);

    let activeIndex = labEra ?? game.era;
    let activeEra = ERAS[activeIndex];
    let early =
      activeEra.realm === "prephysical" || activeEra.realm === "particle";

    const deepColor = new THREE.Color(activeEra.palette[0]);
    const middleColor = new THREE.Color(activeEra.palette[1]);
    scene.background = deepColor;
    scene.fog = new THREE.FogExp2(deepColor, early ? 0.017 : 0.024);

    const hemisphere = new THREE.HemisphereLight(0xdff8ff, 0x28112f, early ? 1.5 : 1.1);
    scene.add(hemisphere);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
    keyLight.position.set(-7, 12, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(
      qualityTier === "high" ? (compactGpu ? 1024 : 2048) : 1024,
      qualityTier === "high" ? (compactGpu ? 1024 : 2048) : 1024,
    );
    keyLight.shadow.camera.left = -22;
    keyLight.shadow.camera.right = 22;
    keyLight.shadow.camera.top = 22;
    keyLight.shadow.camera.bottom = -22;
    scene.add(keyLight);
    const glowLight = new THREE.PointLight(activeEra.palette[2], 8, 22, 2);
    glowLight.position.set(4, 5, -3);
    scene.add(glowLight);

    const groundMaterial = new THREE.MeshStandardMaterial({
      color: middleColor.clone().lerp(new THREE.Color("#ffdff1"), 0.18).multiplyScalar(0.82),
      roughness: 0.78,
      metalness: 0,
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(95, 96), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.visible = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(170, 90, activeEra.palette[2], activeEra.palette[2]);
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = activeEra.realm === "matter" ? 0.12 : 0.08;
    });
    grid.position.y = 0.012;
    grid.visible = true;
    scene.add(grid);

    const dustPositions: number[] = [];
    const dustColors: number[] = [];
    const pop = new THREE.Color(activeEra.palette[2]);
    for (let i = 0; i < 620; i += 1) {
      const angle = pseudo(i * 3.17) * Math.PI * 2;
      const radius = 8 + pseudo(i * 7.31) * 75;
      dustPositions.push(
        Math.cos(angle) * radius,
        -3 + pseudo(i * 1.91) * 18,
        Math.sin(angle) * radius,
      );
      const color = pop.clone().lerp(new THREE.Color(0xffffff), pseudo(i * 8.3) * 0.7);
      dustColors.push(color.r, color.g, color.b);
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.Float32BufferAttribute(dustPositions, 3));
    dustGeometry.setAttribute("color", new THREE.Float32BufferAttribute(dustColors, 3));
    const dustMaterial = new THREE.PointsMaterial({
      size: early ? 0.11 : 0.06,
      transparent: true,
      opacity: early ? 0.72 : 0.35,
      vertexColors: true,
      depthWrite: false,
    });
    const dustField = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dustField);

    const farPickupMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshToonMaterial({
        color: "#ffffff",
        vertexColors: true,
        transparent: true,
        opacity: 0.88,
      }),
      256,
    );
    farPickupMesh.count = 0;
    farPickupMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    farPickupMesh.frustumCulled = false;
    scene.add(farPickupMesh);
    const pickupColorCache = new Map<string, THREE.Color>();

    const environmentGroup = new THREE.Group();
    scene.add(environmentGroup);
    const substrateGroup = new THREE.Group();
    scene.add(substrateGroup);
    let centralSceneryCompact: boolean | null = null;

    const PERIODIC_TILE_OFFSETS = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], [1, 0],
      [-1, 1], [0, 1], [1, 1],
    ] as const;

    const addPeriodicSubstrateCopies = (
      root: THREE.Group,
      chunkSize: number,
    ) => {
      const authoredChildren = [...root.children];
      const allTiles = [[0, 0], ...PERIODIC_TILE_OFFSETS] as const;
      authoredChildren.forEach((child) => {
        if (child instanceof THREE.InstancedMesh) {
          const combined = new THREE.InstancedMesh(
            child.geometry,
            child.material,
            child.count * allTiles.length,
          );
          combined.userData.periodicCopy = true;
          const sourceMatrix = new THREE.Matrix4();
          const tileMatrix = new THREE.Matrix4();
          const combinedMatrix = new THREE.Matrix4();
          const instanceColor = new THREE.Color();
          let target = 0;
          allTiles.forEach(([tileX, tileZ]) => {
            tileMatrix.makeTranslation(
              tileX * chunkSize,
              0,
              tileZ * chunkSize,
            );
            for (let source = 0; source < child.count; source += 1) {
              child.getMatrixAt(source, sourceMatrix);
              combinedMatrix.multiplyMatrices(tileMatrix, sourceMatrix);
              combined.setMatrixAt(target, combinedMatrix);
              if (child.instanceColor) {
                child.getColorAt(source, instanceColor);
                combined.setColorAt(target, instanceColor);
              }
              target += 1;
            }
          });
          combined.count = target;
          combined.instanceMatrix.needsUpdate = true;
          if (combined.instanceColor) {
            combined.instanceColor.needsUpdate = true;
          }
          combined.castShadow = false;
          combined.receiveShadow = false;
          root.remove(child);
          root.add(combined);
          return;
        }
        if (child instanceof THREE.Points) {
          const sourcePositions = child.geometry.getAttribute("position");
          const sourceColors = child.geometry.getAttribute("color");
          const positions: number[] = [];
          const colors: number[] = [];
          allTiles.forEach(([tileX, tileZ]) => {
            for (let point = 0; point < sourcePositions.count; point += 1) {
              positions.push(
                sourcePositions.getX(point) + tileX * chunkSize,
                sourcePositions.getY(point),
                sourcePositions.getZ(point) + tileZ * chunkSize,
              );
              if (sourceColors) {
                colors.push(
                  sourceColors.getX(point),
                  sourceColors.getY(point),
                  sourceColors.getZ(point),
                );
              }
            }
          });
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(positions, 3),
          );
          if (colors.length > 0) {
            geometry.setAttribute(
              "color",
              new THREE.Float32BufferAttribute(colors, 3),
            );
          }
          const combined = new THREE.Points(geometry, child.material);
          combined.userData.periodicCopy = true;
          root.remove(child);
          child.geometry.dispose();
          root.add(combined);
        }
      });
    };

    const addPeriodicEnvironmentLod = (
      root: THREE.Group,
      chunkSize: number,
    ) => {
      const authoredChildren = [...root.children];
      const instancedFamilies: THREE.InstancedMesh[] = [];
      const proxyDescriptors: {
        center: THREE.Vector3;
        size: THREE.Vector3;
        color: THREE.Color;
      }[] = [];
      root.updateMatrixWorld(true);

      authoredChildren.forEach((child) => {
        let containsInstancedMesh = false;
        let color = new THREE.Color(activeEra.palette[1]);
        child.traverse((object) => {
          if (object instanceof THREE.InstancedMesh) {
            containsInstancedMesh = true;
            instancedFamilies.push(object);
          }
          if (object instanceof THREE.Mesh) {
            const firstMaterial = Array.isArray(object.material)
              ? object.material[0]
              : object.material;
            if (firstMaterial && "color" in firstMaterial) {
              color = (
                firstMaterial as THREE.MeshBasicMaterial
              ).color.clone();
            }
          }
        });
        if (containsInstancedMesh) {
          return;
        }
        const bounds = new THREE.Box3().setFromObject(child);
        if (bounds.isEmpty()) return;
        const center = bounds.getCenter(new THREE.Vector3());
        root.worldToLocal(center);
        const size = bounds.getSize(new THREE.Vector3());
        if (size.lengthSq() <= 0.0001) return;
        child.userData.authoredSceneryDetail = true;
        proxyDescriptors.push({ center, size, color });
      });

      const rootInverse = root.matrixWorld.clone().invert();
      instancedFamilies.forEach((family) => {
        family.updateMatrixWorld(true);
        const familyToRoot = new THREE.Matrix4().multiplyMatrices(
          rootInverse,
          family.matrixWorld,
        );
        const combined = new THREE.InstancedMesh(
          family.geometry,
          family.material,
          family.count * PERIODIC_TILE_OFFSETS.length,
        );
        combined.userData.periodicCopy = true;
        const sourceMatrix = new THREE.Matrix4();
        const tileMatrix = new THREE.Matrix4();
        const rootedMatrix = new THREE.Matrix4();
        const combinedMatrix = new THREE.Matrix4();
        const instanceColor = new THREE.Color();
        let target = 0;
        PERIODIC_TILE_OFFSETS.forEach(([tileX, tileZ]) => {
          tileMatrix.makeTranslation(
            tileX * chunkSize,
            0,
            tileZ * chunkSize,
          );
          for (let source = 0; source < family.count; source += 1) {
            family.getMatrixAt(source, sourceMatrix);
            rootedMatrix.multiplyMatrices(familyToRoot, sourceMatrix);
            combinedMatrix.multiplyMatrices(tileMatrix, rootedMatrix);
            combined.setMatrixAt(target, combinedMatrix);
            if (family.instanceColor) {
              family.getColorAt(source, instanceColor);
              combined.setColorAt(target, instanceColor);
            }
            target += 1;
          }
        });
        combined.count = target;
        combined.instanceMatrix.needsUpdate = true;
        if (combined.instanceColor) {
          combined.instanceColor.needsUpdate = true;
        }
        combined.castShadow = false;
        combined.receiveShadow = false;
        root.add(combined);
      });

      const addProxyTiles = (
        tileOffsets: readonly (readonly [number, number])[],
        maximumInstances: number,
        opacity: number,
        central = false,
      ) => {
        const instanceLimit = Math.min(
          proxyDescriptors.length * tileOffsets.length,
          maximumInstances,
        );
        if (instanceLimit === 0) return;
        const proxies = new THREE.InstancedMesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshToonMaterial({
            color: "#ffffff",
            vertexColors: true,
            transparent: true,
            opacity,
          }),
          instanceLimit,
        );
        proxies.userData.periodicCopy = true;
        proxies.userData.centralSceneryProxy = central;
        proxies.visible = !central;
        const dummy = new THREE.Object3D();
        let instance = 0;
        for (const [tileX, tileZ] of tileOffsets) {
          for (const descriptor of proxyDescriptors) {
            if (instance >= instanceLimit) break;
            dummy.position.set(
              descriptor.center.x + tileX * chunkSize,
              descriptor.center.y,
              descriptor.center.z + tileZ * chunkSize,
            );
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(
              Math.max(0.04, descriptor.size.x),
              Math.max(0.04, descriptor.size.y),
              Math.max(0.04, descriptor.size.z),
            );
            dummy.updateMatrix();
            proxies.setMatrixAt(instance, dummy.matrix);
            proxies.setColorAt(instance, descriptor.color);
            instance += 1;
          }
        }
        proxies.count = instance;
        proxies.instanceMatrix.needsUpdate = true;
        if (proxies.instanceColor) proxies.instanceColor.needsUpdate = true;
        proxies.castShadow = false;
        proxies.receiveShadow = false;
        root.add(proxies);
      };
      const instanceBudget = worldPerformanceBudget(qualityTier).maxInstances;
      addProxyTiles(
        PERIODIC_TILE_OFFSETS,
        Math.floor(instanceBudget * 0.45),
        0.68,
      );
      addProxyTiles([[0, 0]], Math.floor(instanceBudget * 0.1), 0.78, true);
    };

    const setCentralSceneryLod = (compact: boolean) => {
      if (compact === centralSceneryCompact) return;
      centralSceneryCompact = compact;
      environmentGroup.children.forEach((child) => {
        if (child.userData.authoredSceneryDetail) {
          child.visible = !compact;
        } else if (child.userData.centralSceneryProxy) {
          child.visible = compact;
        }
      });
    };

    type SceneryCollider = {
      x: number;
      z: number;
      halfWidth: number;
      halfDepth: number;
    };
    let sceneryColliders: SceneryCollider[] = [];
    let semanticResidencyKey = "";

    const substrateKeyFor = (viewScale: number) =>
      residentLayerIndices(viewScale, ERAS.length)
        .filter((layer) => layer < viewScale)
        .join(":");

    const buildSubstrate = (viewScale: number) => {
      substrateGroup.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      substrateGroup.clear();

      const priorLayers = residentLayerIndices(viewScale, ERAS.length).filter(
        (layer) => layer < viewScale,
      );
      priorLayers.forEach((layer, residentPosition) => {
        const depth = Math.max(1, Math.ceil(viewScale) - layer);
        const era = ERAS[layer];
        if (residentPosition === 0) {
          const geometries = [
            new THREE.IcosahedronGeometry(0.34, 1),
            new THREE.CapsuleGeometry(0.15, 0.42, 3, 6),
            new THREE.TorusGeometry(0.3, 0.055, 5, 12),
            new THREE.BoxGeometry(0.46, 0.3, 0.4),
            new THREE.ConeGeometry(0.3, 0.5, 6),
          ];
          const familyFor = (shape: Curio["shape"]) => {
            if (["fiber", "object", "chair", "car"].includes(shape)) return 1;
            if (["atom", "molecule", "system", "galaxy"].includes(shape)) return 2;
            if (shape === "house") return 3;
            if (["mountain", "planet", "star", "universe"].includes(shape)) return 4;
            return 0;
          };
          const count = reducedWorldDetail() ? 52 : 84;
          const families = geometries.map(() => [] as number[]);
          for (let item = 0; item < count; item += 1) {
            const curio = era.curios[item % era.curios.length];
            families[familyFor(curio.shape)].push(item);
          }
          const dummy = new THREE.Object3D();
          families.forEach((items, family) => {
            if (items.length === 0) {
              geometries[family].dispose();
              return;
            }
            const material = new THREE.MeshToonMaterial({
              color: "#ffffff",
              vertexColors: true,
              transparent: true,
              opacity: 0.76,
            });
            const instances = new THREE.InstancedMesh(
              geometries[family],
              material,
              items.length,
            );
            items.forEach((item, instance) => {
              const curio = era.curios[item % era.curios.length];
              const angle = pseudo(layer * 379 + item * 17.3) * Math.PI * 2;
              const radius = 2.4 + pseudo(layer * 113 + item * 5.7) * 66;
              dummy.position.set(
                Math.cos(angle) * radius,
                0.07 + pseudo(item * 2.1) * 0.035,
                Math.sin(angle) * radius,
              );
              dummy.rotation.set(
                pseudo(item + 31) * 0.45,
                pseudo(item + 47) * Math.PI * 2,
                pseudo(item + 71) * 0.45,
              );
              const scale = 0.62 + pseudo(item + layer * 23) * 0.8;
              dummy.scale.setScalar(scale);
              dummy.updateMatrix();
              instances.setMatrixAt(instance, dummy.matrix);
              instances.setColorAt(
                instance,
                new THREE.Color(curio.color).lerp(
                  new THREE.Color(era.palette[2]),
                  0.22,
                ),
              );
            });
            instances.instanceMatrix.needsUpdate = true;
            if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
            instances.receiveShadow = false;
            instances.castShadow = false;
            substrateGroup.add(instances);
          });
          return;
        }

        const positions: number[] = [];
        const colors: number[] = [];
        const count = reducedWorldDetail() ? 260 : 420;
        const color = new THREE.Color(era.palette[2]);
        for (let point = 0; point < count; point += 1) {
          const angle = pseudo(layer * 317 + point * 11.3) * Math.PI * 2;
          const radius = 1.8 + pseudo(layer * 97 + point * 7.1) * 72;
          positions.push(
            Math.cos(angle) * radius,
            0.018 - depth * 0.002,
            Math.sin(angle) * radius,
          );
          const faded = color
            .clone()
            .lerp(new THREE.Color("#fff4d6"), 0.18 + depth * 0.08);
          colors.push(faded.r, faded.g, faded.b);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        substrateGroup.add(
          new THREE.Points(
            geometry,
            new THREE.PointsMaterial({
              size: 0.045,
              transparent: true,
              opacity: 0.34,
              vertexColors: true,
              depthWrite: false,
            }),
          ),
        );
      });

      addPeriodicSubstrateCopies(
        substrateGroup,
        worldChunkSize(activeWorldKind),
      );
      semanticResidencyKey = substrateKeyFor(viewScale);
    };

    const playerRoot = new THREE.Group();
    const rollGroup = new THREE.Group();
    const mashGroup = new THREE.Group();
    playerRoot.add(rollGroup);
    rollGroup.add(mashGroup);
    scene.add(playerRoot);

    const makeBallFaceTexture = (reaction = false) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d")!;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.fillStyle = "rgba(255, 131, 178, .72)";
      context.beginPath();
      context.ellipse(55, 154, 26, 14, -0.12, 0, Math.PI * 2);
      context.ellipse(201, 154, 26, 14, 0.12, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#26143a";
      if (reaction) {
        context.lineWidth = 15;
        context.strokeStyle = "#26143a";
        context.beginPath();
        context.arc(86, 104, 24, 0.12, Math.PI - 0.12);
        context.arc(170, 104, 24, 0.12, Math.PI - 0.12);
        context.stroke();
        context.beginPath();
        context.ellipse(128, 166, 30, 36, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#ff8ab8";
        context.beginPath();
        context.ellipse(128, 180, 17, 10, 0, 0, Math.PI * 2);
        context.fill();
      } else {
        [88, 168].forEach((x) => {
          context.beginPath();
          context.ellipse(x, 106, 19, 27, 0, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = "#ffffff";
          context.beginPath();
          context.arc(x - 6, 97, 6, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = "#26143a";
        });
        context.lineWidth = 14;
        context.strokeStyle = "#26143a";
        context.beginPath();
        context.arc(128, 142, 38, 0.15, Math.PI - 0.15);
        context.stroke();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    const happyFaceTexture = makeBallFaceTexture();
    const chompFaceTexture = makeBallFaceTexture(true);
    const ballFaceMaterial = new THREE.SpriteMaterial({
      map: happyFaceTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const ballFace = new THREE.Sprite(ballFaceMaterial);
    ballFace.renderOrder = 50;
    playerRoot.add(ballFace);
    let faceReactionUntil = 0;

    const coreMaterial = new THREE.MeshPhysicalMaterial({
      color: early ? activeEra.palette[2] : 0xffb83e,
      emissive: early ? activeEra.palette[2] : 0x5b1629,
      emissiveIntensity: early ? 1.35 : 0.18,
      roughness: early ? 0.18 : 0.62,
      metalness: early ? 0.05 : 0,
      transmission: activeEra.realm === "prephysical" ? 0.42 : 0,
      transparent: activeEra.realm === "prephysical",
      opacity: activeEra.realm === "prephysical" ? 0.78 : 1,
      clearcoat: 0.65,
      clearcoatRoughness: 0.2,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 6), coreMaterial);
    core.castShadow = !early;
    core.receiveShadow = !early;
    rollGroup.add(core);

    const innerGlowMaterial = new THREE.MeshBasicMaterial({
      color: activeEra.palette[2],
      transparent: true,
      opacity: early ? 0.18 : 0.06,
      side: THREE.BackSide,
    });
    const innerGlow = new THREE.Mesh(new THREE.SphereGeometry(1.12, 32, 24), innerGlowMaterial);
    core.add(innerGlow);

    const foamCluster = new THREE.Group();
    const foamMaterials: THREE.MeshPhysicalMaterial[] = [];
    for (let index = 0; index < 6; index += 1) {
      const foamMaterial = coreMaterial.clone();
      foamMaterial.opacity = 0.48;
      foamMaterial.transparent = true;
      foamMaterial.depthWrite = false;
      foamMaterials.push(foamMaterial);
      const lobe = new THREE.Mesh(
        new THREE.SphereGeometry(0.25 + pseudo(index + 4) * 0.18, 18, 14),
        foamMaterial,
      );
      const angle = (index / 6) * Math.PI * 2;
      lobe.position.set(
        Math.cos(angle) * (0.5 + pseudo(index + 11) * 0.18),
        (pseudo(index + 21) - 0.42) * 0.7,
        Math.sin(angle) * (0.5 + pseudo(index + 31) * 0.18),
      );
      foamCluster.add(lobe);
    }
    rollGroup.add(foamCluster);

    type EnvironmentMode = LegacyVisualStage;

    const environmentModeFor = (index: number): EnvironmentMode =>
      worldSpecForEra(ERAS[index].name).legacyStage;

    const environmentNames: Record<EnvironmentMode, string> = {
      quantum: "the quantum void",
      micro: "a microscopic sea",
      room: "a very rollable house",
      neighborhood: "the neighborhood",
      planet: "a whole curved world",
      cosmic: "deep space",
    };

    let environmentMode = environmentModeFor(activeIndex);
    let activeWorldKind = worldSpecForEra(activeEra.name).kind;
    let eraTransitionAge = 99;

    const disposeEnvironment = () => {
      environmentGroup.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Points ||
          object instanceof THREE.Line
        ) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      environmentGroup.clear();
      sceneryColliders = [];
    };

    const addScenery = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      position: [number, number, number],
      rotation: [number, number, number] = [0, 0, 0],
      scale: [number, number, number] = [1, 1, 1],
      parent: THREE.Object3D = environmentGroup,
    ) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      mesh.scale.set(...scale);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      parent.add(mesh);
      return mesh;
    };

    const addSceneryCollider = (
      x: number,
      z: number,
      halfWidth: number,
      halfDepth: number,
    ) => {
      sceneryColliders.push({ x, z, halfWidth, halfDepth });
    };

    const sceneryToon = (color: THREE.ColorRepresentation) =>
      new THREE.MeshToonMaterial({ color });

    const sceneryGlow = (
      color: THREE.ColorRepresentation,
      opacity = 0.45,
      wireframe = false,
    ) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        wireframe,
        depthWrite: false,
      });

    const addStarField = (count: number, radius: number, seed: number) => {
      const positions: number[] = [];
      const colors: number[] = [];
      const warm = new THREE.Color("#ffd6f3");
      const cool = new THREE.Color("#b4f4ff");
      for (let index = 0; index < count; index += 1) {
        const theta = pseudo(index * 4.73 + seed) * Math.PI * 2;
        const phi = Math.acos(2 * pseudo(index * 7.17 + seed + 4) - 1);
        const distance = radius * (0.42 + pseudo(index * 8.91 + seed + 9) * 0.58);
        positions.push(
          Math.sin(phi) * Math.cos(theta) * distance,
          Math.cos(phi) * distance,
          Math.sin(phi) * Math.sin(theta) * distance,
        );
        const color = warm.clone().lerp(cool, pseudo(index * 3.39 + seed));
        colors.push(color.r, color.g, color.b);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({
        size: reducedWorldDetail() ? 0.17 : 0.22,
        transparent: true,
        opacity: 0.88,
        vertexColors: true,
        depthWrite: false,
      });
      environmentGroup.add(new THREE.Points(geometry, material));
    };

    let groundTexture: THREE.CanvasTexture | null = null;
    let coreSurfaceTexture: THREE.CanvasTexture | null = null;

    const makeScalePatternTexture = (index: number, forCore = false) => {
      const visualIndex = legacyVisualIndexForEra(index);
      const canvas = document.createElement("canvas");
      canvas.width = forCore ? 384 : 512;
      canvas.height = forCore ? 384 : 512;
      const context = canvas.getContext("2d")!;
      const size = canvas.width;
      const palette = ERAS[index].palette;
      const base = new THREE.Color(palette[1]).lerp(
        new THREE.Color(forCore ? "#fff0c7" : "#d8f2e4"),
        forCore ? 0.36 : 0.18,
      );
      const ink = new THREE.Color(palette[2]).lerp(
        new THREE.Color("#ffffff"),
        0.2,
      );
      const shadow = new THREE.Color(palette[0]).lerp(
        new THREE.Color("#20102e"),
        0.3,
      );
      const inkRgba = (alpha: number) =>
        `rgba(${Math.round(ink.r * 255)}, ${Math.round(ink.g * 255)}, ${Math.round(ink.b * 255)}, ${alpha})`;
      context.fillStyle = base.getStyle();
      context.fillRect(0, 0, size, size);
      context.lineCap = "round";
      context.lineJoin = "round";

      const dot = (x: number, y: number, radius: number, color = ink.getStyle()) => {
        context.fillStyle = color;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      };

      if (visualIndex <= 1) {
        for (let motif = 0; motif < 44; motif += 1) {
          const x = pseudo(motif + index * 17) * size;
          const y = pseudo(motif * 3.7 + index * 31) * size;
          const radius = 5 + pseudo(motif * 6.1) * 24;
          context.strokeStyle = motif % 2 ? ink.getStyle() : "#a8efff";
          context.globalAlpha = 0.18 + pseudo(motif + 7) * 0.28;
          context.lineWidth = 2 + pseudo(motif + 9) * 5;
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.stroke();
        }
      } else if (visualIndex <= 3) {
        for (let motif = 0; motif < 72; motif += 1) {
          const x = pseudo(motif * 2.3 + index) * size;
          const y = pseudo(motif * 5.9 + index) * size;
          const colors = ["#ff667d", "#63b8ff", "#ffe36c"];
          dot(x, y, 2.5 + pseudo(motif) * 7, colors[motif % 3]);
          if (motif % 3 === 0) {
            context.strokeStyle = ink.getStyle();
            context.globalAlpha = 0.28;
            context.lineWidth = 2;
            context.beginPath();
            context.arc(x, y, 12 + pseudo(motif + 4) * 16, 0, Math.PI * 2);
            context.stroke();
          }
        }
      } else if (visualIndex === 4) {
        for (let cloud = 0; cloud < 34; cloud += 1) {
          const x = pseudo(cloud * 4.7) * size;
          const y = pseudo(cloud * 8.2) * size;
          const radius = 10 + pseudo(cloud + 4) * 25;
          const gradient = context.createRadialGradient(x, y, 1, x, y, radius);
          gradient.addColorStop(0, inkRgba(0.8));
          gradient.addColorStop(0.35, inkRgba(0.34));
          gradient.addColorStop(1, inkRgba(0));
          context.fillStyle = gradient;
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
          dot(x, y, 2.5, "#fff3a5");
        }
      } else if (visualIndex <= 6) {
        context.strokeStyle = shadow.getStyle();
        context.globalAlpha = 0.34;
        context.lineWidth = visualIndex === 5 ? 5 : 8;
        for (let chain = 0; chain < 24; chain += 1) {
          const x = pseudo(chain * 4.3) * size;
          const y = pseudo(chain * 9.7) * size;
          const angle = pseudo(chain + 11) * Math.PI * 2;
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x + Math.cos(angle) * 45, y + Math.sin(angle) * 45);
          context.stroke();
          dot(x, y, 6 + (chain % 3) * 2);
          dot(
            x + Math.cos(angle) * 45,
            y + Math.sin(angle) * 45,
            5 + ((chain + 1) % 3) * 2,
            chain % 2 ? "#fff0b2" : ink.getStyle(),
          );
        }
      } else if (visualIndex === 7) {
        for (let cell = 0; cell < 26; cell += 1) {
          const x = pseudo(cell * 6.7) * size;
          const y = pseudo(cell * 2.9) * size;
          const radius = 12 + pseudo(cell + 5) * 24;
          context.strokeStyle = cell % 2 ? ink.getStyle() : "#f4b4dd";
          context.globalAlpha = 0.38;
          context.lineWidth = 5;
          context.beginPath();
          context.ellipse(x, y, radius * 1.3, radius, pseudo(cell) * Math.PI, 0, Math.PI * 2);
          context.stroke();
          dot(x + radius * 0.2, y, radius * 0.22, shadow.getStyle());
        }
      } else if (visualIndex === 8) {
        context.globalAlpha = 0.38;
        context.lineWidth = 6;
        for (let fiber = -8; fiber < 18; fiber += 1) {
          context.strokeStyle = fiber % 3 ? ink.getStyle() : "#fff2c5";
          context.beginPath();
          context.moveTo(-40, fiber * 28);
          context.bezierCurveTo(120, fiber * 28 + 45, 360, fiber * 28 - 45, size + 40, fiber * 28 + 8);
          context.stroke();
        }
      } else if (visualIndex === 9) {
        for (let speck = 0; speck < 620; speck += 1) {
          dot(
            pseudo(speck * 3.71) * size,
            pseudo(speck * 8.33) * size,
            0.5 + pseudo(speck + 9) * 3.2,
            speck % 5 ? shadow.getStyle() : ink.getStyle(),
          );
        }
      } else if (visualIndex <= 11) {
        context.globalAlpha = 0.34;
        for (let grain = 0; grain < 28; grain += 1) {
          context.strokeStyle = grain % 2 ? shadow.getStyle() : ink.getStyle();
          context.lineWidth = 2 + (grain % 4);
          context.beginPath();
          const y = grain * 20 + pseudo(grain) * 8;
          context.moveTo(0, y);
          context.bezierCurveTo(size * 0.3, y - 12, size * 0.7, y + 15, size, y - 3);
          context.stroke();
        }
      } else {
        context.globalAlpha = 0.32;
        context.strokeStyle = shadow.getStyle();
        context.lineWidth = visualIndex === 12 ? 5 : 3;
        const step = visualIndex === 12 ? 64 : 38;
        for (let line = 0; line <= size; line += step) {
          context.beginPath();
          context.moveTo(line, 0);
          context.lineTo(line, size);
          context.moveTo(0, line);
          context.lineTo(size, line);
          context.stroke();
        }
      }

      if (!forCore && index > 0) {
        for (let layer = 0; layer < index; layer += 1) {
          const buriedColor = new THREE.Color(ERAS[layer].palette[2])
            .lerp(base, 0.38)
            .getStyle();
          context.globalAlpha = Math.max(0.035, 0.15 - layer * 0.003);
          for (let trace = 0; trace < 7; trace += 1) {
            dot(
              pseudo(layer * 97 + trace * 13.1) * size,
              pseudo(layer * 151 + trace * 7.7) * size,
              0.7 + pseudo(layer * 31 + trace) * 1.8,
              buriedColor,
            );
          }
        }
      }

      context.globalAlpha = 1;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(
        forCore ? 1.8 : visualIndex <= 8 ? 22 : 12,
        forCore ? 1.8 : visualIndex <= 8 ? 22 : 12,
      );
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return texture;
    };

    const applyGroundScaleTexture = (viewScale: number) => {
      groundTexture?.dispose();
      const visibleFoundation = Math.max(0, Math.ceil(viewScale) - 1);
      groundTexture = makeScalePatternTexture(visibleFoundation);
      groundMaterial.map = groundTexture;
      groundMaterial.needsUpdate = true;
    };

    const applyScaleTextures = (index: number) => {
      applyGroundScaleTexture(index);
      coreSurfaceTexture?.dispose();
      coreSurfaceTexture = makeScalePatternTexture(index, true);
      coreMaterial.map = coreSurfaceTexture;
      coreMaterial.needsUpdate = true;
    };

    const addEraSignature = (index: number) => {
      const visualIndex = legacyVisualIndexForEra(index);
      if (visualIndex === 0) {
        for (let bubble = 0; bubble < 18; bubble += 1) {
          addScenery(
            new THREE.SphereGeometry(0.6 + pseudo(bubble) * 2.2, 18, 12),
            sceneryGlow(bubble % 2 ? "#ff73ca" : "#75e8ff", 0.1, true),
            [
              (pseudo(bubble * 3.7) - 0.5) * 54,
              1.5 + pseudo(bubble * 8.1) * 15,
              (pseudo(bubble * 5.2) - 0.5) * 56,
            ],
          );
        }
      } else if (visualIndex === 1) {
        [-16, 0, 16].forEach((x, plane) => {
          addScenery(
            new THREE.PlaneGeometry(22, 22, 9, 9),
            sceneryGlow(plane === 1 ? "#67ddff" : "#a993ff", 0.13, true),
            [x, 8 + plane * 2, -28 - plane * 5],
            [0.15, plane * 0.45, 0],
          );
        });
      } else if (visualIndex === 2) {
        for (let knot = 0; knot < 12; knot += 1) {
          const angle = (knot / 12) * Math.PI * 2;
          addScenery(
            new THREE.TorusKnotGeometry(1.2 + (knot % 3) * 0.45, 0.09, 72, 7, 2, 3),
            sceneryGlow(["#ff5575", "#57a7ff", "#ffd94f"][knot % 3], 0.5),
            [Math.cos(angle) * 28, 3 + (knot % 4) * 2.2, Math.sin(angle) * 28],
            [pseudo(knot) * Math.PI, pseudo(knot + 8) * Math.PI, 0],
          );
        }
      } else if (visualIndex === 3) {
        for (let cluster = 0; cluster < 13; cluster += 1) {
          const angle = (cluster / 13) * Math.PI * 2;
          const parent = new THREE.Group();
          parent.position.set(Math.cos(angle) * 31, 3 + (cluster % 4) * 2, Math.sin(angle) * 31);
          environmentGroup.add(parent);
          [
            [-0.7, 0.2, 0.1],
            [0.7, 0.2, -0.1],
            [0, -0.65, 0],
          ].forEach((position, part) => {
            addScenery(
              new THREE.SphereGeometry(0.72, 18, 12),
              sceneryGlow(["#ff657c", "#62aaff", "#ffe06b"][part], 0.5),
              position as [number, number, number],
              [0, 0, 0],
              [1, 1, 1],
              parent,
            );
          });
        }
      } else if (visualIndex === 4) {
        for (let cloud = 0; cloud < 16; cloud += 1) {
          const angle = (cloud / 16) * Math.PI * 2;
          addScenery(
            new THREE.SphereGeometry(1.5 + (cloud % 3) * 0.7, 20, 14),
            sceneryGlow(cloud % 2 ? "#6ee8be" : "#b9fff0", 0.12, true),
            [Math.cos(angle) * 31, 2 + (cloud % 5) * 1.7, Math.sin(angle) * 31],
            [0, cloud * 0.3, 0],
            [1.4, 0.75 + (cloud % 2) * 0.35, 1],
          );
        }
      } else if (visualIndex === 5) {
        for (let molecule = 0; molecule < 18; molecule += 1) {
          const angle = (molecule / 18) * Math.PI * 2;
          const parent = new THREE.Group();
          parent.position.set(Math.cos(angle) * 30, 2.5 + (molecule % 4), Math.sin(angle) * 30);
          parent.rotation.set(pseudo(molecule), pseudo(molecule + 3) * Math.PI, pseudo(molecule + 9));
          environmentGroup.add(parent);
          for (let atom = 0; atom < 4; atom += 1) {
            addScenery(
              new THREE.SphereGeometry(0.34 + atom * 0.05, 14, 10),
              sceneryGlow(atom % 2 ? "#f7f0c6" : activeEra.palette[2], 0.62),
              [(atom - 1.5) * 0.75, Math.sin(atom * 2.2) * 0.45, 0],
              [0, 0, 0],
              [1, 1, 1],
              parent,
            );
          }
        }
      } else if (visualIndex === 6) {
        for (let helix = 0; helix < 12; helix += 1) {
          const angle = (helix / 12) * Math.PI * 2;
          addScenery(
            new THREE.TorusKnotGeometry(1.8, 0.14, 96, 8, 2, 5),
            sceneryGlow(helix % 2 ? "#ff9ac4" : "#8be8ff", 0.42),
            [Math.cos(angle) * 29, 3 + (helix % 4) * 2.1, Math.sin(angle) * 29],
            [Math.PI / 2, angle, 0],
            [0.7, 1.35, 0.7],
          );
        }
      } else if (visualIndex === 7) {
        for (let cell = 0; cell < 14; cell += 1) {
          const angle = (cell / 14) * Math.PI * 2;
          addScenery(
            new THREE.IcosahedronGeometry(2.2 + (cell % 4) * 0.45, 3),
            sceneryGlow(cell % 3 ? "#8ee69e" : "#ff8295", 0.14, true),
            [Math.cos(angle) * 30, 2.5 + (cell % 3) * 2.6, Math.sin(angle) * 30],
            [pseudo(cell), angle, pseudo(cell + 5)],
            [1.2, 0.72, 1],
          );
        }
      } else if (visualIndex === 8) {
        for (let fiber = 0; fiber < 22; fiber += 1) {
          const angle = (fiber / 22) * Math.PI * 2;
          addScenery(
            new THREE.CapsuleGeometry(0.16 + (fiber % 3) * 0.06, 5 + (fiber % 4), 5, 10),
            sceneryGlow(fiber % 3 ? "#e8dfcf" : "#f5dd54", 0.42),
            [Math.cos(angle) * (25 + (fiber % 3) * 4), 3.5, Math.sin(angle) * (25 + (fiber % 3) * 4)],
            [0.2 + pseudo(fiber) * 0.5, angle, 0.25],
          );
        }
      } else if (visualIndex === 9) {
        for (let mote = 0; mote < 38; mote += 1) {
          addScenery(
            new THREE.DodecahedronGeometry(0.14 + pseudo(mote) * 0.24, 0),
            sceneryGlow(mote % 3 ? "#f1cf83" : "#d9a2ab", 0.5),
            [
              (pseudo(mote * 4.1) - 0.5) * 48,
              0.4 + pseudo(mote * 8.3) * 7,
              (pseudo(mote * 2.7) - 0.5) * 48,
            ],
          );
        }
      } else if (visualIndex === 10) {
        addScenery(new THREE.CylinderGeometry(17, 17, 0.7, 48), sceneryToon("#b97861"), [0, -0.34, 0]);
      } else if (visualIndex === 11) {
        addScenery(new THREE.BoxGeometry(18, 9, 4), sceneryToon("#ec9d69"), [-28, 4.5, -29]);
      } else if (visualIndex === 12) {
        for (let barrier = -4; barrier <= 4; barrier += 1) {
          addScenery(new THREE.BoxGeometry(3.5, 0.5, 0.5), sceneryToon(barrier % 2 ? "#fff0d1" : "#ff7469"), [barrier * 5, 0.4, -28]);
        }
      } else if (visualIndex === 13) {
        for (let tower = 0; tower < 9; tower += 1) {
          addScenery(
            new THREE.BoxGeometry(3 + (tower % 3), 9 + (tower % 4) * 4, 3 + ((tower + 1) % 3)),
            sceneryToon(["#a9b7d0", "#ffb19f", "#91d5c4"][tower % 3]),
            [-28 + tower * 7, 4.5 + (tower % 4) * 2, -34],
          );
        }
      } else if (visualIndex === 16) {
        for (let flare = 0; flare < 9; flare += 1) {
          const angle = (flare / 9) * Math.PI * 2;
          addScenery(
            new THREE.IcosahedronGeometry(1.2 + (flare % 3) * 0.8, 3),
            sceneryGlow(["#ff765f", "#ffe374", "#78caff"][flare % 3], 0.72),
            [Math.cos(angle) * 35, 8 + (flare % 4) * 6, Math.sin(angle) * 35],
          );
        }
      } else if (visualIndex === 17) {
        [13, 22, 34, 48].forEach((radius, orbit) => {
          addScenery(
            new THREE.TorusGeometry(radius, 0.04 + orbit * 0.015, 5, 96),
            sceneryGlow(orbit % 2 ? "#bca6ff" : "#8ce9ff", 0.24),
            [0, 6 + orbit * 2, 0],
            [Math.PI / 2 + orbit * 0.12, orbit * 0.35, 0],
          );
        });
      }
    };

    const buildEnvironment = (index: number) => {
      disposeEnvironment();
      applyScaleTextures(index);
      environmentMode = environmentModeFor(index);
      activeWorldKind = worldSpecForEra(ERAS[index].name).kind;
      ground.visible = true;
      grid.visible = false;
      dustField.visible = true;
      environmentGroup.rotation.set(0, 0, 0);

      if (
        activeWorldKind === "void" ||
        activeWorldKind === "particle-field"
      ) {
        const voidColor = deepColor.clone().multiplyScalar(0.54);
        scene.background = voidColor;
        scene.fog = new THREE.FogExp2(voidColor, 0.009);
        ground.visible = false;
        dustMaterial.size = 0.13;
        dustMaterial.opacity = 0.82;
        hemisphere.intensity = 1.55;
        keyLight.intensity = 1.6;
        addStarField(reducedWorldDetail() ? 150 : 240, 72, index + 2);
        if (activeWorldKind === "particle-field") {
          const foamCount = reducedWorldDetail() ? 72 : 110;
          const foam = new THREE.InstancedMesh(
            new THREE.IcosahedronGeometry(0.42, 1),
            sceneryGlow(activeEra.palette[2], 0.2, true),
            foamCount,
          );
          const dummy = new THREE.Object3D();
          for (let cell = 0; cell < foamCount; cell += 1) {
            const angle = pseudo(cell * 5.17 + index) * Math.PI * 2;
            const radius = 2 + pseudo(cell * 8.73 + index) * 58;
            dummy.position.set(
              Math.cos(angle) * radius,
              -0.2 + pseudo(cell * 3.11 + 8) * 5.4,
              Math.sin(angle) * radius,
            );
            dummy.rotation.set(
              pseudo(cell + 7),
              pseudo(cell + 13) * Math.PI,
              pseudo(cell + 19),
            );
            dummy.scale.setScalar(0.5 + pseudo(cell + 23) * 1.8);
            dummy.updateMatrix();
            foam.setMatrixAt(cell, dummy.matrix);
          }
          foam.instanceMatrix.needsUpdate = true;
          environmentGroup.add(foam);
        }
        for (let ring = 0; ring < 11; ring += 1) {
          const radius = 1.8 + pseudo(ring + 17) * 5.2;
          addScenery(
            new THREE.TorusGeometry(radius, 0.025 + pseudo(ring + 5) * 0.05, 5, 42),
            sceneryGlow(ring % 2 ? activeEra.palette[2] : "#baf8ff", 0.22 + pseudo(ring) * 0.2),
            [
              (pseudo(ring + 31) - 0.5) * 40,
              2.5 + pseudo(ring + 41) * 13,
              (pseudo(ring + 51) - 0.5) * 44,
            ],
            [
              pseudo(ring + 61) * Math.PI,
              pseudo(ring + 71) * Math.PI,
              pseudo(ring + 81) * Math.PI,
            ],
          );
        }
        for (let bubble = 0; bubble < 8; bubble += 1) {
          addScenery(
            new THREE.IcosahedronGeometry(0.8 + pseudo(bubble + 90) * 2.4, 2),
            sceneryGlow(activeEra.palette[2], 0.09, true),
            [
              (pseudo(bubble + 101) - 0.5) * 36,
              3 + pseudo(bubble + 111) * 10,
              (pseudo(bubble + 121) - 0.5) * 38,
            ],
          );
        }
        addEraSignature(index);
        return;
      }

      if (
        activeWorldKind === "microscopic-sea" ||
        activeWorldKind === "fiber-bed"
      ) {
        const seaColor = new THREE.Color("#062e39").lerp(deepColor, 0.35);
        scene.background = seaColor;
        scene.fog = new THREE.FogExp2(seaColor, 0.018);
        groundMaterial.color.set("#174f55");
        dustMaterial.size = 0.085;
        dustMaterial.opacity = 0.5;
        hemisphere.intensity = 1.4;
        keyLight.intensity = 2;
        for (let cell = 0; cell < 16; cell += 1) {
          const angle = (cell / 16) * Math.PI * 2 + pseudo(cell + 4) * 0.4;
          const distance = 20 + pseudo(cell + 22) * 24;
          const cellGroup = new THREE.Group();
          cellGroup.position.set(
            Math.cos(angle) * distance,
            2.2 + pseudo(cell + 32) * 8,
            Math.sin(angle) * distance,
          );
          cellGroup.rotation.set(
            pseudo(cell + 42),
            pseudo(cell + 52) * Math.PI,
            pseudo(cell + 62),
          );
          environmentGroup.add(cellGroup);
          addScenery(
            new THREE.IcosahedronGeometry(2.2 + pseudo(cell + 72) * 2.4, 2),
            sceneryGlow(cell % 2 ? "#62e6cb" : "#ff8ad8", 0.13, true),
            [0, 0, 0],
            [0, 0, 0],
            [1.3, 0.62, 1],
            cellGroup,
          );
          addScenery(
            new THREE.SphereGeometry(0.42, 12, 8),
            sceneryGlow("#fff2a6", 0.55),
            [0.3, 0.1, 0],
            [0, 0, 0],
            [1.2, 0.72, 1],
            cellGroup,
          );
        }
        for (let strand = 0; strand < 7; strand += 1) {
          addScenery(
            new THREE.TorusKnotGeometry(2.4, 0.08, 56, 5, 2, 3),
            sceneryGlow(strand % 2 ? "#84f7ff" : "#ffb3e1", 0.34),
            [
              (pseudo(strand + 142) - 0.5) * 48,
              3 + pseudo(strand + 152) * 7,
              (pseudo(strand + 162) - 0.5) * 48,
            ],
            [pseudo(strand) * Math.PI, pseudo(strand + 2) * Math.PI, 0],
          );
        }
        addEraSignature(index);
        return;
      }

      if (
        activeWorldKind === "dust-surface" ||
        activeWorldKind === "tabletop"
      ) {
        const tabletop = activeWorldKind === "tabletop";
        scene.background = new THREE.Color(tabletop ? "#f3bfd0" : "#efc9ad");
        scene.fog = new THREE.FogExp2(
          tabletop ? 0xf3bfd0 : 0xefc9ad,
          tabletop ? 0.009 : 0.013,
        );
        groundMaterial.color.set(tabletop ? "#9d684d" : "#a96f52");
        dustMaterial.size = tabletop ? 0.04 : 0.052;
        dustMaterial.opacity = tabletop ? 0.14 : 0.22;
        hemisphere.intensity = 1.28;
        keyLight.intensity = 2.55;

        if (tabletop) {
          addScenery(
            new THREE.CylinderGeometry(72, 72, 1.5, 64),
            sceneryToon("#a96b4e"),
            [0, -0.78, 0],
          );
          [-34, 34].forEach((x) => {
            [-31, 31].forEach((z) => {
              addScenery(
                new THREE.BoxGeometry(5, 34, 5),
                sceneryToon("#744737"),
                [x, -17.7, z],
              );
            });
          });
          addScenery(
            new THREE.BoxGeometry(18, 0.6, 13),
            sceneryToon("#e6d9bd"),
            [31, 0.55, -25],
            [0, -0.24, 0],
          );
          addScenery(
            new THREE.CylinderGeometry(4.7, 4.7, 7, 32, 1, true),
            sceneryToon("#71b8cc"),
            [-29, 3.5, -27],
          );
          addSceneryCollider(31, -25, 9, 6.5);
          addSceneryCollider(-29, -27, 5.2, 5.2);
        } else {
          for (let board = -11; board <= 11; board += 1) {
            addScenery(
              new THREE.BoxGeometry(170, 0.025, 0.09),
              sceneryToon(board % 2 ? "#754a3e" : "#cf9070"),
              [0, 0.025, board * 7.2],
            );
          }
          addScenery(
            new THREE.PlaneGeometry(170, 42),
            sceneryToon("#f6d7c0"),
            [0, 21, -70],
          );
          addScenery(
            new THREE.BoxGeometry(170, 0.7, 0.6),
            sceneryToon("#fff0df"),
            [0, 0.35, -69.6],
          );
          [-48, 48].forEach((x) => {
            addScenery(
              new THREE.CylinderGeometry(3.6, 4.2, 32, 12),
              sceneryToon("#73504a"),
              [x, 16, -47],
            );
          });
        }
        addEraSignature(index);
        return;
      }

      if (activeWorldKind === "interior") {
        scene.background = new THREE.Color("#f6b8cb");
        scene.fog = new THREE.FogExp2(0xf6b8cb, 0.012);
        groundMaterial.color.set("#9a5d57");
        dustMaterial.size = 0.045;
        dustMaterial.opacity = 0.18;
        hemisphere.intensity = 1.22;
        keyLight.intensity = 2.45;
        const wallMaterial = sceneryToon("#ffd8c8");
        addScenery(new THREE.PlaneGeometry(92, 30), wallMaterial, [0, 15, -40]);
        addScenery(
          new THREE.PlaneGeometry(86, 30),
          sceneryToon("#f7c4b8"),
          [-46, 15, 0],
          [0, Math.PI / 2, 0],
        );
        addScenery(
          new THREE.PlaneGeometry(86, 30),
          sceneryToon("#f7c4b8"),
          [46, 15, 0],
          [0, -Math.PI / 2, 0],
        );
        addSceneryCollider(-46, 0, 0.45, 43);
        addSceneryCollider(46, 0, 0.45, 43);
        addSceneryCollider(0, -40, 46, 0.45);
        for (let board = -8; board <= 8; board += 1) {
          addScenery(
            new THREE.BoxGeometry(92, 0.025, 0.08),
            sceneryToon(board % 2 ? "#7d4948" : "#b87568"),
            [0, 0.025, board * 4.7],
          );
        }
        addScenery(
          new THREE.PlaneGeometry(14, 11),
          sceneryToon("#89d9ed"),
          [-16, 17, -39.8],
        );
        addScenery(new THREE.BoxGeometry(15.2, 0.45, 0.25), sceneryToon("#fff5dd"), [-16, 17, -39.5]);
        addScenery(new THREE.BoxGeometry(0.45, 12, 0.25), sceneryToon("#fff5dd"), [-16, 17, -39.5]);
        addScenery(
          new THREE.BoxGeometry(15, 0.5, 0.5),
          sceneryToon("#fff5dd"),
          [-16, 11.6, -39.2],
        );
        const furniture = new THREE.Group();
        furniture.position.set(25, 0, -26);
        environmentGroup.add(furniture);
        addScenery(new THREE.BoxGeometry(13, 1.1, 8), sceneryToon("#6f3c68"), [0, 8.5, 0], [0, 0, 0], [1, 1, 1], furniture);
        [-5, 5].forEach((x) => {
          [-2.8, 2.8].forEach((z) => {
            addScenery(new THREE.BoxGeometry(0.8, 8, 0.8), sceneryToon("#56304f"), [x, 4.2, z], [0, 0, 0], [1, 1, 1], furniture);
          });
        });
        addSceneryCollider(25, -26, 6.8, 4.4);
        addScenery(
          new THREE.BoxGeometry(120, 0.05, 48),
          sceneryToon("#76a968"),
          [0, 0.035, 65],
        );
        addScenery(
          new THREE.BoxGeometry(120, 0.06, 12),
          sceneryToon("#4d5561"),
          [0, 0.08, 83],
        );
        [-11.5, 11.5].forEach((x) => {
          addScenery(
            new THREE.BoxGeometry(1.1, 12, 1.1),
            sceneryToon("#fff0df"),
            [x, 6, 39],
          );
        });
        addScenery(
          new THREE.BoxGeometry(24, 1.1, 1.1),
          sceneryToon("#fff0df"),
          [0, 11.5, 39],
        );
        [-32, 32].forEach((x, house) => {
          addScenery(
            new THREE.BoxGeometry(18, 12, 14),
            sceneryToon(house ? "#a8d2df" : "#ffd1ac"),
            [x, 6, 104],
          );
          addScenery(
            new THREE.ConeGeometry(13, 6, 4),
            sceneryToon("#72485a"),
            [x, 15, 104],
            [0, Math.PI / 4, 0],
          );
        });
        addEraSignature(index);
        return;
      }

      if (activeWorldKind === "yard") {
        scene.background = new THREE.Color("#82d7f3");
        scene.fog = new THREE.FogExp2(0x82d7f3, 0.009);
        groundMaterial.color.set(
          activeEra.name === "Vehicle Yard" ? "#779667" : "#6ea25c",
        );
        dustMaterial.size = 0.035;
        dustMaterial.opacity = 0.12;
        hemisphere.intensity = 1.55;
        keyLight.intensity = 2.8;
        addScenery(new THREE.BoxGeometry(13, 0.08, 190), sceneryToon("#49515f"), [0, 0.08, 0]);
        addScenery(new THREE.BoxGeometry(190, 0.07, 13), sceneryToon("#535967"), [0, 0.075, 0]);
        for (let dash = -7; dash <= 7; dash += 1) {
          addScenery(new THREE.BoxGeometry(0.22, 0.025, 3.3), sceneryToon("#ffe894"), [0, 0.14, dash * 8]);
          addScenery(new THREE.BoxGeometry(3.3, 0.025, 0.22), sceneryToon("#ffe894"), [dash * 8, 0.14, 0]);
        }
        for (let house = 0; house < 8; house += 1) {
          // Diagonal placement leaves the connected north/south/east/west
          // streets as explicit gateways even at the largest roll envelope.
          const angle = (house / 8) * Math.PI * 2 + Math.PI / 8;
          const distance = 32 + (house % 3) * 5;
          const houseGroup = new THREE.Group();
          houseGroup.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
          houseGroup.rotation.y = -angle + Math.PI / 2;
          environmentGroup.add(houseGroup);
          const houseColor = ["#ffafbd", "#ffd67d", "#94d8c5", "#bea7ef"][house % 4];
          addScenery(new THREE.BoxGeometry(7.8, 6.4, 6.8), sceneryToon(houseColor), [0, 3.2, 0], [0, 0, 0], [1, 1, 1], houseGroup);
          addScenery(new THREE.ConeGeometry(5.8, 3.3, 4), sceneryToon("#71455c"), [0, 8, 0], [0, Math.PI / 4, 0], [1, 1, 1], houseGroup);
          addScenery(new THREE.BoxGeometry(1.6, 3.2, 0.15), sceneryToon("#563b65"), [0, 1.65, 3.48], [0, 0, 0], [1, 1, 1], houseGroup);
          const treeX = house % 2 ? 5.5 : -5.5;
          addScenery(new THREE.CylinderGeometry(0.45, 0.62, 4, 7), sceneryToon("#7c5138"), [treeX, 2, 0], [0, 0, 0], [1, 1, 1], houseGroup);
          addScenery(new THREE.IcosahedronGeometry(2.1, 1), sceneryToon("#45a957"), [treeX, 5.1, 0], [0, 0, 0], [1, 1, 1], houseGroup);
          addScenery(
            new THREE.BoxGeometry(3.2, 0.035, 12),
            sceneryToon("#d9ccb6"),
            [0, 0.11, 9],
            [0, 0, 0],
            [1, 1, 1],
            houseGroup,
          );
          addSceneryCollider(
            houseGroup.position.x,
            houseGroup.position.z,
            4.8,
            4.8,
          );
        }
        addEraSignature(index);
        return;
      }

      if (activeWorldKind === "city") {
        scene.background = new THREE.Color("#88cde7");
        scene.fog = new THREE.FogExp2(0x88cde7, 0.0065);
        groundMaterial.color.set("#768b7b");
        dustMaterial.size = 0.026;
        dustMaterial.opacity = 0.08;
        hemisphere.intensity = 1.45;
        keyLight.intensity = 2.85;

        const roadCenters = [-64, -32, 0, 32, 64];
        roadCenters.forEach((position) => {
          addScenery(
            new THREE.BoxGeometry(10, 0.055, 180),
            sceneryToon("#404a55"),
            [position, 0.075, 0],
          );
          addScenery(
            new THREE.BoxGeometry(180, 0.05, 10),
            sceneryToon("#46505a"),
            [0, 0.07, position],
          );
        });

        const blockCenters = [-48, -16, 16, 48];
        const buildingGroups = ["#a7b7cc", "#efad9e", "#9fc7b4"].map(
          (color) =>
            new THREE.InstancedMesh(
              new THREE.BoxGeometry(1, 1, 1),
              sceneryToon(color),
              16,
            ),
        );
        const buildingCounts = [0, 0, 0];
        const dummy = new THREE.Object3D();
        blockCenters.forEach((x, column) => {
          blockCenters.forEach((z, row) => {
            addScenery(
              new THREE.BoxGeometry(22, 0.09, 22),
              sceneryToon("#d7d0bd"),
              [x, 0.1, z],
            );
            const slot = column * blockCenters.length + row;
            if (slot % 7 === 0) {
              addScenery(
                new THREE.CylinderGeometry(1.1, 1.35, 5.5, 8),
                sceneryToon("#6b4a37"),
                [x, 2.75, z],
              );
              addScenery(
                new THREE.IcosahedronGeometry(3.3, 1),
                sceneryToon("#48a45b"),
                [x, 7, z],
              );
              return;
            }
            const family = slot % buildingGroups.length;
            const height = 8 + pseudo(slot + index * 41) * 27;
            dummy.position.set(x, height / 2 + 0.15, z);
            dummy.scale.set(
              10 + pseudo(slot + 13) * 5,
              height,
              10 + pseudo(slot + 29) * 5,
            );
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            buildingGroups[family].setMatrixAt(
              buildingCounts[family],
              dummy.matrix,
            );
            buildingCounts[family] += 1;
            addSceneryCollider(x, z, 7.8, 7.8);
          });
        });
        buildingGroups.forEach((buildings, family) => {
          buildings.count = buildingCounts[family];
          buildings.instanceMatrix.needsUpdate = true;
          environmentGroup.add(buildings);
        });
        addEraSignature(index);
        return;
      }

      if (activeWorldKind === "landscape") {
        scene.background = new THREE.Color("#72b9d6");
        scene.fog = new THREE.FogExp2(0x72b9d6, 0.0052);
        groundMaterial.color.set("#668f58");
        dustMaterial.size = 0.025;
        dustMaterial.opacity = 0.075;
        hemisphere.intensity = 1.55;
        keyLight.intensity = 2.9;

        const river = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-86, 0.16, -58),
          new THREE.Vector3(-44, 0.16, -12),
          new THREE.Vector3(-7, 0.16, -2),
          new THREE.Vector3(31, 0.16, 25),
          new THREE.Vector3(83, 0.16, 62),
        ]);
        addScenery(
          new THREE.TubeGeometry(river, 72, 2.8, 8, false),
          sceneryToon("#5cb9d5"),
          [0, 0, 0],
        );
        for (let ridge = 0; ridge < 24; ridge += 1) {
          const side = ridge % 2 === 0 ? -1 : 1;
          const x = -74 + (ridge % 12) * 13.5;
          const z = side * (36 + pseudo(ridge + 44) * 24);
          const height = 4 + pseudo(ridge + 63) * 10;
          addScenery(
            new THREE.ConeGeometry(
              3.5 + pseudo(ridge + 72) * 4,
              height,
              7,
            ),
            sceneryToon(ridge % 3 ? "#648161" : "#7e7c69"),
            [x, height / 2, z],
            [0, pseudo(ridge + 81) * Math.PI, 0],
          );
        }
        for (let town = 0; town < 38; town += 1) {
          const x = 38 + (town % 7) * 2.4;
          const z = -35 + Math.floor(town / 7) * 2.7;
          addScenery(
            new THREE.BoxGeometry(1.5, 0.8 + (town % 4) * 0.35, 1.5),
            sceneryToon(["#d9c5a3", "#b9c5cd", "#e2b29e"][town % 3]),
            [x, 0.5 + (town % 4) * 0.18, z],
          );
        }
        addScenery(
          new THREE.BoxGeometry(72, 0.04, 1.1),
          sceneryToon("#d9c38c"),
          [9, 0.13, 45],
          [0, -0.28, 0],
        );
        addEraSignature(index);
        return;
      }

      if (activeWorldKind === "planet-surface") {
        const gasGiant = activeEra.name === "Giant Worlds";
        const atmosphere =
          activeEra.name === "Planetary Pantry" || gasGiant;
        const skyColor = atmosphere
          ? new THREE.Color(gasGiant ? "#9d7b73" : "#3e87b7")
          : new THREE.Color("#071946");
        scene.background = skyColor;
        scene.fog = new THREE.FogExp2(skyColor, atmosphere ? 0.006 : 0.0035);
        ground.visible = false;
        dustMaterial.size = 0.04;
        dustMaterial.opacity = atmosphere ? 0.12 : 0.42;
        hemisphere.intensity = 1.25;
        keyLight.intensity = 3;
        addScenery(
          new THREE.SphereGeometry(
            80,
            reducedWorldDetail() ? 48 : 72,
            reducedWorldDetail() ? 32 : 48,
          ),
          new THREE.MeshStandardMaterial({
            color: gasGiant
              ? "#c99a6f"
              : atmosphere
                ? "#5f9d63"
                : "#3c77ad",
            roughness: 0.92,
            metalness: 0,
            flatShading: true,
          }),
          [0, -79, 0],
        );
        addScenery(
          new THREE.SphereGeometry(82.5, 42, 28),
          sceneryGlow("#8ce7ff", 0.14, true),
          [0, -79, 0],
        );
        if (gasGiant) {
          [-26, -14, 0, 15, 28].forEach((latitude, band) => {
            const radius = Math.sqrt(80 ** 2 - latitude ** 2);
            addScenery(
              new THREE.TorusGeometry(radius, band % 2 ? 1.5 : 2.4, 7, 96),
              sceneryGlow(
                ["#f2c78d", "#b86f62", "#ffe0a6"][band % 3],
                0.22,
              ),
              [0, -79 + latitude, 0],
              [Math.PI / 2, 0, 0],
            );
          });
        } else {
          for (let mountain = 0; mountain < 18; mountain += 1) {
            const angle = (mountain / 18) * Math.PI * 2;
            const distance = 27 + pseudo(mountain + 211) * 16;
            addScenery(
              new THREE.ConeGeometry(2.5 + pseudo(mountain + 221) * 2.5, 4 + pseudo(mountain + 231) * 5, 6),
              sceneryToon(mountain % 3 ? "#6a7f6d" : "#8b7891"),
              [Math.cos(angle) * distance, 2.3, Math.sin(angle) * distance],
              [0, pseudo(mountain + 241) * Math.PI, 0],
            );
          }
        }
        if (!atmosphere) {
          addStarField(reducedWorldDetail() ? 260 : 430, 100, 315);
        }
        addEraSignature(index);
        return;
      }

      scene.background = new THREE.Color("#02020e");
      scene.fog = new THREE.FogExp2(0x02020e, 0.0015);
      ground.visible = false;
      dustField.visible = false;
      hemisphere.intensity = 0.72;
      keyLight.intensity = 3.3;
      addStarField(reducedWorldDetail() ? 520 : 900, 108, index * 19);
      const galaxyCount = [
        "galaxy-field",
        "cosmic-web",
        "speculative-beyond",
      ].includes(activeWorldKind)
        ? reducedWorldDetail()
          ? 7
          : 11
        : 4;
      for (let galaxy = 0; galaxy < galaxyCount; galaxy += 1) {
        const galaxyGroup = new THREE.Group();
        const angle = (galaxy / galaxyCount) * Math.PI * 2 + 0.35;
        const distance = 31 + (galaxy % 4) * 10;
        galaxyGroup.position.set(
          Math.cos(angle) * distance,
          7 + pseudo(galaxy + 301) * 23,
          Math.sin(angle) * distance,
        );
        galaxyGroup.rotation.set(
          pseudo(galaxy + 311) * Math.PI,
          pseudo(galaxy + 321) * Math.PI,
          pseudo(galaxy + 331) * Math.PI,
        );
        environmentGroup.add(galaxyGroup);
        const galaxyColor = ["#c5b4ff", "#ffafd9", "#9ef6ff"][galaxy % 3];
        for (let ring = 0; ring < 3; ring += 1) {
          addScenery(
            new THREE.TorusGeometry(2.2 + ring * 1.1, 0.1, 5, 54),
            sceneryGlow(galaxyColor, 0.38 - ring * 0.07),
            [0, 0, 0],
            [Math.PI / 2, ring * 0.28, 0],
            [1.8, 1, 0.72],
            galaxyGroup,
          );
        }
        addScenery(new THREE.IcosahedronGeometry(0.62, 1), sceneryGlow("#fff4b0", 0.86), [0, 0, 0], [0, 0, 0], [1, 1, 1], galaxyGroup);
      }
      if (
        activeWorldKind === "cosmic-web" ||
        activeWorldKind === "speculative-beyond"
      ) {
        [42, 68, 98].forEach((radius, shell) => {
          addScenery(
            new THREE.SphereGeometry(radius, 28, 18),
            sceneryGlow(shell === 1 ? "#7c71ff" : "#ff78ca", 0.055, true),
            [0, 0, 0],
          );
        });
      }
      if (activeWorldKind === "speculative-beyond") {
        for (let bubble = 0; bubble < 9; bubble += 1) {
          const angle = (bubble / 9) * Math.PI * 2;
          addScenery(
            new THREE.SphereGeometry(5 + (bubble % 3) * 2, 18, 12),
            sceneryGlow(["#8cf3ff", "#ff85d2", "#c9a0ff"][bubble % 3], 0.12, true),
            [
              Math.cos(angle) * (28 + (bubble % 2) * 18),
              9 + (bubble % 4) * 8,
              Math.sin(angle) * (28 + (bubble % 2) * 18),
            ],
          );
        }
      }
      addEraSignature(index);
    };

    const rebuildEnvironment = (index: number) => {
      buildEnvironment(index);
      if (PERIODIC_WORLD_KINDS.has(activeWorldKind)) {
        addPeriodicEnvironmentLod(
          environmentGroup,
          worldChunkSize(activeWorldKind),
        );
      }
      centralSceneryCompact = null;
    };

    const applyEraTheme = (index: number, announce = false) => {
      activeIndex = index;
      activeEra = ERAS[index];
      if (labEra === null) game.era = index;
      early =
        activeEra.realm === "prephysical" || activeEra.realm === "particle";

      deepColor.set(activeEra.palette[0]);
      middleColor.set(activeEra.palette[1]);
      pop.set(activeEra.palette[2]);
      groundMaterial.color
        .copy(middleColor)
        .lerp(new THREE.Color("#ffdff1"), 0.18)
        .multiplyScalar(0.82);
      gridMaterials.forEach((material) => {
        if ("color" in material) {
          (material as THREE.LineBasicMaterial).color.set(activeEra.palette[2]);
        }
        material.opacity = activeEra.realm === "matter" ? 0.12 : 0.08;
      });
      hemisphere.intensity = early ? 1.5 : 1.1;
      glowLight.color.set(activeEra.palette[2]);
      dustMaterial.size = early ? 0.11 : 0.06;
      dustMaterial.opacity = early ? 0.72 : 0.35;
      coreMaterial.color.set(early ? activeEra.palette[2] : 0xffb83e);
      coreMaterial.emissive.set(early ? activeEra.palette[2] : 0x5b1629);
      coreMaterial.emissiveIntensity = early ? 1.35 : 0.18;
      coreMaterial.roughness = early ? 0.18 : 0.62;
      coreMaterial.metalness = early ? 0.05 : 0;
      coreMaterial.transmission = activeEra.realm === "prephysical" ? 0.42 : 0;
      coreMaterial.transparent = true;
      coreMaterial.needsUpdate = true;
      innerGlowMaterial.color.set(activeEra.palette[2]);
      foamMaterials.forEach((material) => {
        material.color.set(activeEra.palette[2]);
        material.emissive.set(activeEra.palette[2]);
        material.needsUpdate = true;
      });
      core.castShadow = !early;
      core.receiveShadow = !early;
      rebuildEnvironment(index);
      buildSubstrate(index);

      if (announce) {
        eraTransitionAge = 0;
        setToast(
          `ZOOMING OUT! ${activeEra.name} opens into ${WORLD_NAMES[activeWorldKind] ?? environmentNames[environmentMode]}.`,
        );
        setLastFact({
          name: activeEra.name,
          fact: activeEra.lesson,
          source: activeEra.sources[0],
        });
        ping(360 + index * 18, true);
      }
    };

    rebuildEnvironment(activeIndex);
    buildSubstrate(activeIndex);

    const createMaterial = (color: string, emissive = false) => {
      const toyColor = new THREE.Color(color).lerp(new THREE.Color("#fff4fb"), 0.08);
      return new THREE.MeshToonMaterial({
        color: toyColor,
        emissive: emissive ? color : 0x000000,
        emissiveIntensity: emissive ? 0.68 : 0,
        transparent: false,
      });
    };

    const addPart = (
      parent: THREE.Group,
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      position: [number, number, number],
      scale: [number, number, number] = [1, 1, 1],
      rotation: [number, number, number] = [0, 0, 0],
    ) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      mesh.rotation.set(...rotation);
      mesh.castShadow = !early;
      mesh.receiveShadow = !early;
      parent.add(mesh);
      return mesh;
    };

    const buildVisual = (curio: Curio, rich = true) => {
      const group = new THREE.Group();
      const identity = collectibleIdentityFor(curio.id, curio.shape);
      const curioSeed = identity.seed;
      const variant = identity.visualVariant % 4;
      const name = curio.name.toLowerCase();
      const material = createMaterial(
        curio.color,
        ["spark", "quark", "star", "galaxy", "universe"].includes(curio.shape),
      );
      const accentColor = new THREE.Color(curio.color)
        .offsetHSL((variant - 1.5) * 0.045, 0.08, 0.12)
        .getStyle();
      const accent = createMaterial(
        accentColor,
        ["spark", "quark", "star", "galaxy", "universe"].includes(curio.shape),
      );
      const dark = createMaterial("#261b38");
      const pale = createMaterial("#f6f2e8");
      const shape = curio.shape;
      const form = curio.visualForm;

      if (form === "nuclear-cluster") {
        const nucleons: [number, number, number][] = [
          [-0.32, 0.2, 0.05],
          [0.3, 0.2, -0.08],
          [-0.05, -0.26, 0.24],
          [0.08, -0.16, -0.3],
          [-0.3, -0.18, -0.18],
          [0.3, -0.14, 0.2],
        ];
        nucleons.forEach((position, index) => {
          addPart(
            group,
            new THREE.SphereGeometry(0.3, 18, 13),
            index % 2 ? material : accent,
            position,
          );
        });
        if (rich) {
          addPart(
            group,
            new THREE.IcosahedronGeometry(0.78, 2),
            sceneryGlow(curio.color, 0.16, true),
            [0, 0, 0],
          );
        }
      } else if (form === "string") {
        const stringCurve = new THREE.CatmullRomCurve3(
          Array.from({ length: 11 }, (_, point) => {
            const x = (point - 5) * 0.16;
            return new THREE.Vector3(
              x,
              Math.sin(point * 1.25) * 0.22,
              Math.cos(point * 0.72) * 0.08,
            );
          }),
        );
        addPart(
          group,
          new THREE.TubeGeometry(stringCurve, 40, 0.055, 7, false),
          material,
          [0, 0, 0],
        );
        if (rich) {
          [-0.8, 0.8].forEach((x) =>
            addPart(
              group,
              new THREE.SphereGeometry(0.12, 12, 9),
              accent,
              [x, Math.sin((x / 0.16 + 5) * 1.25) * 0.22, 0],
            ),
          );
        }
      } else if (form === "double-helix") {
        const helixPoints = (offset: number) =>
          Array.from({ length: 25 }, (_, point) => {
            const angle = (point / 24) * Math.PI * 4 + offset;
            return new THREE.Vector3(
              Math.cos(angle) * 0.32,
              (point / 24 - 0.5) * 1.55,
              Math.sin(angle) * 0.32,
            );
          });
        [0, Math.PI].forEach((offset, rail) => {
          addPart(
            group,
            new THREE.TubeGeometry(
              new THREE.CatmullRomCurve3(helixPoints(offset)),
              64,
              0.045,
              7,
              false,
            ),
            rail ? accent : material,
            [0, 0, 0],
          );
        });
        for (let rung = 1; rung < 12; rung += 2) {
          const angle = (rung / 12) * Math.PI * 4;
          addPart(
            group,
            new THREE.BoxGeometry(0.62, 0.045, 0.045),
            rung % 4 === 1 ? pale : accent,
            [0, (rung / 12 - 0.5) * 1.55, 0],
            [1, 1, 1],
            [0, -angle, 0],
          );
        }
      } else if (form === "protein") {
        addPart(
          group,
          new THREE.TorusKnotGeometry(0.43, 0.12, 72, 10, 2, 3),
          material,
          [0, 0, 0],
          [1.05, 0.82, 0.92],
          [0.45, 0.3, 0.2],
        );
        if (rich) {
          [
            [-0.44, 0.24, 0.16],
            [0.38, 0.34, -0.18],
            [0.2, -0.42, 0.24],
          ].forEach((position, index) =>
            addPart(
              group,
              new THREE.SphereGeometry(0.13, 12, 9),
              index % 2 ? accent : pale,
              position as [number, number, number],
            ),
          );
        }
      } else if (form === "crystal") {
        addPart(
          group,
          new THREE.BoxGeometry(0.94, 0.94, 0.94),
          material,
          [0, 0, 0],
          [1, 1, 1],
          [0.06, 0.28, 0.04],
        );
        if (rich) {
          addPart(
            group,
            new THREE.BoxGeometry(0.5, 0.5, 0.08),
            sceneryGlow("#ffffff", 0.26),
            [0.12, 0.12, 0.48],
            [1, 1, 1],
            [0, 0, 0.12],
          );
        }
      } else if (form === "seed") {
        if (name.includes("lentil")) {
          addPart(
            group,
            new THREE.SphereGeometry(0.58, 24, 16),
            material,
            [0, 0, 0],
            [1.2, 0.38, 0.88],
          );
        } else {
          addPart(
            group,
            new THREE.CapsuleGeometry(0.25, 0.82, 7, 16),
            material,
            [0, 0, 0],
            [1, 0.82, 1],
            [0.12, 0.18, Math.PI / 2],
          );
        }
        if (rich) {
          addPart(
            group,
            new THREE.CapsuleGeometry(0.025, 0.58, 2, 6),
            accent,
            [0, 0.02, 0.23],
            [1, 1, 1],
            [0, 0, Math.PI / 2],
          );
        }
      } else if (form === "bead") {
        addPart(
          group,
          new THREE.SphereGeometry(0.62, 26, 18),
          material,
          [0, 0, 0],
        );
        if (rich) {
          addPart(
            group,
            new THREE.SphereGeometry(0.17, 14, 10),
            sceneryGlow("#ffffff", 0.4),
            [-0.25, 0.27, 0.45],
          );
        }
      } else if (form === "park") {
        addPart(
          group,
          new THREE.BoxGeometry(1.5, 0.14, 1.18),
          createMaterial("#72bd6a"),
          [0, -0.35, 0],
        );
        addPart(
          group,
          new THREE.BoxGeometry(1.5, 0.025, 0.16),
          pale,
          [0, -0.26, 0],
        );
        addPart(
          group,
          new THREE.BoxGeometry(0.16, 0.025, 1.18),
          pale,
          [0, -0.25, 0],
        );
        [-0.48, 0.48].forEach((x, index) => {
          addPart(
            group,
            new THREE.CylinderGeometry(0.07, 0.09, 0.46, 8),
            dark,
            [x, -0.06, index ? 0.34 : -0.34],
          );
          addPart(
            group,
            new THREE.SphereGeometry(0.3, 14, 10),
            index ? material : accent,
            [x, 0.28, index ? 0.34 : -0.34],
            [1, 0.86, 1],
          );
        });
      } else if (shape === "bubble") {
        const bubbleMaterial = new THREE.MeshPhysicalMaterial({
          color: curio.color,
          emissive: curio.color,
          emissiveIntensity: 0.6,
          transparent: true,
          opacity: 0.58,
          transmission: 0.3,
          roughness: 0.12,
        });
        addPart(group, new THREE.SphereGeometry(0.75, 22, 16), bubbleMaterial, [0, 0, 0]);
        addPart(group, new THREE.SphereGeometry(0.22, 14, 10), material, [-0.38, 0.35, 0.3]);
        if (rich) {
          addPart(
            group,
            new THREE.SphereGeometry(0.15 + variant * 0.025, 12, 9),
            accent,
            [0.42, -0.26, -0.28],
          );
        }
      } else if (shape === "spark") {
        const sparkGeometry =
          variant % 2 === 0
            ? new THREE.OctahedronGeometry(0.72, 1)
            : new THREE.TetrahedronGeometry(0.8, 1);
        addPart(group, sparkGeometry, material, [0, 0, 0], [0.55, 1.2, 0.55]);
        if (rich) {
          addPart(group, new THREE.OctahedronGeometry(0.2, 0), accent, [0.58, 0.26, 0.28]);
          addPart(group, new THREE.OctahedronGeometry(0.13, 0), pale, [-0.52, -0.3, -0.22]);
        }
      } else if (shape === "quark") {
        if (name.includes("pair")) {
          addPart(group, new THREE.SphereGeometry(0.38, 22, 16), material, [-0.36, 0, 0]);
          addPart(group, new THREE.SphereGeometry(0.38, 22, 16), accent, [0.36, 0, 0]);
          addPart(
            group,
            new THREE.TorusGeometry(0.48, 0.035, 7, 32),
            pale,
            [0, 0, 0],
            [1, 1, 1],
            [Math.PI / 2, 0, 0],
          );
        } else {
          addPart(
            group,
            variant % 2
              ? new THREE.IcosahedronGeometry(0.5, 3)
              : new THREE.SphereGeometry(0.52, 24, 18),
            material,
            [0, 0, 0],
          );
          addPart(group, new THREE.TorusGeometry(0.7, 0.045, 8, 40), pale, [0, 0, 0], [1, 1, 1], [1.1, 0.4, 0]);
          if (rich) {
            addPart(
              group,
              new THREE.TorusKnotGeometry(0.42, 0.026, 64, 6, 2 + (variant % 2), 3),
              accent,
              [0, 0, 0],
              [1, 1, 1],
              [0.18, 1.08, 0.72],
            );
          }
        }
      } else if (shape === "hadron") {
        const meson =
          name.includes("pion") ||
          name.includes("kaon") ||
          name.includes("rho");
        const antimatter = name.includes("anti");
        const constituentPositions: [number, number, number][] = meson
          ? [[-0.32, 0, 0], [0.32, 0, 0]]
          : [[-0.3, 0.18, 0.08], [0.3, 0.18, -0.08], [0, -0.28, 0]];
        const constituentColors = antimatter
          ? ["#b68cff", "#78edc5", "#ff9a73"]
          : name.includes("neutron")
            ? ["#58a7ff", "#58a7ff", "#ff5e72"]
            : ["#ff5e72", "#ff5e72", "#58a7ff"];
        constituentPositions.forEach((position, part) => {
          addPart(
            group,
            new THREE.SphereGeometry(meson ? 0.44 : 0.4, 22, 16),
            createMaterial(constituentColors[part] ?? "#f7db56", true),
            position,
          );
        });
        if (rich) {
          addPart(
            group,
            meson
              ? new THREE.TorusGeometry(0.62, 0.035, 7, 36)
              : new THREE.IcosahedronGeometry(0.78, 2),
            sceneryGlow(curio.color, meson ? 0.46 : 0.18, !meson),
            [0, 0, 0],
            meson ? [1, 0.72, 1] : [1, 1, 1],
            meson ? [0.55, 0.2, 0] : [0, 0, 0],
          );
        }
      } else if (shape === "atom") {
        const atomicNumbers: Record<string, number> = {
          hydrogen: 1,
          helium: 2,
          carbon: 6,
          nitrogen: 7,
          oxygen: 8,
          silicon: 14,
          iron: 26,
          uranium: 92,
        };
        const elementKey = Object.keys(atomicNumbers).find((key) => name.includes(key));
        const atomicNumber = elementKey ? atomicNumbers[elementKey] : 3 + (curioSeed % 20);
        const shownNucleons = Math.min(10, Math.max(1, Math.round(Math.log2(atomicNumber + 1) * 2.2)));
        for (let nucleon = 0; nucleon < shownNucleons; nucleon += 1) {
          const angle = nucleon * 2.399;
          const radius = 0.035 + 0.045 * Math.sqrt(nucleon);
          addPart(
            group,
            new THREE.SphereGeometry(0.1, 12, 9),
            nucleon % 2 ? material : accent,
            [
              Math.cos(angle) * radius,
              (pseudo(nucleon + atomicNumber) - 0.5) * 0.24,
              Math.sin(angle) * radius,
            ],
          );
        }
        const shellCount = atomicNumber <= 2 ? 1 : atomicNumber <= 10 ? 2 : atomicNumber <= 18 ? 3 : 4;
        for (let shell = 0; shell < shellCount; shell += 1) {
          addPart(
            group,
            new THREE.SphereGeometry(0.38 + shell * 0.13, 22, 16),
            new THREE.MeshBasicMaterial({
              color: shell % 2 ? curio.color : "#eaffff",
              transparent: true,
              opacity: 0.075 + shell * 0.018,
              wireframe: shell === shellCount - 1,
              depthWrite: false,
            }),
            [0, 0, 0],
            [
              1.15 + (shell % 2) * 0.18,
              0.76 + ((shell + 1) % 2) * 0.2,
              1.05,
            ],
            [shell * 0.57, shell * 0.38, shell * 0.21],
          );
        }
        if (rich) {
          const electronCount = Math.min(8, Math.max(1, shellCount * 2));
          for (let electron = 0; electron < electronCount; electron += 1) {
            const theta = pseudo(electron * 7.7 + atomicNumber) * Math.PI * 2;
            const phi = Math.acos(2 * pseudo(electron * 4.3 + atomicNumber) - 1);
            const radius = 0.48 + pseudo(electron + atomicNumber) * 0.18;
            addPart(
              group,
              new THREE.SphereGeometry(0.055, 10, 8),
              electron % 2 ? pale : accent,
              [
                Math.sin(phi) * Math.cos(theta) * radius,
                Math.cos(phi) * radius,
                Math.sin(phi) * Math.sin(theta) * radius,
              ],
            );
          }
        }
      } else if (form === "antibody") {
        addPart(
          group,
          new THREE.CapsuleGeometry(0.11, 0.72, 5, 12),
          material,
          [0, -0.2, 0],
        );
        [-1, 1].forEach((side) => {
          addPart(
            group,
            new THREE.CapsuleGeometry(0.11, 0.7, 5, 12),
            side > 0 ? material : accent,
            [side * 0.28, 0.34, 0],
            [1, 1, 1],
            [0, 0, side * -0.66],
          );
          addPart(
            group,
            new THREE.SphereGeometry(0.18, 14, 10),
            pale,
            [side * 0.56, 0.63, 0],
          );
        });
      } else if (shape === "molecule") {
        const atomPositions: [number, number, number][] =
          name.includes("water")
            ? [[0, 0, 0], [0.48, 0.3, 0], [-0.48, 0.3, 0]]
            : name.includes("carbon dioxide")
              ? [[0, 0, 0], [-0.62, 0, 0], [0.62, 0, 0]]
              : name.includes("methane")
                ? [[0, 0, 0], [0.46, 0.36, 0.36], [-0.46, 0.36, -0.36], [0.36, -0.44, -0.36], [-0.36, -0.44, 0.36]]
                : name.includes("glucose")
                  ? Array.from({ length: 6 }, (_, atom) => {
                      const angle = (atom / 6) * Math.PI * 2;
                      return [Math.cos(angle) * 0.56, Math.sin(angle) * 0.56, (atom % 2) * 0.12] as [number, number, number];
                    })
                  : Array.from({ length: 3 + (curioSeed % 4) }, (_, atom) => [
                      (atom - 1.5) * 0.27,
                      Math.sin(atom * 2.1) * 0.38,
                      Math.cos(atom * 1.7) * 0.3,
                    ] as [number, number, number]);
        atomPositions.forEach((position, atom) => {
          addPart(
            group,
            new THREE.SphereGeometry(atom === 0 ? 0.3 : 0.22, 18, 13),
            atom === 0 ? material : atom % 3 === 1 ? pale : accent,
            position,
          );
        });
        if (rich && name.includes("lipid")) {
          addPart(group, new THREE.CapsuleGeometry(0.08, 0.9, 4, 8), accent, [0, -0.52, 0.1], [1, 1, 1], [0.15, 0.2, 0]);
          addPart(group, new THREE.CapsuleGeometry(0.08, 0.9, 4, 8), material, [0.22, -0.52, -0.1], [1, 1, 1], [-0.1, -0.2, 0.08]);
        }
      } else if (form === "bacteriophage") {
        addPart(
          group,
          new THREE.IcosahedronGeometry(0.46, 2),
          material,
          [0, 0.36, 0],
        );
        addPart(
          group,
          new THREE.CylinderGeometry(0.08, 0.12, 0.72, 8),
          accent,
          [0, -0.18, 0],
        );
        for (let leg = 0; leg < 6; leg += 1) {
          const angle = (leg / 6) * Math.PI * 2;
          addPart(
            group,
            new THREE.CapsuleGeometry(0.025, 0.42, 3, 6),
            pale,
            [Math.cos(angle) * 0.2, -0.62, Math.sin(angle) * 0.2],
            [1, 1, 1],
            [Math.sin(angle) * 0.7, 0, Math.cos(angle) * 0.7],
          );
        }
      } else if (shape === "virus") {
        addPart(
          group,
          form === "virus-enveloped"
            ? new THREE.SphereGeometry(0.58, 22, 16)
            : new THREE.IcosahedronGeometry(0.58, 2),
          material,
          [0, 0, 0],
        );
        const spikeCount = rich ? 8 + variant * 2 : 6;
        for (let i = 0; i < spikeCount; i += 1) {
          const angle = (i / spikeCount) * Math.PI * 2;
          addPart(group, new THREE.ConeGeometry(0.07, 0.28, 6), pale, [Math.cos(angle) * 0.69, Math.sin(angle) * 0.69, 0], [1, 1, 1], [0, 0, angle - Math.PI / 2]);
        }
        if (rich) {
          addPart(group, new THREE.ConeGeometry(0.08, 0.3, 6), accent, [0, 0, 0.72], [1, 1, 1], [Math.PI / 2, 0, 0]);
          addPart(group, new THREE.ConeGeometry(0.08, 0.3, 6), accent, [0, 0, -0.72], [1, 1, 1], [-Math.PI / 2, 0, 0]);
        }
      } else if (form === "tardigrade") {
        for (let segment = 0; segment < 4; segment += 1) {
          const x = (segment - 1.5) * 0.34;
          addPart(
            group,
            new THREE.SphereGeometry(0.31, 16, 12),
            segment % 2 ? material : accent,
            [x, 0, 0],
            [1.18, 0.85, 0.94],
          );
          [-1, 1].forEach((side) => {
            addPart(
              group,
              new THREE.CapsuleGeometry(0.055, 0.3, 3, 7),
              material,
              [x, side * -0.31, 0],
              [1, 1, 1],
              [0, 0, side * 0.52],
            );
          });
        }
        addPart(
          group,
          new THREE.SphereGeometry(0.2, 14, 10),
          pale,
          [0.72, 0.08, 0],
        );
      } else if (form === "pollen") {
        addPart(
          group,
          new THREE.IcosahedronGeometry(0.55, 3),
          material,
          [0, 0, 0],
        );
        const pollenSpikes = rich ? 12 : 8;
        for (let spike = 0; spike < pollenSpikes; spike += 1) {
          const theta = (spike / pollenSpikes) * Math.PI * 2;
          addPart(
            group,
            new THREE.ConeGeometry(0.08, 0.28, 6),
            accent,
            [Math.cos(theta) * 0.64, Math.sin(theta) * 0.64, 0],
            [1, 1, 1],
            [0, 0, theta - Math.PI / 2],
          );
        }
      } else if (form === "diatom") {
        addPart(
          group,
          new THREE.CapsuleGeometry(0.38, 0.72, 7, 16),
          material,
          [0, 0, 0],
          [1, 0.62, 1],
          [0, 0, Math.PI / 2],
        );
        for (let rib = -2; rib <= 2; rib += 1) {
          addPart(
            group,
            new THREE.TorusGeometry(0.33, 0.025, 5, 16),
            accent,
            [rib * 0.18, 0, 0],
            [0.72, 1, 1],
            [0, Math.PI / 2, 0],
          );
        }
      } else if (form === "ciliate") {
        addPart(
          group,
          new THREE.CapsuleGeometry(0.38, 0.86, 8, 18),
          material,
          [0, 0, 0],
          [1, 0.74, 1],
          [0, 0, Math.PI / 2],
        );
        for (let cilium = 0; cilium < 12; cilium += 1) {
          const angle = (cilium / 12) * Math.PI * 2;
          addPart(
            group,
            new THREE.CapsuleGeometry(0.018, 0.2, 2, 5),
            pale,
            [Math.cos(angle) * 0.48, Math.sin(angle) * 0.34, 0],
            [1, 1, 1],
            [0, 0, angle],
          );
        }
      } else if (form === "mite") {
        addPart(
          group,
          new THREE.SphereGeometry(0.48, 20, 14),
          material,
          [0, 0, 0],
          [1.15, 0.68, 0.82],
        );
        for (let leg = 0; leg < 8; leg += 1) {
          const side = leg % 2 ? 1 : -1;
          const row = Math.floor(leg / 2);
          addPart(
            group,
            new THREE.CapsuleGeometry(0.035, 0.38, 3, 7),
            accent,
            [(row - 1.5) * 0.17, side * 0.34, 0],
            [1, 1, 1],
            [0, 0, side * (0.72 + row * 0.08)],
          );
        }
      } else if (form === "worm") {
        for (let segment = 0; segment < 6; segment += 1) {
          const x = (segment - 2.5) * 0.22;
          addPart(
            group,
            new THREE.SphereGeometry(0.22, 14, 10),
            segment % 2 ? material : accent,
            [x, Math.sin(segment * 1.2) * 0.12, 0],
            [1.2, 0.72, 0.72],
          );
        }
      } else if (shape === "cell") {
        const membrane = new THREE.MeshPhysicalMaterial({
          color: curio.color,
          transparent: true,
          opacity: 0.72,
          roughness: 0.3,
          transmission: 0.12,
        });
        if (form === "blood-cell") {
          addPart(group, new THREE.TorusGeometry(0.48, 0.22, 16, 32), membrane, [0, 0, 0], [1.15, 0.32, 1.15], [Math.PI / 2, 0, 0]);
        } else if (form === "immune-cell") {
          addPart(
            group,
            new THREE.IcosahedronGeometry(0.62, 3),
            membrane,
            [0, 0, 0],
            [1.05, 0.92, 1],
          );
          addPart(
            group,
            new THREE.SphereGeometry(0.28, 18, 13),
            dark,
            [-0.12, 0.05, 0.18],
            [1.2, 0.78, 0.9],
          );
        } else if (form === "bacterium") {
          addPart(group, new THREE.CapsuleGeometry(0.34, 0.78, 8, 18), membrane, [0, 0, 0], [1, 1, 1], [0.2, 0.2, Math.PI / 2]);
          addPart(group, new THREE.TorusKnotGeometry(0.2, 0.025, 44, 5, 2, 3), accent, [0, 0, 0]);
        } else if (form === "plant-cell") {
          addPart(group, new THREE.BoxGeometry(1.25, 0.88, 0.86), membrane, [0, 0, 0]);
          addPart(group, new THREE.SphereGeometry(0.3, 18, 12), sceneryGlow("#b5f3c5", 0.46), [0.12, 0.02, 0.06]);
          [-0.38, 0.34].forEach((x) =>
            addPart(group, new THREE.CapsuleGeometry(0.08, 0.2, 3, 8), accent, [x, -0.2, 0.25], [1, 1, 1], [0.4, 0.3, 0.8]),
          );
        } else if (name.includes("yeast")) {
          addPart(group, new THREE.SphereGeometry(0.58, 24, 18), membrane, [-0.08, 0, 0]);
          addPart(group, new THREE.SphereGeometry(0.28, 18, 12), membrane.clone(), [0.5, 0.25, 0]);
          addPart(group, new THREE.SphereGeometry(0.18, 16, 11), dark, [-0.06, 0.04, 0.1]);
        } else if (form === "neuron") {
          addPart(group, new THREE.SphereGeometry(0.38, 22, 16), membrane, [-0.2, 0, 0]);
          for (let branch = 0; branch < 5; branch += 1) {
            addPart(
              group,
              new THREE.CapsuleGeometry(0.045, 0.62 + branch * 0.08, 3, 8),
              accent,
              [Math.cos(branch * 1.25) * 0.38, Math.sin(branch * 1.25) * 0.38, 0],
              [1, 1, 1],
              [0, 0, branch * 1.25],
            );
          }
          addPart(group, new THREE.CapsuleGeometry(0.055, 1.15, 4, 9), material, [0.76, 0, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
        } else if (form === "sperm") {
          addPart(group, new THREE.SphereGeometry(0.3, 20, 14), membrane, [-0.35, 0, 0]);
          addPart(group, new THREE.TorusKnotGeometry(0.34, 0.035, 62, 5, 2, 3), accent, [0.32, 0, 0], [1.35, 0.45, 0.45], [0, 0, Math.PI / 2]);
        } else {
          addPart(group, new THREE.IcosahedronGeometry(0.68, name.includes("amoeba") ? 2 : 4), membrane, [0, 0, 0], [1.05 + variant * 0.04, 0.78, 1]);
          addPart(group, new THREE.SphereGeometry(0.24, 18, 12), dark, [0.18, 0.05, 0.18]);
          addPart(group, new THREE.SphereGeometry(0.1, 12, 8), pale, [-0.3, 0.22, 0.2]);
        }
        if (rich && form !== "neuron" && form !== "sperm") {
          addPart(group, new THREE.CapsuleGeometry(0.07, 0.24, 3, 8), accent, [-0.26, -0.2, 0.25], [1, 1, 1], [0.5, 0.2, 0.8]);
          addPart(group, new THREE.SphereGeometry(0.075, 9, 7), pale, [0.3, 0.28, -0.25]);
        }
      } else if (shape === "fiber") {
        addPart(group, new THREE.CapsuleGeometry(0.18, 1.25, 5, 12), material, [0, 0, 0], [1, 1, 1], [0.2, 0.2, 1.08]);
        if (rich) {
          addPart(group, new THREE.CapsuleGeometry(0.1, 0.9, 4, 10), accent, [0.08, 0.02, 0.08], [1, 1, 1], [1.04, -0.35, 0.18]);
        }
      } else if (shape === "dust") {
        const dustGeometry =
          variant % 2 === 0
            ? new THREE.DodecahedronGeometry(0.62, 1)
            : new THREE.IcosahedronGeometry(0.64, 1);
        addPart(group, dustGeometry, material, [0, 0, 0], [1, 0.62, 0.75]);
        if (rich) {
          addPart(group, new THREE.TetrahedronGeometry(0.2, 0), accent, [0.46, 0.12, -0.18]);
          addPart(group, new THREE.DodecahedronGeometry(0.13, 0), pale, [-0.38, -0.2, 0.25]);
        }
      } else if (shape === "stone" || shape === "mountain") {
        const rockGeometry =
          variant % 2 === 0
            ? new THREE.DodecahedronGeometry(0.66, 1)
            : new THREE.IcosahedronGeometry(0.68, 1);
        addPart(group, rockGeometry, material, [0, 0, 0], shape === "mountain" ? [1.1, 1.5, 0.9] : [1, 0.72, 0.86]);
        if (rich && shape === "mountain") {
          addPart(group, new THREE.ConeGeometry(0.36, 0.38, 5), pale, [0, 0.72, 0], [1, 1, 0.86]);
        } else if (rich) {
          addPart(group, new THREE.DodecahedronGeometry(0.23, 0), accent, [0.44, -0.18, 0.15]);
        }
      } else if (form === "pencil") {
        addPart(
          group,
          new THREE.CylinderGeometry(0.13, 0.13, 1.25, 6),
          material,
          [0, 0, 0],
          [1, 1, 1],
          [0, 0, Math.PI / 2],
        );
        addPart(
          group,
          new THREE.ConeGeometry(0.14, 0.34, 6),
          pale,
          [0.78, 0, 0],
          [1, 1, 1],
          [0, 0, -Math.PI / 2],
        );
        addPart(
          group,
          new THREE.CylinderGeometry(0.14, 0.14, 0.2, 6),
          accent,
          [-0.72, 0, 0],
          [1, 1, 1],
          [0, 0, Math.PI / 2],
        );
      } else if (form === "mug") {
        addPart(
          group,
          new THREE.CylinderGeometry(0.46, 0.4, 0.72, 22),
          material,
          [0, 0, 0],
        );
        addPart(
          group,
          new THREE.TorusGeometry(0.32, 0.09, 8, 24),
          accent,
          [0.48, 0.02, 0],
          [1, 1, 1],
          [Math.PI / 2, 0, 0],
        );
        addPart(
          group,
          new THREE.CylinderGeometry(0.33, 0.33, 0.035, 22),
          dark,
          [0, 0.37, 0],
        );
      } else if (form === "book") {
        addPart(
          group,
          new THREE.BoxGeometry(1.2, 0.24, 0.82),
          material,
          [0, 0, 0],
          [1, 1, 1],
          [0.04, 0.12, -0.04],
        );
        addPart(
          group,
          new THREE.BoxGeometry(1.05, 0.16, 0.75),
          pale,
          [0.04, 0.02, 0],
          [1, 1, 1],
          [0.04, 0.12, -0.04],
        );
        addPart(
          group,
          new THREE.BoxGeometry(0.08, 0.28, 0.82),
          accent,
          [-0.56, 0, 0],
          [1, 1, 1],
          [0.04, 0.12, -0.04],
        );
      } else if (form === "spoon") {
        addPart(
          group,
          new THREE.CapsuleGeometry(0.07, 0.9, 4, 10),
          material,
          [-0.16, 0, 0],
          [1, 1, 1],
          [0, 0, Math.PI / 2],
        );
        addPart(
          group,
          new THREE.SphereGeometry(0.34, 20, 14),
          accent,
          [0.58, 0, 0],
          [1.25, 0.28, 0.78],
        );
      } else if (form === "coin") {
        addPart(
          group,
          new THREE.CylinderGeometry(0.54, 0.54, 0.12, 28),
          material,
          [0, 0, 0],
          [1, 1, 1],
          [Math.PI / 2, 0, 0],
        );
        addPart(
          group,
          new THREE.TorusGeometry(0.38, 0.035, 6, 28),
          accent,
          [0, 0, 0.07],
        );
      } else if (form === "key") {
        addPart(
          group,
          new THREE.TorusGeometry(0.3, 0.11, 8, 22),
          material,
          [-0.42, 0, 0],
        );
        addPart(
          group,
          new THREE.BoxGeometry(0.9, 0.14, 0.16),
          material,
          [0.22, 0, 0],
        );
        [0.42, 0.68].forEach((x, tooth) =>
          addPart(
            group,
            new THREE.BoxGeometry(0.13, 0.2 + tooth * 0.08, 0.16),
            accent,
            [x, -0.15, 0],
          ),
        );
      } else if (form === "die") {
        addPart(
          group,
          new THREE.BoxGeometry(0.92, 0.92, 0.92),
          material,
          [0, 0, 0],
          [1, 1, 1],
          [0.12, 0.2, 0.08],
        );
        [-0.22, 0.22].forEach((x) =>
          [-0.22, 0.22].forEach((y) =>
            addPart(
              group,
              new THREE.SphereGeometry(0.07, 10, 8),
              dark,
              [x, y, 0.48],
            ),
          ),
        );
      } else if (form === "guitar") {
        addPart(
          group,
          new THREE.SphereGeometry(0.42, 20, 14),
          material,
          [-0.32, -0.08, 0],
          [0.85, 1.15, 0.4],
        );
        addPart(
          group,
          new THREE.SphereGeometry(0.34, 20, 14),
          material,
          [0.08, 0.18, 0],
          [0.78, 1, 0.38],
        );
        addPart(
          group,
          new THREE.BoxGeometry(0.18, 1.15, 0.16),
          dark,
          [0.42, 0.62, 0],
          [1, 1, 1],
          [0, 0, -0.3],
        );
      } else if (form === "table") {
        addPart(
          group,
          new THREE.BoxGeometry(1.35, 0.16, 0.9),
          material,
          [0, 0.35, 0],
        );
        [-0.52, 0.52].forEach((x) =>
          [-0.31, 0.31].forEach((z) =>
            addPart(
              group,
              new THREE.BoxGeometry(0.13, 0.85, 0.13),
              dark,
              [x, -0.08, z],
            ),
          ),
        );
      } else if (form === "screen") {
        addPart(
          group,
          new THREE.BoxGeometry(1.25, 0.78, 0.16),
          dark,
          [0, 0.2, 0],
        );
        addPart(
          group,
          new THREE.BoxGeometry(1.06, 0.59, 0.05),
          material,
          [0, 0.2, 0.105],
        );
        addPart(
          group,
          new THREE.BoxGeometry(0.16, 0.42, 0.16),
          accent,
          [0, -0.38, 0],
        );
        addPart(
          group,
          new THREE.BoxGeometry(0.7, 0.1, 0.42),
          accent,
          [0, -0.58, 0],
        );
      } else if (form === "potted-plant") {
        addPart(
          group,
          new THREE.CylinderGeometry(0.3, 0.46, 0.58, 16),
          material,
          [0, -0.38, 0],
        );
        [-0.28, 0, 0.28].forEach((x, leaf) =>
          addPart(
            group,
            new THREE.SphereGeometry(0.34, 16, 12),
            leaf % 2 ? accent : createMaterial("#60a85d"),
            [x, 0.22 + (leaf % 2) * 0.2, 0],
            [0.72, 1.15, 0.48],
            [0, 0, x * 1.4],
          ),
        );
      } else if (form === "bed") {
        addPart(
          group,
          new THREE.BoxGeometry(1.45, 0.32, 0.92),
          material,
          [0, -0.12, 0],
        );
        addPart(
          group,
          new THREE.BoxGeometry(1.34, 0.17, 0.83),
          pale,
          [0, 0.13, 0],
        );
        addPart(
          group,
          new THREE.BoxGeometry(0.16, 0.92, 0.92),
          accent,
          [-0.68, 0.27, 0],
        );
      } else if (form === "appliance") {
        addPart(
          group,
          new THREE.BoxGeometry(0.94, 1.35, 0.82),
          material,
          [0, 0, 0],
        );
        addPart(
          group,
          new THREE.BoxGeometry(0.75, 0.045, 0.08),
          accent,
          [0, 0.22, 0.44],
        );
        addPart(
          group,
          new THREE.CapsuleGeometry(0.035, 0.34, 3, 8),
          dark,
          [0.29, 0.49, 0.46],
        );
      } else if (form === "bathtub") {
        addPart(
          group,
          new THREE.CapsuleGeometry(0.42, 0.72, 8, 18),
          material,
          [0, 0, 0],
          [1.45, 0.46, 1],
          [0, 0, Math.PI / 2],
        );
        addPart(
          group,
          new THREE.CapsuleGeometry(0.3, 0.58, 8, 18),
          pale,
          [0, 0.16, 0],
          [1.35, 0.3, 0.86],
          [0, 0, Math.PI / 2],
        );
        addPart(
          group,
          new THREE.TorusGeometry(0.16, 0.035, 7, 20, Math.PI),
          accent,
          [-0.48, 0.42, 0],
          [1, 1, 1],
          [Math.PI / 2, 0, 0],
        );
      } else if (form === "tree") {
        addPart(
          group,
          new THREE.CylinderGeometry(0.13, 0.2, 1.05, 10),
          dark,
          [0, -0.18, 0],
        );
        [
          [-0.3, 0.48, 0],
          [0.28, 0.52, 0.08],
          [0, 0.78, -0.08],
        ].forEach((position, crown) =>
          addPart(
            group,
            new THREE.DodecahedronGeometry(0.46, 1),
            crown % 2 ? material : accent,
            position as [number, number, number],
          ),
        );
      } else if (form === "pool") {
        addPart(
          group,
          new THREE.CylinderGeometry(0.72, 0.76, 0.24, 28),
          material,
          [0, 0, 0],
        );
        addPart(
          group,
          new THREE.CylinderGeometry(0.6, 0.6, 0.04, 28),
          createMaterial("#64d8e8", true),
          [0, 0.14, 0],
        );
      } else if (form === "train") {
        addPart(
          group,
          new THREE.BoxGeometry(1.55, 0.68, 0.66),
          material,
          [0, 0.06, 0],
        );
        [-0.48, 0, 0.48].forEach((x) =>
          addPart(
            group,
            new THREE.BoxGeometry(0.24, 0.24, 0.04),
            pale,
            [x, 0.18, 0.35],
          ),
        );
        [-0.52, 0.52].forEach((x) =>
          [-0.32, 0.32].forEach((z) =>
            addPart(
              group,
              new THREE.CylinderGeometry(0.16, 0.16, 0.1, 14),
              dark,
              [x, -0.35, z],
              [1, 1, 1],
              [Math.PI / 2, 0, 0],
            ),
          ),
        );
      } else if (form === "button") {
        addPart(group, new THREE.CylinderGeometry(0.58, 0.58, 0.16, 28), material, [0, 0, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
        [
          [-0.18, 0.09, 0.17],
          [0.18, 0.09, 0.17],
          [-0.18, -0.09, 0.17],
          [0.18, -0.09, 0.17],
        ].forEach((position) =>
          addPart(group, new THREE.CylinderGeometry(0.055, 0.055, 0.19, 10), dark, position as [number, number, number], [1, 1, 1], [Math.PI / 2, 0, 0]),
        );
      } else if (form === "brick") {
        addPart(group, new THREE.BoxGeometry(1.2, 0.48, 0.72), material, [0, 0, 0]);
        [-0.4, 0, 0.4].forEach((x) =>
          [-0.22, 0.22].forEach((z) =>
            addPart(group, new THREE.CylinderGeometry(0.12, 0.12, 0.14, 14), accent, [x, 0.31, z]),
          ),
        );
      } else if (form === "bottle-cap") {
        addPart(group, new THREE.CylinderGeometry(0.58, 0.62, 0.3, 24), material, [0, 0, 0]);
        addPart(group, new THREE.CylinderGeometry(0.42, 0.42, 0.06, 24), pale, [0, 0.18, 0]);
        for (let ridge = 0; ridge < 12; ridge += 1) {
          const angle = (ridge / 12) * Math.PI * 2;
          addPart(group, new THREE.BoxGeometry(0.08, 0.28, 0.12), accent, [Math.cos(angle) * 0.61, 0, Math.sin(angle) * 0.61], [1, 1, 1], [0, -angle, 0]);
        }
      } else if (form === "shoe") {
        addPart(group, new THREE.CapsuleGeometry(0.32, 0.82, 6, 14), material, [0.05, -0.08, 0], [1, 0.68, 1.2], [0.1, 0.1, Math.PI / 2]);
        addPart(group, new THREE.BoxGeometry(0.66, 0.5, 0.62), accent, [0.25, 0.2, 0]);
        addPart(group, new THREE.BoxGeometry(1.25, 0.09, 0.68), pale, [0, -0.35, 0]);
      } else if (form === "lamp") {
        addPart(group, new THREE.CylinderGeometry(0.3, 0.42, 0.12, 20), dark, [0, -0.7, 0]);
        addPart(group, new THREE.CylinderGeometry(0.055, 0.055, 1.35, 10), material, [0, 0, 0]);
        addPart(group, new THREE.ConeGeometry(0.5, 0.72, 20, 1, true), accent, [0, 0.85, 0]);
        addPart(group, new THREE.SphereGeometry(0.12, 12, 9), pale, [0, 0.65, 0]);
      } else if (form === "couch") {
        addPart(group, new THREE.BoxGeometry(1.45, 0.48, 0.68), material, [0, -0.12, 0]);
        addPart(group, new THREE.BoxGeometry(1.45, 0.7, 0.22), accent, [0, 0.38, 0.3]);
        [-0.66, 0.66].forEach((x) =>
          addPart(group, new THREE.BoxGeometry(0.2, 0.62, 0.7), material, [x, 0.06, 0]),
        );
        addPart(group, new THREE.BoxGeometry(0.62, 0.12, 0.58), pale, [-0.33, 0.17, -0.03]);
        addPart(group, new THREE.BoxGeometry(0.62, 0.12, 0.58), pale, [0.33, 0.17, -0.03]);
      } else if (form === "bicycle") {
        [-0.54, 0.54].forEach((x) =>
          addPart(group, new THREE.TorusGeometry(0.34, 0.055, 8, 28), dark, [x, -0.22, 0], [1, 1, 1], [0, 0, 0]),
        );
        addPart(group, new THREE.TorusGeometry(0.36, 0.045, 7, 20), material, [0, 0.03, 0], [1, 0.72, 1], [0, 0, 0]);
        addPart(group, new THREE.CapsuleGeometry(0.045, 0.74, 3, 8), accent, [0.28, 0.18, 0], [1, 1, 1], [0, 0, -0.76]);
      } else if (shape === "chair") {
        addPart(group, new THREE.BoxGeometry(0.95, 0.16, 0.82), material, [0, 0, 0]);
        addPart(group, new THREE.BoxGeometry(0.95, 1.05, 0.15), material, [0, 0.48, 0.35]);
        [-0.36, 0.36].forEach((x) => [-0.28, 0.28].forEach((z) => addPart(group, new THREE.BoxGeometry(0.13, 0.7, 0.13), dark, [x, -0.4, z])));
        if (rich && variant % 2 === 0) {
          [-0.5, 0.5].forEach((x) =>
            addPart(group, new THREE.BoxGeometry(0.12, 0.12, 0.82), accent, [x, 0.18, 0]),
          );
        }
      } else if (form === "motorcycle") {
        [-0.54, 0.54].forEach((x) =>
          addPart(
            group,
            new THREE.TorusGeometry(0.31, 0.065, 8, 24),
            dark,
            [x, -0.26, 0],
          ),
        );
        addPart(
          group,
          new THREE.TorusGeometry(0.4, 0.055, 7, 18),
          material,
          [0, -0.02, 0],
          [1, 0.76, 1],
        );
        addPart(
          group,
          new THREE.CapsuleGeometry(0.06, 0.56, 3, 8),
          accent,
          [0.31, 0.13, 0],
          [1, 1, 1],
          [0, 0, -0.68],
        );
      } else if (form === "sailboat") {
        addPart(
          group,
          new THREE.CapsuleGeometry(0.3, 1.05, 6, 16),
          material,
          [0, -0.25, 0],
          [1, 0.52, 1.12],
          [0, 0, Math.PI / 2],
        );
        addPart(
          group,
          new THREE.CylinderGeometry(0.035, 0.045, 1.45, 8),
          dark,
          [0, 0.48, 0],
        );
        addPart(
          group,
          new THREE.ConeGeometry(0.62, 1.18, 3),
          pale,
          [0.31, 0.53, 0],
          [1, 1, 0.12],
          [0, 0, -0.05],
        );
      } else if (shape === "car") {
        addPart(group, new THREE.BoxGeometry(1.45, 0.46, 0.72), material, [0, 0, 0]);
        addPart(group, new THREE.BoxGeometry(0.75, 0.38, 0.67), pale, [-0.1, 0.38, 0]);
        [-0.48, 0.48].forEach((x) => [-0.39, 0.39].forEach((z) => addPart(group, new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16), dark, [x, -0.27, z], [1, 1, 1], [Math.PI / 2, 0, 0])));
        if (rich) {
          [-0.24, 0.24].forEach((z) =>
            addPart(group, new THREE.SphereGeometry(0.09, 10, 8), accent, [-0.72, 0.02, z]),
          );
        }
      } else if (form === "bridge") {
        addPart(
          group,
          new THREE.BoxGeometry(1.65, 0.18, 0.52),
          material,
          [0, -0.2, 0],
        );
        [-0.56, 0.56].forEach((x) => {
          addPart(
            group,
            new THREE.BoxGeometry(0.12, 1.05, 0.12),
            dark,
            [x, 0.22, 0],
          );
          addPart(
            group,
            new THREE.TorusGeometry(0.58, 0.025, 5, 20, Math.PI),
            accent,
            [x * 0.5, 0.36, 0.02],
            [1, 1, 1],
            [0, 0, x > 0 ? 0 : Math.PI],
          );
        });
      } else if (
        form === "tower"
      ) {
        addPart(
          group,
          new THREE.BoxGeometry(0.78, 1.6, 0.72),
          material,
          [0, 0, 0],
        );
        for (let floor = -2; floor <= 2; floor += 1) {
          [-0.2, 0.2].forEach((x) =>
            addPart(
              group,
              new THREE.BoxGeometry(0.13, 0.13, 0.04),
              floor % 2 ? pale : accent,
              [x, floor * 0.25, 0.38],
            ),
          );
        }
        addPart(
          group,
          new THREE.ConeGeometry(0.12, 0.45, 6),
          accent,
          [0, 1.02, 0],
        );
      } else if (form === "doorway") {
        [-0.48, 0.48].forEach((x) =>
          addPart(
            group,
            new THREE.BoxGeometry(0.2, 1.45, 0.32),
            material,
            [x, 0, 0],
          ),
        );
        addPart(
          group,
          new THREE.BoxGeometry(1.16, 0.22, 0.32),
          accent,
          [0, 0.72, 0],
        );
      } else if (shape === "house") {
        if (name.includes("water tower")) {
          addPart(group, new THREE.SphereGeometry(0.58, 24, 16), material, [0, 0.45, 0], [1.05, 0.82, 1.05]);
          [-0.34, 0.34].forEach((x) =>
            [-0.24, 0.24].forEach((z) =>
              addPart(group, new THREE.CylinderGeometry(0.045, 0.055, 1.1, 8), dark, [x, -0.45, z], [1, 1, 1], [0, 0, x * 0.24]),
            ),
          );
        } else if (name.includes("stadium")) {
          addPart(group, new THREE.TorusGeometry(0.72, 0.24, 12, 32), material, [0, 0, 0], [1.25, 0.42, 0.88], [Math.PI / 2, 0, 0]);
          addPart(group, new THREE.CylinderGeometry(0.5, 0.5, 0.08, 32), accent, [0, -0.04, 0]);
        } else if (name.includes("office") || name.includes("megacity") || name.includes("metro")) {
          const towerCount = name.includes("mega") || name.includes("metro") ? 7 : 3;
          for (let tower = 0; tower < towerCount; tower += 1) {
            const x = (tower % 3 - 1) * 0.42;
            const z = (Math.floor(tower / 3) - 0.5) * 0.38;
            const height = 0.65 + (tower % 4) * 0.2;
            addPart(group, new THREE.BoxGeometry(0.34, height, 0.32), tower % 2 ? material : accent, [x, height / 2 - 0.35, z]);
          }
        } else {
          addPart(group, new THREE.BoxGeometry(1.15, 0.85, 0.95), material, [0, 0, 0]);
          addPart(group, new THREE.ConeGeometry(0.88, 0.55, 4), createMaterial("#d05e57"), [0, 0.7, 0], [1, 1, 1], [0, Math.PI / 4, 0]);
          addPart(group, new THREE.BoxGeometry(0.25, 0.48, 0.08), dark, [0, -0.18, 0.51]);
          if (rich) {
            [-0.38, 0.38].forEach((x) =>
              addPart(group, new THREE.BoxGeometry(0.2, 0.2, 0.07), accent, [x, 0.16, 0.51]),
            );
          }
        }
      } else if (shape === "planet") {
        const irregular = name.includes("small moon") || name.includes("rogue");
        addPart(
          group,
          irregular
            ? new THREE.IcosahedronGeometry(0.68, 2)
            : new THREE.SphereGeometry(0.67, 32, 24),
          material,
          [0, 0, 0],
          name.includes("earth") ? [1, 0.97, 1] : [1, 1, 1],
        );
        if (name.includes("saturn") || name.includes("gas giant")) {
          addPart(group, new THREE.TorusGeometry(0.92, name.includes("saturn") ? 0.11 : 0.055, 9, 52), pale, [0, 0, 0], [1, 0.42, 1], [0.25, 0, 0.15]);
        } else if (name.includes("earth")) {
          for (let land = 0; land < 6; land += 1) {
            const angle = (land / 6) * Math.PI * 2;
            addPart(group, new THREE.DodecahedronGeometry(0.14 + (land % 2) * 0.04, 1), accent, [Math.cos(angle) * 0.59, Math.sin(angle * 1.7) * 0.36, Math.sin(angle) * 0.34]);
          }
        } else if (rich) {
          addPart(group, new THREE.SphereGeometry(0.11 + variant * 0.015, 12, 9), accent, [0.84, 0.3, -0.16]);
        }
      } else if (shape === "star") {
        addPart(group, new THREE.IcosahedronGeometry(0.72, 3), material, [0, 0, 0]);
        addPart(group, new THREE.SphereGeometry(0.96, 20, 14), new THREE.MeshBasicMaterial({ color: curio.color, transparent: true, opacity: 0.12, side: THREE.BackSide }), [0, 0, 0]);
        if (rich) {
          addPart(group, new THREE.TorusGeometry(0.86, 0.025, 6, 30), accent, [0, 0, 0], [1, 0.62, 1], [0.4, 0.2, 0]);
        }
      } else if (shape === "system") {
        addPart(group, new THREE.SphereGeometry(0.2, 16, 12), material, [0, 0, 0]);
        [0.45, 0.72, 0.98].forEach((radius, index) => {
          addPart(group, new THREE.TorusGeometry(radius, 0.018, 5, 42), pale, [0, 0, 0], [1, 0.35 + index * 0.12, 1], [0.3 * index, 0.15, 0]);
        });
        if (rich) {
          addPart(group, new THREE.SphereGeometry(0.1, 10, 8), accent, [0.56, 0.04, 0.16]);
          addPart(group, new THREE.SphereGeometry(0.075, 9, 7), material, [-0.78, -0.05, -0.12]);
        }
      } else if (shape === "galaxy") {
        const irregular = name.includes("irregular") || name.includes("cluster") || name.includes("group");
        addPart(group, new THREE.SphereGeometry(name.includes("active") ? 0.26 : 0.18, 16, 12), name.includes("active") ? accent : pale, [0, 0, 0]);
        if (irregular) {
          const galaxyBits = name.includes("cluster") ? 10 : 6;
          for (let bit = 0; bit < galaxyBits; bit += 1) {
            addPart(
              group,
              new THREE.IcosahedronGeometry(0.13 + (bit % 3) * 0.04, 1),
              bit % 2 ? material : accent,
              [
                (pseudo(bit + curioSeed) - 0.5) * 1.25,
                (pseudo(bit * 3 + curioSeed) - 0.5) * 0.46,
                (pseudo(bit * 7 + curioSeed) - 0.5) * 0.85,
              ],
            );
          }
        } else {
          for (let i = 0; i < 3; i += 1) {
            addPart(group, new THREE.TorusGeometry(0.38 + i * 0.2, 0.075, 7, 52), material, [0, 0, 0], [1, 0.2, 1], [0.2, i * (name.includes("barred") ? 0.34 : 0.6), 0]);
          }
          if (name.includes("barred")) {
            addPart(group, new THREE.CapsuleGeometry(0.075, 0.75, 4, 10), pale, [0, 0, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
          }
        }
        if (rich) {
          addPart(group, new THREE.SphereGeometry(0.07, 9, 7), accent, [0.72, 0.14, 0.2]);
          addPart(group, new THREE.SphereGeometry(0.055, 8, 6), pale, [-0.62, -0.2, -0.28]);
        }
      } else if (shape === "universe") {
        addPart(group, new THREE.IcosahedronGeometry(0.76, 2), new THREE.MeshBasicMaterial({ color: curio.color, wireframe: true, transparent: true, opacity: 0.72 }), [0, 0, 0]);
        addPart(group, new THREE.SphereGeometry(0.28, 16, 12), material, [0, 0, 0]);
        if (rich) {
          addPart(group, new THREE.TorusGeometry(0.55, 0.035, 7, 30), accent, [0, 0, 0], [1, 0.75, 1], [0.8, 0.3, 0.4]);
        }
      } else {
        if (variant === 0) {
          addPart(group, new THREE.BoxGeometry(0.9, 0.72, 0.62), material, [0, 0, 0], [1, 1, 1], [0.15, 0.25, 0.08]);
        } else if (variant === 1) {
          addPart(group, new THREE.CylinderGeometry(0.52, 0.58, 0.72, 12), material, [0, 0, 0], [1, 1, 0.82], [0.2, 0.1, Math.PI / 2]);
        } else if (variant === 2) {
          addPart(group, new THREE.CapsuleGeometry(0.34, 0.66, 5, 12), material, [0, 0, 0], [1, 1, 1], [0.2, 0.1, 0.9]);
        } else {
          addPart(group, new THREE.TorusGeometry(0.48, 0.19, 8, 20), material, [0, 0, 0], [1, 0.8, 1], [0.45, 0.18, 0]);
        }
        if (rich) {
          addPart(group, new THREE.SphereGeometry(0.16, 12, 9), accent, [0.36, 0.3, 0.28]);
        }
      }
      if (rich) {
        const signatureGeometry = (
          signature: number,
          secondary = false,
        ): THREE.BufferGeometry => {
          switch (signature % 12) {
            case 0: return new THREE.TorusGeometry(0.16, 0.045, 7, 18);
            case 1: return new THREE.TetrahedronGeometry(0.2, 0);
            case 2: return new THREE.OctahedronGeometry(0.18, 0);
            case 3: return new THREE.CapsuleGeometry(0.055, 0.24, 3, 7);
            case 4: return new THREE.ConeGeometry(0.12, 0.28, 6);
            case 5: return new THREE.TorusKnotGeometry(0.12, 0.025, 32, 5, 2, 3);
            case 6: return new THREE.DodecahedronGeometry(0.17, 0);
            case 7: return new THREE.CylinderGeometry(0.11, 0.15, 0.22, 7);
            case 8: return new THREE.RingGeometry(0.08, 0.18, 8);
            case 9: return new THREE.BoxGeometry(0.22, 0.16, 0.13);
            case 10: return new THREE.SphereGeometry(0.15, 10, 7);
            default:
              return new THREE.TorusGeometry(
                secondary ? 0.11 : 0.15,
                0.03,
                6,
                5 + (identity.visualVariant % 4),
              );
          }
        };
        [identity.detailVariant, identity.detailVariant + 5].forEach(
          (signature, detailIndex) => {
            const side = detailIndex ? -1 : 1;
            addPart(
              group,
              signatureGeometry(signature, detailIndex === 1),
              signature % 2 ? accent : pale,
              [
                side * (0.38 + pseudo(curioSeed + detailIndex * 41) * 0.2),
                0.22 + (signature % 4) * 0.09,
                0.28 - (signature % 3) * 0.24,
              ],
              detailIndex ? [0.72, 0.72, 0.72] : [1, 1, 1],
              [
                signature * 0.31,
                signature * 0.47,
                signature * 0.19,
              ],
            );
          },
        );
      }
      const stretch = new THREE.Vector3(
        0.92 + variant * 0.045,
        1.08 - variant * 0.03,
        0.94 + ((variant + 2) % 4) * 0.035,
      );
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) child.scale.multiply(stretch);
      });
      return group;
    };

    const visualTemplates = new Map<string, THREE.Object3D>();
    const makeVisual = (curio: Curio, rich = true) => {
      const key = `${curio.id}:${rich ? "rich" : "simple"}`;
      let template = visualTemplates.get(key);
      if (!template) {
        template = buildVisual(curio, rich);
        visualTemplates.set(key, template);
      }
      const visual = template.clone(true);
      visual.userData.sharedResources = true;
      return visual;
    };

    const markerTextures = new Map<string, THREE.CanvasTexture>();

    const getMarkerTexture = (symbol: string) => {
      const cached = markerTextures.get(symbol);
      if (cached) return cached;
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d")!;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.fillStyle = "rgba(255, 123, 174, .76)";
      context.beginPath();
      context.ellipse(48, 105, 22, 12, -0.16, 0, Math.PI * 2);
      context.ellipse(208, 105, 22, 12, 0.16, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#241534";
      [84, 172].forEach((x) => {
        context.beginPath();
        context.ellipse(x, 76, 15, 21, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.arc(x - 5, 70, 5, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#241534";
      });
      context.strokeStyle = "rgba(24, 12, 43, .94)";
      context.lineWidth = 16;
      context.fillStyle = "#ffffff";
      context.font = `900 ${symbol.length > 2 ? 78 : symbol.length > 1 ? 105 : 138}px "Arial Rounded MT Bold", Arial`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.strokeText(symbol, 128, 166, 218);
      context.fillText(symbol, 128, 166, 218);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      markerTextures.set(symbol, texture);
      return texture;
    };

    const makeMarker = (symbol: string) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getMarkerTexture(symbol),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }));
      const markerScale = symbol.length > 2 ? 1.02 : 1.16;
      sprite.scale.set(markerScale, markerScale, 1);
      sprite.position.set(0, 0, 0);
      sprite.renderOrder = 30;
      return sprite;
    };

    let pickups: Pickup[] = [];
    const historyEnabled = labEra === null;
    const attachments: THREE.Object3D[] = [];
    const mashProxyMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshToonMaterial({
        color: "#ffffff",
        vertexColors: true,
        transparent: true,
        opacity: 0.82,
      }),
      96,
    );
    mashProxyMesh.count = 0;
    mashProxyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mashProxyMesh.frustumCulled = false;
    mashGroup.add(mashProxyMesh);
    const mashProxyDummy = new THREE.Object3D();
    const mashProxyRecords: {
      record: MashRecordV4;
      color: string;
    }[] = [];
    let mashProxyIncludesRich = false;
    const richMashLimit = () =>
      qualityTier === "high" ? 24 : qualityTier === "balanced" ? 18 : 12;
    const refreshMashProxy = () => {
      const visibleProxyRecords = [
        ...mashProxyRecords,
        ...(mashProxyIncludesRich
          ? attachments.flatMap((visual) => {
              const record = visual.userData.mashRecord as
                | MashRecordV4
                | undefined;
              return record
                ? [
                    {
                      record,
                      color: String(
                        visual.userData.mashColor ?? activeEra.palette[2],
                      ),
                    },
                  ]
                : [];
            })
          : []),
      ].slice(-96);
      visibleProxyRecords.forEach(({ record, color }, index) => {
        mashProxyDummy.position.set(...record.position);
        mashProxyDummy.rotation.set(...record.rotation);
        const authoredScale = Math.max(...record.scale.map(Math.abs));
        mashProxyDummy.scale.setScalar(
          Math.max(0.07, Math.min(0.42, authoredScale * 0.52)),
        );
        mashProxyDummy.updateMatrix();
        mashProxyMesh.setMatrixAt(index, mashProxyDummy.matrix);
        mashProxyMesh.setColorAt(index, new THREE.Color(color));
      });
      mashProxyMesh.count = visibleProxyRecords.length;
      mashProxyMesh.instanceMatrix.needsUpdate = true;
      if (mashProxyMesh.instanceColor) {
        mashProxyMesh.instanceColor.needsUpdate = true;
      }
      mashProxyMesh.visible = mashProxyMesh.count > 0;
    };
    const setMashProxyLod = (compact: boolean) => {
      if (compact === mashProxyIncludesRich) return;
      mashProxyIncludesRich = compact;
      attachments.forEach((visual) => {
        visual.visible = !compact;
      });
      refreshMashProxy();
    };
    const addMashProxy = (record: MashRecordV4, color: string) => {
      mashProxyRecords.push({ record, color });
      const proxyLimit = Math.max(0, 96 - richMashLimit());
      while (mashProxyRecords.length > proxyLimit) mashProxyRecords.shift();
      refreshMashProxy();
    };
    const popBursts: {
      mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
      born: number;
    }[] = [];
    let spawnClock = 0;

    const makeFieldLike = (visual: THREE.Object3D) => {
      visual.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = Array.isArray(child.material)
            ? child.material.map((material) => material.clone())
            : child.material.clone();
          child.userData.ownsMaterial = true;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            material.transparent = true;
            material.opacity = Math.min(material.opacity, 0.68);
            material.depthWrite = false;
          });
        }
      });
    };

    const disposeVisual = (visual: THREE.Object3D) => {
      if (visual.userData.sharedResources) {
        visual.traverse((child) => {
          if (child instanceof THREE.Sprite) {
            child.material.dispose();
          } else if (child instanceof THREE.Mesh && child.userData.ownsMaterial) {
            const materials = Array.isArray(child.material)
              ? child.material
              : [child.material];
            materials.forEach((material) => material.dispose());
          }
        });
        return;
      }
      visual.traverse((child) => {
        if (
          child instanceof THREE.Mesh ||
          child instanceof THREE.Points ||
          child instanceof THREE.Line
        ) {
          child.geometry.dispose();
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];
          materials.forEach((material) => material.dispose());
        } else if (child instanceof THREE.Sprite) {
          child.material.dispose();
        }
      });
    };

    const visibleMashRecords = mashHistoryRef.current.filter(
      (record) => record.eraId === activeEra.id,
    );
    if (historyEnabled) mashHistoryRef.current = visibleMashRecords;
    const restoredRichStart = Math.max(
      0,
      visibleMashRecords.length - richMashLimit(),
    );
    visibleMashRecords.forEach((record, recordIndex) => {
      const sourceEraIndex = ERAS.findIndex((era) => era.id === record.eraId);
      const sourceEra = ERAS[sourceEraIndex];
      const curio = sourceEra?.curios.find(
        (candidate) => candidate.id === record.curioId,
      );
      if (!curio || sourceEraIndex < 0) return;
      if (recordIndex < restoredRichStart) {
        addMashProxy(record, curio.color);
        return;
      }
      const restoredPosition = new THREE.Vector3(...record.position);
      const legacyInside =
        record.mergedInside && restoredPosition.length() < game.radius * 0.58;
      if (legacyInside) {
        if (restoredPosition.lengthSq() < 0.001) {
          restoredPosition.set(
            pseudo(recordIndex + 1) - 0.5,
            pseudo(recordIndex + 7) - 0.28,
            pseudo(recordIndex + 13) - 0.5,
          );
        }
        restoredPosition.normalize().multiplyScalar(game.radius * 0.74);
        record.position = restoredPosition.toArray() as [number, number, number];
        record.scale = record.scale.map((value) => value * 2.05) as [
          number,
          number,
          number,
        ];
      }
      const visual = makeVisual(curio);
      const restoredMarker = makeMarker(curio.symbol);
      restoredMarker.visible = sourceEraIndex >= activeIndex;
      visual.add(restoredMarker);
      visual.userData.sourceEra = sourceEraIndex;
      visual.position.copy(restoredPosition);
      visual.rotation.set(...record.rotation);
      visual.scale.set(...record.scale);
      visual.userData.mashRecord = record;
      visual.userData.mashColor = curio.color;
      if (record.mergedInside) makeFieldLike(visual);
      mashGroup.add(visual);
      attachments.push(visual);
    });
    const stickingPieces: {
      visual: THREE.Object3D;
      targetScale: THREE.Vector3;
      startedAt: number;
    }[] = [];

    const removePickup = (pickup: Pickup, preserveVisual = false) => {
      scene.remove(pickup.root);
      if (!preserveVisual) disposeVisual(pickup.visual);
    };

    const retireVisibleMash = () => {
      attachments.forEach((attachment) => {
        mashGroup.remove(attachment);
        disposeVisual(attachment);
      });
      attachments.length = 0;
      mashProxyRecords.length = 0;
      refreshMashProxy();
      stickingPieces.length = 0;
      if (historyEnabled) mashHistoryRef.current = [];
    };

    const collapseRichMashToBudget = () => {
      let collapsed = false;
      while (attachments.length > richMashLimit()) {
        const oldest = attachments.shift();
        if (!oldest) break;
        collapsed = true;
        const record = oldest.userData.mashRecord as MashRecordV4 | undefined;
        if (record) {
          addMashProxy(
            record,
            String(oldest.userData.mashColor ?? activeEra.palette[2]),
          );
        }
        const stickingIndex = stickingPieces.findIndex(
          (piece) => piece.visual === oldest,
        );
        if (stickingIndex >= 0) stickingPieces.splice(stickingIndex, 1);
        mashGroup.remove(oldest);
        disposeVisual(oldest);
      }
      if (collapsed) refreshMashProxy();
    };

    const spawnPickup = (seed: number, forcedSourceEra?: number) => {
      const bandRoll = pseudo(seed + 97);
      let chosenEra =
        bandRoll > 0.84 && activeIndex < ERAS.length - 1
          ? activeIndex + 1
          : activeIndex;
      const obstacleLimit = reducedWorldDetail() ? 3 : 5;
      if (
        chosenEra > activeIndex &&
        pickups.filter((pickup) => pickup.sourceEra > activeIndex).length >=
          obstacleLimit
      ) {
        chosenEra = activeIndex;
      }
      const sourceEra = Math.max(
        0,
        Math.min(ERAS.length - 1, forcedSourceEra ?? chosenEra),
      );
      const levelDelta = sourceEra - activeIndex;
      const source = ERAS[sourceEra];
      const curioIndex = Math.floor(pseudo(seed + 67) * source.curios.length);
      const curio = source.curios[curioIndex];
      const identity = collectibleIdentityFor(curio.id, curio.shape);
      let big = levelDelta > 0;
      let size = Math.max(
        0.11,
        0.18 + pseudo(seed + 53) * game.radius * 0.52,
      );
      const root = new THREE.Group();
      const visual = makeVisual(curio, sourceEra >= activeIndex);
      visual.userData.sourceEra = sourceEra;
      visual.scale.setScalar(size);
      visual.updateMatrixWorld(true);
      const visualDimensions = new THREE.Vector3();
      new THREE.Box3().setFromObject(visual).getSize(visualDimensions);
      let visualRadius =
        Math.max(visualDimensions.x, visualDimensions.z) / 2;
      let bulkRadius =
        Math.cbrt(
          Math.max(
            0.000001,
            visualDimensions.x * visualDimensions.y * visualDimensions.z,
          ),
        ) / 2;
      if (levelDelta <= 0 && visualRadius > game.radius * 0.82) {
        const targetRadius = game.radius * (0.42 + pseudo(seed + 139) * 0.34);
        const fit = targetRadius / visualRadius;
        size *= fit;
        visualRadius *= fit;
        bulkRadius *= fit;
        visual.scale.multiplyScalar(fit);
      } else if (levelDelta > 0) {
        const targetRadius = nextLayerObstacleRadius(
          CORE_RADIUS_MAX * MAX_ROLL_ENVELOPE_FACTOR,
        );
        const enlarge = Math.max(
          targetRadius / Math.max(0.01, visualRadius),
          targetRadius / Math.max(0.01, bulkRadius),
        );
        size *= enlarge;
        visualRadius *= enlarge;
        bulkRadius *= enlarge;
        visual.scale.multiplyScalar(enlarge);
      }
      big = visualRadius > game.radius * 1.02;
      visual.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      const marker = sourceEra >= activeIndex ? makeMarker(curio.symbol) : null;
      if (marker) visual.add(marker);
      root.add(visual);
      let spawnX = game.x;
      let spawnZ = game.z;
      let bestClearance = Number.NEGATIVE_INFINITY;
      const attempts = big ? 36 : 18;
      const rollingEnvelope = CORE_RADIUS_MAX * MAX_ROLL_ENVELOPE_FACTOR;
      const chunkSize = worldChunkSize(activeWorldKind);
      const sceneryClearanceAt = (x: number, z: number) => {
        const localX = localChunkCoordinate(x, chunkSize);
        const localZ = localChunkCoordinate(z, chunkSize);
        return sceneryColliders.reduce(
          (minimum, collider) =>
            Math.min(
              minimum,
              circleAabbClearance(
                localX,
                localZ,
                visualRadius + (big ? rollingEnvelope : 0) + 0.45,
                collider.x,
                collider.z,
                collider.halfWidth,
                collider.halfDepth,
              ),
            ),
          Number.POSITIVE_INFINITY,
        );
      };
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const candidateRadius = big
          ? Math.max(
              game.radius + visualRadius + 3.2,
              8 + pseudo(seed + game.id * 7 + attempt * 31) * 36,
            )
          : 4.6 + pseudo(seed + game.id * 7) * 24;
        const candidateAngle = pseudo(seed + 13 + attempt * 19) * Math.PI * 2;
        const candidateX = game.x + Math.cos(candidateAngle) * candidateRadius;
        const candidateZ = game.z + Math.sin(candidateAngle) * candidateRadius;
        const pickupClearance = big
          ? pickups.reduce((minimum, other) => {
              if (!other.big) return minimum;
              const separation = Math.hypot(
                other.root.position.x - candidateX,
                other.root.position.z - candidateZ,
              );
              const required = obstacleCenterGap(
                visualRadius,
                other.visualRadius,
                rollingEnvelope,
              );
              return Math.min(minimum, separation - required);
            }, Number.POSITIVE_INFINITY)
          : Number.POSITIVE_INFINITY;
        const localX = localChunkCoordinate(candidateX, chunkSize);
        const localZ = localChunkCoordinate(candidateZ, chunkSize);
        const corridorClearance =
          big &&
          PERIODIC_WORLD_KINDS.has(activeWorldKind) &&
          (Math.abs(localX) < 16 || Math.abs(localZ) < 16)
            ? -1
            : Number.POSITIVE_INFINITY;
        const clearance = Math.min(
          pickupClearance,
          sceneryClearanceAt(candidateX, candidateZ),
          corridorClearance,
        );
        if (clearance > bestClearance) {
          bestClearance = clearance;
          spawnX = candidateX;
          spawnZ = candidateZ;
        }
        if (clearance >= 0) break;
      }
      if (bestClearance < 0) {
        disposeVisual(visual);
        return false;
      }
      root.position.set(spawnX, Math.max(0.22, size * 0.48), spawnZ);
      const baseY = root.position.y;
      const wiggle = pseudo(seed + 181) * Math.PI * 2;
      root.rotation.y = pseudo(seed + 91) * Math.PI * 2;
      scene.add(root);
      pickups.push({
        root,
        visual,
        marker,
        curio,
        sourceEra,
        size,
        visualRadius,
        bulkRadius,
        big,
        baseY,
        wiggle,
        identity,
      });
      game.id += 1;
      return true;
    };

    const activePickupBudget = () => {
      const base = pickupBudget(width, qualityTier);
      if (activeIndex === 0) return Math.floor(base * 0.32);
      if (activeIndex <= 3) return Math.floor(base * 0.55);
      return base;
    };

    const populate = () => {
      const desiredPickupCount = activePickupBudget();
      pickups = pickups.filter((pickup) => {
        const distance = Math.hypot(
          pickup.root.position.x - game.x,
          pickup.root.position.z - game.z,
        );
        if (distance < 54) return true;
        removePickup(pickup);
        return false;
      });
      let attempts = 0;
      while (pickups.length < desiredPickupCount && attempts < 18) {
        spawnPickup(
          performance.now() * 0.002 + (pickups.length + attempts) * 101,
        );
        attempts += 1;
      }
    };

    let scaleTransitionStarted = -1;

    const collect = (pickup: Pickup, now: number) => {
      game.picked += 1;
      game.lastPickup = now / 1000;
      const sourceEra = ERAS[pickup.sourceEra];
      collectionRef.current = aggregatePickups(
        [
          {
            eraId: sourceEra.id,
            curioId: pickup.curio.id,
            pickedAt: Date.now(),
          },
        ],
        collectionRef.current,
      );
      setCollection([...collectionRef.current]);
      const isCurrentScale = pickup.sourceEra === activeIndex;
      const gameplayBulkFactor = GAMEPLAY_BULK_FACTORS[pickup.curio.shape];
      game.progress = progressAfterPickup(
        game.progress,
        pickup.sourceEra,
        activeIndex,
        collectionProgressGain(
          game.radius,
          pickup.bulkRadius,
          gameplayBulkFactor,
          game.mode,
        ),
      );
      if (isCurrentScale) {
        game.radius = radiusForLayerProgress(game.progress);
      }
      const contributionLabel =
        gameplayBulkFactor >= 1
          ? "chunky gameplay bulk"
          : gameplayBulkFactor < 0.35
            ? "light gameplay bulk"
            : "gameplay bulk";
      if (isCurrentScale) {
        const pickupQuip = PICKUP_QUIPS[game.picked % PICKUP_QUIPS.length];
        setToast(`${pickup.curio.name}: ${pickupQuip} · ${contributionLabel}.`);
        setLastFact({
          name: pickup.curio.name,
          fact: pickup.curio.fact,
          source: pickup.curio.source ?? activeEra.sources[0],
        });
        playPickupSound(pickup.curio, pickup.sourceEra);
        faceReactionUntil = now + 240;
        ballFaceMaterial.map = chompFaceTexture;
        ballFaceMaterial.needsUpdate = true;
        const popBurst = new THREE.Mesh(
          new THREE.TorusGeometry(
            Math.max(0.32, pickup.visualRadius * 0.72),
            0.055,
            6,
            28,
          ),
          new THREE.MeshBasicMaterial({
            color: pickup.curio.color,
            transparent: true,
            opacity: 0.86,
            depthWrite: false,
          }),
        );
        popBurst.position.copy(pickup.root.position);
        popBurst.rotation.x = Math.PI / 2;
        scene.add(popBurst);
        popBursts.push({ mesh: popBurst, born: now });
      }

      pickup.root.remove(pickup.visual);
      removePickup(pickup, true);
      if (isCurrentScale) {
        const direction = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.24,
          Math.random() - 0.5,
        ).normalize();
        const fieldLike =
          activeEra.realm === "prephysical" || activeEra.realm === "particle";
        pickup.visual.position.copy(
          direction.multiplyScalar(game.radius * (fieldLike ? 0.76 : 0.7)),
        );
        pickup.visual.scale.multiplyScalar(fieldLike ? 1.02 : 0.96);
        pickup.visual.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI,
        );
        if (fieldLike) {
          makeFieldLike(pickup.visual);
        } else {
          pickup.visual.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
        }
        mashGroup.add(pickup.visual);
        attachments.push(pickup.visual);
        const targetScale = pickup.visual.scale.clone();
        pickup.visual.scale.multiplyScalar(0.22);
        stickingPieces.push({
          visual: pickup.visual,
          targetScale,
          startedAt: now,
        });
        const mashRecord: MashRecordV4 = {
          eraId: sourceEra.id,
          curioId: pickup.curio.id,
          position: pickup.visual.position.toArray() as [number, number, number],
          rotation: [
            pickup.visual.rotation.x,
            pickup.visual.rotation.y,
            pickup.visual.rotation.z,
          ],
          scale: targetScale.toArray() as [number, number, number],
          mergedInside: fieldLike,
        };
        pickup.visual.userData.mashRecord = mashRecord;
        pickup.visual.userData.mashColor = pickup.curio.color;
        if (historyEnabled) {
          mashHistoryRef.current.push(mashRecord);
          if (mashHistoryRef.current.length > 96) {
            mashHistoryRef.current.shift();
          }
        }
        collapseRichMashToBudget();
        if (mashProxyIncludesRich) {
          pickup.visual.visible = false;
          refreshMashProxy();
        }
      } else {
        disposeVisual(pickup.visual);
      }
      if (game.progress >= 1 && scaleTransitionStarted < 0) {
        scaleTransitionStarted = now;
        eraTransitionAge = 0;
        setToast("Scale shift! You grow while this whole layer settles beneath you.");
        ping(350 + activeIndex * 18, true);
      }
    };

    let width = 0;
    let height = 0;
    const resize = () => {
      const box = mount.getBoundingClientRect();
      width = box.width;
      height = box.height;
      renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio || 1,
          pixelRatioCap(width <= 860, qualityTier),
        ),
      );
      renderer.setSize(width, height, false);
      camera.aspect = Math.max(0.2, width / height);
      camera.fov = width <= 860 ? 56 : 46;
      camera.updateProjectionMatrix();
    };

    resize();
    populate();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let frame = 0;
    let hudClock = 0;
    let rollRadiusClock = 0;
    let performanceWindowStarted = performance.now();
    let performanceFrames = 0;
    let measuredFps = 60;
    let effectiveRollRadius = game.radius;
    const rollBounds = new THREE.Box3();
    const rollDimensions = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const farPickupDummy = new THREE.Object3D();
    let transitionWorldScale = 1;
    const animate = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (document.hidden || modalOpenRef.current) {
        performanceWindowStarted = now;
        performanceFrames = 0;
        frame = requestAnimationFrame(animate);
        return;
      }
      performanceFrames += 1;
      const performanceWindow = now - performanceWindowStarted;
      if (performanceWindow >= 5000) {
        measuredFps = (performanceFrames * 1000) / performanceWindow;
        const performanceBudget = worldPerformanceBudget(qualityTier);
        const overRenderBudget =
          renderer.info.render.calls > performanceBudget.maxDrawCalls ||
          renderer.info.render.triangles > performanceBudget.maxTriangles;
        const budgetAdjustedFps = overRenderBudget
          ? Math.min(measuredFps, qualityTier === "high" ? 40 : 28)
          : measuredFps;
        const nextQualityTier = qualityTierForFps(
          budgetAdjustedFps,
          qualityTier,
        );
        if (nextQualityTier !== qualityTier) {
          qualityTier = nextQualityTier;
          renderer.setPixelRatio(
            Math.min(
              window.devicePixelRatio || 1,
              pixelRatioCap(width <= 860, qualityTier),
            ),
          );
          renderer.setSize(width, height, false);
          renderer.shadowMap.enabled = qualityTier !== "battery";
          keyLight.castShadow = qualityTier !== "battery";
          const nextBudget = activePickupBudget();
          while (pickups.length > nextBudget) {
            const pickup = pickups.pop();
            if (pickup) removePickup(pickup);
          }
          collapseRichMashToBudget();
          const qualityViewScale = semanticViewScale(
            activeIndex,
            game.lens,
            ERAS.length,
          );
          rebuildEnvironment(activeIndex);
          buildSubstrate(qualityViewScale);
          applyGroundScaleTexture(qualityViewScale);
        }
        performanceWindowStarted = now;
        performanceFrames = 0;
      }
      rollRadiusClock += dt;
      if (rollRadiusClock > 0.12) {
        rollGroup.updateMatrixWorld(true);
        rollBounds.setFromObject(rollGroup).getSize(rollDimensions);
        const visibleEnvelope =
          Math.max(rollDimensions.x, rollDimensions.y, rollDimensions.z) / 2;
        effectiveRollRadius = Math.max(
          game.radius,
          Math.min(game.radius * 1.75, visibleEnvelope * 0.94),
        );
        rollRadiusClock = 0;
      }

      if (game.running && scaleTransitionStarted < 0) {
        let inputX = 0;
        let inputZ = 0;
        if (keysRef.current.w || keysRef.current.arrowup) inputZ -= 1;
        if (keysRef.current.s || keysRef.current.arrowdown) inputZ += 1;
        if (keysRef.current.a || keysRef.current.arrowleft) inputX -= 1;
        if (keysRef.current.d || keysRef.current.arrowright) inputX += 1;
        const joystick = joystickRef.current;
        if (joystick.active) {
          inputX += Math.max(-1, Math.min(1, (joystick.x - joystick.originX) / 62));
          inputZ += Math.max(-1, Math.min(1, (joystick.y - joystick.originY) / 62));
        }
        const length = Math.hypot(inputX, inputZ);
        if (length > 0.05) {
          inputX /= Math.max(1, length);
          inputZ /= Math.max(1, length);
          const boost = keysRef.current[" "] ? 1.26 : 1;
          game.vx += inputX * 17.8125 * boost * dt;
          game.vz += inputZ * 17.8125 * boost * dt;
        }
        const drag = Math.pow(0.09, dt);
        game.vx *= drag;
        game.vz *= drag;
        const speed = Math.hypot(game.vx, game.vz);
        const maxSpeed = keysRef.current[" "] ? 12.1875 : 9.75;
        if (speed > maxSpeed) {
          game.vx = (game.vx / speed) * maxSpeed;
          game.vz = (game.vz / speed) * maxSpeed;
        }
        game.x += game.vx * dt;
        game.z += game.vz * dt;
        const colliderChunkSize = worldChunkSize(activeWorldKind);
        const shiftX = floatingOriginShift(
          game.x,
          colliderChunkSize,
        );
        const shiftZ = floatingOriginShift(
          game.z,
          colliderChunkSize,
        );
        if (shiftX !== 0 || shiftZ !== 0) {
          game.originX += shiftX;
          game.originZ += shiftZ;
          game.x -= shiftX;
          game.z -= shiftZ;
          pickups.forEach((pickup) => {
            pickup.root.position.x -= shiftX;
            pickup.root.position.z -= shiftZ;
          });
          popBursts.forEach((burst) => {
            burst.mesh.position.x -= shiftX;
            burst.mesh.position.z -= shiftZ;
          });
          camera.position.x -= shiftX;
          camera.position.z -= shiftZ;
        }
        const colliderChunkX =
          Math.round(game.x / colliderChunkSize) * colliderChunkSize;
        const colliderChunkZ =
          Math.round(game.z / colliderChunkSize) * colliderChunkSize;
        sceneryColliders.forEach((collider) => {
          const collision = resolveCircleAabbCollision(
            game.x,
            game.z,
            game.vx,
            game.vz,
            effectiveRollRadius,
            colliderChunkX + collider.x,
            colliderChunkZ + collider.z,
            collider.halfWidth,
            collider.halfDepth,
          );
          game.x = collision.x;
          game.z = collision.z;
          game.vx = collision.vx;
          game.vz = collision.vz;
        });
        rollGroup.rotation.x += (game.vz * dt) / Math.max(0.5, game.radius);
        rollGroup.rotation.z -= (game.vx * dt) / Math.max(0.5, game.radius);

        for (const pickup of pickups) {
          const dx = pickup.root.position.x - game.x;
          const dz = pickup.root.position.z - game.z;
          const distance = Math.hypot(dx, dz);
          if (
            labEra === null &&
            distance < effectiveRollRadius + pickup.visualRadius
          ) {
            if (
              canCollectPickup(
                pickup.sourceEra,
                activeIndex,
                pickup.visualRadius,
                effectiveRollRadius,
              )
            ) {
              collect(pickup, now);
              pickup.root.position.x = Number.POSITIVE_INFINITY;
            } else {
              const collision = resolveCircularCollision(
                game.x,
                game.z,
                game.vx,
                game.vz,
                pickup.root.position.x,
                pickup.root.position.z,
                effectiveRollRadius + pickup.visualRadius,
              );
              game.x = collision.x;
              game.z = collision.z;
              game.vx = collision.vx;
              game.vz = collision.vz;
              if (now / 1000 - game.lastPickup > 0.8) {
                setToast(`Oof! ${pickup.curio.name} is still too chunky. Snack smaller first.`);
              }
            }
          }
        }
        pickups = pickups.filter((pickup) => Number.isFinite(pickup.root.position.x));
      }

      if (scaleTransitionStarted >= 0) {
        const progress = Math.min(1, (now - scaleTransitionStarted) / 1800);
        const transition = scaleTransitionFrame(progress);
        transitionWorldScale = transition.worldScale;
        playerRoot.scale.setScalar(transition.playerScale);
        environmentGroup.scale.setScalar(transitionWorldScale);
        substrateGroup.scale.setScalar(transitionWorldScale);
        ground.scale.setScalar(transitionWorldScale);
        grid.scale.setScalar(transitionWorldScale);
        dustField.scale.setScalar(transitionWorldScale);
        if (progress >= 1) {
          const nextIndex = Math.min(ERAS.length - 1, game.era + 1);
          const unlockedDeepLens =
            nextIndex === ERAS.length - 1 && game.era < nextIndex;
          game.era = nextIndex;
          game.progress = 0;
          game.radius = CORE_RADIUS_MIN;
          game.zooms += 1;
          game.vx *= 0.25;
          game.vz *= 0.25;
          playerRoot.scale.setScalar(1);
          transitionWorldScale = 1;
          environmentGroup.scale.setScalar(1);
          substrateGroup.scale.setScalar(1);
          ground.scale.setScalar(1);
          grid.scale.setScalar(1);
          dustField.scale.setScalar(1);
          retireVisibleMash();
          pickups.forEach((pickup) => removePickup(pickup));
          pickups = [];
          applyEraTheme(nextIndex, true);
          if (unlockedDeepLens) {
            setToast(
              "Known-universe journey complete! The free lens now opens from 1/256× to 256×.",
            );
          }
          scaleTransitionStarted = -1;
          populate();
        }
      }

      const nextActiveIndex = labEra ?? game.era;
      if (nextActiveIndex !== activeIndex) {
        retireVisibleMash();
        applyEraTheme(nextActiveIndex, true);
        pickups = pickups.filter((pickup) => {
          const inActiveBand =
            pickup.sourceEra >= activeIndex - 3 && pickup.sourceEra <= activeIndex + 3;
          if (!inActiveBand) removePickup(pickup);
          return inActiveBand;
        });
        pickups.forEach((pickup) => {
          if (pickup.marker) pickup.marker.visible = pickup.sourceEra >= activeIndex;
        });
        attachments.forEach((attachment) => {
          const sourceEra = Number(attachment.userData.sourceEra ?? activeIndex);
          attachment.traverse((child) => {
            if (child instanceof THREE.Sprite) child.visible = sourceEra >= activeIndex;
          });
        });
      }

      const continuousViewScale = semanticViewScale(
        activeIndex,
        game.lens,
        ERAS.length,
      );
      const nextResidencyKey = substrateKeyFor(continuousViewScale);
      if (nextResidencyKey !== semanticResidencyKey) {
        buildSubstrate(continuousViewScale);
        applyGroundScaleTexture(continuousViewScale);
      }

      spawnClock += dt;
      const lowPickupThreshold = Math.floor(activePickupBudget() * 0.84);
      if (spawnClock > 0.5 || pickups.length < lowPickupThreshold) {
        populate();
        spawnClock = 0;
      }

      const floatHeight =
        game.radius * 0.94 + (early ? Math.sin(now * 0.0017) * 0.035 : 0);
      playerRoot.position.set(game.x, floatHeight, game.z);
      const mashProjectedSize = projectedDiameterPixels(
        effectiveRollRadius * 2 * transitionWorldScale,
        camera.position.distanceTo(playerRoot.position),
        camera.fov,
        height,
      );
      setMashProxyLod(lodForProjectedDiameter(mashProjectedSize) !== "rich");
      const sceneryProjectedSize = projectedDiameterPixels(
        3 * transitionWorldScale,
        camera.position.distanceTo(playerRoot.position),
        camera.fov,
        height,
      );
      setCentralSceneryLod(
        PERIODIC_WORLD_KINDS.has(activeWorldKind) &&
          lodForProjectedDiameter(sceneryProjectedSize) !== "rich",
      );
      const activeChunkSize = worldChunkSize(activeWorldKind);
      const chunkX = Math.round(game.x / activeChunkSize) * activeChunkSize;
      const chunkZ = Math.round(game.z / activeChunkSize) * activeChunkSize;
      if (PERIODIC_WORLD_KINDS.has(activeWorldKind)) {
        environmentGroup.position.set(chunkX, 0, chunkZ);
      } else {
        // Sky/planet/cosmic environments are centered continuously instead of
        // snapping a single diorama at chunk boundaries.
        environmentGroup.position.set(game.x, 0, game.z);
      }
      substrateGroup.position.set(chunkX, 0, chunkZ);
      ground.position.set(game.x, 0, game.z);
      if (groundTexture) {
        groundTexture.offset.set(
          (game.x + game.originX) * 0.018,
          -(game.z + game.originZ) * 0.018,
        );
      }
      const gridCell = 170 / 90;
      const phaseX = game.x + game.originX;
      const phaseZ = game.z + game.originZ;
      grid.position.set(
        phaseX -
          THREE.MathUtils.euclideanModulo(phaseX, gridCell) -
          game.originX,
        0.012,
        phaseZ -
          THREE.MathUtils.euclideanModulo(phaseZ, gridCell) -
          game.originZ,
      );
      dustField.position.set(game.x, 0, game.z);
      const faceScale = game.radius * 0.94;
      ballFace.position.set(0, game.radius * 0.1, game.radius * 0.86);
      ballFace.scale.set(faceScale, faceScale, 1);
      if (faceReactionUntil && now >= faceReactionUntil) {
        faceReactionUntil = 0;
        ballFaceMaterial.map = happyFaceTexture;
        ballFaceMaterial.needsUpdate = true;
      }
      const wobble = early ? 0.055 : Math.min(0.035, attachments.length * 0.0007);
      const coreShare = early
        ? Math.max(0.18, 0.82 - attachments.length * 0.05)
        : Math.max(0.32, 0.78 - attachments.length * 0.009);
      coreMaterial.opacity = early
        ? Math.max(0.08, 0.58 - attachments.length * 0.04)
        : Math.max(0.1, 0.56 - attachments.length * 0.012);
      core.scale.set(
        game.radius * coreShare * (1 + Math.sin(now * 0.0021) * wobble),
        game.radius * coreShare * (1 + Math.sin(now * 0.0027 + 1.3) * wobble),
        game.radius * coreShare * (1 + Math.sin(now * 0.0019 + 2.4) * wobble),
      );
      foamCluster.visible = early && attachments.length < 11;
      foamCluster.scale.setScalar(
        game.radius * Math.max(0.38, 0.95 - attachments.length * 0.055),
      );
      foamCluster.rotation.y += dt * 0.18;
      foamCluster.rotation.x -= dt * 0.09;
      innerGlow.rotation.y += dt * 0.3;
      dustField.rotation.y += dt * (early ? 0.014 : 0.003);
      glowLight.position.set(game.x + 4, floatHeight + 4, game.z - 3);

      let farPickupCount = 0;
      let richPickupCount = 0;
      const richPickupBudget =
        worldPerformanceBudget(qualityTier).maxRichObjects;
      pickups.forEach((pickup, index) => {
        const distance = Math.hypot(
          pickup.root.position.x - game.x,
          pickup.root.position.z - game.z,
        );
        pickup.big = pickup.visualRadius > effectiveRollRadius * 1.08;
        const projectedSize = projectedDiameterPixels(
          pickup.visualRadius * 2 * transitionWorldScale,
          camera.position.distanceTo(pickup.root.position),
          camera.fov,
          height,
        );
        const projectedLod = lodForProjectedDiameter(projectedSize);
        const useRichVisual =
          richPickupCount < richPickupBudget &&
          (projectedLod === "rich" ||
            (pickup.big && projectedLod === "simple" && distance < 30));
        pickup.root.visible = useRichVisual;
        if (pickup.marker) {
          pickup.marker.visible =
            useRichVisual &&
            pickup.sourceEra >= activeIndex &&
            distance < 20;
        }
        const identity = pickup.identity;
        const motionTime =
          now * 0.001 * identity.motionRate + pickup.wiggle + index * 0.017;
        const motionAmount =
          identity.motionAmount * (early ? 1.35 : 1) * (pickup.big ? 0.65 : 1);
        const baseSpin = pickup.big ? 0.07 : 0.18;
        pickup.root.position.y = pickup.baseY;
        if (identity.motion !== "tumble") {
          pickup.root.rotation.x *= Math.pow(0.002, dt);
        }
        pickup.root.rotation.z *= Math.pow(0.002, dt);
        const motionScale =
          identity.motion === "pulse"
            ? 1 + Math.sin(motionTime * 3.1) * 0.045
            : 1;

        if (!useRichVisual) {
          farPickupDummy.position.set(
            pickup.root.position.x,
            pickup.baseY + Math.sin(motionTime * 1.7) * motionAmount * 0.45,
            pickup.root.position.z,
          );
          farPickupDummy.rotation.set(
            0,
            motionTime * 0.13,
            Math.sin(motionTime) * 0.12,
          );
          farPickupDummy.scale.setScalar(
            pickup.visualRadius * motionScale * transitionWorldScale,
          );
          farPickupDummy.updateMatrix();
          farPickupMesh.setMatrixAt(farPickupCount, farPickupDummy.matrix);
          let farColor = pickupColorCache.get(pickup.curio.color);
          if (!farColor) {
            farColor = new THREE.Color(pickup.curio.color);
            pickupColorCache.set(pickup.curio.color, farColor);
          }
          farPickupMesh.setColorAt(
            farPickupCount,
            farColor,
          );
          farPickupCount += 1;
          return;
        }

        richPickupCount += 1;
        pickup.root.scale.setScalar(motionScale * transitionWorldScale);

        switch (identity.motion) {
          case "bob":
            pickup.root.position.y += Math.sin(motionTime * 2.2) * motionAmount;
            pickup.root.rotation.y += dt * baseSpin;
            break;
          case "flutter":
            pickup.root.position.y += Math.sin(motionTime * 3.7) * motionAmount * 0.7;
            pickup.root.rotation.z =
              Math.sin(motionTime * 7.2) * motionAmount * 2.3;
            break;
          case "orbit":
            pickup.root.position.y += Math.cos(motionTime * 1.8) * motionAmount * 0.45;
            pickup.root.rotation.x =
              Math.sin(motionTime * 2.1) * motionAmount * 1.8;
            pickup.root.rotation.y += dt * (baseSpin + identity.motionRate * 0.35);
            break;
          case "pulse":
            pickup.root.position.y +=
              (0.35 + Math.sin(motionTime * 3.1) * 0.65) * motionAmount;
            pickup.root.rotation.y += dt * baseSpin;
            pickup.root.rotation.z =
              Math.sin(motionTime * 1.55) * motionAmount * 0.6;
            break;
          case "shimmy":
            pickup.root.position.y += Math.sin(motionTime * 2) * motionAmount * 0.35;
            pickup.root.rotation.z =
              Math.sin(motionTime * 8.5) * motionAmount * 2;
            break;
          case "spin":
            pickup.root.position.y += Math.sin(motionTime * 1.5) * motionAmount * 0.4;
            pickup.root.rotation.y += dt * (0.55 + identity.motionRate * 0.55);
            break;
          case "tumble":
            pickup.root.position.y += Math.abs(Math.sin(motionTime * 1.9)) * motionAmount;
            pickup.root.rotation.x += dt * (0.45 + identity.motionRate * 0.32);
            pickup.root.rotation.y += dt * (0.35 + identity.motionRate * 0.2);
            break;
          case "wobble":
            pickup.root.position.y += Math.sin(motionTime * 2.4) * motionAmount * 0.55;
            pickup.root.rotation.x =
              Math.sin(motionTime * 2.7) * motionAmount * 1.4;
            pickup.root.rotation.z =
              Math.cos(motionTime * 2.1) * motionAmount * 1.8;
            break;
        }
      });
      farPickupMesh.count = farPickupCount;
      farPickupMesh.visible = farPickupCount > 0;
      farPickupMesh.instanceMatrix.needsUpdate = true;
      if (farPickupMesh.instanceColor) {
        farPickupMesh.instanceColor.needsUpdate = true;
      }

      for (let index = stickingPieces.length - 1; index >= 0; index -= 1) {
        const piece = stickingPieces[index];
        const progress = Math.min(1, (now - piece.startedAt) / 280);
        const ease = 1 - (1 - progress) ** 3;
        const pop = 0.22 + ease * 0.78 + Math.sin(progress * Math.PI) * 0.15;
        piece.visual.scale.copy(piece.targetScale).multiplyScalar(pop);
        if (progress >= 1) {
          piece.visual.scale.copy(piece.targetScale);
          stickingPieces.splice(index, 1);
        }
      }

      for (let index = popBursts.length - 1; index >= 0; index -= 1) {
        const burst = popBursts[index];
        const progress = Math.min(1, (now - burst.born) / 360);
        burst.mesh.scale.setScalar(0.35 + progress * 2.4);
        burst.mesh.material.opacity = (1 - progress) * 0.86;
        burst.mesh.position.y += dt * 0.65;
        if (progress >= 1) {
          scene.remove(burst.mesh);
          burst.mesh.geometry.dispose();
          burst.mesh.material.dispose();
          popBursts.splice(index, 1);
        }
      }

      const mobileView = width <= 860;
      desiredCamera.set(
        game.x + game.vx * 0.24 * game.lens,
        floatHeight +
          ((mobileView ? 7.1 : 5.2) + game.radius * 1.4) * game.lens,
        game.z +
          ((mobileView ? 13.2 : 9.5) + game.radius * 2.1) * game.lens,
      );
      eraTransitionAge = Math.min(3, eraTransitionAge + dt);
      if (eraTransitionAge < 2.6) {
        const pullback = Math.sin((eraTransitionAge / 2.6) * Math.PI);
        desiredCamera.y += pullback * (mobileView ? 5.2 : 7) * game.lens;
        desiredCamera.z += pullback * (mobileView ? 8 : 11) * game.lens;
      }
      const desiredNear = Math.max(
        0.0005,
        0.06 * Math.min(1, game.lens),
      );
      const desiredFar = Math.max(220, game.lens * 96);
      if (
        Math.abs(camera.near - desiredNear) > 0.0001 ||
        Math.abs(camera.far - desiredFar) > 1
      ) {
        camera.near = desiredNear;
        camera.far = desiredFar;
        camera.updateProjectionMatrix();
      }
      camera.position.lerp(desiredCamera, 1 - Math.pow(0.002, dt));
      cameraTarget.set(game.x, floatHeight * 0.82, game.z - 0.7);
      camera.lookAt(cameraTarget);

      hudClock += dt;
      if (hudClock > 0.14) {
        const journeyEra = game.era;
        const displayIndex = labEra ?? journeyEra;
        const progress =
          labEra !== null
            ? 0
            : game.progress;
        setHud({
          hours: journeyHoursForEraProgress(journeyEra, game.progress),
          picked: game.picked,
          era: displayIndex,
          journeyEra,
          progress,
          radius: game.radius,
          lens: game.lens,
          zooms: game.zooms,
          quality: qualityTier,
          fps: measuredFps,
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
        });
        hudClock = 0;
      }

      if (labEra === null && now - game.lastSave > 5000) {
        persistSnapshot();
        game.lastSave = now;
      }

      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      pickups.forEach((pickup) => removePickup(pickup));
      disposeEnvironment();
      substrateGroup.traverse((object) => {
        if (object instanceof THREE.Points) {
          object.geometry.dispose();
          object.material.dispose();
        }
      });
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        } else if (object instanceof THREE.Sprite) {
          object.material.dispose();
        }
      });
      markerTextures.forEach((texture) => texture.dispose());
      visualTemplates.forEach((template) => disposeVisual(template));
      visualTemplates.clear();
      happyFaceTexture.dispose();
      chompFaceTexture.dispose();
      groundTexture?.dispose();
      coreSurfaceTexture?.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
      grid.geometry.dispose();
      gridMaterials.forEach((material) => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
    };
    void bootScene().then((cleanup) => {
      if (disposed) cleanup?.();
      else disposeScene = cleanup;
    });
    return () => {
      disposed = true;
      disposeScene?.();
    };
  }, [started, labEra, persistSnapshot, ping, playPickupSound]);

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
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
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!joystickRef.current.active) return;
    joystickRef.current.x = event.clientX;
    joystickRef.current.y = event.clientY;
  };
  const pointerUp = () => {
    joystickRef.current.active = false;
  };
  const wheelLens = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!started || modalOpenRef.current) return;
    event.preventDefault();
    adjustLens(event.deltaY > 0 ? 1.08 : 0.92);
  };

  const era = ERAS[hud.era];
  const journeyIndex = hud.journeyEra;
  const nextEra = ERAS[Math.min(journeyIndex + 1, ERAS.length - 1)];
  const scale =
    labEra === null
      ? formatEraScale(journeyIndex, hud.progress)
      : formatEraScale(labEra, 0);
  const atlasItem = ERAS[atlasEra];
  const collectibleCount = ERAS.reduce(
    (total, item) => total + item.curios.length,
    0,
  );
  const scienceSourceCount = new Set(
    ERAS.flatMap((item) => item.sources.map((source) => source.url)),
  ).size;
  const semanticScale = semanticViewScale(
    labEra ?? journeyIndex,
    hud.lens,
    ERAS.length,
  );
  const semanticFoundationIndex = Math.ceil(semanticScale) - 1;
  const semanticFoundation =
    semanticFoundationIndex >= 0 ? ERAS[semanticFoundationIndex] : null;

  return (
    <main className="shell" data-release="v17-nested-worlds">
      <div
        ref={mountRef}
        className={`world ${started ? "started" : "awaiting-start"}`}
        style={
          {
            "--pop": era.palette[2],
            "--deep": era.palette[0],
          } as React.CSSProperties
        }
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onWheel={wheelLens}
      >
        <header className="topbar hud">
          <div className="brand">
            <div className="brand-ball" aria-hidden="true">✦</div>
            <div>
              <b>QUARKATAMARI</b>
              <small>the scale of everything</small>
            </div>
          </div>
          <div className="actions">
            <button
              aria-label="Open rolled-up field guide"
              onClick={() => {
                setShowAtlas(false);
                setShowGuide(true);
              }}
            >
              <span aria-hidden="true">✦</span> <span>Field guide</span>
            </button>
            <button
              onClick={() => {
                setShowGuide(false);
                setAtlasEra(journeyIndex);
                setShowAtlas(true);
              }}
              aria-label="Open scale and science atlas"
            >
              <span aria-hidden="true">⌁</span> <span>Scale & science</span>
            </button>
            <button
              className="sound"
              onClick={toggleSound}
              aria-label={sound ? "Mute sound" : "Turn on sound"}
            >
              {sound ? "♪" : "×"}
            </button>
          </div>
        </header>

        {labEra !== null && (
          <div className="lab-banner hud">
            <span>Scale Lab preview · progress paused</span>
            <button onClick={returnToJourney}>Return to journey</button>
          </div>
        )}

        <section className="scale-card hud">
          <div className="kicker">
            <span>{era.name}</span>
            <span className={`confidence ${confidenceClass(era.confidence)}`}>
              {era.confidence}
            </span>
          </div>
          <div className="scale">{scale}</div>
          <div className="quip">{era.quip}</div>
          <div className="track">
            <i style={{ width: `${Math.max(1.5, hud.progress * 100)}%` }} />
          </div>
          <div className="meta">
            <span>{labEra === null ? `Next: ${nextEra.name}` : "Scale Lab specimen"}</span>
            <span>{labEra === null ? `${(hud.progress * 100).toFixed(2)}%` : "PREVIEW"}</span>
          </div>
          <div
            className="lens-control"
            aria-label="Free scale lens"
            title="Optical zoom also selects which earlier layer is resolved as the non-interactive fabric underfoot; it never changes journey progress."
          >
            <button
              type="button"
              onClick={() => adjustLens(0.82)}
              aria-label="Zoom camera in"
            >
              −
            </button>
            <span>
              {formatLens(hud.lens)}× lens ·{" "}
              {semanticFoundation
                ? `${semanticFoundation.name} fabric`
                : "no prior fabric"}
            </span>
            <button
              type="button"
              onClick={() => adjustLens(1.22)}
              aria-label="Zoom camera out"
            >
              +
            </button>
          </div>
        </section>

        <aside className="stats hud">
          <div><b>{hud.picked.toLocaleString()}</b><small>things collected</small></div>
          <i />
          <div><b>{journeyIndex}</b><small>layers underfoot</small></div>
          <i />
          <div><b>{hud.zooms}</b><small>scale shifts</small></div>
        </aside>

        <aside className="fact-card hud">
          <div className="fact-kicker">WHAT YOU JUST ROLLED UP</div>
          <h2>{lastFact.name}</h2>
          <p>{lastFact.fact}</p>
          <div className="fact-actions">
            <a
              className="fact-source"
              href={lastFact.source.url}
              target="_blank"
              rel="noreferrer"
            >
              {lastFact.source.organization} · {lastFact.source.label} ↗
            </a>
            <button
              type="button"
              onClick={() => {
                setShowAtlas(false);
                setShowGuide(true);
              }}
            >
              See every find
            </button>
          </div>
        </aside>

        <div className="toast hud" role="status" aria-live="polite">
          <span>✦</span>
          {toast}
        </div>

        <div className="controls hud">
          <span><kbd>WASD</kbd> / arrows to roll</span>
          <span><kbd>SPACE</kbd> to surge</span>
          <span><kbd>I</kbd> science</span>
          <span><kbd>G</kbd> field guide</span>
          <span className="quality-mode">
            {hud.quality} · {Math.round(hud.fps)} fps · {hud.drawCalls} draws ·{" "}
            {Math.round(hud.triangles / 1000)}k tris
          </span>
        </div>
        <div className="touch-tip hud">◎ drag anywhere to roll</div>

        {!started && (
          <section className="welcome modal">
            <div className="eyebrow">BEGIN WHERE THE MAP RUNS OUT</div>
            <h1>
              You are not a ball.
              <br />
              <em>Not yet.</em>
            </h1>
            <p className="welcome-lead">
              Start in a deliberately silly theory playground: foam bubbles,
              vibrating strings, topology questions, even musical notes. Collect
              enough of the current layer to grow. At each scale shift, the old
              world shrinks into the textured field beneath you.
            </p>
            <div className="science-caveat">
              <b>Scientific honesty:</b> everything in the opening playground is
              explicitly speculative. “Rolling” before matter exists is a navigation
              metaphor. Physical footprint alone decides what fits; shape-specific
              gameplay bulk only tunes growth. Experimental anchoring begins at
              the particle frontier, named measured particles follow, and metre
              labels stop when known cosmology does.
            </div>
            <div className="mode-picker" role="group" aria-label="Choose game pace">
              <button
                type="button"
                className={gameMode === "journey" ? "selected" : ""}
                aria-pressed={gameMode === "journey"}
                onClick={() => chooseMode("journey")}
              >
                <b>Long game</b>
                <span>40× the collecting journey · default</span>
              </button>
              <button
                type="button"
                className={gameMode === "learning" ? "selected" : ""}
                aria-pressed={gameMode === "learning"}
                onClick={() => chooseMode("learning")}
              >
                <b>Learning tour</b>
                <span>See every scale quickly</span>
              </button>
            </div>
            <button className="start" onClick={begin}>
              <span>Begin becoming</span>
              <b>→</b>
            </button>
            <div className="welcome-foot">
              <span>{collectibleCount} UNIQUE SPECIMENS</span><span>•</span>
              <span>{ERAS.length} SCALE LAYERS</span><span>•</span>
              <span>{scienceSourceCount} PRIMARY LINKS</span><span>•</span>
              <span>THEORY ON BOTH ENDS</span>
            </div>
          </section>
        )}

        {showAtlas && (
          <dialog
            ref={atlasDialogRef}
            className="atlas-bg modal"
            aria-label="Scale and science atlas"
            onCancel={(event) => {
              event.preventDefault();
              setShowAtlas(false);
            }}
          >
            <div className="atlas">
              <header>
                <div>
                  <div className="eyebrow">THE RIDICULOUSLY LONG, HONEST VIEW</div>
                  <h2>Scale & science</h2>
                  <p>
                    Preview any era without changing your save. Confidence labels
                    separate observations from models, unknowns, and deliberate fiction.
                  </p>
                  <div className="atlas-mode" role="group" aria-label="Game pace">
                    <span>GAME PACE</span>
                    <button
                      type="button"
                      aria-pressed={gameMode === "journey"}
                      onClick={() => chooseMode("journey")}
                    >
                      Long game · 40×
                    </button>
                    <button
                      type="button"
                      aria-pressed={gameMode === "learning"}
                      onClick={() => chooseMode("learning")}
                    >
                      Learning tour
                    </button>
                  </div>
                </div>
                <button
                  className="atlas-close"
                  onClick={() => setShowAtlas(false)}
                  aria-label="Close atlas"
                >
                  ×
                </button>
              </header>
              <div className="era-list">
                <div className="scale-scrubber">
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
                    value={atlasEra}
                    onChange={(event) => setAtlasEra(Number(event.target.value))}
                    aria-label="Choose a scale layer"
                  />
                  <div className="scrubber-meta">
                    <span>Layer {atlasEra + 1} of {ERAS.length}</span>
                    <span>{atlasEra <= journeyIndex ? "REACHED" : "AHEAD"}</span>
                  </div>
                </div>
                <article className="era-feature current">
                  <div
                    className="era-dot"
                    style={{ background: atlasItem.palette[2] }}
                  >
                    {atlasEra + 1}
                  </div>
                  <div className="era-copy">
                    <span>{atlasEra === 0 ? "THEORY PLAYGROUND" : "SCALE LAYER"}</span>
                    <h3>{atlasItem.name}</h3>
                    <p>{atlasItem.lesson}</p>
                    <div className={`confidence ${confidenceClass(atlasItem.confidence)}`}>
                      {atlasItem.confidence}
                    </div>
                  </div>
                  <div className="era-actions">
                    <code>{formatEraScale(atlasEra, 0)}</code>
                    <a
                      href={atlasItem.sources[0].url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {atlasItem.sources[0].organization} reference ↗
                    </a>
                    <button onClick={() => previewEra(atlasEra)}>
                      {labEra === atlasEra ? "Viewing" : "Preview in 3D"}
                    </button>
                  </div>
                </article>
                <article className="sources">
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
                  <div className="source-links">
                    <a href="https://physics.nist.gov/cgi-bin/cuu/Value?plkl" target="_blank" rel="noreferrer">NIST · Planck length ↗</a>
                    <a href="https://home.cern/partons-hadrons/" target="_blank" rel="noreferrer">CERN · Quark confinement ↗</a>
                    <a href="https://home.cern/science/experiments/alice/" target="_blank" rel="noreferrer">CERN ALICE · Matter ↗</a>
                    <a href="https://home.cern/science/physics/standard-model" target="_blank" rel="noreferrer">CERN · Standard Model ↗</a>
                  </div>
                </article>
              </div>
            </div>
          </dialog>
        )}
        <FieldGuide
          open={showGuide}
          entries={collection}
          legacyUnitemizedCount={legacyUnitemizedCount}
          onClose={() => setShowGuide(false)}
        />
      </div>
    </main>
  );
}
