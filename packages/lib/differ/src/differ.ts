import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import type { Screenshot, VisualDiff } from '@taka/types';
import { VISUAL_DIFF_THRESHOLD } from '@taka/constants';
import { generateId } from '@taka/utils';
import type { ComparisonOptions, ComparisonResult } from './types';

const DEFAULT_OPTIONS: Required<Pick<ComparisonOptions, 'threshold' | 'pixelMatchOptions'>> = {
  threshold: VISUAL_DIFF_THRESHOLD,
  pixelMatchOptions: {
    threshold: 0.1,
    includeAA: true,
  },
};

export interface ScreenshotRefForDiff {
  filename: string;
  eventIndex: number;
}

export class VisualDiffer {
  async compareScreenshots(
    baseBytes: Buffer,
    headBytes: Buffer,
    options: ComparisonOptions = {},
    refs?: { base: ScreenshotRefForDiff; head: ScreenshotRefForDiff },
  ): Promise<ComparisonResult> {
    const merged = {
      threshold: options.threshold ?? DEFAULT_OPTIONS.threshold,
      pixelMatchOptions: options.pixelMatchOptions ?? DEFAULT_OPTIONS.pixelMatchOptions,
    };

    const { baseRaw, headRaw, width, height } = await this.normalizeAndResize(baseBytes, headBytes);

    const diffPixels = new Uint8Array(width * height * 4);
    const pixelDifference = pixelmatch(
      baseRaw,
      headRaw,
      diffPixels,
      width,
      height,
      merged.pixelMatchOptions,
    );

    const percentageDifference = pixelDifference / (width * height);
    const passed = percentageDifference <= merged.threshold;

    let diffImage: Buffer | undefined;
    if (pixelDifference > 0) {
      diffImage = await sharp(diffPixels, {
        raw: { width, height, channels: 4 },
      })
        .png()
        .toBuffer();
    }

    const baseScreenshot: Screenshot = {
      id: generateId(),
      sessionId: '',
      timestamp: 0,
      path: refs?.base.filename ?? '',
      eventIndex: refs?.base.eventIndex ?? 0,
    };
    const headScreenshot: Screenshot = {
      id: generateId(),
      sessionId: '',
      timestamp: 0,
      path: refs?.head.filename ?? '',
      eventIndex: refs?.head.eventIndex ?? 0,
    };

    const diff: VisualDiff = {
      id: generateId(),
      baseScreenshot,
      headScreenshot,
      pixelDifference,
      percentageDifference,
      threshold: merged.threshold,
      passed,
    };

    console.log('[Differ] Comparison:', {
      baseIdx: baseScreenshot.eventIndex,
      headIdx: headScreenshot.eventIndex,
      pixelDifference,
      percentage: `${(percentageDifference * 100).toFixed(2)}%`,
      passed,
    });

    return { diff, diffImage };
  }

  private async normalizeAndResize(
    a: Buffer,
    b: Buffer,
  ): Promise<{ baseRaw: Uint8Array; headRaw: Uint8Array; width: number; height: number }> {
    const aMeta = await sharp(a).metadata();
    const bMeta = await sharp(b).metadata();
    if (!aMeta.width || !aMeta.height || !bMeta.width || !bMeta.height) {
      throw new Error('Unable to read image dimensions');
    }
    const width = Math.max(aMeta.width, bMeta.width);
    const height = Math.max(aMeta.height, bMeta.height);

    const baseRaw = new Uint8Array(
      await sharp(a)
        .ensureAlpha()
        .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .raw()
        .toColourspace('srgb')
        .toBuffer(),
    );
    const headRaw = new Uint8Array(
      await sharp(b)
        .ensureAlpha()
        .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .raw()
        .toColourspace('srgb')
        .toBuffer(),
    );

    return { baseRaw, headRaw, width, height };
  }
}
