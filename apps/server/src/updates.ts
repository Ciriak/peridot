import type {
  UpdateChannel,
  UpdateState,
  UpdateStatusResponse,
} from "@peridot/contracts";
import type { UpdateConfig } from "./config.js";
import { PERIDOT_VERSION } from "./version.js";

const GITHUB_API = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;
const STABLE_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;
type BranchUpdateChannel = Exclude<UpdateChannel, "stable" | "local">;
const UPDATE_BRANCHES: Record<BranchUpdateChannel, string> = {
  dev: "dev",
  beta: "master",
};

export type { UpdateConfig };

interface GitHubCommitResponse {
  sha?: unknown;
}

interface GitHubTagResponse {
  name?: unknown;
  commit?: {
    sha?: unknown;
  };
}

export class UpdateError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly messageKey: string;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    messageKey: string,
  ) {
    super(message);
    this.name = "UpdateError";
    this.statusCode = statusCode;
    this.code = code;
    this.messageKey = messageKey;
  }
}

export class UpdateService {
  private checked: UpdateStatusResponse | null = null;
  private checkInFlight: Promise<UpdateStatusResponse> | null = null;

  constructor(
    private readonly config: UpdateConfig,
    private readonly request: typeof fetch = fetch,
  ) {}

  status(): UpdateStatusResponse {
    return (
      this.checked ?? {
        version: PERIDOT_VERSION,
        channel: this.config.channel,
        currentTag: this.config.currentTag,
        currentCommit: this.config.currentCommit,
        latestTag: null,
        latestCommit: null,
        state: "unchecked",
        checkedAt: null,
      }
    );
  }

  check(): Promise<UpdateStatusResponse> {
    if (this.checkInFlight) return this.checkInFlight;
    this.checkInFlight = this.performCheck().finally(() => {
      this.checkInFlight = null;
    });
    return this.checkInFlight;
  }

  private async performCheck(): Promise<UpdateStatusResponse> {
    if (this.config.channel === "local") {
      throw new UpdateError(
        400,
        "update_channel_unavailable",
        "Update checks require a dev, beta, or stable image.",
        "api.message.updateChannelUnavailable",
      );
    }

    const latest =
      this.config.channel === "stable"
        ? await this.latestStableRelease()
        : await this.latestBranchCommit(this.config.channel);
    const state: UpdateState =
      this.config.channel === "stable"
        ? latest.tag === this.config.currentTag ||
          (this.config.currentTag === null &&
            latest.commit === this.config.currentCommit)
          ? "current"
          : "available"
        : latest.commit === this.config.currentCommit
          ? "current"
          : "available";
    this.checked = {
      version: PERIDOT_VERSION,
      channel: this.config.channel,
      currentTag: this.config.currentTag,
      currentCommit: this.config.currentCommit,
      latestTag: latest.tag,
      latestCommit: latest.commit,
      state,
      checkedAt: new Date().toISOString(),
    };
    return this.checked;
  }

  private async latestBranchCommit(
    channel: BranchUpdateChannel,
  ): Promise<{ tag: null; commit: string | null }> {
    const response = await this.githubRequest(
      `/repos/${this.config.repository}/commits/${UPDATE_BRANCHES[channel]}`,
    );
    const body = (await response
      .json()
      .catch(() => null)) as GitHubCommitResponse | null;
    if (typeof body?.sha !== "string" || !body.sha) {
      throw this.invalidResponseError();
    }
    return { tag: null, commit: body.sha };
  }

  private async latestStableRelease(): Promise<{
    tag: string;
    commit: string;
  }> {
    const response = await this.githubRequest(
      `/repos/${this.config.repository}/tags?per_page=100`,
    );
    const body = (await response.json().catch(() => null)) as unknown;
    if (!Array.isArray(body)) throw this.invalidResponseError();
    const releases = body
      .flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const tag = value as GitHubTagResponse;
        const match =
          typeof tag.name === "string"
            ? STABLE_TAG_PATTERN.exec(tag.name)
            : null;
        const commit = tag.commit?.sha;
        return match && typeof commit === "string" && commit
          ? [
              {
                tag: tag.name as string,
                commit,
                major: Number(match[1]),
                minor: Number(match[2]),
                patch: Number(match[3]),
              },
            ]
          : [];
      })
      .sort(
        (left, right) =>
          left.major - right.major ||
          left.minor - right.minor ||
          left.patch - right.patch,
      );
    const latest = releases.at(-1);
    if (!latest) {
      throw new UpdateError(
        502,
        "stable_release_missing",
        "No stable release tag is available.",
        "api.message.stableReleaseMissing",
      );
    }
    return { tag: latest.tag, commit: latest.commit };
  }

  private async githubRequest(pathname: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.request(`${GITHUB_API}${pathname}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `Peridot/${PERIDOT_VERSION}`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new UpdateError(
        502,
        "update_service_unavailable",
        "The update service could not be reached.",
        "api.message.updateServiceUnavailable",
      );
    }
    if (response.status === 404) {
      throw new UpdateError(
        502,
        "update_repository_unavailable",
        "The configured update repository or channel could not be found.",
        "api.message.updateRepositoryUnavailable",
      );
    }
    if (response.status === 403 || response.status === 429) {
      throw new UpdateError(
        502,
        "update_service_rate_limited",
        "The update service is rate limiting requests. Try again later.",
        "api.message.updateServiceRateLimited",
      );
    }
    if (!response.ok) {
      throw new UpdateError(
        502,
        "update_service_failed",
        "The update service returned an unexpected response.",
        "api.message.updateServiceFailed",
      );
    }
    return response;
  }

  private invalidResponseError(): UpdateError {
    return new UpdateError(
      502,
      "update_service_invalid_response",
      "The update service returned an invalid response.",
      "api.message.updateServiceInvalidResponse",
    );
  }
}
