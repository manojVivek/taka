import { LRUCache } from 'lru-cache';
import { v4 as uuid } from 'uuid';

export { uuid };

export function createCache<T extends {}>(options: { max: number; ttl: number }) {
  return new LRUCache<string, T>(options);
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let lastTime = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastTime >= wait) {
      lastTime = now;
      func(...args);
    }
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function generateId(): string {
  return uuid();
}

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
}

export function parseUserAgent(ua: string) {
  // Simple user agent parsing - in production, use a proper library
  const browser = ua.includes('Chrome') ? 'Chrome' :
                 ua.includes('Firefox') ? 'Firefox' :
                 ua.includes('Safari') ? 'Safari' : 'Unknown';
  
  const os = ua.includes('Windows') ? 'Windows' :
            ua.includes('Mac') ? 'macOS' :
            ua.includes('Linux') ? 'Linux' : 'Unknown';
  
  return { browser, os, userAgent: ua };
}