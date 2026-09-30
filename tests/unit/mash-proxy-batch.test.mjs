import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";

import {
  createMashProxyRefreshQueue,
  rebuildMashProxyMeshes,
} from "../../src/lib/game/mash-proxy-batch.ts";

const trackDisposal = (geometry) => {
  let disposed = 0;
  geometry.addEventListener("dispose", () => {
    disposed += 1;
  });
  return () => disposed;
};

const solidPart = (offset) => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(offset, 0, 0);
  return geometry;
};

test("a burst of refresh requests merges once on the next flush", () => {
  let rebuilds = 0;
  const queue = createMashProxyRefreshQueue(() => {
    rebuilds += 1;
  });

  assert.equal(queue.flush(), false);
  assert.equal(rebuilds, 0);

  for (let index = 0; index < 12; index += 1) queue.request();
  assert.equal(queue.pending, true);
  assert.equal(queue.requests, 12);
  assert.equal(rebuilds, 0);

  assert.equal(queue.flush(), true);
  assert.equal(rebuilds, 1);
  assert.equal(queue.rebuilds, 1);
  assert.equal(queue.pending, false);

  assert.equal(queue.flush(), false);
  assert.equal(rebuilds, 1);

  queue.request();
  assert.equal(queue.flush(), true);
  assert.equal(rebuilds, 2);
  assert.equal(queue.requests, 13);
});

test("a request made during a rebuild survives to the next flush", () => {
  let rebuilds = 0;
  let queue;
  queue = createMashProxyRefreshQueue(() => {
    rebuilds += 1;
    if (rebuilds === 1) queue.request();
  });
  queue.request();
  assert.equal(queue.flush(), true);
  assert.equal(queue.pending, true);
  assert.equal(queue.flush(), true);
  assert.equal(rebuilds, 2);
  assert.equal(queue.flush(), false);
});

test("rebuilding swaps merged geometry in and disposes every part and the previous geometry", () => {
  const solidMesh = new THREE.Mesh(new THREE.BufferGeometry());
  const effectMesh = new THREE.Mesh(new THREE.BufferGeometry());
  solidMesh.visible = false;
  effectMesh.visible = true;
  const previousSolidDisposed = trackDisposal(solidMesh.geometry);
  const previousEffectDisposed = trackDisposal(effectMesh.geometry);
  const solidParts = [solidPart(0), solidPart(2), solidPart(4)];
  const solidPartsDisposed = solidParts.map(trackDisposal);
  const vertexCount = solidParts.reduce(
    (total, part) => total + part.getAttribute("position").count,
    0,
  );

  rebuildMashProxyMeshes([
    { mesh: solidMesh, parts: solidParts },
    { mesh: effectMesh, parts: [] },
  ]);

  assert.equal(solidMesh.geometry.getAttribute("position").count, vertexCount);
  assert.ok(solidMesh.geometry.boundingSphere);
  assert.ok(solidMesh.geometry.boundingSphere.radius > 2);
  assert.equal(solidMesh.visible, true);
  assert.equal(effectMesh.visible, false);
  assert.equal(effectMesh.geometry.getAttribute("position"), undefined);
  assert.equal(previousSolidDisposed(), 1);
  assert.equal(previousEffectDisposed(), 1);
  assert.deepEqual(
    solidPartsDisposed.map((count) => count()),
    [1, 1, 1],
  );

  const mergedDisposed = trackDisposal(solidMesh.geometry);
  rebuildMashProxyMeshes([
    { mesh: solidMesh, parts: [solidPart(0)] },
    { mesh: effectMesh, parts: [] },
  ]);
  assert.equal(mergedDisposed(), 1);
  assert.equal(solidMesh.geometry.getAttribute("position").count, 24);
});

test("a failed merge disposes the parts, keeps the previous geometry, and throws", () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const previous = mesh.geometry;
  const previousDisposed = trackDisposal(previous);
  const withUv = new THREE.BoxGeometry(1, 1, 1);
  const withoutUv = new THREE.BoxGeometry(1, 1, 1);
  withoutUv.deleteAttribute("uv");
  const partsDisposed = [withUv, withoutUv].map(trackDisposal);
  const other = new THREE.Mesh(new THREE.BufferGeometry());
  const otherPart = solidPart(0);
  const otherPartDisposed = trackDisposal(otherPart);

  assert.throws(
    () =>
      rebuildMashProxyMeshes([
        { mesh: other, parts: [otherPart] },
        { mesh, parts: [withUv, withoutUv] },
      ]),
    TypeError,
  );

  assert.equal(mesh.geometry, previous);
  assert.equal(previousDisposed(), 0);
  assert.deepEqual(
    partsDisposed.map((count) => count()),
    [1, 1],
  );
  assert.equal(otherPartDisposed(), 1);
  assert.equal(other.geometry.getAttribute("position"), undefined);
});
