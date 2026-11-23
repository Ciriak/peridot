import { createHash } from "node:crypto";

export interface QbitConnection {
  client: string;
  clientApiKey?: string;
  username?: string;
  password?: string;
}
const sessions = new Map<string, Promise<string>>();
async function login(url: URL, username: string, password: string) {
  const response = await fetch(url, {
    method: "POST",
    body: new URLSearchParams({ username, password }),
    headers: { Origin: url.origin, Referer: url.origin + "/" },
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  const sid = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0]!)
    .find((value) => /^(?:SID|QBT_SID(?:_\d+)?)=.+/.test(value));
  if (!response.ok || !sid) throw new Error("qBittorrent login failed");
  return sid;
}
export async function qbitRequest(
  connection: QbitConnection,
  method: string,
  params: Record<string, string> = {},
  post = false,
): Promise<Response> {
  const url = new URL(
    connection.client.replace(/\/$/, "") + "/api/v2/" + method,
  );
  const body = new URLSearchParams(params);
  if (!post) url.search = body.toString();
  const send = (headers: Record<string, string>) =>
    fetch(url, {
      method: post ? "POST" : "GET",
      body: post ? body : null,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
  let response: Response;
  if (connection.clientApiKey) {
    response = await send({
      Authorization: "Bearer " + connection.clientApiKey,
    });
  } else {
    const { username, password } = connection;
    if (!username || !password)
      throw new Error("Missing qBittorrent credentials");
    const key = createHash("sha256")
      .update(JSON.stringify([connection.client, username, password]))
      .digest("hex");
    const cached = sessions.get(key);
    const authenticate = () => {
      if (sessions.size >= 256) sessions.delete(sessions.keys().next().value!);
      const pending = login(
        new URL(connection.client.replace(/\/$/, "") + "/api/v2/auth/login"),
        username,
        password,
      );
      sessions.set(key, pending);
      pending.catch(() => {
        if (sessions.get(key) === pending) sessions.delete(key);
      });
      return pending;
    };
    const request = async (session: Promise<string>) =>
      send({
        Cookie: await session,
        Origin: url.origin,
        Referer: url.origin + "/",
      });
    response = await request(cached ?? authenticate());
    if (cached && (response.status === 403 || response.status === 401)) {
      if (sessions.get(key) === cached) sessions.delete(key);
      response = await request(sessions.get(key) ?? authenticate());
    }
  }
  if (!response.ok) throw new Error("qBittorrent request failed");
  return response;
}
export async function qbitOptions(connection: QbitConnection) {
  const categories: Record<string, { name: string; savePath: string }> = await (
    await qbitRequest(connection, "torrents/categories")
  ).json();
  const tags: string[] = await (
    await qbitRequest(connection, "torrents/tags")
  ).json();
  return { categories: Object.keys(categories).sort(), tags: tags.sort() };
}
