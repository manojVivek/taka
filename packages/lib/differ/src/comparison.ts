import type { Screenshot, VisualDiff } from '@taka/types';
import type { DiffResult, ComparisonOptions } from './types';
import { VisualDiffer } from './differ';

export class ImageComparison {
  private differ: VisualDiffer;

  constructor() {
    this.differ = new VisualDiffer();
  }

  async compareScreenshotSets(
    baseScreenshots: Screenshot[],
    headScreenshots: Screenshot[],
    options?: Partial<ComparisonOptions>,
    outputDir?: string
  ): Promise<{
    results: VisualDiff[];
    summary: {
      total: number;
      passed: number;
      failed: number;
      averagePixelDifference: number;
      averagePercentageDifference: number;
    };
  }> {
    console.log('[ImageComparison] Comparing screenshot sets');

    const results = await this.differ.compareMultipleScreenshots(
      baseScreenshots,
      headScreenshots,
      options,
      outputDir
    );

    const summary = this.calculateSummary(results);

    return { results, summary };
  }

  async generateComparisonReport(
    results: VisualDiff[],
    outputDir: string
  ): Promise<{
    reportPath: string;
    summary: ReturnType<ImageComparison['calculateSummary']>;
  }> {
    console.log('[ImageComparison] Generating comparison report');

    const reportPath = await this.differ.createDiffReport(results, outputDir);
    const summary = this.calculateSummary(results);

    return { reportPath, summary };
  }

  private calculateSummary(results: VisualDiff[]) {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    
    const averagePixelDifference = total > 0 
      ? results.reduce((sum, r) => sum + (r.pixelDifference > 0 ? r.pixelDifference : 0), 0) / total 
      : 0;
    
    const averagePercentageDifference = total > 0 
      ? results.reduce((sum, r) => sum + r.percentageDifference, 0) / total 
      : 0;

    return {
      total,
      passed,
      failed,
      averagePixelDifference,
      averagePercentageDifference,
    };
  }

  async findSignificantDifferences(
    results: VisualDiff[],
    significanceThreshold: number = 0.05 // 5% difference is significant
  ): Promise<VisualDiff[]> {
    return results.filter(result => 
      !result.passed && result.percentageDifference > significanceThreshold
    );
  }

  async createDiffSummary(results: VisualDiff[]): Promise<{
    overview: string;
    criticalIssues: VisualDiff[];
    minorIssues: VisualDiff[];
    passedTests: VisualDiff[];
  }> {
    const criticalThreshold = 0.1; // 10% difference is critical
    const minorThreshold = 0.01;   // 1% difference is minor
    
    const criticalIssues = results.filter(r => 
      !r.passed && r.percentageDifference > criticalThreshold
    );
    
    const minorIssues = results.filter(r => 
      !r.passed && 
      r.percentageDifference > minorThreshold && 
      r.percentageDifference <= criticalThreshold
    );
    
    const passedTests = results.filter(r => r.passed);
    
    const overview = this.generateOverviewText(results, criticalIssues, minorIssues);
    
    return {
      overview,
      criticalIssues,
      minorIssues,
      passedTests,
    };
  }

  private generateOverviewText(
    results: VisualDiff[],
    criticalIssues: VisualDiff[],
    minorIssues: VisualDiff[]
  ): string {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    
    if (total === 0) {
      return 'No screenshots to compare.';
    }
    
    if (passed === total) {
      return `✅ All ${total} visual tests passed! No differences detected.`;
    }
    
    const summary = [
      `📊 Visual Test Results: ${passed}/${total} tests passed`,
    ];
    
    if (criticalIssues.length > 0) {
      summary.push(`🔴 ${criticalIssues.length} critical visual differences detected`);
    }
    
    if (minorIssues.length > 0) {
      summary.push(`🟡 ${minorIssues.length} minor visual differences detected`);
    }
    
    const avgPercentage = results.reduce((sum, r) => sum + r.percentageDifference, 0) / total;
    summary.push(`📈 Average difference: ${(avgPercentage * 100).toFixed(2)}%`);
    
    return summary.join('\n');
  }

  async cleanup(diffDir: string, keepReports: number = 5): Promise<void> {
    await this.differ.cleanup(diffDir, keepReports);
  }
}