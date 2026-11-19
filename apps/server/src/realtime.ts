import { createHash, randomBytes } from "node:crypto";
import type {
  LogEntryResponse,
  RealtimeCatalogChangedEvent,
  RealtimeLogAppendedEvent,
  RealtimeServerMessage,
  RealtimeSourceRemovalProgressEvent,
  RealtimeSubscribeRequest,
  RealtimeTaskUpdatedEvent,
  RealtimeTicketResponse,
  RealtimeTopic,
  SourceRemovalProgressResponse,
  TaskResponse,
  UserResponse,
} from "@peridot/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import type { Database } from "./database.js";
import { message as descriptor } from "./messages.js";

const TICKET_TTL_MS = 30_000;
const EVENT_BUFFER_SIZE = 512;
const HEARTBEAT_INTERVAL_MS = 20_000;
const MAX_BUFFERED_BYTES = 256 * 1024;
const ALLOWED_TOPICS = new Set<RealtimeTopic>([
  "tasks",
  "catalog",
  "logs",
  "sources",
]);

export function redactRealtimeTicket(url: string): string {
  return url.replace(
    /([?&]ticket=)[^&]*/i,
    (_match, prefix: string) => `${prefix}[redacted]`,
  );
}

interface TicketRecord {
  sessionId: string;
  user: UserResponse;
  sessionExpiresAt: Date;
  expiresAt: Date;
}

interface ClientState {
  socket: WebSocket;
  sessionId: string;
  user: UserResponse;
  sessionExpiresAt: Date;
  topics: Set<RealtimeTopic>;
  alive: boolean;
  helloSent: boolean;
}

type RealtimeEvent =
  | RealtimeTaskUpdatedEvent
  | RealtimeCatalogChangedEvent
  | RealtimeSourceRemovalProgressEvent
  | RealtimeLogAppendedEvent;

function ticketHash(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}

function topicForEvent(message: RealtimeServerMessage): RealtimeTopic | null {
  if (message.type === "task.updated") return "tasks";
  if (message.type === "catalog.changed") return "catalog";
  if (message.type === "source.removal.progress") return "sources";
  if (message.type === "log.appended") return "logs";
  return null;
}

export class RealtimeHub {
  private readonly tickets = new Map<string, TicketRecord>();
  private readonly clients = new Map<WebSocket, ClientState>();
  private readonly events: RealtimeEvent[] = [];
  private sequence = 0;
  private readonly heartbeat: ReturnType<typeof setInterval>;

  constructor(private readonly database: Database) {
    this.heartbeat = setInterval(
      () => this.checkHeartbeats(),
      HEARTBEAT_INTERVAL_MS,
    );
    this.heartbeat.unref?.();
  }

  async issueTicket(
    sessionId: string,
    user: UserResponse,
  ): Promise<RealtimeTicketResponse> {
    const session = await this.database.orm.Session.first({ id: sessionId });
    if (!session || session.expiresAt <= new Date()) {
      throw new Error("The authenticated session is no longer available.");
    }
    const ticket = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
    this.tickets.set(ticketHash(ticket), {
      sessionId,
      user,
      sessionExpiresAt: session.expiresAt,
      expiresAt,
    });
    this.pruneTickets();
    return { ticket, expiresAt: expiresAt.toISOString() };
  }

  connect(socket: WebSocket, request: FastifyRequest, webOrigins: string[]) {
    const origin = request.headers.origin;
    if (!origin || !webOrigins.includes(origin)) {
      socket.close(4403, "Origin is not allowed");
      return;
    }
    const ticket =
      new URL(request.url, "http://peridot.local").searchParams.get("ticket") ??
      "";
    const key = ticketHash(ticket);
    const record = this.tickets.get(key);
    this.tickets.delete(key);
    if (!ticket || !record || record.expiresAt <= new Date()) {
      socket.close(4401, "A valid realtime ticket is required");
      return;
    }
    if (record.sessionExpiresAt <= new Date()) {
      socket.close(4401, "The session has expired");
      return;
    }
    const state: ClientState = {
      socket,
      sessionId: record.sessionId,
      user: record.user,
      sessionExpiresAt: record.sessionExpiresAt,
      topics: new Set(),
      alive: true,
      helloSent: false,
    };
    this.clients.set(socket, state);
    socket.on("pong", () => {
      state.alive = true;
    });
    socket.on("close", () => {
      this.clients.delete(socket);
    });
    socket.on("error", () => {
      this.clients.delete(socket);
    });
    socket.on("message", (data) => {
      void this.handleMessage(state, data.toString());
    });
  }

  publishTask(task: TaskResponse) {
    this.publish({
      type: "task.updated",
      eventId: this.sequence + 1,
      occurredAt: new Date().toISOString(),
      task,
    });
  }

  publishCatalog(change: {
    revision: number;
    sourceId: string | null;
    reason: RealtimeCatalogChangedEvent["reason"];
    changedCount: number;
  }) {
    this.publish({
      type: "catalog.changed",
      eventId: this.sequence + 1,
      occurredAt: new Date().toISOString(),
      ...change,
    });
  }

  publishLog(entry: LogEntryResponse) {
    this.publish({
      type: "log.appended",
      eventId: this.sequence + 1,
      occurredAt: new Date().toISOString(),
      entry,
    });
  }

  publishSourceRemoval(progress: SourceRemovalProgressResponse) {
    this.publish({
      type: "source.removal.progress",
      eventId: this.sequence + 1,
      occurredAt: new Date().toISOString(),
      ...progress,
    });
  }

  disconnectSession(sessionId: string) {
    for (const state of this.clients.values()) {
      if (state.sessionId !== sessionId) continue;
      state.socket.close(4401, "The session was revoked");
    }
  }

  close() {
    clearInterval(this.heartbeat);
    for (const state of this.clients.values()) {
      state.socket.close(1001, "Peridot is shutting down");
    }
    this.clients.clear();
    this.tickets.clear();
  }

  private publish(message: RealtimeEvent) {
    this.sequence += 1;
    this.events.push(message);
    if (this.events.length > EVENT_BUFFER_SIZE) this.events.shift();
    const topic = topicForEvent(message);
    if (!topic) return;
    for (const client of this.clients.values()) {
      if (client.topics.has(topic)) this.send(client, message);
    }
  }

  private async handleMessage(state: ClientState, raw: string) {
    if (!state.helloSent) {
      state.helloSent = true;
      this.send(state, {
        type: "hello",
        protocolVersion: 1,
        sequence: this.sequence,
      });
    }
    let message: RealtimeSubscribeRequest;
    try {
      message = JSON.parse(raw) as RealtimeSubscribeRequest;
    } catch {
      return this.send(state, {
        type: "error",
        code: "invalid_message",
        messageDescriptor: descriptor("api.message.realtimeInvalidJson"),
      });
    }
    if (
      message?.type !== "subscribe" ||
      !Array.isArray(message.topics) ||
      message.topics.some(
        (topic) => typeof topic !== "string" || !ALLOWED_TOPICS.has(topic),
      )
    ) {
      return this.send(state, {
        type: "error",
        code: "invalid_message",
        messageDescriptor: descriptor("api.message.realtimeTopics"),
      });
    }
    const topics = [...new Set(message.topics)];
    if (
      (topics.includes("logs") || topics.includes("sources")) &&
      state.user.role !== "admin"
    ) {
      return this.send(state, {
        type: "error",
        code: "forbidden_topic",
        messageDescriptor: descriptor(
          topics.includes("sources")
            ? "api.message.realtimeSourcesAdmin"
            : "api.message.realtimeLogsAdmin",
        ),
      });
    }
    state.topics = new Set(topics);
    this.send(state, { type: "subscribed", topics });
    if (message.after !== undefined && message.after !== null) {
      const after = Number(message.after);
      if (!Number.isSafeInteger(after) || after < 0) {
        return this.send(state, {
          type: "error",
          code: "invalid_message",
          messageDescriptor: descriptor("api.message.realtimeSequence"),
        });
      }
      const oldest = this.events[0]?.eventId ?? this.sequence + 1;
      if (after < oldest - 1 || after > this.sequence) {
        return this.send(state, {
          type: "resync.required",
          currentSequence: this.sequence,
        });
      }
      for (const event of this.events) {
        if (event.eventId <= after) continue;
        const topic = topicForEvent(event);
        if (topic && topics.includes(topic)) this.send(state, event);
      }
    }
  }

  private send(state: ClientState, message: RealtimeServerMessage) {
    if (state.socket.readyState !== 1) return;
    if (state.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      state.socket.send(
        JSON.stringify({
          type: "resync.required",
          currentSequence: this.sequence,
        }),
      );
      return;
    }
    state.socket.send(JSON.stringify(message));
  }

  private checkHeartbeats() {
    const now = Date.now();
    for (const state of this.clients.values()) {
      if (state.sessionExpiresAt.getTime() <= now) {
        state.socket.close(4401, "The session has expired");
        continue;
      }
      if (!state.alive) {
        state.socket.terminate();
        continue;
      }
      state.alive = false;
      state.socket.ping();
    }
  }

  private pruneTickets() {
    const now = new Date();
    for (const [key, ticket] of this.tickets) {
      if (ticket.expiresAt <= now) this.tickets.delete(key);
    }
  }
}

export async function registerRealtimeSocket(
  app: FastifyInstance,
  hub: RealtimeHub,
  webOrigins: string[],
) {
  app.get(
    "/api/realtime",
    { websocket: true },
    (socket: WebSocket, request: FastifyRequest) => {
      hub.connect(socket, request, webOrigins);
    },
  );
}

export async function registerRealtimeTicketRoute(
  app: FastifyInstance,
  hub: RealtimeHub,
) {
  app.post("/api/realtime/ticket", async (request, reply) => {
    try {
      return await hub.issueTicket(
        request.authenticatedSessionId!,
        request.authenticatedUser!,
      );
    } catch {
      return reply.code(401).send({
        error: {
          code: "unauthorized",
          messageDescriptor: descriptor("api.message.unauthorized"),
        },
      });
    }
  });
}
