export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  watermarkText?: string;
  watermarkPosition?: 'center' | 'bottom-right' | 'bottom-left' | 'top-right';
  watermarkOpacity?: number;
}

export interface CompressedImageResult {
  blob: Blob;
  thumbBlob: Blob;
  previewUrl: string;
  thumbnailUrl: string;
  dataUrl?: string; // backwards compatibility if needed
  width: number;
  height: number;
  sizeBytes: number;
  filename: string;
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.6): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas to Blob conversion failed'));
      },
      type,
      quality
    );
  });
}

let isFontPreloaded = false;
async function ensureWatermarkFont(): Promise<void> {
  if (isFontPreloaded || typeof document === 'undefined' || !document.fonts) return;
  try {
    await document.fonts.load('600 24px "Outfit"');
    isFontPreloaded = true;
  } catch {
    // Graceful fallback if font is blocked or offline
  }
}

/**
 * Ultra-fast image compressor using hardware-accelerated createImageBitmap
 * Outputs Blobs directly for Cloudflare R2 uploads, avoiding base64 string bloat.
 * Thumbnail ~400px.
 */
export async function compressAndWatermarkImage(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressedImageResult> {
  const {
    maxWidth = 1000,
    maxHeight = 800,
    quality = 0.6,
    watermarkText = '',
    watermarkPosition = 'bottom-right',
    watermarkOpacity = 0.35,
  } = options;

  let imgSource: ImageBitmap | HTMLImageElement | null = null;
  let sourceWidth = 0;
  let sourceHeight = 0;
  let isBitmap = false;

  // 1. Try hardware-accelerated decode
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      const fullBitmap = await createImageBitmap(file);
      sourceWidth = fullBitmap.width;
      sourceHeight = fullBitmap.height;

      if (sourceWidth > maxWidth || sourceHeight > maxHeight) {
        const ratio = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
        const targetWidth = Math.round(sourceWidth * ratio);
        const targetHeight = Math.round(sourceHeight * ratio);

        try {
          const resizedBitmap = await createImageBitmap(fullBitmap, {
            resizeWidth: targetWidth,
            resizeHeight: targetHeight,
            resizeQuality: 'medium',
          });
          fullBitmap.close();
          imgSource = resizedBitmap;
          sourceWidth = targetWidth;
          sourceHeight = targetHeight;
        } catch {
          imgSource = fullBitmap;
        }
      } else {
        imgSource = fullBitmap;
      }
      isBitmap = true;
    } catch {
      isBitmap = false;
      imgSource = null;
    }
  }

  // 2. Fallback to Image element with Object URL
  if (!isBitmap || !imgSource) {
    const fallbackImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`Failed to decode image file ${file.name}`));
      };
      img.src = objectUrl;
    });
    imgSource = fallbackImg;
    sourceWidth = fallbackImg.width;
    sourceHeight = fallbackImg.height;
  }

  if (!imgSource) {
    throw new Error(`Could not load image source for ${file.name}`);
  }

  try {
    let width = sourceWidth;
    let height = sourceHeight;

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });

    if (!ctx) {
      throw new Error('Canvas context not available');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(imgSource, 0, 0, width, height);

    // Apply watermark if requested
    if (watermarkText && watermarkText.trim().length > 0) {
      await ensureWatermarkFont();
      ctx.save();

      if (watermarkPosition === 'center') {
        ctx.translate(width / 2, height / 2);
        ctx.rotate(-Math.PI / 6);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fontSize = Math.max(22, Math.floor(width / 18));
        ctx.font = `600 ${fontSize}px "Outfit", sans-serif`;
        ctx.fillStyle = `rgba(255, 255, 255, ${watermarkOpacity})`;
        ctx.strokeStyle = `rgba(0, 0, 0, ${watermarkOpacity * 0.5})`;
        ctx.lineWidth = Math.max(1, fontSize / 20);
        ctx.strokeText(watermarkText, 0, 0);
        ctx.fillText(watermarkText, 0, 0);
      } else {
        const fontSize = Math.max(15, Math.floor(width / 34));
        ctx.font = `600 ${fontSize}px "Outfit", sans-serif`;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.4, watermarkOpacity)})`;
        ctx.strokeStyle = `rgba(0, 0, 0, 0.4)`;
        ctx.lineWidth = 2;

        let x = 20;
        let y = height - 20;

        if (watermarkPosition === 'bottom-right') {
          ctx.textAlign = 'right';
          x = width - 20;
          y = height - 20;
        } else if (watermarkPosition === 'top-right') {
          ctx.textAlign = 'right';
          x = width - 20;
          y = fontSize + 20;
        } else if (watermarkPosition === 'bottom-left') {
          ctx.textAlign = 'left';
          x = 20;
          y = height - 20;
        }

        ctx.strokeText(watermarkText, x, y);
        ctx.fillText(watermarkText, x, y);
      }

      ctx.restore();
    }

    // Main image Blob
    const mainBlob = await canvasToBlob(canvas, 'image/jpeg', quality);

    // Thumbnail Blob (~400px)
    let thumbBlob = mainBlob;
    const maxThumbDim = 400;
    if (width > maxThumbDim || height > maxThumbDim) {
      const thumbRatio = Math.min(maxThumbDim / width, maxThumbDim / height);
      const thumbW = Math.round(width * thumbRatio);
      const thumbH = Math.round(height * thumbRatio);
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = thumbW;
      thumbCanvas.height = thumbH;
      const thumbCtx = thumbCanvas.getContext('2d', { alpha: false });
      if (thumbCtx) {
        thumbCtx.imageSmoothingEnabled = true;
        thumbCtx.drawImage(canvas, 0, 0, thumbW, thumbH);
        thumbBlob = await canvasToBlob(thumbCanvas, 'image/jpeg', 0.7);
      }
    }

    const previewUrl = URL.createObjectURL(mainBlob);
    const thumbnailUrl = URL.createObjectURL(thumbBlob);

    return {
      blob: mainBlob,
      thumbBlob,
      previewUrl,
      thumbnailUrl,
      width,
      height,
      sizeBytes: mainBlob.size,
      filename: file.name,
    };
  } finally {
    if (isBitmap && imgSource && 'close' in imgSource) {
      (imgSource as ImageBitmap).close();
    }
  }
}
