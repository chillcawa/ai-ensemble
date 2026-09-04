export const DELTA_ID_PATTERN =
  /^[A-Za-z][A-Za-z0-9_-]*:[A-Za-z0-9][A-Za-z0-9._~-]*$/;

export function deltaIdSuffix(value: string): string {
  const raw = String(value || "").trim();
  const withoutPrefix = raw.includes(":")
    ? raw.slice(raw.indexOf(":") + 1)
    : raw;

  return (
    withoutPrefix
      .replace(/[^A-Za-z0-9._~-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

export function makeDeltaId(prefix: string, value: string): string {
  const safePrefix =
    String(prefix || "id")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "id";

  const normalizedPrefix = /^[A-Za-z]/.test(safePrefix)
    ? safePrefix
    : `id-${safePrefix}`;

  return `${normalizedPrefix}:${deltaIdSuffix(value)}`;
}

export function isValidDeltaId(value: unknown): value is string {
  return typeof value === "string" && DELTA_ID_PATTERN.test(value);
}
