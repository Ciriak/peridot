export const MOBILE_PLAYER_QUERY_KEY = "player";
export const MOBILE_PLAYER_QUERY_VALUE = "fullscreen";
export const MOBILE_PLAYER_DEEP_LINK = "peridot://player";

export type MobilePlayerRouteQuery = Record<
  string,
  string | number | null | undefined | (string | number | null | undefined)[]
>;

export function isMobilePlayerRoute(query: MobilePlayerRouteQuery): boolean {
  const value = query[MOBILE_PLAYER_QUERY_KEY];
  return Array.isArray(value)
    ? value.includes(MOBILE_PLAYER_QUERY_VALUE)
    : value === MOBILE_PLAYER_QUERY_VALUE;
}

export function mobilePlayerNavigationForLaunchUrl(
  launchUrl: string | null | undefined,
  current: {
    path: string;
    query: MobilePlayerRouteQuery;
    layout?: unknown;
  },
): { path: string; query: MobilePlayerRouteQuery } | null {
  if (!launchUrl) return null;
  try {
    const url = new URL(launchUrl);
    if (
      url.protocol !== "peridot:" ||
      url.hostname !== "player" ||
      !["", "/"].includes(url.pathname)
    ) {
      return null;
    }
  } catch {
    return null;
  }
  const canHostPlayer =
    current.layout === undefined || current.layout === "default";
  const path = canHostPlayer ? current.path : "/";
  if (path === current.path && isMobilePlayerRoute(current.query)) return null;
  return {
    path,
    query: withMobilePlayerRoute(canHostPlayer ? current.query : {}),
  };
}

export function withMobilePlayerRoute(
  query: MobilePlayerRouteQuery,
): MobilePlayerRouteQuery {
  return {
    ...query,
    [MOBILE_PLAYER_QUERY_KEY]: MOBILE_PLAYER_QUERY_VALUE,
  };
}

export function withoutMobilePlayerRoute(
  query: MobilePlayerRouteQuery,
): MobilePlayerRouteQuery {
  const nextQuery = { ...query };
  delete nextQuery[MOBILE_PLAYER_QUERY_KEY];
  return nextQuery;
}
