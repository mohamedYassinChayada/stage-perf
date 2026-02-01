const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

export interface DocumentEvent {
  id: string;
  action: string;
  action_display?: string;
  actor_name?: string;
  actor_email?: string;
  ts: string;
  version_no?: number;
  context?: Record<string, unknown>;
}

interface PollResponse {
  events: DocumentEvent[];
  server_time: string;
  has_more: boolean;
}

type EventCallback = (events: DocumentEvent[]) => void;

class DocumentEventService {
  private intervalId: ReturnType<typeof setTimeout> | null = null;
  private lastCheckTime: string = new Date().toISOString();
  private callbacks: Set<EventCallback> = new Set();
  private currentDocumentId: string | null = null;
  private pollIntervalMs = 5000;
  private consecutiveEmptyPolls = 0;
  private maxPollInterval = 30000;
  private isPaused = false;

  start(documentId: string): void {
    this.stop();
    this.currentDocumentId = documentId;
    this.lastCheckTime = new Date().toISOString();
    this.consecutiveEmptyPolls = 0;
    this.pollIntervalMs = 5000;
    this.isPaused = false;

    this.poll();
    this.scheduleNextPoll();

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    this.currentDocumentId = null;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  subscribe(callback: EventCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.isPaused = true;
      if (this.intervalId) {
        clearTimeout(this.intervalId);
        this.intervalId = null;
      }
    } else {
      this.isPaused = false;
      if (this.currentDocumentId) {
        this.poll();
        this.scheduleNextPoll();
      }
    }
  };

  private scheduleNextPoll(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
    }
    this.intervalId = setTimeout(() => {
      if (!this.isPaused) {
        this.poll();
        this.scheduleNextPoll();
      }
    }, this.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    if (!this.currentDocumentId || this.isPaused) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const url = `${API_BASE_URL}/documents/${this.currentDocumentId}/events/poll/?since=${encodeURIComponent(this.lastCheckTime)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          this.callbacks.forEach(cb => cb([{
            id: 'access-revoked',
            action: 'ACCESS_REVOKED',
            action_display: 'Access Revoked',
            ts: new Date().toISOString(),
            actor_name: 'System'
          }]));
          this.stop();
        }
        return;
      }

      const data: PollResponse = await response.json();
      this.lastCheckTime = data.server_time;

      if (data.events.length > 0) {
        this.consecutiveEmptyPolls = 0;
        this.pollIntervalMs = 5000;
        this.callbacks.forEach(cb => cb(data.events));
      } else {
        this.consecutiveEmptyPolls++;
        if (this.consecutiveEmptyPolls > 5) {
          this.pollIntervalMs = Math.min(this.pollIntervalMs + 2000, this.maxPollInterval);
        }
      }
    } catch (error) {
      console.error('Event polling error:', error);
    }
  }
}

export const documentEventService = new DocumentEventService();
