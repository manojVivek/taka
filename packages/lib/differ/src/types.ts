export interface DiffResult {
  pixelDifference: number;
  percentageDifference: number;
  diffImagePath?: string;
  passed: boolean;
}

export interface ComparisonOptions {
  threshold: number;
  ignoreRegions?: Array<{ x: number; y: number; width: number; height: number }>;
  pixelMatchOptions?: {
    threshold: number;
    includeAA: boolean;
  };
}