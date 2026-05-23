const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      let errorMessage = `API Error: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // Use default error message if JSON parsing fails
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Health endpoints
  async getHealth() {
    return this.request('/health');
  }

  async getReadiness() {
    return this.request('/health/ready');
  }

  // Session endpoints
  async getSessions(params: {
    limit?: number;
    offset?: number;
    sortBy?: 'timestamp' | 'eventCount';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{ sessions: any[]; total: number }> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });

    return this.request(`/sessions?${searchParams}`);
  }

  async getSession(sessionId: string) {
    return this.request(`/sessions/${sessionId}`);
  }

  async getSessionStats(): Promise<any> {
    return this.request('/sessions/stats');
  }

  async searchSessions(query: string) {
    return this.request(`/sessions/search?q=${encodeURIComponent(query)}`);
  }

  async deleteSession(sessionId: string) {
    return this.request(`/sessions/${sessionId}`, { method: 'DELETE' });
  }

  async replaySession(sessionId: string, options: any = {}) {
    return this.request(`/sessions/${sessionId}/replay`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  // Test endpoints
  async getTests(params: {
    limit?: number;
    offset?: number;
    status?: string;
  } = {}) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });
    
    return this.request(`/tests?${searchParams}`);
  }

  async getTest(testId: string) {
    return this.request(`/tests/${testId}`);
  }

  async getTestResult(testId: string) {
    return this.request(`/tests/${testId}/result`);
  }

  async getQueueStatus(): Promise<any> {
    return this.request('/tests/queue');
  }

  async compareScreenshots(baseSessionId: string, headSessionId: string, options: any = {}) {
    return this.request('/tests/compare', {
      method: 'POST',
      body: JSON.stringify({
        baseSessionId,
        headSessionId,
        ...options,
      }),
    });
  }
}

export const api = new ApiClient();