import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { ncbaService } from "../src/services/ncbaService.js";

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server-side Supabase client (uses service role or anon key)
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseKey = supabaseServiceRoleKey || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();

  const PORT = 3000;

  // Simple in-memory rate limiter
  const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
  const RATE_LIMIT_MAX = 100; // 100 requests per minute

  const rateLimitMiddleware = (req: any, res: any, next: any) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now > record.resetTime) {
      // New window
      rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
      next();
    } else {
      // Existing window
      if (record.count >= RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      record.count++;
      next();
    }
  };

  // Apply rate limiting to API routes
  app.use('/api', rateLimitMiddleware);

  // Security headers middleware
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  });

  // Parse JSON bodies for API routes (must come before Vite middleware)
  app.use('/api', express.json());

  // ─── IMAGE PROXY ROUTE (Hides Supabase URL) ────────────────────────────────────────────

  /**
   * GET /api/images/:filename
   * Proxies images from Supabase to hide the bucket structure and URL
   * Adds caching headers for performance
   */
  app.get('/api/images/:filename', async (req, res) => {
    const { filename } = req.params;

    if (!filename) {
      return res.status(400).send('Filename required');
    }

    try {
      const imageUrl = `${supabaseUrl}/storage/v1/object/public/public_assets/${filename}`;

      const response = await fetch(imageUrl);

      if (!response.ok) {
        return res.status(response.status).send('Image not found');
      }

      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type');

      res.set('Content-Type', contentType || 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400, s-maxage=86400'); // Cache for 24 hours
      res.set('CDN-Cache-Control', 'public, max-age=86400');

      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error('Image proxy error:', error);
      res.status(500).send('Failed to fetch image');
    }
  });

  // ─── NCBA STK PUSH API ROUTES ─────────────────────────────────────

  const finalizeNcbaPayment = async (paymentRequest: any, queryResult: any) => {
    const now = new Date().toISOString();

    if (queryResult.paid) {
      await supabase
        .from('payment_requests')
        .update({
          status: 'success',
          status_description: queryResult.description || 'Success',
          raw_query_response: queryResult.raw || null,
          updated_at: now,
          confirmed_at: now,
        })
        .eq('id', paymentRequest.id);

      await supabase
        .from('bookings')
        .update({
          status: 'confirmed',
          payment_status: 'paid',
          payment_method: 'ncba_stk',
          payment_provider: 'ncba',
          payment_reference: paymentRequest.provider_reference_id,
          transaction_code: paymentRequest.provider_transaction_id,
        })
        .eq('id', paymentRequest.booking_id);

      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('booking_id', paymentRequest.booking_id)
        .eq('transaction_code', paymentRequest.provider_transaction_id)
        .maybeSingle();

      if (!existingTx) {
        await supabase.from('transactions').insert({
          booking_id: paymentRequest.booking_id,
          user_id: paymentRequest.client_id,
          amount: paymentRequest.amount,
          type: 'payment_in',
          status: 'completed',
          transaction_code: paymentRequest.provider_transaction_id,
        });
      }

      if (paymentRequest.client_id) {
        await supabase.from('notifications').insert({
          user_id: paymentRequest.client_id,
          title: 'Payment Received',
          content: `Your NCBA STK payment of KES ${Number(paymentRequest.amount).toLocaleString()} has been received. Booking confirmed!`,
          type: 'success',
          is_read: false,
          link: `/bookings/${paymentRequest.booking_id}`,
        }).then(() => {}, (err: any) => console.error('[NCBA] Notification insert error:', err));
      }
    } else if (queryResult.failed) {
      await supabase
        .from('payment_requests')
        .update({
          status: 'failed',
          status_description: queryResult.description || 'Payment failed',
          raw_query_response: queryResult.raw || null,
          updated_at: now,
          failed_at: now,
        })
        .eq('id', paymentRequest.id);

      await supabase
        .from('bookings')
        .update({
          status: 'pending_payment_verification',
          payment_status: 'pending',
          payment_method: 'ncba_stk',
          payment_provider: 'ncba',
        })
        .eq('id', paymentRequest.booking_id);
    } else {
      await supabase
        .from('payment_requests')
        .update({
          status: 'pending',
          status_description: queryResult.description || 'Payment pending',
          raw_query_response: queryResult.raw || null,
          updated_at: now,
        })
        .eq('id', paymentRequest.id);
    }
  };

  const finalizeReservationNcbaPayment = async (paymentRequest: any, queryResult: any) => {
    const now = new Date().toISOString();

    if (queryResult.paid) {
      await supabase
        .from('reservation_payment_requests')
        .update({
          status: 'success',
          status_description: queryResult.description || 'Success',
          raw_query_response: queryResult.raw || null,
          updated_at: now,
          confirmed_at: now,
        })
        .eq('id', paymentRequest.id);

      const { data: reservation } = await supabase
        .from('car_reservations')
        .select('id, car_id, client_id, fleet_owner_id, reservation_fee, total_amount, booking_completion_token')
        .eq('id', paymentRequest.reservation_id)
        .maybeSingle();

      await supabase
        .from('car_reservations')
        .update({
          status: 'reserved',
          payment_status: 'paid',
          payment_method: 'ncba_stk',
          payment_provider: 'ncba',
          payment_reference: paymentRequest.provider_reference_id,
          transaction_code: paymentRequest.provider_transaction_id,
        })
        .eq('id', paymentRequest.reservation_id);

      if (reservation) {
        try {
          const { data: existingRevenue } = await supabase
            .from('reservation_revenue')
            .select('id')
            .eq('reservation_id', reservation.id)
            .eq('transaction_code', paymentRequest.provider_transaction_id)
            .maybeSingle();

          if (!existingRevenue) {
            await supabase.from('reservation_revenue').insert({
              reservation_id: reservation.id,
              car_id: reservation.car_id,
              fleet_owner_id: reservation.fleet_owner_id,
              client_id: reservation.client_id,
              reservation_fee: reservation.reservation_fee,
              total_reservation_value: reservation.total_amount,
              payment_method: 'ncba_stk',
              transaction_code: paymentRequest.provider_transaction_id,
              recorded_at: now,
              status: 'collected',
            });
          }
        } catch (revenueError: any) {
          if (revenueError?.code !== '42P01' && !revenueError?.message?.includes('relation "reservation_revenue" does not exist')) {
            console.error('[NCBA Reservation] Revenue insert error:', revenueError);
          }
        }

        if (reservation.client_id) {
          const continuationLink = `/cars/${reservation.car_id}?booking=true&reservationToken=${reservation.booking_completion_token}`;
          await supabase.from('notifications').insert({
            user_id: reservation.client_id,
            title: 'Reservation Confirmed',
            content: `Your NCBA reservation fee of KES ${Number(paymentRequest.amount).toLocaleString()} has been received. You can now complete the full booking flow.`,
            type: 'success',
            is_read: false,
            link: continuationLink,
          }).then(() => {}, (err: any) => console.error('[NCBA Reservation] Notification insert error:', err));
        }
      }
    } else if (queryResult.failed) {
      await supabase
        .from('reservation_payment_requests')
        .update({
          status: 'failed',
          status_description: queryResult.description || 'Payment failed',
          raw_query_response: queryResult.raw || null,
          updated_at: now,
          failed_at: now,
        })
        .eq('id', paymentRequest.id);

      await supabase
        .from('car_reservations')
        .update({
          status: 'pending_payment',
          payment_status: 'pending',
          payment_method: 'ncba_stk',
          payment_provider: 'ncba',
        })
        .eq('id', paymentRequest.reservation_id);
    } else {
      await supabase
        .from('reservation_payment_requests')
        .update({
          status: 'pending',
          status_description: queryResult.description || 'Payment pending',
          raw_query_response: queryResult.raw || null,
          updated_at: now,
        })
        .eq('id', paymentRequest.id);
    }
  };

  const checkBookingAvailability = async (carId: string, startDate: string, endDate: string, ignoreReservationId?: string) => {
    const { data: bookings, error: bookingError } = await supabase
      .from('bookings')
      .select('start_date, end_date, status')
      .eq('car_id', carId)
      .in('status', ['confirmed', 'on_trip']);

    let reservationQuery = supabase
      .from('car_reservations')
      .select('id, start_date, end_date, status')
      .eq('car_id', carId)
      .in('status', ['reserved', 'confirmed']);

    if (ignoreReservationId) {
      reservationQuery = reservationQuery.neq('id', ignoreReservationId);
    }

    const { data: reservations, error: reservationError } = await reservationQuery;

    if (bookingError || reservationError) {
      throw bookingError || reservationError;
    }

    const requestedStart = new Date(startDate);
    const requestedEnd = new Date(endDate);
    const hasOverlap = (existingStart: string, existingEnd: string) => {
      const currentStart = new Date(existingStart);
      const currentEnd = new Date(existingEnd);
      return (
        (requestedStart >= currentStart && requestedStart <= currentEnd) ||
        (requestedEnd >= currentStart && requestedEnd <= currentEnd) ||
        (requestedStart <= currentStart && requestedEnd >= currentEnd)
      );
    };

    return !(bookings || []).some((item: any) => hasOverlap(item.start_date, item.end_date))
      && !(reservations || []).some((item: any) => hasOverlap(item.start_date, item.end_date));
  };

  // ─── ADMIN-DIRECTED USER DELETION AND CREATION ──────────────────────

  app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const authorizationHeader = req.headers.authorization;
    const accessToken = authorizationHeader?.startsWith('Bearer ')
      ? authorizationHeader.slice(7)
      : null;

    if (!accessToken) {
      return res.status(401).json({ success: false, error: 'Authorization header is required.' });
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
      if (authError || !authData.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized session.' });
      }

      const { data: profile, error: profileErr } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (profileErr || profile?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Forbidden: Admin access required.' });
      }

      // Delete from user_profiles to ensure UI removal
      const { error: profileDeleteError } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', id);
        
      if (profileDeleteError) {
        console.error('Failed to delete user profile:', profileDeleteError);
      }

      // Delete from auth.users
      const { error: deleteError } = await supabase.auth.admin.deleteUser(id);
      if (deleteError) {
        console.error('Failed to delete auth user:', deleteError);
        // We still return 200 if profile was deleted, or maybe 500 if both failed.
        // But if profile was deleted, the user is effectively gone from the app.
      }

      return res.status(200).json({ success: true, message: 'User deleted successfully.' });
    } catch (err: any) {
      console.error('Delete user error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
  });

  app.post('/api/users', async (req, res) => {
    const authorizationHeader = req.headers.authorization;
    const accessToken = authorizationHeader?.startsWith('Bearer ')
      ? authorizationHeader.slice(7)
      : null;

    if (!accessToken) {
      return res.status(401).json({ success: false, error: 'Authorization header is required.' });
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
      if (authError || !authData.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized session.' });
      }

      const { data: profile, error: profileErr } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (profileErr || profile?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Forbidden: Admin access required.' });
      }

      const {
        email,
        password,
        role,
        fullName,
        phoneNumber,
        licenseNumber,
        companyName,
        commissionRate
      } = req.body;

      if (!email || !role || !fullName || !phoneNumber) {
        return res.status(400).json({ success: false, error: 'Email, role, full name, and phone number are required.' });
      }

      // Create the user in auth.users with email auto-confirmed
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: password || (role === 'fleet_owner' ? 'Fleet123!' : 'Driver123!'),
        email_confirm: true,
        user_metadata: {
          role,
          full_name: fullName,
        }
      });

      if (createError || !createData.user) {
        console.error('Error creating auth user:', createError);
        return res.status(500).json({ success: false, error: createError?.message || 'Failed to create auth user.' });
      }

      const userId = createData.user.id;

      // Upsert user profile
      const { error: profileUpsertError } = await supabase
        .from('user_profiles')
        .upsert({
          id: userId,
          full_name: fullName,
          email,
          phone_number: phoneNumber,
          role,
          status: 'active'
        });

      if (profileUpsertError) {
        console.error('Error upserting user profile:', profileUpsertError);
        return res.status(500).json({ success: false, error: profileUpsertError.message });
      }

      // Role specific profile setup
      if (role === 'fleet_owner') {
        const { error: settingsError } = await supabase
          .from('fleet_owner_settings')
          .upsert({
            id: userId,
            company_name: companyName || '',
            commission_rate: commissionRate != null ? Number(commissionRate) : 0.15,
            status: 'active'
          });
        if (settingsError) {
          console.error('Error creating fleet owner settings:', settingsError);
          return res.status(500).json({ success: false, error: settingsError.message });
        }
      } else if (role === 'driver') {
        const { error: driverProfileError } = await supabase
          .from('driver_profiles')
          .upsert({
            id: userId,
            license_number: licenseNumber || '',
            license_status: 'verified',
            id_status: 'verified',
            status: 'active'
          });
        if (driverProfileError) {
          console.error('Error creating driver profile:', driverProfileError);
          return res.status(500).json({ success: false, error: driverProfileError.message });
        }
      }

      return res.status(201).json({ success: true, userId, message: 'User created successfully.' });
    } catch (err: any) {
      console.error('Create user endpoint error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
  });

  app.post('/api/reservations', async (req, res) => {
    try {
      if (!supabaseServiceRoleKey) {
        return res.status(500).json({
          success: false,
          error: 'SUPABASE_SERVICE_ROLE_KEY is required for public reservation creation.',
        });
      }

      const { carId, startDate, endDate, contactName, contactEmail, contactPhone, notes } = req.body;

      if (!carId || !startDate || !endDate || !contactName || !contactEmail || !contactPhone) {
        return res.status(400).json({ success: false, error: 'Missing required reservation fields.' });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
        return res.status(400).json({ success: false, error: 'Please provide a valid reservation date range.' });
      }

      const { data: car, error: carError } = await supabase
        .from('cars')
        .select('id, fleet_owner_id, daily_rate')
        .eq('id', carId)
        .single();

      if (carError || !car) {
        return res.status(404).json({ success: false, error: 'Car not found.' });
      }

      if (!car.fleet_owner_id) {
        return res.status(409).json({ success: false, error: 'This car is not assigned to a fleet owner yet.' });
      }

      let clientId: string | null = null;
      const authorizationHeader = req.headers.authorization;
      const accessToken = authorizationHeader?.startsWith('Bearer ')
        ? authorizationHeader.slice(7)
        : null;

      if (accessToken) {
        const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
        if (authError) {
          return res.status(401).json({ success: false, error: 'Failed to verify your session.' });
        }
        clientId = authData.user?.id || null;
      }

      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      let reservationFee = req.body.reservationFee != null ? Number(req.body.reservationFee) : null;
      if (reservationFee == null || Number.isNaN(reservationFee)) {
        const { data: feeSetting } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'reservation_fee')
          .maybeSingle();

        reservationFee = Number(feeSetting?.value || 500);
      }
      const totalAmount = reservationFee + (Number(car.daily_rate || 0) * days);
      const firstTokenPart = globalThis.crypto?.randomUUID?.().replace(/-/g, '') || `${Date.now()}`;
      const secondTokenPart = globalThis.crypto?.randomUUID?.().replace(/-/g, '') || `${Math.random().toString(36).slice(2)}`;
      const continuationToken = `${firstTokenPart}${secondTokenPart}`;

      const { data: reservation, error: reservationError } = await supabase
        .from('car_reservations')
        .insert({
          car_id: carId,
          client_id: clientId,
          fleet_owner_id: car.fleet_owner_id,
          start_date: startDate,
          end_date: endDate,
          reservation_fee: reservationFee,
          total_amount: totalAmount,
          contact_name: contactName,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          notes: notes || null,
          status: 'pending_payment',
          payment_status: 'pending',
          payment_method: 'ncba_stk',
          payment_provider: 'ncba',
          payment_reference: null,
          transaction_code: null,
          booking_completion_token: continuationToken,
          linked_booking_id: null,
          booking_flow_started_at: null,
          booking_flow_initiated_by: null,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (reservationError || !reservation) {
        return res.status(500).json({ success: false, error: reservationError?.message || 'Failed to create reservation.' });
      }

      return res.status(201).json({ success: true, reservation });
    } catch (error: any) {
      console.error('[API] Reservation create error:', error);
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  });
  // Flag Booking Endpoint
  app.patch('/api/bookings/:id/flag', async (req, res) => {
    try {
      const { id } = req.params;
      const { is_flagged, flag_reason } = req.body;
      
      const { data, error } = await supabase
        .from('bookings')
        .update({ is_flagged, flag_reason })
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      res.json({ success: true, booking: data });
    } catch (error: any) {
      console.error('[API] Flag booking error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Extend Booking Endpoint
  app.post('/api/bookings/:id/extend', async (req, res) => {
    try {
      const { id } = req.params;
      const { days_extended, new_end_date, extension_cost } = req.body;
      
      const { data: extension, error: extError } = await supabase
        .from('booking_extensions')
        .insert([{ booking_id: id, days_extended, new_end_date, extension_cost, status: 'pending_payment' }])
        .select()
        .single();
        
      if (extError) throw extError;
      
      // Update the main booking total_price (if needed) or just leave it for the frontend to calculate
      res.json({ success: true, extension });
    } catch (error: any) {
      console.error('[API] Extend booking error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create Inspection Endpoint
  app.post('/api/bookings/:id/inspections', async (req, res) => {
    try {
      const { id } = req.params;
      const { type, fuel_level, mileage, location, scratches_notes, photos_exterior, photos_interior, photo_fuel_mileage, conducted_by } = req.body;
      
      const { data: inspection, error } = await supabase
        .from('booking_inspections')
        .insert([{
          booking_id: id, type, fuel_level, mileage, location, 
          scratches_notes, photos_exterior, photos_interior, 
          photo_fuel_mileage, conducted_by
        }])
        .select()
        .single();
        
      if (error) throw error;
      
      // Update booking sub_status based on inspection type
      const newSubStatus = type === 'pre_handover' ? 'in_transit' : 'completed';
      await supabase.from('bookings').update({ sub_status: newSubStatus }).eq('id', id);
      
      res.json({ success: true, inspection });
    } catch (error: any) {
      console.error('[API] Create inspection error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/bookings', async (req, res) => {
    try {
      if (!supabaseServiceRoleKey) {
        return res.status(500).json({
          success: false,
          error: 'SUPABASE_SERVICE_ROLE_KEY is required for public booking creation.',
        });
      }

      const bookingData = req.body || {};
      const {
        carId,
        startDate,
        endDate,
        totalAmount,
        pickupLocation,
        dropoffLocation,
        location,
        paymentMethod,
        sourceReservationId,
        reservationContinuationToken,
        bookingFlowInitiatedBy,
      } = bookingData;

      if (!carId || !startDate || !endDate || totalAmount == null) {
        return res.status(400).json({ success: false, error: 'Missing required booking fields.' });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
        return res.status(400).json({ success: false, error: 'Please provide a valid booking date range.' });
      }

      let clientId: string | null = null;
      const authorizationHeader = req.headers.authorization;
      const accessToken = authorizationHeader?.startsWith('Bearer ')
        ? authorizationHeader.slice(7)
        : null;

      if (accessToken) {
        const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
        if (authError) {
          return res.status(401).json({ success: false, error: 'Failed to verify your session.' });
        }
        clientId = authData.user?.id || null;
      }

      let sourceReservation: any = null;
      if (sourceReservationId) {
        const { data: reservation, error: reservationError } = await supabase
          .from('car_reservations')
          .select('id, car_id, fleet_owner_id, client_id, start_date, end_date, status, payment_status, linked_booking_id, booking_completion_token')
          .eq('id', sourceReservationId)
          .single();

        if (reservationError || !reservation) {
          return res.status(404).json({ success: false, error: 'Reservation continuation was not found.' });
        }

        if (reservation.payment_status !== 'paid' || !['reserved', 'confirmed'].includes(reservation.status)) {
          return res.status(409).json({ success: false, error: 'Only paid active reservations can be completed into a booking.' });
        }

        if (reservation.car_id !== carId) {
          return res.status(409).json({ success: false, error: 'This reservation does not match the selected vehicle.' });
        }

        if (reservationContinuationToken && reservation.booking_completion_token !== reservationContinuationToken) {
          return res.status(409).json({ success: false, error: 'The reservation continuation link is no longer valid.' });
        }

        sourceReservation = reservation;
      }

      const available = await checkBookingAvailability(carId, startDate, endDate, sourceReservationId || undefined);
      if (!available) {
        return res.status(409).json({ success: false, error: 'Selected dates are not available. The car is either booked or reserved for these dates.' });
      }

      let fleetOwnerId = sourceReservation?.fleet_owner_id || null;
      if (!fleetOwnerId) {
        const { data: car, error: carError } = await supabase
          .from('cars')
          .select('fleet_owner_id')
          .eq('id', carId)
          .single();

        if (carError || !car) {
          return res.status(404).json({ success: false, error: 'Could not find the selected car. Please try again.' });
        }

        if (!car.fleet_owner_id) {
          return res.status(409).json({ success: false, error: 'This car is not assigned to a fleet owner yet.' });
        }

        fleetOwnerId = car.fleet_owner_id;
      }

      const total = Number(totalAmount);
      const platformCommission = Math.round(total * 0.15 * 100) / 100;
      const payload = {
        car_id: carId,
        client_id: clientId || sourceReservation?.client_id || null,
        fleet_owner_id: fleetOwnerId,
        start_date: startDate,
        end_date: endDate,
        pickup_location: pickupLocation || location,
        dropoff_location: dropoffLocation || pickupLocation || location,
        total_amount: total,
        platform_commission: platformCommission,
        status: 'pending_payment_verification',
        payment_status: 'pending',
        payment_method: paymentMethod || 'ncba_stk',
        payment_provider: 'ncba',
        source_reservation_id: sourceReservationId || null,
        metadata: {
          reservation_context: sourceReservationId ? {
            reservation_id: sourceReservationId,
            continuation_token: reservationContinuationToken || null,
          } : null,
          guest_info: !clientId ? {
            full_name: bookingData.fullName,
            email: bookingData.email,
            phone: bookingData.phone,
            license_number: bookingData.license,
            id_number: bookingData.idNumber || null,
          } : null,
          signature_url: bookingData.signatureUrl,
          documents: bookingData.documents ?? {
            facePhotoUrl: bookingData.facePhotoUrl || null,
            licenseFrontUrl: bookingData.licenseFrontUrl || null,
            licenseBackUrl: bookingData.licenseBackUrl || null,
            idFrontUrl: bookingData.idFrontUrl || null,
            idBackUrl: bookingData.idBackUrl || null,
          },
        },
      };

      if (sourceReservation?.linked_booking_id) {
        const { data: existingBooking, error: existingBookingError } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', sourceReservation.linked_booking_id)
          .maybeSingle();

        if (!existingBookingError && existingBooking) {
          if (existingBooking.payment_status === 'paid') {
            return res.json({ success: true, booking: existingBooking });
          }

          const { data: updatedBooking, error: updateBookingError } = await supabase
            .from('bookings')
            .update(payload)
            .eq('id', existingBooking.id)
            .select()
            .single();

          if (updateBookingError || !updatedBooking) {
            return res.status(500).json({ success: false, error: updateBookingError?.message || 'Failed to update booking.' });
          }

          return res.json({ success: true, booking: updatedBooking });
        }
      }

      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert([payload])
        .select()
        .single();

      if (bookingError || !booking) {
        return res.status(500).json({ success: false, error: bookingError?.message || 'Failed to create booking.' });
      }

      if (clientId) {
        try {
          await supabase
            .from('user_profiles')
            .update({
              id_number: bookingData.idNumber || null,
              face_photo_url: bookingData.facePhotoUrl || null,
              license_front_url: bookingData.licenseFrontUrl || null,
              license_back_url: bookingData.licenseBackUrl || null,
              id_front_url: bookingData.idFrontUrl || null,
              id_back_url: bookingData.idBackUrl || null,
              license_number: bookingData.license || null,
            })
            .eq('id', clientId);
        } catch (err) {
          console.error('Failed to update user profile docs:', err);
        }
      }

      if (sourceReservationId) {
        const { error: reservationUpdateError } = await supabase
          .from('car_reservations')
          .update({
            linked_booking_id: booking.id,
            booking_flow_started_at: new Date().toISOString(),
            booking_flow_initiated_by: bookingFlowInitiatedBy || 'client',
          })
          .eq('id', sourceReservationId);

        if (reservationUpdateError) {
          return res.status(500).json({ success: false, error: reservationUpdateError.message || 'Failed to link booking to reservation.' });
        }
      }

      return res.status(201).json({ success: true, booking });
    } catch (error: any) {
      console.error('[API] Booking create error:', error);
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  });

  app.post('/api/ncba/stk-push', async (req, res) => {
    try {
      const { phone, bookingId } = req.body;

      if (!phone || !bookingId) {
        return res.status(400).json({ success: false, error: 'Missing required fields: phone, bookingId' });
      }

      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('id, status, payment_status, client_id, total_amount')
        .eq('id', bookingId)
        .single();

      if (bookingError || !booking) {
        return res.status(404).json({ success: false, error: 'Booking not found' });
      }

      if (booking.payment_status === 'paid') {
        return res.status(409).json({ success: false, error: 'This booking is already paid' });
      }

      const publicConfig = ncbaService.getPublicConfig();
      const accountNo = 'LINKEDUP CARS BOOKING';
      const result = await ncbaService.initiateSTKPush({
        phone,
        amount: Number(booking.total_amount),
        accountNo,
      });

      const now = new Date().toISOString();
      const { data: paymentRequest, error: paymentError } = await supabase
        .from('payment_requests')
        .insert({
          booking_id: booking.id,
          client_id: booking.client_id || null,
          provider: 'ncba',
          channel: 'stk',
          phone: ncbaService.formatPhone(phone),
          amount: booking.total_amount,
          currency: 'KES',
          paybill_no: publicConfig.paybillNo,
          account_no: accountNo,
          network: publicConfig.network,
          transaction_type: publicConfig.transactionType,
          provider_transaction_id: result.transactionId || null,
          provider_reference_id: result.referenceId || null,
          status: result.success ? 'pending' : 'failed',
          status_code: result.statusCode || null,
          status_description: result.statusDescription || result.error || null,
          raw_initiate_response: result.raw || null,
          updated_at: now,
          failed_at: result.success ? null : now,
        })
        .select()
        .single();

      if (paymentError) {
        return res.status(500).json({ success: false, error: paymentError.message });
      }

      await supabase
        .from('bookings')
        .update({
          status: 'pending_payment_verification',
          payment_status: 'pending',
          payment_method: 'ncba_stk',
          payment_provider: 'ncba',
          payment_reference: result.referenceId || null,
          transaction_code: result.transactionId || null,
        })
        .eq('id', booking.id);

      return res.json({
        success: result.success,
        paymentRequestId: paymentRequest.id,
        transactionId: result.transactionId,
        referenceId: result.referenceId,
        statusCode: result.statusCode,
        statusDescription: result.statusDescription,
        error: result.error,
      });
    } catch (error: any) {
      console.error('[API] NCBA STK Push error:', error);
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  });

  app.post('/api/ncba/query', async (req, res) => {
    try {
      const { paymentRequestId } = req.body;

      if (!paymentRequestId) {
        return res.status(400).json({ success: false, error: 'Missing paymentRequestId' });
      }

      const { data: paymentRequest, error: paymentError } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('id', paymentRequestId)
        .single();

      if (paymentError || !paymentRequest) {
        return res.status(404).json({ success: false, error: 'Payment request not found' });
      }

      if (!paymentRequest.provider_transaction_id) {
        return res.status(400).json({ success: false, error: 'Payment request has no NCBA TransactionID' });
      }

      if (paymentRequest.status === 'success') {
        return res.json({ success: true, paid: true, failed: false, status: 'SUCCESS', description: 'Already confirmed' });
      }

      const result = await ncbaService.querySTKPush(paymentRequest.provider_transaction_id);
      await finalizeNcbaPayment(paymentRequest, result);

      return res.json({
        success: result.success,
        paid: result.paid,
        failed: result.failed,
        status: result.status,
        description: result.description,
        error: result.error,
      });
    } catch (error: any) {
      console.error('[API] NCBA Query error:', error);
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  });

  app.get('/api/ncba/payment-status/:bookingId', async (req, res) => {
    try {
      const { bookingId } = req.params;

      const { data: booking, error } = await supabase
        .from('bookings')
        .select('id, status, payment_status, payment_method, payment_provider, payment_reference, transaction_code')
        .eq('id', bookingId)
        .single();

      if (error || !booking) {
        return res.status(404).json({ success: false, error: 'Booking not found' });
      }

      const { data: paymentRequest } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return res.json({
        success: true,
        bookingId: booking.id,
        status: booking.status,
        paymentStatus: booking.payment_status,
        paid: booking.payment_status === 'paid',
        confirmed: booking.status === 'confirmed',
        paymentRequest,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/ncba/reservations/stk-push', async (req, res) => {
    try {
      const { phone, reservationId } = req.body;

      if (!phone || !reservationId) {
        return res.status(400).json({ success: false, error: 'Missing required fields: phone, reservationId' });
      }

      const { data: reservation, error: reservationError } = await supabase
        .from('car_reservations')
        .select('id, car_id, status, payment_status, client_id, reservation_fee, booking_completion_token')
        .eq('id', reservationId)
        .single();

      if (reservationError || !reservation) {
        return res.status(404).json({ success: false, error: 'Reservation not found' });
      }

      if (reservation.payment_status === 'paid') {
        return res.status(409).json({ success: false, error: 'This reservation is already paid' });
      }

      if (['cancelled', 'expired'].includes(reservation.status)) {
        return res.status(409).json({ success: false, error: 'This reservation is no longer active' });
      }

      const publicConfig = ncbaService.getPublicConfig();
      const accountNo = 'LINKEDUP CARS RESERVATION';
      const amount = Number(reservation.reservation_fee);
      const result = await ncbaService.initiateSTKPush({
        phone,
        amount,
        accountNo,
      });

      const now = new Date().toISOString();
      const { data: paymentRequest, error: paymentError } = await supabase
        .from('reservation_payment_requests')
        .insert({
          reservation_id: reservation.id,
          client_id: reservation.client_id || null,
          provider: 'ncba',
          channel: 'stk',
          phone: ncbaService.formatPhone(phone),
          amount,
          currency: 'KES',
          paybill_no: publicConfig.paybillNo,
          account_no: accountNo,
          network: publicConfig.network,
          transaction_type: publicConfig.transactionType,
          provider_transaction_id: result.transactionId || null,
          provider_reference_id: result.referenceId || null,
          status: result.success ? 'pending' : 'failed',
          status_code: result.statusCode || null,
          status_description: result.statusDescription || result.error || null,
          raw_initiate_response: result.raw || null,
          updated_at: now,
          failed_at: result.success ? null : now,
        })
        .select()
        .single();

      if (paymentError) {
        return res.status(500).json({ success: false, error: paymentError.message });
      }

      await supabase
        .from('car_reservations')
        .update({
          status: 'pending_payment',
          payment_status: 'pending',
          payment_method: 'ncba_stk',
          payment_provider: 'ncba',
          payment_reference: result.referenceId || null,
          transaction_code: result.transactionId || null,
        })
        .eq('id', reservation.id);

      return res.json({
        success: result.success,
        paymentRequestId: paymentRequest.id,
        transactionId: result.transactionId,
        referenceId: result.referenceId,
        statusCode: result.statusCode,
        statusDescription: result.statusDescription,
        error: result.error,
      });
    } catch (error: any) {
      console.error('[API] NCBA Reservation STK Push error:', error);
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  });

  app.post('/api/ncba/reservations/query', async (req, res) => {
    try {
      const { paymentRequestId } = req.body;

      if (!paymentRequestId) {
        return res.status(400).json({ success: false, error: 'Missing paymentRequestId' });
      }

      const { data: paymentRequest, error: paymentError } = await supabase
        .from('reservation_payment_requests')
        .select('*')
        .eq('id', paymentRequestId)
        .single();

      if (paymentError || !paymentRequest) {
        return res.status(404).json({ success: false, error: 'Reservation payment request not found' });
      }

      if (!paymentRequest.provider_transaction_id) {
        return res.status(400).json({ success: false, error: 'Payment request has no NCBA TransactionID' });
      }

      if (paymentRequest.status === 'success') {
        return res.json({ success: true, paid: true, failed: false, status: 'SUCCESS', description: 'Already confirmed' });
      }

      const result = await ncbaService.querySTKPush(paymentRequest.provider_transaction_id);
      await finalizeReservationNcbaPayment(paymentRequest, result);

      return res.json({
        success: result.success,
        paid: result.paid,
        failed: result.failed,
        status: result.status,
        description: result.description,
        error: result.error,
      });
    } catch (error: any) {
      console.error('[API] NCBA Reservation Query error:', error);
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  });

  app.get('/api/ncba/reservations/payment-status/:reservationId', async (req, res) => {
    try {
      const { reservationId } = req.params;

      const { data: reservation, error } = await supabase
        .from('car_reservations')
        .select('id, car_id, status, payment_status, payment_method, payment_provider, payment_reference, transaction_code, booking_completion_token, linked_booking_id')
        .eq('id', reservationId)
        .single();

      if (error || !reservation) {
        return res.status(404).json({ success: false, error: 'Reservation not found' });
      }

      const { data: paymentRequest } = await supabase
        .from('reservation_payment_requests')
        .select('*')
        .eq('reservation_id', reservationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return res.json({
        success: true,
        reservationId: reservation.id,
        status: reservation.status,
        paymentStatus: reservation.payment_status,
        paid: reservation.payment_status === 'paid',
        reserved: reservation.status === 'reserved' || reservation.status === 'confirmed',
        linkedBookingId: reservation.linked_booking_id || null,
        reservationToken: reservation.booking_completion_token || null,
        paymentRequest,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/reservations/continuation/:token', async (req, res) => {
    try {
      const { token } = req.params;

      const { data: reservation, error } = await supabase
        .from('car_reservations')
        .select('id, car_id, start_date, end_date, reservation_fee, total_amount, status, payment_status, contact_name, contact_email, contact_phone, linked_booking_id')
        .eq('booking_completion_token', token)
        .single();

      if (error || !reservation) {
        return res.status(404).json({ success: false, error: 'Reservation continuation link not found' });
      }

      if (reservation.payment_status !== 'paid' || !['reserved', 'confirmed'].includes(reservation.status)) {
        return res.status(409).json({ success: false, error: 'This reservation is not ready for booking completion' });
      }

      const estimatedBookingAmount = Math.max(Number(reservation.total_amount || 0) - Number(reservation.reservation_fee || 0), 0);

      return res.json({
        success: true,
        reservationId: reservation.id,
        carId: reservation.car_id,
        startDate: reservation.start_date,
        endDate: reservation.end_date,
        contactName: reservation.contact_name,
        contactEmail: reservation.contact_email,
        contactPhone: reservation.contact_phone,
        estimatedBookingAmount,
        reservationFee: Number(reservation.reservation_fee || 0),
        linkedBookingId: reservation.linked_booking_id || null,
        bookingData: {
          startDate: reservation.start_date,
          endDate: reservation.end_date,
          fullName: reservation.contact_name,
          email: reservation.contact_email,
          phone: reservation.contact_phone,
          sourceReservationId: reservation.id,
          reservationContinuationToken: token,
          bookingFlowInitiatedBy: 'client',
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  });

  // ─── CAR SHARE — OG TAG SERVING FOR SOCIAL CRAWLERS ─────────────────
  // WhatsApp/Telegram/Facebook crawlers don't run JS, so we serve OG HTML
  // server-side. Real users get next() → React SPA handles the route.
  app.get('/cars/:id', async (req: any, res: any, next: any) => {
    const ua = req.headers['user-agent'] || '';
    const isCrawler = /facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegram|slackbot|discordbot|googlebot|bingbot|applebot|pinterest|snapchat|skype|yahoo|bot|crawl|spider/i.test(ua);
    if (!isCrawler) return next();

    try {
      const { data: car } = await supabase
        .from('cars')
        .select('id, make, model, year, daily_rate, seats, transmission, primary_image_url, photos, description')
        .eq('id', req.params.id)
        .single();
      if (!car) return next();

      const carImage = car.primary_image_url ||
        (Array.isArray(car.photos) && car.photos[0]) ||
        'https://linkedupcarsrentals.com/logo.png';
      const carTitle = `${car.make} ${car.model} ${car.year} | Hire in Nairobi — LinkedUp Cars`;
      const carDesc  = `Book the ${car.make} ${car.model} (${car.year}) in Nairobi from KES ${Number(car.daily_rate).toLocaleString()}/day. ${car.seats} seats · ${car.transmission}. Tap to book instantly.`;
      const carUrl   = `https://linkedupcarsrentals.com/cars/${car.id}?booking=true`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8">
  <title>${carTitle}</title>
  <meta name="description" content="${carDesc}">
  <meta property="og:title"       content="${carTitle}">
  <meta property="og:description" content="${carDesc}">
  <meta property="og:image"       content="${carImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url"         content="${carUrl}">
  <meta property="og:type"        content="product">
  <meta property="og:site_name"   content="LinkedUp Cars">
  <meta name="twitter:card"       content="summary_large_image">
  <meta name="twitter:title"      content="${carTitle}">
  <meta name="twitter:description" content="${carDesc}">
  <meta name="twitter:image"      content="${carImage}">
  <meta http-equiv="refresh" content="0; url=${carUrl}">
  <script>window.location.replace("${carUrl}");</script>
</head><body>
  <p>Redirecting&#8230; <a href="${carUrl}">${carTitle}</a></p>
</body></html>`);
    } catch (_) {
      next();
    }
  });

  

export default app;
