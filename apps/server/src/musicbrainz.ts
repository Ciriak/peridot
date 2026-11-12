import type {
  MessageDescriptor,
  MetadataCandidateResponse,
} from "@peridot/contracts";
import { normalizeArtistCredits } from "./artist-credits.js";
import {
  candidateIdentity,
  type AutomaticMatchResult,
  type MetadataProviderContext,
  type MetadataResolver,
  type MetadataTrackInput,
  MetadataResolverError,
} from "./metadata-resolver.js";
import { message } from "./messages.js";

const MUSICBRAINZ_ORIGIN = "https://musicbrainz.org";
const MUSICBRAINZ_API_ROOT = `${MUSICBRAINZ_ORIGIN}/ws/2/`;
const MUSICBRAINZ_USER_AGENT = "Peridot/0.1.0";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_RETRIES = 2;

interface MusicBrainzClientOptions {
  fetch?: typeof fetch;
  requestIntervalMs?: number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export class MusicBrainzError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
    readonly messageDescriptor?: MessageDescriptor,
  ) {
    super(message);
    this.name = "MusicBrainzError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function positiveInteger(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function durationMs(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function normalizeIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}

function artistCredits(value: unknown): string[] {
  const credits = asArray(value)
    .map(asRecord)
    .filter((credit): credit is Record<string, unknown> => credit !== null)
    .map((credit) => {
      const artist = asRecord(credit.artist);
      return text(credit.name) || text(artist?.name);
    })
    .map((artist) => artist.trim())
    .filter(Boolean);
  return [...new Set(credits)];
}

function candidateFromRecording(
  provider: MetadataProviderContext,
  value: unknown,
): MetadataCandidateResponse | null {
  const recording = asRecord(value);
  if (!recording) return null;
  const id = text(recording.id);
  const title = text(recording.title).trim();
  const artists = artistCredits(recording["artist-credit"]);
  if (!id || !title || !artists.length) return null;
  const release = asArray(recording.releases).map(asRecord).find(Boolean);
  const releaseId = text(release?.id) || null;
  return {
    providerId: provider.id,
    providerKind: provider.kind,
    providerName: provider.name,
    externalTrackId: id,
    externalReleaseId: releaseId,
    title,
    artist: artists.join(", "),
    artists,
    album: text(release?.title).trim() || null,
    discNumber: null,
    trackNumber: null,
    durationMs: durationMs(recording.length),
    score: Number(recording.score ?? 0) || 0,
    sourceUrl: `https://musicbrainz.org/recording/${encodeURIComponent(id)}`,
    details: [],
  };
}

interface ReleaseTrack {
  discNumber: number;
  trackNumber: number;
  recording: Record<string, unknown>;
}

function releaseTracks(value: unknown): ReleaseTrack[] {
  const release = asRecord(value);
  const tracks: ReleaseTrack[] = [];
  for (const [mediaIndex, rawMedia] of asArray(release?.media).entries()) {
    const media = asRecord(rawMedia);
    if (!media) continue;
    const discNumber = positiveInteger(media.position) ?? mediaIndex + 1;
    for (const [trackIndex, rawTrack] of asArray(media.tracks).entries()) {
      const track = asRecord(rawTrack);
      const recording = asRecord(track?.recording);
      if (!recording) continue;
      tracks.push({
        discNumber,
        trackNumber: positiveInteger(track?.position) ?? trackIndex + 1,
        recording,
      });
    }
  }
  return tracks;
}

function releaseMatches(
  value: unknown,
  album: string,
  artist: string,
): boolean {
  const release = asRecord(value);
  if (!release) return false;
  const titleMatches =
    normalizeIdentity(text(release.title)) === normalizeIdentity(album);
  const localArtists = normalizeArtistCredits([artist]).map(normalizeIdentity);
  return (
    titleMatches &&
    artistCredits(release["artist-credit"]).some((credit) =>
      localArtists.includes(normalizeIdentity(credit)),
    )
  );
}

function recordingCandidateFromRelease(
  provider: MetadataProviderContext,
  releaseId: string,
  album: string,
  releaseTrack: ReleaseTrack,
): MetadataCandidateResponse | null {
  const base = candidateFromRecording(
    {
      ...provider,
      // candidateFromRecording only needs identity metadata from the provider.
    },
    {
      ...releaseTrack.recording,
      releases: [{ id: releaseId, title: album }],
    },
  );
  if (!base) return null;
  return {
    ...base,
    externalReleaseId: releaseId,
    album,
    discNumber: releaseTrack.discNumber,
    trackNumber: releaseTrack.trackNumber,
  };
}

function bestReleaseTrack(
  target: MetadataTrackInput,
  tracks: readonly ReleaseTrack[],
): ReleaseTrack | null {
  if (target.discNumber !== null && target.trackNumber !== null) {
    const numbered = tracks.find(
      (track) =>
        track.discNumber === target.discNumber &&
        track.trackNumber === target.trackNumber,
    );
    if (numbered) return numbered;
  }
  const titleMatches = tracks.filter(
    (track) =>
      normalizeIdentity(text(track.recording.title)) ===
      normalizeIdentity(target.title),
  );
  if (titleMatches.length <= 1) return titleMatches[0] ?? null;
  if (target.durationMs !== null) {
    titleMatches.sort((left, right) => {
      const leftDistance = Math.abs(
        (durationMs(left.recording.length) ?? target.durationMs!) -
          target.durationMs!,
      );
      const rightDistance = Math.abs(
        (durationMs(right.recording.length) ?? target.durationMs!) -
          target.durationMs!,
      );
      return leftDistance - rightDistance;
    });
  }
  return titleMatches[0] ?? null;
}

function escapeLucene(value: string): string {
  const special = new Set('+-!(){}[]^"~*?:\\/');
  return [...value]
    .map((character) => (special.has(character) ? `\\${character}` : character))
    .join("");
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("The request was aborted", "AbortError"));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export class MusicBrainzClient {
  private readonly fetcher: typeof fetch;
  private readonly requestIntervalMs: number;
  private readonly sleeper: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;
  private nextRequestAt = 0;

  constructor(options: MusicBrainzClientOptions = {}) {
    this.fetcher = options.fetch ?? fetch;
    this.requestIntervalMs = options.requestIntervalMs ?? 1_000;
    this.sleeper = options.sleep ?? wait;
  }

  async findCandidates(
    provider: MetadataProviderContext,
    contact: string,
    track: MetadataTrackInput,
    query?: string,
    signal?: AbortSignal,
  ): Promise<MetadataCandidateResponse[]> {
    const search = query?.trim()
      ? `${escapeLucene(query.trim())}`
      : `recording:"${escapeLucene(track.title)}" AND artist:"${escapeLucene(track.artist)}"`;
    const response = await this.request(
      contact,
      "recording",
      { query: search, limit: "10" },
      signal,
    );
    const recordings = asArray(asRecord(response)?.recordings)
      .map((recording) => candidateFromRecording(provider, recording))
      .filter(
        (candidate): candidate is MetadataCandidateResponse =>
          candidate !== null,
      );
    return recordings.sort((left, right) => right.score - left.score);
  }

  async findAlbumMatches(
    provider: MetadataProviderContext,
    contact: string,
    targets: readonly MetadataTrackInput[],
    signal?: AbortSignal,
  ): Promise<Map<string, MetadataCandidateResponse[]>> {
    const matches = new Map<string, MetadataCandidateResponse[]>();
    const first = targets[0];
    if (!first?.album) return matches;

    const searchResponse = await this.request(
      contact,
      "release",
      {
        query: `release:"${escapeLucene(first.album)}" AND artist:"${escapeLucene(first.artist)}"`,
        limit: "10",
      },
      signal,
    );
    const release = asArray(asRecord(searchResponse)?.releases)
      .map(asRecord)
      .find(
        (value): value is Record<string, unknown> =>
          value !== null && releaseMatches(value, first.album!, first.artist),
      );
    const releaseId = text(release?.id);
    if (!releaseId) return matches;

    const releaseResponse = await this.request(
      contact,
      `release/${releaseId}`,
      { inc: "recordings+artist-credits" },
      signal,
    );
    const album = text(asRecord(releaseResponse)?.title).trim() || first.album;
    const tracks = releaseTracks(releaseResponse);
    for (const target of targets) {
      const releaseTrack = bestReleaseTrack(target, tracks);
      if (!releaseTrack) continue;
      const candidate = recordingCandidateFromRelease(
        provider,
        releaseId,
        album,
        releaseTrack,
      );
      if (candidate) matches.set(target.id, [candidate]);
    }
    return matches;
  }

  isExactMatch(
    track: MetadataTrackInput,
    candidate: MetadataCandidateResponse,
  ): boolean {
    const titleMatches =
      normalizeIdentity(track.title) === normalizeIdentity(candidate.title);
    const localArtists = normalizeArtistCredits([track.artist]).map(
      normalizeIdentity,
    );
    const artistMatches = candidate.artists.some((artist) =>
      localArtists.includes(normalizeIdentity(artist)),
    );
    return titleMatches && artistMatches;
  }

  private async request(
    contact: string,
    path: string,
    parameters: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const url = new URL(path.replace(/^\//, ""), MUSICBRAINZ_API_ROOT);
    if (url.origin !== MUSICBRAINZ_ORIGIN) {
      throw new MusicBrainzError(
        "MusicBrainz requests must use the official API origin.",
        false,
      );
    }
    url.searchParams.set("fmt", "json");
    for (const [key, value] of Object.entries(parameters)) {
      url.searchParams.set(key, value);
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      await this.rateLimit(signal);
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const requestSignal = signal
        ? AbortSignal.any([signal, timeout])
        : timeout;
      let response: Response;
      try {
        response = await this.fetcher(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": `${MUSICBRAINZ_USER_AGENT} (${contact})`,
          },
          signal: requestSignal,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        if (attempt < MAX_RETRIES) {
          await this.sleeper(1_000 * (attempt + 1), signal);
          continue;
        }
        throw new MusicBrainzError(
          "MusicBrainz could not be reached.",
          true,
          message("api.message.musicbrainzUnavailable"),
        );
      }

      if (response.status === 429 || response.status === 503) {
        if (attempt < MAX_RETRIES) {
          const retryAfter = Number(response.headers.get("retry-after"));
          await this.sleeper(
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1_000
              : 1_000 * (attempt + 1),
            signal,
          );
          continue;
        }
        throw new MusicBrainzError(
          "MusicBrainz is rate limiting requests. Try again later.",
          true,
          message("api.message.musicbrainzRateLimited"),
        );
      }
      if (!response.ok) {
        throw new MusicBrainzError(
          `MusicBrainz rejected the request (${response.status}).`,
          response.status >= 500,
          message(
            response.status >= 500
              ? "api.message.musicbrainzTemporary"
              : "api.message.musicbrainzFailed",
          ),
        );
      }

      const contentLength = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_RESPONSE_BYTES
      ) {
        throw new MusicBrainzError(
          "The MusicBrainz response was too large.",
          false,
        );
      }
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
        throw new MusicBrainzError(
          "The MusicBrainz response was too large.",
          false,
        );
      }
      try {
        return JSON.parse(body) as unknown;
      } catch {
        throw new MusicBrainzError(
          "MusicBrainz returned an invalid response.",
          false,
        );
      }
    }
    throw new MusicBrainzError(
      "MusicBrainz request failed.",
      true,
      message("api.message.musicbrainzFailed"),
    );
  }

  private async rateLimit(signal?: AbortSignal): Promise<void> {
    const delay = this.nextRequestAt - Date.now();
    if (delay > 0) await this.sleeper(delay, signal);
    this.nextRequestAt = Date.now() + this.requestIntervalMs;
  }
}

function normalizedContact(value: unknown): string {
  if (typeof value !== "string") {
    throw new MetadataResolverError(
      "Enter a contact email or HTTP(S) URL for MusicBrainz.",
      400,
      false,
      message("api.message.musicbrainzContactRequired"),
    );
  }
  const contact = value.trim();
  if (!contact || contact.length > 512) {
    throw new MetadataResolverError(
      "Enter a contact email or HTTP(S) URL for MusicBrainz.",
      400,
      false,
      message("api.message.musicbrainzContactRequired"),
    );
  }
  for (const character of contact) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) {
      throw new MetadataResolverError(
        "MusicBrainz contact details cannot contain control characters.",
        400,
        false,
        message("api.message.musicbrainzContactInvalid"),
      );
    }
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return contact.toLowerCase();
  }
  try {
    const url = new URL(contact);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      throw new Error("invalid contact URL");
    }
    return url.toString();
  } catch {
    throw new MetadataResolverError(
      "Enter a valid contact email or HTTP(S) URL for MusicBrainz.",
      400,
      false,
      message("api.message.musicbrainzContactInvalid"),
    );
  }
}

export class MusicBrainzResolver implements MetadataResolver {
  readonly definition = {
    kind: "musicbrainz" as const,
    nameMessage: message("provider.musicbrainz.name"),
    description:
      "Match canonical recordings and releases using a contact User-Agent.",
    descriptionMessage: message("provider.musicbrainz.description"),
    configurationFields: [
      {
        key: "contact",
        labelMessage: message("provider.musicbrainz.contact.label"),
        type: "text" as const,
        required: true,
        placeholderMessage: message("provider.musicbrainz.contact.placeholder"),
        helpMessage: message("provider.musicbrainz.contact.help"),
      },
    ],
    credentialField: null,
    supportsAutomaticMatching: true,
    supportsManualSearch: true,
  };

  constructor(private readonly client = new MusicBrainzClient()) {}

  normalizeConfiguration(value: unknown): Record<string, string> {
    const record =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    return { contact: normalizedContact(record.contact) };
  }

  async validateCredential(): Promise<string> {
    throw new MetadataResolverError(
      "MusicBrainz does not require a credential.",
      400,
      false,
      message("api.message.metadataProviderCredentialUnsupported", {
        provider: "MusicBrainz",
      }),
    );
  }

  findAlbumMatches(
    provider: MetadataProviderContext,
    targets: readonly MetadataTrackInput[],
    signal?: AbortSignal,
  ): Promise<Map<string, MetadataCandidateResponse[]>> {
    return this.client.findAlbumMatches(
      provider,
      this.contact(provider),
      targets,
      signal,
    );
  }

  findCandidates(
    provider: MetadataProviderContext,
    track: MetadataTrackInput,
    query?: string,
    signal?: AbortSignal,
  ): Promise<MetadataCandidateResponse[]> {
    return this.client.findCandidates(
      provider,
      this.contact(provider),
      track,
      query,
      signal,
    );
  }

  automaticMatch(
    track: MetadataTrackInput,
    candidates: readonly MetadataCandidateResponse[],
  ): AutomaticMatchResult {
    const exact = candidates.filter((candidate) =>
      this.client.isExactMatch(track, candidate),
    );
    const unique = [
      ...new Map(
        exact.map((candidate) => [candidateIdentity(candidate), candidate]),
      ).values(),
    ];
    return unique[0]
      ? { status: "matched", candidate: unique[0] }
      : { status: "unmatched" };
  }

  sourceUrl(externalTrackId: string): string {
    return `https://musicbrainz.org/recording/${encodeURIComponent(externalTrackId)}`;
  }

  private contact(provider: MetadataProviderContext): string {
    const value = provider.configuration.contact;
    if (!value) {
      throw new MetadataResolverError(
        "MusicBrainz contact details are missing.",
        409,
        false,
        message("api.message.musicbrainzContactRequired"),
      );
    }
    return value;
  }
}
