import type { RecorderConfig } from '@taka/types';
import { DEFAULT_CONFIG } from '@taka/constants';
import { generateId, debounce } from '@taka/utils';
import type { RecorderInstance, RecorderState } from './types';
import { EventCapture } from './eventCapture';
import { NetworkCapture } from './networkCapture';
import { StorageCapture } from './storageCapture';
import { SessionUploader } from './uploader';

export class TakaRecorder implements RecorderInstance {
  private state: RecorderState;
  private eventCapture: EventCapture;
  private networkCapture: NetworkCapture;
  private storageCapture: StorageCapture;
  private uploader: SessionUploader;
  private uploadTimer?: NodeJS.Timeout;

  constructor(config: Partial<RecorderConfig> = {}) {
    this.state = {
      sessionId: generateId(),
      isRecording: false,
      isPaused: false,
      startTime: Date.now(),
      config: { ...DEFAULT_CONFIG, ...config },
      buffer: {
        events: [],
        networkRequests: [],
        lastUpload: Date.now(),
      },
    };

    this.eventCapture = new EventCapture(this.handleEvent.bind(this));
    this.networkCapture = new NetworkCapture(this.handleNetworkRequest.bind(this), this.state.config.apiEndpoint);
    this.storageCapture = new StorageCapture();
    this.uploader = new SessionUploader(this.state.config.apiEndpoint);

    // Debounced upload function
    this.debouncedUpload = debounce(this.uploadBuffer.bind(this), 1000);
  }

  static init(config: Partial<RecorderConfig> = {}): TakaRecorder {
    const recorder = new TakaRecorder(config);
    
    // Auto-start recording if not explicitly disabled
    if (config.autoStart !== false) {
      recorder.start();
    }

    return recorder;
  }

  start(): void {
    if (this.state.isRecording) {
      console.warn('[Taka] Recording already in progress');
      return;
    }

    console.log('[Taka] Starting session recording', {
      sessionId: this.state.sessionId,
      config: this.state.config,
    });

    this.state.isRecording = true;
    this.state.isPaused = false;
    this.state.startTime = Date.now();

    // Start all capture mechanisms
    this.eventCapture.start();
    
    if (this.state.config.enableNetworkCapture) {
      this.networkCapture.start();
    }
    
    if (this.state.config.enableStorageCapture) {
      this.storageCapture.start();
    }

    // Record initial page state
    this.recordInitialState();

    // Capture initial storage state for replay (always, regardless of enableStorageCapture)
    this.state.storageSnapshot = this.storageCapture.getStorageSnapshot();
    console.log('[Taka] Storage snapshot captured');

    // Setup periodic upload
    this.setupPeriodicUpload();

    // Setup beforeunload handler to flush data
    window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
  }

  stop(): void {
    if (!this.state.isRecording) {
      console.warn('[Taka] No recording in progress');
      return;
    }

    console.log('[Taka] Stopping session recording');

    this.state.isRecording = false;
    this.state.isPaused = false;

    // Stop all capture mechanisms
    this.eventCapture.stop();
    this.networkCapture.stop();
    this.storageCapture.stop();

    // Upload remaining buffer
    this.uploadBuffer();

    // Clear timers
    if (this.uploadTimer) {
      clearInterval(this.uploadTimer);
      this.uploadTimer = undefined;
    }

    // Remove event listeners
    window.removeEventListener('beforeunload', this.handleBeforeUnload.bind(this));
  }

  pause(): void {
    if (!this.state.isRecording || this.state.isPaused) {
      return;
    }

    console.log('[Taka] Pausing recording');
    this.state.isPaused = true;
  }

  resume(): void {
    if (!this.state.isRecording || !this.state.isPaused) {
      return;
    }

    console.log('[Taka] Resuming recording');
    this.state.isPaused = false;
  }

  identify(userId: string): void {
    this.state.userId = userId;
    console.log('[Taka] User identified:', userId);
  }

  getSessionId(): string {
    return this.state.sessionId;
  }

  isRecording(): boolean {
    return this.state.isRecording && !this.state.isPaused;
  }

  private handleEvent = (event: Omit<import('@taka/types').SessionEvent, 'id' | 'timestamp'>): void => {
    if (!this.isRecording()) {
      return;
    }

    const sessionEvent: import('@taka/types').SessionEvent = {
      id: generateId(),
      timestamp: Date.now(),
      ...event,
    };

    this.state.buffer.events.push(sessionEvent);
    
    // Upload if buffer is getting full
    if (this.state.buffer.events.length >= this.state.config.maxBatchSize) {
      this.debouncedUpload();
    }
  };

  private handleNetworkRequest = (request: import('@taka/types').NetworkRequest): void => {
    if (!this.isRecording()) {
      return;
    }

    this.state.buffer.networkRequests.push(request);
  };

  private recordInitialState(): void {
    this.handleEvent({
      type: 'navigation',
      data: {
        url: window.location.href,
        title: document.title,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        timestamp: Date.now(),
      },
    });
  }

  private setupPeriodicUpload(): void {
    this.uploadTimer = setInterval(() => {
      if (this.state.buffer.events.length > 0 || this.state.buffer.networkRequests.length > 0) {
        this.uploadBuffer();
      }
    }, this.state.config.uploadInterval);
  }

  private debouncedUpload: () => void;

  private async uploadBuffer(): Promise<void> {
    if (this.state.buffer.events.length === 0 && this.state.buffer.networkRequests.length === 0) {
      return;
    }

    const sessionData = this.createSessionData();
    
    try {
      await this.uploader.upload(sessionData);
      
      // Clear buffer after successful upload
      this.state.buffer.events = [];
      this.state.buffer.networkRequests = [];
      this.state.buffer.lastUpload = Date.now();
      
      console.log('[Taka] Buffer uploaded successfully', {
        events: sessionData.events.length,
        networkRequests: sessionData.networkRequests.length,
      });
    } catch (error) {
      console.error('[Taka] Failed to upload session data:', error);
      
      // Keep data in buffer for retry, but don't let it grow indefinitely
      if (this.state.buffer.events.length > this.state.config.maxBatchSize * 2) {
        console.warn('[Taka] Buffer overflow, dropping oldest events');
        this.state.buffer.events = this.state.buffer.events.slice(-this.state.config.maxBatchSize);
      }
    }
  }

  private createSessionData(): import('@taka/types').SessionData {
    return {
      id: this.state.sessionId,
      url: window.location.href,
      timestamp: this.state.startTime,
      events: [...this.state.buffer.events],
      networkRequests: [...this.state.buffer.networkRequests],
      storageSnapshot: this.state.storageSnapshot,
      metadata: {
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        url: window.location.href,
        title: document.title,
        userId: this.state.userId,
        recordingDuration: Date.now() - this.state.startTime,
      },
    };
  }

  private handleBeforeUnload = (): void => {
    // Synchronous upload for page unload
    if (this.state.buffer.events.length > 0 || this.state.buffer.networkRequests.length > 0) {
      const sessionData = this.createSessionData();
      this.uploader.uploadSync(sessionData);
    }
  };
}