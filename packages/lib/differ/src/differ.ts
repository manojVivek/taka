import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import fs from 'fs-extra';
import path from 'path';
import type { Screenshot, VisualDiff } from '@taka/types';
import { VISUAL_DIFF_THRESHOLD } from '@taka/constants';
import { generateId, sanitizeFilename } from '@taka/utils';
import type { DiffResult, ComparisonOptions } from './types';

export class VisualDiffer {
  private defaultOptions: ComparisonOptions;

  constructor() {
    this.defaultOptions = {
      threshold: VISUAL_DIFF_THRESHOLD,
      pixelMatchOptions: {
        threshold: 0.1,
        includeAA: true,
      },
    };
  }

  async compareScreenshots(
    baseScreenshot: Screenshot,
    headScreenshot: Screenshot,
    options: Partial<ComparisonOptions> = {},
    outputDir?: string
  ): Promise<VisualDiff> {
    console.log('[Differ] Comparing screenshots:', {
      base: path.basename(baseScreenshot.path),
      head: path.basename(headScreenshot.path),
    });

    const mergedOptions = { ...this.defaultOptions, ...options };

    try {
      // Read and process images
      const baseImage = await this.loadAndNormalizeImage(baseScreenshot.path);
      const headImage = await this.loadAndNormalizeImage(headScreenshot.path);

      // Ensure images are the same size
      const { baseResized, headResized, width, height } = await this.resizeToMatch(baseImage, headImage);

      // Convert to raw pixel data
      const basePixels = new Uint8Array(await baseResized.raw().toBuffer());
      const headPixels = new Uint8Array(await headResized.raw().toBuffer());

      // Create diff buffer
      const diffPixels = new Uint8Array(width * height * 4);

      // Perform pixel comparison
      const pixelDifference = pixelmatch(
        basePixels,
        headPixels,
        diffPixels,
        width,
        height,
        mergedOptions.pixelMatchOptions
      );

      const percentageDifference = pixelDifference / (width * height);
      const passed = percentageDifference <= mergedOptions.threshold;

      // Save diff image if there are differences
      let diffImagePath: string | undefined;
      if (pixelDifference > 0 && outputDir) {
        diffImagePath = await this.saveDiffImage(
          diffPixels,
          width,
          height,
          outputDir,
          baseScreenshot.eventIndex,
          headScreenshot.eventIndex
        );
      }

      const visualDiff: VisualDiff = {
        id: generateId(),
        baseScreenshot,
        headScreenshot,
        diffPath: diffImagePath,
        pixelDifference,
        percentageDifference,
        threshold: mergedOptions.threshold,
        passed,
      };

      console.log('[Differ] Comparison completed:', {
        pixelDifference,
        percentageDifference: `${(percentageDifference * 100).toFixed(2)}%`,
        passed,
        diffCreated: !!diffImagePath,
      });

      return visualDiff;
    } catch (error) {
      console.error('[Differ] Comparison failed:', error);
      throw new Error(`Failed to compare screenshots: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async compareMultipleScreenshots(
    baseScreenshots: Screenshot[],
    headScreenshots: Screenshot[],
    options: Partial<ComparisonOptions> = {},
    outputDir?: string
  ): Promise<VisualDiff[]> {
    console.log('[Differ] Comparing multiple screenshots:', {
      baseCount: baseScreenshots.length,
      headCount: headScreenshots.length,
    });

    const results: VisualDiff[] = [];

    // Create a map for quick lookup of head screenshots by event index
    const headMap = new Map<number, Screenshot>();
    headScreenshots.forEach(screenshot => {
      headMap.set(screenshot.eventIndex, screenshot);
    });

    // Compare each base screenshot with its corresponding head screenshot
    for (const baseScreenshot of baseScreenshots) {
      const headScreenshot = headMap.get(baseScreenshot.eventIndex);
      
      if (headScreenshot) {
        try {
          const diff = await this.compareScreenshots(baseScreenshot, headScreenshot, options, outputDir);
          results.push(diff);
        } catch (error) {
          console.error('[Differ] Failed to compare screenshot pair:', error);
          // Create a failed diff result
          results.push({
            id: generateId(),
            baseScreenshot,
            headScreenshot,
            pixelDifference: -1,
            percentageDifference: -1,
            threshold: options.threshold || this.defaultOptions.threshold,
            passed: false,
          });
        }
      } else {
        console.warn('[Differ] No matching head screenshot for base event index:', baseScreenshot.eventIndex);
      }
    }

    console.log('[Differ] Multiple screenshot comparison completed:', {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
    });

    return results;
  }

  private async loadAndNormalizeImage(imagePath: string): Promise<sharp.Sharp> {
    // Load image and convert to RGBA
    return sharp(imagePath)
      .ensureAlpha()
      .raw()
      .toColourspace('srgb');
  }

  private async resizeToMatch(
    image1: sharp.Sharp,
    image2: sharp.Sharp
  ): Promise<{
    baseResized: sharp.Sharp;
    headResized: sharp.Sharp;
    width: number;
    height: number;
  }> {
    // Get metadata for both images
    const metadata1 = await image1.metadata();
    const metadata2 = await image2.metadata();

    if (!metadata1.width || !metadata1.height || !metadata2.width || !metadata2.height) {
      throw new Error('Unable to get image dimensions');
    }

    // Use the larger dimensions to avoid losing content
    const width = Math.max(metadata1.width, metadata2.width);
    const height = Math.max(metadata1.height, metadata2.height);

    console.log('[Differ] Resizing images to common size:', { width, height });

    // Resize both images to the same size with white background
    const baseResized = image1
      .resize(width, height, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      });

    const headResized = image2
      .resize(width, height, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      });

    return { baseResized, headResized, width, height };
  }

  private async saveDiffImage(
    diffPixels: Uint8Array,
    width: number,
    height: number,
    outputDir: string,
    baseEventIndex: number,
    headEventIndex: number
  ): Promise<string> {
    // Ensure diff directory exists
    await fs.ensureDir(outputDir);

    // Generate diff image filename
    const timestamp = Date.now();
    const filename = `diff_${baseEventIndex}_vs_${headEventIndex}_${timestamp}.png`;
    const diffPath = path.join(outputDir, filename);

    // Convert diff pixels back to PNG
    await sharp(diffPixels, {
      raw: {
        width,
        height,
        channels: 4,
      },
    })
    .png()
    .toFile(diffPath);

    console.log('[Differ] Diff image saved:', filename);
    return diffPath;
  }

  async createDiffReport(
    diffs: VisualDiff[],
    outputDir: string
  ): Promise<string> {
    await fs.ensureDir(outputDir);

    const reportPath = path.join(outputDir, 'report.json');
    
    const report = {
      timestamp: Date.now(),
      summary: {
        total: diffs.length,
        passed: diffs.filter(d => d.passed).length,
        failed: diffs.filter(d => !d.passed).length,
        avgPixelDifference: diffs.length > 0 
          ? diffs.reduce((sum, d) => sum + d.pixelDifference, 0) / diffs.length 
          : 0,
      },
      diffs: diffs.map(diff => ({
        id: diff.id,
        baseEventIndex: diff.baseScreenshot.eventIndex,
        headEventIndex: diff.headScreenshot.eventIndex,
        pixelDifference: diff.pixelDifference,
        percentageDifference: diff.percentageDifference,
        threshold: diff.threshold,
        passed: diff.passed,
        diffPath: diff.diffPath ? path.basename(diff.diffPath) : undefined,
      })),
    };

    await fs.writeJson(reportPath, report, { spaces: 2 });
    
    console.log('[Differ] Diff report created:', reportPath);
    return reportPath;
  }

  async cleanup(diffDir: string, keepReports: number = 5): Promise<void> {
    try {
      if (!(await fs.pathExists(diffDir))) {
        return;
      }

      const files = await fs.readdir(diffDir);
      
      // Separate reports and diff images
      const reports = files
        .filter(file => file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(diffDir, file),
          stat: fs.statSync(path.join(diffDir, file))
        }))
        .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

      // Keep only the latest reports
      const reportsToDelete = reports.slice(keepReports);
      
      for (const report of reportsToDelete) {
        await fs.unlink(report.path);
        console.log('[Differ] Cleaned up report:', report.name);
      }

      // Clean up old diff images (keep images from latest reports)
      const diffImages = files
        .filter(file => file.endsWith('.png'))
        .map(file => ({
          name: file,
          path: path.join(diffDir, file),
          stat: fs.statSync(path.join(diffDir, file))
        }))
        .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

      const maxDiffImages = keepReports * 20; // Estimate max images per report
      const diffImagesToDelete = diffImages.slice(maxDiffImages);
      
      for (const image of diffImagesToDelete) {
        await fs.unlink(image.path);
        console.log('[Differ] Cleaned up diff image:', image.name);
      }

      console.log('[Differ] Cleanup completed for:', diffDir);
    } catch (error) {
      console.error('[Differ] Cleanup failed for:', diffDir, error);
    }
  }
}