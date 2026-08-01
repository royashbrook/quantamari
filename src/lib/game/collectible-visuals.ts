import * as THREE from "three";

import {
  collectibleIdentityFor,
  type QualityTier,
} from "../game-rules";
import type { Curio } from "../scale-data";
import { collectibleVisualHandlerFor } from "./collectible-visual-contract";

function pseudo(seed: number) {
  const value = Math.sin(seed * 9283.312 + 77.13) * 43758.5453;
  return value - Math.floor(value);
}

type CollectibleVisualFactoryOptions = {
  isEarly: () => boolean;
  getQualityTier: () => QualityTier;
  sceneryGlow: (
    color: THREE.ColorRepresentation,
    opacity?: number,
    wireframe?: boolean,
  ) => THREE.Material;
};

/**
 * Owns authored collectible geometry. Runtime simulation chooses when a
 * representation is visible; this factory only builds and quality-tunes it.
 */
export function createCollectibleVisualFactory({
  isEarly,
  getQualityTier,
  sceneryGlow,
}: CollectibleVisualFactoryOptions) {
  const createMaterial = (color: string, emissive = false) => {
    const toyColor = new THREE.Color(color).lerp(new THREE.Color("#fff4fb"), 0.08);
    return new THREE.MeshToonMaterial({
      color: toyColor,
      emissive: emissive ? color : 0x000000,
      emissiveIntensity: emissive ? 0.68 : 0,
      transparent: false,
    });
  };

  const applyPhysicalMaterialQuality = (root: THREE.Object3D) => {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => {
        if (!(material instanceof THREE.MeshPhysicalMaterial)) return;
        if (
          typeof material.userData.authoredTransmission !== "number"
        ) {
          material.userData.authoredTransmission = material.transmission;
        }
        material.transmission =
          getQualityTier() === "battery"
            ? 0
            : Number(material.userData.authoredTransmission);
        material.needsUpdate = true;
      });
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
    mesh.castShadow = !isEarly();
    mesh.receiveShadow = !isEarly();
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
    const form = curio.visualForm;
    const handler = collectibleVisualHandlerFor(form);
    const subjectKey = curio.subjectId?.split("/").at(-1) ?? "";

    if (handler === "nuclear-cluster") {
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
    } else if (handler === "string") {
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
    } else if (handler === "double-helix") {
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
    } else if (handler === "protein") {
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
    } else if (handler === "crystal") {
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
    } else if (handler === "seed") {
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
    } else if (handler === "bead") {
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
    } else if (handler === "park") {
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
    } else if (handler === "bubble") {
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
    } else if (handler === "field-ripple") {
      addPart(
        group,
        new THREE.SphereGeometry(0.13, 12, 8),
        accent,
        [0, 0.08, 0],
      );
      [0.28, 0.52, 0.78].forEach((radius, ring) => {
        addPart(
          group,
          new THREE.TorusGeometry(radius, 0.035 - ring * 0.006, 6, 28),
          ring === 1 ? pale : material,
          [0, -ring * 0.08, 0],
          [1, 0.74 + ring * 0.08, 1],
          [Math.PI / 2, 0, ring * 0.22],
        );
      });
      if (rich) {
        addPart(
          group,
          new THREE.ConeGeometry(0.12, 0.34, 7),
          pale,
          [0, 0.28, 0],
        );
      }
    } else if (handler === "vesicle") {
      const membrane = new THREE.MeshPhysicalMaterial({
        color: curio.color,
        transparent: true,
        opacity: 0.52,
        transmission: 0.22,
        roughness: 0.24,
      });
      addPart(
        group,
        new THREE.SphereGeometry(0.7, 22, 16),
        membrane,
        [0, 0, 0],
      );
      [
        [-0.25, 0.18, 0.16],
        [0.24, 0.22, -0.12],
        [-0.08, -0.28, 0.2],
      ].forEach((position, cargo) => {
        addPart(
          group,
          cargo === 1
            ? new THREE.OctahedronGeometry(0.16, 1)
            : new THREE.SphereGeometry(0.16, 12, 8),
          cargo === 2 ? pale : accent,
          position as [number, number, number],
        );
      });
      if (rich) {
        addPart(
          group,
          new THREE.TorusGeometry(0.72, 0.025, 6, 30),
          pale,
          [0, 0, 0],
          [1, 0.72, 1],
          [0.32, 0.18, 0],
        );
      }
    } else if (handler === "spark") {
      const sparkGeometry =
        variant % 2 === 0
          ? new THREE.OctahedronGeometry(0.72, 1)
          : new THREE.TetrahedronGeometry(0.8, 1);
      addPart(group, sparkGeometry, material, [0, 0, 0], [0.55, 1.2, 0.55]);
      if (rich) {
        addPart(group, new THREE.OctahedronGeometry(0.2, 0), accent, [0.58, 0.26, 0.28]);
        addPart(group, new THREE.OctahedronGeometry(0.13, 0), pale, [-0.52, -0.3, -0.22]);
      }
    } else if (handler === "quark") {
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
    } else if (handler === "hadron") {
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
    } else if (handler === "atom") {
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
    } else if (handler === "antibody") {
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
    } else if (handler === "molecule") {
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
    } else if (handler === "bacteriophage") {
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
    } else if (handler === "virus") {
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
    } else if (handler === "tardigrade") {
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
    } else if (handler === "pollen") {
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
    } else if (handler === "diatom") {
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
    } else if (handler === "ciliate") {
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
    } else if (handler === "mite") {
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
    } else if (handler === "worm") {
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
    } else if (handler === "cell") {
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
    } else if (handler === "fiber") {
      addPart(group, new THREE.CapsuleGeometry(0.18, 1.25, 5, 12), material, [0, 0, 0], [1, 1, 1], [0.2, 0.2, 1.08]);
      if (rich) {
        addPart(group, new THREE.CapsuleGeometry(0.1, 0.9, 4, 10), accent, [0.08, 0.02, 0.08], [1, 1, 1], [1.04, -0.35, 0.18]);
      }
    } else if (handler === "dust") {
      const dustGeometry =
        variant % 2 === 0
          ? new THREE.DodecahedronGeometry(0.62, 1)
          : new THREE.IcosahedronGeometry(0.64, 1);
      addPart(group, dustGeometry, material, [0, 0, 0], [1, 0.62, 0.75]);
      if (rich) {
        addPart(group, new THREE.TetrahedronGeometry(0.2, 0), accent, [0.46, 0.12, -0.18]);
        addPart(group, new THREE.DodecahedronGeometry(0.13, 0), pale, [-0.38, -0.2, 0.25]);
      }
    } else if (handler === "asteroid") {
      addPart(
        group,
        new THREE.DodecahedronGeometry(0.67, 1),
        material,
        [0, 0, 0],
        [1.08, 0.76, 0.9],
        [0.18, 0.34, 0.12],
      );
      [
        [0.4, 0.2, 0.39, 0.18],
        [-0.32, -0.22, 0.43, 0.12],
      ].forEach(([x, y, z, radius]) => {
        addPart(
          group,
          new THREE.TorusGeometry(radius, 0.035, 6, 14),
          dark,
          [x, y, z],
          [1, 0.66, 1],
          [0.18, 0, 0],
        );
      });
      if (rich) {
        addPart(
          group,
          new THREE.SphereGeometry(0.08, 8, 6),
          pale,
          [0.62, -0.14, -0.16],
        );
      }
    } else if (handler === "comet") {
      addPart(
        group,
        new THREE.DodecahedronGeometry(0.42, 1),
        material,
        [0.48, 0, 0],
        [1.1, 0.82, 0.88],
      );
      [
        [0.1, 1, 0],
        [-0.18, 0.72, 0.12],
        [0.28, 0.62, -0.14],
      ].forEach(([y, width, z], tail) => {
        addPart(
          group,
          new THREE.ConeGeometry(0.24 * width, 1.5 - tail * 0.18, 7),
          tail === 1 ? pale : accent,
          [-0.42 - tail * 0.08, y, z],
          [1, 1, 0.7],
          [0, 0, Math.PI / 2],
        );
      });
    } else if (handler === "stone" || handler === "landform") {
      const rockGeometry =
        variant % 2 === 0
          ? new THREE.DodecahedronGeometry(0.66, 1)
          : new THREE.IcosahedronGeometry(0.68, 1);
      addPart(group, rockGeometry, material, [0, 0, 0], handler === "landform" ? [1.1, 1.5, 0.9] : [1, 0.72, 0.86]);
      if (rich && handler === "landform") {
        addPart(group, new THREE.ConeGeometry(0.36, 0.38, 5), pale, [0, 0.72, 0], [1, 1, 0.86]);
      } else if (rich) {
        addPart(group, new THREE.DodecahedronGeometry(0.23, 0), accent, [0.44, -0.18, 0.15]);
      }
    } else if (handler === "river-system") {
      addPart(
        group,
        new THREE.DodecahedronGeometry(0.72, 1),
        pale,
        [0, -0.16, 0],
        [1.2, 0.2, 0.92],
      );
      const riverPaths = [
        [
          [-0.78, 0.02, -0.1],
          [-0.3, 0.05, 0.08],
          [0.16, 0.03, -0.04],
          [0.78, 0.02, 0.18],
        ],
        [
          [-0.5, 0.03, 0.5],
          [-0.28, 0.05, 0.2],
          [0.16, 0.03, -0.04],
        ],
        [
          [0.18, 0.03, -0.04],
          [0.42, 0.04, -0.3],
          [0.62, 0.02, -0.52],
        ],
      ] as const;
      riverPaths.forEach((points, river) => {
        const curve = new THREE.CatmullRomCurve3(
          points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
        );
        addPart(
          group,
          new THREE.TubeGeometry(curve, 18, river ? 0.035 : 0.06, 6, false),
          river === 1 ? accent : material,
          [0, 0, 0],
        );
      });
    } else if (handler === "forest") {
      const treePositions = [
        [-0.5, -0.04, -0.28],
        [0, 0.04, 0.16],
        [0.48, -0.08, -0.2],
        [-0.25, -0.1, 0.45],
        [0.3, -0.12, 0.48],
      ] as const;
      treePositions.forEach(([x, y, z], tree) => {
        const height = 0.48 + (tree % 3) * 0.12;
        addPart(
          group,
          new THREE.CylinderGeometry(0.045, 0.07, height, 7),
          dark,
          [x, y - 0.18 + height / 2, z],
        );
        addPart(
          group,
          new THREE.ConeGeometry(0.22 + (tree % 2) * 0.04, 0.5, 7),
          tree % 2 ? accent : material,
          [x, y + height * 0.75, z],
        );
      });
    } else if (handler === "weather-front") {
      const front = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.82, 0.22, -0.12),
        new THREE.Vector3(-0.3, 0.42, 0.1),
        new THREE.Vector3(0.28, 0.25, -0.04),
        new THREE.Vector3(0.82, 0.4, 0.16),
      ]);
      addPart(
        group,
        new THREE.TubeGeometry(front, 24, 0.13, 8, false),
        material,
        [0, 0, 0],
      );
      [-0.55, -0.12, 0.34, 0.68].forEach((x, cloud) => {
        addPart(
          group,
          new THREE.SphereGeometry(0.24, 12, 8),
          cloud % 2 ? pale : accent,
          [x, 0.34 + (cloud % 2) * 0.1, cloud % 2 ? 0.1 : -0.08],
          [1.35, 0.72, 0.9],
        );
        addPart(
          group,
          new THREE.ConeGeometry(0.055, 0.3, 6),
          accent,
          [x, -0.1 - (cloud % 2) * 0.08, 0],
          [1, 1, 0.7],
          [0, 0, Math.PI],
        );
      });
    } else if (handler === "pencil") {
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
    } else if (handler === "mug") {
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
    } else if (handler === "book") {
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
    } else if (handler === "spoon") {
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
    } else if (handler === "coin") {
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
    } else if (handler === "key") {
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
    } else if (handler === "die") {
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
    } else if (handler === "guitar") {
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
    } else if (handler === "table") {
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
    } else if (handler === "screen") {
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
    } else if (handler === "potted-plant") {
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
    } else if (handler === "bed") {
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
    } else if (handler === "appliance") {
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
    } else if (handler === "bathtub") {
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
    } else if (handler === "tree") {
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
    } else if (handler === "pool") {
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
    } else if (handler === "train") {
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
    } else if (handler === "button") {
      addPart(group, new THREE.CylinderGeometry(0.58, 0.58, 0.16, 28), material, [0, 0, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
      [
        [-0.18, 0.09, 0.17],
        [0.18, 0.09, 0.17],
        [-0.18, -0.09, 0.17],
        [0.18, -0.09, 0.17],
      ].forEach((position) =>
        addPart(group, new THREE.CylinderGeometry(0.055, 0.055, 0.19, 10), dark, position as [number, number, number], [1, 1, 1], [Math.PI / 2, 0, 0]),
      );
    } else if (handler === "brick") {
      addPart(group, new THREE.BoxGeometry(1.2, 0.48, 0.72), material, [0, 0, 0]);
      [-0.4, 0, 0.4].forEach((x) =>
        [-0.22, 0.22].forEach((z) =>
          addPart(group, new THREE.CylinderGeometry(0.12, 0.12, 0.14, 14), accent, [x, 0.31, z]),
        ),
      );
    } else if (handler === "bottle-cap") {
      addPart(group, new THREE.CylinderGeometry(0.58, 0.62, 0.3, 24), material, [0, 0, 0]);
      addPart(group, new THREE.CylinderGeometry(0.42, 0.42, 0.06, 24), pale, [0, 0.18, 0]);
      for (let ridge = 0; ridge < 12; ridge += 1) {
        const angle = (ridge / 12) * Math.PI * 2;
        addPart(group, new THREE.BoxGeometry(0.08, 0.28, 0.12), accent, [Math.cos(angle) * 0.61, 0, Math.sin(angle) * 0.61], [1, 1, 1], [0, -angle, 0]);
      }
    } else if (handler === "shoe") {
      addPart(group, new THREE.CapsuleGeometry(0.32, 0.82, 6, 14), material, [0.05, -0.08, 0], [1, 0.68, 1.2], [0.1, 0.1, Math.PI / 2]);
      addPart(group, new THREE.BoxGeometry(0.66, 0.5, 0.62), accent, [0.25, 0.2, 0]);
      addPart(group, new THREE.BoxGeometry(1.25, 0.09, 0.68), pale, [0, -0.35, 0]);
    } else if (handler === "lamp") {
      addPart(group, new THREE.CylinderGeometry(0.3, 0.42, 0.12, 20), dark, [0, -0.7, 0]);
      addPart(group, new THREE.CylinderGeometry(0.055, 0.055, 1.35, 10), material, [0, 0, 0]);
      addPart(group, new THREE.ConeGeometry(0.5, 0.72, 20, 1, true), accent, [0, 0.85, 0]);
      addPart(group, new THREE.SphereGeometry(0.12, 12, 9), pale, [0, 0.65, 0]);
    } else if (handler === "couch") {
      addPart(group, new THREE.BoxGeometry(1.45, 0.48, 0.68), material, [0, -0.12, 0]);
      addPart(group, new THREE.BoxGeometry(1.45, 0.7, 0.22), accent, [0, 0.38, 0.3]);
      [-0.66, 0.66].forEach((x) =>
        addPart(group, new THREE.BoxGeometry(0.2, 0.62, 0.7), material, [x, 0.06, 0]),
      );
      addPart(group, new THREE.BoxGeometry(0.62, 0.12, 0.58), pale, [-0.33, 0.17, -0.03]);
      addPart(group, new THREE.BoxGeometry(0.62, 0.12, 0.58), pale, [0.33, 0.17, -0.03]);
    } else if (handler === "bicycle") {
      [-0.54, 0.54].forEach((x) =>
        addPart(group, new THREE.TorusGeometry(0.34, 0.055, 8, 28), dark, [x, -0.22, 0], [1, 1, 1], [0, 0, 0]),
      );
      addPart(group, new THREE.TorusGeometry(0.36, 0.045, 7, 20), material, [0, 0.03, 0], [1, 0.72, 1], [0, 0, 0]);
      addPart(group, new THREE.CapsuleGeometry(0.045, 0.74, 3, 8), accent, [0.28, 0.18, 0], [1, 1, 1], [0, 0, -0.76]);
    } else if (handler === "chair") {
      addPart(group, new THREE.BoxGeometry(0.95, 0.16, 0.82), material, [0, 0, 0]);
      addPart(group, new THREE.BoxGeometry(0.95, 1.05, 0.15), material, [0, 0.48, 0.35]);
      [-0.36, 0.36].forEach((x) => [-0.28, 0.28].forEach((z) => addPart(group, new THREE.BoxGeometry(0.13, 0.7, 0.13), dark, [x, -0.4, z])));
      if (rich && variant % 2 === 0) {
        [-0.5, 0.5].forEach((x) =>
          addPart(group, new THREE.BoxGeometry(0.12, 0.12, 0.82), accent, [x, 0.18, 0]),
        );
      }
    } else if (handler === "motorcycle") {
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
    } else if (handler === "sailboat") {
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
    } else if (handler === "vehicle") {
      addPart(group, new THREE.BoxGeometry(1.45, 0.46, 0.72), material, [0, 0, 0]);
      addPart(group, new THREE.BoxGeometry(0.75, 0.38, 0.67), pale, [-0.1, 0.38, 0]);
      [-0.48, 0.48].forEach((x) => [-0.39, 0.39].forEach((z) => addPart(group, new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16), dark, [x, -0.27, z], [1, 1, 1], [Math.PI / 2, 0, 0])));
      if (rich) {
        [-0.24, 0.24].forEach((z) =>
          addPart(group, new THREE.SphereGeometry(0.09, 10, 8), accent, [-0.72, 0.02, z]),
        );
      }
    } else if (handler === "bridge") {
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
      handler === "tower"
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
    } else if (handler === "doorway") {
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
    } else if (handler === "stadium") {
      addPart(
        group,
        new THREE.TorusGeometry(0.72, 0.24, 10, 32),
        material,
        [0, 0, 0],
        [1.28, 0.42, 0.9],
        [Math.PI / 2, 0, 0],
      );
      addPart(
        group,
        new THREE.CylinderGeometry(0.51, 0.51, 0.07, 28),
        createMaterial("#65b96c"),
        [0, -0.03, 0],
      );
      addPart(
        group,
        new THREE.BoxGeometry(0.72, 0.025, 0.08),
        pale,
        [0, 0.02, 0],
      );
      if (rich) {
        [-0.62, 0.62].forEach((x) =>
          addPart(
            group,
            new THREE.BoxGeometry(0.1, 0.52, 0.1),
            dark,
            [x, 0.34, 0],
          ),
        );
      }
    } else if (handler === "house") {
      if (name.includes("water tower")) {
        addPart(group, new THREE.SphereGeometry(0.58, 24, 16), material, [0, 0.45, 0], [1.05, 0.82, 1.05]);
        [-0.34, 0.34].forEach((x) =>
          [-0.24, 0.24].forEach((z) =>
            addPart(group, new THREE.CylinderGeometry(0.045, 0.055, 1.1, 8), dark, [x, -0.45, z], [1, 1, 1], [0, 0, x * 0.24]),
          ),
        );
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
    } else if (handler === "ringed-world") {
      addPart(
        group,
        new THREE.SphereGeometry(0.58, 26, 18),
        material,
        [0, 0, 0],
        [1, 0.94, 1],
      );
      [0.82, 1].forEach((radius, ring) => {
        addPart(
          group,
          new THREE.TorusGeometry(radius, ring ? 0.045 : 0.085, 8, 44),
          ring ? accent : pale,
          [0, 0, 0],
          [1, 0.45, 1],
          [0.28, 0.08, -0.12],
        );
      });
      if (subjectKey === "saturn") {
        addPart(
          group,
          new THREE.CylinderGeometry(0.1, 0.1, 0.025, 6),
          accent,
          [0, 0.57, 0],
          [1, 1, 0.7],
        );
      } else if (rich) {
        addPart(
          group,
          new THREE.SphereGeometry(0.08, 9, 7),
          accent,
          [0.18, 0.24, 0.53],
        );
      }
    } else if (handler === "world") {
      const irregular =
        name.includes("small moon") ||
        name.includes("rogue") ||
        subjectKey === "ceres";
      addPart(
        group,
        irregular
          ? new THREE.IcosahedronGeometry(0.68, 2)
          : new THREE.SphereGeometry(0.67, 32, 24),
        material,
        [0, 0, 0],
        subjectKey === "earth" ? [1, 0.97, 1] : [1, 1, 1],
      );
      if (name.includes("saturn") || name.includes("gas giant")) {
        addPart(group, new THREE.TorusGeometry(0.92, name.includes("saturn") ? 0.11 : 0.055, 9, 52), pale, [0, 0, 0], [1, 0.42, 1], [0.25, 0, 0.15]);
      } else if (subjectKey === "earth") {
        for (let land = 0; land < 6; land += 1) {
          const angle = (land / 6) * Math.PI * 2;
          addPart(group, new THREE.DodecahedronGeometry(0.14 + (land % 2) * 0.04, 1), accent, [Math.cos(angle) * 0.59, Math.sin(angle * 1.7) * 0.36, Math.sin(angle) * 0.34]);
        }
      } else if (subjectKey === "europa") {
        addPart(group, new THREE.TorusGeometry(0.66, 0.018, 5, 24), dark, [0, 0, 0], [1, 0.72, 1], [0.45, 0.18, 0.12]);
        addPart(group, new THREE.TorusGeometry(0.65, 0.014, 5, 22), accent, [0, 0, 0], [0.76, 1, 1], [-0.32, 0.52, 0.18]);
      } else if (subjectKey === "moon") {
        [[-0.22, 0.2, 0.6], [0.26, -0.15, 0.6], [0.12, 0.34, 0.55]].forEach(
          (position, crater) =>
            addPart(
              group,
              new THREE.SphereGeometry(crater === 1 ? 0.13 : 0.09, 8, 6),
              dark,
              position as [number, number, number],
              [1, 1, 0.22],
            ),
        );
      } else if (subjectKey === "ceres" || subjectKey === "mercury") {
        const craterPositions =
          subjectKey === "ceres"
            ? [[-0.3, 0.24, 0.53], [0.25, -0.3, 0.55]]
            : [[-0.12, 0.28, 0.61], [0.34, -0.08, 0.54], [-0.3, -0.26, 0.52]];
        craterPositions.forEach((position, crater) =>
          addPart(
            group,
            new THREE.SphereGeometry(0.075 + crater * 0.018, 8, 6),
            subjectKey === "ceres" ? accent : dark,
            position as [number, number, number],
            [1, 1, 0.2],
          ),
        );
      } else if (subjectKey === "pluto") {
        [-0.085, 0.085].forEach((x) =>
          addPart(group, new THREE.SphereGeometry(0.14, 8, 6), pale, [x, 0.14, 0.59], [1, 1.18, 0.25]),
        );
      } else if (subjectKey === "venus") {
        [-0.2, 0.2].forEach((y, band) =>
          addPart(group, new THREE.TorusGeometry(0.61, 0.028, 5, 24), band ? pale : accent, [0, y, 0], [1, 1, 1], [Math.PI / 2, 0, 0]),
        );
      } else if (subjectKey === "mars") {
        addPart(group, new THREE.SphereGeometry(0.19, 9, 6), pale, [0, 0.6, 0], [1, 0.28, 1]);
        addPart(group, new THREE.SphereGeometry(0.1, 8, 6), dark, [0.3, -0.08, 0.56], [1, 1, 0.22]);
      } else if (subjectKey === "jupiter") {
        [-0.22, 0.18].forEach((y, band) =>
          addPart(group, new THREE.TorusGeometry(0.61, 0.035, 5, 26), band ? pale : accent, [0, y, 0], [1, 1, 1], [Math.PI / 2, 0, 0]),
        );
        addPart(group, new THREE.SphereGeometry(0.1, 8, 6), createMaterial("#b94f45"), [0.34, -0.08, 0.55], [1.35, 0.75, 0.2]);
      } else if (subjectKey === "uranus") {
        addPart(group, new THREE.TorusGeometry(0.82, 0.025, 5, 30), pale, [0, 0, 0], [1, 0.38, 1], [0.2, 0.12, 1.22]);
      } else if (subjectKey === "neptune") {
        addPart(group, new THREE.TorusGeometry(0.61, 0.025, 5, 24), pale, [0, -0.14, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
        addPart(group, new THREE.SphereGeometry(0.095, 8, 6), dark, [-0.3, 0.14, 0.56], [1.25, 0.8, 0.2]);
      } else if (rich) {
        addPart(group, new THREE.SphereGeometry(0.11 + variant * 0.015, 12, 9), accent, [0.84, 0.3, -0.16]);
      }
    } else if (handler === "star") {
      addPart(group, new THREE.IcosahedronGeometry(0.72, 3), material, [0, 0, 0]);
      addPart(group, new THREE.SphereGeometry(0.96, 20, 14), new THREE.MeshBasicMaterial({ color: curio.color, transparent: true, opacity: 0.12, side: THREE.BackSide }), [0, 0, 0]);
      if (subjectKey === "sun") {
        addPart(group, new THREE.RingGeometry(0.76, 0.96, 16), pale, [0, 0, 0.04], [1, 1, 1], [0.08, 0.2, 0]);
      } else if (rich) {
        addPart(group, new THREE.TorusGeometry(0.86, 0.025, 6, 30), accent, [0, 0, 0], [1, 0.62, 1], [0.4, 0.2, 0]);
      }
    } else if (handler === "dense-star") {
      addPart(
        group,
        new THREE.IcosahedronGeometry(0.46, 3),
        pale,
        [0, 0, 0],
        [1, 1.08, 1],
      );
      [-1, 1].forEach((direction) => {
        addPart(
          group,
          new THREE.ConeGeometry(0.18, 0.88, 8),
          direction > 0 ? material : accent,
          [0, direction * 0.68, 0],
          [0.62, 1, 0.62],
          [direction > 0 ? 0 : Math.PI, 0, 0],
        );
      });
      addPart(
        group,
        new THREE.TorusGeometry(0.64, 0.035, 7, 30),
        material,
        [0, 0, 0],
        [1, 0.34, 1],
        [0.16, 0.24, 0],
      );
    } else if (handler === "orbit-system") {
      addPart(group, new THREE.SphereGeometry(0.2, 16, 12), material, [0, 0, 0]);
      [0.45, 0.72, 0.98].forEach((radius, index) => {
        addPart(group, new THREE.TorusGeometry(radius, 0.018, 5, 42), pale, [0, 0, 0], [1, 0.35 + index * 0.12, 1], [0.3 * index, 0.15, 0]);
      });
      if (rich || subjectKey === "solar-system") {
        addPart(group, new THREE.SphereGeometry(0.1, 10, 8), accent, [0.56, 0.04, 0.16]);
        addPart(group, new THREE.SphereGeometry(0.075, 9, 7), material, [-0.78, -0.05, -0.12]);
      }
    } else if (handler === "star-cluster") {
      const starPositions = [
        [-0.5, 0.08, -0.12],
        [-0.22, 0.48, 0.1],
        [0.08, 0.06, 0.2],
        [0.42, 0.4, -0.16],
        [0.52, -0.22, 0.16],
        [-0.26, -0.42, -0.2],
        [0.12, -0.5, 0.04],
      ] as const;
      starPositions
        .slice(0, subjectKey === "pleiades" ? 7 : 5)
        .forEach((position, star) => {
        addPart(
          group,
          new THREE.IcosahedronGeometry(0.14 + (star % 3) * 0.045, 1),
          star % 3 === 0 ? pale : star % 2 ? accent : material,
          position as [number, number, number],
        );
        });
      if (rich) {
        addPart(
          group,
          new THREE.SphereGeometry(0.86, 14, 10),
          new THREE.MeshBasicMaterial({
            color: curio.color,
            side: THREE.BackSide,
            transparent: true,
            opacity: 0.08,
          }),
          [0, 0, 0],
        );
      }
    } else if (handler === "nebula") {
      const cloudMaterial = new THREE.MeshBasicMaterial({
        color: curio.color,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      });
      const cloudPositions = [
        [-0.56, 0.02, -0.12],
        [-0.28, 0.28, 0.18],
        [0.04, 0.04, -0.14],
        [0.34, 0.25, 0.16],
        [0.58, -0.08, -0.08],
        [0.08, -0.32, 0.2],
      ] as const;
      cloudPositions.forEach((position, cloud) => {
        addPart(
          group,
          new THREE.IcosahedronGeometry(0.3 + (cloud % 3) * 0.07, 2),
          cloud % 2 ? cloudMaterial : accent,
          position as [number, number, number],
          [1.2, 0.76, 0.9],
        );
      });
      if (subjectKey === "orion-nebula-m42") {
        [[-0.09, 0.08, 0.28], [0.09, 0.08, 0.28], [-0.06, -0.08, 0.28], [0.08, -0.07, 0.28]].forEach(
          (position) =>
            addPart(
              group,
              new THREE.OctahedronGeometry(0.045, 0),
              pale,
              position as [number, number, number],
            ),
        );
      }
      if (rich) {
        addPart(
          group,
          new THREE.OctahedronGeometry(0.12, 0),
          pale,
          [0.42, 0.5, -0.18],
        );
      }
    } else if (handler === "galaxy") {
      const irregular = name.includes("irregular");
      const namedLocalGroupGalaxy = ["milky-way", "andromeda", "triangulum"].includes(subjectKey);
      addPart(group, new THREE.SphereGeometry(name.includes("active") ? 0.26 : 0.18, 16, 12), name.includes("active") ? accent : pale, [0, 0, 0]);
      if (irregular) {
        const galaxyBits = 6;
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
        const diskScale: [number, number, number] =
          subjectKey === "andromeda"
            ? [1.3, 0.16, 0.78]
            : subjectKey === "triangulum"
              ? [0.86, 0.24, 1]
              : [1, 0.2, 1];
        for (let i = 0; i < (namedLocalGroupGalaxy ? 2 : 3); i += 1) {
          addPart(group, new THREE.TorusGeometry(0.38 + i * 0.2, 0.075, 7, 52), material, [0, 0, 0], diskScale, [0.2, i * (name.includes("barred") || subjectKey === "milky-way" ? 0.34 : 0.6), 0]);
        }
        if (name.includes("barred") || subjectKey === "milky-way") {
          addPart(group, new THREE.CapsuleGeometry(0.075, 0.75, 4, 10), pale, [0, 0, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
        } else if (subjectKey === "andromeda") {
          addPart(group, new THREE.SphereGeometry(0.085, 8, 6), accent, [0.78, 0.16, 0.1]);
        } else if (subjectKey === "triangulum") {
          [[-0.38, -0.2, 0.05], [0.42, -0.16, -0.06], [0.02, 0.38, 0.08]].forEach((position) =>
            addPart(group, new THREE.IcosahedronGeometry(0.07, 0), accent, position as [number, number, number]),
          );
        }
      }
      if (rich) {
        addPart(group, new THREE.SphereGeometry(0.07, 9, 7), accent, [0.72, 0.14, 0.2]);
        addPart(group, new THREE.SphereGeometry(0.055, 8, 6), pale, [-0.62, -0.2, -0.28]);
      }
    } else if (handler === "galaxy-cluster") {
      const galaxyPositions = subjectKey === "local-group"
        ? [[-0.58, 0.22, -0.18], [0.08, -0.18, 0.12], [0.54, 0.3, 0.04]]
        : subjectKey === "virgo-cluster"
          ? [[-0.58, 0.34, -0.18], [-0.42, -0.28, 0.14], [-0.12, 0.12, 0.04], [0.16, -0.34, -0.12], [0.34, 0.18, 0.18], [0.58, -0.04, -0.08], [0.48, 0.48, 0.1]]
          : [[-0.52, 0.26, -0.2], [-0.18, -0.34, 0.16], [0.08, 0.16, 0.04], [0.46, -0.18, -0.12], [0.56, 0.4, 0.2]];
      galaxyPositions.forEach((position, galaxy) => {
        const radius = 0.18 + (galaxy % 2) * 0.05;
        addPart(
          group,
          new THREE.TorusGeometry(radius, 0.035, 6, 20),
          galaxy % 2 ? accent : material,
          position as [number, number, number],
          [1, 0.28, 1],
          [galaxy * 0.24, galaxy * 0.38, 0],
        );
        addPart(
          group,
          new THREE.SphereGeometry(0.055, 8, 6),
          pale,
          position as [number, number, number],
        );
      });
      if (rich) {
        addPart(
          group,
          new THREE.SphereGeometry(0.92, 12, 8),
          new THREE.MeshBasicMaterial({
            color: curio.color,
            side: THREE.BackSide,
            transparent: true,
            opacity: 0.07,
          }),
          [0, 0, 0],
        );
      }
    } else if (handler === "cosmic-web") {
      const nodes = [
        [-0.72, 0.28, -0.16],
        [-0.28, -0.32, 0.2],
        [-0.06, 0.48, 0.08],
        [0.28, 0.02, -0.22],
        [0.66, 0.38, 0.16],
        [0.58, -0.4, -0.02],
      ] as const;
      const edges = [
        [0, 1],
        [0, 2],
        [1, 3],
        [2, 3],
        [2, 4],
        [3, 4],
        [3, 5],
        [4, 5],
      ] as const;
      edges.forEach(([from, to], edge) => {
        const curve = new THREE.LineCurve3(
          new THREE.Vector3(...nodes[from]),
          new THREE.Vector3(...nodes[to]),
        );
        addPart(
          group,
          new THREE.TubeGeometry(curve, 4, 0.028, 5, false),
          edge % 2 ? accent : material,
          [0, 0, 0],
        );
      });
      nodes.forEach((position, node) => {
        addPart(
          group,
          new THREE.IcosahedronGeometry(0.11 + (node % 3) * 0.025, 1),
          node % 2 ? pale : accent,
          position as [number, number, number],
        );
      });
    } else if (handler === "cosmic-void") {
      addPart(
        group,
        new THREE.IcosahedronGeometry(0.82, 2),
        new THREE.MeshBasicMaterial({
          color: curio.color,
          wireframe: true,
          transparent: true,
          opacity: 0.54,
        }),
        [0, 0, 0],
        [1.1, 0.84, 1],
      );
      [
        [-0.72, 0.28, 0.18],
        [0.66, 0.34, -0.16],
        [-0.54, -0.5, -0.2],
        [0.5, -0.48, 0.22],
      ].forEach((position, galaxy) => {
        addPart(
          group,
          new THREE.TorusGeometry(0.11, 0.022, 5, 14),
          galaxy % 2 ? accent : pale,
          position as [number, number, number],
          [1, 0.3, 1],
          [galaxy * 0.5, galaxy * 0.32, 0],
        );
      });
    } else if (handler === "horizon") {
      addPart(
        group,
        new THREE.TorusGeometry(0.78, 0.07, 8, 40),
        material,
        [0, 0, 0],
        [1, 0.86, 1],
        [0.28, 0.2, 0],
      );
      addPart(
        group,
        new THREE.RingGeometry(0.45, 0.68, 32),
        new THREE.MeshBasicMaterial({
          color: curio.color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.22,
        }),
        [0, 0, 0],
        [1, 0.86, 1],
        [0.28, 0.2, 0],
      );
      addPart(
        group,
        new THREE.SphereGeometry(0.15, 12, 8),
        pale,
        [0, 0, 0],
      );
      if (rich) {
        addPart(
          group,
          new THREE.TorusGeometry(0.5, 0.018, 5, 28),
          accent,
          [0, 0, 0],
          [1, 0.86, 1],
          [0.28, 0.2, 0],
        );
      }
    } else if (handler === "speculative-reality") {
      addPart(
        group,
        new THREE.TorusKnotGeometry(
          0.43,
          0.075,
          54,
          7,
          2 + (variant % 2),
          3,
        ),
        material,
        [0, 0, 0],
        [1, 0.84, 1],
        [0.2, variant * 0.18, 0.12],
      );
      [
        [-0.48, 0.34, 0.12],
        [0.5, 0.26, -0.1],
        [0.02, -0.52, 0.16],
      ].forEach((position, reality) => {
        addPart(
          group,
          reality === 1
            ? new THREE.OctahedronGeometry(0.18, 1)
            : new THREE.IcosahedronGeometry(0.17, 1),
          reality % 2 ? pale : accent,
          position as [number, number, number],
        );
      });
      if (rich) {
        addPart(
          group,
          new THREE.TorusGeometry(0.78, 0.025, 5, 8),
          pale,
          [0, 0, 0],
          [1, 0.72, 1],
          [0.72, 0.34, 0.2],
        );
      }
    } else if (handler === "artifact") {
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
    } else {
      const unhandledForm: never = handler;
      throw new TypeError(`Unhandled collectible visual form: ${unhandledForm}`);
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


  return { buildVisual, applyPhysicalMaterialQuality };
}
