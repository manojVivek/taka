import fs from 'fs-extra';
import path from 'path';
import PQueue from 'p-queue';
import type { SessionData, TestResult, Screenshot, VisualDiff } from '@taka/types';
import { STORAGE_PATHS, QUEUE_CONCURRENCY } from '@taka/constants';
import { generateId } from '@taka/utils';
import { SessionPlayer } from '@taka/player';
import { ImageComparison } from '@taka/differ';
import { SessionService } from './sessionService';

export class TestService {
  private testsPath: string;
  private testQueue: PQueue;
  private sessionPlayer: SessionPlayer;
  private imageComparison: ImageComparison;
  private activeTests: Map<string, TestExecution> = new Map();
  private sessionService: SessionService;

  constructor(sessionService: SessionService) {
    this.sessionService = sessionService;
    this.testsPath = STORAGE_PATHS.testSessions;
    this.testQueue = new PQueue({ concurrency: QUEUE_CONCURRENCY });
    this.sessionPlayer = new SessionPlayer({
      headless: true,
    });
    this.imageComparison = new ImageComparison();
  }

  async initialize(): Promise<void> {
    console.log('[TestService] Initializing...');
    await fs.ensureDir(this.testsPath);
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

    // Add to queue
    this.testQueue.add(async () => {
      await this.executeTest(testId, sessionData, options);
    });

    console.log('[TestService] Test queued:', testId);
    return testId;
  }

  async getTestStatus(testId: string): Promise<TestExecution | null> {
    return this.activeTests.get(testId) || null;
  }

  async getTestResult(testId: string): Promise<TestResult | null> {
    const testPath = path.join(this.testsPath, testId, 'result.json');

    try {
      if (await fs.pathExists(testPath)) {
        return await fs.readJson(testPath);
      }
    } catch (error) {
      console.error('[TestService] Failed to read test result:', error);
    }

    return null;
  }

  async getAllTests(options: {
    limit?: number;
    offset?: number;
    status?: TestStatus;
  } = {}): Promise<{
    tests: TestExecution[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const {
      limit = 50,
      offset = 0,
      status,
    } = options;

    // Get active tests
    let tests = Array.from(this.activeTests.values());

    // Filter by status if specified
    if (status) {
      tests = tests.filter(test => test.status === status);
    }

    // Sort by creation time (newest first)
    tests.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const total = tests.length;
    tests = tests.slice(offset, offset + limit);

    return {
      tests,
      total,
      limit,
      offset,
    };
  }

  async compareScreenshots(
    baseSessionId: string,
    headSessionId: string,
    options: ComparisonOptions = {}
  ): Promise<string> {
    console.log('[TestService] Starting screenshot comparison:', { baseSessionId, headSessionId });

    const comparisonId = generateId();

    // Add to queue
    this.testQueue.add(async () => {
      await this.executeComparison(comparisonId, baseSessionId, headSessionId, options);
    });

    return comparisonId;
  }

  async getQueueStatus(): Promise<{
    pending: number;
    running: number;
    completed: number;
  }> {
    const activeTests = Array.from(this.activeTests.values());

    return {
      pending: this.testQueue.pending,
      running: activeTests.filter(test => test.status === 'running').length,
      completed: activeTests.filter(test => test.status === 'completed' || test.status === 'failed').length,
    };
  }

  async cleanup(): Promise<void> {
    console.log('[TestService] Cleaning up...');

    // Wait for queue to finish
    await this.testQueue.onIdle();

    // Cleanup player
    await this.sessionPlayer.destroy();

    console.log('[TestService] Cleanup completed');
  }

  private async executeTest(testId: string, sessionData: SessionData, options: TestOptions): Promise<void> {
    console.log('[TestService] Executing test:', testId);

    const testExecution = this.activeTests.get(testId);
    if (!testExecution) {
      console.error('[TestService] Test execution not found:', testId);
      return;
    }

    try {
      // Update status
      testExecution.status = 'running';
      testExecution.startedAt = Date.now();

      // Create test directory and screenshots subdirectory
      const testDir = path.join(this.testsPath, testId);
      const testScreenshotsDir = path.join(testDir, 'screenshots');
      await fs.ensureDir(testScreenshotsDir);

      // Run session replay with screenshots going to test directory
      console.log('[TestService] Replaying session for test:', testId);
      const playbackResult = await this.sessionPlayer.replay(sessionData, {
        screenshotOutputPath: testScreenshotsDir,
      });

      // Check if session has a baseline
      const hasBaseline = await this.sessionService.hasBaseline(sessionData.id);

      let diffs: VisualDiff[] = [];
      let isBaseline = false;
      let diffsPath: string | undefined;

      if (!hasBaseline) {
        // First replay — copy screenshots as baseline
        const baselineDir = this.sessionService.getBaselineScreenshotsPath(sessionData.id);
        await fs.ensureDir(baselineDir);
        await fs.copy(testScreenshotsDir, baselineDir);
        await this.sessionService.setBaselineFlag(sessionData.id, testId);
        isBaseline = true;
        console.log('[TestService] Baseline created for session:', sessionData.id);
      } else {
        // Has baseline — run visual comparison
        const baselineDir = this.sessionService.getBaselineScreenshotsPath(sessionData.id);
        const baselineScreenshots = await this.findScreenshotsInDir(baselineDir, sessionData.id);
        const testScreenshots = await this.findScreenshotsInDir(testScreenshotsDir, sessionData.id);

        if (baselineScreenshots.length > 0 && testScreenshots.length > 0) {
          const testDiffsDir = path.join(testDir, 'diffs');
          await fs.ensureDir(testDiffsDir);
          diffsPath = testDiffsDir;

          const { results, summary } = await this.imageComparison.compareScreenshotSets(
            baselineScreenshots,
            testScreenshots,
            {},
            testDiffsDir
          );
          diffs = results;

          // Generate report in the diffs directory
          await this.imageComparison.generateComparisonReport(results, testDiffsDir);

          console.log('[TestService] Visual comparison completed:', {
            total: summary.total,
            passed: summary.passed,
            failed: summary.failed,
          });
        }
      }

      // Determine overall status
      const hasDiffFailures = diffs.some(d => !d.passed);
      const status = !playbackResult.success ? 'failed' : (hasDiffFailures ? 'failed' : 'passed');

      // Create test result
      const testResult: TestResult = {
        id: testId,
        sessionId: sessionData.id,
        baseCommit: options.baseCommit,
        headCommit: options.headCommit,
        status,
        screenshots: playbackResult.screenshots,
        diffs,
        createdAt: testExecution.createdAt,
        screenshotsPath: testScreenshotsDir,
        diffsPath,
        isBaseline,
      };

      // Save test result
      const resultPath = path.join(testDir, 'result.json');
      await fs.writeJson(resultPath, testResult, { spaces: 2 });

      // Update execution status
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

  private async executeComparison(
    comparisonId: string,
    baseSessionId: string,
    headSessionId: string,
    options: ComparisonOptions
  ): Promise<void> {
    console.log('[TestService] Executing comparison:', comparisonId);

    try {
      // Find baseline screenshots for both sessions
      const baseScreenshotsDir = this.sessionService.getBaselineScreenshotsPath(baseSessionId);
      const headScreenshotsDir = this.sessionService.getBaselineScreenshotsPath(headSessionId);

      const baseScreenshots = await this.findScreenshotsInDir(baseScreenshotsDir, baseSessionId);
      const headScreenshots = await this.findScreenshotsInDir(headScreenshotsDir, headSessionId);

      if (baseScreenshots.length === 0 || headScreenshots.length === 0) {
        throw new Error('Screenshots not found for one or both sessions');
      }

      // Create output directory for comparison
      const comparisonDir = path.join(this.testsPath, comparisonId, 'diffs');
      await fs.ensureDir(comparisonDir);

      // Perform comparison
      const { results, summary } = await this.imageComparison.compareScreenshotSets(
        baseScreenshots,
        headScreenshots,
        options,
        comparisonDir
      );

      // Generate report
      const { reportPath } = await this.imageComparison.generateComparisonReport(
        results,
        comparisonDir
      );

      console.log('[TestService] Comparison completed:', comparisonId, {
        totalComparisons: results.length,
        passed: summary.passed,
        failed: summary.failed,
        reportPath,
      });

    } catch (error) {
      console.error('[TestService] Comparison failed:', comparisonId, error);
    }
  }

  private async findScreenshotsInDir(screenshotsDir: string, sessionId: string): Promise<Screenshot[]> {
    try {
      if (!(await fs.pathExists(screenshotsDir))) {
        return [];
      }

      const files = await fs.readdir(screenshotsDir);
      const screenshots: Screenshot[] = [];

      for (const file of files) {
        if (file.endsWith('.png')) {
          const filePath = path.join(screenshotsDir, file);
          const stat = await fs.stat(filePath);

          // Extract event index from filename (format: 0001_click_timestamp.png)
          const match = file.match(/^(\d+)_/);
          const eventIndex = match ? parseInt(match[1], 10) : 0;

          screenshots.push({
            id: generateId(),
            sessionId,
            timestamp: stat.mtime.getTime(),
            path: filePath,
            eventIndex,
          });
        }
      }

      // Sort by event index
      screenshots.sort((a, b) => a.eventIndex - b.eventIndex);

      return screenshots;
    } catch (error) {
      console.error('[TestService] Failed to find screenshots:', error);
      return [];
    }
  }
}

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
