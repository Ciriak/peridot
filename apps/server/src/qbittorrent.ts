export interface QbitConnection {
  client: string;
  clientApiKey: string;
}
export async function qbitRequest(
  connection: QbitConnection,
  method: string,
  params: Record<string, string> = {},
  post = false,
): Promise<Response> {
  if (!connection.clientApiKey) throw new Error("Missing qBittorrent API key");
  const url = new URL(
    connection.client.replace(/\/$/, "") + "/api/v2/" + method,
  );
  const body = new URLSearchParams(params);
  if (!post) url.search = body.toString();
  const response = await fetch(url, {
    method: post ? "POST" : "GET",
    body: post ? body : null,
    headers: { Authorization: "Bearer " + connection.clientApiKey },
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
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
