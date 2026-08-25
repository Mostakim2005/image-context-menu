import { Modal, Notice, type App } from 'obsidian';
import type { ImageTarget } from '../types';

export interface ImageContextMenuActions {
  copyAsJpeg(): void;
  share(): void;
  showInfo(): void;
  rename(): void;
  compress(): void;
  resize(): void;
  copyEmbed(): void;
  openImage(): void;
}

export function showImageContextMenu(
  app: App,
  target: ImageTarget,
  actions: ImageContextMenuActions,
): void {
  new ImageActionModal(app, target, actions).open();
}

class ImageActionModal extends Modal {
  constructor(
    app: App,
    private readonly target: ImageTarget,
    private readonly actions: ImageContextMenuActions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass('image-context-action-modal');

    const title = this.contentEl.createDiv({ cls: 'image-context-action-title' });
    title.createDiv({ cls: 'image-context-action-kicker', text: 'IMAGE' });
    title.createDiv({ cls: 'image-context-action-name', text: this.target.fileName ?? 'Image' });

    const actions = this.contentEl.createDiv({ cls: 'image-context-action-grid' });

    if (this.target.isVaultImage) {
      this.addAction(actions, 'Copy embed', 'Copy the exact Obsidian embed syntax.', this.actions.copyEmbed);
    }
    this.addAction(actions, 'Copy as JPEG', 'Copy a JPEG version to the clipboard.', this.actions.copyAsJpeg);
    this.addAction(actions, 'Image information', 'View dimensions, type, and size.', this.actions.showInfo);
    this.addAction(actions, 'Open image', 'Open the image normally.', this.actions.openImage);

    if (this.target.isVaultImage && this.target.file) {
      this.addAction(actions, 'Share image', 'Share the original vault file.', this.actions.share);
      this.addAction(actions, 'Resize image', 'Add an Obsidian embed size.', this.actions.resize);
      this.addAction(actions, 'Compress image', 'Preview and safely reduce file size.', this.actions.compress);
      this.addAction(actions, 'Rename image', 'Rename while letting Obsidian update links.', this.actions.rename);
    }

    const cancel = this.contentEl.createEl('button', { cls: 'image-context-action-cancel', text: 'Cancel' });
    cancel.addEventListener('click', () => this.close());
  }

  private addAction(parent: HTMLElement, title: string, description: string, callback: () => void): void {
    const button = parent.createEl('button', { cls: 'image-context-action' });
    button.createDiv({ cls: 'image-context-action-label', text: title });
    button.createDiv({ cls: 'image-context-action-description', text: description });
    button.addEventListener('click', () => {
      this.close();
      try {
        callback();
      } catch (error) {
        console.error(`Image context action failed: ${title}`, error);
        new Notice(`${title} failed.`);
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
