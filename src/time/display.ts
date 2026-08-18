export type TimeZoneMode = "system" | "manual";
export type TurnOrder = "oldest_first" | "newest_first";

function displayLocale(): string {
  return typeof document === "undefined" ? "en-US" : document.documentElement.lang || "en-US";
}

export function systemTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isValidTimeZone(value: string): boolean {
  const zone = value.trim();
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("ja-JP", { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(mode: TimeZoneMode, manualTimeZone: string): string {
  return mode === "manual" && isValidTimeZone(manualTimeZone)
    ? manualTimeZone.trim()
    : systemTimeZone();
}

function normalizeStoredDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.replace(" ", "T") + "Z";
  }
  return value;
}

export function formatDateTime(
  value: string | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  if (!value) return "";
  const date = new Date(normalizeStoredDate(value));
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(displayLocale(), { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(displayLocale(), options).format(date);
  }
}

export function formatTurnTime(value: string | undefined, timeZone: string): string {
  return formatDateTime(value, timeZone, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export const TIME_ZONE_SUGGESTIONS = [
  "Asia/Tokyo", "Asia/Bangkok", "Asia/Seoul", "Asia/Shanghai", "Asia/Hong_Kong",
  "Asia/Singapore", "Asia/Kolkata", "Europe/London", "Europe/Paris",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Pacific/Honolulu", "Australia/Sydney", "UTC",
] as const;
