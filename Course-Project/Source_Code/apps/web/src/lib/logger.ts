/**
 * Structured logger for AURA Coordinator and API endpoints.
 * Enforces JSON formatting and redacts sensitive PII and auth tokens.
 */

const SENSITIVE_KEYS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "private_key",
];

function redactValue(key: string, val: any): any {
  if (typeof val === "string") {
    if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
      return "[REDACTED]";
    }
  } else if (typeof val === "object" && val !== null) {
    if (Array.isArray(val)) {
      return val.map((item) => (typeof item === "object" ? redactObject(item) : item));
    }
    return redactObject(val);
  }
  return val;
}

function redactObject(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = redactValue(k, v);
  }
  return result;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export function logEvent(
  level: LogLevel,
  message: string,
  meta: Record<string, any> = {}
): void {
  const safeMeta = redactObject(meta);
  const entry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    service: "aura-web",
    message,
    ...safeMeta,
  };

  const output = JSON.stringify(entry);
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}
