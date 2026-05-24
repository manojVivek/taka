import type { NetworkRequest } from '@taka/types';
import { generateId } from '@taka/utils';

export class NetworkCapture {
  private isCapturing = false;
  private onNetworkRequest: (request: NetworkRequest) => void;
  private originalFetch?: typeof fetch;
  private originalXHROpen?: typeof XMLHttpRequest.prototype.open;
  private originalXHRSend?: typeof XMLHttpRequest.prototype.send;
  private uploadUrl?: string;

  constructor(onNetworkRequest: (request: NetworkRequest) => void, uploadUrl?: string) {
    this.onNetworkRequest = onNetworkRequest;
    this.uploadUrl = uploadUrl;
  }

  private isOwnUpload(url: string): boolean {
    if (!this.uploadUrl) return false;
    const stripped = url.split('?')[0];
    return stripped === this.uploadUrl;
  }

  start(): void {
    if (this.isCapturing) {
      return;
    }

    this.isCapturing = true;
    this.interceptFetch();
    this.interceptXHR();
  }

  stop(): void {
    if (!this.isCapturing) {
      return;
    }

    this.isCapturing = false;
    this.restoreFetch();
    this.restoreXHR();
  }

  private interceptFetch(): void {
    this.originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      // Skip capturing the recorder's own upload requests
      if (this.isOwnUpload(url)) {
        return this.originalFetch!(input, init);
      }

      const method = init?.method || 'GET';
      const headers = this.extractHeaders(init?.headers);
      const body = init?.body ? this.extractBody(init.body) : undefined;

      const requestId = generateId();
      const timestamp = Date.now();

      const request: NetworkRequest = {
        id: requestId,
        url,
        method,
        headers,
        body,
        timestamp,
      };

      try {
        const response = await this.originalFetch!(input, init);
        
        // Clone response to read body without consuming it
        const responseClone = response.clone();
        const responseBody = await this.extractResponseBody(responseClone);
        const responseHeaders = this.extractResponseHeaders(response.headers);

        request.response = {
          status: response.status,
          headers: responseHeaders,
          body: responseBody,
        };

        this.onNetworkRequest(request);
        return response;
      } catch (error) {
        request.response = {
          status: 0,
          headers: {},
          body: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };

        this.onNetworkRequest(request);
        throw error;
      }
    };
  }

  private interceptXHR(): void {
    const self = this;
    this.originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
      (this as any)._takaRequestId = generateId();
      (this as any)._takaMethod = method;
      (this as any)._takaUrl = url.toString();
      (this as any)._takaTimestamp = Date.now();
      (this as any)._takaHeaders = {};

      return self.originalXHROpen!.call(this, method, url, async ?? true, username, password);
    };

    XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
      const xhr = this;
      const requestId = (xhr as any)._takaRequestId;
      const method = (xhr as any)._takaMethod;
      const url = (xhr as any)._takaUrl;
      const timestamp = (xhr as any)._takaTimestamp;
      const headers = (xhr as any)._takaHeaders || {};

      if (self.isCapturing && requestId && !self.isOwnUpload(url)) {
        const request: NetworkRequest = {
          id: requestId,
          url,
          method,
          headers,
          body: body ? self.extractBody(body as BodyInit) : undefined,
          timestamp,
        };

        xhr.addEventListener('loadend', () => {
          request.response = {
            status: xhr.status,
            headers: self.extractXHRResponseHeaders(xhr),
            body: xhr.responseText || xhr.response,
          };

          self.onNetworkRequest(request);
        });
      }

      return self.originalXHRSend!.call(this, body);
    };

    // Override setRequestHeader to capture headers
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function(name: string, value: string) {
      if (!((this as any)._takaHeaders)) {
        (this as any)._takaHeaders = {};
      }
      (this as any)._takaHeaders[name] = value;
      return originalSetRequestHeader.call(this, name, value);
    };
  }

  private restoreFetch(): void {
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = undefined;
    }
  }

  private restoreXHR(): void {
    if (this.originalXHROpen) {
      XMLHttpRequest.prototype.open = this.originalXHROpen;
      this.originalXHROpen = undefined;
    }
    
    if (this.originalXHRSend) {
      XMLHttpRequest.prototype.send = this.originalXHRSend;
      this.originalXHRSend = undefined;
    }
  }

  private extractHeaders(headers: HeadersInit | undefined): Record<string, string> {
    if (!headers) return {};

    const result: Record<string, string> = {};

    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        result[key] = value;
      });
    } else if (Array.isArray(headers)) {
      headers.forEach(([key, value]) => {
        result[key] = value;
      });
    } else {
      Object.entries(headers).forEach(([key, value]) => {
        result[key] = value;
      });
    }

    return result;
  }

  private extractResponseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  private extractXHRResponseHeaders(xhr: XMLHttpRequest): Record<string, string> {
    const headers: Record<string, string> = {};
    const responseHeaders = xhr.getAllResponseHeaders();
    
    if (responseHeaders) {
      responseHeaders.split('\r\n').forEach(line => {
        const [key, value] = line.split(': ', 2);
        if (key && value) {
          headers[key.toLowerCase()] = value;
        }
      });
    }
    
    return headers;
  }

  private extractBody(body: BodyInit): string | undefined {
    if (!body) return undefined;

    if (typeof body === 'string') {
      return body;
    }

    if (body instanceof FormData) {
      const formObject: Record<string, any> = {};
      body.forEach((value, key) => {
        formObject[key] = value instanceof File ? `[File: ${value.name}]` : value;
      });
      return JSON.stringify(formObject);
    }

    if (body instanceof URLSearchParams) {
      return body.toString();
    }

    if (body instanceof ArrayBuffer || body instanceof Uint8Array) {
      return '[Binary Data]';
    }

    if (body instanceof ReadableStream) {
      return '[ReadableStream]';
    }

    if (body instanceof Blob) {
      return `[Blob: ${body.type}]`;
    }

    return '[Unknown Body Type]';
  }

  private async extractResponseBody(response: Response): Promise<string> {
    try {
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        const json = await response.json();
        return JSON.stringify(json);
      }
      
      if (contentType.includes('text/')) {
        return await response.text();
      }
      
      // For other types, don't try to extract body
      return `[${contentType || 'Binary'}]`;
    } catch (error) {
      return '[Error reading response body]';
    }
  }
}