const SENSITIVE_KEYS = ["password", "secret", "token", "authorization", "cookie"];
const STRING_PATTERNS: Array<[RegExp, string]> = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]"],
  [/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [redacted]"],
  [/(?:secret|password|token)=\S+/gi, "[redacted]"],
];

function scrubString(value: string | undefined): string | undefined {
  if (!value) return value;
  return STRING_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}

function scrubValue<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string") {
      return scrubString(value) as T;
    }
    return value;
  }

  if (seen.has(value as object)) {
    return "[Circular]" as unknown as T;
  }

  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, seen)) as unknown as T;
  }

  const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => {
    if (SENSITIVE_KEYS.some((candidate) => key.toLowerCase().includes(candidate))) {
      return [key, "[REDACTED]"];
    }

    return [key, scrubValue(val, seen)];
  });

  return Object.fromEntries(entries) as T;
}

function serializeError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
  cause?: string;
} {
  if (error instanceof Error) {
    return {
      name: scrubString(error.name) ?? "Error",
      message: scrubString(error.message) ?? "Unknown error",
      stack: scrubString(error.stack ?? undefined),
      cause: typeof error.cause === "string" ? scrubString(error.cause) : undefined,
    };
  }

  if (typeof error === "string") {
    return {
      name: "Error",
      message: scrubString(error) ?? "Unknown error",
    };
  }

  const scrubbed = scrubValue(error);
  const asString = (() => {
    try {
      return JSON.stringify(scrubbed);
    } catch (serializationError) {
      return `Non-serializable error: ${String(serializationError)}`;
    }
  })();

  return {
    name: "Error",
    message: asString ?? "Unknown error",
  };
}

export async function reportError(
  error: unknown,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const dsn = import.meta?.env?.VITE_ERROR_REPORT_DSN;
  if (!dsn || typeof fetch === "undefined") {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    error: serializeError(error),
    context: metadata ? scrubValue(metadata) : undefined,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  };

  try {
    await fetch(dsn, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (reportingError) {
    if (import.meta.env.MODE !== "production") {
      console.warn("Failed to send error report", reportingError);
    }
  }
}

export { scrubValue as scrubSensitiveData, serializeError };
