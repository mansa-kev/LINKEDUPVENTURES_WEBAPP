export interface Car {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  license_plate: string;
  category: string;
  description: string;
  primary_image_url: string;
  photos: string[];
  images?: string[];
  video_url: string;
  transmission: string;
  fuel_type: string;
  seats: number;
  luggage?: number;
  features: string[];
  daily_rate: number;
  overtime_rate: number;
  security_deposit: number;
  status: 'available' | 'rented' | 'maintenance' | 'unavailable';
  maintenance_status: 'ok' | 'due' | 'in_progress';
  is_outsourced?: boolean;
  outsource_owner_name?: string;
  outsource_owner_phone?: string;
  outsource_owner_email?: string;
  outsource_commission_rate?: number;
  fleet_owner_id?: string;
  created_at: string;
}

export interface Booking {
  id: string;
  client_id: string;
  car_id: string;
  fleet_owner_id: string;
  start_date: string;
  end_date: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'on_trip' | 'completed' | 'cancelled' | 'pending_payment_verification';
  total_amount: number;
  platform_commission: number;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  payment_method?: 'mpesa' | 'cash' | 'ncba_stk';
  payment_provider?: 'mpesa' | 'cash' | 'ncba';
  pickup_location?: string;
  dropoff_location?: string;
  needs_chauffeur?: boolean;
  driver_id?: string;
  metadata?: any;
  created_at: string;
  cars?: Car;
  client?: UserProfile;
  fleet_owner?: UserProfile;
  driver?: DriverProfile;
}

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone_number?: string;
  phone?: string;
  avatar_url?: string;
  role: 'admin' | 'fleet_owner' | 'client' | 'driver';
  license_number?: string;
  address?: string;
  status?: string;
  loyalty_tier?: string;
  created_at: string;
}

export interface DriverProfile {
  id: string;
  full_name?: string;
  email?: string;
  phone_number?: string;
  license_number?: string;
  license_expiry?: string;
  license_status?: string;
  id_status?: string;
  status: 'active' | 'suspended' | 'pending_verification';
  rating: number;
  total_trips: number;
  avatar_url?: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  content: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  link?: string;
  created_at: string;
}
