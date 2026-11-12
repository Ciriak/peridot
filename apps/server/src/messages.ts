import type { MessageDescriptor, MessageParams } from "@peridot/contracts";

const MAX_MESSAGE_KEY_LENGTH = 160;
const MAX_MESSAGE_PARAM_LENGTH = 300;
const MAX_MESSAGE_PARAMS = 20;

export function message(
  key: string,
  params?: MessageParams,
  count?: number,
): MessageDescriptor {
  return {
    key,
    ...(params ? { params } : {}),
    ...(count === undefined ? {} : { count }),
  };
}

export function normalizeMessageDescriptor(
  value: unknown,
): MessageDescriptor | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const key =
    typeof record.key === "string"
      ? record.key.trim().slice(0, MAX_MESSAGE_KEY_LENGTH)
      : "";
  if (!key) return null;

  let params: MessageParams | undefined;
  if (record.params && typeof record.params === "object") {
    const entries = Object.entries(record.params as Record<string, unknown>)
      .filter(
        (entry): entry is [string, string | number] =>
          (typeof entry[1] === "string" && entry[1].length > 0) ||
          (typeof entry[1] === "number" && Number.isFinite(entry[1])),
      )
      .slice(0, MAX_MESSAGE_PARAMS)
      .map(([name, parameter]) => [
        name.slice(0, MAX_MESSAGE_KEY_LENGTH),
        typeof parameter === "string"
          ? parameter.slice(0, MAX_MESSAGE_PARAM_LENGTH)
          : parameter,
      ]);
    if (entries.length) params = Object.fromEntries(entries);
  }

  const count =
    typeof record.count === "number" && Number.isFinite(record.count)
      ? Math.max(0, Math.floor(record.count))
      : undefined;

  return {
    key,
    ...(params ? { params } : {}),
    ...(count === undefined ? {} : { count }),
  };
}

export function parseStoredMessage(
  value: string | null,
): MessageDescriptor | null {
  if (!value) return null;
  try {
    return normalizeMessageDescriptor(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

export function serializeMessage(
  value: MessageDescriptor | null | undefined,
): string | null {
  const normalized = normalizeMessageDescriptor(value);
  return normalized ? JSON.stringify(normalized) : null;
}
