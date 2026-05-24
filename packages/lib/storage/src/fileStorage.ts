import fs from 'fs-extra';
import path from 'path';
import type { Project, SessionData, TestResult } from '@taka/types';
import type {
  Storage,
  SessionSummary,
  ScreenshotRef,
  ListOptions,
  ListResult,
  SessionStats,
  DiffReport,
  FileStorageConfig,
  ProjectUpdate,
} from './types';

export class FileStorage implements Storage {
  private projectsRoot: string;
  private projects: Map<string, Project> = new Map();
  private sessionsByProject: Map<string, Map<string, SessionSummary>> = new Map();

  constructor(config: FileStorageConfig) {
    this.projectsRoot = path.resolve(config.projectsRoot);
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(this.projectsRoot);
    await this.loadProjectsIndex();
    for (const projectId of this.projects.keys()) {
      await this.loadSessionsIndex(projectId);
    }
    console.log(
      `[Storage:File] Initialized — ${this.projects.size} project(s), ` +
        `${[...this.sessionsByProject.values()].reduce((sum, m) => sum + m.size, 0)} session(s) total`,
    );
  }

  async cleanup(): Promise<void> {
    await this.saveProjectsIndex();
    for (const projectId of this.sessionsByProject.keys()) {
      await this.saveSessionsIndex(projectId);
    }
  }

  // === Projects ===

  async createProject(project: Project): Promise<void> {
    this.projects.set(project.id, project);
    this.sessionsByProject.set(project.id, new Map());
    await fs.ensureDir(this.userSessionsDir(project.id));
    await fs.ensureDir(this.testSessionsDir(project.id));
    await this.saveProjectsIndex();
    console.log(`[Storage:File] Created project ${project.id} (${project.name})`);
  }

  async getProject(id: string): Promise<Project | null> {
    return this.projects.get(id) ?? null;
  }

  async listProjects(): Promise<Project[]> {
    return Array.from(this.projects.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  async updateProject(id: string, updates: ProjectUpdate): Promise<boolean> {
    const existing = this.projects.get(id);
    if (!existing) return false;
    const next: Project = {
      ...existing,
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
    };
    this.projects.set(id, next);
    await this.saveProjectsIndex();
    return true;
  }

  async deleteProject(id: string): Promise<boolean> {
    if (!this.projects.has(id)) return false;
    await fs.remove(this.projectDir(id));
    this.projects.delete(id);
    this.sessionsByProject.delete(id);
    await this.saveProjectsIndex();
    return true;
  }

  // === Sessions ===

  async saveSession(projectId: string, session: SessionData): Promise<void> {
    this.requireProject(projectId);
    const dir = path.join(this.userSessionsDir(projectId), session.id);
    await fs.ensureDir(dir);
    const sessionPath = path.join(dir, 'session.json');
    const persisted: SessionData = { ...session, projectId };
    await fs.writeJson(sessionPath, persisted, { spaces: 2 });
    this.sessionsForProject(projectId).set(session.id, this.summarize(projectId, persisted));
    await this.saveSessionsIndex(projectId);
  }

  async getSession(projectId: string, id: string): Promise<SessionData | null> {
    const sessionPath = path.join(this.userSessionsDir(projectId), id, 'session.json');
    try {
      if (!(await fs.pathExists(sessionPath))) return null;
      return await fs.readJson(sessionPath);
    } catch (error) {
      console.error('[Storage:File] Failed to read session:', projectId, id, error);
      return null;
    }
  }

  async listSessions(
    projectId: string,
    opts: ListOptions = {},
  ): Promise<ListResult<SessionSummary>> {
    const { limit = 50, offset = 0, sortBy = 'timestamp', sortOrder = 'desc' } = opts;
    const map = this.sessionsByProject.get(projectId);
    if (!map) return { items: [], total: 0, limit, offset };

    let items = Array.from(map.values());
    items.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    const total = items.length;
    items = items.slice(offset, offset + limit);
    return { items, total, limit, offset };
  }

  async deleteSession(projectId: string, id: string): Promise<boolean> {
    const map = this.sessionsByProject.get(projectId);
    if (!map || !map.has(id)) return false;
    const sessionDir = path.join(this.userSessionsDir(projectId), id);
    await fs.remove(sessionDir);
    map.delete(id);
    await this.saveSessionsIndex(projectId);
    return true;
  }

  async searchSessions(projectId: string, query: string): Promise<SessionSummary[]> {
    const map = this.sessionsByProject.get(projectId);
    if (!map) return [];
    const q = query.toLowerCase();
    return Array.from(map.values()).filter(
      s =>
        s.url.toLowerCase().includes(q) ||
        s.title?.toLowerCase().includes(q) ||
        s.userId?.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
  }

  async getSessionStats(projectId: string): Promise<SessionStats> {
    const map = this.sessionsByProject.get(projectId);
    const items = map ? Array.from(map.values()) : [];
    if (items.length === 0) {
      return {
        totalSessions: 0,
        totalEvents: 0,
        totalNetworkRequests: 0,
        totalSize: 0,
        averageEventsPerSession: 0,
      };
    }

    const totalEvents = items.reduce((sum, s) => sum + s.eventCount, 0);
    const totalNetworkRequests = items.reduce((sum, s) => sum + s.networkRequestCount, 0);
    const totalSize = items.reduce((sum, s) => sum + s.size, 0);
    const timestamps = items.map(s => s.timestamp).sort();

    return {
      totalSessions: items.length,
      totalEvents,
      totalNetworkRequests,
      totalSize,
      averageEventsPerSession: totalEvents / items.length,
      oldestSession: new Date(timestamps[0]),
      newestSession: new Date(timestamps[timestamps.length - 1]),
    };
  }

  // === Baselines ===

  async hasBaseline(projectId: string, sessionId: string): Promise<boolean> {
    const dir = this.baselineDir(projectId, sessionId);
    try {
      if (!(await fs.pathExists(dir))) return false;
      const files = await fs.readdir(dir);
      return files.some(f => f.endsWith('.png'));
    } catch {
      return false;
    }
  }

  async setBaselineFlag(projectId: string, sessionId: string, testId: string): Promise<void> {
    const sessionPath = path.join(this.userSessionsDir(projectId), sessionId, 'session.json');
    if (!(await fs.pathExists(sessionPath))) return;
    const data = await fs.readJson(sessionPath);
    data.hasBaseline = true;
    data.baselineTestId = testId;
    await fs.writeJson(sessionPath, data, { spaces: 2 });

    const map = this.sessionsByProject.get(projectId);
    const existing = map?.get(sessionId);
    if (map && existing) {
      map.set(sessionId, { ...existing, hasBaseline: true });
      await this.saveSessionsIndex(projectId);
    }
  }

  async putBaselineScreenshot(
    projectId: string,
    sessionId: string,
    filename: string,
    bytes: Buffer,
  ): Promise<void> {
    const dir = this.baselineDir(projectId, sessionId);
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, filename), bytes);
  }

  async listBaselineScreenshots(projectId: string, sessionId: string): Promise<ScreenshotRef[]> {
    return this.listPngsIn(this.baselineDir(projectId, sessionId));
  }

  async getBaselineScreenshot(
    projectId: string,
    sessionId: string,
    filename: string,
  ): Promise<Buffer | null> {
    return this.readFileOrNull(path.join(this.baselineDir(projectId, sessionId), filename));
  }

  // === Test runs ===

  async saveTestResult(projectId: string, testId: string, result: TestResult): Promise<void> {
    const dir = path.join(this.testSessionsDir(projectId), testId);
    await fs.ensureDir(dir);
    await fs.writeJson(
      path.join(dir, 'result.json'),
      { ...result, projectId },
      { spaces: 2 },
    );
  }

  async getTestResult(projectId: string, testId: string): Promise<TestResult | null> {
    const p = path.join(this.testSessionsDir(projectId), testId, 'result.json');
    try {
      if (!(await fs.pathExists(p))) return null;
      return await fs.readJson(p);
    } catch {
      return null;
    }
  }

  async putTestScreenshot(
    projectId: string,
    testId: string,
    filename: string,
    bytes: Buffer,
  ): Promise<void> {
    const dir = this.testScreenshotsDir(projectId, testId);
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, filename), bytes);
  }

  async listTestScreenshots(projectId: string, testId: string): Promise<ScreenshotRef[]> {
    return this.listPngsIn(this.testScreenshotsDir(projectId, testId));
  }

  async getTestScreenshot(
    projectId: string,
    testId: string,
    filename: string,
  ): Promise<Buffer | null> {
    return this.readFileOrNull(
      path.join(this.testScreenshotsDir(projectId, testId), filename),
    );
  }

  async putTestDiff(
    projectId: string,
    testId: string,
    filename: string,
    bytes: Buffer,
  ): Promise<void> {
    const dir = this.testDiffsDir(projectId, testId);
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, filename), bytes);
  }

  async listTestDiffs(projectId: string, testId: string): Promise<ScreenshotRef[]> {
    return this.listPngsIn(this.testDiffsDir(projectId, testId));
  }

  async getTestDiff(
    projectId: string,
    testId: string,
    filename: string,
  ): Promise<Buffer | null> {
    return this.readFileOrNull(path.join(this.testDiffsDir(projectId, testId), filename));
  }

  async putTestDiffReport(
    projectId: string,
    testId: string,
    report: DiffReport,
  ): Promise<void> {
    const dir = this.testDiffsDir(projectId, testId);
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, 'report.json'), report, { spaces: 2 });
  }

  // === Internals ===

  private projectDir(projectId: string): string {
    return path.join(this.projectsRoot, projectId);
  }

  private userSessionsDir(projectId: string): string {
    return path.join(this.projectDir(projectId), 'user-sessions');
  }

  private testSessionsDir(projectId: string): string {
    return path.join(this.projectDir(projectId), 'test-sessions');
  }

  private baselineDir(projectId: string, sessionId: string): string {
    return path.join(this.userSessionsDir(projectId), sessionId, 'screenshots');
  }

  private testScreenshotsDir(projectId: string, testId: string): string {
    return path.join(this.testSessionsDir(projectId), testId, 'screenshots');
  }

  private testDiffsDir(projectId: string, testId: string): string {
    return path.join(this.testSessionsDir(projectId), testId, 'diffs');
  }

  private sessionsForProject(projectId: string): Map<string, SessionSummary> {
    let map = this.sessionsByProject.get(projectId);
    if (!map) {
      map = new Map();
      this.sessionsByProject.set(projectId, map);
    }
    return map;
  }

  private requireProject(projectId: string): void {
    if (!this.projects.has(projectId)) {
      throw new Error(`Unknown project: ${projectId}`);
    }
  }

  private async readFileOrNull(p: string): Promise<Buffer | null> {
    try {
      if (!(await fs.pathExists(p))) return null;
      return await fs.readFile(p);
    } catch {
      return null;
    }
  }

  private async listPngsIn(dir: string): Promise<ScreenshotRef[]> {
    try {
      if (!(await fs.pathExists(dir))) return [];
      const files = await fs.readdir(dir);
      const refs: ScreenshotRef[] = [];
      for (const file of files) {
        if (!file.endsWith('.png')) continue;
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        const match = file.match(/^(\d+)_/);
        const eventIndex = match ? parseInt(match[1], 10) : 0;
        refs.push({
          filename: file,
          eventIndex,
          size: stat.size,
          timestamp: stat.mtime.getTime(),
        });
      }
      refs.sort((a, b) => a.eventIndex - b.eventIndex);
      return refs;
    } catch {
      return [];
    }
  }

  private summarize(projectId: string, session: SessionData): SessionSummary {
    return {
      id: session.id,
      projectId,
      url: session.url,
      timestamp: session.timestamp,
      eventCount: session.events.length,
      networkRequestCount: session.networkRequests.length,
      userAgent: session.metadata.userAgent,
      title: session.metadata.title,
      userId: session.metadata.userId,
      size: Buffer.byteLength(JSON.stringify(session), 'utf8'),
      hasBaseline: session.hasBaseline,
    };
  }

  // ---- Projects index ----

  private projectsIndexPath(): string {
    return path.join(this.projectsRoot, 'projects.json');
  }

  private async loadProjectsIndex(): Promise<void> {
    const p = this.projectsIndexPath();
    try {
      if (await fs.pathExists(p)) {
        const data = await fs.readJson(p);
        this.projects = new Map(data.projects || []);
        return;
      }
    } catch (error) {
      console.warn('[Storage:File] Failed to load projects index, rebuilding:', error);
    }
    await this.rebuildProjectsIndex();
  }

  private async saveProjectsIndex(): Promise<void> {
    try {
      await fs.writeJson(
        this.projectsIndexPath(),
        { lastUpdated: Date.now(), projects: Array.from(this.projects.entries()) },
        { spaces: 2 },
      );
    } catch (error) {
      console.error('[Storage:File] Failed to save projects index:', error);
    }
  }

  private async rebuildProjectsIndex(): Promise<void> {
    try {
      if (!(await fs.pathExists(this.projectsRoot))) return;
      const entries = await fs.readdir(this.projectsRoot);
      for (const entry of entries) {
        if (entry === 'projects.json') continue;
        const dir = path.join(this.projectsRoot, entry);
        const stat = await fs.stat(dir).catch(() => null);
        if (!stat?.isDirectory()) continue;
        // Reconstruct a project record with best-effort metadata
        this.projects.set(entry, {
          id: entry,
          name: entry,
          createdAt: stat.birthtime.getTime() || Date.now(),
        });
      }
    } catch (error) {
      console.error('[Storage:File] Failed to rebuild projects index:', error);
    }
  }

  // ---- Per-project sessions index ----

  private sessionsIndexPath(projectId: string): string {
    return path.join(this.userSessionsDir(projectId), 'index.json');
  }

  private async loadSessionsIndex(projectId: string): Promise<void> {
    const p = this.sessionsIndexPath(projectId);
    try {
      if (await fs.pathExists(p)) {
        const data = await fs.readJson(p);
        this.sessionsByProject.set(projectId, new Map(data.sessions || []));
        return;
      }
    } catch (error) {
      console.warn(
        `[Storage:File] Failed to load sessions index for project ${projectId}, rebuilding:`,
        error,
      );
    }
    await this.rebuildSessionsIndex(projectId);
  }

  private async saveSessionsIndex(projectId: string): Promise<void> {
    const map = this.sessionsByProject.get(projectId);
    if (!map) return;
    try {
      await fs.ensureDir(this.userSessionsDir(projectId));
      await fs.writeJson(
        this.sessionsIndexPath(projectId),
        { lastUpdated: Date.now(), sessions: Array.from(map.entries()) },
        { spaces: 2 },
      );
    } catch (error) {
      console.error(
        `[Storage:File] Failed to save sessions index for project ${projectId}:`,
        error,
      );
    }
  }

  private async rebuildSessionsIndex(projectId: string): Promise<void> {
    const map = new Map<string, SessionSummary>();
    this.sessionsByProject.set(projectId, map);
    try {
      const dir = this.userSessionsDir(projectId);
      if (!(await fs.pathExists(dir))) return;
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        if (entry === 'index.json') continue;
        const sessionPath = path.join(dir, entry, 'session.json');
        if (!(await fs.pathExists(sessionPath))) continue;
        try {
          const session: SessionData = await fs.readJson(sessionPath);
          map.set(session.id, this.summarize(projectId, session));
        } catch (error) {
          console.warn('[Storage:File] Skipped malformed session:', entry, error);
        }
      }
    } catch (error) {
      console.error(
        `[Storage:File] Failed to rebuild sessions index for project ${projectId}:`,
        error,
      );
    }
  }

}
