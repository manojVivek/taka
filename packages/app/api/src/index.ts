import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { SessionService } from './services/sessionService';
import { TestService } from './services/testService';
import { sessionRoutes } from './routes/sessions';
import { testRoutes } from './routes/tests';
import { projectRoutes } from './routes/projects';
import { healthRoutes } from './routes/health';
import { STORAGE_PATHS } from '@taka/constants';
import { createStorage, type Storage, type StorageKind } from '@taka/storage';

const app = express();
const PORT = process.env.PORT || 3001;

const storageKind = (process.env.TAKA_STORAGE as StorageKind) || 'file';
const storage: Storage = createStorage(storageKind, {
  file: { projectsRoot: STORAGE_PATHS.projectsRoot },
});

console.log(`[API] Storage backend: ${storageKind}`);

const sessionService = new SessionService(storage);
const testService = new TestService(sessionService, storage);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, _res, next) => {
  req.sessionService = sessionService;
  req.testService = testService;
  next();
});

// 404 if the referenced project doesn't exist. Mounted in front of every
// route that takes :projectId so storage doesn't need to throw.
async function ensureProject(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const projectId = (req.params as { projectId?: string }).projectId;
  if (!projectId) {
    return res.status(400).json({ error: 'Missing project id' });
  }
  const project = await sessionService.getProject(projectId);
  if (!project) {
    return res.status(404).json({
      error: 'Project not found',
      message: `No project with id "${projectId}". Create one with POST /api/projects.`,
    });
  }
  next();
}

app.use('/api/health', healthRoutes);

// Projects CRUD (its own handlers check existence)
app.use('/api/projects', projectRoutes);

// Project-scoped routers — gated by ensureProject
app.use('/api/projects/:projectId/sessions', ensureProject, sessionRoutes);
app.use('/api/projects/:projectId/tests', ensureProject, testRoutes);

// Blob endpoints — project-scoped only
app.get(
  '/api/projects/:projectId/user-sessions/:sessionId/screenshots/:filename',
  ensureProject,
  async (req, res, next) => {
    try {
      const { projectId, sessionId, filename } = req.params as Record<string, string>;
      const buf = await storage.getBaselineScreenshot(projectId, sessionId, filename);
      if (!buf) return res.status(404).json({ error: 'Not found' });
      res.contentType('image/png').send(buf);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/api/projects/:projectId/test-sessions/:testId/screenshots/:filename',
  ensureProject,
  async (req, res, next) => {
    try {
      const { projectId, testId, filename } = req.params as Record<string, string>;
      const buf = await storage.getTestScreenshot(projectId, testId, filename);
      if (!buf) return res.status(404).json({ error: 'Not found' });
      res.contentType('image/png').send(buf);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/api/projects/:projectId/test-sessions/:testId/diffs/:filename',
  ensureProject,
  async (req, res, next) => {
    try {
      const { projectId, testId, filename } = req.params as Record<string, string>;
      const buf = await storage.getTestDiff(projectId, testId, filename);
      if (!buf) return res.status(404).json({ error: 'Not found' });
      res.contentType('image/png').send(buf);
    } catch (err) {
      next(err);
    }
  },
);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[API] Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

app.use('/{*splat}', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`,
  });
});

async function initializeServer() {
  try {
    await storage.initialize();
    console.log('[API] Storage initialized');

    app.listen(PORT, () => {
      console.log(`[API] Server running on http://localhost:${PORT}`);
      console.log(`[API] Health check:  http://localhost:${PORT}/api/health`);
      console.log(`[API] Projects API:  http://localhost:${PORT}/api/projects`);
      console.log(`[API] Sessions API:  http://localhost:${PORT}/api/projects/<id>/sessions`);
      console.log(`[API] Tests API:     http://localhost:${PORT}/api/projects/<id>/tests`);
    });

    testService
      .initialize()
      .then(() => console.log('[API] Test service initialized'))
      .catch(error => console.error('[API] Test service initialization failed:', error));
  } catch (error) {
    console.error('[API] Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('[API] Received SIGTERM, shutting down gracefully');
  await testService.cleanup();
  await storage.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[API] Received SIGINT, shutting down gracefully');
  await testService.cleanup();
  await storage.cleanup();
  process.exit(0);
});

declare global {
  namespace Express {
    interface Request {
      sessionService: SessionService;
      testService: TestService;
    }
  }
}

initializeServer();
