export const TIMEZONE_OFFSET_COOKIE = 'webvidence_tz_offset';

export function normalizeTimezoneOffset(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-840, Math.min(840, Math.trunc(parsed)));
}

export function getLocalDayBounds(now = new Date(), timezoneOffsetMinutes = 0) {
  const offset = normalizeTimezoneOffset(timezoneOffsetMinutes);
  const localClock = new Date(now.getTime() - offset * 60_000);
  localClock.setUTCHours(0, 0, 0, 0);
  const start = new Date(localClock.getTime() + offset * 60_000);
  return { start, end: new Date(start.getTime() + 86_400_000 - 1) };
}
