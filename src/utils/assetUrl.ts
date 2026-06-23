export function toProxiedAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Already proxied
  if (url.startsWith('/api/assets/')) return url;
  if (url.startsWith('/api/images/')) return url;

  // Supabase public storage URL → /api/assets/<bucket>/<path>
  // Example:
  // https://xxxx.supabase.co/storage/v1/object/public/public_assets/e_contracts/foo.pdf
  const marker = '/storage/v1/object/public/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;

  const after = url.slice(idx + marker.length); // "<bucket>/<path...>"
  const firstSlash = after.indexOf('/');
  if (firstSlash === -1) return url;

  const bucket = after.slice(0, firstSlash);
  const path = after.slice(firstSlash + 1);
  if (!bucket || !path) return url;

  return `/api/assets/${bucket}/${path}`;
}

