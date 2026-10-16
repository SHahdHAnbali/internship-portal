// Returns the URL only if it is a well-formed http(s) URL; anything else
// (javascript:, data:, relative paths, free text) is never rendered as a link.
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}
