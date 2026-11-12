import { localizedError } from "./messages.ts";

export const DEFAULT_SERVER_ADDRESS = "http://127.0.0.1:17430";

export function normalizeServerAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw localizedError(
      "error.serverAddressRequired",
      "Enter the address of your Peridot server.",
    );
  }
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw localizedError(
      "error.serverAddressInvalid",
      "Enter a valid server address.",
    );
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
    throw localizedError(
      "error.serverAddressScheme",
      "The server address must use HTTP or HTTPS.",
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw localizedError(
      "error.serverAddressCredentials",
      "Use the server address without credentials or parameters.",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

export function serverLabel(address: string): string {
  try {
    const url = new URL(address);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return address;
  }
}

export function safeRedirectPath(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : "/";
}
