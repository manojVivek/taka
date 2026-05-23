export interface SessionEvent {
  id: string;
  type: 'click' | 'input' | 'scroll' | 'navigation' | 'mutation' | 'mousemove' | 'focus' | 'blur' | 'submit' | 'resize';
  timestamp: number;
  target?: string;
  data?: any;
}

export interface SessionData {
  id: string;
  url: string;
  timestamp: number;
  events: SessionEvent[];
  networkRequests: NetworkRequest[];
  metadata: SessionMetadata & {
    userId?: string;
    recordingDuration?: number;
  };
  storageSnapshot?: StorageSnapshot;
  hasBaseline?: boolean;
  baselineTestId?: string;
}

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  response?: {
    status: number;
    headers: Record<string, string>;
    body: string;
  };
  timestamp: number;
}

export interface SessionMetadata {
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
  url: string;
  title?: string;
}

export interface Screenshot {
  id: string;
  sessionId: string;
  timestamp: number;
  path: string;
  eventIndex: number;
}

export interface TestResult {
  id: string;
  sessionId: string;
  baseCommit?: string;
  headCommit?: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  screenshots: Screenshot[];
  diffs: VisualDiff[];
  createdAt: number;
  screenshotsPath?: string;
  diffsPath?: string;
  isBaseline?: boolean;
}

export interface VisualDiff {
  id: string;
  baseScreenshot: Screenshot;
  headScreenshot: Screenshot;
  diffPath?: string;
  pixelDifference: number;
  percentageDifference: number;
  threshold: number;
  passed: boolean;
}

export interface StorageSnapshot {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookies: Record<string, string>;
}

export interface RecorderConfig {
  apiEndpoint: string;
  uploadInterval: number;
  maxBatchSize: number;
  enableNetworkCapture: boolean;
  enableStorageCapture: boolean;
  captureConsole: boolean;
  autoStart?: boolean;
}