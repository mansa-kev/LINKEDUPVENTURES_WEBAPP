import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  fallbackToDefault?: boolean;
}

const DEFAULT_LOGO = '/favicon.svg';
const STORAGE_KEY = 'linkedup_logo_url';

async function fetchSiteLogoUrl(): Promise<string | null> {
  try {
    const response = await fetch('/api/public-app-settings?keys=site_logo');
    if (!response.ok) return null;
    const body = await response.json();
    const row = (body?.settings || []).find((s: { key: string }) => s.key === 'site_logo');
    if (!row) return null;
    return row.logo_url || row.value || null;
  } catch {
    return null;
  }
}

function syncFavicon(url: string) {
  const href = url || DEFAULT_LOGO;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (link.href !== href && !link.href.endsWith(href)) {
    link.href = href;
  }
}

// Function to clear logo cache (call this after logo update)
export function clearLogoCache() {
  localStorage.removeItem(STORAGE_KEY);
}

export function Logo({ size = 'md', showText = true, className, fallbackToDefault = true }: LogoProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) syncFavicon(stored);
    return stored || null;
  });
  const [imgFailed, setImgFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const remoteUrl = await fetchSiteLogoUrl();
        if (cancelled) return;

        if (remoteUrl) {
          setLogoUrl(remoteUrl);
          setImgFailed(false);
          localStorage.setItem(STORAGE_KEY, remoteUrl);
          syncFavicon(remoteUrl);
        }
        // If API returns nothing, keep existing cache — never wipe on empty/error
      } catch (err) {
        console.error('Error fetching logo:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  const sizeClasses = {
    sm: 'h-10 w-auto object-contain object-left',
    md: 'h-14 w-auto object-contain object-left md:h-16',
    lg: 'h-14 w-auto object-contain object-left md:h-16',
    xl: 'h-14 w-auto object-contain object-left md:h-16',
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
    xl: 'text-2xl',
  };

  const displayUrl = !imgFailed && logoUrl ? logoUrl : (fallbackToDefault ? DEFAULT_LOGO : null);
  const showLoading = loading && !displayUrl;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative flex items-center justify-center overflow-hidden">
        {showLoading ? (
          <div className="h-14 w-14 animate-pulse bg-muted rounded-lg" />
        ) : displayUrl ? (
          <img
            src={displayUrl}
            alt="LinkedUp Cars Rentals"
            className={sizeClasses[size]}
            loading="eager"
            fetchPriority="high"
            onError={() => {
              if (logoUrl && displayUrl === logoUrl) {
                setImgFailed(true);
                syncFavicon(DEFAULT_LOGO);
              }
            }}
          />
        ) : null}
      </div>

      {showText && (
        <span className={cn('font-black tracking-tighter text-primary italic', textSizes[size])}>
          LINKEDUP
        </span>
      )}
    </div>
  );
}
