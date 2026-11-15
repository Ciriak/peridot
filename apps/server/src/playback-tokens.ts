import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PLAYBACK_TOKEN_DURATION_MS = 4 * 60 * 60 * 1000;
const COVER_TOKEN_REUSE_MARGIN_MS = 60 * 1000;
const AUDIO_ROUTE = /^\/api\/tracks\/([^/]+)\/audio$/;
const COVER_ROUTE = /^\/api\/covers\/([^/]+)$/;
const ARTIST_IMAGE_ROUTE = /^\/api\/artists\/([^/]+)\/image$/;

interface PlaybackTokenPayload {
  targetId: string;
  expiresAt: number;
  kind: "audio" | "cover" | "artist-image";
  artistId?: string;
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
  if (url.searchParams.has("artistImageToken")) {
    url.searchParams.set("artistImageToken", "[redacted]");
    changed = true;
  }
  if (!changed) return requestUrl;
  return `${url.pathname}${url.search}`;
}

export class PlaybackTokenService {
  readonly #secret: Buffer;
  readonly #coverTokens = new Map<
    string,
    {
      token: string;
      expiresAt: Date;
    }
  >();

  constructor(secret: Buffer = randomBytes(32)) {
    this.#secret = secret;
  }

  issue(trackId: string, now = Date.now()) {
    return this.issueFor(trackId, "audio", now);
  }

  issueCover(coverId: string, now = Date.now()) {
    if (this.#coverTokens.size > 1_000) {
      for (const [key, token] of this.#coverTokens) {
        if (token.expiresAt.getTime() <= now + COVER_TOKEN_REUSE_MARGIN_MS) {
          this.#coverTokens.delete(key);
        }
      }
    }
    const cached = this.#coverTokens.get(coverId);
    if (
      cached &&
      cached.expiresAt.getTime() > now + COVER_TOKEN_REUSE_MARGIN_MS
    ) {
      return cached;
    }
    const issued = this.issueFor(coverId, "cover", now);
    this.#coverTokens.set(coverId, issued);
    return issued;
  }

  issueArtistImage(artistId: string, now = Date.now()) {
    return this.issueFor(artistId, "artist-image", now);
  }

  private issueFor(
    targetId: string,
    kind: PlaybackTokenPayload["kind"],
    now: number,
  ) {
    const expiresAt = now + PLAYBACK_TOKEN_DURATION_MS;
    const payload = Buffer.from(
      JSON.stringify({
        targetId,
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
    targetId: string,
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
        parsed.targetId === targetId &&
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
    const artistImageMatch = ARTIST_IMAGE_ROUTE.exec(url.pathname);
    const token = audioMatch
      ? url.searchParams.get("playbackToken")
      : coverMatch
        ? url.searchParams.get("coverToken")
        : url.searchParams.get("artistImageToken");
    const match = audioMatch ?? coverMatch ?? artistImageMatch;
    if (!match?.[1] || !token) return false;
    return this.verify(
      token,
      decodeURIComponent(match[1]),
      audioMatch ? "audio" : coverMatch ? "cover" : "artist-image",
      now,
    );
  }
}
