const MAX_ERROR_DEPTH = 3;
const MAX_ERROR_MESSAGE_LENGTH = 8_000;
const MAX_ERROR_STACK_LENGTH = 24_000;

function bounded(value: string, maximum: number): string {
  return value.length > maximum ? `${value.slice(0, maximum)}…` : value;
}

function errorCode(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function plainErrorMessage(value: Record<string, unknown>): string | null {
  const message = value.message;
  if (typeof message === "string" && message.trim()) return message;
  const reason = value.reason;
  if (typeof reason === "string" && reason.trim()) return reason;
  return null;
}

export function serializeError(
  error: unknown,
  depth = 0,
): Record<string, unknown> {
  if (depth >= MAX_ERROR_DEPTH) {
    return { type: "TruncatedError", message: "Error cause depth exceeded." };
  }

  if (error instanceof Error) {
    const code = errorCode((error as Error & { code?: unknown }).code);
    const cause =
      "cause" in error
        ? serializeError(
            (error as Error & { cause?: unknown }).cause,
            depth + 1,
          )
        : null;
    const nested =
      error instanceof AggregateError
        ? error.errors.map((item) => serializeError(item, depth + 1))
        : null;
    return {
      type: error.name || "Error",
      message: bounded(
        error.message || "No error message.",
        MAX_ERROR_MESSAGE_LENGTH,
      ),
      ...(error.stack
        ? { stack: bounded(error.stack, MAX_ERROR_STACK_LENGTH) }
        : {}),
      ...(code !== null ? { code } : {}),
      ...(cause ? { cause } : {}),
      ...(nested?.length ? { errors: nested } : {}),
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = plainErrorMessage(record);
    const code = errorCode(record.code);
    const type =
      typeof record.type === "string"
        ? record.type
        : typeof record.name === "string"
          ? record.name
          : "Object";
    const cause =
      "cause" in record ? serializeError(record.cause, depth + 1) : null;
    return {
      type,
      message: bounded(
        message ?? "No error message.",
        MAX_ERROR_MESSAGE_LENGTH,
      ),
      ...(typeof record.stack === "string"
        ? { stack: bounded(record.stack, MAX_ERROR_STACK_LENGTH) }
        : {}),
      ...(code !== null ? { code } : {}),
      ...(cause ? { cause } : {}),
    };
  }

  return {
    type: typeof error,
    message: bounded(String(error), MAX_ERROR_MESSAGE_LENGTH),
  };
}

export function summarizeError(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  const serialized = serializeError(error);
  const type = serialized.type;
  const message = serialized.message;
  const code = errorCode(serialized.code);
  const summary = `${String(type)}: ${String(message)}${
    code !== null ? ` (code ${String(code)})` : ""
  }`;
  if (serialized.cause && typeof serialized.cause === "object") {
    const cause = serialized.cause as Record<string, unknown>;
    return `${summary}; caused by ${String(cause.type)}: ${String(
      cause.message,
    )}${errorCode(cause.code) !== null ? ` (code ${String(cause.code)})` : ""}`;
  }
  return summary;
}
