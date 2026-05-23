import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { SessionService } from './services/sessionService';
import { TestService } from './services/testService';
import { sessionRoutes } from './routes/sessions';
import { testRoutes } from './routes/tests';
import { healthRoutes } from './routes/health';
import { STORAGE_PATHS } from '@taka/constants';
import { createStorage, type Storage, type StorageKind } from '@taka/storage';

const app = express();
const PORT = process.env.PORT || 3001;

// Pick storage backend from env. Defaults to filesystem.
const storageKind = (process.env.TAKA_STORAGE as StorageKind) || 'file';
const storage: Storage = createStorage(storageKind, {
  file: {
    userSessionsPath: STORAGE_PATHS.userSessions,
    testSessionsPath: STORAGE_PATHS.testSessions,
  },
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

app.use('/api/health', healthRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/tests', testRoutes);

// Blob endpoints — go through Storage instead of express.static so they work
// with any backend (filesystem today, cloud object stores in future).
app.get('/api/user-sessions/:sessionId/screenshots/:filename', async (req, res, next) => {
  try {
    const { sessionId, filename } = req.params;
    const buf = await storage.getBaselineScreenshot(sessionId, filename);
    if (!buf) return res.status(404).json({ error: 'Not found' });
    res.contentType('image/png').send(buf);
  } catch (err) {
    next(err);
  }
});

app.get('/api/test-sessions/:testId/screenshots/:filename', async (req, res, next) => {
  try {
    const { testId, filename } = req.params;
    const buf = await storage.getTestScreenshot(testId, filename);
    if (!buf) return res.status(404).json({ error: 'Not found' });
    res.contentType('image/png').send(buf);
  } catch (err) {
    next(err);
  }
});

app.get('/api/test-sessions/:testId/diffs/:filename', async (req, res, next) => {
  try {
    const { testId, filename } = req.params;
    const buf = await storage.getTestDiff(testId, filename);
    if (!buf) return res.status(404).json({ error: 'Not found' });
    res.contentType('image/png').send(buf);
  } catch (err) {
    next(err);
  }
});

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
      console.log(`[API] Health check: http://localhost:${PORT}/api/health`);
      console.log(`[API] Sessions API: http://localhost:${PORT}/api/sessions`);
      console.log(`[API] Tests API: http://localhost:${PORT}/api/tests`);
    });

    // Puppeteer launch happens in background — keeps the API responsive at boot.
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
