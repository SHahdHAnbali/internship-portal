import { afterEach, describe, expect, it, vi } from 'vitest';

import { CvHashUnavailableError, fileKey, sha256Hex } from './cv-hash';

describe('sha256Hex', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns the lowercase hex SHA-256 of the file bytes (same digest as the server)', async () => {
    await expect(sha256Hex(new Blob(['abc'])))
      .resolves.toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('reports that hashing is unavailable when the browser has no Web Crypto', async () => {
    vi.stubGlobal('crypto', {});
    await expect(sha256Hex(new Blob(['abc']))).rejects.toBeInstanceOf(CvHashUnavailableError);
  });
});

describe('fileKey', () => {
  it('is stable for one file and different for another', () => {
    const a = new File(['a'], 'a.pdf');
    const b = new File(['a'], 'a.pdf');
    expect(fileKey(a)).toBe(fileKey(a));
    expect(fileKey(a)).not.toBe(fileKey(b));
  });
});
