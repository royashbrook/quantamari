"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  Curio,
  ERAS,
  Era,
  JOURNEY_HOURS,
  eraAt,
  formatHours,
  formatScale,
} from "./scale-data";

type Pickup = {
  root: THREE.Group;
  visual: THREE.Object3D;
  marker: THREE.Sprite;
  curio: Curio;
  sourceEra: number;
  curioIndex: number;
  size: number;
  visualRadius: number;
  big: boolean;
  growthFactor: number;
  baseY: number;
  wiggle: number;
};

type MashRecord = {
  sourceEra: number;
  curioIndex: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  mergedInside: boolean;
};

type SaveData = {
  hours: number;
  picked: number;
  x: number;
  z: number;
  radius: number;
  zooms: number;
  sound: boolean;
  mash: MashRecord[];
};

function pseudo(seed: number) {
  const value = Math.sin(seed * 9283.312 + 77.13) * 43758.5453;
  return value - Math.floor(value);
}

function scaleFromLog(log: number) {
  const exponent = Math.floor(log);
  const mantissa = 10 ** (log - exponent);
  return `${mantissa.toFixed(exponent < -30 ? 3 : 2)} × 10^${exponent} m`;
}

function confidenceClass(confidence: Era["confidence"]) {
  return confidence.toLowerCase().replaceAll(" ", "-");
}

const MASS_ENERGY_FACTORS: Record<Curio["shape"], number> = {
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
  const showAtlasRef = useRef(false);
  const mashHistoryRef = useRef<MashRecord[]>([]);
  const keysRef = useRef<Record<string, boolean>>({});
  const joystickRef = useRef({ active: false, x: 0, y: 0, originX: 0, originY: 0 });
  const audioRef = useRef<AudioContext | null>(null);
  const gameRef = useRef({
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    radius: 1.12,
    hours: 0,
    picked: 0,
    zooms: 0,
    era: 0,
    running: false,
    sound: true,
    lastPickup: -99,
    lastSave: 0,
    id: 0,
  });

  const [started, setStarted] = useState(false);
  const [showAtlas, setShowAtlas] = useState(false);
  const [labEra, setLabEra] = useState<number | null>(null);
  const [sound, setSound] = useState(true);
  const [toast, setToast] = useState("Roll over anything smaller and stick it to your mash.");
  const [lastFact, setLastFact] = useState({
    name: "Spacetime fluctuation",
    fact: ERAS[0].lesson,
  });
  const [hud, setHud] = useState({
    hours: 0,
    picked: 0,
    era: 0,
    progress: 0,
    radius: 1.12,
  });

  useEffect(() => {
    showAtlasRef.current = showAtlas;
  }, [showAtlas]);

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
    const nameHash = [...curio.name].reduce(
      (total, character) => total + character.charCodeAt(0),
      0,
    );
    const itemPitch = 2 ** (((nameHash % 9) - 4) / 24);
    const eraPitch = 2 ** ((sourceEra % 6) / 18);
    const basePitch = profile.base * itemPitch * eraPitch;
    const start = context.currentTime + (gameRef.current.picked % 3) * 0.012;
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(7200, basePitch * 8), start);
    master.gain.setValueAtTime(0.0001, start);
    master.gain.exponentialRampToValueAtTime(0.034, start + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, start + profile.decay);
    filter.connect(master);
    master.connect(context.destination);

    [1, profile.interval].forEach((ratio, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 0 ? profile.wave : "sine";
      oscillator.frequency.setValueAtTime(basePitch * ratio, start);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(35, basePitch * ratio * profile.glide),
        start + profile.decay * 0.82,
      );
      oscillator.connect(filter);
      oscillator.start(start + index * 0.008);
      oscillator.stop(start + profile.decay + 0.025);
    });
  }, []);

  const begin = useCallback(() => {
    gameRef.current.running = true;
    setStarted(true);
    setToast("You are not quite matter yet. Go roll up some uncertainty.");
    audioRef.current?.resume();
  }, []);

  const toggleSound = useCallback(() => {
    const next = !gameRef.current.sound;
    gameRef.current.sound = next;
    setSound(next);
    if (next) ping(520);
  }, [ping]);

  const previewEra = (index: number) => {
    gameRef.current.running = true;
    setStarted(true);
    setLabEra(index);
    setShowAtlas(false);
    setToast(`Scale Lab: ${ERAS[index].name}. Journey progress is paused.`);
    setLastFact({ name: ERAS[index].name, fact: ERAS[index].lesson });
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem("everything-roll-save-v2");
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<SaveData>;
      const game = gameRef.current;
      game.hours = Number(saved.hours) || 0;
      game.picked = Number(saved.picked) || 0;
      game.x = Number(saved.x) || 0;
      game.z = Number(saved.z) || 0;
      game.radius = Math.max(0.8, Number(saved.radius) || game.radius);
      game.zooms = Number(saved.zooms) || 0;
      game.sound = saved.sound ?? true;
      game.era = eraAt(game.hours);
      mashHistoryRef.current = Array.isArray(saved.mash)
        ? saved.mash.slice(-96)
        : [];
      setSound(game.sound);
      setHud((current) => ({
        ...current,
        hours: game.hours,
        picked: game.picked,
        era: game.era,
        radius: game.radius,
      }));
    } catch {
      localStorage.removeItem("everything-roll-save-v2");
    }
  }, []);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keysRef.current[key] = true;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
        event.preventDefault();
      }
      if (key === "m") toggleSound();
      if (key === "i") setShowAtlas((value) => !value);
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
    const mount = mountRef.current;
    if (!mount) return;

    const game = gameRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.06, 220);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    const compactGpu = window.innerWidth <= 860;
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, compactGpu ? 1.25 : 1.6),
    );
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.className = "three-canvas";
    mount.prepend(renderer.domElement);

    let activeIndex = labEra ?? eraAt(game.hours);
    game.era = activeIndex;
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
    keyLight.shadow.mapSize.set(compactGpu ? 512 : 1024, compactGpu ? 512 : 1024);
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

    const applyEraTheme = (index: number, announce = false) => {
      activeIndex = index;
      activeEra = ERAS[index];
      game.era = index;
      early =
        activeEra.realm === "prephysical" || activeEra.realm === "particle";

      deepColor.set(activeEra.palette[0]);
      middleColor.set(activeEra.palette[1]);
      pop.set(activeEra.palette[2]);
      scene.background = deepColor.clone();
      scene.fog = new THREE.FogExp2(deepColor.clone(), early ? 0.017 : 0.024);
      groundMaterial.color
        .copy(middleColor)
        .lerp(new THREE.Color("#ffdff1"), 0.18)
        .multiplyScalar(0.82);
      ground.visible = true;
      grid.visible = true;
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

      if (announce) {
        setToast(`Ta-da! ${activeEra.name} unlocked—and the whole silly mash came too.`);
        setLastFact({ name: activeEra.name, fact: activeEra.lesson });
        ping(360 + index * 18, true);
      }
    };

    const createMaterial = (color: string, emissive = false) => {
      const toyColor = new THREE.Color(color).lerp(new THREE.Color("#fff4fb"), 0.08);
      return new THREE.MeshToonMaterial({
        color: toyColor,
        emissive: emissive ? color : 0x000000,
        emissiveIntensity: emissive ? 0.68 : 0,
        flatShading: true,
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

    const makeVisual = (curio: Curio) => {
      const group = new THREE.Group();
      const material = createMaterial(
        curio.color,
        ["spark", "quark", "star", "galaxy", "universe"].includes(curio.shape),
      );
      const dark = createMaterial("#261b38");
      const pale = createMaterial("#f6f2e8");
      const shape = curio.shape;

      if (shape === "bubble") {
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
      } else if (shape === "spark") {
        addPart(group, new THREE.OctahedronGeometry(0.72, 1), material, [0, 0, 0], [0.55, 1.2, 0.55]);
      } else if (shape === "quark") {
        addPart(group, new THREE.SphereGeometry(0.52, 20, 14), material, [0, 0, 0]);
        addPart(group, new THREE.TorusGeometry(0.7, 0.045, 8, 32), pale, [0, 0, 0], [1, 1, 1], [1.1, 0.4, 0]);
      } else if (shape === "hadron") {
        addPart(group, new THREE.SphereGeometry(0.42, 20, 14), createMaterial("#ff5e72", true), [-0.3, 0.18, 0.08]);
        addPart(group, new THREE.SphereGeometry(0.42, 20, 14), createMaterial("#58a7ff", true), [0.3, 0.18, -0.08]);
        addPart(group, new THREE.SphereGeometry(0.42, 20, 14), createMaterial("#f7db56", true), [0, -0.26, 0]);
      } else if (shape === "atom") {
        addPart(group, new THREE.SphereGeometry(0.22, 18, 12), material, [0, 0, 0]);
        for (let i = 0; i < 3; i += 1) {
          addPart(group, new THREE.TorusGeometry(0.68, 0.025, 6, 38), pale, [0, 0, 0], [1, 1, 1], [i * 1.05, i * 0.7, 0]);
        }
      } else if (shape === "molecule") {
        addPart(group, new THREE.SphereGeometry(0.38, 16, 12), material, [0, 0, 0]);
        addPart(group, new THREE.SphereGeometry(0.27, 16, 12), pale, [0.5, 0.15, 0.1]);
        addPart(group, new THREE.SphereGeometry(0.27, 16, 12), pale, [-0.38, 0.37, -0.1]);
      } else if (shape === "virus") {
        addPart(group, new THREE.IcosahedronGeometry(0.58, 2), material, [0, 0, 0]);
        for (let i = 0; i < 10; i += 1) {
          const angle = (i / 10) * Math.PI * 2;
          addPart(group, new THREE.ConeGeometry(0.07, 0.28, 6), pale, [Math.cos(angle) * 0.69, Math.sin(angle) * 0.69, 0], [1, 1, 1], [0, 0, angle - Math.PI / 2]);
        }
      } else if (shape === "cell") {
        const membrane = new THREE.MeshPhysicalMaterial({
          color: curio.color,
          transparent: true,
          opacity: 0.7,
          roughness: 0.3,
          transmission: 0.12,
        });
        addPart(group, new THREE.SphereGeometry(0.72, 24, 18), membrane, [0, 0, 0], [1.05, 0.82, 1]);
        addPart(group, new THREE.SphereGeometry(0.25, 18, 12), dark, [0.18, 0.05, 0.18]);
        addPart(group, new THREE.SphereGeometry(0.1, 12, 8), pale, [-0.3, 0.22, 0.2]);
      } else if (shape === "fiber") {
        addPart(group, new THREE.CapsuleGeometry(0.18, 1.25, 5, 12), material, [0, 0, 0], [1, 1, 1], [0.2, 0.2, 1.08]);
      } else if (shape === "dust") {
        addPart(group, new THREE.DodecahedronGeometry(0.62, 1), material, [0, 0, 0], [1, 0.62, 0.75]);
      } else if (shape === "stone" || shape === "mountain") {
        addPart(group, new THREE.DodecahedronGeometry(0.66, 1), material, [0, 0, 0], shape === "mountain" ? [1.1, 1.5, 0.9] : [1, 0.72, 0.86]);
      } else if (shape === "chair") {
        addPart(group, new THREE.BoxGeometry(0.95, 0.16, 0.82), material, [0, 0, 0]);
        addPart(group, new THREE.BoxGeometry(0.95, 1.05, 0.15), material, [0, 0.48, 0.35]);
        [-0.36, 0.36].forEach((x) => [-0.28, 0.28].forEach((z) => addPart(group, new THREE.BoxGeometry(0.13, 0.7, 0.13), dark, [x, -0.4, z])));
      } else if (shape === "car") {
        addPart(group, new THREE.BoxGeometry(1.45, 0.46, 0.72), material, [0, 0, 0]);
        addPart(group, new THREE.BoxGeometry(0.75, 0.38, 0.67), pale, [-0.1, 0.38, 0]);
        [-0.48, 0.48].forEach((x) => [-0.39, 0.39].forEach((z) => addPart(group, new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16), dark, [x, -0.27, z], [1, 1, 1], [Math.PI / 2, 0, 0])));
      } else if (shape === "house") {
        addPart(group, new THREE.BoxGeometry(1.15, 0.85, 0.95), material, [0, 0, 0]);
        addPart(group, new THREE.ConeGeometry(0.88, 0.55, 4), createMaterial("#d05e57"), [0, 0.7, 0], [1, 1, 1], [0, Math.PI / 4, 0]);
        addPart(group, new THREE.BoxGeometry(0.25, 0.48, 0.08), dark, [0, -0.18, 0.51]);
      } else if (shape === "planet") {
        addPart(group, new THREE.SphereGeometry(0.67, 28, 20), material, [0, 0, 0]);
        addPart(group, new THREE.TorusGeometry(0.9, 0.055, 8, 44), pale, [0, 0, 0], [1, 0.42, 1], [0.25, 0, 0.15]);
      } else if (shape === "star") {
        addPart(group, new THREE.IcosahedronGeometry(0.72, 3), material, [0, 0, 0]);
        addPart(group, new THREE.SphereGeometry(0.96, 20, 14), new THREE.MeshBasicMaterial({ color: curio.color, transparent: true, opacity: 0.12, side: THREE.BackSide }), [0, 0, 0]);
      } else if (shape === "system") {
        addPart(group, new THREE.SphereGeometry(0.2, 16, 12), material, [0, 0, 0]);
        [0.45, 0.72, 0.98].forEach((radius, index) => {
          addPart(group, new THREE.TorusGeometry(radius, 0.018, 5, 42), pale, [0, 0, 0], [1, 0.35 + index * 0.12, 1], [0.3 * index, 0.15, 0]);
        });
      } else if (shape === "galaxy") {
        addPart(group, new THREE.SphereGeometry(0.18, 14, 10), pale, [0, 0, 0]);
        for (let i = 0; i < 3; i += 1) {
          addPart(group, new THREE.TorusGeometry(0.38 + i * 0.2, 0.09, 6, 42), material, [0, 0, 0], [1, 0.22, 1], [0.2, i * 0.6, 0]);
        }
      } else if (shape === "universe") {
        addPart(group, new THREE.IcosahedronGeometry(0.76, 2), new THREE.MeshBasicMaterial({ color: curio.color, wireframe: true, transparent: true, opacity: 0.72 }), [0, 0, 0]);
        addPart(group, new THREE.SphereGeometry(0.28, 16, 12), material, [0, 0, 0]);
      } else {
        addPart(group, new THREE.BoxGeometry(0.9, 0.72, 0.62), material, [0, 0, 0], [1, 1, 1], [0.15, 0.25, 0.08]);
      }
      return group;
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
    const attachments: THREE.Object3D[] = [];
    const popBursts: {
      mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
      born: number;
    }[] = [];
    let spawnClock = 0;

    const makeFieldLike = (visual: THREE.Object3D) => {
      visual.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            material.transparent = true;
            material.opacity = Math.min(material.opacity, 0.68);
            material.depthWrite = false;
          });
        }
      });
    };

    mashHistoryRef.current.forEach((record, recordIndex) => {
      const sourceEra = ERAS[record.sourceEra];
      const curio = sourceEra?.curios[record.curioIndex];
      if (!curio) return;
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
      visual.add(makeMarker(curio.symbol));
      visual.position.copy(restoredPosition);
      visual.rotation.set(...record.rotation);
      visual.scale.set(...record.scale);
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
      if (!preserveVisual) {
        pickup.visual.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => material.dispose());
          } else if (child instanceof THREE.Sprite) {
            child.material.dispose();
          }
        });
      }
    };

    const spawnPickup = (seed: number) => {
      const radius = 4.6 + pseudo(seed + game.id * 7) * 18;
      const angle = pseudo(seed + 13) * Math.PI * 2;
      const sourceEra =
        activeIndex > 0 && pseudo(seed + 97) > 0.45
          ? Math.floor(pseudo(seed + 103) * activeIndex)
          : activeIndex;
      const scaleGap = activeIndex - sourceEra;
      const source = ERAS[sourceEra];
      const curioIndex = Math.floor(pseudo(seed + 67) * source.curios.length);
      const curio = source.curios[curioIndex];
      let big = scaleGap === 0 && pseudo(seed + 29) > 0.9;
      const legacyScale = scaleGap === 0 ? 1 : Math.max(0.24, 0.72 ** scaleGap);
      let size = big
        ? game.radius * (1.1 + pseudo(seed + 41) * 0.78)
        : Math.max(
            0.14,
            (0.2 + pseudo(seed + 53) * game.radius * 0.58) * legacyScale,
          );
      const growthFactor =
        scaleGap === 0 ? 1 : Math.max(0.0002, 0.14 ** scaleGap);
      const root = new THREE.Group();
      const visual = makeVisual(curio);
      visual.scale.setScalar(size);
      visual.updateMatrixWorld(true);
      const visualDimensions = new THREE.Vector3();
      new THREE.Box3().setFromObject(visual).getSize(visualDimensions);
      let visualRadius =
        Math.max(visualDimensions.x, visualDimensions.y, visualDimensions.z) / 2;
      if (!big && visualRadius > game.radius * 0.92) {
        const targetRadius = game.radius * (0.5 + pseudo(seed + 139) * 0.38);
        const fit = targetRadius / visualRadius;
        size *= fit;
        visualRadius *= fit;
        visual.scale.multiplyScalar(fit);
      } else if (big && visualRadius <= game.radius * 1.08) {
        const targetRadius = game.radius * (1.1 + pseudo(seed + 149) * 0.38);
        const enlarge = targetRadius / Math.max(0.01, visualRadius);
        size *= enlarge;
        visualRadius *= enlarge;
        visual.scale.multiplyScalar(enlarge);
      }
      big = visualRadius > game.radius * 1.02;
      visual.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      const marker = makeMarker(curio.symbol);
      visual.add(marker);
      root.add(visual);
      root.position.set(
        game.x + Math.cos(angle) * radius,
        Math.max(0.22, size * 0.48),
        game.z + Math.sin(angle) * radius,
      );
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
        curioIndex,
        size,
        visualRadius,
        big,
        growthFactor,
        baseY,
        wiggle,
      });
      game.id += 1;
    };

    const populate = () => {
      const desiredPickupCount = width <= 860 ? 392 : 544;
      pickups = pickups.filter((pickup) => {
        const distance = Math.hypot(
          pickup.root.position.x - game.x,
          pickup.root.position.z - game.z,
        );
        if (distance < 54) return true;
        removePickup(pickup);
        return false;
      });
      while (pickups.length < desiredPickupCount) {
        spawnPickup(performance.now() * 0.002 + pickups.length * 101);
      }
    };

    const shrinkHistory = () => {
      attachments.forEach((attachment, index) => {
        attachment.position.multiplyScalar(0.55);
        attachment.scale.multiplyScalar(0.68);
        const record = mashHistoryRef.current[index];
        if (record) {
          record.position = attachment.position.toArray() as [number, number, number];
          record.scale = record.scale.map((value) => value * 0.68) as [
            number,
            number,
            number,
          ];
        }
      });
      stickingPieces.forEach((piece) => piece.targetScale.multiplyScalar(0.68));
    };

    const collect = (pickup: Pickup, now: number) => {
      game.picked += 1;
      game.lastPickup = now / 1000;
      const sourceRealm = ERAS[pickup.sourceEra].realm;
      const massEnergyFactor = MASS_ENERGY_FACTORS[pickup.curio.shape];
      const rawContribution =
        pickup.visualRadius ** 3 *
        massEnergyFactor *
        pickup.growthFactor *
        0.42;
      const contribution = Math.min(game.radius ** 3 * 0.014, rawContribution);
      game.radius = Math.cbrt(game.radius ** 3 + Math.max(0.000008, contribution));
      const contributionLabel =
        pickup.growthFactor < 0.02
          ? "trace contribution"
          : sourceRealm === "prephysical"
            ? "field energy"
            : sourceRealm === "particle"
              ? "bound energy"
              : massEnergyFactor >= 1
                ? "dense mass"
                : massEnergyFactor < 0.35
                  ? "light mass"
                  : "mass";
      const pickupQuip = PICKUP_QUIPS[game.picked % PICKUP_QUIPS.length];
      setToast(`${pickup.curio.name}: ${pickupQuip} · ${contributionLabel}.`);
      setLastFact({ name: pickup.curio.name, fact: pickup.curio.fact });
      playPickupSound(pickup.curio, pickup.sourceEra);
      faceReactionUntil = now + 240;
      ballFaceMaterial.map = chompFaceTexture;
      ballFaceMaterial.needsUpdate = true;
      const popBurst = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(0.32, pickup.visualRadius * 0.72), 0.055, 6, 28),
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

      pickup.root.remove(pickup.visual);
      removePickup(pickup, true);
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
      mashHistoryRef.current.push({
        sourceEra: pickup.sourceEra,
        curioIndex: pickup.curioIndex,
        position: pickup.visual.position.toArray() as [number, number, number],
        rotation: [
          pickup.visual.rotation.x,
          pickup.visual.rotation.y,
          pickup.visual.rotation.z,
        ],
        scale: targetScale.toArray() as [number, number, number],
        mergedInside: fieldLike,
      });
      if (attachments.length > 96) {
        const oldest = attachments.shift();
        mashHistoryRef.current.shift();
        if (oldest) {
          mashGroup.remove(oldest);
          oldest.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((material) => material.dispose());
            } else if (child instanceof THREE.Sprite) {
              child.material.dispose();
            }
          });
        }
      }

      if (game.radius >= 2.3) {
        game.radius = 1.14;
        game.zooms += 1;
        shrinkHistory();
        pickups.forEach((item) => {
          item.size *= 0.72;
          item.visualRadius *= 0.72;
          item.visual.scale.multiplyScalar(0.72);
        });
        setToast(`ZOOM OUT #${game.zooms} — the whole mixed-scale world stayed put.`);
        ping(350 + activeIndex * 18, true);
      }
    };

    let width = 0;
    let height = 0;
    const resize = () => {
      const box = mount.getBoundingClientRect();
      width = box.width;
      height = box.height;
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
    const desiredCamera = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();

    const animate = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      if (game.running && !showAtlasRef.current) {
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
          game.vx += inputX * 11.875 * boost * dt;
          game.vz += inputZ * 11.875 * boost * dt;
          if (labEra === null) {
            const engagement = Math.max(0, 1 - (now / 1000 - game.lastPickup) / 8);
            game.hours += (dt * (0.72 + engagement * 0.28)) / 3600;
          }
        }
        const drag = Math.pow(0.09, dt);
        game.vx *= drag;
        game.vz *= drag;
        const speed = Math.hypot(game.vx, game.vz);
        const maxSpeed = keysRef.current[" "] ? 8.125 : 6.5;
        if (speed > maxSpeed) {
          game.vx = (game.vx / speed) * maxSpeed;
          game.vz = (game.vz / speed) * maxSpeed;
        }
        game.x += game.vx * dt;
        game.z += game.vz * dt;
        rollGroup.rotation.x += (game.vz * dt) / Math.max(0.5, game.radius);
        rollGroup.rotation.z -= (game.vx * dt) / Math.max(0.5, game.radius);

        for (const pickup of pickups) {
          const dx = pickup.root.position.x - game.x;
          const dz = pickup.root.position.z - game.z;
          const distance = Math.hypot(dx, dz);
          if (distance < game.radius + pickup.visualRadius) {
            if (pickup.visualRadius <= game.radius * 1.02) {
              collect(pickup, now);
              pickup.root.position.x = Number.POSITIVE_INFINITY;
            } else if (distance > 0) {
              game.vx -= (dx / distance) * 2.4;
              game.vz -= (dz / distance) * 2.4;
              if (now / 1000 - game.lastPickup > 0.8) {
                setToast(`Oof! ${pickup.curio.name} is still too chunky. Snack smaller first.`);
              }
            }
          }
        }
        pickups = pickups.filter((pickup) => Number.isFinite(pickup.root.position.x));
      }

      const nextActiveIndex = labEra ?? eraAt(game.hours);
      if (nextActiveIndex !== activeIndex) {
        applyEraTheme(nextActiveIndex, true);
      }

      spawnClock += dt;
      const lowPickupThreshold = width <= 860 ? 328 : 456;
      if (spawnClock > 0.5 || pickups.length < lowPickupThreshold) {
        populate();
        spawnClock = 0;
      }

      const floatHeight =
        game.radius * 0.94 + (early ? Math.sin(now * 0.0017) * 0.035 : 0);
      playerRoot.position.set(game.x, floatHeight, game.z);
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

      pickups.forEach((pickup, index) => {
        const distance = Math.hypot(
          pickup.root.position.x - game.x,
          pickup.root.position.z - game.z,
        );
        pickup.marker.visible = distance < 20;
        pickup.root.rotation.y += dt * (pickup.big ? 0.08 : 0.22);
        pickup.root.rotation.z = Math.sin(now * 0.0012 + pickup.wiggle) * 0.075;
        pickup.root.position.y =
          pickup.baseY +
          Math.sin(now * (early ? 0.0018 : 0.00125) + pickup.wiggle + index * 0.04) *
            (early ? 0.11 : 0.055);
      });

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
        game.x + game.vx * 0.24,
        floatHeight + (mobileView ? 7.1 : 5.2) + game.radius * 1.4,
        game.z + (mobileView ? 13.2 : 9.5) + game.radius * 2.1,
      );
      camera.position.lerp(desiredCamera, 1 - Math.pow(0.002, dt));
      cameraTarget.set(game.x, floatHeight * 0.82, game.z - 0.7);
      camera.lookAt(cameraTarget);

      hudClock += dt;
      if (hudClock > 0.14) {
        const journeyEra = eraAt(game.hours);
        const displayIndex = labEra ?? journeyEra;
        const current = ERAS[journeyEra];
        const next = ERAS[Math.min(journeyEra + 1, ERAS.length - 1)];
        const progress =
          labEra !== null
            ? 0
            : current === next
              ? 1
              : Math.max(0, Math.min(1, (game.hours - current.at) / (next.at - current.at)));
        setHud({
          hours: game.hours,
          picked: game.picked,
          era: displayIndex,
          progress,
          radius: game.radius,
        });
        hudClock = 0;
      }

      if (labEra === null && now - game.lastSave > 5000) {
        const save: SaveData = {
          hours: game.hours,
          picked: game.picked,
          x: game.x,
          z: game.z,
          radius: game.radius,
          zooms: game.zooms,
          sound: game.sound,
          mash: mashHistoryRef.current,
        };
        localStorage.setItem("everything-roll-save-v2", JSON.stringify(save));
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
      happyFaceTexture.dispose();
      chompFaceTexture.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [labEra, ping, playPickupSound]);

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      !started ||
      target.closest("button") ||
      target.closest("a") ||
      target.closest(".modal")
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

  const era = ERAS[hud.era];
  const journeyIndex = eraAt(hud.hours);
  const nextEra = ERAS[Math.min(journeyIndex + 1, ERAS.length - 1)];
  const remaining = Math.max(0, JOURNEY_HOURS - hud.hours);
  const scale = labEra === null ? formatScale(hud.hours) : scaleFromLog(era.logMeters);

  return (
    <main className="shell">
      <div
        ref={mountRef}
        className="world"
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
      >
        <header className="topbar hud">
          <div className="brand">
            <div className="brand-ball" aria-hidden="true">✦</div>
            <div>
              <b>ON A ROLL</b>
              <small>the scale of everything</small>
            </div>
            <span className="version-badge">V10 · EXTRA CUTE</span>
          </div>
          <div className="actions">
            <button onClick={() => setShowAtlas(true)}>
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
            <button onClick={() => setLabEra(null)}>Return to journey</button>
          </div>
        )}

        <section className="scale-card hud" aria-live="polite">
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
        </section>

        <aside className="stats hud">
          <div><b>{hud.picked.toLocaleString()}</b><small>things in mash</small></div>
          <i />
          <div><b>{formatHours(hud.hours)}</b><small>deep journey</small></div>
          <i />
          <div>
            <b>{remaining > 0 ? `${Math.ceil(remaining)}h` : "∞"}</b>
            <small>{remaining > 0 ? "to beyond" : "past science"}</small>
          </div>
        </aside>

        <aside className="fact-card hud">
          <div className="fact-kicker">WHAT YOU JUST ROLLED UP</div>
          <h2>{lastFact.name}</h2>
          <p>{lastFact.fact}</p>
        </aside>

        <div className="toast hud" role="status">
          <span>✦</span>
          {toast}
        </div>

        <div className="controls hud">
          <span><kbd>WASD</kbd> / arrows to roll</span>
          <span><kbd>SPACE</kbd> to surge</span>
          <span><kbd>I</kbd> science</span>
        </div>
        <div className="touch-tip hud">◎ drag anywhere to roll</div>

        {!started && (
          <section className="welcome modal">
            <div className="eyebrow">BEGIN AT THE PLANCK REGIME</div>
            <h1>
              You are not a ball.
              <br />
              <em>Not yet.</em>
            </h1>
            <p className="welcome-lead">
              Begin as a small cluster of foam-like spacetime fluctuations. Every
              smaller thing snaps onto the outside, reshapes your silhouette, and
              rolls with you—the happy, lumpy pile never stops growing.
            </p>
            <div className="science-caveat">
              <b>Scientific honesty:</b> quantum foam is a speculative visualization,
              and “rolling” before matter exists is a navigation metaphor. The game
              labels every scale as measured, supported, unknown, or speculative.
              Visible size decides what sticks; era-appropriate energy or mass
              determines how much the mash grows.
            </div>
            <button className="start" onClick={begin}>
              <span>Begin becoming</span>
              <b>→</b>
            </button>
            <div className="welcome-foot">
              <span>NO CHARACTER</span><span>•</span>
              <span>REAL 3D ROLLING</span><span>•</span>
              <span>INFINITE AFTER 500H</span>
            </div>
          </section>
        )}

        {showAtlas && (
          <section className="atlas-bg modal" role="dialog" aria-modal="true" aria-label="Scale and science atlas">
            <div className="atlas">
              <header>
                <div>
                  <div className="eyebrow">THE RIDICULOUSLY LONG, HONEST VIEW</div>
                  <h2>Scale & science</h2>
                  <p>
                    Preview any era without changing your save. Confidence labels
                    separate observations from models, unknowns, and deliberate fiction.
                  </p>
                </div>
                <button onClick={() => setShowAtlas(false)} aria-label="Close atlas">×</button>
              </header>
              <div className="era-list">
                {ERAS.map((item, index) => {
                  const reached = hud.hours >= item.at;
                  const current = index === hud.era;
                  return (
                    <article
                      key={item.name}
                      className={`${reached ? "reached" : ""} ${current ? "current" : ""}`}
                    >
                      <div className="era-dot" style={{ background: item.palette[2] }}>
                        {index + 1}
                      </div>
                      <div className="era-copy">
                        <span>{item.at ? `~${formatHours(item.at)}` : "START"}</span>
                        <h3>{item.name}</h3>
                        <p>{item.lesson}</p>
                        <div className={`confidence ${confidenceClass(item.confidence)}`}>
                          {item.confidence}
                        </div>
                      </div>
                      <div className="era-actions">
                        <code>{scaleFromLog(item.logMeters)}</code>
                        <button onClick={() => previewEra(index)}>
                          {labEra === index ? "Viewing" : "Preview in 3D"}
                        </button>
                      </div>
                    </article>
                  );
                })}
                <article className="sources">
                  <div>
                    <span>PRIMARY SOURCES</span>
                    <h3>Built to teach without pretending certainty</h3>
                    <p>
                      The progression compresses scale and uses magical adhesion, but
                      factual claims and confidence labels follow authoritative sources.
                    </p>
                  </div>
                  <div className="source-links">
                    <a href="https://physics.nist.gov/cgi-bin/cuu/Value?plkl=" target="_blank" rel="noreferrer">NIST · Planck length ↗</a>
                    <a href="https://home.cern/partons-hadrons/" target="_blank" rel="noreferrer">CERN · Quark confinement ↗</a>
                    <a href="https://home.cern/science/experiments/alice/" target="_blank" rel="noreferrer">CERN ALICE · Matter ↗</a>
                    <a href="https://home.cern/science/physics/standard-model" target="_blank" rel="noreferrer">CERN · Standard Model ↗</a>
                  </div>
                </article>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
