import type { Page } from 'puppeteer-core';
import type { Screenshot } from '@taka/types';
import { generateId, sanitizeFilename } from '@taka/utils';
import path from 'path';
import fs from 'fs-extra';

export class ScreenshotCapture {
  private outputPath: string;

  constructor(outputPath: string) {
    this.outputPath = outputPath;
  }

  async capture(
    page: Page,
    sessionId: string,
    eventIndex: number,
    eventType?: string
  ): Promise<Screenshot> {
    // Ensure output directory exists
    await fs.ensureDir(this.outputPath);

    // Generate filename
    const timestamp = Date.now();
    const sanitizedEventType = eventType ? sanitizeFilename(eventType) : 'unknown';
    const filename = `${eventIndex.toString().padStart(4, '0')}_${sanitizedEventType}_${timestamp}.png`;
    const screenshotPath = path.join(this.outputPath, filename);

    // Take screenshot
    console.log('[Screenshot] Capturing:', screenshotPath);
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      type: 'png',
    });

    // Create screenshot metadata
    const screenshot: Screenshot = {
      id: generateId(),
      sessionId,
      timestamp,
      path: screenshotPath,
      eventIndex,
    };

    console.log('[Screenshot] Captured successfully:', filename);
    return screenshot;
  }

  async captureElement(
    page: Page,
    sessionId: string,
    eventIndex: number,
    selector: string,
    eventType?: string
  ): Promise<Screenshot> {
    await fs.ensureDir(this.outputPath);

    const timestamp = Date.now();
    const sanitizedEventType = eventType ? sanitizeFilename(eventType) : 'element';
    const filename = `${eventIndex.toString().padStart(4, '0')}_${sanitizedEventType}_element_${timestamp}.png`;
    const screenshotPath = path.join(this.outputPath, filename);

    try {
      // Find and screenshot specific element
      const element = await page.$(selector);
      if (!element) {
        console.warn('[Screenshot] Element not found:', selector);
        // Fallback to full page screenshot
        return await this.capture(page, sessionId, eventIndex, eventType);
      }

      await element.screenshot({
        path: screenshotPath,
        type: 'png',
      });

      const screenshot: Screenshot = {
        id: generateId(),
        sessionId,
        timestamp,
        path: screenshotPath,
        eventIndex,
      };

      console.log('[Screenshot] Element captured successfully:', filename);
      return screenshot;
    } catch (error) {
      console.warn('[Screenshot] Failed to capture element, falling back to full page:', error);
      return await this.capture(page, sessionId, eventIndex, eventType);
    }
  }

  async captureViewport(
    page: Page,
    sessionId: string,
    eventIndex: number,
    eventType?: string
  ): Promise<Screenshot> {
    await fs.ensureDir(this.outputPath);

    const timestamp = Date.now();
    const sanitizedEventType = eventType ? sanitizeFilename(eventType) : 'viewport';
    const filename = `${eventIndex.toString().padStart(4, '0')}_${sanitizedEventType}_viewport_${timestamp}.png`;
    const screenshotPath = path.join(this.outputPath, filename);

    // Take viewport-only screenshot
    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
      type: 'png',
    });

    const screenshot: Screenshot = {
      id: generateId(),
      sessionId,
      timestamp,
      path: screenshotPath,
      eventIndex,
    };

    console.log('[Screenshot] Viewport captured successfully:', filename);
    return screenshot;
  }

  async getScreenshotInfo(screenshotPath: string): Promise<{
    width: number;
    height: number;
    size: number;
  }> {
    try {
      const stats = await fs.stat(screenshotPath);
      
      // For getting image dimensions, we'd need an image library
      // For now, return basic file info
      return {
        width: 0, // Would need image library to get actual dimensions
        height: 0,
        size: stats.size,
      };
    } catch (error) {
      console.error('[Screenshot] Failed to get info for:', screenshotPath, error);
      return {
        width: 0,
        height: 0,
        size: 0,
      };
    }
  }

  async cleanup(sessionId: string, keepLatest: number = 10): Promise<void> {
    const sessionDir = this.outputPath;
    
    try {
      const files = await fs.readdir(sessionDir);
      const screenshots = files
        .filter(file => file.endsWith('.png'))
        .map(file => ({
          name: file,
          path: path.join(sessionDir, file),
          stat: fs.statSync(path.join(sessionDir, file))
        }))
        .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

      // Keep only the latest screenshots
      const toDelete = screenshots.slice(keepLatest);
      
      for (const screenshot of toDelete) {
        await fs.unlink(screenshot.path);
        console.log('[Screenshot] Cleaned up:', screenshot.name);
      }

      console.log('[Screenshot] Cleanup completed for session:', sessionId, 
                  'Kept:', keepLatest, 'Deleted:', toDelete.length);
    } catch (error) {
      console.error('[Screenshot] Cleanup failed for session:', sessionId, error);
    }
  }
}