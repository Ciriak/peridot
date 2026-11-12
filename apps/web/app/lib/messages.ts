import type { MessageDescriptor, MessageParams } from "@peridot/contracts";

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

export class LocalizedError extends Error {
  readonly messageDescriptor: MessageDescriptor;

  constructor(fallbackMessage: string, messageDescriptor: MessageDescriptor) {
    super(fallbackMessage);
    this.name = "LocalizedError";
    this.messageDescriptor = messageDescriptor;
  }
}

export function localizedError(
  key: string,
  fallbackMessage: string,
  params?: MessageParams,
): LocalizedError {
  return new LocalizedError(fallbackMessage, message(key, params));
}

export function messageDescriptorOf(reason: unknown): MessageDescriptor | null {
  if (!reason || typeof reason !== "object") return null;
  const descriptor = (reason as { messageDescriptor?: unknown })
    .messageDescriptor;
  if (!descriptor || typeof descriptor !== "object") return null;
  const value = descriptor as Partial<MessageDescriptor>;
  return typeof value.key === "string" && value.key.trim()
    ? (descriptor as MessageDescriptor)
    : null;
}
