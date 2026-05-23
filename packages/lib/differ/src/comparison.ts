import type { VisualDiff } from '@taka/types';
import type {
  ComparisonOptions,
  ComparisonResult,
  ScreenshotPair,
  BatchComparisonSummary,
} from './types';
import { VisualDiffer } from './differ';

export interface BatchComparisonResult {
  comparisons: Array<ComparisonResult & { diffFilename?: string }>;
  summary: BatchComparisonSummary;
}

export class ImageComparison {
  private differ: VisualDiffer;

  constructor() {
    this.differ = new VisualDiffer();
  }

  /**
   * Compare paired baseline + head screenshot buffers. The caller has already
   * paired them up (typically by event index) and fetched the bytes from
   * storage. Returns one ComparisonResult per pair plus a summary.
   *
   * If a pair produces a diff image, a deterministic filename is suggested
   * (`diff_<baseIdx>_vs_<headIdx>_<ts>.png`) which the caller can use to
   * persist the buffer.
   */
  async compareScreenshotSets(
    pairs: ScreenshotPair[],
    options: ComparisonOptions = {},
  ): Promise<BatchComparisonResult> {
    const comparisons: BatchComparisonResult['comparisons'] = [];

    for (const pair of pairs) {
      try {
        const result = await this.differ.compareScreenshots(
          pair.baseBytes,
          pair.headBytes,
          options,
          {
            base: { filename: pair.baseFilename, eventIndex: pair.baseEventIndex },
            head: { filename: pair.headFilename, eventIndex: pair.headEventIndex },
          },
        );

        const diffFilename = result.diffImage
          ? `diff_${pair.baseEventIndex}_vs_${pair.headEventIndex}_${Date.now()}.png`
          : undefined;

        comparisons.push({ ...result, diffFilename });
      } catch (error) {
        console.error('[ImageComparison] Failed pair:', pair.baseFilename, error);
      }
    }

    return { comparisons, summary: this.summarize(comparisons.map(c => c.diff)) };
  }

  findSignificantDifferences(
    results: VisualDiff[],
    significanceThreshold: number = 0.05,
  ): VisualDiff[] {
    return results.filter(r => !r.passed && r.percentageDifference > significanceThreshold);
  }

  createDiffSummary(results: VisualDiff[]): {
    overview: string;
    criticalIssues: VisualDiff[];
    minorIssues: VisualDiff[];
    passedTests: VisualDiff[];
  } {
    const criticalThreshold = 0.1;
    const minorThreshold = 0.01;

    const criticalIssues = results.filter(
      r => !r.passed && r.percentageDifference > criticalThreshold,
    );
    const minorIssues = results.filter(
      r =>
        !r.passed &&
        r.percentageDifference > minorThreshold &&
        r.percentageDifference <= criticalThreshold,
    );
    const passedTests = results.filter(r => r.passed);

    return {
      overview: this.overviewText(results, criticalIssues, minorIssues),
      criticalIssues,
      minorIssues,
      passedTests,
    };
  }

  private summarize(results: VisualDiff[]): BatchComparisonSummary {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    const averagePixelDifference =
      total > 0
        ? results.reduce((sum, r) => sum + Math.max(r.pixelDifference, 0), 0) / total
        : 0;
    const averagePercentageDifference =
      total > 0 ? results.reduce((sum, r) => sum + r.percentageDifference, 0) / total : 0;
    return { total, passed, failed, averagePixelDifference, averagePercentageDifference };
  }

  private overviewText(
    results: VisualDiff[],
    criticalIssues: VisualDiff[],
    minorIssues: VisualDiff[],
  ): string {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;

    if (total === 0) return 'No screenshots to compare.';
    if (passed === total) return `All ${total} visual tests passed.`;

    const lines = [`Visual Test Results: ${passed}/${total} passed`];
    if (criticalIssues.length > 0) lines.push(`${criticalIssues.length} critical differences`);
    if (minorIssues.length > 0) lines.push(`${minorIssues.length} minor differences`);
    const avg = results.reduce((sum, r) => sum + r.percentageDifference, 0) / total;
    lines.push(`Average difference: ${(avg * 100).toFixed(2)}%`);
    return lines.join('\n');
  }
}
