import type { VisualDiff } from '@taka/types';

export interface ComparisonOptions {
  threshold?: number;
  ignoreRegions?: Array<{ x: number; y: number; width: number; height: number }>;
  pixelMatchOptions?: {
    threshold: number;
    includeAA: boolean;
  };
}

export interface ComparisonResult {
  diff: VisualDiff;
  diffImage?: Buffer;
}

export interface ScreenshotPair {
  baseFilename: string;
  baseBytes: Buffer;
  baseEventIndex: number;
  headFilename: string;
  headBytes: Buffer;
  headEventIndex: number;
}

export interface BatchComparisonSummary {
  total: number;
  passed: number;
  failed: number;
  averagePixelDifference: number;
  averagePercentageDifference: number;
}
