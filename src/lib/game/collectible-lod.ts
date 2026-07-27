import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { Curio } from "../scale-data";

type BuildVisual = (curio: Curio, rich?: boolean) => THREE.Group;

type LodFamily = {
  mesh: THREE.InstancedMesh;
  badge: THREE.InstancedMesh;
  count: number;
  badgeCount: number;
};

const INSTANCES_PER_COLLECTIBLE = 256;

function createBadgeTexture(curio: Curio) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, 256, 256);
  context.fillStyle = "rgba(255, 255, 255, .94)";
  context.strokeStyle = "#30203f";
  context.lineWidth = 13;
  context.beginPath();
  context.arc(128, 128, 101, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = curio.color;
  context.beginPath();
  context.arc(128, 122, 80, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#30203f";
  [99, 157].forEach((x) => {
    context.beginPath();
    context.ellipse(x, 103, 11, 16, 0, 0, Math.PI * 2);
    context.fill();
  });
  context.fillStyle = "#ffffff";
  [95, 153].forEach((x) => {
    context.beginPath();
    context.arc(x, 98, 4, 0, Math.PI * 2);
    context.fill();
  });
  context.strokeStyle = "#30203f";
  context.lineWidth = 9;
  context.beginPath();
  context.arc(128, 125, 27, 0.15, Math.PI - 0.15);
  context.stroke();
  context.fillStyle = "#ff91b8";
  [78, 178].forEach((x) => {
    context.beginPath();
    context.ellipse(x, 133, 13, 8, 0, 0, Math.PI * 2);
    context.fill();
  });
  context.fillStyle = "#30203f";
  context.font = `900 ${curio.symbol.length > 2 ? 42 : curio.symbol.length > 1 ? 52 : 64}px "Arial Rounded MT Bold", Arial`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(curio.symbol, 128, 193, 150);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createBadgeMaterial(curio: Curio) {
  return new THREE.MeshBasicMaterial({
    map: createBadgeTexture(curio),
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.08,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

function disposeBuiltVisual(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const owned = Array.isArray(object.material)
      ? object.material
      : [object.material];
    owned.forEach((material) => materials.add(material));
  });
  materials.forEach((material) => material.dispose());
}

function traceSilhouetteGeometry(curio: Curio) {
  switch (curio.shape) {
    case "quark":
      return new THREE.TorusKnotGeometry(0.42, 0.1, 28, 6, 2, 3);
    case "spark":
      return new THREE.OctahedronGeometry(0.58, 0);
    case "bubble":
    case "atom":
      return new THREE.IcosahedronGeometry(0.54, 1);
    case "fiber":
      return new THREE.CapsuleGeometry(0.16, 0.78, 4, 8);
    default:
      return new THREE.TorusGeometry(0.42, 0.12, 6, 16);
  }
}

/**
 * Converts the authored low-detail collectible into one merged silhouette,
 * then instances that silhouette for every distant copy of the same specimen.
 * A chair stays chair-shaped and a bacteriophage stays phage-shaped without
 * paying one draw call per object.
 */
function createSilhouetteGeometry(curio: Curio, buildVisual: BuildVisual) {
  const visual = buildVisual(curio, false);
  visual.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  visual.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    const material = Array.isArray(object.material)
      ? object.material[0]
      : object.material;
    const color =
      material && "color" in material
        ? (material.color as THREE.Color)
        : new THREE.Color(curio.color);
    const colors = new Float32Array(
      geometry.getAttribute("position").count * 3,
    );
    for (let index = 0; index < colors.length; index += 3) {
      colors[index] = color.r;
      colors[index + 1] = color.g;
      colors[index + 2] = color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    for (const attribute of Object.keys(geometry.attributes)) {
      if (!["position", "normal", "uv", "color"].includes(attribute)) {
        geometry.deleteAttribute(attribute);
      }
    }
    geometry.clearGroups();
    parts.push(geometry);
  });
  if (parts.length === 0) {
    disposeBuiltVisual(visual);
    const traced = traceSilhouetteGeometry(curio);
    const color = new THREE.Color(curio.color);
    const colors = new Float32Array(
      traced.getAttribute("position").count * 3,
    );
    for (let index = 0; index < colors.length; index += 3) {
      colors[index] = color.r;
      colors[index + 1] = color.g;
      colors[index + 2] = color.b;
    }
    traced.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    traced.computeBoundingSphere();
    return traced;
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((geometry) => geometry.dispose());
  disposeBuiltVisual(visual);
  if (!merged) {
    const traced = traceSilhouetteGeometry(curio);
    const color = new THREE.Color(curio.color);
    const colors = new Float32Array(
      traced.getAttribute("position").count * 3,
    );
    for (let index = 0; index < colors.length; index += 3) {
      colors[index] = color.r;
      colors[index + 1] = color.g;
      colors[index + 2] = color.b;
    }
    traced.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    traced.computeBoundingSphere();
    return traced;
  }
  merged.computeBoundingSphere();
  return merged;
}

export function createCollectibleLodPool(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  buildVisual: BuildVisual,
) {
  const families = new Map<string, LodFamily>();
  const badgeDummy = new THREE.Object3D();
  const badgePosition = new THREE.Vector3();

  const addBadge = (family: LodFamily, position: THREE.Vector3) => {
    if (family.badgeCount >= INSTANCES_PER_COLLECTIBLE) return false;
    const distance = camera.position.distanceTo(position);
    const worldSize =
      distance *
      2 *
      Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) *
      (30 / Math.max(1, window.innerHeight));
    badgeDummy.position.copy(position);
    badgeDummy.quaternion.copy(camera.quaternion);
    badgeDummy.scale.setScalar(worldSize);
    badgeDummy.updateMatrix();
    family.badge.setMatrixAt(family.badgeCount, badgeDummy.matrix);
    family.badgeCount += 1;
    return true;
  };

  const familyFor = (curio: Curio) => {
    const cached = families.get(curio.id);
    if (cached) return cached;
    const mesh = new THREE.InstancedMesh(
      createSilhouetteGeometry(curio, buildVisual),
      new THREE.MeshToonMaterial({
        color: "#ffffff",
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
      }),
      INSTANCES_PER_COLLECTIBLE,
    );
    mesh.name = `collectible-lod:${curio.id}`;
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    const badge = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      createBadgeMaterial(curio),
      INSTANCES_PER_COLLECTIBLE,
    );
    badge.name = `collectible-badge:${curio.id}`;
    badge.count = 0;
    badge.visible = false;
    badge.frustumCulled = false;
    badge.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    badge.renderOrder = 20;
    scene.add(badge);
    const family = {
      mesh,
      badge,
      count: 0,
      badgeCount: 0,
    };
    families.set(curio.id, family);
    return family;
  };

  return {
    beginFrame() {
      families.forEach((family) => {
        family.count = 0;
        family.badgeCount = 0;
        family.mesh.visible = false;
        family.badge.visible = false;
      });
    },
    add(curio: Curio, matrix: THREE.Matrix4, showBadge: boolean) {
      const family = familyFor(curio);
      if (family.count >= INSTANCES_PER_COLLECTIBLE) return false;
      family.mesh.setMatrixAt(family.count, matrix);
      if (showBadge) {
        badgePosition.setFromMatrixPosition(matrix);
        addBadge(family, badgePosition);
      }
      family.count += 1;
      return true;
    },
    addBadge(curio: Curio, position: THREE.Vector3) {
      return addBadge(familyFor(curio), position);
    },
    endFrame() {
      let instances = 0;
      let badges = 0;
      let drawCalls = 0;
      families.forEach((family) => {
        family.mesh.count = family.count;
        family.badge.count = family.badgeCount;
        family.mesh.visible = family.count > 0;
        family.badge.visible = family.badgeCount > 0;
        if (family.count === 0 && family.badgeCount === 0) return;
        instances += family.count;
        badges += family.badgeCount;
        drawCalls +=
          (family.count > 0 ? 1 : 0) + (family.badgeCount > 0 ? 1 : 0);
        family.mesh.instanceMatrix.needsUpdate = true;
        family.badge.instanceMatrix.needsUpdate = true;
      });
      return { instances, badges, drawCalls };
    },
    dispose() {
      families.forEach(({ mesh, badge }) => {
        scene.remove(mesh);
        scene.remove(badge);
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        materials.forEach((material) => material.dispose());
        badge.geometry.dispose();
        const badgeMaterials = Array.isArray(badge.material)
          ? badge.material
          : [badge.material];
        badgeMaterials.forEach((material) => {
          if (material instanceof THREE.MeshBasicMaterial) {
            material.map?.dispose();
          }
          material.dispose();
        });
      });
      families.clear();
    },
  };
}
