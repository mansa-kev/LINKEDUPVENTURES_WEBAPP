import React, { useEffect, useState } from 'react';
import { Loader2, FileText, ExternalLink, Download } from 'lucide-react';
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
        setError(null);
        // toProxiedAssetUrl now fully resolves /api/assets/ paths to direct Supabase URLs
        const fetchUrl = toProxiedAssetUrl(url) || url;
        const response = await fetch(fetchUrl, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`Failed to fetch PDF (${response.status})`);
        
        const blob = await response.blob();
        currentUrl = URL.createObjectURL(blob);
        setObjectUrl(currentUrl);
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

  // Resolve for direct link buttons
  const directUrl = toProxiedAssetUrl(url) || url;

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
      <div className={`flex flex-col items-center justify-center bg-muted/10 gap-4 px-6 text-center ${className}`} style={style}>
        <FileText className="w-12 h-12 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-bold text-foreground mb-1">Preview Unavailable</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Your browser could not render the PDF inline. Use the buttons below to open or download it directly.
          </p>
        </div>
        {directUrl && (
          <div className="flex gap-3 mt-1 flex-wrap justify-center">
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl text-sm font-bold hover:bg-primary/20 transition-colors"
            >
              <ExternalLink size={16} /> Open PDF
            </a>
            <a
              href={directUrl}
              download
              className="flex items-center gap-2 px-4 py-2 bg-muted/40 text-foreground rounded-xl text-sm font-bold hover:bg-muted/60 transition-colors"
            >
              <Download size={16} /> Download
            </a>
          </div>
        )}
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
