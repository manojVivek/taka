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
    return this.storage.saveSession(projectId, sessionData);
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
