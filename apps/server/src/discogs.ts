import type {
  MetadataCandidateResponse,
  TrackMetadataDetail,
} from "@peridot/contracts";
import { normalizeArtistCredits } from "./artist-credits.js";
import {
  type ArtistMetadataProviderCandidate,
  candidateIdentity,
  type AutomaticMatchResult,
  type MetadataProviderContext,
  type MetadataResolver,
  type MetadataTrackInput,
  MetadataResolverError,
} from "./metadata-resolver.js";
import { message } from "./messages.js";

const DISCOGS_ORIGIN = "https://api.discogs.com";
const DISCOGS_USER_AGENT = "Peridot/0.1.0";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_RETRIES = 2;
const SEARCH_LIMIT = 10;
const RELEASE_DETAIL_LIMIT = 5;
const RELEASE_CACHE_LIMIT = 200;

interface DiscogsClientOptions {
  fetch?: typeof fetch;
  requestIntervalMs?: number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

interface DiscogsIdentity {
  username: string;
}

interface DiscogsArtist {
  id?: number | undefined;
  name?: string | undefined;
}

interface DiscogsLabel {
  name?: string | undefined;
  catno?: string | undefined;
}

interface DiscogsFormat {
  name?: string | undefined;
  descriptions?: string[] | undefined;
}

interface DiscogsTrack {
  position?: string | undefined;
  type_?: string | undefined;
  title?: string | undefined;
  duration?: string | undefined;
  artists?: DiscogsArtist[] | undefined;
}

interface DiscogsRelease {
  id: number;
  title: string;
  year?: number | undefined;
  country?: string | undefined;
  genres?: string[] | undefined;
  styles?: string[] | undefined;
  labels?: DiscogsLabel[] | undefined;
  formats?: DiscogsFormat[] | undefined;
  artists: DiscogsArtist[];
  tracklist: DiscogsTrack[];
}

interface DiscogsArtistProfile {
  id: number;
  name: string;
  imageUrl: string | null;
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
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function artistNames(value: unknown): string[] {
  return unique(
    asArray(value)
      .map(asRecord)
      .filter((artist): artist is Record<string, unknown> => artist !== null)
      .map((artist) => text(artist.name)),
  );
}

function parseRelease(value: unknown): DiscogsRelease | null {
  const release = asRecord(value);
  const id = positiveInteger(release?.id);
  const title = text(release?.title);
  const artists = artistNames(release?.artists);
  if (!release || !id || !title || !artists.length) return null;
  return {
    id,
    title,
    year: positiveInteger(release.year) ?? undefined,
    country: text(release.country) || undefined,
    genres: asArray(release.genres).map(text).filter(Boolean),
    styles: asArray(release.styles).map(text).filter(Boolean),
    labels: asArray(release.labels)
      .map(asRecord)
      .filter((label): label is Record<string, unknown> => label !== null)
      .map((label) => ({
        name: text(label.name) || undefined,
        catno: text(label.catno) || undefined,
      })),
    formats: asArray(release.formats)
      .map(asRecord)
      .filter((format): format is Record<string, unknown> => format !== null)
      .map((format) => ({
        name: text(format.name) || undefined,
        descriptions: asArray(format.descriptions).map(text).filter(Boolean),
      })),
    artists: artists.map((name) => ({ name })),
    tracklist: asArray(release.tracklist)
      .map(asRecord)
      .filter((track): track is Record<string, unknown> => track !== null)
      .map((track) => ({
        position: text(track.position) || undefined,
        type_: text(track.type_) || undefined,
        title: text(track.title) || undefined,
        duration: text(track.duration) || undefined,
        artists: asArray(track.artists)
          .map(asRecord)
          .filter(
            (artist): artist is Record<string, unknown> => artist !== null,
          )
          .map((artist) => ({ name: text(artist.name) })),
      })),
  };
}

function parseArtistProfile(value: unknown): DiscogsArtistProfile | null {
  const artist = asRecord(value);
  const id = positiveInteger(artist?.id);
  const name = text(artist?.name);
  if (!artist || !id || !name) return null;
  const images = asArray(artist.images)
    .map(asRecord)
    .filter((image): image is Record<string, unknown> => image !== null);
  const primary =
    images.find((image) => text(image.type).toLowerCase() === "primary") ??
    images[0];
  const candidateUrl = text(primary?.uri) || text(primary?.uri150);
  let imageUrl: string | null = null;
  if (candidateUrl) {
    try {
      const url = new URL(candidateUrl);
      if (url.protocol === "https:" && !url.username && !url.password) {
        imageUrl = url.toString();
      }
    } catch {
      imageUrl = null;
    }
  }
  return { id, name, imageUrl };
}

function parseDuration(value: string | undefined): number | null {
  if (!value) return null;
  const parts = value.split(":");
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((part) => !/^\d+$/.test(part))
  ) {
    return null;
  }
  const seconds = parts.map(Number).reduce((total, part) => total * 60 + part);
  return Number.isFinite(seconds) ? seconds * 1_000 : null;
}

function releaseDetails(release: DiscogsRelease): TrackMetadataDetail[] {
  const label = unique(
    (release.labels ?? []).flatMap((item) => (item.name ? [item.name] : [])),
  ).join(", ");
  const catalogNumber = unique(
    (release.labels ?? []).flatMap((item) => (item.catno ? [item.catno] : [])),
  ).join(", ");
  const format = unique(
    (release.formats ?? []).flatMap((item) =>
      item.name
        ? [[item.name, ...(item.descriptions ?? [])].filter(Boolean).join(", ")]
        : [],
    ),
  ).join("; ");
  return [
    release.year
      ? {
          key: "year",
          value: String(release.year),
          labelMessage: message("metadata.detail.year"),
        }
      : null,
    label
      ? {
          key: "label",
          value: label,
          labelMessage: message("metadata.detail.label"),
        }
      : null,
    catalogNumber
      ? {
          key: "catalogNumber",
          value: catalogNumber,
          labelMessage: message("metadata.detail.catalogNumber"),
        }
      : null,
    release.country
      ? {
          key: "country",
          value: release.country,
          labelMessage: message("metadata.detail.country"),
        }
      : null,
    format
      ? {
          key: "format",
          value: format,
          labelMessage: message("metadata.detail.format"),
        }
      : null,
  ].filter((detail): detail is TrackMetadataDetail => detail !== null);
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

function releaseIdentityMatches(
  release: DiscogsRelease,
  album: string,
  artist: string,
): boolean {
  const normalizedAlbum = normalizeIdentity(album);
  const normalizedArtist = normalizeIdentity(artist);
  return (
    normalizeIdentity(release.title) === normalizedAlbum &&
    release.artists.some(
      (releaseArtist) =>
        normalizeIdentity(releaseArtist.name ?? "") === normalizedArtist,
    )
  );
}

function releaseCandidate(
  provider: MetadataProviderContext,
  release: DiscogsRelease,
  trackIndex: number,
  score: number,
): MetadataCandidateResponse | null {
  const track = release.tracklist[trackIndex];
  if (!track?.title) return null;
  const artists = normalizeArtistCredits([
    ...artistNames(track.artists),
    ...release.artists.map((artist) => artist.name),
  ]);
  const albumArtists = normalizeArtistCredits(
    release.artists.map((artist) => artist.name),
  );
  if (!artists.length) return null;
  const position = track.position?.trim() || null;
  const discTrack = position?.match(/^(\d+)[-.](\d+)$/);
  const numericPosition = position?.match(/^\d+$/);
  const playableTrackNumber = release.tracklist
    .slice(0, trackIndex + 1)
    .filter((item) => item.type_ === "track").length;
  return {
    providerId: provider.id,
    providerKind: provider.kind,
    providerName: provider.name,
    externalTrackId: `${release.id}:${trackIndex}`,
    externalReleaseId: String(release.id),
    title: track.title,
    artist: artists.join(", "),
    artists,
    albumArtists,
    album: release.title,
    genres: unique([...(release.genres ?? []), ...(release.styles ?? [])]),
    discNumber: discTrack ? Number(discTrack[1]) : 1,
    trackNumber: discTrack
      ? Number(discTrack[2])
      : numericPosition
        ? Number(numericPosition[0])
        : playableTrackNumber,
    durationMs: parseDuration(track.duration),
    score,
    sourceUrl: `https://www.discogs.com/release/${release.id}`,
    details: [
      ...releaseDetails(release),
      ...(position
        ? [
            {
              key: "trackPosition",
              value: position,
              labelMessage: message("metadata.detail.discogsPosition"),
            },
          ]
        : []),
    ],
  };
}

function trackCandidates(
  provider: MetadataProviderContext,
  release: DiscogsRelease,
  target: MetadataTrackInput,
  scoreStart: number,
): MetadataCandidateResponse[] {
  const titleMatches = release.tracklist.flatMap((track, index) =>
    track.type_ === "track" &&
    normalizeIdentity(track.title ?? "") === normalizeIdentity(target.title)
      ? [{ track, index }]
      : [],
  );
  if (titleMatches.length <= 1) {
    return titleMatches.flatMap(({ index }) => {
      const candidate = releaseCandidate(provider, release, index, scoreStart);
      return candidate ? [candidate] : [];
    });
  }
  titleMatches.sort((left, right) => {
    const leftCandidate = releaseCandidate(
      provider,
      release,
      left.index,
      scoreStart,
    );
    const rightCandidate = releaseCandidate(
      provider,
      release,
      right.index,
      scoreStart,
    );
    if (target.trackNumber !== null) {
      const leftExact =
        leftCandidate?.trackNumber === target.trackNumber ? 0 : 1;
      const rightExact =
        rightCandidate?.trackNumber === target.trackNumber ? 0 : 1;
      if (leftExact !== rightExact) return leftExact - rightExact;
    }
    if (target.durationMs !== null) {
      const leftDistance =
        leftCandidate?.durationMs === null ||
        leftCandidate?.durationMs === undefined
          ? Number.MAX_SAFE_INTEGER
          : Math.abs(leftCandidate.durationMs - target.durationMs);
      const rightDistance =
        rightCandidate?.durationMs === null ||
        rightCandidate?.durationMs === undefined
          ? Number.MAX_SAFE_INTEGER
          : Math.abs(rightCandidate.durationMs - target.durationMs);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    }
    return left.index - right.index;
  });
  const candidate = releaseCandidate(
    provider,
    release,
    titleMatches[0]!.index,
    scoreStart,
  );
  return candidate ? [candidate] : [];
}

export class DiscogsClient {
  private readonly fetcher: typeof fetch;
  private readonly requestIntervalMs: number;
  private readonly sleeper: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;
  private readonly releaseCache = new Map<number, DiscogsRelease>();
  private readonly artistCache = new Map<number, DiscogsArtistProfile | null>();
  private nextRequestAt = 0;

  constructor(options: DiscogsClientOptions = {}) {
    this.fetcher = options.fetch ?? fetch;
    this.requestIntervalMs = options.requestIntervalMs ?? 1_000;
    this.sleeper = options.sleep ?? wait;
  }

  async identity(
    credential: string,
    signal?: AbortSignal,
  ): Promise<DiscogsIdentity> {
    const body = asRecord(
      await this.request(credential, "oauth/identity", {}, signal),
    );
    const username = text(body?.username);
    if (!username) {
      throw new MetadataResolverError(
        "Discogs returned an invalid identity response.",
        502,
      );
    }
    return { username };
  }

  async searchReleases(
    credential: string,
    parameters: { query?: string; artist?: string; album?: string },
    signal?: AbortSignal,
  ): Promise<DiscogsRelease[]> {
    const search = new URLSearchParams({
      type: "release",
      per_page: String(SEARCH_LIMIT),
    });
    if (parameters.query) search.set("q", parameters.query);
    if (parameters.artist) search.set("artist", parameters.artist);
    if (parameters.album) search.set("release_title", parameters.album);
    const body = asRecord(
      await this.request(
        credential,
        "database/search",
        Object.fromEntries(search),
        signal,
      ),
    );
    const results = asArray(body?.results)
      .map(asRecord)
      .filter((result): result is Record<string, unknown> => result !== null)
      .flatMap((result) => {
        const id = positiveInteger(result.id);
        return id ? [id] : [];
      })
      .slice(0, RELEASE_DETAIL_LIMIT);
    const releases: DiscogsRelease[] = [];
    for (const id of results) {
      const release = await this.release(credential, id, signal);
      if (release) releases.push(release);
    }
    return releases;
  }

  async findArtistCandidates(
    provider: MetadataProviderContext,
    credential: string,
    artistName: string,
    query?: string,
    signal?: AbortSignal,
  ): Promise<ArtistMetadataProviderCandidate[]> {
    const search = new URLSearchParams({
      type: "artist",
      q: query?.trim() || artistName,
      per_page: String(SEARCH_LIMIT),
    });
    const body = asRecord(
      await this.request(
        credential,
        "database/search",
        Object.fromEntries(search),
        signal,
      ),
    );
    const ids = asArray(body?.results)
      .map(asRecord)
      .filter((result): result is Record<string, unknown> => result !== null)
      .flatMap((result) => {
        const id = positiveInteger(result.id);
        return id ? [id] : [];
      })
      .slice(0, RELEASE_DETAIL_LIMIT);
    const candidates: ArtistMetadataProviderCandidate[] = [];
    for (const id of ids) {
      const artist = await this.artist(credential, id, signal);
      if (!artist) continue;
      candidates.push({
        providerId: provider.id,
        providerKind: provider.kind,
        providerName: provider.name,
        externalArtistId: String(artist.id),
        name: artist.name,
        disambiguation: null,
        score: 0,
        sourceUrl: `https://www.discogs.com/artist/${encodeURIComponent(String(artist.id))}`,
        portraitAvailable: Boolean(artist.imageUrl),
        imageUrl: artist.imageUrl,
      });
    }
    return candidates;
  }

  async resolveArtistCandidate(
    provider: MetadataProviderContext,
    credential: string,
    externalArtistId: string,
    signal?: AbortSignal,
  ): Promise<ArtistMetadataProviderCandidate | null> {
    const id = positiveInteger(externalArtistId);
    if (!id) return null;
    const artist = await this.artist(credential, id, signal);
    return artist
      ? {
          providerId: provider.id,
          providerKind: provider.kind,
          providerName: provider.name,
          externalArtistId: String(artist.id),
          name: artist.name,
          disambiguation: null,
          score: 100,
          sourceUrl: `https://www.discogs.com/artist/${id}`,
          portraitAvailable: Boolean(artist.imageUrl),
          imageUrl: artist.imageUrl,
        }
      : null;
  }

  private async artist(
    credential: string,
    id: number,
    signal?: AbortSignal,
  ): Promise<DiscogsArtistProfile | null> {
    if (this.artistCache.has(id)) return this.artistCache.get(id) ?? null;
    const artist = parseArtistProfile(
      await this.request(credential, `artists/${id}`, {}, signal),
    );
    if (this.artistCache.size >= RELEASE_CACHE_LIMIT) {
      const oldest = this.artistCache.keys().next().value as number | undefined;
      if (oldest !== undefined) this.artistCache.delete(oldest);
    }
    this.artistCache.set(id, artist);
    return artist;
  }

  private async release(
    credential: string,
    id: number,
    signal?: AbortSignal,
  ): Promise<DiscogsRelease | null> {
    if (this.releaseCache.has(id)) return this.releaseCache.get(id)!;
    const release = parseRelease(
      await this.request(credential, `releases/${id}`, {}, signal),
    );
    if (!release) return null;
    if (this.releaseCache.size >= RELEASE_CACHE_LIMIT) {
      const oldest = this.releaseCache.keys().next().value as
        number | undefined;
      if (oldest !== undefined) this.releaseCache.delete(oldest);
    }
    this.releaseCache.set(id, release);
    return release;
  }

  private async request(
    credential: string,
    path: string,
    parameters: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const url = new URL(path.replace(/^\//, ""), `${DISCOGS_ORIGIN}/`);
    if (url.origin !== DISCOGS_ORIGIN) {
      throw new MetadataResolverError(
        "Discogs requests must use the official API origin.",
        400,
        false,
      );
    }
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
            Authorization: `Discogs token=${credential}`,
            "User-Agent": DISCOGS_USER_AGENT,
          },
          signal: requestSignal,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        if (attempt < MAX_RETRIES) {
          await this.sleeper(1_000 * (attempt + 1), signal);
          continue;
        }
        throw new MetadataResolverError(
          "Discogs could not be reached.",
          502,
          true,
          message("api.message.discogsUnavailable"),
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new MetadataResolverError(
          "Discogs rejected the access token.",
          400,
          false,
          message("api.message.discogsTokenRejected"),
        );
      }
      if (response.status === 429 || response.status >= 500) {
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
        throw new MetadataResolverError(
          response.status === 429
            ? "Discogs is rate limiting requests. Try again later."
            : "Discogs is temporarily unavailable.",
          502,
          true,
          message(
            response.status === 429
              ? "api.message.discogsRateLimited"
              : "api.message.discogsTemporary",
          ),
        );
      }
      if (!response.ok) {
        throw new MetadataResolverError(
          `Discogs rejected the request (${response.status}).`,
          response.status >= 500 ? 502 : 400,
          response.status >= 500,
          message("api.message.discogsFailed"),
        );
      }

      const contentLength = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_RESPONSE_BYTES
      ) {
        throw new MetadataResolverError(
          "The Discogs response was too large.",
          502,
          false,
        );
      }
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
        throw new MetadataResolverError(
          "The Discogs response was too large.",
          502,
          false,
        );
      }
      try {
        return JSON.parse(body) as unknown;
      } catch {
        throw new MetadataResolverError(
          "Discogs returned an invalid response.",
          502,
          false,
        );
      }
    }
    throw new MetadataResolverError(
      "Discogs request failed.",
      502,
      true,
      message("api.message.discogsFailed"),
    );
  }

  private async rateLimit(signal?: AbortSignal): Promise<void> {
    const delay = this.nextRequestAt - Date.now();
    if (delay > 0) await this.sleeper(delay, signal);
    this.nextRequestAt = Date.now() + this.requestIntervalMs;
  }
}

export class DiscogsResolver implements MetadataResolver {
  readonly definition = {
    kind: "discogs" as const,
    nameMessage: message("provider.discogs.name"),
    description:
      "Match releases and edition details with a personal access token.",
    descriptionMessage: message("provider.discogs.description"),
    configurationFields: [],
    credentialField: {
      key: "token",
      labelMessage: message("provider.discogs.token.label"),
      type: "password" as const,
      required: true,
      placeholderMessage: message("provider.discogs.token.placeholder"),
      helpMessage: message("provider.discogs.token.help"),
    },
    supportsAutomaticMatching: true,
    supportsManualSearch: true,
  };

  constructor(private readonly client = new DiscogsClient()) {}

  normalizeConfiguration(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object") return {};
    const values = Object.values(value as Record<string, unknown>);
    if (values.some((item) => typeof item !== "string" || item.trim())) {
      throw new MetadataResolverError(
        "Discogs does not accept provider configuration fields.",
        400,
        false,
      );
    }
    return {};
  }

  async validateCredential(
    _provider: MetadataProviderContext,
    credential: string,
    signal?: AbortSignal,
  ): Promise<string> {
    return (await this.client.identity(credential, signal)).username;
  }

  async findAlbumMatches(
    provider: MetadataProviderContext,
    targets: readonly MetadataTrackInput[],
    signal?: AbortSignal,
  ): Promise<Map<string, MetadataCandidateResponse[]>> {
    const matches = new Map<string, MetadataCandidateResponse[]>();
    const first = targets[0];
    if (!first?.album || !provider.credential) return matches;
    const releases = (
      await this.client.searchReleases(
        provider.credential,
        { artist: first.artist, album: first.album },
        signal,
      )
    ).filter((release) =>
      releaseIdentityMatches(release, first.album!, first.artist),
    );
    for (const target of targets) {
      const candidates = releases.flatMap((release, index) =>
        trackCandidates(provider, release, target, 100 - index),
      );
      if (candidates.length) matches.set(target.id, candidates);
    }
    return matches;
  }

  async findCandidates(
    provider: MetadataProviderContext,
    track: MetadataTrackInput,
    query?: string,
    signal?: AbortSignal,
  ): Promise<MetadataCandidateResponse[]> {
    if (!provider.credential) {
      throw new MetadataResolverError(
        "The Discogs access token is missing.",
        409,
        false,
        message("api.message.discogsTokenRequired"),
      );
    }
    const releases = await this.client.searchReleases(
      provider.credential,
      query
        ? { query }
        : track.album
          ? { artist: track.artist, album: track.album }
          : { query: `${track.title} ${track.artist}` },
      signal,
    );
    return releases.flatMap((release, index) =>
      trackCandidates(provider, release, track, 100 - index),
    );
  }

  async findArtistCandidates(
    provider: MetadataProviderContext,
    artistName: string,
    query?: string,
    signal?: AbortSignal,
  ): Promise<ArtistMetadataProviderCandidate[]> {
    if (!provider.credential) {
      throw new MetadataResolverError(
        "The Discogs access token is missing.",
        409,
        false,
        message("api.message.discogsTokenRequired"),
      );
    }
    return this.client.findArtistCandidates(
      provider,
      provider.credential,
      artistName,
      query,
      signal,
    );
  }

  async resolveArtistCandidate(
    provider: MetadataProviderContext,
    externalArtistId: string,
    signal?: AbortSignal,
  ): Promise<ArtistMetadataProviderCandidate | null> {
    if (!provider.credential) {
      throw new MetadataResolverError(
        "The Discogs access token is missing.",
        409,
        false,
        message("api.message.discogsTokenRequired"),
      );
    }
    return this.client.resolveArtistCandidate(
      provider,
      provider.credential,
      externalArtistId,
      signal,
    );
  }

  automaticMatch(
    track: MetadataTrackInput,
    candidates: readonly MetadataCandidateResponse[],
  ): AutomaticMatchResult {
    const normalizedTitle = normalizeIdentity(track.title);
    const normalizedArtist = normalizeIdentity(track.artist);
    const exact = candidates.filter(
      (candidate) =>
        normalizeIdentity(candidate.title) === normalizedTitle &&
        candidate.artists.some(
          (artist) => normalizeIdentity(artist) === normalizedArtist,
        ),
    );
    const uniqueCandidates = [
      ...new Map(
        exact.map((candidate) => [candidateIdentity(candidate), candidate]),
      ).values(),
    ];
    if (uniqueCandidates.length === 1) {
      return { status: "matched", candidate: uniqueCandidates[0]! };
    }
    return uniqueCandidates.length
      ? { status: "ambiguous" }
      : { status: "unmatched" };
  }

  sourceUrl(
    _externalTrackId: string,
    externalReleaseId: string | null,
  ): string {
    return externalReleaseId
      ? `https://www.discogs.com/release/${encodeURIComponent(externalReleaseId)}`
      : "https://www.discogs.com/";
  }
}
