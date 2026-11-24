import type { DownloadClientTorrentStatus } from "@peridot/contracts";
import { qbitRequest, type QbitConnection } from "./qbittorrent.js";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PRESENCE_CACHE_TTL_MS = 15_000;
const PRESENCE_BATCH_SIZE = 50;
const PRESENCE_TIMEOUT_MS = 2_000;

interface CachedPresence {
  expiresAt: number;
  status: DownloadClientTorrentStatus | null;
}

interface QbitTorrent {
  hash: string;
  infohash_v1?: string;
  infohash_v2?: string;
  progress: number;
  state: string;
  tags: string;
}

function base32ToHex(value: string): string | null {
  let bits = "";
  for (const character of value.toUpperCase()) {
    const index = BASE32.indexOf(character);
    if (index < 0) return null;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return bytes.length === 20
    ? bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")
    : null;
}

export function normalizeInfoHash(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(text)) {
    return text.toLowerCase();
  }
  if (/^[a-z2-7]{32}$/i.test(text)) return base32ToHex(text);
  return null;
}

export function magnetInfoHash(value: string | null | undefined) {
  if (!value) return null;
  try {
    const magnet = new URL(value);
    if (magnet.protocol !== "magnet:") return null;
    const hash = magnet.searchParams
      .getAll("xt")
      .find((entry) => entry.toLowerCase().startsWith("urn:btih:"));
    return normalizeInfoHash(hash?.slice("urn:btih:".length));
  } catch {
    return null;
  }
}

export function releaseInfoHash(
  href: string,
  infohash: string | null | undefined,
  magnetUrl: string | null | undefined,
) {
  return (
    normalizeInfoHash(infohash) ??
    magnetInfoHash(magnetUrl) ??
    magnetInfoHash(href)
  );
}

export class TorrentPresenceIndex {
  private readonly cache = new Map<string, Map<string, CachedPresence>>();

  set(
    clientId: string,
    hash: string,
    status: DownloadClientTorrentStatus | null,
  ) {
    const normalized = normalizeInfoHash(hash);
    if (!normalized) return;
    const entries = this.cache.get(clientId) ?? new Map();
    entries.set(normalized, {
      expiresAt: Date.now() + PRESENCE_CACHE_TTL_MS,
      status,
    });
    this.cache.set(clientId, entries);
  }

  async lookup(
    clientId: string,
    connection: QbitConnection,
    hashes: readonly string[],
    onError?: () => void,
  ): Promise<Map<string, DownloadClientTorrentStatus | null>> {
    const normalized = [
      ...new Set(
        hashes
          .map(normalizeInfoHash)
          .filter((hash): hash is string => Boolean(hash)),
      ),
    ];
    const entries = this.cache.get(clientId) ?? new Map();
    this.cache.set(clientId, entries);
    const result = new Map<string, DownloadClientTorrentStatus | null>();
    const missing: string[] = [];
    const now = Date.now();
    for (const hash of normalized) {
      const cached = entries.get(hash);
      if (cached && cached.expiresAt > now) result.set(hash, cached.status);
      else missing.push(hash);
    }

    for (
      let offset = 0;
      offset < missing.length;
      offset += PRESENCE_BATCH_SIZE
    ) {
      const batch = missing.slice(offset, offset + PRESENCE_BATCH_SIZE);
      try {
        const torrents: QbitTorrent[] = await (
          await qbitRequest(
            connection,
            "torrents/info",
            { hashes: batch.join("|") },
            false,
            PRESENCE_TIMEOUT_MS,
          )
        ).json();
        const found = new Map<string, DownloadClientTorrentStatus>();
        for (const torrent of torrents) {
          const status = {
            hash: torrent.hash,
            state: torrent.state,
            progress: torrent.progress,
            taskId: null,
          } satisfies DownloadClientTorrentStatus;
          for (const value of [
            torrent.hash,
            torrent.infohash_v1,
            torrent.infohash_v2,
          ]) {
            const hash = normalizeInfoHash(value);
            if (hash) found.set(hash, status);
          }
        }
        for (const hash of batch) {
          const status = found.get(hash) ?? null;
          result.set(hash, status);
          this.set(clientId, hash, status);
        }
      } catch {
        onError?.();
        break;
      }
    }
    return result;
  }
}
