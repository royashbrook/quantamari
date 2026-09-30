import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Attached-mash proxy rebuilds merge every visible authored piece into one
// geometry per material. A dense pickup burst used to run that merge once per
// collection inside a single animation frame; the queue below folds any number
// of requests into one rebuild, flushed by the frame loop before it renders.
export type MashProxyRefreshQueue = {
  request: () => void;
  flush: () => boolean;
  readonly pending: boolean;
  readonly requests: number;
  readonly rebuilds: number;
};

export function createMashProxyRefreshQueue(
  rebuild: () => void,
): MashProxyRefreshQueue {
  let pending = false;
  let requests = 0;
  let rebuilds = 0;
  return {
    request() {
      pending = true;
      requests += 1;
    },
    flush() {
      if (!pending) return false;
      pending = false;
      rebuild();
      rebuilds += 1;
      return true;
    },
    get pending() {
      return pending;
    },
    get requests() {
      return requests;
    },
    get rebuilds() {
      return rebuilds;
    },
  };
}

export type MashProxyBatchTarget = {
  mesh: THREE.Mesh;
  parts: THREE.BufferGeometry[];
};

const mergeParts = (parts: THREE.BufferGeometry[]) => {
  if (parts.length === 0) return new THREE.BufferGeometry();
  const merged = mergeGeometries(parts, false);
  if (!merged) return null;
  merged.computeBoundingSphere();
  return merged;
};

// Merges each target's transformed parts into one geometry and swaps it onto
// the target mesh. The parts are throwaway clones and the mesh's previous
// geometry is owned here, so both are disposed on every path: on success after
// the swap, on a failed merge before throwing (the meshes then keep what they
// had). Nothing is left for the garbage collector to find on the GPU.
export function rebuildMashProxyMeshes(targets: MashProxyBatchTarget[]) {
  const merged: THREE.BufferGeometry[] = [];
  for (const { parts } of targets) {
    const geometry = mergeParts(parts);
    if (!geometry) {
      merged.forEach((built) => built.dispose());
      targets.forEach((target) =>
        target.parts.forEach((part) => part.dispose()),
      );
      throw new TypeError("Visible mash silhouettes could not be batched");
    }
    merged.push(geometry);
  }
  targets.forEach(({ mesh, parts }, index) => {
    parts.forEach((part) => part.dispose());
    mesh.geometry.dispose();
    mesh.geometry = merged[index];
    mesh.visible = parts.length > 0;
  });
}
