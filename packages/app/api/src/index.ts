import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { SessionService } from './services/sessionService';
import { TestService } from './services/testService';
import { sessionRoutes } from './routes/sessions';
import { testRoutes } from './routes/tests';
import { healthRoutes } from './routes/health';
import { STORAGE_PATHS } from '@taka/constants';
import fs from 'fs-extra';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
const sessionService = new SessionService();
const testService = new TestService(sessionService);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Add services to request object
app.use((req, res, next) => {
  req.sessionService = sessionService;
  req.testService = testService;
  next();
});

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/tests', testRoutes);

// Static file serving for user sessions and test sessions
app.use('/api/user-sessions', express.static(path.resolve(STORAGE_PATHS.userSessions)));
app.use('/api/test-sessions', express.static(path.resolve(STORAGE_PATHS.testSessions)));

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API] Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// 404 handler
app.use('/{*splat}', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`,
  });
});

async function initializeServer() {
  try {
    // Ensure data directories exist
    await fs.ensureDir(STORAGE_PATHS.userSessions);
    await fs.ensureDir(STORAGE_PATHS.testSessions);

    console.log('[API] Data directories initialized');

    // Initialize session service first (fast)
    await sessionService.initialize();

    // Start listening immediately so the server is responsive
    app.listen(PORT, () => {
      console.log(`[API] Server running on http://localhost:${PORT}`);
      console.log(`[API] Health check: http://localhost:${PORT}/api/health`);
      console.log(`[API] Sessions API: http://localhost:${PORT}/api/sessions`);
      console.log(`[API] Tests API: http://localhost:${PORT}/api/tests`);
    });

    // Initialize test service in background (launches Puppeteer, can be slow)
    testService.initialize().then(() => {
      console.log('[API] Test service initialized');
    }).catch((error) => {
      console.error('[API] Test service initialization failed:', error);
    });

    console.log('[API] Services initialized');
  } catch (error) {
    console.error('[API] Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[API] Received SIGTERM, shutting down gracefully');
  await sessionService.cleanup();
  await testService.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[API] Received SIGINT, shutting down gracefully');
  await sessionService.cleanup();
  await testService.cleanup();
  process.exit(0);
});

// Augment Express Request type
declare global {
  namespace Express {
    interface Request {
      sessionService: SessionService;
      testService: TestService;
    }
  }
}

initializeServer();