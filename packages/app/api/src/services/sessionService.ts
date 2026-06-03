import type { Project, SessionData } from '@taka/types';
import type {
  Storage,
  SessionSummary,
  ListOptions,
  SessionStats,
  ScreenshotRef,
  ProjectUpdate,
} from '@taka/storage';

export class SessionService {
  constructor(private storage: Storage) {}

  // Per-session write chains. The recorder uploads in incremental batches and
  // clears its buffer after each one, so saveSession must MERGE (append) rather
  // than replace — otherwise only the last batch survives. Serializing the
  // read-merge-write per session id keeps a periodic upload from lost-updating
  // the final beforeunload beacon (which carries the last events).
  private saveChains = new Map<string, Promise<void>>();

  // --- Projects ---

  async createProject(project: Project): Promise<void> {
    return this.storage.createProject(project);
  }

  async getProject(id: string): Promise<Project | null> {
    return this.storage.getProject(id);
  }

  async listProjects(): Promise<Project[]> {
    return this.storage.listProjects();
  }

  async updateProject(id: string, updates: ProjectUpdate): Promise<boolean> {
    return this.storage.updateProject(id, updates);
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.storage.deleteProject(id);
  }

  // --- Sessions ---

  async saveSession(projectId: string, sessionData: SessionData): Promise<void> {
    const key = `${projectId}/${sessionData.id}`;
    const prev = this.saveChains.get(key) ?? Promise.resolve();
    const next = prev
      .catch(() => {}) // a failed prior write must not break the chain
      .then(() => this.mergeAndSave(projectId, sessionData));
    this.saveChains.set(key, next);
    next.finally(() => {
      if (this.saveChains.get(key) === next) this.saveChains.delete(key);
    });
    return next;
  }

  // Merge an incremental upload into the stored session (append + dedup by id),
  // preserving the original start metadata and any baseline flags. First upload
  // (nothing stored yet) is written as-is.
  private async mergeAndSave(projectId: string, incoming: SessionData): Promise<void> {
    const existing = await this.storage.getSession(projectId, incoming.id);
    if (!existing) {
      return this.storage.saveSession(projectId, incoming);
    }

    const seenEvents = new Set((existing.events ?? []).map(e => e.id));
    const events = (existing.events ?? []).concat(
      (incoming.events ?? []).filter(e => !seenEvents.has(e.id)),
    );

    const seenRequests = new Set((existing.networkRequests ?? []).map(r => r.id));
    const networkRequests = (existing.networkRequests ?? []).concat(
      (incoming.networkRequests ?? []).filter(r => !seenRequests.has(r.id)),
    );

    const merged: SessionData = {
      ...existing,
      ...incoming,
      timestamp: existing.timestamp, // keep the original recording start
      url: existing.url, // recording origin is stable across batches
      events,
      networkRequests,
      storageSnapshot: existing.storageSnapshot ?? incoming.storageSnapshot,
      // baseline flags are set out-of-band by the test flow — never clobber them
      hasBaseline: existing.hasBaseline ?? incoming.hasBaseline,
      baselineTestId: existing.baselineTestId ?? incoming.baselineTestId,
    };
    return this.storage.saveSession(projectId, merged);
  }

  async getSession(projectId: string, id: string): Promise<SessionData | null> {
    return this.storage.getSession(projectId, id);
  }

  async getAllSessions(
    projectId: string,
    opts: ListOptions = {},
  ): Promise<{
    sessions: SessionSummary[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const result = await this.storage.listSessions(projectId, opts);
    return {
      sessions: result.items,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  }

  async deleteSession(projectId: string, id: string): Promise<boolean> {
    return this.storage.deleteSession(projectId, id);
  }

  async searchSessions(projectId: string, query: string): Promise<SessionSummary[]> {
    return this.storage.searchSessions(projectId, query);
  }

  async getSessionStats(projectId: string): Promise<SessionStats> {
    return this.storage.getSessionStats(projectId);
  }

  async hasBaseline(projectId: string, sessionId: string): Promise<boolean> {
    return this.storage.hasBaseline(projectId, sessionId);
  }

  async setBaselineFlag(
    projectId: string,
    sessionId: string,
    testId: string,
  ): Promise<void> {
    return this.storage.setBaselineFlag(projectId, sessionId, testId);
  }

  async listBaselineScreenshots(
    projectId: string,
    sessionId: string,
  ): Promise<ScreenshotRef[]> {
    return this.storage.listBaselineScreenshots(projectId, sessionId);
  }
}
