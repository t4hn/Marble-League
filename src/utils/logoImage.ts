const ACCEPTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ACCEPTED_EXTENSIONS = /\.(png|jpe?g|webp)$/i;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB safety cap before downscale
const LOGO_TARGET_PX = 160;

export function isSupportedLogoFile(file: File): boolean {
  if (file.type && ACCEPTED_MIME_TYPES.has(file.type.toLowerCase())) {
    return true;
  }
  return ACCEPTED_EXTENSIONS.test(file.name);
}

/**
 * Loads an uploaded PNG, JPG, or WEBP image, validates it, and normalises it into
 * a square transparent 160x160 data URL using aspect-preserving contain scaling so
 * logos never distort and LocalStorage stays lightweight.
 */
export async function processTeamLogoFile(file: File): Promise<string> {
  if (!isSupportedLogoFile(file)) {
    throw new Error('Please choose a PNG, JPG, or WEBP image file.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Image file is too large (maximum 10 MB).');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image file.'));
      el.src = objectUrl;
    });

    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      throw new Error('Selected image has invalid dimensions.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = LOGO_TARGET_PX;
    canvas.height = LOGO_TARGET_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas rendering is unavailable in this browser.');
    }

    ctx.clearRect(0, 0, LOGO_TARGET_PX, LOGO_TARGET_PX);
    const padding = 6;
    const maxDim = LOGO_TARGET_PX - padding * 2;
    const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight);
    const drawW = Math.max(1, Math.round(img.naturalWidth * scale));
    const drawH = Math.max(1, Math.round(img.naturalHeight * scale));
    const dx = Math.round((LOGO_TARGET_PX - drawW) / 2);
    const dy = Math.round((LOGO_TARGET_PX - drawH) / 2);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, dx, dy, drawW, drawH);

    // Prefer compact WebP (supports alpha transparency) and fall back to PNG if needed
    const webpUrl = canvas.toDataURL('image/webp', 0.92);
    const pngUrl = canvas.toDataURL('image/png');
    if (webpUrl.startsWith('data:image/webp') && webpUrl.length < pngUrl.length) {
      return webpUrl;
    }
    return pngUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
