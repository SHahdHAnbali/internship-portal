// SHA-256 (lowercase hex) of the CV file, the same digest the backend computes
// over the uploaded bytes for its duplicate-CV rule. Uses the browser's Web
// Crypto API, available in secure contexts (HTTPS and localhost).

export class CvHashUnavailableError extends Error {
  constructor() {
    super('This browser cannot check the CV before it is submitted.');
    this.name = 'CvHashUnavailableError';
  }
}

export async function sha256Hex(file: Blob): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new CvHashUnavailableError();
  }
  const digest = await subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Stable identity for a selected File object (Files cannot be query keys).
const fileIds = new WeakMap<File, number>();
let nextFileId = 1;

export function fileKey(file: File): number {
  let id = fileIds.get(file);
  if (id === undefined) {
    id = nextFileId++;
    fileIds.set(file, id);
  }
  return id;
}
