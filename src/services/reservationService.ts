import { supabase, handleSupabaseErrorWrapper as handleSupabaseError } from '../lib/supabase';

export interface ReservationData {
  carId: string;
  startDate: string;
  endDate: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes?: string;
}

const generateContinuationToken = () => {
  const first = globalThis.crypto?.randomUUID?.().replace(/-/g, '') || `${Date.now()}`;
  const second = globalThis.crypto?.randomUUID?.().replace(/-/g, '') || `${Math.random().toString(36).slice(2)}`;
  return `${first}${second}`;
};

export const reservationService = {
  // Get current reservation fee from settings
  getReservationFee: async (): Promise<number> => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'reservation_fee')
        .single();
      
      if (error) throw error;
      return data?.value || 500; // Default to 500 if not found
    } catch (error) {
      console.error('Error fetching reservation fee:', error);
      return 500; // Default fallback
    }
  },

  // Create a car reservation
  createReservation: async (data: ReservationData) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(data),
      });

      const rawResponse = await response.text();
      const result = rawResponse ? JSON.parse(rawResponse) : null;

      if (!response.ok || result?.error || !result?.reservation) {
        throw new Error(result?.error || rawResponse || 'Failed to create reservation');
      }

      return result.reservation;
    } catch (error) {
      return handleSupabaseError(error, 'createReservation');
    }
  },

  // Get user's reservations
  getUserReservations: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('car_reservations')
        .select(`
          *,
          cars!inner(*),
          user_profiles!inner(full_name, email)
        `)
        .eq('client_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching user reservations:', error);
      return [];
    }
  },

  // Get all reservations for admin
  getAllReservations: async (page: number = 1, pageSize: number = 20) => {
    try {
      // Check if car_reservations table exists
      try {
        await supabase
          .from('car_reservations')
          .select('id')
          .limit(1);
      } catch (tableCheckError: any) {
        // Check if it's a "relation does not exist" error (PostgreSQL code 42P01)
        if (tableCheckError?.code === '42P01' || tableCheckError?.message?.includes('relation "car_reservations" does not exist')) {
          console.warn(
            "â ï¸ Table 'car_reservations' does not exist in Supabase. Please create it with these columns: " +
            "id, car_id, client_id, fleet_owner_id, start_date, end_date, reservation_fee, total_amount, " +
            "status, payment_status, payment_method, payment_provider, payment_reference, transaction_code, contact_name, contact_email, " +
            "contact_phone, notes, expires_at, created_at, updated_at"
          );
          return { data: [], count: 0 };
        }
        // If it's a different error, re-throw it
        throw tableCheckError;
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from('car_reservations')
        .select(`
          *,
          cars!inner(*),
          client:user_profiles!client_id(full_name, email, phone_number),
          fleet_owner:user_profiles!fleet_owner_id(full_name, email)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const reservationIds = (data || []).map((reservation: any) => reservation.id);
      let latestPaymentRequests: any[] = [];

      if (reservationIds.length > 0) {
        const { data: paymentRequests, error: paymentRequestsError } = await supabase
          .from('reservation_payment_requests')
          .select('*')
          .in('reservation_id', reservationIds)
          .order('created_at', { ascending: false });

        if (!paymentRequestsError) {
          const latestMap = new Map<string, any>();
          for (const paymentRequest of paymentRequests || []) {
            if (!latestMap.has(paymentRequest.reservation_id)) {
              latestMap.set(paymentRequest.reservation_id, paymentRequest);
            }
          }
          latestPaymentRequests = Array.from(latestMap.values());
        }
      }

      return {
        data: (data || []).map((reservation: any) => ({
          ...reservation,
          latest_payment_request: latestPaymentRequests.find((paymentRequest: any) => paymentRequest.reservation_id === reservation.id) || null,
        })),
        count: count || 0
      };
    } catch (error) {
      console.error('Error fetching all reservations:', error);
      return { data: [], count: 0 };
    }
  },

  prepareBookingContinuation: async (reservationId: string, initiatedBy: 'client' | 'admin', notifyClient: boolean = false) => {
    try {
      const { data: reservation, error: resError } = await supabase
        .from('car_reservations')
        .select('*')
        .eq('id', reservationId)
        .single();

      if (resError || !reservation) {
        throw new Error('Reservation not found');
      }

      if (reservation.payment_status !== 'paid' || !['reserved', 'confirmed'].includes(reservation.status)) {
        throw new Error('Only paid active reservations can continue to booking');
      }

      const continuationToken = reservation.booking_completion_token || generateContinuationToken();

      const { error: updateError } = await supabase
        .from('car_reservations')
        .update({
          booking_completion_token: continuationToken,
          booking_flow_started_at: new Date().toISOString(),
          booking_flow_initiated_by: initiatedBy,
        })
        .eq('id', reservationId);

      if (updateError) throw updateError;

      const link = `${window.location.origin}/cars/${reservation.car_id}?booking=true&reservationToken=${continuationToken}`;

      if (notifyClient && reservation.client_id) {
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert({
            user_id: reservation.client_id,
            title: 'Complete Your Booking',
            content: 'Your reservation is paid. Use this link to complete the full booking flow.',
            type: 'info',
            is_read: false,
            link,
          });

        if (notificationError) {
          console.warn('Failed to notify client about booking continuation:', notificationError);
        }
      }

      return {
        link,
        reservationId: reservation.id,
        token: continuationToken,
      };
    } catch (error) {
      return handleSupabaseError(error, 'prepareBookingContinuation');
    }
  },

  getBookingContinuation: async (token: string) => {
    const response = await fetch(`/api/reservations/continuation/${token}`);
    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || 'Failed to load reservation continuation');
    }

    return data;
  },

  // Check if car is available for dates
  checkAvailability: async (carId: string, startDate: string, endDate: string, ignoreReservationId?: string) => {
    try {
      // Check existing bookings
      const { data: bookings, error: bookingError } = await supabase
        .from('bookings')
        .select('start_date, end_date, status')
        .eq('car_id', carId)
        .in('status', ['confirmed', 'on_trip']);

      // Check existing reservations
      let reservationQuery = supabase
        .from('car_reservations')
        .select('id, start_date, end_date, status')
        .eq('car_id', carId)
        .in('status', ['reserved', 'confirmed']);

      if (ignoreReservationId) {
        reservationQuery = reservationQuery.neq('id', ignoreReservationId);
      }

      const { data: reservations, error: resError } = await reservationQuery;

      if (bookingError || resError) throw bookingError || resError;

      const checkOverlap = (existingStart: string, existingEnd: string) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const existingStartDate = new Date(existingStart);
        const existingEndDate = new Date(existingEnd);

        return (
          (start >= existingStartDate && start <= existingEndDate) ||
          (end >= existingStartDate && end <= existingEndDate) ||
          (start <= existingStartDate && end >= existingEndDate)
        );
      };

      // Check for overlaps
      const hasBookingOverlap = bookings?.some(b => checkOverlap(b.start_date, b.end_date)) || false;
      const hasReservationOverlap = reservations?.some(r => checkOverlap(r.start_date, r.end_date)) || false;

      return {
        available: !(hasBookingOverlap || hasReservationOverlap),
        conflicts: [...(bookings || []), ...(reservations || [])].filter(item => 
          checkOverlap(item.start_date, item.end_date)
        )
      };
    } catch (error) {
      console.error('Error checking availability:', error);
      return { available: false, conflicts: [] };
    }
  }
};
