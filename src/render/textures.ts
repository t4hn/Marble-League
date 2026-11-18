import * as THREE from 'three';

/**
 * Generates a convincing glass-marble internal swirl texture blending
 * the team's primary, secondary, and accent colors into helical glass ribbons.
 */
export function createMarbleSwirlTexture(
  primaryHex: string,
  secondaryHex: string,
  accentHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, secondaryHex);
  grad.addColorStop(0.5, primaryHex);
  grad.addColorStop(1, secondaryHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Helical cat's-eye ribbon bands
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    const yBase = (i / 6) * size;
    ctx.moveTo(0, yBase);
    for (let x = 0; x <= size; x += 16) {
      const wave = Math.sin((x / size) * Math.PI * 4 + i * 1.1) * 42;
      ctx.lineTo(x, (yBase + wave + size) % size);
    }
    ctx.strokeStyle = i % 2 === 0 ? primaryHex : accentHex;
    ctx.lineWidth = i % 2 === 0 ? 34 : 18;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
  }

  // Crisp bright highlight streaks to catch PBR reflections internally
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    const offset = k * 170 + 40;
    ctx.moveTo(0, offset);
    ctx.bezierCurveTo(size * 0.35, offset - 50, size * 0.65, offset + 50, size, offset);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates brushed dark-slate racing deck texture with crisp 8-lane markings.
 */
export function createTrackSurfaceTexture(
  isTwilight: boolean,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const width = 1024;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = isTwilight ? '#0f1420' : '#141b26';
  ctx.fillRect(0, 0, width, height);

  // Subtle longitudinal acrylic/slate grain
  for (let i = 0; i < 240; i++) {
    const x = (i * 37) % width;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(x, 0, 2, height);
  }

  // Alternating subtle lane shading for 8 lanes across U
  const lanePx = width / 8;
  for (let lane = 0; lane < 8; lane++) {
    if (lane % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(lane * lanePx, 0, lanePx, height);
    }
    // Crisp lane divider stripe
    if (lane > 0) {
      ctx.fillStyle = isTwilight ? 'rgba(148,163,184,0.38)' : 'rgba(226,232,240,0.42)';
      ctx.fillRect(lane * lanePx - 2, 0, 4, height);
    }
    // Subtle center guide dashed stripe per lane
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let y = 20; y < height; y += 128) {
      ctx.fillRect(lane * lanePx + lanePx * 0.5 - 2, y, 4, 64);
    }
  }

  // Track joint seams horizontally
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = 0; y < height; y += 256) {
    ctx.fillRect(0, y, width, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 10);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates linear bump/roughness micro-texture for track surface grip realism.
 */
export function createTrackBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 600; i++) {
    const x = (i * 53) % size;
    const y = (i * 97) % size;
    const lum = 112 + (i % 32);
    ctx.fillStyle = `rgb(${lum},${lum},${lum})`;
    ctx.fillRect(x, y, 2, 16);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 24);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates checkered finish-line decal texture.
 */
export function createCheckeredTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const sq = 32;
  for (let y = 0; y < h; y += sq) {
    for (let x = 0; x < w; x += sq) {
      const dark = ((x / sq) + (y / sq)) % 2 === 0;
      ctx.fillStyle = dark ? '#0f172a' : '#f8fafc';
      ctx.fillRect(x, y, sq, sq);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates soft radial contact shadow disc texture.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    4,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
