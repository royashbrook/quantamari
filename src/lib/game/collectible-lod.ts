import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { Curio } from "../scale-data";

type BuildVisual = (curio: Curio, rich?: boolean) => THREE.Group;

export type CollectibleInstanceGeometries = {
  solid: THREE.BufferGeometry | null;
  effect: THREE.BufferGeometry | null;
};

export type CollectibleGeometryLibrary = ReturnType<
  typeof createCollectibleGeometryLibrary
>;

type LodFamily = {
  solid: THREE.InstancedMesh | null;
  effect: THREE.InstancedMesh | null;
  count: number;
};

const INSTANCES_PER_COLLECTIBLE = 256;

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

function materialIsEffect(material: THREE.Material | undefined) {
  if (!material) return false;
  const physical = material as THREE.MeshPhysicalMaterial;
  const drawable = material as THREE.MeshBasicMaterial;
  return (
    material.transparent ||
    material.opacity < 0.98 ||
    drawable.wireframe === true ||
    physical.transmission > 0 ||
    material.depthWrite === false ||
    material.blending !== THREE.NormalBlending
  );
}

function mergeParts(parts: THREE.BufferGeometry[]) {
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((geometry) => geometry.dispose());
  if (!merged) return null;
  merged.computeBoundingSphere();
  return merged;
}

function fitLayersToBounds(
  layers: Array<THREE.BufferGeometry | null>,
  sourceBounds: THREE.Box3,
) {
  const activeLayers = layers.filter(
    (layer): layer is THREE.BufferGeometry => layer !== null,
  );
  const replacementBounds = new THREE.Box3();
  activeLayers.forEach((layer) => {
    layer.computeBoundingBox();
    replacementBounds.union(layer.boundingBox!);
  });
  if (replacementBounds.isEmpty() || sourceBounds.isEmpty()) return;

  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const replacementSize = replacementBounds.getSize(new THREE.Vector3());
  const scale = new THREE.Vector3(
    replacementSize.x > 1e-6 ? sourceSize.x / replacementSize.x : 1,
    replacementSize.y > 1e-6 ? sourceSize.y / replacementSize.y : 1,
    replacementSize.z > 1e-6 ? sourceSize.z / replacementSize.z : 1,
  );
  activeLayers.forEach((layer) => layer.scale(scale.x, scale.y, scale.z));

  replacementBounds.makeEmpty();
  activeLayers.forEach((layer) => {
    layer.computeBoundingBox();
    replacementBounds.union(layer.boundingBox!);
  });
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const replacementCenter = replacementBounds.getCenter(new THREE.Vector3());
  const offset = sourceCenter.sub(replacementCenter);
  activeLayers.forEach((layer) => {
    layer.translate(offset.x, offset.y, offset.z);
    layer.computeBoundingBox();
    layer.computeBoundingSphere();
  });
}

function lowPolyGeometryFor(geometry: THREE.BufferGeometry) {
  const preserveEnvelope = (replacement: THREE.BufferGeometry) => {
    geometry.computeBoundingBox();
    replacement.computeBoundingBox();
    const sourceBounds = geometry.boundingBox;
    const replacementBounds = replacement.boundingBox;
    if (!sourceBounds || !replacementBounds) return replacement;

    const sourceSize = sourceBounds.getSize(new THREE.Vector3());
    const replacementSize = replacementBounds.getSize(new THREE.Vector3());
    replacement.scale(
      replacementSize.x > 1e-6 ? sourceSize.x / replacementSize.x : 1,
      replacementSize.y > 1e-6 ? sourceSize.y / replacementSize.y : 1,
      replacementSize.z > 1e-6 ? sourceSize.z / replacementSize.z : 1,
    );
    replacement.computeBoundingBox();
    const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
    const replacementCenter = replacement.boundingBox!.getCenter(
      new THREE.Vector3(),
    );
    replacement.translate(
      sourceCenter.x - replacementCenter.x,
      sourceCenter.y - replacementCenter.y,
      sourceCenter.z - replacementCenter.z,
    );
    replacement.computeBoundingBox();
    replacement.computeBoundingSphere();
    return replacement;
  };
  const parameters = (
    geometry as THREE.BufferGeometry & {
      parameters: Record<string, any>;
    }
  ).parameters;
  switch (geometry.type) {
    case "SphereGeometry":
      return preserveEnvelope(new THREE.SphereGeometry(
        parameters.radius,
        5,
        3,
        parameters.phiStart,
        parameters.phiLength,
        parameters.thetaStart,
        parameters.thetaLength,
      ));
    case "IcosahedronGeometry":
      return preserveEnvelope(
        new THREE.IcosahedronGeometry(parameters.radius, 0),
      );
    case "DodecahedronGeometry":
      return preserveEnvelope(
        new THREE.DodecahedronGeometry(parameters.radius, 0),
      );
    case "OctahedronGeometry":
      return preserveEnvelope(
        new THREE.OctahedronGeometry(parameters.radius, 0),
      );
    case "TorusGeometry":
      return preserveEnvelope(new THREE.TorusGeometry(
        parameters.radius,
        parameters.tube,
        3,
        8,
        parameters.arc,
      ));
    case "TorusKnotGeometry":
      return preserveEnvelope(new THREE.TorusKnotGeometry(
        parameters.radius,
        parameters.tube,
        12,
        3,
        parameters.p,
        parameters.q,
      ));
    case "TubeGeometry":
      return preserveEnvelope(new THREE.TubeGeometry(
        parameters.path,
        8,
        parameters.radius,
        3,
        parameters.closed,
      ));
    case "ConeGeometry":
      return preserveEnvelope(new THREE.ConeGeometry(
        parameters.radius,
        parameters.height,
        6,
        1,
        parameters.openEnded,
        parameters.thetaStart,
        parameters.thetaLength,
      ));
    case "CylinderGeometry":
      return preserveEnvelope(new THREE.CylinderGeometry(
        parameters.radiusTop,
        parameters.radiusBottom,
        parameters.height,
        6,
        1,
        parameters.openEnded,
        parameters.thetaStart,
        parameters.thetaLength,
      ));
    case "CapsuleGeometry":
      return preserveEnvelope(new THREE.CapsuleGeometry(
        parameters.radius,
        parameters.height,
        1,
        5,
      ));
    case "RingGeometry":
      return preserveEnvelope(new THREE.RingGeometry(
        parameters.innerRadius,
        parameters.outerRadius,
        12,
        1,
        parameters.thetaStart,
        parameters.thetaLength,
      ));
    default:
      return geometry.clone();
  }
}

/**
 * Bakes an authored collectible into two merge-compatible silhouettes.
 * Opaque structure stays solid while membranes, probability clouds, halos,
 * wireframes, and glass remain a separate effect shell. The same pair can be
 * instanced in the world, woven into a foundation, or attached to the mash.
 */
export function createCollectibleInstanceGeometries(
  curio: Curio,
  buildVisual: BuildVisual,
  rich: boolean,
): CollectibleInstanceGeometries {
  const visual = buildVisual(curio, rich);
  visual.updateMatrixWorld(true);
  const authoredBounds = new THREE.Box3().setFromObject(visual, true);
  const solidParts: THREE.BufferGeometry[] = [];
  const effectParts: THREE.BufferGeometry[] = [];
  visual.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const transformed = (rich
      ? object.geometry.clone()
      : lowPolyGeometryFor(object.geometry)
    ).applyMatrix4(object.matrixWorld);
    const geometry = transformed.index
      ? transformed.toNonIndexed()
      : transformed;
    if (geometry !== transformed) transformed.dispose();
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
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
      if (!["position", "normal", "color"].includes(attribute)) {
        geometry.deleteAttribute(attribute);
      }
    }
    geometry.clearGroups();
    (materialIsEffect(material) ? effectParts : solidParts).push(geometry);
  });
  disposeBuiltVisual(visual);

  const solid = mergeParts(solidParts);
  const effect = mergeParts(effectParts);
  if (!solid && !effect) {
    throw new TypeError(
      `Collectible ${curio.id} has no authored LOD geometry`,
    );
  }
  if (solid) solid.userData.collectibleLayer = "solid";
  if (effect) effect.userData.collectibleLayer = "effect";
  if (!rich) fitLayersToBounds([solid, effect], authoredBounds);
  return { solid, effect };
}

/**
 * Compatibility helper for tooling that needs one geometry. Runtime rendering
 * deliberately uses createCollectibleInstanceGeometries so effects stay effects.
 */
export function createCollectibleInstanceGeometry(
  curio: Curio,
  buildVisual: BuildVisual,
  rich: boolean,
) {
  const { solid, effect } = createCollectibleInstanceGeometries(
    curio,
    buildVisual,
    rich,
  );
  if (solid && !effect) return solid;
  if (effect && !solid) return effect;
  const merged = mergeGeometries([solid!, effect!], false);
  solid!.dispose();
  effect!.dispose();
  if (!merged) {
    throw new TypeError(
      `Collectible ${curio.id} could not merge its authored LOD geometry`,
    );
  }
  merged.computeBoundingSphere();
  return merged;
}

export function createCollectibleGeometryLibrary(buildVisual: BuildVisual) {
  const cache = new Map<string, CollectibleInstanceGeometries>();
  let disposed = false;
  return {
    geometryFor(curio: Curio, rich = false) {
      if (disposed) throw new TypeError("Collectible geometry library is disposed");
      const key = `${curio.id}:${rich ? "rich" : "simple"}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const geometries = createCollectibleInstanceGeometries(
        curio,
        buildVisual,
        rich,
      );
      cache.set(key, geometries);
      return geometries;
    },
    get size() {
      return cache.size;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cache.forEach(({ solid, effect }) => {
        solid?.dispose();
        effect?.dispose();
      });
      cache.clear();
    },
  };
}

export function createCollectibleLodPool(
  scene: THREE.Scene,
  _camera: THREE.PerspectiveCamera,
  buildVisual: BuildVisual,
  sharedLibrary?: CollectibleGeometryLibrary,
) {
  const families = new Map<string, LodFamily>();
  const geometryLibrary =
    sharedLibrary ?? createCollectibleGeometryLibrary(buildVisual);
  const ownsGeometryLibrary = !sharedLibrary;
  const solidMaterial = new THREE.MeshToonMaterial({
    color: "#ffffff",
    vertexColors: true,
  });
  const effectMaterial = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    vertexColors: true,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  let disposed = false;

  const makeInstances = (
    geometry: THREE.BufferGeometry | null,
    material: THREE.Material,
    name: string,
  ) => {
    if (!geometry) return null;
    const mesh = new THREE.InstancedMesh(
      geometry,
      material,
      INSTANCES_PER_COLLECTIBLE,
    );
    mesh.name = name;
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    return mesh;
  };

  const familyFor = (curio: Curio) => {
    const cached = families.get(curio.id);
    if (cached) return cached;
    const geometries = geometryLibrary.geometryFor(curio, false);
    const family = {
      solid: makeInstances(
        geometries.solid,
        solidMaterial,
        `collectible-lod:solid:${curio.id}`,
      ),
      effect: makeInstances(
        geometries.effect,
        effectMaterial,
        `collectible-lod:effect:${curio.id}`,
      ),
      count: 0,
    };
    families.set(curio.id, family);
    return family;
  };

  return {
    beginFrame() {
      families.forEach((family) => {
        family.count = 0;
        if (family.solid) family.solid.visible = false;
        if (family.effect) family.effect.visible = false;
      });
    },
    add(curio: Curio, matrix: THREE.Matrix4) {
      const family = familyFor(curio);
      if (family.count >= INSTANCES_PER_COLLECTIBLE) return false;
      family.solid?.setMatrixAt(family.count, matrix);
      family.effect?.setMatrixAt(family.count, matrix);
      family.count += 1;
      return true;
    },
    endFrame() {
      let instances = 0;
      let drawCalls = 0;
      families.forEach((family) => {
        for (const mesh of [family.solid, family.effect]) {
          if (!mesh) continue;
          mesh.count = family.count;
          mesh.visible = family.count > 0;
          if (family.count > 0) drawCalls += 1;
          mesh.instanceMatrix.needsUpdate = true;
        }
        if (family.count > 0) instances += family.count;
      });
      return { instances, badges: 0, drawCalls };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      families.forEach(({ solid, effect }) => {
        if (solid) {
          solid.dispose();
          scene.remove(solid);
        }
        if (effect) {
          effect.dispose();
          scene.remove(effect);
        }
      });
      families.clear();
      solidMaterial.dispose();
      effectMaterial.dispose();
      if (ownsGeometryLibrary) geometryLibrary.dispose();
    },
  };
}
