export function toProxiedAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Fully resolve internal /api/assets/ and /api/images/ paths to
  // direct Supabase URLs so PdfViewer's fetch() works without chasing
  // a 302 redirect that may be blocked by Supabase's own X-Frame-Options.
  return resolveAssetUrl(url) || url;
}

export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  if (url.startsWith('/api/assets/')) {
    // /api/assets/<bucket>/<path>
    const parts = url.split('/').filter(Boolean);
    // parts: ['api', 'assets', '<bucket>', '<path...']
    if (parts.length >= 4) {
      const bucket = parts[2];
      const path = parts.slice(3).join('/');
      return `https://edroffvtzrowpsooszqh.supabase.co/storage/v1/object/public/${bucket}/${path}`;
    }
  }

  if (url.startsWith('/api/images/')) {
    const parts = url.split('/').filter(Boolean);
    if (parts.length >= 3) {
      const path = parts.slice(2).join('/');
      return `https://edroffvtzrowpsooszqh.supabase.co/storage/v1/object/public/public_assets/${path}`;
    }
  }

  return url;
}

