import * as THREE from "three";

export function createCollectibleMarkerFactory() {
  const textures = new Map<string, THREE.CanvasTexture>();

  const textureFor = (symbol: string) => {
    const cached = textures.get(symbol);
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
    textures.set(symbol, texture);
    return texture;
  };

  return {
    make(symbol: string) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: textureFor(symbol),
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
      textures.forEach((texture) => texture.dispose());
      textures.clear();
    },
  };
}
