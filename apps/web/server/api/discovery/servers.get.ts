import { defineEventHandler, setResponseHeader } from "h3";
import { discoverLocalPeridotServers } from "../../utils/server-discovery";

let cachedDiscovery: Promise<
  Awaited<ReturnType<typeof discoverLocalPeridotServers>>
> | null = null;
let cacheExpiresAt = 0;

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  if (!cachedDiscovery || Date.now() >= cacheExpiresAt) {
    cachedDiscovery = discoverLocalPeridotServers();
    cacheExpiresAt = Date.now() + 10_000;
    cachedDiscovery.catch(() => {
      cachedDiscovery = null;
      cacheExpiresAt = 0;
    });
  }
  return cachedDiscovery;
});
