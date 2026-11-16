export interface AndroidWebUpdateManifest {
  version: string;
  url: string;
  checksum: string;
  sessionKey: string;
  minimumNativeVersion: string;
}

interface GitHubReleaseAsset {
  name?: unknown;
  url?: unknown;
}

function versionParts(value: string): {
  core: number[];
  prerelease: string[];
} | null {
  const normalized = value.trim().replace(/^v/, "").split("+", 1)[0]!;
  const [core, prerelease = ""] = normalized.split("-", 2);
  const numeric = core?.split(".").map(Number);
  if (
    !numeric ||
    numeric.length !== 3 ||
    numeric.some((part) => !Number.isSafeInteger(part) || part < 0)
  ) {
    return null;
  }
  return {
    core: numeric,
    prerelease: prerelease ? prerelease.split(".") : [],
  };
}

export function compareClientVersions(
  left: string,
  right: string,
): number | null {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  if (!leftParts || !rightParts) return null;
  for (let index = 0; index < 3; index += 1) {
    const difference =
      (leftParts.core[index] ?? 0) - (rightParts.core[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  if (!leftParts.prerelease.length && !rightParts.prerelease.length) return 0;
  if (!leftParts.prerelease.length) return 1;
  if (!rightParts.prerelease.length) return -1;
  for (
    let index = 0;
    index < Math.max(leftParts.prerelease.length, rightParts.prerelease.length);
    index += 1
  ) {
    const leftPart = leftParts.prerelease[index];
    const rightPart = rightParts.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null;
    if (leftNumber !== null && rightNumber !== null) {
      return leftNumber < rightNumber ? -1 : 1;
    }
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return leftPart.localeCompare(rightPart) < 0 ? -1 : 1;
  }
  return 0;
}

function trustedBundleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "github.com" ||
        url.hostname.endsWith(".githubusercontent.com") ||
        url.hostname === "release-assets.githubusercontent.com")
    );
  } catch {
    return false;
  }
}

export function parseAndroidWebUpdateManifest(
  value: unknown,
): AndroidWebUpdateManifest | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AndroidWebUpdateManifest>;
  if (
    typeof candidate.version !== "string" ||
    !versionParts(candidate.version) ||
    typeof candidate.url !== "string" ||
    !trustedBundleUrl(candidate.url) ||
    typeof candidate.checksum !== "string" ||
    !candidate.checksum ||
    typeof candidate.sessionKey !== "string" ||
    !candidate.sessionKey ||
    typeof candidate.minimumNativeVersion !== "string" ||
    !versionParts(candidate.minimumNativeVersion)
  ) {
    return null;
  }
  return {
    version: candidate.version,
    url: candidate.url,
    checksum: candidate.checksum,
    sessionKey: candidate.sessionKey,
    minimumNativeVersion: candidate.minimumNativeVersion,
  };
}

export function androidManifestAssetUrl(release: unknown): string | null {
  if (!release || typeof release !== "object") return null;
  const assets = (release as { assets?: unknown }).assets;
  if (!Array.isArray(assets)) return null;
  const manifest = assets.find((asset): asset is GitHubReleaseAsset =>
    Boolean(
      asset &&
      typeof asset === "object" &&
      (asset as GitHubReleaseAsset).name === "android-web-manifest.json",
    ),
  );
  if (typeof manifest?.url !== "string") return null;
  try {
    const url = new URL(manifest.url);
    return url.protocol === "https:" &&
      url.hostname === "api.github.com" &&
      /\/releases\/assets\/\d+$/.test(url.pathname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function shouldInstallAndroidWebUpdate(
  currentVersion: string,
  nativeVersion: string,
  manifest: AndroidWebUpdateManifest,
): boolean {
  const bundleComparison = compareClientVersions(
    manifest.version,
    currentVersion,
  );
  const compatibilityComparison = compareClientVersions(
    nativeVersion,
    manifest.minimumNativeVersion,
  );
  return (
    bundleComparison !== null &&
    bundleComparison > 0 &&
    compatibilityComparison !== null &&
    compatibilityComparison >= 0
  );
}
