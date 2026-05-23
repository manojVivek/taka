# @taka/differ

Visual regression engine. Compares baseline and head screenshot **buffers** pixel-by-pixel and emits diff images plus summary statistics.

## Overview

The differ powers the visual regression check at the heart of Taka. It uses **Sharp** to normalize image dimensions and **Pixelmatch** for the actual pixel-level comparison. Inputs and outputs are `Buffer`s — the differ does no filesystem I/O, so the caller is free to source bytes from local disk, S3, an in-memory cache, or anywhere else.

## Features

- Pixel-perfect comparison via [Pixelmatch](https://github.com/mapbox/pixelmatch)
- Image normalization (resize, format) via [Sharp](https://sharp.pixelplumbing.com/)
- Configurable difference threshold
- Diff image generation with highlighted changes, returned as a `Buffer`
- Batch comparison helper that pairs already-fetched buffers
- Summary statistics: passed, failed, critical (>10%), minor (1–10%)
- No filesystem dependency — storage is the caller's concern

## Usage

### Single comparison

```typescript
import { VisualDiffer } from '@taka/differ';

const differ = new VisualDiffer();

const { diff, diffImage } = await differ.compareScreenshots(
  baselineBuf,   // Buffer
  headBuf,       // Buffer
  { threshold: 0.1 },
  {
    base: { filename: 'baseline.png', eventIndex: 4 },
    head: { filename: 'head.png',     eventIndex: 4 },
  },
);

console.log(diff);
// { id, baseScreenshot, headScreenshot,
//   pixelDifference: 1532, percentageDifference: 0.04,
//   threshold: 0.1, passed: true }

if (diffImage) {
  await myStorage.put('diff_4.png', diffImage);
}
```

### Comparing screenshot sets

```typescript
import { ImageComparison } from '@taka/differ';

const comparison = new ImageComparison();

// Caller pairs screenshots by event index and supplies pre-fetched buffers.
const pairs = baselineRefs.flatMap(b => {
  const h = headRefs.find(r => r.eventIndex === b.eventIndex);
  if (!h) return [];
  return [{
    baseFilename: b.filename, baseBytes: baselineBuffers[b.filename], baseEventIndex: b.eventIndex,
    headFilename: h.filename, headBytes: headBuffers[h.filename],     headEventIndex: h.eventIndex,
  }];
});

const { comparisons, summary } = await comparison.compareScreenshotSets(pairs);

console.log(summary);
// { total: 12, passed: 10, failed: 2, averagePixelDifference: ..., averagePercentageDifference: ... }

for (const c of comparisons) {
  if (c.diffImage && c.diffFilename) {
    await myStorage.put(c.diffFilename, c.diffImage);
  }
}
```

## API

### `VisualDiffer`

| Method | Description |
|--------|-------------|
| `compareScreenshots(baseBytes, headBytes, options?, refs?)` | Compare two PNG buffers. Returns `{ diff, diffImage? }`. `diffImage` is omitted when the images are identical. |

### `ImageComparison`

| Method | Description |
|--------|-------------|
| `compareScreenshotSets(pairs, options?)` | Run `compareScreenshots` over an array of pre-paired buffers. Returns `{ comparisons, summary }`. Each comparison includes a suggested `diffFilename` when there's a diff to persist. |
| `findSignificantDifferences(results, threshold)` | Filter to only failing comparisons above the threshold |
| `createDiffSummary(results)` | Aggregate stats (passed, failed, critical, minor) with an overview string |

## Architecture

| File | Responsibility |
|------|----------------|
| `differ.ts` | `VisualDiffer` — pixel comparison, returns diff bytes |
| `comparison.ts` | `ImageComparison` — batch helper over pre-fetched buffer pairs |
| `types.ts` | `ComparisonOptions`, `ComparisonResult`, `ScreenshotPair`, `BatchComparisonSummary` |

## Dependencies

- `pixelmatch` — pixel-level image diffing
- `sharp` — image processing and normalization

(No filesystem dependency. Diff bytes go through the public API as `Buffer`s.)

## Build

```bash
pnpm build       # Compile TypeScript to dist/
pnpm type-check  # Type-check without emitting
```
