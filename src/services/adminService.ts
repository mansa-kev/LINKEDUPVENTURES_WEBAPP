import { supabase, handleSupabaseErrorWrapper } from '../lib/supabase';
import { logger } from '../utils/logger';
import { Car } from '../types';
import { getOrSetCache, invalidateCachePrefix } from '../utils/queryCache';
const handleSupabaseError = handleSupabaseErrorWrapper;
const ADMIN_CACHE_TTL_MS = 60_000;

export const adminService = {
  // --- Dashboard ---
  getDashboardStats: async (timeRange: '7d' | '30d' | '3m' | '6m' | '1y' = '7d') => {
    return getOrSetCache(`admin:dashboard:${timeRange}`, ADMIN_CACHE_TTL_MS, async () => {
    try {
      const now = new Date();
      let startDate = new Date();
      let previousStartDate = new Date();
      
      switch (timeRange) {
        case '7d':
          startDate.setDate(now.getDate() - 7);
          previousStartDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          previousStartDate.setDate(startDate.getDate() - 30);
          break;
        case '3m':
          startDate.setMonth(now.getMonth() - 3);
          previousStartDate.setMonth(startDate.getMonth() - 3);
          break;
        case '6m':
          startDate.setMonth(now.getMonth() - 6);
          previousStartDate.setMonth(startDate.getMonth() - 6);
          break;
        case '1y':
          startDate.setFullYear(now.getFullYear() - 1);
          previousStartDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }

      const { data: bookings, error: bError } = await supabase
        .from('bookings')
        .select('total_amount, platform_commission, status, payment_status, created_at, car_id, client_id, cars(make, model, year)')
        .gte('created_at', previousStartDate.toISOString())
        .in('status', ['confirmed', 'completed'])
        .eq('payment_status', 'paid');
      if (bError) throw bError;

      const { data: cars, error: cError } = await supabase
        .from('cars')
        .select('status');
      if (cError) throw cError;

      const { data: users, error: uError } = await supabase
        .from('user_profiles')
        .select('id, role, created_at');
      if (uError) throw uError;

      // Filter bookings by current and previous periods
      const currentBookings = bookings?.filter(b => new Date(b.created_at) >= startDate) || [];
      const previousBookings = bookings?.filter(b => new Date(b.created_at) >= previousStartDate && new Date(b.created_at) < startDate) || [];

      // Current Period Stats
      const totalRevenue = currentBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
      const netCommission = currentBookings.reduce((sum, b) => sum + (b.platform_commission || 0), 0);
      const activeBookings = currentBookings.filter(b => b.status === 'confirmed').length;

      // Previous Period Stats
      const prevTotalRevenue = previousBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
      const prevNetCommission = previousBookings.reduce((sum, b) => sum + (b.platform_commission || 0), 0);
      const prevActiveBookings = previousBookings.filter(b => b.status === 'confirmed').length;

      // Calculate Trend Percentages
      const calculateTrend = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
      };

      const revenueTrendPercent = calculateTrend(totalRevenue, prevTotalRevenue);
      const commissionTrendPercent = calculateTrend(netCommission, prevNetCommission);
      const activeBookingsTrendPercent = calculateTrend(activeBookings, prevActiveBookings);

      const totalCars = cars?.length || 0;
      const maintenanceCars = cars?.filter(c => c.status === 'maintenance').length || 0;
      const newClients = users?.filter(u => u.role === 'client' && new Date(u.created_at) >= startDate).length || 0;
      const newFleetOwners = users?.filter(u => u.role === 'fleet_owner' && new Date(u.created_at) >= startDate).length || 0;

      // Calculate revenue trend for chart based on timeRange
      let revenueTrend = [];
      if (timeRange === '7d' || timeRange === '30d') {
        const days = timeRange === '7d' ? 7 : 30;
        const lastDays = [...Array(days)].map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          return d.toISOString().split('T')[0];
        }).reverse();

        revenueTrend = lastDays.map(date => {
          const dayBookings = currentBookings.filter(b => b.created_at.startsWith(date));
          return {
            name: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            gross: dayBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0),
            net: dayBookings.reduce((sum, b) => sum + (b.platform_commission || 0), 0),
          };
        });
      } else {
        // Group by month for 3m, 6m, 1y
        const months = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
        const lastMonths = [...Array(months)].map((_, i) => {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }).reverse();

        revenueTrend = lastMonths.map(monthStr => {
          const monthBookings = currentBookings.filter(b => b.created_at.startsWith(monthStr));
          const [year, month] = monthStr.split('-');
          const date = new Date(parseInt(year), parseInt(month) - 1, 1);
          return {
            name: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
            gross: monthBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0),
            net: monthBookings.reduce((sum, b) => sum + (b.platform_commission || 0), 0),
          };
        });
      }

      // Top 5 Most Booked Cars
      const carBookingCounts: Record<string, { count: number; name: string }> = {};
      currentBookings.forEach(b => {
        if (b.car_id && b.cars) {
          const carData = Array.isArray(b.cars) ? b.cars[0] : b.cars;
          if (!carBookingCounts[b.car_id]) {
            carBookingCounts[b.car_id] = { count: 0, name: `${(carData as any).make} ${(carData as any).model} (${(carData as any).year})` };
          }
          carBookingCounts[b.car_id].count++;
        }
      });
      const topCars = Object.values(carBookingCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Client Churn Rate
      // Clients who booked in the previous period but NOT in the current period
      const clientsInPrevPeriod = new Set(previousBookings.map(b => b.client_id));
      const clientsInCurrentPeriod = new Set(currentBookings.map(b => b.client_id));
      
      let churnRate = 0;
      if (clientsInPrevPeriod.size > 0) {
        let churnedClients = 0;
        clientsInPrevPeriod.forEach(clientId => {
          if (!clientsInCurrentPeriod.has(clientId)) {
            churnedClients++;
          }
        });
        churnRate = Math.round((churnedClients / clientsInPrevPeriod.size) * 100);
      }

      return {
        totalRevenue,
        revenueTrendPercent,
        netCommission,
        commissionTrendPercent,
        activeBookings,
        activeBookingsTrendPercent,
        totalCars,
        maintenanceCars,
        newClients,
        newFleetOwners,
        revenueTrend,
        topCars,
        churnRate,
        bookingStatusDistribution: [
          { name: 'Active', value: activeBookings, color: '#10B981' },
          { name: 'Completed', value: currentBookings.filter(b => b.status === 'completed').length, color: '#3B82F6' },
        ]
      };
    } catch (error) {
      logger.error('[getDashboardStats] Raw error:', error);
      // Return safe default stats object so dashboard renders empty rather than crashing
      return {
        totalRevenue: 0,
        revenueTrendPercent: 0,
        netCommission: 0,
        commissionTrendPercent: 0,
        activeBookings: 0,
        activeBookingsTrendPercent: 0,
        totalCars: 0,
        maintenanceCars: 0,
        newClients: 0,
        newFleetOwners: 0,
        revenueTrend: [],
        topCars: [],
        churnRate: 0,
        bookingStatusDistribution: [
          { name: 'Active', value: 0, color: '#10B981' },
          { name: 'Completed', value: 0, color: '#3B82F6' },
        ]
      };
    }
    });
  },

  // --- Reservations ---
  getReservationStats: async () => {
    return getOrSetCache('admin:reservationStats', ADMIN_CACHE_TTL_MS, async () => {
    try {
      const { data, error } = await supabase
        .from('car_reservations')
        .select('reservation_fee, total_amount, status, payment_status, created_at')
        .eq('payment_status', 'paid');

      if (error) throw error;

      const totalReservationFees = data?.reduce((sum, r) => sum + (r.reservation_fee || 0), 0) || 0;
      const totalReservationValue = data?.reduce((sum, r) => sum + (r.total_amount || 0), 0) || 0;
      const activeReservations = data?.filter(r => r.status === 'reserved').length || 0;
      const confirmedReservations = data?.filter(r => r.status === 'confirmed').length || 0;

      return {
        totalReservationFees,      // fees collected (non-refundable)
        totalReservationValue,     // full value of all reservations
        activeReservations,
        confirmedReservations,
        count: data?.length || 0
      };
    } catch (error) {
      return handleSupabaseErrorWrapper(error, 'getReservationStats');
    }
    });
  },

  // --- Bookings ---
  getBookings: async (page: number = 1, pageSize: number = 20) => {
    return getOrSetCache(`admin:bookings:${page}:${pageSize}`, 30_000, async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from('bookings')
        .select(`
          id,
          client_id,
          car_id,
          driver_id,
          fleet_owner_id,
          start_date,
          end_date,
          total_amount,
          platform_commission,
          status,
          payment_status,
          document_status,
          admin_notes,
          is_flagged,
          flag_reason,
          sub_status,
          pickup_confirmed_at,
          return_confirmed_at,
          return_condition,
          overtime_hours,
          overtime_charge,
          created_at,
          metadata,
          cars (
            id,
            make,
            model,
            images,
            image_url
          ),
          client:user_profiles!bookings_client_id_fkey (
            id,
            full_name,
            email,
            phone_number
          ),
          fleet_owner:user_profiles!bookings_fleet_owner_id_fkey (
            id,
            full_name,
            email
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) return handleSupabaseErrorWrapper(error, 'getBookings');
      return { data, count };
    });
  },

  createConciergeBooking: async (bookingData: any) => {
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
          bookingFlowInitiatedBy: 'admin_concierge'
        }),
      });

      const rawResponse = await response.text();
      const result = rawResponse ? JSON.parse(rawResponse) : null;

      if (!response.ok || result?.error || !result?.booking) {
        throw new Error(result?.error || rawResponse || 'Failed to create concierge booking');
      }

      // If it's a bank transfer, we might need to manually update payment_status in a subsequent call, 
      // but the API endpoint handles the initial insert.
      return result.booking;
    } catch (error) {
      return handleSupabaseErrorWrapper(error, 'createConciergeBooking');
    }
  },

  confirmBankTransferPayment: async (bookingId: string, reference: string) => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .update({
          status: 'confirmed',
          payment_status: 'paid',
          payment_method: 'bank_transfer',
          payment_provider: 'bank_transfer',
          payment_reference: reference,
          transaction_code: reference,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)
        .select();

      if (error) throw error;
      invalidateCachePrefix('admin:bookings:');
      invalidateCachePrefix('admin:dashboard:');
      return data;
    } catch (error) {
      return handleSupabaseErrorWrapper(error, 'confirmBankTransferPayment');
    }
  },

  updateBookingStatus: async (id: string, status: string) => {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'updateBookingStatus');
    invalidateCachePrefix('admin:bookings:');
    invalidateCachePrefix('admin:dashboard:');
    return data;
  },

  // --- Cars ---
  getCars: async (page: number = 1, pageSize: number = 20) => {
    return getOrSetCache(`admin:cars:${page}:${pageSize}`, ADMIN_CACHE_TTL_MS, async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from('cars')
        .select(`
          *,
          fleet_owner:user_profiles (
            *,
            fleet_owner_settings (*)
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) return handleSupabaseErrorWrapper(error, 'getCars');

      const normalizedData = (data || []).map((car: any) => {
        if (car.fleet_owner) {
          const settings = car.fleet_owner.fleet_owner_settings;
          const settingsArray = settings
            ? (Array.isArray(settings) ? settings : [settings])
            : [];
          return {
            ...car,
            fleet_owner: {
              ...car.fleet_owner,
              fleet_owner_settings: settingsArray
            }
          };
        }
        return car;
      });

      return { data: normalizedData, count };
    });
  },

  uploadCarImage: async (file: File): Promise<string> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `car_images/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('public_assets')
        .upload(filePath, file);

      if (uploadError) {
        logger.error('Error uploading image:', uploadError);
        // Fallback to a placeholder if bucket doesn't exist
        return `https://picsum.photos/seed/${fileName}/800/600`;
      }

      const { data } = supabase.storage
        .from('public_assets')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (err) {
      logger.error('Failed to upload image:', err);
      return `https://picsum.photos/seed/${Math.random()}/800/600`;
    }
  },

  addCar: async (car: Partial<Car> & { fleet_owner?: string, fleet_owner_details?: any }) => {
    // Handle empty date fields - convert empty strings to null
    // Extract fleet_owner (frontend field) and remap to fleet_owner_id (DB column)
    const { fleet_owner, fleet_owner_details, ...cleanCar } = car;
    
    const processedCar = {
      ...cleanCar,
      fleet_owner_id: fleet_owner || null,
      next_service_date: cleanCar.next_service_date || null,
      last_maintenance_date: cleanCar.last_maintenance_date || null
    };
    
    const { data, error } = await supabase
      .from('cars')
      .insert([processedCar])
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'addCar');
    invalidateCachePrefix('admin:cars:');
    invalidateCachePrefix('admin:dashboard:');
    return data;
  },

  updateCar: async (id: string, updates: any) => {
    // Extract fleet_owner (frontend field) and remap to fleet_owner_id (DB column)
    const { fleet_owner, fleet_owner_details, ...cleanUpdates } = updates;
    
    // Handle empty date fields and map fleet_owner to fleet_owner_id
    const processedUpdates = {
      ...cleanUpdates,
      fleet_owner_id: fleet_owner || null,
      next_service_date: cleanUpdates.next_service_date || null,
      last_maintenance_date: cleanUpdates.last_maintenance_date || null
    };
    
    const { data, error } = await supabase
      .from('cars')
      .update(processedUpdates)
      .eq('id', id)
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'updateCar');
    invalidateCachePrefix('admin:cars:');
    invalidateCachePrefix('admin:dashboard:');
    return data;
  },

  deleteCar: async (id: string) => {
    const { error } = await supabase
      .from('cars')
      .delete()
      .eq('id', id);
    if (error) return handleSupabaseErrorWrapper(error, 'deleteCar');
    invalidateCachePrefix('admin:cars:');
    invalidateCachePrefix('admin:dashboard:');
  },

  // --- Users ---
  getUsers: async () => {
    return getOrSetCache('admin:users', ADMIN_CACHE_TTL_MS, async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, phone_number, role, status, created_at, last_login, avatar_url')
        .order('created_at', { ascending: false });
      if (error) return handleSupabaseErrorWrapper(error, 'getUsers');
      return data;
    });
  },

  updateUserRole: async (id: string, role: string) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ role })
      .eq('id', id)
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'updateUserRole');
    invalidateCachePrefix('admin:users');
    invalidateCachePrefix('admin:dashboard:');
    return data;
  },

  updateUserStatus: async (id: string, status: string) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ status })
      .eq('id', id)
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'updateUserStatus');
    invalidateCachePrefix('admin:users');
    return data;
  },

  deleteUser: async (id: string) => {
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: { userId: id }
    });

    if (error) {
      console.error('Delete user Edge Function error:', error);
      throw new Error(error.message || 'Failed to delete user');
    }

    if (data?.error) {
      console.error('Delete user API error:', data.error);
      throw new Error(data.error || 'Failed to delete user');
    }

    invalidateCachePrefix('admin:users');
    invalidateCachePrefix('admin:dashboard:');

    return true;
  },

  // --- Settings ---
  getSettings: async () => {
    const { data, error } = await supabase
      .from('settings')
      .select('*');
    if (error) return handleSupabaseErrorWrapper(error, 'getSettings');
    return data;
  },

  updateSetting: async (key: string, value: any) => {
    const { data, error } = await supabase
      .from('settings')
      .upsert({ key, value, updated_at: new Date().toISOString() })
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'updateSetting');
    return data;
  },

  getAdmins: async () => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('role', 'admin')
      .order('created_at', { ascending: false });
    if (error) return handleSupabaseErrorWrapper(error, 'getAdmins');
    return data;
  },

  addAdmin: async (email: string) => {
    // This is tricky because we need to find the user by email first.
    // Assuming we have a way to find user by email or the user is already in user_profiles.
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ role: 'admin' })
      .eq('email', email) // Assuming email is in user_profiles
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'addAdmin');
    return data;
  },

  removeAdmin: async (id: string) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ role: 'client' })
      .eq('id', id)
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'removeAdmin');
    return data;
  },

  // --- Fleet Owners ---
  getFleetOwnersWithStats: async () => {
    const { data: owners, error } = await supabase
      .from('user_profiles')
      .select(`
        *,
        fleet_owner_settings (*),
        cars (id),
        bookings!bookings_fleet_owner_id_fkey (total_amount, status, payment_status, start_date, end_date)
      `)
      .eq('role', 'fleet_owner');
      
    if (error) return handleSupabaseErrorWrapper(error, 'getFleetOwnersWithStats');
    
    // Normalize fleet_owner_settings to an array to match UI assumptions
    const normalizedOwners = (owners || []).map((owner: any) => {
      const settings = owner.fleet_owner_settings;
      const settingsArray = settings
        ? (Array.isArray(settings) ? settings : [settings])
        : [];
      return {
        ...owner,
        fleet_owner_settings: settingsArray
      };
    });

    const { data: payouts } = await supabase
      .from('payouts')
      .select('*');

    const { data: reviews } = await supabase
      .from('reviews')
      .select('user_id, rating');
      
    return normalizedOwners.map(owner => {
      const confirmedBookings = owner.bookings?.filter((b: any) => 
        (b.status === 'completed' || b.status === 'confirmed') && b.payment_status === 'paid'
      ) || [];

      const totalEarnings = confirmedBookings
        .reduce((sum: number, b: any) => sum + Number(b.total_amount), 0);

      const ownerPayouts = payouts?.filter(p => p.fleet_owner_id === owner.id) || [];
      const pendingPayouts = ownerPayouts.filter(p => p.status === 'pending')
        .reduce((sum: number, p: any) => sum + Math.abs(Number(p.amount)), 0);
      const payoutHistory = ownerPayouts.filter(p => p.status === 'completed');

      // Avg rating from reviews left on bookings for this owner's cars
      const ownerReviews = reviews?.filter(r => {
        const booking = owner.bookings?.find((b: any) => b.client_id === r.user_id);
        return !!booking;
      }) || [];
      const avgRating = ownerReviews.length > 0
        ? (ownerReviews.reduce((s: number, r: any) => s + Number(r.rating), 0) / ownerReviews.length).toFixed(1)
        : null;

      // Utilization: booked days / (total cars × 30 days window)
      const totalCars = owner.cars?.length || 0;
      let bookedDays = 0;
      confirmedBookings.forEach((b: any) => {
        if (b.start_date && b.end_date) {
          const days = Math.max(1, Math.round((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86400000));
          bookedDays += days;
        }
      });
      const avgUtilization = totalCars > 0 ? Math.min(100, Math.round((bookedDays / (totalCars * 30)) * 100)) : 0;
      
      return {
        ...owner,
        total_cars: totalCars,
        total_earnings: totalEarnings,
        pending_payouts: pendingPayouts,
        payout_history: payoutHistory,
        avg_utilization: avgUtilization,
        avg_rating: avgRating
      };
    });
  },

  getFleetOwners: async () => {
    return getOrSetCache('admin:fleetOwners', ADMIN_CACHE_TTL_MS, async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select(`
          id,
          full_name,
          email,
          phone_number,
          role,
          status,
          fleet_owner_settings (
            company_name,
            commission_rate
          )
        `)
        .eq('role', 'fleet_owner');
      if (error) return handleSupabaseErrorWrapper(error, 'getFleetOwners');

      const normalizedData = (data || []).map((owner: any) => {
        const settings = owner.fleet_owner_settings;
        const settingsArray = settings
          ? (Array.isArray(settings) ? settings : [settings])
          : [];
        return {
          ...owner,
          fleet_owner_settings: settingsArray
        };
      });

      return normalizedData;
    });
  },

  createFleetOwnerAccount: async (data: any) => {
    const { data: resData, error: invokeError } = await supabase.functions.invoke('create-user', {
      body: {
        email: data.email,
        password: data.password || 'Fleet123!',
        role: 'fleet_owner',
        fullName: data.contact_name,
        phoneNumber: data.phone_number,
        companyName: data.company_name,
        commissionRate: data.commission_rate
      }
    });

    if (invokeError) {
      throw new Error(invokeError.message || 'Failed to create fleet owner account');
    }
    if (resData?.error) {
      throw new Error(resData.error || 'Failed to create fleet owner account');
    }

    const userId = resData.userId;

    // Send welcome email
    try {
      const { sendTemplatedEmail } = await import('./emailProvider');
      await sendTemplatedEmail(data.email, 'fleet_owner_welcome', {
        name: data.contact_name,
        email: data.email,
      });
    } catch (emailErr) {
      logger.error('Failed to send fleet owner welcome email:', emailErr);
    }

    // In-app welcome message
    const { data: adminUser } = await supabase.auth.getUser();
    if (adminUser.user) {
      await supabase.from('messages').insert({
        sender_id: adminUser.user.id,
        receiver_id: userId,
        subject: 'Welcome to LinkedUp Cars - Fleet Owner Account',
        content: `Hello ${data.contact_name},\n\nYour Fleet Owner account has been created.\n\nLogin Email: ${data.email}\nTemporary Password: ${data.password || 'Fleet123!'}\n\nPlease log in and change your password immediately.`,
        status: 'unread'
      });
    }

    invalidateCachePrefix('admin:fleetOwners');
    invalidateCachePrefix('admin:users');
    invalidateCachePrefix('admin:dashboard:');

    return { id: userId, email: data.email };
  },

  addFleetOwner: async (owner: any) => {
    // This would typically involve creating a user profile and fleet owner settings.
    // For now, let's assume we are just updating an existing user to be a fleet owner.
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ role: 'fleet_owner' })
      .eq('id', owner.id)
      .select();
    if (error) throw error;

    const { error: settingsError } = await supabase
      .from('fleet_owner_settings')
      .upsert({ id: owner.id, ...owner.settings });
    if (settingsError) throw settingsError;

    invalidateCachePrefix('admin:fleetOwners');
    invalidateCachePrefix('admin:users');

    return data;
  },

  updateFleetOwner: async (id: string, updates: any) => {
    const { error } = await supabase
      .from('fleet_owner_settings')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
    invalidateCachePrefix('admin:fleetOwners');
    invalidateCachePrefix('admin:dashboard:');
  },

  deleteFleetOwner: async (id: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    // Delete fleet_owner_settings first (FK constraint)
    await supabase.from('fleet_owner_settings').delete().eq('id', id);

    // Revert profile role to client (preserves booking history)
    const { error } = await supabase
      .from('user_profiles')
      .update({ role: 'client' })
      .eq('id', id);
    if (error) throw error;
    invalidateCachePrefix('admin:fleetOwners');
    invalidateCachePrefix('admin:users');

    // Hard-delete from Supabase Auth if service role key is available
    if (serviceRoleKey) {
      const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
        },
      });
      if (!res.ok) {
        logger.warn('Could not delete auth user (non-fatal):', await res.text());
      }
    }
  },

  updateFleetOwnerSettings: async (id: string, settings: any) => {
    const { data, error } = await supabase
      .from('fleet_owner_settings')
      .upsert({ id, ...settings })
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'updateFleetOwnerSettings');

    // Sync status/role with user_profiles if settings status is changed
    if (settings.status === 'active') {
      await supabase
        .from('user_profiles')
        .update({ role: 'fleet_owner', status: 'active' })
        .eq('id', id);
    } else if (settings.status === 'suspended') {
      await supabase
        .from('user_profiles')
        .update({ status: 'suspended' })
        .eq('id', id);
    }

    invalidateCachePrefix('admin:fleetOwners');
    invalidateCachePrefix('admin:users');
    invalidateCachePrefix('admin:dashboard:');

    return data;
  },

  resetFleetOwnerPassword: async (email: string) => {
    const fleetUrl = import.meta.env.VITE_FLEET_URL || 'https://fleet.linkedupcarsrentals.com';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${fleetUrl}/login`,
    });
    if (error) return handleSupabaseErrorWrapper(error, 'resetFleetOwnerPassword');
  },

  // --- Financials ---
  getFinancials: async () => {
    try {
      logger.log('Fetching financials with confirmed bookings filter...');
      
      // Fetch only paid bookings with active statuses
      const { data: confirmedBookings, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          *,
          cars(
            make,
            model,
            daily_rate,
            fleet_owner_id
          ),
          client:user_profiles(
            full_name,
            email
          )
        `)
        .eq('payment_status', 'paid')
        .in('status', ['confirmed', 'completed'])
        .order('created_at', { ascending: false });
      
      if (bookingsError) {
        logger.error('Bookings query error:', bookingsError);
        throw bookingsError;
      }
      
      logger.log('Confirmed bookings fetched:', confirmedBookings?.length || 0);

      // Fetch transactions (for historical data that might be manually recorded)
      const { data: transactions, error: tError } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });
      if (tError) throw tError;

      // Fetch expenses
      const { data: expenses, error: eError } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false });
      if (eError) throw eError;

      // Calculate revenue from confirmed bookings only
      const totalRevenue = confirmedBookings?.reduce((sum, booking) => sum + Number(booking.total_amount), 0) || 0;

      // Calculate payouts from completed bookings with paid status
      const completedPaidBookings = confirmedBookings?.filter(b => b.status === 'completed') || [];
      const totalPayouts = completedPaidBookings.reduce((sum, booking) => {
        // Assuming 15% commission goes to fleet owner (85% to platform)
        const commissionRate = 0.15;
        return sum + (Number(booking.total_amount) * commissionRate);
      }, 0);

      const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

      // Group by month for chart - only include confirmed paid bookings
      const monthlyData: Record<string, { revenue: number, payouts: number }> = {};
      confirmedBookings?.forEach(booking => {
        const month = new Date(booking.created_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        if (!monthlyData[month]) monthlyData[month] = { revenue: 0, payouts: 0 };
        
        monthlyData[month].revenue += Number(booking.total_amount);
        
        // Add payout if booking is completed
        if (booking.status === 'completed') {
          const commissionRate = 0.15;
          monthlyData[month].payouts += Number(booking.total_amount) * commissionRate;
        }
      });

      const chartData = Object.entries(monthlyData).map(([name, data]) => ({ name, ...data })).reverse();

      logger.log('Financials calculated:', { totalRevenue, totalPayouts, totalExpenses });

      return { 
        transactions: transactions || [], 
        expenses: expenses || [],
        totalRevenue,
        totalPayouts,
        totalExpenses,
        chartData
      };
    } catch (error) {
      logger.error('getFinancials error:', error);
      return handleSupabaseErrorWrapper(error, 'getFinancials');
    }
  },

  // --- Payouts ---
  getPayouts: async () => {
    // First get all payout transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('type', 'payout_out')
      .order('created_at', { ascending: false });
    
    if (txError) return handleSupabaseErrorWrapper(txError, 'getPayouts');
    
    // Then get user profiles for each transaction
    const userIds = [...new Set(transactions?.map(t => t.user_id) || [])];
    if (userIds.length === 0) return [];
    
    const { data: profiles, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', userIds);
    
    if (profileError) return handleSupabaseErrorWrapper(profileError, 'getPayouts');
    
    // Combine the data
    return transactions?.map(tx => ({
      ...tx,
      user_profile: profiles?.find(p => p.id === tx.user_id)
    })) || [];
  },

  approvePayouts: async (ids: string[]) => {
    const { data, error } = await supabase
      .from('transactions')
      .update({ status: 'completed' })
      .in('id', ids)
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'approvePayouts');
    return data;
  },

  getTransactions: async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        bookings (*),
        user_profiles (*)
      `)
      .order('created_at', { ascending: false });
    if (error) return handleSupabaseErrorWrapper(error, 'getTransactions');
    return data;
  },

  getExpenses: async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false });
    if (error) return handleSupabaseErrorWrapper(error, 'getExpenses');
    return data;
  },

  addExpense: async (expense: any) => {
    const { data, error } = await supabase
      .from('expenses')
      .insert([expense])
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'addExpense');
    return data;
  },

  // --- Pricing ---
  getPricingRules: async () => {
    const { data, error } = await supabase
      .from('pricing_rules')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return handleSupabaseErrorWrapper(error, 'getPricingRules');
    return data;
  },

  addPricingRule: async (rule: any) => {
    const { data, error } = await supabase
      .from('pricing_rules')
      .insert([rule])
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'addPricingRule');
    return data;
  },

  updatePricingRule: async (id: string, updates: any) => {
    const { data, error } = await supabase
      .from('pricing_rules')
      .update(updates)
      .eq('id', id)
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'updatePricingRule');
    return data;
  },

  deletePricingRule: async (id: string) => {
    const { error } = await supabase
      .from('pricing_rules')
      .delete()
      .eq('id', id);
    if (error) return handleSupabaseErrorWrapper(error, 'deletePricingRule');
  },

  // --- Coupons (Removed duplicate) ---

  // --- Reviews ---
  getReviews: async () => {
    const { data, error } = await supabase
      .from('reviews')
      .select(`
        *,
        user_profiles (full_name),
        cars (*)
      `)
      .order('created_at', { ascending: false });
    if (error) return handleSupabaseErrorWrapper(error, 'getReviews');
    return data;
  },

  updateReviewStatus: async (id: string, status: string) => {
    const { data, error } = await supabase
      .from('reviews')
      .update({ status })
      .eq('id', id)
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'updateReviewStatus');
    return data;
  },

  deleteReview: async (id: string) => {
    const { error } = await supabase
      .from('reviews')
      .delete()
      .eq('id', id);
    if (error) return handleSupabaseErrorWrapper(error, 'deleteReview');
  },

  // --- Reports ---
  getReports: async () => {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return handleSupabaseErrorWrapper(error, 'getReports');
    return data;
  },

  getReportStats: async () => {
    try {
      const { count: userCount } = await supabase.from('user_profiles').select('*', { count: 'exact', head: true });
      const { data: cars } = await supabase.from('cars').select('status');
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { count: newUsersCount } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());

      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const { count: prevUsersCount } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sixtyDaysAgo.toISOString())
        .lt('created_at', thirtyDaysAgo.toISOString());

      const platformGrowth = prevUsersCount && prevUsersCount > 0 
        ? ((newUsersCount || 0) / prevUsersCount) * 100 
        : (newUsersCount || 0) > 0 ? 100 : 0;

      const operationalCars = cars?.filter(c => c.status !== 'maintenance').length || 0;
      const fleetHealth = cars?.length ? (operationalCars / cars.length) * 100 : 100;

      return {
        platformGrowth: Number(platformGrowth.toFixed(1)),
        activeUsers: userCount || 0,
        fleetHealth: Number(fleetHealth.toFixed(1)),
        newUsers: newUsersCount || 0
      };
    } catch (error) {
      return { platformGrowth: 0, activeUsers: 0, fleetHealth: 0, newUsers: 0 };
    }
  },

  generateReport: async (report: any) => {
    const { data, error } = await supabase
      .from('reports')
      .insert([{ ...report, status: 'generating' }])
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'generateReport');
    
    // Simulate generation for now
    setTimeout(async () => {
      await supabase
        .from('reports')
        .update({ status: 'ready', file_url: 'https://example.com/report.pdf' })
        .eq('id', data[0].id);
    }, 100);

    return data;
  },

  // --- Drivers ---
  getDrivers: async () => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select(`
        *,
        driver_profiles (*),
        bookings:bookings!bookings_driver_id_fkey (
          id,
          status,
          needs_chauffeur,
          start_date,
          end_date,
          total_amount,
          cars (make, model, license_plate)
        )
      `)
      .eq('role', 'driver');
    if (error) return handleSupabaseErrorWrapper(error, 'getDrivers');
    return data;
  },

  addDriver: async (driver: any) => {
    const { data: resData, error: invokeError } = await supabase.functions.invoke('create-user', {
      body: {
        email: driver.email,
        password: driver.password || 'Driver123!',
        role: 'driver',
        fullName: driver.full_name,
        phoneNumber: driver.phone_number,
        licenseNumber: driver.license_number
      }
    });

    if (invokeError) {
      throw new Error(invokeError.message || 'Failed to add driver');
    }
    if (resData?.error) {
      throw new Error(resData.error || 'Failed to add driver');
    }

    return [{ id: resData.userId, ...driver }];
  },

  updateDriverStatus: async (id: string, status: string) => {
    const { data, error } = await supabase
      .from('driver_profiles')
      .update({ status })
      .eq('id', id)
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'updateDriverStatus');
    return data;
  },

  updateFleetOwnerStatus: async (id: string, status: string) => {
    // 1. Upsert fleet_owner_settings status (to support users who don't have settings row yet)
    const { data, error } = await supabase
      .from('fleet_owner_settings')
      .upsert({ id, status })
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'updateFleetOwnerStatus');

    // 2. Sync user_profiles.role so ProtectedRoute grants portal access
    if (status === 'active') {
      const { error: roleError } = await supabase
        .from('user_profiles')
        .update({ role: 'fleet_owner', status: 'active' })
        .eq('id', id);
      if (roleError) {
        logger.error('[updateFleetOwnerStatus] Failed to sync user_profiles role:', roleError);
      }
    } else if (status === 'suspended') {
      const { error: roleError } = await supabase
        .from('user_profiles')
        .update({ status: 'suspended' })
        .eq('id', id);
      if (roleError) {
        logger.error('[updateFleetOwnerStatus] Failed to sync user_profiles status:', roleError);
      }
    }

    return data;
  },

  updateCarStatus: async (id: string, status: string) => {
    const { data, error } = await supabase
      .from('cars')
      .update({ status })
      .eq('id', id)
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'updateCarStatus');
    return data;
  },

  // --- Verifications ---
  getVerifications: async () => {
    try {
      const { data: drivers, error: dError } = await supabase
        .from('driver_profiles')
        .select(`
          *,
          user_profiles (*)
        `)
        .eq('status', 'pending_verification');
      if (dError) throw dError;

      const { data: owners, error: oError } = await supabase
        .from('fleet_owner_settings')
        .select(`
          *,
          user_profiles (*)
        `)
        .eq('status', 'pending_verification');
      if (oError) throw oError;

      const { data: cars, error: cError } = await supabase
        .from('cars')
        .select(`
          *,
          fleet_owner:user_profiles (*)
        `)
        .or('status.eq.unavailable,is_approved.eq.false');
      if (cError) throw cError;

      return {
        drivers: drivers || [],
        fleetOwners: owners || [],
        cars: cars || []
      };
    } catch (error) {
      return handleSupabaseErrorWrapper(error, 'getVerifications');
    }
  },

  // --- Car Performance & Earnings ---
  getCarEarnings: async () => {
    try {
      const { data: cars, error: cError } = await supabase
        .from('cars')
        .select(`
          *,
          fleet_owner:user_profiles (*)
        `);
      if (cError) throw cError;

      const { data: bookings, error: bError } = await supabase
        .from('bookings')
        .select('*')
        .in('status', ['confirmed', 'completed'])
        .eq('payment_status', 'paid');
      if (bError) throw bError;

      const { data: maintenance, error: mError } = await supabase
        .from('maintenance')
        .select('*');
      if (mError) throw mError;

      return (cars || []).map(car => {
        const carBookings = bookings.filter(b => b.car_id === car.id);
        const carMaintenance = maintenance.filter(m => m.car_id === car.id);
        
        const totalEarnings = carBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
        const totalMaintenance = carMaintenance.reduce((sum, m) => sum + (m.cost || 0), 0);
        const tripsCount = carBookings.length;
        
        const totalBookingDays = carBookings.reduce((sum, b) => {
          const start = new Date(b.start_date);
          const end = new Date(b.end_date);
          return sum + Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
        }, 0);

        const lastTrip = carBookings.sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())[0];
        
        return {
          ...car,
          totalEarnings,
          totalMaintenance,
          tripsCount,
          lastTripDate: lastTrip ? lastTrip.end_date : 'N/A',
          utilizationRate: tripsCount > 0 ? Math.min(Math.round((totalBookingDays / 30) * 100), 100) : 0,
          avgDailyEarnings: totalBookingDays > 0 ? totalEarnings / totalBookingDays : 0,
          payoutStatus: 'paid'
        };
      });
    } catch (error) {
      return handleSupabaseErrorWrapper(error, 'getCarEarnings');
    }
  },

  getCarEarningsStats: async () => {
    try {
      const { data: cars } = await supabase.from('cars').select('id, make, model, daily_rate');
      const { data: bookings } = await supabase.from('bookings')
        .select('car_id, total_amount, start_date, end_date')
        .in('status', ['confirmed', 'completed'])
        .eq('payment_status', 'paid');

      if (!cars || !bookings) return { highestEarner: 'N/A', highestEarnings: 0, avgUtilization: 0, avgDailyEarning: 0 };

      const carEarningsMap: Record<string, number> = {};
      let totalBookingDays = 0;
      
      bookings.forEach(b => {
        carEarningsMap[b.car_id] = (carEarningsMap[b.car_id] || 0) + Number(b.total_amount);
        const start = new Date(b.start_date);
        const end = new Date(b.end_date);
        const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
        totalBookingDays += days;
      });

      let highestEarnerId = '';
      let highestEarnings = 0;
      Object.entries(carEarningsMap).forEach(([id, earnings]) => {
        if (earnings > highestEarnings) {
          highestEarnings = earnings;
          highestEarnerId = id;
        }
      });

      const highestEarnerCar = cars.find(c => (c as any).id === highestEarnerId);
      const avgDailyEarning = cars.reduce((acc, car) => acc + Number(car.daily_rate), 0) / (cars.length || 1);
      
      // Calculate utilization: total booking days / (total cars * 30 days) for a rough monthly estimate
      const avgUtilization = cars.length > 0 ? (totalBookingDays / (cars.length * 30)) * 100 : 0;

      return {
        highestEarner: highestEarnerCar ? `${highestEarnerCar.make} ${highestEarnerCar.model}` : 'N/A',
        highestEarnings,
        avgUtilization: Math.min(Math.round(avgUtilization), 100),
        avgDailyEarning: Number(avgDailyEarning.toFixed(2))
      };
    } catch (error) {
      return { highestEarner: 'N/A', highestEarnings: 0, avgUtilization: 0, avgDailyEarning: 0 };
    }
  },

  // --- Messages ---
  getMessages: async () => {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:user_profiles!sender_id(*),
        receiver:user_profiles!receiver_id(*)
      `)
      .order('created_at', { ascending: false });
    if (error) return handleSupabaseErrorWrapper(error, 'getMessages');
    return data;
  },

  sendMessage: async (message: any) => {
    const { data, error } = await supabase
      .from('messages')
      .insert([message])
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'sendMessage');
    return data;
  },

  sendBroadcast: async (broadcast: any) => {
    const { data, error } = await supabase
      .from('broadcasts')
      .insert([broadcast])
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'sendBroadcast');
    return data;
  },

  // --- Hero Content ---
  getHeroContent: async () => {
    const { data, error } = await supabase
      .from('hero_content')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) return handleSupabaseErrorWrapper(error, 'getHeroContent');
    return data;
  },

  createHeroContent: async (content: any) => {
    // Sanitize payload to ensure correct types for Supabase
    const sanitizedContent = {
      ...content,
      car_id: (content.car_id === "" || !content.car_id) ? null : content.car_id,
      display_order: parseInt(content.display_order) || 0,
      is_active: Boolean(content.is_active)
    };

    const { data, error } = await supabase
      .from('hero_content')
      .insert([sanitizedContent])
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'createHeroContent');
    return data;
  },

  // --- App Settings ---
  getAppSettings: async (keys?: string[]) => {
    let query = supabase.from('app_settings').select('*');
    if (keys && keys.length > 0) {
      query = query.in('key', keys);
    }
    const { data, error } = await query;
    if (error) return handleSupabaseErrorWrapper(error, 'getAppSettings');
    return data;
  },

  updateAppSetting: async (key: string, value: string, description?: string) => {
    const { data, error } = await supabase
      .from('app_settings')
      .upsert({ key, value, description }, { onConflict: 'key' })
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'updateAppSetting');
    return data;
  },

  deleteHeroContent: async (id: string) => {
    const { error } = await supabase
      .from('hero_content')
      .delete()
      .eq('id', id);
    if (error) return handleSupabaseErrorWrapper(error, 'deleteHeroContent');
    return true;
  },

  // --- Contracts ---
  getContracts: async () => {
    const { data, error } = await supabase
      .from('contracts_master')
      .select('*')
      .order('version', { ascending: false });
    if (error) return handleSupabaseErrorWrapper(error, 'getContracts');
    return data;
  },

  createContract: async (contract: any) => {
    const { data, error } = await supabase
      .from('contracts_master')
      .insert([contract])
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'createContract');
    return data;
  },

  deleteContract: async (id: string) => {
    const { error } = await supabase
      .from('contracts_master')
      .delete()
      .eq('id', id);
    if (error) return handleSupabaseErrorWrapper(error, 'deleteContract');
    return true;
  },

  getPaymentRequests: async () => {
    const { data: payments, error } = await supabase
      .from('payment_requests')
      .select('*, bookings(*)')
      .order('created_at', { ascending: false });

    if (error) return handleSupabaseErrorWrapper(error, 'getPaymentRequests');

    const clientIds = [...new Set((payments || []).map((payment: any) => payment.client_id).filter(Boolean))];
    let profiles: any[] = [];

    if (clientIds.length > 0) {
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, phone_number')
        .in('id', clientIds);

      if (profileError) return handleSupabaseErrorWrapper(profileError, 'getPaymentRequestsProfiles');
      profiles = profileData || [];
    }

    return (payments || []).map((payment: any) => ({
      ...payment,
      client: profiles.find(profile => profile.id === payment.client_id) || null,
    }));
  },

  syncPaymentRequest: async (paymentRequestId: string) => {
    const response = await fetch('/api/ncba/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentRequestId }),
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || 'Failed to sync NCBA payment status');
    }

    return data;
  },

  verifyPayment: async (_id: string, status: 'verified' | 'rejected', _verifiedById: string, bookingId?: string, amount?: number, clientId?: string, transactionCode?: string) => {
    logger.log('Verifying payment:', { status, bookingId, amount, clientId, transactionCode });
    const data = { status };

    if (status === 'verified' && bookingId) {
      // First check if booking is cancelled
      const { data: booking } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', bookingId)
        .single();

      if (booking?.status === 'cancelled') {
        throw new Error('Cannot verify payment for cancelled booking');
      }

      // Update booking status to confirmed + payment to paid
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ status: 'confirmed', payment_status: 'paid' })
        .eq('id', bookingId);

      if (updateError) {
        logger.error('Error updating booking status:', updateError);
        throw new Error('Failed to update booking status');
      }

      // Create a transaction record (only if we have client context)
      if (clientId && amount) {
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert({
            booking_id: bookingId,
            user_id: clientId,
            amount: amount,
            type: 'payment_in',
            status: 'completed',
            transaction_code: transactionCode || bookingId
          });

        if (transactionError) {
          logger.error('Error creating transaction:', transactionError);
        }

        // Send in-app notification to the client
        await supabase.from('notifications').insert({
          user_id: clientId,
          title: 'Payment Approved',
          content: `Your M-Pesa payment of KSh ${Number(amount).toLocaleString()} has been verified. Your booking is now confirmed!`,
          type: 'success',
          is_read: false,
          link: `/bookings/${bookingId}`,
        }).then(() => {}, (err: any) => logger.error('Notification insert error:', err));
      }

      logger.log('Payment verification completed successfully');
    } else if (status === 'rejected' && bookingId) {
      // Revert booking status to pending + mark payment as failed
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ status: 'pending', payment_status: 'failed' })
        .eq('id', bookingId);

      if (updateError) {
        logger.error('Error updating booking status to failed:', updateError);
        throw new Error('Failed to update booking status');
      }

      logger.log('Payment rejection completed successfully');
    }

    return data;
  },

  // --- Growth Tools (Coupons) ---
  getCoupons: async () => {
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return handleSupabaseErrorWrapper(error, 'getCoupons');
    return data;
  },

  createCoupon: async (coupon: any) => {
    const { data, error } = await supabase
      .from('coupons')
      .insert([coupon])
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'createCoupon');
    return data;
  },

  deleteCoupon: async (id: string) => {
    const { error } = await supabase
      .from('coupons')
      .delete()
      .eq('id', id);
    if (error) return handleSupabaseErrorWrapper(error, 'deleteCoupon');
    return true;
  },
  // --- Incidents ---
  getIncidents: async () => {
    const { data, error } = await supabase
      .from('incidents')
      .select(`
        *,
        car:cars (*),
        user:user_profiles!incidents_user_id_fkey (*)
      `)
      .order('created_at', { ascending: false });
    if (error) return handleSupabaseErrorWrapper(error, 'getIncidents');
    return data;
  },

  updateIncidentStatus: async (id: string, status: string) => {
    const { data, error } = await supabase
      .from('incidents')
      .update({ status })
      .eq('id', id)
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'updateIncidentStatus');
    return data;
  },

  // --- Client Documents ---
  getClientDocuments: async () => {
    const { data, error } = await supabase
      .from('client_documents')
      .select(`
        *,
        client:user_profiles!client_id (*)
      `)
      .order('uploaded_at', { ascending: false });
    if (error) return handleSupabaseErrorWrapper(error, 'getClientDocuments');
    return data;
  },

  approveClientDocument: async (id: string, verifiedBy: string) => {
    const { data, error } = await supabase
      .from('client_documents')
      .update({ 
        status: 'approved', 
        verified_at: new Date().toISOString(), 
        verified_by: verifiedBy 
      })
      .eq('id', id)
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'approveClientDocument');
    return data;
  },

  rejectClientDocument: async (id: string, reason: string, verifiedBy: string) => {
    const { data, error } = await supabase
      .from('client_documents')
      .update({ 
        status: 'rejected', 
        rejection_reason: reason,
        verified_at: new Date().toISOString(), 
        verified_by: verifiedBy 
      })
      .eq('id', id)
      .select();
    if (error) return handleSupabaseErrorWrapper(error, 'rejectClientDocument');
    return data;
  },

  getSystemHealth: async () => {
    const start = Date.now();
    const { error: dbError } = await supabase.from('cars').select('id').limit(1);
    const end = Date.now();
    const latency = end - start;
    
    const status = dbError ? 'down' : (latency > 500 ? 'degraded' : 'operational');
    const authLatency = Math.max(10, latency - 5);
    const storageLatency = latency + 15;
    
    return {
      services: [
        { name: 'Database', status, latency: `${latency}ms`, uptime: '99.99%' },
        { name: 'Authentication', status, latency: `${authLatency}ms`, uptime: '100%' },
        { name: 'Storage', status, latency: `${storageLatency}ms`, uptime: '99.95%' },
        { name: 'API Gateway', status: 'operational', latency: '24ms', uptime: '99.99%' },
        { name: 'Payment Gateway', status: 'operational', latency: '156ms', uptime: '99.8%' },
      ],
      performance: Array.from({ length: 7 }).map((_, i) => {
        const d = new Date();
        d.setHours(d.getHours() - (6 - i) * 4);
        return {
          time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          cpu: Math.floor(Math.random() * 40) + 10,
          memory: Math.floor(Math.random() * 30) + 40,
          network: Math.floor(Math.random() * 50) + 20,
        };
      })
    };
  },

  deleteBooking: async (bookingId: string) => {
    try {
      logger.log('Deleting booking:', bookingId);
      
      // Use service role client to bypass RLS
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
      
      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase credentials not configured');
      }
      
      const { createClient } = await import('@supabase/supabase-js');
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
      
      // First delete related records
      // 1. Delete booking inspections
      const { error: inspError } = await serviceClient
        .from('booking_inspections')
        .delete()
        .eq('booking_id', bookingId);
      
      if (inspError) {
        logger.warn('Error deleting booking inspections (may not exist):', inspError);
      } else {
        logger.log('Booking inspections deleted');
      }

      // 2. Delete booking extensions
      const { error: extError } = await serviceClient
        .from('booking_extensions')
        .delete()
        .eq('booking_id', bookingId);
      
      if (extError) {
        logger.warn('Error deleting booking extensions (may not exist):', extError);
      } else {
        logger.log('Booking extensions deleted');
      }

      // 3. Delete transactions
      const { error: txError } = await serviceClient
        .from('transactions')
        .delete()
        .eq('booking_id', bookingId);
      
      if (txError) {
        logger.warn('Error deleting transactions (may not exist):', txError);
      } else {
        logger.log('Transactions deleted');
      }

      // 3. Delete the booking
      const { error: bookingError } = await serviceClient
        .from('bookings')
        .delete()
        .eq('id', bookingId);

      if (bookingError) {
        logger.error('Error deleting booking:', bookingError);
        throw bookingError;
      }
      logger.log('Booking deleted');

      return { success: true };
    } catch (error) {
      logger.error('Delete booking failed:', error);
      return handleSupabaseErrorWrapper(error, 'deleteBooking');
    }
  },
};
