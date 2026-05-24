export const DEFAULT_CONFIG = {
  apiEndpoint: 'http://localhost:3000/api',
  uploadInterval: 5000,
  maxBatchSize: 100,
  enableNetworkCapture: true,
  enableStorageCapture: true,
  captureConsole: false,
} as const;

import path from 'path';

// Resolve project root from packages/shared/constants/dist/ (4 levels up)
const DATA_ROOT = process.env.DATA_ROOT || path.resolve(__dirname, '../../../../data');

export const STORAGE_PATHS = {
  data: DATA_ROOT,
  projectsRoot: path.join(DATA_ROOT, 'projects'),
};

export const EVENT_TYPES = {
  CLICK: 'click',
  INPUT: 'input',
  SCROLL: 'scroll',
  NAVIGATION: 'navigation',
  MUTATION: 'mutation',
} as const;

export const TEST_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  PASSED: 'passed',
  FAILED: 'failed',
} as const;

export const VISUAL_DIFF_THRESHOLD = 0.1; // 10% pixel difference threshold

export const QUEUE_CONCURRENCY = 2; // Number of concurrent jobs