import { environment } from 'src/environments/environment';

// same rule as the backend: any URL ending in /thumbnails/<file> or /processed/<file>
const IMAGE_URL_RE = /\/(?:thumbnails|processed)\/([^?#]+)$/;

export function imageFileFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const m = IMAGE_URL_RE.exec(url.trim());
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

export function thumbnailUrl(file: string): string {
  return `${environment.imagesUrl}/thumbnails/${file}`;
}

export function processedUrl(file: string): string {
  return `${environment.imagesUrl}/processed/${file}`;
}
