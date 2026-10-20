import progineerLogo from '@/assets/brand/progineer-technologies-logo.png';

import { ISSUING_COMPANY_NAME } from './constants';

// Logos of issuing organizations, keyed by the exact issuer name the server
// stores on the certificate. A certificate shows a logo only when its issuer
// has an approved asset here; any other issuer is shown by name, never with
// another organization's logo.
//
// progineer-technologies-logo.png: supplied by the project owner
// (2026-10-19), 1637 × 720 px PNG (RGB, sRGB, white background with a little
// white padding that disappears on the white certificate). Printed about
// 42 mm wide, the mark itself about 36 mm (~1000 dpi).
export interface IssuerBrand {
  logoSrc: string;
  // Intrinsic size, so the aspect ratio is kept before the image loads.
  width: number;
  height: number;
  // Source pixels hidden at the right and bottom edges (not part of the mark).
  crop?: { right: number; bottom: number };
}

const BRANDS: Record<string, IssuerBrand> = {
  [ISSUING_COMPANY_NAME]: { logoSrc: progineerLogo, width: 1637, height: 720 },
};

// Scaling blends an edge into its neighbours; this many more source pixels
// (white background in the supplied file) are hidden with it.
const CROP_BLEED_PX = 2;

// clip-path that hides the cropped edges, in percent of the rendered image.
export function logoClipPath(brand: IssuerBrand): string | undefined {
  if (!brand.crop) return undefined;
  const right = ((brand.crop.right + CROP_BLEED_PX) / brand.width) * 100;
  const bottom = ((brand.crop.bottom + CROP_BLEED_PX) / brand.height) * 100;
  return `inset(0 ${right.toFixed(2)}% ${bottom.toFixed(2)}% 0)`;
}

export function issuerBrand(issuerName: string): IssuerBrand | null {
  return Object.hasOwn(BRANDS, issuerName) ? BRANDS[issuerName] : null;
}
