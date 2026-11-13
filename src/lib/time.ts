export const APP_TIMEZONE = "Asia/Ho_Chi_Minh";
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function getHanoiParts(now: Date = new Date()): {
  date: string;
  time: string;
  shortTime: string;
} {
  const vnTime = new Date(now.getTime() + VN_OFFSET_MS);
  const year = vnTime.getUTCFullYear();
  const month = String(vnTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(vnTime.getUTCDate()).padStart(2, "0");
  const hours = String(vnTime.getUTCHours()).padStart(2, "0");
  const minutes = String(vnTime.getUTCMinutes()).padStart(2, "0");
  const seconds = String(vnTime.getUTCSeconds()).padStart(2, "0");

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}:${seconds}`,
    shortTime: `${hours}:${minutes}`,
  };
}

export function getHanoiNow(now: Date = new Date()): {
  date: string;
  time: string;
  timezone: string;
} {
  const vnTime = new Date(now.getTime() + VN_OFFSET_MS);
  const year = vnTime.getUTCFullYear();
  const month = String(vnTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(vnTime.getUTCDate()).padStart(2, "0");
  const hours = String(vnTime.getUTCHours()).padStart(2, "0");
  const minutes = String(vnTime.getUTCMinutes()).padStart(2, "0");

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
    timezone: APP_TIMEZONE,
  };
}

export function formatDate(value?: string): string {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function buildRecordTimestamp(
  depositDate: string,
  depositTime: string,
  fallback: Date = new Date()
): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(depositDate) && /^\d{2}:\d{2}$/.test(depositTime)) {
    const parsed = new Date(`${depositDate}T${depositTime}:00+07:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return fallback.toISOString();
}
