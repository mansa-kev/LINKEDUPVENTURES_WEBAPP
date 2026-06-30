import React, { useEffect, useState } from 'react';
import { Loader2, FileText, AlertCircle } from 'lucide-react';
import { toProxiedAssetUrl } from '../../utils/assetUrl';

export function PdfViewer({ url, className = '', style = {} }: { url: string, className?: string, style?: React.CSSProperties }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let currentUrl = '';
    async function loadPdf() {
      if (!url) return;
      try {
        setLoading(true);
        const proxiedUrl = toProxiedAssetUrl(url) || url;
        const response = await fetch(proxiedUrl);
        if (!response.ok) throw new Error('Failed to fetch PDF');
        
        const blob = await response.blob();
        currentUrl = URL.createObjectURL(blob);
        setObjectUrl(currentUrl);
        setError(null);
      } catch (err: any) {
        console.error('Error loading PDF:', err);
        setError(err.message || 'Failed to load PDF');
      } finally {
        setLoading(false);
      }
    }
    
    loadPdf();
    
    return () => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [url]);

  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center bg-muted/10 ${className}`} style={style}>
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
        <p className="text-sm font-bold text-foreground">Loading Document Preview...</p>
      </div>
    );
  }

  if (error || !objectUrl) {
    return (
      <div className={`flex flex-col items-center justify-center bg-muted/10 ${className}`} style={style}>
        <AlertCircle className="w-8 h-8 text-destructive mb-4" />
        <p className="text-sm font-bold text-foreground">Preview Unavailable</p>
        <p className="text-xs text-muted-foreground mt-2 max-w-sm text-center">
          The document preview could not be loaded due to security restrictions or a network issue. 
          Please use the buttons above to open or download the PDF directly.
        </p>
      </div>
    );
  }

  return (
    <iframe
      src={objectUrl}
      className={className}
      style={style}
      title="Document Preview"
    />
  );
}
