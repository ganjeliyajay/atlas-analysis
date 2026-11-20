import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import pg from "pg";

export type LiveEventPayload = {
  id: string;
  eventName: string;
  userId: string | null;
  sessionId: string | null;
  properties: unknown;
  pageUrl: string | null;
  country: string | null;
  device: string | null;
  browser: string | null;
  createdAt: string;
  projectId: string;
  projectName: string;
};

type WireMessage = {
  instanceId: string;
  organizationId: string;
  event: LiveEventPayload;
};

export class LiveEventHub {
  private emitter = new EventEmitter();
  private subscriberCounts = new Map<string, number>();
  private readonly MAX_SUBSCRIBERS_PER_TENANT = 50;
  readonly instanceId = randomUUID();
  private listenerClient: pg.Client | null = null;
  private publisherPool: pg.Pool | null = null;
  private isListening = false;

  constructor(customDatabaseUrl?: string) {
    this.emitter.setMaxListeners(500);
    this.initPostgresListener(customDatabaseUrl);
  }

  private initPostgresListener(customDatabaseUrl?: string) {
    const connStr =
      customDatabaseUrl ||
      process.env.DATABASE_URL_APP ||
      process.env.DATABASE_URL;

    // When no connection string is provided, or in test environment without an explicit customDatabaseUrl, fall back to in-memory
    if (!connStr || (process.env.NODE_ENV === "test" && !customDatabaseUrl)) {
      return;
    }

    try {
      this.publisherPool = new pg.Pool({
        connectionString: connStr,
        max: 2,
        idleTimeoutMillis: 30000,
      });

      const startListener = async () => {
        if (this.isListening) return;
        try {
          const client = new pg.Client({ connectionString: connStr });
          await client.connect();
          await client.query("LISTEN atlas_live_events");
          this.listenerClient = client;
          this.isListening = true;

          client.on("notification", (msg) => {
            if (msg.channel !== "atlas_live_events" || !msg.payload) return;
            try {
              const data = JSON.parse(msg.payload) as WireMessage;
              // Ignore notifications broadcast by this exact instance to avoid double-firing
              if (data.instanceId === this.instanceId) return;

              if (data.organizationId && data.event) {
                this.emitter.emit(this.channel(data.organizationId), data.event);
              }
            } catch {
              // Ignore unparseable wire frames
            }
          });

          client.on("error", () => {
            this.isListening = false;
            try { client.end(); } catch {}
            this.listenerClient = null;
            setTimeout(startListener, 5000);
          });
        } catch {
          this.isListening = false;
          setTimeout(startListener, 10000);
        }
      };

      void startListener();
    } catch {
      // Graceful fallback to local in-memory pub/sub
    }
  }

  async close(): Promise<void> {
    this.isListening = false;
    if (this.listenerClient) {
      try {
        await this.listenerClient.end();
      } catch {}
      this.listenerClient = null;
    }
    if (this.publisherPool) {
      try {
        await this.publisherPool.end();
      } catch {}
      this.publisherPool = null;
    }
    this.emitter.removeAllListeners();
    this.subscriberCounts.clear();
  }

  private channel(organizationId: string): string {
    return `tenant:${organizationId}`;
  }

  /**
   * Publish an ingested event to all live SSE subscribers of that tenant.
   * Dispatches immediately to local clients and broadcasts to other cluster instances via PostgreSQL NOTIFY.
   */
  publish(organizationId: string, event: LiveEventPayload): void {
    if (!organizationId) return;

    // 1. Immediate local dispatch
    this.emitter.emit(this.channel(organizationId), event);

    // 2. Multi-instance broadcast across cluster via PostgreSQL
    if (this.publisherPool) {
      const payload: WireMessage = {
        instanceId: this.instanceId,
        organizationId,
        event,
      };

      const serialized = JSON.stringify(payload);
      // PostgreSQL NOTIFY payload boundary is 8000 bytes
      if (serialized.length <= 7500) {
        this.publisherPool
          .query("SELECT pg_notify('atlas_live_events', $1)", [serialized])
          .catch(() => {
            // Non-fatal; local subscribers were already served
          });
      }
    }
  }

  /**
   * Subscribe an active SSE stream to live events for an organization.
   * Enforces connection limits per tenant and clean unsubscribe teardown.
   */
  subscribe(
    organizationId: string,
    listener: (event: LiveEventPayload) => void
  ): { unsubscribe: () => void; ok: boolean; reason?: string } {
    const ch = this.channel(organizationId);
    const current = this.subscriberCounts.get(ch) ?? 0;

    if (current >= this.MAX_SUBSCRIBERS_PER_TENANT) {
      return {
        ok: false,
        reason: `Maximum concurrent live streams (${this.MAX_SUBSCRIBERS_PER_TENANT}) reached for this organization`,
        unsubscribe: () => {},
      };
    }

    this.subscriberCounts.set(ch, current + 1);
    this.emitter.on(ch, listener);

    let active = true;
    const unsubscribe = () => {
      if (!active) return;
      active = false;
      this.emitter.off(ch, listener);
      const updated = (this.subscriberCounts.get(ch) ?? 1) - 1;
      if (updated <= 0) {
        this.subscriberCounts.delete(ch);
      } else {
        this.subscriberCounts.set(ch, updated);
      }
    };

    return { ok: true, unsubscribe };
  }
}

// Global singleton across hot reloads in dev
const globalForEventHub = globalThis as unknown as {
  atlasEventHub?: LiveEventHub;
};

export const eventHub =
  globalForEventHub.atlasEventHub ?? new LiveEventHub();

if (process.env.NODE_ENV !== "production") {
  globalForEventHub.atlasEventHub = eventHub;
}
