import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  Search,
  Star,
  Fuel,
  Settings,
  Users,
  ArrowRight,
  Loader2,
  Calendar,
  MapPin,
  X,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import { fleetService } from '../../services/fleetService';
import { bookingService } from '../../services/bookingService';
import { Car } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { promotionService, Promotion } from '../../services/promotionService';
import { BookingFlow } from '../public/BookingFlow/BookingFlow';

type BookingStep = 'browse' | 'details' | 'dates' | 'confirm';

export function BrowseAndBook() {
  const { user, profile } = useAuth();
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Booking state
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);
  const [bookingStep, setBookingStep] = useState<BookingStep>('browse');
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [activePromo, setActivePromo] = useState<Promotion | null>(null);

  useEffect(() => {
    fetchCars();
  }, []);

  const fetchCars = async () => {
    setLoading(true);
    try {
      const result = await fleetService.getAllCars();
      if (result && typeof result === 'object' && 'data' in result) {
        const data = (result as any).data || [];
        setCars(data.filter((c: Car) => c.status === 'available'));
      } else if (Array.isArray(result)) {
        setCars(result.filter((c: Car) => c.status === 'available'));
      }
    } catch (error) {
      console.error('Error fetching cars:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCars = cars.filter(car => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || `${car.make} ${car.model}`.toLowerCase().includes(q);
    const matchesCategory = !categoryFilter || car.category?.toLowerCase() === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(cars.map(c => c.category).filter(Boolean))] as string[];

  const totalDays = (() => {
    if (!pickupDate || !returnDate) return 0;
    const diff = new Date(returnDate).getTime() - new Date(pickupDate).getTime();
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  const originalAmount = selectedCar ? selectedCar.daily_rate * totalDays : 0;
  const discountedAmount = selectedCar && activePromo
    ? totalDays * promotionService.applyDiscount(selectedCar.daily_rate, activePromo).discounted
    : originalAmount;
  const totalAmount = discountedAmount;
  const discountSavings = originalAmount - discountedAmount;

  const handleSelectCar = async (car: Car) => {
    setSelectedCar(car);
    setBookingStep('dates');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const promo = await promotionService.getForCategory(car.category || '');
    setActivePromo(promo);
  };

  const handleConfirmBooking = async () => {
    if (!selectedCar || !user || !pickupDate || !returnDate) return;
    setBookingLoading(true);

    try {
      const booking = await bookingService.createBooking({
        carId: selectedCar.id,
        startDate: pickupDate,
        endDate: returnDate,
        totalAmount,
        paymentMethod: 'ncba_stk',
        pickupLocation,
        dropoffLocation: pickupLocation,
        needsChauffeur: false,
        clientId: user.id,
      });

      toast.success('Booking created! Proceed to payment.');
      setBookingStep('browse');
      setSelectedCar(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create booking');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleBack = () => {
    if (bookingStep === 'dates') {
      setBookingStep('browse');
      setSelectedCar(null);
    } else if (bookingStep === 'confirm') {
      setBookingStep('dates');
    }
  };

  // ─── Booking Flow (dates + confirm) ────────────────────────────────────────
  if (bookingStep !== 'browse' && selectedCar) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <button 
          onClick={() => { setBookingStep('browse'); setSelectedCar(null); }} 
          className="text-sm font-bold text-muted-foreground hover:text-foreground flex items-center gap-2 mb-2"
        >
          <ArrowRight size={16} className="rotate-180" /> Back to Catalog
        </button>
        <BookingFlow car={selectedCar} />
      </div>
    );
  }

  // ─── Browse Cars Grid ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Browse Cars</h1>
          <p className="text-sm text-muted-foreground">{filteredCars.length} vehicles available</p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by make or model..."
            className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-3 bg-card border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 appearance-none min-w-[140px]"
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c} value={c!.toLowerCase()}>{c}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : filteredCars.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-lg font-bold text-muted-foreground mb-2">No vehicles available</p>
          <p className="text-sm text-muted-foreground">Try adjusting your search or check back later</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCars.map((car) => (
            <motion.div
              key={car.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card rounded-2xl border border-border overflow-hidden group hover:border-primary/20 transition-colors"
            >
              <div className="relative aspect-[16/10] bg-muted overflow-hidden">
                <img
                  src={car.primary_image_url || car.photos?.[0] || `https://picsum.photos/seed/${car.id}/400/250`}
                  alt={`${car.make} ${car.model}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150"
                  referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.src = `https://picsum.photos/seed/c-${car.id}/400/250`; }}
                />
                {car.category && (
                  <span className="absolute top-3 right-3 px-2.5 py-1 bg-black/50 backdrop-blur-sm rounded-full text-[10px] font-bold text-white uppercase tracking-wider">
                    {car.category}
                  </span>
                )}
              </div>

              <div className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-sm">{car.make} {car.model}</h3>
                    <p className="text-xs text-muted-foreground">{car.year}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">KES {car.daily_rate?.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">/day</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {car.transmission && <span className="flex items-center gap-1"><Settings size={10} />{car.transmission}</span>}
                  {car.fuel_type && <span className="flex items-center gap-1"><Fuel size={10} />{car.fuel_type}</span>}
                  {car.seats > 0 && <span className="flex items-center gap-1"><Users size={10} />{car.seats}</span>}
                </div>

                <button
                  onClick={() => handleSelectCar(car)}
                  className="w-full py-3 bg-primary text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Book Now <ArrowRight size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
