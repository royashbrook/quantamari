import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";

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
  COLLECTIBLE_LOD_BADGE_MAX_TEXTURE_BYTES,
  COLLECTIBLE_LOD_BADGE_TEXTURE_EDGE,
  collectibleLodBadgeTextureBytes,
  createCollectibleLodPool,
} from "../../src/lib/game/collectible-lod.ts";
import { ERAS, VISUAL_FORMS } from "../../src/lib/scale-data.ts";

const curios = ERAS.flatMap((era) => era.curios);

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
  assert.equal(new Set(curios.map((curio) => curio.visualForm)).size, 90);

  const fallbackCurios = curios.filter(
    (curio) => collectibleVisualHandlerFor(curio.visualForm) === "artifact",
  );
  assert.deepEqual(
    fallbackCurios.map((curio) => curio.id),
    [],
    "catalog curios must never reach the generic artifact renderer",
  );
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

    assert.equal(uniqueSymbols.size, 98);
    assert.equal(materials.size, curios.length);
    assert.equal(textures.size, uniqueSymbols.size);
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
    assert.equal(newCatalogBytes, 6_422_528);
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

test("all 220 LOD families share catalog-symbol badges with single-owner disposal", () => {
  const restoreDocument = installFakeCanvasDocument();
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
    return visual;
  };
  const pool = createCollectibleLodPool(scene, camera, buildVisual);

  try {
    for (const curio of curios) {
      assert.equal(pool.add(curio, new THREE.Matrix4(), false), true);
    }

    const badges = scene.children.filter((child) =>
      child.name.startsWith("collectible-badge:"),
    );
    const geometries = new Set(badges.map((badge) => badge.geometry));
    const textures = new Set(
      badges
        .map((badge) => badge.material.map)
        .filter(Boolean),
    );

    assert.equal(badges.length, 220);
    assert.equal(geometries.size, 1);
    assert.equal(textures.size, 98);
    assert.deepEqual(
      [...textures]
        .map((texture) => texture.userData.collectibleBadgeSymbol)
        .sort(),
      [...new Set(curios.map((curio) => curio.symbol))].sort(),
    );
    for (const texture of textures) {
      assert.ok(
        texture.image.drawnText.includes(
          texture.userData.collectibleBadgeSymbol,
        ),
      );
      assert.equal(texture.image.width, COLLECTIBLE_LOD_BADGE_TEXTURE_EDGE);
      assert.equal(texture.image.height, COLLECTIBLE_LOD_BADGE_TEXTURE_EDGE);
      assert.equal(texture.generateMipmaps, false);
      assert.equal(texture.minFilter, THREE.LinearFilter);
      assert.equal(texture.magFilter, THREE.LinearFilter);
    }

    const textureDisposals = new Map(
      [...textures].map((texture) => [texture, 0]),
    );
    textures.forEach((texture) => {
      texture.addEventListener("dispose", () => {
        textureDisposals.set(texture, textureDisposals.get(texture) + 1);
      });
    });
    const [sharedGeometry] = geometries;
    let geometryDisposals = 0;
    sharedGeometry.addEventListener("dispose", () => {
      geometryDisposals += 1;
    });

    const oldMipPixels = Array.from(
      { length: 9 },
      (_, level) => (256 >> level) ** 2,
    ).reduce((sum, pixels) => sum + pixels, 0);
    const oldJourneyBytes = curios.length * oldMipPixels * 4;
    const newJourneyBytes = collectibleLodBadgeTextureBytes(textures.size);
    assert.equal(oldJourneyBytes, 76_895_280);
    assert.equal(newJourneyBytes, 6_422_528);
    assert.ok(
      newJourneyBytes / oldJourneyBytes < 0.084,
      "full-journey LOD badge texture memory should fall by more than 91.6%",
    );
    assert.equal(COLLECTIBLE_LOD_BADGE_MAX_TEXTURE_BYTES, 8_388_608);

    pool.dispose();
    pool.dispose();
    assert.equal(geometryDisposals, 1);
    assert.ok([...textureDisposals.values()].every((count) => count === 1));
    assert.equal(
      scene.children.filter((child) =>
        child.name.startsWith("collectible-"),
      ).length,
      0,
    );
  } finally {
    pool.dispose();
    restoreDocument();
  }
});
