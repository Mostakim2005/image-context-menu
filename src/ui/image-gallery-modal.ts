import { Modal, Notice, type App, TFile } from 'obsidian';
import type { ImageContextSettings, CompressionPreview } from '../types';
import { CompressionService } from '../services/compression-service';
import { formatBytes, getExtension, isImageExtension } from '../utils/image-utils';

export class ImageGalleryModal extends Modal {
  private readonly selected = new Set<string>();
  private files: TFile[] = [];
  private query = '';
  private filter = 'all';
  private sort = 'name';

  constructor(
    app: App,
    private readonly compression: CompressionService,
    private readonly getSettings: () => ImageContextSettings,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass('image-context-gallery');
    this.contentEl.createDiv({ cls: 'image-context-gallery-loading', text: 'Loading images…' });
    this.files = this.app.vault.getFiles().filter((file) => isImageExtension(getExtension(file.name)));
    void this.render();
  }

  async render(): Promise<void> {
    this.contentEl.empty();
    const settings = this.getSettings();

    const header = this.contentEl.createDiv({ cls: 'image-context-gallery-header' });
    const heading = header.createDiv({ cls: 'image-context-gallery-heading' });
    heading.createDiv({ cls: 'image-context-gallery-kicker', text: 'MEDIA' });
    heading.createDiv({ cls: 'image-context-gallery-title', text: 'Image library' });

    const controls = header.createDiv({ cls: 'image-context-gallery-controls' });
    const search = controls.createEl('input', {
      type: 'search',
      placeholder: 'Search images…',
      value: this.query,
      cls: 'image-context-gallery-search',
    });
    search.addEventListener('input', () => {
      this.query = search.value;
      void this.render();
    });

    this.addSelect(controls, [['all', 'All'], ['compress', 'Recommended'], ['efficient', 'Already efficient']], this.filter, (value) => {
      this.filter = value;
      void this.render();
    });
    this.addSelect(controls, [['name', 'Name'], ['size', 'Size'], ['path', 'Folder']], this.sort, (value) => {
      this.sort = value;
      void this.render();
    });

    const toolbar = this.contentEl.createDiv({ cls: 'image-context-gallery-toolbar' });
    const selected = toolbar.createSpan({ text: `${this.selected.size} selected` });
    const selectAll = toolbar.createEl('button', { text: 'Select all' });
    selectAll.addEventListener('click', () => {
      for (const file of this.filteredFiles()) this.selected.add(file.path);
      void this.render();
    });
    const invert = toolbar.createEl('button', { text: 'Invert selection' });
    invert.addEventListener('click', () => {
      for (const file of this.filteredFiles()) {
        if (this.selected.has(file.path)) this.selected.delete(file.path);
        else this.selected.add(file.path);
      }
      void this.render();
    });
    const clear = toolbar.createEl('button', { text: 'Clear' });
    clear.addEventListener('click', () => {
      this.selected.clear();
      void this.render();
    });

    const process = toolbar.createEl('button', { text: 'Compress selected', cls: 'mod-cta' });
    process.disabled = this.selected.size === 0;
    process.addEventListener('click', () => {
      void this.compressSelected();
    });

    const grid = this.contentEl.createDiv({ cls: 'image-context-gallery-grid' });
    grid.style.setProperty('--image-context-gallery-columns', String(settings.galleryColumns));

    const files = this.filteredFiles();
    if (!files.length) {
      grid.createDiv({ cls: 'image-context-gallery-empty', text: 'No images match your filters.' });
      return;
    }

    for (const file of files) {
      await this.renderCard(grid, file);
    }

    selected.setText(`${this.selected.size} selected`);
  }

  private filteredFiles(): TFile[] {
    const query = this.query.trim().toLowerCase();
    let files = this.files.filter((file) => !query || file.path.toLowerCase().includes(query));

    if (this.filter !== 'all') {
      // Use a conservative synchronous heuristic for filtering. Exact previews are
      // shown on cards and are never required to decide whether an image exists.
      files = files.filter((file) => this.filter === 'compress'
        ? file.stat.size > this.getSettings().sizeThresholdKB * 1024
        : file.stat.size <= this.getSettings().sizeThresholdKB * 1024);
    }

    return [...files].sort((a, b) => {
      if (this.sort === 'size') return b.stat.size - a.stat.size;
      if (this.sort === 'path') return (a.parent?.path ?? '').localeCompare(b.parent?.path ?? '');
      return a.name.localeCompare(b.name);
    });
  }

  private async renderCard(parent: HTMLElement, file: TFile): Promise<void> {
    const card = parent.createDiv({ cls: this.selected.has(file.path) ? 'image-context-gallery-card is-selected' : 'image-context-gallery-card' });
    const top = card.createDiv({ cls: 'image-context-gallery-thumb' });
    const img = top.createEl('img', { attr: { alt: file.name, loading: 'lazy' } });
    img.src = this.app.vault.getResourcePath(file);

    const checkbox = top.createEl('input', { type: 'checkbox' });
    checkbox.checked = this.selected.has(file.path);
    checkbox.addEventListener('click', (event) => event.stopPropagation());
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) this.selected.add(file.path);
      else this.selected.delete(file.path);
      card.toggleClass('is-selected', checkbox.checked);
    });

    const body = card.createDiv({ cls: 'image-context-gallery-card-body' });
    body.createDiv({ cls: 'image-context-gallery-card-name', text: file.name });
    body.createDiv({ cls: 'image-context-gallery-card-path', text: file.parent?.path || '/' });
    body.createDiv({ cls: 'image-context-gallery-card-meta', text: `${getExtension(file.name).toUpperCase()} · ${formatBytes(file.stat.size)}` });

    const preview = body.createDiv({ cls: 'image-context-gallery-card-status', text: 'Analyzing…' });
    try {
      const info = await this.compression.previewFile(file);
      const dimensions = info.width && info.height ? `${info.width} × ${info.height}` : 'Unknown dimensions';
      preview.setText(`${dimensions} · ${this.decisionLabel(info)}`);
    } catch {
      preview.setText('Preview unavailable');
    }

    card.addEventListener('click', () => {
      checkbox.checked = !checkbox.checked;
      if (checkbox.checked) this.selected.add(file.path);
      else this.selected.delete(file.path);
      card.toggleClass('is-selected', checkbox.checked);
    });
  }

  private decisionLabel(preview: CompressionPreview): string {
    if (preview.decision === 'compress') {
      return `Compress · ~${preview.estimatedSavingsPercent}% smaller`;
    }
    if (preview.decision === 'already-efficient') return 'Already efficient';
    if (preview.decision === 'unsupported') return 'Unsupported';
    return 'Skipped by rule';
  }

  private addSelect(
    parent: HTMLElement,
    options: Array<[string, string]>,
    value: string,
    onChange: (value: string) => void,
  ): void {
    const select = parent.createEl('select');
    for (const [optionValue, label] of options) select.createEl('option', { value: optionValue, text: label });
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
  }

  private async compressSelected(): Promise<void> {
    const paths = [...this.selected];
    if (!paths.length) return;

    let compressed = 0;
    let skipped = 0;
    let failed = 0;

    for (const path of paths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        failed += 1;
        continue;
      }

      const result = await this.compression.compressFile(file);
      if (result.status === 'compressed') compressed += 1;
      else if (result.status === 'skipped' || result.status === 'unsupported') skipped += 1;
      else failed += 1;
    }

    this.selected.clear();
    new Notice(`${compressed} compressed, ${skipped} skipped, ${failed} failed.`);
    await this.render();
  }

  onClose(): void {
    this.contentEl.empty();
    this.selected.clear();
  }
}
