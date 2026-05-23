import PQueue from 'p-queue';
import type { SessionData, TestResult, Screenshot, VisualDiff } from '@taka/types';
import { QUEUE_CONCURRENCY } from '@taka/constants';
import { generateId } from '@taka/utils';
import { SessionPlayer, type ScreenshotMeta } from '@taka/player';
import { ImageComparison, type ScreenshotPair } from '@taka/differ';
import type { Storage, DiffReport } from '@taka/storage';
import { SessionService } from './sessionService';

interface TestOptions {
  baseCommit?: string;
  headCommit?: string;
  timeout?: number;
  viewport?: { width: number; height: number };
}

interface ComparisonOptions {
  threshold?: number;
  ignoreRegions?: Array<{ x: number; y: number; width: number; height: number }>;
}

type TestStatus = 'pending' | 'running' | 'completed' | 'failed';

interface TestExecution {
  id: string;
  sessionId: string;
  status: TestStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  options: TestOptions;
  result?: TestResult;
  errors?: string[];
}

interface CapturedScreenshot {
  meta: ScreenshotMeta;
  bytes: Buffer;
}

export class TestService {
  private testQueue: PQueue;
  private sessionPlayer: SessionPlayer;
  private imageComparison: ImageComparison;
  private activeTests: Map<string, TestExecution> = new Map();

  constructor(
    private sessionService: SessionService,
    private storage: Storage,
  ) {
    this.testQueue = new PQueue({ concurrency: QUEUE_CONCURRENCY });
    this.sessionPlayer = new SessionPlayer({ headless: true });
    this.imageComparison = new ImageComparison();
  }

  async initialize(): Promise<void> {
    console.log('[TestService] Initializing...');
    await this.sessionPlayer.initialize();
    console.log('[TestService] Initialized');
  }

  async runTest(sessionData: SessionData, options: TestOptions = {}): Promise<string> {
    console.log('[TestService] Starting test for session:', sessionData.id);

    const testId = generateId();
    const testExecution: TestExecution = {
      id: testId,
      sessionId: sessionData.id,
      status: 'pending',
      createdAt: Date.now(),
      options,
    };

    this.activeTests.set(testId, testExecution);

    this.testQueue.add(async () => {
      await this.executeTest(testId, sessionData, options);
    });

    return testId;
  }

  async getTestStatus(testId: string): Promise<TestExecution | null> {
    return this.activeTests.get(testId) || null;
  }

  async getTestResult(testId: string): Promise<TestResult | null> {
    return this.storage.getTestResult(testId);
  }

  async getAllTests(opts: {
    limit?: number;
    offset?: number;
    status?: TestStatus;
  } = {}): Promise<{
    tests: TestExecution[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const { limit = 50, offset = 0, status } = opts;

    let tests = Array.from(this.activeTests.values());
    if (status) tests = tests.filter(t => t.status === status);
    tests.sort((a, b) => b.createdAt - a.createdAt);

    const total = tests.length;
    tests = tests.slice(offset, offset + limit);
    return { tests, total, limit, offset };
  }

  async compareScreenshots(
    baseSessionId: string,
    headSessionId: string,
    options: ComparisonOptions = {},
  ): Promise<string> {
    const comparisonId = generateId();
    this.testQueue.add(async () => {
      await this.executeComparison(comparisonId, baseSessionId, headSessionId, options);
    });
    return comparisonId;
  }

  async getQueueStatus(): Promise<{ pending: number; running: number; completed: number }> {
    const tests = Array.from(this.activeTests.values());
    return {
      pending: this.testQueue.pending,
      running: tests.filter(t => t.status === 'running').length,
      completed: tests.filter(t => t.status === 'completed' || t.status === 'failed').length,
    };
  }

  async cleanup(): Promise<void> {
    console.log('[TestService] Cleaning up...');
    await this.testQueue.onIdle();
    await this.sessionPlayer.destroy();
  }

  private async executeTest(
    testId: string,
    sessionData: SessionData,
    options: TestOptions,
  ): Promise<void> {
    const testExecution = this.activeTests.get(testId);
    if (!testExecution) return;

    try {
      testExecution.status = 'running';
      testExecution.startedAt = Date.now();

      // Run the replay, persisting screenshots through storage as they arrive
      const collected: CapturedScreenshot[] = [];
      const playbackResult = await this.sessionPlayer.replay(sessionData, {
        onScreenshot: async (meta, bytes) => {
          await this.storage.putTestScreenshot(testId, meta.filename, bytes);
          collected.push({ meta, bytes });
        },
      });

      const hasBaseline = await this.sessionService.hasBaseline(sessionData.id);

      let diffs: VisualDiff[] = [];
      let isBaseline = false;

      if (!hasBaseline) {
        // First replay — promote the test screenshots to baseline
        for (const s of collected) {
          await this.storage.putBaselineScreenshot(sessionData.id, s.meta.filename, s.bytes);
        }
        await this.sessionService.setBaselineFlag(sessionData.id, testId);
        isBaseline = true;
        console.log('[TestService] Baseline created for session:', sessionData.id);
      } else {
        // Pair baseline + test screenshots by event index and run pixel diffs
        const pairs = await this.buildPairs(sessionData.id, collected);
        if (pairs.length > 0) {
          const { comparisons } = await this.imageComparison.compareScreenshotSets(pairs);

          for (const c of comparisons) {
            if (c.diffImage && c.diffFilename) {
              await this.storage.putTestDiff(testId, c.diffFilename, c.diffImage);
            }
          }

          diffs = comparisons.map(c => c.diff);

          const report: DiffReport = {
            timestamp: Date.now(),
            summary: {
              total: diffs.length,
              passed: diffs.filter(d => d.passed).length,
              failed: diffs.filter(d => !d.passed).length,
              avgPixelDifference:
                diffs.reduce((sum, d) => sum + d.pixelDifference, 0) / Math.max(diffs.length, 1),
            },
            diffs: comparisons.map(c => ({
              id: c.diff.id,
              baseEventIndex: c.diff.baseScreenshot.eventIndex,
              headEventIndex: c.diff.headScreenshot.eventIndex,
              pixelDifference: c.diff.pixelDifference,
              percentageDifference: c.diff.percentageDifference,
              threshold: c.diff.threshold,
              passed: c.diff.passed,
              diffFilename: c.diffFilename,
            })),
          };
          await this.storage.putTestDiffReport(testId, report);

          console.log('[TestService] Visual comparison completed:', report.summary);
        }
      }

      const hasDiffFailures = diffs.some(d => !d.passed);
      const status: TestResult['status'] = !playbackResult.success
        ? 'failed'
        : hasDiffFailures
          ? 'failed'
          : 'passed';

      const testResult: TestResult = {
        id: testId,
        sessionId: sessionData.id,
        baseCommit: options.baseCommit,
        headCommit: options.headCommit,
        status,
        screenshots: playbackResult.screenshots.map<Screenshot>(m => ({
          id: generateId(),
          sessionId: sessionData.id,
          timestamp: m.timestamp,
          path: m.filename,
          eventIndex: m.eventIndex,
        })),
        diffs,
        createdAt: testExecution.createdAt,
        isBaseline,
      };

      await this.storage.saveTestResult(testId, testResult);

      testExecution.status = status === 'passed' ? 'completed' : 'failed';
      testExecution.completedAt = Date.now();
      testExecution.result = testResult;
      testExecution.errors = playbackResult.errors;

      console.log('[TestService] Test completed:', testId, 'Status:', testExecution.status);
    } catch (error) {
      console.error('[TestService] Test execution failed:', testId, error);
      testExecution.status = 'failed';
      testExecution.completedAt = Date.now();
      testExecution.errors = [error instanceof Error ? error.message : String(error)];
    }
  }

  private async buildPairs(
    sessionId: string,
    collected: CapturedScreenshot[],
  ): Promise<ScreenshotPair[]> {
    const baselineRefs = await this.storage.listBaselineScreenshots(sessionId);
    const pairs: ScreenshotPair[] = [];

    for (const baseRef of baselineRefs) {
      const headEntry = collected.find(c => c.meta.eventIndex === baseRef.eventIndex);
      if (!headEntry) continue;

      const baseBytes = await this.storage.getBaselineScreenshot(sessionId, baseRef.filename);
      if (!baseBytes) continue;

      pairs.push({
        baseFilename: baseRef.filename,
        baseBytes,
        baseEventIndex: baseRef.eventIndex,
        headFilename: headEntry.meta.filename,
        headBytes: headEntry.bytes,
        headEventIndex: headEntry.meta.eventIndex,
      });
    }

    return pairs;
  }

  private async executeComparison(
    comparisonId: string,
    baseSessionId: string,
    headSessionId: string,
    options: ComparisonOptions,
  ): Promise<void> {
    try {
      const baseRefs = await this.storage.listBaselineScreenshots(baseSessionId);
      const headRefs = await this.storage.listBaselineScreenshots(headSessionId);

      const pairs: ScreenshotPair[] = [];
      for (const baseRef of baseRefs) {
        const headRef = headRefs.find(h => h.eventIndex === baseRef.eventIndex);
        if (!headRef) continue;

        const [baseBytes, headBytes] = await Promise.all([
          this.storage.getBaselineScreenshot(baseSessionId, baseRef.filename),
          this.storage.getBaselineScreenshot(headSessionId, headRef.filename),
        ]);
        if (!baseBytes || !headBytes) continue;

        pairs.push({
          baseFilename: baseRef.filename,
          baseBytes,
          baseEventIndex: baseRef.eventIndex,
          headFilename: headRef.filename,
          headBytes,
          headEventIndex: headRef.eventIndex,
        });
      }

      if (pairs.length === 0) {
        console.warn('[TestService] No matching screenshots between sessions');
        return;
      }

      const { comparisons, summary } = await this.imageComparison.compareScreenshotSets(
        pairs,
        options,
      );

      for (const c of comparisons) {
        if (c.diffImage && c.diffFilename) {
          await this.storage.putTestDiff(comparisonId, c.diffFilename, c.diffImage);
        }
      }

      const report: DiffReport = {
        timestamp: Date.now(),
        summary: {
          total: summary.total,
          passed: summary.passed,
          failed: summary.failed,
          avgPixelDifference: summary.averagePixelDifference,
        },
        diffs: comparisons.map(c => ({
          id: c.diff.id,
          baseEventIndex: c.diff.baseScreenshot.eventIndex,
          headEventIndex: c.diff.headScreenshot.eventIndex,
          pixelDifference: c.diff.pixelDifference,
          percentageDifference: c.diff.percentageDifference,
          threshold: c.diff.threshold,
          passed: c.diff.passed,
          diffFilename: c.diffFilename,
        })),
      };
      await this.storage.putTestDiffReport(comparisonId, report);

      console.log('[TestService] Comparison completed:', comparisonId, summary);
    } catch (error) {
      console.error('[TestService] Comparison failed:', comparisonId, error);
    }
  }
}
