import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import { Activity, MapPin, MousePointerClick, Filter, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export function AdminAnalyticsCenter() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d');

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase.from('analytics_events').select('*').order('created_at', { ascending: false });
      
      if (timeRange === '7d') {
        const d = new Date(); d.setDate(d.getDate() - 7);
        query = query.gte('created_at', d.toISOString());
      } else if (timeRange === '30d') {
        const d = new Date(); d.setDate(d.getDate() - 30);
        query = query.gte('created_at', d.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      setEvents(data || []);
    } catch (err: any) {
      toast.error('Failed to load analytics: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Aggregations
  const pageViews = events.filter(e => e.event_type === 'page_view');
  const uniqueSessions = new Set(events.map(e => e.session_id)).size;
  
  // Daily Traffic
  const dailyTrafficMap = pageViews.reduce((acc: any, e) => {
    const date = new Date(e.created_at).toLocaleDateString();
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});
  const dailyTrafficData = Object.keys(dailyTrafficMap).map(k => ({ date: k, views: dailyTrafficMap[k] })).reverse();

  // Top Neighborhoods (from BookingFlow pickupLocation)
  const pickupLocations = events
    .filter(e => e.event_type === 'booking_step' && e.metadata?.pickupLocation)
    .reduce((acc: any, e) => {
      const loc = e.metadata.pickupLocation.toLowerCase();
      acc[loc] = (acc[loc] || 0) + 1;
      return acc;
    }, {});
  const topNeighborhoods = Object.keys(pickupLocations)
    .map(k => ({ location: k, count: pickupLocations[k] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // General Regions
  const regions = events.reduce((acc: any, e) => {
    if (e.region && e.region !== 'Unknown') {
      acc[e.region] = (acc[e.region] || 0) + 1;
    }
    return acc;
  }, {});
  const topRegions = Object.keys(regions)
    .map(k => ({ region: k, count: regions[k] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Most Clicked Cars
  const carClicks = events
    .filter(e => e.event_type === 'click' && e.event_name === 'vehicle_card')
    .reduce((acc: any, e) => {
      const model = e.metadata?.model || 'Unknown Model';
      acc[model] = (acc[model] || 0) + 1;
      return acc;
    }, {});
  const topCars = Object.keys(carClicks)
    .map(k => ({ model: k, clicks: carClicks[k] }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);

  // Action Clicks
  const actionClicks = events.filter(e => e.event_type === 'click');
  const waClicks = actionClicks.filter(e => e.event_name === 'whatsapp_support').length;
  const callbackClicks = actionClicks.filter(e => e.event_name === 'request_callback').length;
  const signupClicks = actionClicks.filter(e => e.event_name === 'sign_up_submit').length;

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics Center</h1>
          <p className="text-sm text-muted-foreground">Comprehensive traffic and engagement tracking.</p>
        </div>
        <select 
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as any)}
          className="px-4 py-2 bg-card border border-border rounded-xl outline-none"
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="all">All Time</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-6 bg-card border border-border rounded-2xl">
          <Activity className="text-primary mb-3" size={24} />
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Page Views</h3>
          <p className="text-3xl font-black">{pageViews.length}</p>
        </div>
        <div className="p-6 bg-card border border-border rounded-2xl">
          <Activity className="text-emerald-500 mb-3" size={24} />
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Unique Sessions</h3>
          <p className="text-3xl font-black">{uniqueSessions}</p>
        </div>
        <div className="p-6 bg-card border border-border rounded-2xl">
          <MousePointerClick className="text-blue-500 mb-3" size={24} />
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">WhatsApp Clicks</h3>
          <p className="text-3xl font-black">{waClicks}</p>
        </div>
        <div className="p-6 bg-card border border-border rounded-2xl">
          <MousePointerClick className="text-amber-500 mb-3" size={24} />
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Callback Requests</h3>
          <p className="text-3xl font-black">{callbackClicks}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Traffic */}
        <div className="p-6 bg-card border border-border rounded-2xl">
          <h3 className="text-sm font-bold uppercase tracking-widest mb-6">Daily Page Views</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrafficData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="date" stroke="#ffffff40" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff40" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} />
                <Line type="monotone" dataKey="views" stroke="#FBBF24" strokeWidth={3} dot={{ fill: '#111', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Cars */}
        <div className="p-6 bg-card border border-border rounded-2xl">
          <h3 className="text-sm font-bold uppercase tracking-widest mb-6">Most Clicked Models</h3>
          {topCars.length > 0 ? (
            <div className="space-y-4">
              {topCars.map((car, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                    <span className="font-bold text-sm">{car.model}</span>
                  </div>
                  <span className="text-primary font-bold">{car.clicks} clicks</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Not enough data yet.</div>
          )}
        </div>

        {/* Neighborhoods */}
        <div className="p-6 bg-card border border-border rounded-2xl">
          <h3 className="text-sm font-bold uppercase tracking-widest mb-2">Neighborhood Interest</h3>
          <p className="text-xs text-muted-foreground mb-6">Based on typed Pickup Locations in booking flow.</p>
          {topNeighborhoods.length > 0 ? (
            <div className="space-y-4">
              {topNeighborhoods.map((loc, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MapPin size={16} className="text-primary" />
                    <span className="font-bold text-sm capitalize">{loc.location}</span>
                  </div>
                  <span className="text-muted-foreground font-bold text-sm">{loc.count} searches</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Not enough booking data yet.</div>
          )}
        </div>

        {/* Regions */}
        <div className="p-6 bg-card border border-border rounded-2xl">
          <h3 className="text-sm font-bold uppercase tracking-widest mb-6">Global Regions (IP Based)</h3>
          {topRegions.length > 0 ? (
            <div className="space-y-4">
              {topRegions.map((loc, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="font-bold text-sm">{loc.region}</span>
                  <span className="text-muted-foreground font-bold text-sm">{loc.count} visits</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Not enough IP data yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
