import type { RecorderConfig } from '@taka/types';

// Default recorder configuration. Lives in the recorder package (not
// @taka/constants) so the browser bundle stays free of any server-only
// dependencies. `projectId` is intentionally absent — it is required and
// must be supplied by the caller.
export const DEFAULT_CONFIG: Omit<RecorderConfig, 'projectId'> = {
  apiEndpoint: 'http://localhost:3000/api',
  uploadInterval: 5000,
  maxBatchSize: 100,
  enableNetworkCapture: true,
  enableStorageCapture: true,
  captureConsole: false,
};
