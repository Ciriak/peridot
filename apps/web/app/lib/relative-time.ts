const SECOND_MS = 1_000;
const MINUTE_SECONDS = 60;
const HOUR_SECONDS = MINUTE_SECONDS * 60;
const DAY_SECONDS = HOUR_SECONDS * 24;
const WEEK_SECONDS = DAY_SECONDS * 7;
const MONTH_SECONDS = DAY_SECONDS * 30;
const YEAR_SECONDS = DAY_SECONDS * 365;

export function formatTimeAgo(
  value: string | Date,
  now: Date,
  locale: string,
): string {
  const timestamp = value instanceof Date ? value : new Date(value);
  const elapsedSeconds = Math.max(
    1,
    Math.floor((now.getTime() - timestamp.getTime()) / SECOND_MS),
  );
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "always" });

  if (elapsedSeconds < MINUTE_SECONDS) {
    return formatter.format(-elapsedSeconds, "second");
  }
  if (elapsedSeconds < HOUR_SECONDS) {
    return formatter.format(
      -Math.floor(elapsedSeconds / MINUTE_SECONDS),
      "minute",
    );
  }
  if (elapsedSeconds < DAY_SECONDS) {
    return formatter.format(-Math.floor(elapsedSeconds / HOUR_SECONDS), "hour");
  }
  if (elapsedSeconds < WEEK_SECONDS) {
    return formatter.format(-Math.floor(elapsedSeconds / DAY_SECONDS), "day");
  }
  if (elapsedSeconds < MONTH_SECONDS) {
    return formatter.format(-Math.floor(elapsedSeconds / WEEK_SECONDS), "week");
  }
  if (elapsedSeconds < YEAR_SECONDS) {
    return formatter.format(
      -Math.floor(elapsedSeconds / MONTH_SECONDS),
      "month",
    );
  }
  return formatter.format(-Math.floor(elapsedSeconds / YEAR_SECONDS), "year");
}
