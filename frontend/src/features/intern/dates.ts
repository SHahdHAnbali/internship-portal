// Today's calendar date in the browser's timezone, as YYYY-MM-DD.
export function localIsoDate(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
