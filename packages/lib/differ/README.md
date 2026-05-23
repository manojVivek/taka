# @taka/differ

Visual regression engine. Compares baseline and head screenshots pixel-by-pixel and generates diff images plus pass/fail reports.

## Overview

The differ powers the visual regression check at the heart of Taka. It uses **Sharp** to normalize image dimensions and **Pixelmatch** for the actual pixel-level comparison, then writes diff images and JSON reports to disk.

## Features

- Pixel-perfect comparison via [Pixelmatch](https://github.com/mapbox/pixelmatch)
- Image normalization (resize, format) via [Sharp](https://sharp.pixelplumbing.com/)
- Configurable difference threshold
- Diff image generation with highlighted changes
- Batch screenshot set comparison
- Summary statistics: passed, failed, critical (>10%), minor (1–10%)
- Cleanup helpers for old reports and diffs

## Usage

### Single comparison

```typescript
import { VisualDiffer } from '@taka/differ';

const differ = new VisualDiffer();

const result = await differ.compareScreenshots(
  '/path/to/baseline.png',
  '/path/to/head.png',
  '/path/to/output/diff.png',
  { threshold: 0.1 }
);

console.log(result);
// {
//   pixelDifference: 1532,
//   percentageDifference: 0.04,
//   passed: true,
//   diffPath: '/path/to/output/diff.png',
// }
```

### Comparing screenshot sets (full sessions)

```typescript
import { ImageComparison } from '@taka/differ';

const comparison = new ImageComparison();

const summary = await comparison.compareScreenshotSets(
  baselineScreenshots,  // Screenshot[] from baseline test
  headScreenshots,      // Screenshot[] from current test
  './data/test-sessions/test-123/diffs'
);

console.log(summary);
// { total: 12, passed: 10, failed: 2, criticalIssues: 1, ... }
```

## API

### `VisualDiffer`

| Method | Description |
|--------|-------------|
| `compareScreenshots(baseline, head, outputPath, options?)` | Compare two image files, write diff image |
| `compareMultipleScreenshots(pairs, outputDir)` | Compare an array of `{baseline, head}` pairs |
| `createDiffReport(results, outputPath)` | Write a JSON report summarizing diff results |
| `cleanup(directory, olderThanDays)` | Remove diffs older than N days |

### `ImageComparison`

| Method | Description |
|--------|-------------|
| `compareScreenshotSets(baseline, head, outputDir)` | Compare two arrays of `Screenshot` objects |
| `generateComparisonReport(results)` | Build a structured report object |
| `findSignificantDifferences(results, threshold)` | Filter to only failing comparisons |
| `createDiffSummary(results)` | Aggregate stats (passed, failed, critical, minor) |

## Architecture

| File | Responsibility |
|------|----------------|
| `differ.ts` | `VisualDiffer` class — pixel comparison, diff image generation, report writing |
| `comparison.ts` | `ImageComparison` class — high-level API for comparing screenshot sets |
| `types.ts` | `DiffResult`, `ComparisonOptions` |

## Dependencies

- `pixelmatch` — pixel-level image diffing
- `sharp` — image processing and normalization
- `fs-extra` — filesystem helpers

## Build

```bash
pnpm build       # Compile TypeScript to dist/
pnpm type-check  # Type-check without emitting
```
