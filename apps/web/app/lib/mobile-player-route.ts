export const MOBILE_PLAYER_QUERY_KEY = "player";
export const MOBILE_PLAYER_QUERY_VALUE = "fullscreen";

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
