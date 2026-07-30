import * as THREE from "three";

export const COLLECTIBLE_MARKER_TEXTURE_EDGE = 128;
export const COLLECTIBLE_MARKER_TEXTURE_LIMIT = 128;
export const COLLECTIBLE_MARKER_TEXTURE_BYTES =
  COLLECTIBLE_MARKER_TEXTURE_EDGE *
  COLLECTIBLE_MARKER_TEXTURE_EDGE *
  4;
export const COLLECTIBLE_MARKER_MAX_TEXTURE_BYTES =
  COLLECTIBLE_MARKER_TEXTURE_BYTES * COLLECTIBLE_MARKER_TEXTURE_LIMIT;

const FALLBACK_MARKER_SYMBOL = "•";

type MarkerAsset = {
  texture: THREE.CanvasTexture;
};

export function collectibleMarkerTextureBytes(textureCount: number) {
  return (
    Math.min(
      COLLECTIBLE_MARKER_TEXTURE_LIMIT,
      Math.max(0, Math.floor(textureCount)),
    ) * COLLECTIBLE_MARKER_TEXTURE_BYTES
  );
}

export function createCollectibleMarkerFactory() {
  const assets = new Map<string, MarkerAsset>();

  const assetFor = (requestedSymbol: string) => {
    const symbol = requestedSymbol || FALLBACK_MARKER_SYMBOL;
    const cached = assets.get(symbol);
    if (cached) return cached;

    // Reserve the last slot for one shared overflow marker. Catalog symbols
    // remain exact; arbitrary future/runtime labels cannot grow GPU memory
    // without bound.
    const textureKey =
      assets.size < COLLECTIBLE_MARKER_TEXTURE_LIMIT - 1 ||
      symbol === FALLBACK_MARKER_SYMBOL
        ? symbol
        : FALLBACK_MARKER_SYMBOL;
    const shared = assets.get(textureKey);
    if (shared) return shared;

    const canvas = document.createElement("canvas");
    canvas.width = COLLECTIBLE_MARKER_TEXTURE_EDGE;
    canvas.height = COLLECTIBLE_MARKER_TEXTURE_EDGE;
    const context = canvas.getContext("2d")!;

    // Preserve the original authored face at half resolution. These markers
    // are small screen-space labels, so 256px textures and mip chains were
    // allocating memory the player could not see.
    context.scale(0.5, 0.5);
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
    context.font = `900 ${textureKey.length > 2 ? 78 : textureKey.length > 1 ? 105 : 138}px "Arial Rounded MT Bold", Arial`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.strokeText(textureKey, 128, 166, 218);
    context.fillText(textureKey, 128, 166, 218);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const asset = { texture };
    assets.set(textureKey, asset);
    return asset;
  };

  return {
    make(symbol: string) {
      // Materials are intentionally per-sprite because runtime owns and
      // disposes them with each collectible; only the expensive textures are
      // factory-owned and shared.
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: assetFor(symbol).texture,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
      );
      const markerScale = symbol.length > 2 ? 1.02 : 1.16;
      sprite.scale.set(markerScale, markerScale, 1);
      sprite.renderOrder = 30;
      return sprite;
    },
    dispose() {
      assets.forEach(({ texture }) => texture.dispose());
      assets.clear();
    },
  };
}
