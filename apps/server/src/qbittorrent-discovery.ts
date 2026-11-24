import type { ConnectorInstanceDiscoveryCapability } from "./connector-instance-discovery.js";

export const QBITTORRENT_DEFAULT_PORT = 8080;

const QBITTORRENT_WEBUI_META =
  /<meta\b(?=[^>]*\bname=["']description["'])(?=[^>]*\bcontent=["']qBittorrent WebUI["'])[^>]*>/i;
const QBITTORRENT_WEBUI_TITLE =
  /<title>\s*(?:QBT_TR\()?qBittorrent\b[^<]*<\/title>/i;
const QBITTORRENT_WEBUI_ASSET =
  /(?:images\/qbittorrent32\.png|images\/qbittorrent-tray\.svg|alt=["']qBittorrent logo["'])/i;
const MAX_DISCOVERY_PAGE_BYTES = 512 * 1024;

function instanceId(baseUrl: URL): string {
  return `${baseUrl.host}${baseUrl.pathname.replace(/\/+$/, "") || "/"}`;
}

export function createQbittorrentInstanceDiscovery(
  fetchImpl: typeof fetch = fetch,
): ConnectorInstanceDiscoveryCapability {
  return {
    defaultPorts: [QBITTORRENT_DEFAULT_PORT],
    protocols: ["https", "http"],
    async probe(baseUrl, signal) {
      try {
        const response = await fetchImpl(baseUrl, {
          headers: { Accept: "text/html" },
          redirect: "follow",
          signal,
        });
        if (!response.ok) return null;
        const contentType =
          response.headers.get("content-type")?.toLowerCase() ?? "";
        if (contentType && !contentType.includes("text/html")) return null;
        const contentLength = Number(
          response.headers.get("content-length") ?? "0",
        );
        if (
          Number.isFinite(contentLength) &&
          contentLength > MAX_DISCOVERY_PAGE_BYTES
        ) {
          return null;
        }
        const html = await response.text();
        if (
          html.length > MAX_DISCOVERY_PAGE_BYTES ||
          !(
            QBITTORRENT_WEBUI_META.test(html) ||
            (QBITTORRENT_WEBUI_TITLE.test(html) &&
              QBITTORRENT_WEBUI_ASSET.test(html))
          )
        ) {
          return null;
        }
        return {
          id: instanceId(baseUrl),
          label: "qBittorrent",
          version: null,
        };
      } catch {
        return null;
      }
    },
  };
}
