import type { TFile } from 'obsidian';

export type SupportedImageFormat = 'jpg' | 'jpeg' | 'png' | 'webp';

export type CompressionDecision =
  | 'compress'
  | 'already-efficient'
  | 'skipped'
  | 'unsupported';

export interface ImageContextSettings {
  sizeThresholdKB: number;
  jpegQuality: number;
  confirmDestructiveActions: boolean;
  showProgress: boolean;
  minimumSavingsPercent: number;
  skipAlreadyCompressed: boolean;
  preserveDimensions: boolean;
  galleryColumns: number;
}

export interface ImageTarget {
  file: TFile | null;
  fileName: string | null;
  source: string;
  isVaultImage: boolean;
}

export interface ImageInfo {
  width: number;
  height: number;
  sizeBytes: number | null;
  fileName: string;
  extension: string | null;
}

export interface CompressionPreview {
  decision: CompressionDecision;
  originalBytes: number;
  estimatedBytes: number | null;
  estimatedSavingsPercent: number;
  width: number | null;
  height: number | null;
  quality: number;
  reason: string;
}

export interface CompressionResult {
  status: 'compressed' | 'skipped' | 'unsupported' | 'error';
  originalBytes: number;
  outputBytes: number;
  savedBytes: number;
  reason?: string;
}

export interface BulkCompressionResult {
  total: number;
  compressed: number;
  skipped: number;
  unsupported: number;
  failed: number;
  originalBytes: number;
  outputBytes: number;
}

export interface ProgressHandle {
  update(percent: number, message: string): void;
  remove(): void;
}

export interface CodeMirrorViewLike {
  posAtDOM(node: Node, side?: number): number;
  state: {
    doc: {
      lineAt(pos: number): { from: number; to: number; number: number; text: string };
    };
  };
}
