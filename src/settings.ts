import { PluginSettingTab, Setting, type App, type Plugin } from 'obsidian';
import type { ImageContextSettings } from './types';

export const DEFAULT_SETTINGS: ImageContextSettings = {
  sizeThresholdKB: 300,
  jpegQuality: 70,
  confirmDestructiveActions: false,
  showProgress: true,
  minimumSavingsPercent: 5,
  skipAlreadyCompressed: true,
  preserveDimensions: true,
  galleryColumns: 3,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function normalizeSettings(data: unknown): ImageContextSettings {
  if (!isRecord(data)) return { ...DEFAULT_SETTINGS };

  return {
    sizeThresholdKB: Math.round(clampNumber(data.sizeThresholdKB, DEFAULT_SETTINGS.sizeThresholdKB, 1, 1024 * 1024)),
    jpegQuality: Math.round(clampNumber(data.jpegQuality, DEFAULT_SETTINGS.jpegQuality, 1, 100)),
    confirmDestructiveActions: typeof data.confirmDestructiveActions === 'boolean'
      ? data.confirmDestructiveActions : DEFAULT_SETTINGS.confirmDestructiveActions,
    showProgress: typeof data.showProgress === 'boolean'
      ? data.showProgress : DEFAULT_SETTINGS.showProgress,
    minimumSavingsPercent: Math.round(clampNumber(
      data.minimumSavingsPercent, DEFAULT_SETTINGS.minimumSavingsPercent, 0, 90,
    )),
    skipAlreadyCompressed: typeof data.skipAlreadyCompressed === 'boolean'
      ? data.skipAlreadyCompressed : DEFAULT_SETTINGS.skipAlreadyCompressed,
    preserveDimensions: typeof data.preserveDimensions === 'boolean'
      ? data.preserveDimensions : DEFAULT_SETTINGS.preserveDimensions,
    galleryColumns: Math.round(clampNumber(data.galleryColumns, DEFAULT_SETTINGS.galleryColumns, 1, 6)),
  };
}

export async function loadSettings(plugin: Plugin): Promise<ImageContextSettings> {
  return normalizeSettings(await plugin.loadData());
}

export class ImageContextSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: Plugin & ImageContextPluginLike) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('image-context-settings');

    new Setting(containerEl).setName('Compression').setHeading();

    new Setting(containerEl)
      .setName('Size threshold')
      .setDesc('Only recommend compression for images larger than this size in KB.')
      .addText((text) => text.setValue(String(this.plugin.settings.sizeThresholdKB)).onChange((value) => {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed < 1) return;
        this.plugin.settings.sizeThresholdKB = Math.min(parsed, 1024 * 1024);
        void this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('JPEG quality')
      .setDesc('Default quality target for JPEG compression. 70 is a practical default.')
      .addSlider((slider) => slider
        .setLimits(1, 100, 1)
        .setValue(this.plugin.settings.jpegQuality)
        .setDynamicTooltip()
        .onChange((value) => {
          this.plugin.settings.jpegQuality = Math.round(value);
          void this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Minimum savings')
      .setDesc('Do not replace an image unless the estimated or actual reduction reaches this percentage.')
      .addSlider((slider) => slider
        .setLimits(0, 90, 1)
        .setValue(this.plugin.settings.minimumSavingsPercent)
        .setDynamicTooltip()
        .onChange((value) => {
          this.plugin.settings.minimumSavingsPercent = Math.round(value);
          void this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Skip already efficient images')
      .setDesc('Avoid recompressing images that already have a good size-to-resolution ratio.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.skipAlreadyCompressed)
        .onChange((value) => {
          this.plugin.settings.skipAlreadyCompressed = value;
          void this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Preserve dimensions')
      .setDesc('Keep the original pixel dimensions when compressing.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.preserveDimensions)
        .onChange((value) => {
          this.plugin.settings.preserveDimensions = value;
          void this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName('Safety').setHeading();

    new Setting(containerEl)
      .setName('Confirm destructive actions')
      .setDesc('Ask before replacing an existing image during compression.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.confirmDestructiveActions)
        .onChange((value) => {
          this.plugin.settings.confirmDestructiveActions = value;
          void this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Show progress')
      .setDesc('Show a compact progress indicator during image compression.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showProgress)
        .onChange((value) => {
          this.plugin.settings.showProgress = value;
          void this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName('Gallery').setHeading();

    new Setting(containerEl)
      .setName('Gallery columns')
      .setDesc('Number of image columns on larger screens.')
      .addSlider((slider) => slider
        .setLimits(1, 6, 1)
        .setValue(this.plugin.settings.galleryColumns)
        .setDynamicTooltip()
        .onChange((value) => {
          this.plugin.settings.galleryColumns = Math.round(value);
          void this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName('Supported formats').setHeading();
    containerEl.createEl('p', {
      text: 'JPEG, PNG, and WebP can be recompressed. GIF and SVG are left untouched to avoid losing animation or vector data.',
      cls: 'setting-item-description',
    });
  }
}

export interface ImageContextPluginLike {
  settings: ImageContextSettings;
  saveSettings(): Promise<void>;
}
