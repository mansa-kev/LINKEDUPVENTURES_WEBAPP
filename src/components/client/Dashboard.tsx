import React, { useEffect, useState } from 'react';
import { clientService } from '../../services/clientService';
import { supabase } from '../../lib/supabase';
import { Phone, MapPin, Clock, Calendar, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const dashboardData = await clientService.getDashboardData(user.id);
        setData(dashboardData);
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8">Loading dashboard...</div>;

  // Calculate profile completion (simplified)
  const profileFields = ['name', 'email', 'phone', 'address', 'license_number'];
  const completedFields = data?.profile ? profileFields.filter(f => data.profile[f]).length : 0;
  const completionPercentage = Math.round((completedFields / profileFields.length) * 100);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Quick-Drive Dashboard</h2>

      {/* Active Rental Status */}
      {data?.activeBooking && (
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm space-y-4">
          <h3 className="text-lg font-semibold">Active Rental Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-muted rounded-xl">
              <p className="text-sm text-muted-foreground">Current Car</p>
              <p className="font-bold">{data.activeBooking.cars.make} {data.activeBooking.cars.model}</p>
              <p className="text-xs text-muted-foreground">{data.activeBooking.cars.license_plate}</p>
            </div>
            <div className="p-4 bg-muted rounded-xl">
              <p className="text-sm text-muted-foreground">Pickup/Drop-off</p>
              <p className="font-bold">{new Date(data.activeBooking.start_date).toLocaleDateString()} - {new Date(data.activeBooking.end_date).toLocaleDateString()}</p>
            </div>
            <div className="p-4 bg-muted rounded-xl">
              <p className="text-sm text-muted-foreground">Countdown</p>
              <p className="font-bold text-primary">Ends in 2 days</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold">
              <Phone size={16} /> Call Driver
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-muted rounded-xl text-sm font-bold">
              <MapPin size={16} /> Navigate
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-muted rounded-xl text-sm font-bold">
              <Clock size={16} /> Request Extension
            </button>
          </div>
        </div>
      )}

      {/* Upcoming Bookings */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-sm space-y-4">
        <h3 className="text-lg font-semibold">Upcoming Bookings</h3>
        {data?.upcomingBookings?.length > 0 ? (
          <div className="space-y-2">
            {data.upcomingBookings.map((b: any) => (
              <div key={b.id} className="flex justify-between items-center p-4 border border-border rounded-xl">
                <div>
                  <p className="font-semibold">{b.cars.make} {b.cars.model}</p>
                  <p className="text-sm text-muted-foreground">{new Date(b.start_date).toLocaleDateString()} - {new Date(b.end_date).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2">
                  <button className="px-4 py-2 bg-muted rounded-xl text-sm font-bold">View Details</button>
                  <button className="px-4 py-2 bg-error/10 text-error rounded-xl text-sm font-bold">Cancel</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No upcoming bookings.</p>
        )}
      </div>

      {/* Profile Completion & Recommendations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Profile Completion</h3>
          <div className="w-full bg-muted rounded-full h-4 mb-2">
            <div className="bg-primary h-4 rounded-full" style={{ width: `${completionPercentage}%` }}></div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">Your profile is {completionPercentage}% complete for 1-click bookings.</p>
          <Link to="/client/glovebox" className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold">
            Complete Profile
          </Link>
        </div>
        
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Personalized Recommendations</h3>
          {data?.recommendations?.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {data.recommendations.map((car: any) => (
                <div key={car.id} className="min-w-[200px] p-4 border border-border rounded-xl">
                  <p className="font-semibold">{car.make} {car.model}</p>
                  <p className="text-sm text-muted-foreground mb-2">${car.daily_rate}/day</p>
                  <button className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold">Book Now</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No recommendations available yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
