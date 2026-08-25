import { TFile, type App } from 'obsidian';
import type {
  CompressionPreview,
  CompressionResult,
  ImageContextSettings,
  SupportedImageFormat,
} from '../types';
import { getExtension, isSupportedCompressionFormat } from '../utils/image-utils';
import { getMimeType } from '../utils/mime-utils';

export class CompressionService {
  constructor(
    private readonly app: App,
    private readonly getSettings: () => ImageContextSettings,
  ) {}

  async previewFile(file: TFile): Promise<CompressionPreview> {
    const settings = this.getSettings();
    const originalBytes = file.stat.size;
    const extension = getExtension(file.name);
    const widthHeight = await this.readDimensions(file).catch(() => ({ width: null, height: null }));

    if (!isSupportedCompressionFormat(extension)) {
      return {
        decision: 'unsupported',
        originalBytes,
        estimatedBytes: null,
        estimatedSavingsPercent: 0,
        ...widthHeight,
        quality: settings.jpegQuality,
        reason: 'This format is not safely recompressed by the browser encoder.',
      };
    }

    if (originalBytes <= settings.sizeThresholdKB * 1024) {
      return {
        decision: 'skipped',
        originalBytes,
        estimatedBytes: originalBytes,
        estimatedSavingsPercent: 0,
        ...widthHeight,
        quality: settings.jpegQuality,
        reason: 'Below the configured size threshold.',
      };
    }

    const pixels = (widthHeight.width ?? 0) * (widthHeight.height ?? 0);
    const bytesPerPixel = pixels > 0 ? originalBytes / pixels : Infinity;
    const efficient = bytesPerPixel > 0 && bytesPerPixel < (extension === 'png' ? 1.2 : 0.18);

    if (settings.skipAlreadyCompressed && efficient) {
      return {
        decision: 'already-efficient',
        originalBytes,
        estimatedBytes: originalBytes,
        estimatedSavingsPercent: 0,
        ...widthHeight,
        quality: settings.jpegQuality,
        reason: 'The image already has a practical size-to-resolution ratio.',
      };
    }

    // This is intentionally a range estimate, not a fake exact prediction.
    const qualityFactor = extension === 'png'
      ? 0.72
      : Math.max(0.2, Math.min(0.9, 0.35 + settings.jpegQuality / 100 * 0.55));
    const estimatedBytes = Math.max(1, Math.round(originalBytes * qualityFactor));
    const savings = Math.max(0, Math.round((1 - estimatedBytes / originalBytes) * 100));

    return {
      decision: savings >= settings.minimumSavingsPercent ? 'compress' : 'skipped',
      originalBytes,
      estimatedBytes,
      estimatedSavingsPercent: savings,
      ...widthHeight,
      quality: settings.jpegQuality,
      reason: savings >= settings.minimumSavingsPercent
        ? 'Estimated to provide meaningful savings.'
        : 'Estimated savings are below the configured minimum.',
    };
  }

  async compressFile(file: TFile): Promise<CompressionResult> {
    const originalBytes = file.stat.size;
    const settings = this.getSettings();
    const extension = getExtension(file.name);

    const preview = await this.previewFile(file);
    if (preview.decision === 'unsupported') {
      return { status: 'unsupported', originalBytes, outputBytes: originalBytes, savedBytes: 0, reason: preview.reason };
    }
    if (preview.decision !== 'compress') {
      return { status: 'skipped', originalBytes, outputBytes: originalBytes, savedBytes: 0, reason: preview.reason };
    }

    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const blob = new Blob([arrayBuffer], { type: getMimeType(extension) });
      const image = await this.loadImage(blob);
      const output = await this.imageToBlob(image, extension, settings.jpegQuality / 100);

      if (!output) {
        return { status: 'error', originalBytes, outputBytes: originalBytes, savedBytes: 0, reason: 'The browser could not encode the image.' };
      }

      const savingsPercent = ((originalBytes - output.size) / originalBytes) * 100;
      if (output.size >= originalBytes || savingsPercent < settings.minimumSavingsPercent) {
        return {
          status: 'skipped',
          originalBytes,
          outputBytes: originalBytes,
          savedBytes: 0,
          reason: 'The final output was not meaningfully smaller than the original.',
        };
      }

      // Re-read the file stat before committing so a rename/replace that happened
      // while compression was running cannot silently overwrite a newer version.
      const current = this.app.vault.getAbstractFileByPath(file.path);
      if (!(current instanceof TFile) || current.stat.mtime !== file.stat.mtime || current.stat.size !== originalBytes) {
        return {
          status: 'error',
          originalBytes,
          outputBytes: originalBytes,
          savedBytes: 0,
          reason: 'The source image changed while compression was running.',
        };
      }

      await this.app.vault.modifyBinary(file, await output.arrayBuffer());

      return {
        status: 'compressed',
        originalBytes,
        outputBytes: output.size,
        savedBytes: originalBytes - output.size,
      };
    } catch (error) {
      return {
        status: 'error',
        originalBytes,
        outputBytes: originalBytes,
        savedBytes: 0,
        reason: error instanceof Error ? error.message : 'Unknown compression error.',
      };
    }
  }

  private readDimensions(file: TFile): Promise<{ width: number; height: number }> {
    return this.app.vault.readBinary(file).then((arrayBuffer) => {
      const blob = new Blob([arrayBuffer], { type: getMimeType(getExtension(file.name)) });
      return this.loadImage(blob).then((image) => ({ width: image.naturalWidth, height: image.naturalHeight }));
    });
  }

  private loadImage(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to decode the image.'));
      };
      image.src = url;
    });
  }

  private imageToBlob(image: HTMLImageElement, format: SupportedImageFormat, quality: number): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      if (canvas.width <= 0 || canvas.height <= 0) {
        canvas.remove();
        reject(new Error('Image has invalid dimensions.'));
        return;
      }

      const context = canvas.getContext('2d');
      if (!context) {
        canvas.remove();
        reject(new Error('Canvas rendering is unavailable.'));
        return;
      }

      context.drawImage(image, 0, 0);
      const mimeType = format === 'png' ? 'image/png' : getMimeType(format);
      canvas.toBlob((blob) => {
        canvas.remove();
        resolve(blob);
      }, mimeType, format === 'png' ? undefined : quality);
    });
  }
}
