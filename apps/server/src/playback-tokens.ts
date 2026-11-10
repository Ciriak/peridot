import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PLAYBACK_TOKEN_DURATION_MS = 4 * 60 * 60 * 1000;
const AUDIO_ROUTE = /^\/api\/tracks\/([^/]+)\/audio$/;
const COVER_ROUTE = /^\/api\/tracks\/([^/]+)\/cover$/;

interface PlaybackTokenPayload {
  trackId: string;
  expiresAt: number;
  kind: "audio" | "cover";
}

function sign(secret: Buffer, value: string): Buffer {
  return createHmac("sha256", secret).update(value).digest();
}

export function redactPlaybackToken(requestUrl: string): string {
  const url = new URL(requestUrl, "http://peridot.local");
  let changed = false;
  if (url.searchParams.has("playbackToken")) {
    url.searchParams.set("playbackToken", "[redacted]");
    changed = true;
  }
  if (url.searchParams.has("coverToken")) {
    url.searchParams.set("coverToken", "[redacted]");
    changed = true;
  }
  if (!changed) return requestUrl;
  return `${url.pathname}${url.search}`;
}

export class PlaybackTokenService {
  readonly #secret: Buffer;

  constructor(secret: Buffer = randomBytes(32)) {
    this.#secret = secret;
  }

  issue(trackId: string, now = Date.now()) {
    return this.issueFor(trackId, "audio", now);
  }

  issueCover(trackId: string, now = Date.now()) {
    return this.issueFor(trackId, "cover", now);
  }

  private issueFor(
    trackId: string,
    kind: PlaybackTokenPayload["kind"],
    now: number,
  ) {
    const expiresAt = now + PLAYBACK_TOKEN_DURATION_MS;
    const payload = Buffer.from(
      JSON.stringify({
        trackId,
        expiresAt,
        kind,
      } satisfies PlaybackTokenPayload),
    ).toString("base64url");
    return {
      token: `${payload}.${sign(this.#secret, payload).toString("base64url")}`,
      expiresAt: new Date(expiresAt),
    };
  }

  verify(
    token: string,
    trackId: string,
    kind: PlaybackTokenPayload["kind"],
    now = Date.now(),
  ): boolean {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return false;

    const expected = sign(this.#secret, payload);
    const received = Buffer.from(signature, "base64url");
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      return false;
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      ) as Partial<PlaybackTokenPayload>;
      return (
        parsed.trackId === trackId &&
        parsed.kind === kind &&
        typeof parsed.expiresAt === "number" &&
        parsed.expiresAt > now
      );
    } catch {
      return false;
    }
  }

  authorizeRequest(
    method: string,
    requestUrl: string,
    now = Date.now(),
  ): boolean {
    if (method !== "GET" && method !== "HEAD") return false;
    const url = new URL(requestUrl, "http://peridot.local");
    const audioMatch = AUDIO_ROUTE.exec(url.pathname);
    const coverMatch = COVER_ROUTE.exec(url.pathname);
    const token = audioMatch
      ? url.searchParams.get("playbackToken")
      : url.searchParams.get("coverToken");
    const match = audioMatch ?? coverMatch;
    if (!match?.[1] || !token) return false;
    return this.verify(
      token,
      decodeURIComponent(match[1]),
      audioMatch ? "audio" : "cover",
      now,
    );
  }
}
