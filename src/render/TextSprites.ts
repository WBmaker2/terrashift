import { CanvasTexture, Sprite, SpriteMaterial } from 'three';

export interface TextSpriteOptions {
  color?: string;
  background?: string;
  border?: string;
  fontSize?: number;
  scale?: number;
  paddingX?: number;
  paddingY?: number;
  weight?: number;
  radius?: number;
}

export function createTextSprite(text: string, options: TextSpriteOptions = {}): Sprite {
  const fontSize = options.fontSize ?? 30;
  const paddingX = options.paddingX ?? 18;
  const paddingY = options.paddingY ?? 10;
  const weight = options.weight ?? 700;
  const radius = options.radius ?? 12;
  const scale = options.scale ?? 0.00145;
  const dpr = 2;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available');
  const font = `${weight} ${fontSize}px "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`;
  context.font = font;
  const measured = Math.ceil(context.measureText(text).width);
  const width = measured + paddingX * 2;
  const height = fontSize + paddingY * 2;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  context.scale(dpr, dpr);
  context.font = font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  if (options.background) {
    context.beginPath();
    context.moveTo(radius, 0);
    context.lineTo(width - radius, 0);
    context.quadraticCurveTo(width, 0, width, radius);
    context.lineTo(width, height - radius);
    context.quadraticCurveTo(width, height, width - radius, height);
    context.lineTo(radius, height);
    context.quadraticCurveTo(0, height, 0, height - radius);
    context.lineTo(0, radius);
    context.quadraticCurveTo(0, 0, radius, 0);
    context.closePath();
    context.fillStyle = options.background;
    context.fill();
  }
  if (options.border) {
    context.strokeStyle = options.border;
    context.lineWidth = 2;
    context.stroke();
  }
  context.fillStyle = options.color ?? '#f6fbfd';
  context.fillText(text, width / 2, height / 2 + 1);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = 'srgb';
  texture.needsUpdate = true;
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: true
  });
  const sprite = new Sprite(material);
  sprite.scale.set(width * scale, height * scale, 1);
  sprite.renderOrder = 8;
  sprite.userData.texture = texture;
  return sprite;
}

export function disposeTextSprite(sprite: Sprite): void {
  const texture = sprite.userData.texture as CanvasTexture | undefined;
  texture?.dispose();
  (sprite.material as SpriteMaterial).dispose();
}
