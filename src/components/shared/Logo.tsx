import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  fallbackToDefault?: boolean;
}

// Function to clear logo cache (call this after logo update)
export function clearLogoCache() {
  localStorage.removeItem('linkedup_logo_url');
}

export function Logo({ size = 'md', showText = true, className, fallbackToDefault = true }: LogoProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(() => {
    // Initialize from localStorage immediately - no flash
    const storedLogo = localStorage.getItem('linkedup_logo_url');
    if (storedLogo) {
      // Sync favicon immediately from cache (synchronous, before Supabase fetch)
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link) link.href = storedLogo;
    }
    return storedLogo || null;
  });
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        setError(false);

        // Check if user is authenticated before deciding to clear cache
        const { data: { session } } = await supabase.auth.getSession();
        const isAuthenticated = !!session;

        // Try to fetch custom logo from settings
        const { data, error: fetchError } = await supabase
          .from('app_settings')
          .select('logo_url')
          .eq('key', 'site_logo')
          .single();

        if (data?.logo_url) {
          // Update UI and localStorage if value changed
          if (data.logo_url !== logoUrl) {
            setLogoUrl(data.logo_url);
            localStorage.setItem('linkedup_logo_url', data.logo_url);
          }
          // Sync browser tab favicon to the stored logo
          const existingFavicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
          if (existingFavicon) {
            existingFavicon.href = data.logo_url;
          } else {
            const link = document.createElement('link');
            link.rel = 'icon';
            link.href = data.logo_url;
            document.head.appendChild(link);
          }
        } else if (fetchError || !isAuthenticated) {
          // Query failed (RLS blocked anon) or user is not authenticated
          // Keep existing cache — do NOT clear it
          // Cache will only be cleared when an authenticated user confirms no logo exists
        } else {
          // Authenticated user confirmed no logo exists — safe to clear
          setLogoUrl(null);
          localStorage.removeItem('linkedup_logo_url');
        }
      } catch (err) {
        console.error('Error fetching logo:', err);
        setError(true);
        // On any error, keep existing cached value — do not clear
      } finally {
        setLoading(false);
      }
    };

    fetchLogo();
  }, []);

  // Responsive sizing classes
  const sizeClasses = {
    sm: 'h-10 w-auto object-contain object-left',
    md: 'h-14 w-auto object-contain object-left md:h-16 w-auto object-contain object-left',
    lg: 'h-14 w-auto object-contain object-left md:h-16 w-auto object-contain object-left',
    xl: 'h-14 w-auto object-contain object-left md:h-16 w-auto object-contain object-left'
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
    xl: 'text-2xl'
  };

  // Show placeholder only if no cached logo and fallback is enabled
  const showPlaceholder = !logoUrl && fallbackToDefault;
  const showLoading = loading && !logoUrl;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Logo Container */}
      <div className="relative flex items-center justify-center overflow-hidden">
        {showLoading ? (
          // Loading skeleton
          <div className="h-14 w-14 animate-pulse bg-muted rounded-lg" />
        ) : showPlaceholder ? (
          // Placeholder/Default Logo - only shown if no cached logo
          <svg
            width="40"
            height="40"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-14 w-auto object-contain object-left md:h-16 w-auto object-contain object-left"
          >
            {/* LinkedUp Logo - L and U combined */}
            <path d="M8 8 L8 32 L14 32 L14 18 L20 26 L26 18 L26 32 L32 32 L32 8 L26 8 L20 16 L14 8 L8 8 Z" fill="#FF6B00"/>
            {/* Small accent */}
            <circle cx="20" cy="20" r="2" fill="#FF8C00"/>
          </svg>
        ) : (
          // Custom Logo Image - loaded immediately from cache
          logoUrl && (
            <img
              src={logoUrl}
              alt="LinkedUp Logo"
              className={sizeClasses[size]}
              loading="eager"
              fetchPriority="high"
              onError={() => setError(true)}
            />
          )
        )}
      </div>
      
      {/* Text below logo if showText is true */}
      {showText && (
        <span className={cn(
          'font-black tracking-tighter text-primary italic',
          textSizes[size]
        )}>
          LINKEDUP
        </span>
      )}
    </div>
  );
}
