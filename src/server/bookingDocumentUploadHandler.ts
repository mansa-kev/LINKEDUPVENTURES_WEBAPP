import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB after base64 decode

const ALLOWED_DOC_TYPES = new Set([
  'facePhoto',
  'licenseFront',
  'licenseBack',
  'idFront',
  'idBack',
]);

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'application/pdf') return 'pdf';
  return 'jpg';
}

export function createBookingDocumentUploadHandler(supabase: SupabaseClient) {
  return async (req: Request, res: Response) => {
    try {
      const { carId, docType, contentType, dataBase64, uploadId } = req.body || {};

      if (!carId || !docType || !dataBase64) {
        return res.status(400).json({
          success: false,
          error: 'carId, docType, and dataBase64 are required.',
        });
      }

      if (!ALLOWED_DOC_TYPES.has(String(docType))) {
        return res.status(400).json({ success: false, error: 'Invalid document type.' });
      }

      const buffer = Buffer.from(String(dataBase64), 'base64');
      if (!buffer.length) {
        return res.status(400).json({ success: false, error: 'Empty file payload.' });
      }
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ success: false, error: 'File too large. Please use a smaller file.' });
      }

      const mime =
        typeof contentType === 'string' && contentType.length > 0
          ? contentType
          : 'image/jpeg';

      const safeCarId = sanitizeId(String(carId));
      const safeUploadId = uploadId ? sanitizeId(String(uploadId)) : `${Date.now()}`;
      const ext = extensionForMime(mime);
      const filePath = `booking-docs/${safeCarId}_${docType}_${safeUploadId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('public_assets')
        .upload(filePath, buffer, { contentType: mime, upsert: false });

      if (uploadError) {
        return res.status(500).json({ success: false, error: uploadError.message });
      }

      const proxyUrl = `/api/assets/public_assets/${filePath}`;

      return res.json({
        success: true,
        publicUrl: proxyUrl,
        filePath,
      });
    } catch (err: any) {
      console.error('[booking-document-upload]', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to upload booking document.',
      });
    }
  };
}
