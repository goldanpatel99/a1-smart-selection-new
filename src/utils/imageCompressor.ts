export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  watermarkText?: string;
  watermarkPosition?: 'center' | 'bottom-right' | 'bottom-left' | 'top-right';
  watermarkOpacity?: number;
}

export function compressAndWatermarkImage(
  file: File,
  options: CompressionOptions = {}
): Promise<{ dataUrl: string; sizeBytes: number; filename: string }> {
  const {
    maxWidth = 1400,
    maxHeight = 1000,
    quality = 0.78,
    watermarkText = '',
    watermarkPosition = 'bottom-right',
    watermarkOpacity = 0.35,
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate aspect-preserving dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        // Draw compressed image
        ctx.drawImage(img, 0, 0, width, height);

        // Apply watermark if requested
        if (watermarkText && watermarkText.trim().length > 0) {
          ctx.save();

          if (watermarkPosition === 'center') {
            ctx.translate(width / 2, height / 2);
            ctx.rotate(-Math.PI / 6); // 30 deg rotation
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const fontSize = Math.max(24, Math.floor(width / 16));
            ctx.font = `600 ${fontSize}px "Outfit", sans-serif`;
            ctx.fillStyle = `rgba(255, 255, 255, ${watermarkOpacity})`;
            ctx.strokeStyle = `rgba(0, 0, 0, ${watermarkOpacity * 0.5})`;
            ctx.lineWidth = Math.max(1, fontSize / 20);
            ctx.strokeText(watermarkText, 0, 0);
            ctx.fillText(watermarkText, 0, 0);
          } else {
            const fontSize = Math.max(16, Math.floor(width / 32));
            ctx.font = `600 ${fontSize}px "Outfit", sans-serif`;
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.4, watermarkOpacity)})`;
            ctx.strokeStyle = `rgba(0, 0, 0, 0.4)`;
            ctx.lineWidth = 2;

            let x = 20;
            let y = height - 20;

            if (watermarkPosition === 'bottom-right') {
              ctx.textAlign = 'right';
              x = width - 24;
              y = height - 24;
            } else if (watermarkPosition === 'top-right') {
              ctx.textAlign = 'right';
              x = width - 24;
              y = fontSize + 20;
            } else if (watermarkPosition === 'bottom-left') {
              ctx.textAlign = 'left';
              x = 24;
              y = height - 24;
            }

            ctx.strokeText(watermarkText, x, y);
            ctx.fillText(watermarkText, x, y);
          }

          ctx.restore();
        }

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        // Estimate byte size from dataUrl
        const sizeBytes = Math.round((dataUrl.length * 3) / 4);

        resolve({
          dataUrl,
          sizeBytes,
          filename: file.name,
        });
      };

      img.onerror = () => reject(new Error('Failed to load image file'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
