export interface QbitConnection {
  client: string;
  username: string;
  password: string;
  sessionKey: string;
}
export function createQbitRequester() {
  const cookies = new Map<string, string>();
  async function qb(
    indexer: QbitConnection,
    method: string,
    params: Record<string, string> = {},
    post = false,
    retry = true,
  ): Promise<Response> {
    const url = new URL(
      indexer.client.replace(/\/$/, "") + "/api/v2/" + method,
    );
    const body = new URLSearchParams(params);
    if (!post) url.search = body.toString();
    const response = await fetch(url, {
      method: post ? "POST" : "GET",
      body: post ? body : null,
      headers: {
        Cookie: cookies.get(indexer.sessionKey) || "",
        Origin: url.origin,
        Referer: url.origin + "/",
      },
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 403 && retry) {
      const login = await qb(
        indexer,
        "auth/login",
        {
          username: indexer.username,
          password: indexer.password,
        },
        true,
        false,
      );
      const cookie = login.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      if (!cookie) throw new Error("qBittorrent authentication failed");
      cookies.set(indexer.sessionKey, cookie);
      return qb(indexer, method, params, post, false);
    }
    if (!response.ok) throw new Error("qBittorrent request failed");
    return response;
  }

  return qb;
}
export async function qbitOptions(connection: QbitConnection) {
  const qb = createQbitRequester();
  const categories: Record<string, { name: string; savePath: string }> = await (
    await qb(connection, "torrents/categories")
  ).json();
  const tags: string[] = await (await qb(connection, "torrents/tags")).json();
  return { categories: Object.keys(categories).sort(), tags: tags.sort() };
}
