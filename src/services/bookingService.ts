import { supabase, handleSupabaseErrorWrapper as handleSupabaseError } from '../lib/supabase';

const DEFAULT_COMMISSION_RATE = 0.15; // 15% platform commission

export const bookingService = {
  createBooking: async (bookingData: any) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          ...bookingData,
          platformCommission: Math.round(Number(bookingData.totalAmount || 0) * DEFAULT_COMMISSION_RATE * 100) / 100,
        }),
      });

      const rawResponse = await response.text();
      const result = rawResponse ? JSON.parse(rawResponse) : null;

      if (!response.ok || result?.error || !result?.booking) {
        throw new Error(result?.error || rawResponse || 'Failed to create booking');
      }

      return result.booking;
    } catch (error) {
      return handleSupabaseError(error, 'createBooking');
    }
  },

  getBookingById: async (id: string) => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, cars(*)')
      .eq('id', id)
      .single();
    if (error) return handleSupabaseError(error, 'getBookingById');
    return data;
  },

  uploadDocument: async (file: File, type: string, bookingId: string) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${bookingId}_${type}_${Date.now()}.${fileExt}`;
      const filePath = `booking-docs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('public_assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('public_assets')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Document upload error:', error);
      throw error;
    }
  }
};
