import puppeteer, { Browser, Page } from 'puppeteer-core';
import type { SessionData, SessionEvent } from '@taka/types';
import { sleep } from '@taka/utils';
import type { PlayerConfig, PlaybackResult, ReplayOptions, ScreenshotMeta } from './types';
import { ScreenshotCapture } from './screenshot';
import { rebaseUrl, rebaseHostname } from './rebase';

export class SessionPlayer {
  private browser?: Browser;
  private config: Required<PlayerConfig>;

  constructor(config: PlayerConfig = {}) {
    this.config = {
      headless: config.headless ?? true,
      viewport: config.viewport ?? { width: 1920, height: 1080 },
      timeout: config.timeout ?? 30000,
    };
  }

  async initialize(): Promise<void> {
    if (this.browser) {
      return;
    }

    console.log('[Player] Launching browser...');
    this.browser = await puppeteer.launch({
      headless: this.config.headless ?? true,
      executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      defaultViewport: this.config.viewport,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
      ],
    });

    console.log('[Player] Browser launched successfully');
  }

  async destroy(): Promise<void> {
    if (this.browser) {
      console.log('[Player] Closing browser...');
      await this.browser.close();
      this.browser = undefined;
    }
  }

  async replay(sessionData: SessionData, options: ReplayOptions = {}): Promise<PlaybackResult> {
    console.log('[Player] Starting session replay:', sessionData.id);

    const screenshotCapture = new ScreenshotCapture();
    const startTime = Date.now();
    const screenshots: ScreenshotMeta[] = [];
    const errors: string[] = [];

    const emit = async (p: Page, eventIndex: number, eventType: string) => {
      const captured = await screenshotCapture.capture(p, eventIndex, eventType);
      screenshots.push(captured.meta);
      if (options.onScreenshot) {
        await options.onScreenshot(captured.meta, captured.bytes);
      }
    };

    // The origin this session was recorded on (the rebase *source*). Derived
    // per-session from its own URL — never a project-wide constant — so a
    // project that mixes recording origins (local dev, staging, …) rebases each
    // session from the right place. Unparseable → '' → rebasing is a no-op.
    let sourceOrigin = '';
    try {
      sourceOrigin = new URL(sessionData.url).origin;
    } catch {
      // leave empty; rebaseUrl/rebaseHostname degrade to identity
    }
    const targetOrigin = options.targetOrigin;
    if (targetOrigin && targetOrigin !== sourceOrigin) {
      console.log(`[Player] Rebasing replay: ${sourceOrigin || '(unknown source)'} → ${targetOrigin}`);
    }

    let page: Page | undefined;

    try {
      await this.initialize();

      if (!this.browser) {
        throw new Error('Browser not initialized');
      }

      page = await this.browser.newPage();

      // Set up viewport
      await page.setViewport(this.config.viewport);

      // Set up network interception for recorded responses
      await this.setupNetworkMocking(page, sessionData, sourceOrigin, targetOrigin);

      // Set replay flag before any page scripts run to prevent recorder from initializing
      await page.evaluateOnNewDocument(() => {
        (window as any).__taka_replay = true;
      });

      // Restore auth state (cookies + storage) before navigation
      await this.restoreAuthState(page, sessionData, sourceOrigin, targetOrigin);

      // Navigate to the initial URL (rebased onto the target origin when set)
      const initialUrl = rebaseUrl(sessionData.url, sourceOrigin, targetOrigin);
      console.log('[Player] Navigating to:', initialUrl);
      await page.goto(initialUrl, {
        waitUntil: 'networkidle0',
        timeout: this.config.timeout
      });

      // Take initial screenshot
      await emit(page, 0, 'initial');

      // Replay events in sequence
      console.log('[Player] Replaying', sessionData.events.length, 'events');

      for (let i = 0; i < sessionData.events.length; i++) {
        const event = sessionData.events[i];

        try {
          await this.replayEvent(page, event, i, sourceOrigin, targetOrigin);

          // Take screenshot after each significant event
          if (this.shouldTakeScreenshot(event)) {
            await emit(page, i + 1, event.type);
          }
        } catch (error) {
          const errorMsg = `Error replaying event ${i}: ${error instanceof Error ? error.message : String(error)}`;
          console.error('[Player]', errorMsg);
          errors.push(errorMsg);
        }
      }

      // Take final screenshot
      await emit(page, sessionData.events.length, 'final');

      await page.close();

      const duration = Date.now() - startTime;
      console.log('[Player] Session replay completed in', duration, 'ms');

      return {
        sessionId: sessionData.id,
        success: errors.length === 0,
        screenshots,
        errors: errors.length > 0 ? errors : undefined,
        duration,
      };

    } catch (error) {
      const errorMsg = `Fatal error during replay: ${error instanceof Error ? error.message : String(error)}`;
      console.error('[Player]', errorMsg);
      errors.push(errorMsg);

      return {
        sessionId: sessionData.id,
        success: false,
        screenshots,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  private async setupNetworkMocking(
    page: Page,
    sessionData: SessionData,
    sourceOrigin: string,
    targetOrigin?: string,
  ): Promise<void> {
    // Create a map of recorded network requests for quick lookup. Keys are
    // rebased onto the target origin so that a same-origin fetch/XHR issued by
    // the page on the *target* deployment matches its recorded response.
    // Cross-origin requests keep their recorded absolute URL (rebaseUrl is an
    // identity for them), so a separate API origin still matches.
    const networkMap = new Map();
    sessionData.networkRequests.forEach(request => {
      const key = `${request.method}:${rebaseUrl(request.url, sourceOrigin, targetOrigin)}`;
      networkMap.set(key, request);
    });

    await page.setRequestInterception(true);
    
    page.on('request', async (request) => {
      const key = `${request.method()}:${request.url()}`;
      const recordedRequest = networkMap.get(key);
      
      if (recordedRequest?.response) {
        console.log('[Player] Mocking network request:', key);
        
        await request.respond({
          status: recordedRequest.response.status,
          headers: recordedRequest.response.headers,
          body: recordedRequest.response.body,
        });
      } else {
        // Allow request to proceed normally
        await request.continue();
      }
    });
  }

  private async replayEvent(
    page: Page,
    event: SessionEvent,
    index: number,
    sourceOrigin: string,
    targetOrigin?: string,
  ): Promise<void> {
    console.log(`[Player] Replaying event ${index}: ${event.type}`);
    
    // Add small delay to make replay more deterministic
    await sleep(50);

    switch (event.type) {
      case 'click':
        await this.replayClick(page, event);
        break;
        
      case 'input':
        await this.replayInput(page, event);
        break;
        
      case 'scroll':
        await this.replayScroll(page, event);
        break;
        
      case 'navigation':
        await this.replayNavigation(page, event, sourceOrigin, targetOrigin);
        break;
        
      case 'submit':
        await this.replaySubmit(page, event);
        break;
        
      case 'focus':
        await this.replayFocus(page, event);
        break;
        
      case 'resize':
        await this.replayResize(page, event);
        break;
        
      default:
        console.log(`[Player] Skipping unsupported event type: ${event.type}`);
    }

    // Wait for any potential async operations
    await sleep(100);
  }

  private async replayClick(page: Page, event: SessionEvent): Promise<void> {
    if (!event.target) return;

    try {
      // Try to click by selector first
      await page.click(event.target);
    } catch (error) {
      // Fallback to clicking by coordinates if available
      if (event.data?.x && event.data?.y) {
        await page.mouse.click(event.data.x, event.data.y);
      } else {
        throw error;
      }
    }
  }

  private async replayInput(page: Page, event: SessionEvent): Promise<void> {
    if (!event.target) return;

    try {
      const element = await page.$(event.target);
      if (!element) {
        console.warn('[Player] Input target not found:', event.target);
        return;
      }

      // Focus the element first
      await element.focus();

      if (event.data?.type === 'checkbox' || event.data?.type === 'radio') {
        if (event.data.checked !== undefined) {
          const isChecked = await element.evaluate((el: any) => el.checked);
          if (isChecked !== event.data.checked) {
            await element.click();
          }
        }
      } else if (event.data?.type === 'select') {
        if (event.data.value !== undefined) {
          await page.select(event.target, event.data.value);
        }
      } else if (event.data?.value !== undefined && !event.data.sensitive) {
        // Clear the field and type the new value
        await element.evaluate((el: any) => el.value = '');
        await element.type(event.data.value);
      }
    } catch (error) {
      console.warn('[Player] Failed to replay input:', error);
    }
  }

  private async replayScroll(page: Page, event: SessionEvent): Promise<void> {
    if (event.data?.scrollX !== undefined && event.data?.scrollY !== undefined) {
      await page.evaluate((x, y) => {
        window.scrollTo(x, y);
      }, event.data.scrollX, event.data.scrollY);
    }
  }

  private async replayNavigation(
    page: Page,
    event: SessionEvent,
    sourceOrigin: string,
    targetOrigin?: string,
  ): Promise<void> {
    if (event.data?.url) {
      const dest = rebaseUrl(event.data.url, sourceOrigin, targetOrigin);
      if (dest !== page.url()) {
        console.log('[Player] Navigating to:', dest);
        await page.goto(dest, {
          waitUntil: 'networkidle0',
          timeout: this.config.timeout
        });
      }
    }
  }

  private async replaySubmit(page: Page, event: SessionEvent): Promise<void> {
    if (!event.target) return;

    try {
      await page.evaluate((selector) => {
        const form = document.querySelector(selector) as HTMLFormElement | null;
        if (!form) return;
        // Dispatch a cancelable submit event so the page's own handler runs
        // (including preventDefault for SPA forms) without triggering the
        // browser's native form submission/navigation — a synthetic submit
        // doesn't perform the default action. `form.submit()` would instead
        // bypass the handler and navigate, losing the result the user saw.
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }, event.target);
    } catch (error) {
      console.warn('[Player] Failed to replay submit:', error);
    }
  }

  private async replayFocus(page: Page, event: SessionEvent): Promise<void> {
    if (!event.target) return;

    try {
      await page.focus(event.target);
    } catch (error) {
      console.warn('[Player] Failed to replay focus:', error);
    }
  }

  private async replayResize(page: Page, event: SessionEvent): Promise<void> {
    if (event.data?.width && event.data?.height) {
      await page.setViewport({
        width: event.data.width,
        height: event.data.height,
      });
    }
  }

  private async restoreAuthState(
    page: Page,
    sessionData: SessionData,
    sourceOrigin: string,
    targetOrigin?: string,
  ): Promise<void> {
    if (!sessionData.storageSnapshot) return;

    console.log('[Player] Restoring auth state from storage snapshot');
    const { localStorage, sessionStorage, cookies } = sessionData.storageSnapshot;
    // Scope restored cookies to the origin we're actually replaying against, so
    // auth cookies apply on a preview deployment too. (secure/sameSite are not
    // re-derived here — a known limitation for auth-gated HTTPS previews.)
    const cookieDomain = rebaseHostname(sourceOrigin, targetOrigin);

    // Restore cookies (as session cookies — no expiry, so they persist for replay)
    const cookieEntries = Object.entries(cookies);
    if (cookieEntries.length > 0) {
      await page.setCookie(
        ...cookieEntries.map(([name, value]) => ({
          name,
          value,
          domain: cookieDomain,
          path: '/',
        }))
      );
      console.log(`[Player] Restored ${cookieEntries.length} cookies`);
    }

    // Restore localStorage and sessionStorage before page scripts run
    // JWT tokens are detected and their exp claims are extended
    const patchedLocalStorage = this.patchJwtExpiry(localStorage);
    const patchedSessionStorage = this.patchJwtExpiry(sessionStorage);

    await page.evaluateOnNewDocument(
      (ls: Record<string, string>, ss: Record<string, string>) => {
        Object.entries(ls).forEach(([k, v]) => window.localStorage.setItem(k, v));
        Object.entries(ss).forEach(([k, v]) => window.sessionStorage.setItem(k, v));
      },
      patchedLocalStorage,
      patchedSessionStorage
    );

    const lsCount = Object.keys(localStorage).length;
    const ssCount = Object.keys(sessionStorage).length;
    console.log(`[Player] Queued restoration of ${lsCount} localStorage and ${ssCount} sessionStorage entries`);
  }

  private patchJwtExpiry(storage: Record<string, string>): Record<string, string> {
    const patched: Record<string, string> = {};
    const jwtPattern = /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

    for (const [key, value] of Object.entries(storage)) {
      if (jwtPattern.test(value)) {
        try {
          const [header, payload, signature] = value.split('.');
          const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
          if (decoded.exp) {
            decoded.exp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
            const newPayload = Buffer.from(JSON.stringify(decoded)).toString('base64url');
            patched[key] = `${header}.${newPayload}.${signature}`;
            console.log(`[Player] Extended JWT expiry for storage key: ${key}`);
            continue;
          }
        } catch {
          // Not a valid JWT, use as-is
        }
      }
      patched[key] = value;
    }
    return patched;
  }

  private shouldTakeScreenshot(event: SessionEvent): boolean {
    // Take screenshots for visually significant events
    const screenshotEvents = ['click', 'submit', 'navigation', 'input'];
    return screenshotEvents.includes(event.type);
  }
}