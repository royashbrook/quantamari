import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { createServer } from "vite";

import {
  COLLECTIBLE_VISUAL_HANDLER_BY_FORM,
  collectibleVisualHandlerFor,
} from "../../src/lib/game/collectible-visual-contract.ts";
import {
  COLLECTIBLE_MARKER_MAX_TEXTURE_BYTES,
  COLLECTIBLE_MARKER_TEXTURE_EDGE,
  COLLECTIBLE_MARKER_TEXTURE_LIMIT,
  collectibleMarkerTextureBytes,
  createCollectibleMarkerFactory,
} from "../../src/lib/game/collectible-markers.ts";
import {
  createCollectibleGeometryLibrary,
  createCollectibleInstanceGeometries,
  createCollectibleLodPool,
} from "../../src/lib/game/collectible-lod.ts";
import { ERAS, VISUAL_FORMS } from "../../src/lib/scale-data.ts";

const curios = ERAS.flatMap((era) => era.curios);

function roundedVector(vector) {
  return [vector.x, vector.y, vector.z].map((value) =>
    Number(value.toFixed(4)),
  );
}

function silhouetteSignature(root) {
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.computeBoundingBox();
    const worldBounds = object.geometry.boundingBox
      .clone()
      .applyMatrix4(object.matrixWorld);
    parts.push([
      object.geometry.type,
      roundedVector(worldBounds.getCenter(new THREE.Vector3())),
      roundedVector(worldBounds.getSize(new THREE.Vector3())),
      roundedVector(object.rotation),
    ]);
  });
  return JSON.stringify(parts);
}

function installFakeCanvasDocument() {
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement(tagName) {
      assert.equal(tagName, "canvas");
      const canvas = {
        width: 0,
        height: 0,
        drawnText: [],
        getContext(contextType) {
          assert.equal(contextType, "2d");
          return {
            scale() {},
            clearRect() {},
            beginPath() {},
            ellipse() {},
            fill() {},
            stroke() {},
            arc() {},
            strokeText(text) {
              canvas.drawnText.push(text);
            },
            fillText(text) {
              canvas.drawnText.push(text);
            },
          };
        },
      };
      return canvas;
    },
  };
  return () => {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  };
}

test("every catalog visual form has an explicit renderer contract", () => {
  assert.deepEqual(
    Object.keys(COLLECTIBLE_VISUAL_HANDLER_BY_FORM).sort(),
    [...VISUAL_FORMS].sort(),
  );
  assert.equal(new Set(curios.map((curio) => curio.visualForm)).size, 89);

  const fallbackCurios = curios.filter(
    (curio) => collectibleVisualHandlerFor(curio.visualForm) === "artifact",
  );
  assert.deepEqual(
    fallbackCurios.map((curio) => curio.id),
    [],
    "catalog curios must never reach the generic artifact renderer",
  );
});

test("semantic forms cannot alias misleading generic silhouettes", () => {
  const dedicatedForms = [
    "field-ripple",
    "vesicle",
    "stadium",
    "river-system",
    "forest",
    "weather-front",
    "ringed-world",
    "asteroid",
    "comet",
    "dense-star",
    "orbit-system",
    "star-cluster",
    "nebula",
    "galaxy-cluster",
    "cosmic-web",
    "cosmic-void",
    "horizon",
    "speculative-reality",
  ];

  for (const visualForm of dedicatedForms) {
    assert.equal(
      collectibleVisualHandlerFor(visualForm),
      visualForm,
      `${visualForm} must own a recognizable low-poly silhouette`,
    );
  }

  assert.equal(new Set(dedicatedForms.map(collectibleVisualHandlerFor)).size, 18);
  assert.deepEqual(
    Object.entries(COLLECTIBLE_VISUAL_HANDLER_BY_FORM)
      .filter(([, handler]) => handler === "bubble")
      .map(([visualForm]) => visualForm),
    ["foam"],
  );
  assert.deepEqual(
    Object.entries(COLLECTIBLE_VISUAL_HANDLER_BY_FORM)
      .filter(([, handler]) => handler === "stone")
      .map(([visualForm]) => visualForm),
    ["grain"],
  );
  assert.deepEqual(
    Object.entries(COLLECTIBLE_VISUAL_HANDLER_BY_FORM)
      .filter(([, handler]) =>
        ["landform", "house", "world", "star", "galaxy"].includes(handler),
      ),
    [
      ["house", "house"],
      ["landform", "landform"],
      ["world", "world"],
      ["star", "star"],
      ["galaxy", "galaxy"],
    ],
  );
  assert.equal(
    Object.values(COLLECTIBLE_VISUAL_HANDLER_BY_FORM).includes("system"),
    false,
  );
  assert.equal(
    Object.values(COLLECTIBLE_VISUAL_HANDLER_BY_FORM).includes("universe"),
    false,
  );
});

test("all 234 catalog curios preserve authored solid and effect LOD layers", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  try {
    const { createCollectibleVisualFactory } = await vite.ssrLoadModule(
      "/src/lib/game/collectible-visuals.ts",
    );
    const visualFactory = createCollectibleVisualFactory({
      isEarly: () => false,
      getQualityTier: () => "high",
      sceneryGlow: (color, opacity = 0.45, wireframe = false) =>
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          wireframe,
        }),
    });

    let effectCurios = 0;
    let maximumTriangleCount = 0;
    const singletonSilhouettes = new Map();
    const repeatableSilhouettes = new Map();
    for (const curio of curios) {
      const authoredVisual = visualFactory.buildVisual(curio, false);
      const signature = silhouetteSignature(authoredVisual);
      if (curio.spawnMode === "singleton") {
        const ids = singletonSilhouettes.get(signature) ?? [];
        ids.push(curio.id);
        singletonSilhouettes.set(signature, ids);
      } else {
        const ids = repeatableSilhouettes.get(signature) ?? [];
        ids.push(curio.id);
        repeatableSilhouettes.set(signature, ids);
      }
      authoredVisual.updateMatrixWorld(true);
      const authoredBounds = new THREE.Box3().setFromObject(
        authoredVisual,
        true,
      );
      const authoredGeometries = new Set();
      const authoredMaterials = new Set();
      authoredVisual.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        authoredGeometries.add(object.geometry);
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => authoredMaterials.add(material));
      });
      const geometries = createCollectibleInstanceGeometries(
        curio,
        visualFactory.buildVisual,
        false,
      );
      assert.ok(
        geometries.solid || geometries.effect,
        `${curio.id} must keep an authored silhouette`,
      );
      if (geometries.effect) effectCurios += 1;
      let triangleCount = 0;
      const lodBounds = new THREE.Box3();
      for (const [layer, geometry] of Object.entries(geometries)) {
        if (!geometry) continue;
        triangleCount += geometry.getAttribute("position").count / 3;
        assert.equal(
          geometry.index,
          null,
          `${curio.id}:${layer} must use normalized non-indexed geometry`,
        );
        assert.deepEqual(
          Object.keys(geometry.attributes).sort(),
          ["color", "normal", "position"],
          `${curio.id}:${layer} must have one merge-compatible contract`,
        );
        assert.ok(
          geometry.getAttribute("position").count > 0,
          `${curio.id}:${layer} must keep its authored silhouette`,
        );
        assert.equal(geometry.userData.collectibleLayer, layer);
        geometry.computeBoundingBox();
        lodBounds.union(geometry.boundingBox);
        geometry.dispose();
      }
      const authoredSize = authoredBounds.getSize(new THREE.Vector3());
      const lodSize = lodBounds.getSize(new THREE.Vector3());
      for (const axis of ["x", "y", "z"]) {
        const relativeDifference =
          Math.abs(lodSize[axis] - authoredSize[axis]) /
          Math.max(1e-6, authoredSize[axis]);
        assert.ok(
          relativeDifference <= 0.03,
          `${curio.id} ${axis}-axis LOD envelope changed by ${(
            relativeDifference * 100
          ).toFixed(1)}%`,
        );
      }
      authoredGeometries.forEach((geometry) => geometry.dispose());
      authoredMaterials.forEach((material) => material.dispose());
      maximumTriangleCount = Math.max(maximumTriangleCount, triangleCount);
    }
    assert.ok(
      effectCurios >= 30,
      "membranes, clouds, halos, glass, and wire forms must not become opaque",
    );
    assert.ok(
      maximumTriangleCount <= 512,
      `tiny instanced silhouettes must stay bounded; saw ${maximumTriangleCount}`,
    );
    assert.equal(
      [...singletonSilhouettes.values()].flat().length,
      21,
      "the astronomy collection must keep every named landmark in this visual gate",
    );
    assert.deepEqual(
      [...singletonSilhouettes.values()].filter((ids) => ids.length > 1),
      [],
      "every one-of-one landmark needs a distinct low-detail silhouette",
    );
    assert.deepEqual(
      [...singletonSilhouettes.entries()]
        .filter(([signature]) => repeatableSilhouettes.has(signature))
        .map(([, singletonIds]) => singletonIds),
      [],
      "one-of-one landmarks must never alias a repeatable low-detail silhouette",
    );
  } finally {
    await vite.close();
  }
});

test("marker assets share bounded non-mipmapped textures", () => {
  const restoreDocument = installFakeCanvasDocument();
  const factory = createCollectibleMarkerFactory();
  try {
    const sprites = curios.map((curio) => factory.make(curio.symbol));
    const uniqueSymbols = new Set(curios.map((curio) => curio.symbol));
    const materials = new Set(sprites.map((sprite) => sprite.material));
    const textures = new Set(
      sprites.map((sprite) => sprite.material.map).filter(Boolean),
    );

    assert.equal(uniqueSymbols.size, 106);
    assert.equal(materials.size, curios.length);
    assert.equal(textures.size, uniqueSymbols.size);
    assert.ok(
      sprites.every((sprite) => sprite.scale.x <= 0.82),
      "character faces must remain subordinate to authored silhouettes",
    );
    for (const texture of textures) {
      assert.equal(texture.image.width, COLLECTIBLE_MARKER_TEXTURE_EDGE);
      assert.equal(texture.image.height, COLLECTIBLE_MARKER_TEXTURE_EDGE);
      assert.equal(texture.generateMipmaps, false);
      assert.equal(texture.minFilter, THREE.LinearFilter);
      assert.equal(texture.magFilter, THREE.LinearFilter);
    }

    const repeated = [
      factory.make(curios[0].symbol),
      factory.make(curios[0].symbol),
    ];
    assert.notEqual(repeated[0].material, repeated[1].material);
    assert.equal(repeated[0].material.map, repeated[1].material.map);

    const oldMipPixels = Array.from(
      { length: 9 },
      (_, level) => (256 >> level) ** 2,
    ).reduce((sum, pixels) => sum + pixels, 0);
    const oldCatalogBytes = uniqueSymbols.size * oldMipPixels * 4;
    const newCatalogBytes = collectibleMarkerTextureBytes(uniqueSymbols.size);
    assert.equal(newCatalogBytes, 6_946_816);
    assert.ok(
      newCatalogBytes / oldCatalogBytes < 0.19,
      "catalog marker texture memory should fall by more than 81%",
    );
  } finally {
    factory.dispose();
    restoreDocument();
  }
});

test("arbitrary marker labels cannot exceed the GPU texture budget", () => {
  const restoreDocument = installFakeCanvasDocument();
  const factory = createCollectibleMarkerFactory();
  try {
    const sprites = Array.from({ length: 180 }, (_, index) =>
      factory.make(`marker-${index}`),
    );
    const materials = new Set(sprites.map((sprite) => sprite.material));
    const textures = new Set(
      sprites.map((sprite) => sprite.material.map).filter(Boolean),
    );

    assert.equal(materials.size, sprites.length);
    assert.equal(textures.size, COLLECTIBLE_MARKER_TEXTURE_LIMIT);
    assert.equal(COLLECTIBLE_MARKER_MAX_TEXTURE_BYTES, 8_388_608);
    assert.equal(
      collectibleMarkerTextureBytes(Number.POSITIVE_INFINITY),
      COLLECTIBLE_MARKER_MAX_TEXTURE_BYTES,
    );
  } finally {
    factory.dispose();
    restoreDocument();
  }
});

test("LOD uses authored solid/effect silhouettes and never circular badges", () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const buildVisual = (curio) => {
    const visual = new THREE.Group();
    visual.add(
      new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.5, 0),
        new THREE.MeshBasicMaterial({ color: curio.color }),
      ),
    );
    visual.add(
      new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.72, 0),
        new THREE.MeshBasicMaterial({
          color: "#b9f5ff",
          transparent: true,
          opacity: 0.3,
        }),
      ),
    );
    return visual;
  };
  const library = createCollectibleGeometryLibrary(buildVisual);
  const pool = createCollectibleLodPool(
    scene,
    camera,
    buildVisual,
    library,
  );

  try {
    const curio = curios[0];
    const shared = library.geometryFor(curio, false);
    const disposalCounts = new Map(
      [shared.solid, shared.effect]
        .filter(Boolean)
        .map((geometry) => [geometry, 0]),
    );
    disposalCounts.forEach((_, geometry) => {
      geometry.addEventListener("dispose", () => {
        disposalCounts.set(geometry, disposalCounts.get(geometry) + 1);
      });
    });
    assert.equal(pool.add(curio, new THREE.Matrix4()), true);
    const frame = pool.endFrame();
    assert.deepEqual(frame, { instances: 1, badges: 0, drawCalls: 2 });
    assert.equal(library.size, 1);
    assert.deepEqual(
      scene.children.map((child) => child.name).sort(),
      [
        `collectible-lod:effect:${curio.id}`,
        `collectible-lod:solid:${curio.id}`,
      ],
    );
    assert.equal(
      scene.children.some((child) => child.name.includes("badge")),
      false,
    );
    assert.ok(
      scene.children.every(
        (child) => child.material?.wireframe !== true,
      ),
      "filled membranes and glow shells must not regress into wireframe balls",
    );
    pool.dispose();
    pool.dispose();
    assert.ok([...disposalCounts.values()].every((count) => count === 0));
    library.dispose();
    library.dispose();
    assert.ok([...disposalCounts.values()].every((count) => count === 1));
    assert.equal(
      scene.children.filter((child) => child.name.startsWith("collectible-"))
        .length,
      0,
    );
  } finally {
    pool.dispose();
    library.dispose();
  }
});
