export class StorageCapture {
  private isCapturing = false;
  private originalLocalStorageSetItem?: typeof localStorage.setItem;
  private originalLocalStorageRemoveItem?: typeof localStorage.removeItem;
  private originalLocalStorageClear?: typeof localStorage.clear;
  private originalSessionStorageSetItem?: typeof sessionStorage.setItem;
  private originalSessionStorageRemoveItem?: typeof sessionStorage.removeItem;
  private originalSessionStorageClear?: typeof sessionStorage.clear;

  start(): void {
    if (this.isCapturing) {
      return;
    }

    this.isCapturing = true;
    this.interceptLocalStorage();
    this.interceptSessionStorage();
    this.interceptCookies();
  }

  stop(): void {
    if (!this.isCapturing) {
      return;
    }

    this.isCapturing = false;
    this.restoreLocalStorage();
    this.restoreSessionStorage();
  }

  getStorageSnapshot(): {
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
    cookies: Record<string, string>;
  } {
    return {
      localStorage: this.getLocalStorageSnapshot(),
      sessionStorage: this.getSessionStorageSnapshot(),
      cookies: this.getCookiesSnapshot(),
    };
  }

  private interceptLocalStorage(): void {
    this.originalLocalStorageSetItem = localStorage.setItem;
    this.originalLocalStorageRemoveItem = localStorage.removeItem;
    this.originalLocalStorageClear = localStorage.clear;

    const self = this;

    localStorage.setItem = function(key: string, value: string) {
      self.originalLocalStorageSetItem!.call(this, key, value);
      console.log('[Taka] localStorage.setItem:', key, value);
    };

    localStorage.removeItem = function(key: string) {
      self.originalLocalStorageRemoveItem!.call(this, key);
      console.log('[Taka] localStorage.removeItem:', key);
    };

    localStorage.clear = function() {
      self.originalLocalStorageClear!.call(this);
      console.log('[Taka] localStorage.clear');
    };
  }

  private interceptSessionStorage(): void {
    this.originalSessionStorageSetItem = sessionStorage.setItem;
    this.originalSessionStorageRemoveItem = sessionStorage.removeItem;
    this.originalSessionStorageClear = sessionStorage.clear;

    const self = this;

    sessionStorage.setItem = function(key: string, value: string) {
      self.originalSessionStorageSetItem!.call(this, key, value);
      console.log('[Taka] sessionStorage.setItem:', key, value);
    };

    sessionStorage.removeItem = function(key: string) {
      self.originalSessionStorageRemoveItem!.call(this, key);
      console.log('[Taka] sessionStorage.removeItem:', key);
    };

    sessionStorage.clear = function() {
      self.originalSessionStorageClear!.call(this);
      console.log('[Taka] sessionStorage.clear');
    };
  }

  private interceptCookies(): void {
    // Cookie interception is more complex and would require
    // overriding document.cookie getter/setter
    // For now, we'll just capture the initial state
  }

  private restoreLocalStorage(): void {
    if (this.originalLocalStorageSetItem) {
      localStorage.setItem = this.originalLocalStorageSetItem;
      this.originalLocalStorageSetItem = undefined;
    }
    if (this.originalLocalStorageRemoveItem) {
      localStorage.removeItem = this.originalLocalStorageRemoveItem;
      this.originalLocalStorageRemoveItem = undefined;
    }
    if (this.originalLocalStorageClear) {
      localStorage.clear = this.originalLocalStorageClear;
      this.originalLocalStorageClear = undefined;
    }
  }

  private restoreSessionStorage(): void {
    if (this.originalSessionStorageSetItem) {
      sessionStorage.setItem = this.originalSessionStorageSetItem;
      this.originalSessionStorageSetItem = undefined;
    }
    if (this.originalSessionStorageRemoveItem) {
      sessionStorage.removeItem = this.originalSessionStorageRemoveItem;
      this.originalSessionStorageRemoveItem = undefined;
    }
    if (this.originalSessionStorageClear) {
      sessionStorage.clear = this.originalSessionStorageClear;
      this.originalSessionStorageClear = undefined;
    }
  }

  private getLocalStorageSnapshot(): Record<string, string> {
    const snapshot: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          snapshot[key] = localStorage.getItem(key) || '';
        }
      }
    } catch (error) {
      console.warn('[Taka] Could not access localStorage:', error);
    }
    return snapshot;
  }

  private getSessionStorageSnapshot(): Record<string, string> {
    const snapshot: Record<string, string> = {};
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          snapshot[key] = sessionStorage.getItem(key) || '';
        }
      }
    } catch (error) {
      console.warn('[Taka] Could not access sessionStorage:', error);
    }
    return snapshot;
  }

  private getCookiesSnapshot(): Record<string, string> {
    const snapshot: Record<string, string> = {};
    try {
      const cookies = document.cookie.split(';');
      cookies.forEach(cookie => {
        const [key, value] = cookie.trim().split('=', 2);
        if (key && value) {
          snapshot[key] = decodeURIComponent(value);
        }
      });
    } catch (error) {
      console.warn('[Taka] Could not access cookies:', error);
    }
    return snapshot;
  }
}