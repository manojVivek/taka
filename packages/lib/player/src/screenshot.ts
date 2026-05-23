import type { Page } from 'puppeteer-core';
import { sanitizeFilename } from '@taka/utils';
import type { ScreenshotMeta } from './types';

export interface CapturedScreenshot {
  meta: ScreenshotMeta;
  bytes: Buffer;
}

export class ScreenshotCapture {
  async capture(
    page: Page,
    eventIndex: number,
    eventType?: string,
  ): Promise<CapturedScreenshot> {
    const timestamp = Date.now();
    const sanitizedEventType = eventType ? sanitizeFilename(eventType) : 'unknown';
    const filename = `${eventIndex.toString().padStart(4, '0')}_${sanitizedEventType}_${timestamp}.png`;

    const raw = await page.screenshot({ fullPage: true, type: 'png' });
    const bytes = Buffer.from(raw);

    console.log('[Screenshot] Captured:', filename, `(${bytes.length} bytes)`);
    return {
      meta: { filename, eventIndex, eventType: sanitizedEventType, timestamp },
      bytes,
    };
  }

  async captureElement(
    page: Page,
    selector: string,
    eventIndex: number,
    eventType?: string,
  ): Promise<CapturedScreenshot> {
    const timestamp = Date.now();
    const sanitizedEventType = eventType ? sanitizeFilename(eventType) : 'element';
    const filename = `${eventIndex.toString().padStart(4, '0')}_${sanitizedEventType}_element_${timestamp}.png`;

    try {
      const element = await page.$(selector);
      if (!element) {
        console.warn('[Screenshot] Element not found, falling back to full page:', selector);
        return this.capture(page, eventIndex, eventType);
      }

      const raw = await element.screenshot({ type: 'png' });
      const bytes = Buffer.from(raw);

      console.log('[Screenshot] Element captured:', filename, `(${bytes.length} bytes)`);
      return {
        meta: { filename, eventIndex, eventType: sanitizedEventType, timestamp },
        bytes,
      };
    } catch (error) {
      console.warn('[Screenshot] Element capture failed, falling back to full page:', error);
      return this.capture(page, eventIndex, eventType);
    }
  }

  async captureViewport(
    page: Page,
    eventIndex: number,
    eventType?: string,
  ): Promise<CapturedScreenshot> {
    const timestamp = Date.now();
    const sanitizedEventType = eventType ? sanitizeFilename(eventType) : 'viewport';
    const filename = `${eventIndex.toString().padStart(4, '0')}_${sanitizedEventType}_viewport_${timestamp}.png`;

    const raw = await page.screenshot({ fullPage: false, type: 'png' });
    const bytes = Buffer.from(raw);

    console.log('[Screenshot] Viewport captured:', filename, `(${bytes.length} bytes)`);
    return {
      meta: { filename, eventIndex, eventType: sanitizedEventType, timestamp },
      bytes,
    };
  }
}
