import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Fuel,
  Settings,
  ArrowRight,
  Star,
} from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { fleetService } from '../../services/fleetService';
import { Car } from '../../types';
import { SearchControls } from './SearchControls';
import { FilterPanel } from './FilterPanel';
import { PromoBadge } from './PromoBadge';
import { CarStatusBadges } from './CarStatusBadges';

interface Filters {
  category: string;
  priceMin: number;
  priceMax: number;
  transmission: string;
  fuelType: string;
  minSeats: number;
  sortBy: string;
}

// Helper function to determine car status from database fields
const getCarStatus = (car: Car): 'available' | 'booked' | 'reserved' | 'unavailable' => {
  if (car.status === 'rented') return 'booked';
  if (car.status === 'maintenance' || car.status === 'unavailable') return 'unavailable';
  return 'available';
};

interface CarShowroomProps {
  isHome?: boolean;
}

export function CarShowroom({ isHome = false }: CarShowroomProps) {
  const [searchParamsURL] = useSearchParams();
  const [cars, setCars] = useState<Car[]>([]);
  const [filteredCars, setFilteredCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const { ref, inView } = useInView();

  const [searchParams, setSearchParams] = useState({
    location: searchParamsURL.get('location') || '',
    pickupDate: searchParamsURL.get('pickup') || '',
    dropoffDate: searchParamsURL.get('return') || ''
  });

  const [filters, setFilters] = useState<Filters>({
    category: searchParamsURL.get('category') || '',
    priceMin: 0,
    priceMax: 50000,
    transmission: '',
    fuelType: '',
    minSeats: 0,
    sortBy: 'recommended',
  });

  useEffect(() => {
    async function fetchCars() {
      setLoading(true);
      try {
        let result;
        if (searchParams.pickupDate && searchParams.dropoffDate) {
          result = await fleetService.getAvailableCars(searchParams.pickupDate, searchParams.dropoffDate);
        } else {
          result = await fleetService.getAllCars();
        }

        if (result && 'data' in result) {
          setCars(result.data || []);
        } else if (Array.isArray(result)) {
          setCars(result);
        }
      } catch (error) {
        console.error('Error fetching cars:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchCars();
  }, [searchParams]);

  // Apply filters whenever cars or filters change
  useEffect(() => {
    let result = [...cars];

    // Filter by category
    if (filters.category) {
      result = result.filter(c => c.category?.toLowerCase() === filters.category);
    }

    // Filter by price
    if (filters.priceMin > 0) {
      result = result.filter(c => c.daily_rate >= filters.priceMin);
    }
    if (filters.priceMax < 50000) {
      result = result.filter(c => c.daily_rate <= filters.priceMax);
    }

    // Filter by transmission
    if (filters.transmission) {
      result = result.filter(c => c.transmission?.toLowerCase() === filters.transmission);
    }

    // Filter by fuel type
    if (filters.fuelType) {
      result = result.filter(c => c.fuel_type?.toLowerCase() === filters.fuelType);
    }

    // Filter by seats
    if (filters.minSeats > 0) {
      result = result.filter(c => c.seats >= filters.minSeats);
    }

    // Sort
    switch (filters.sortBy) {
      case 'price_asc':
        result.sort((a, b) => a.daily_rate - b.daily_rate);
        break;
      case 'price_desc':
        result.sort((a, b) => b.daily_rate - a.daily_rate);
        break;
      case 'newest':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'name_asc':
        result.sort((a, b) => `${a.make} ${a.model}`.localeCompare(`${b.make} ${b.model}`));
        break;
    }

    setFilteredCars(result);
  }, [cars, filters]);

  return (
    <div className="min-h-screen bg-background">
      <PromoBadge />
      <SearchControls onSearch={setSearchParams} initialParams={searchParams} />

      <section className="py-8 md:py-20 px-4 md:px-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row gap-6">
          {/* FilterPanel — handles its own responsive display internally */}
          <FilterPanel onFilterChange={setFilters} />

          {/* Main Content Area */}
          <div className="flex-1 min-w-0">
            {/* Results count */}
            {!loading && (
              <div className="mb-4 md:mb-6 flex items-center justify-between">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {filteredCars.length} {filteredCars.length === 1 ? 'vehicle' : 'vehicles'} found
                </p>
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-5">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="bg-card rounded-2xl overflow-hidden shadow-md animate-pulse">
                    <div className="h-44 md:h-48 bg-muted" />
                    <div className="p-3 md:p-4">
                      <div className="h-4 bg-muted rounded mb-2" />
                      <div className="h-3 bg-muted rounded w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredCars.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-lg font-bold text-white/60 mb-2">No vehicles match your criteria</p>
                <p className="text-sm text-muted-foreground">Try adjusting your filters or search terms</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-5">
                <AnimatePresence mode="popLayout">
                  {(isHome ? filteredCars.slice(0, 20) : filteredCars).map((car, i) => (
                    <motion.div
                      key={car.id}
                      layout
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: i * 0.05 }}
                      className="group cursor-pointer"
                    >
                      <Link to={`/cars/${car.id}`}>
                        <div className="bg-card dark:bg-card rounded-2xl overflow-hidden shadow-md group cursor-pointer">
                          {/* Card Image Container */}
                          <div className="relative h-44 md:h-48 overflow-hidden">
                            <img
                              src={(() => {
                                const isValid = (url?: string | null) =>
                                  !!url && !url.startsWith('blob:') && (url.startsWith('http') || url.startsWith('/'));

                                // Read cache — discard any stale blob: URLs
                                const cached = localStorage.getItem(`car_image_${car.id}`);
                                if (cached && isValid(cached)) return cached;
                                if (cached && !isValid(cached)) localStorage.removeItem(`car_image_${car.id}`);

                                // Use first valid URL from car data
                                const candidates = [
                                  car.primary_image_url,
                                  ...(Array.isArray(car.photos) ? car.photos : []),
                                ].filter(isValid) as string[];

                                const url = candidates[0] ?? `https://picsum.photos/seed/${car.id}/800/500`;

                                // Only cache real http URLs, never blob:
                                if (isValid(url)) localStorage.setItem(`car_image_${car.id}`, url);

                                return url;
                              })()}
                              alt={`${car.make} ${car.model}`}
                              className="w-full h-44 md:h-48 object-cover group-hover:scale-110 transition-transform duration-700"
                              loading={i < 8 ? "eager" : "lazy"}
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const fallbackUrl = `https://picsum.photos/seed/showroom-${car.id}/800/500`;
                                e.currentTarget.src = fallbackUrl;
                                localStorage.setItem(`car_image_${car.id}`, fallbackUrl);
                              }}
                            />
                            <CarStatusBadges status={getCarStatus(car)} />
                          </div>

                          {/* Card Body */}
                          <div className="p-3 md:p-4">
                            {/* Car Name - No truncation, allow 2 lines */}
                            <h3 className="font-bold text-sm md:text-base leading-tight mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                              {car.make} {car.model} ({car.year})
                            </h3>

                            {/* Price */}
                            <div className="font-black text-orange-500 text-base md:text-lg mb-2">
                              KES {car.daily_rate?.toLocaleString()}
                              <span className="text-xs text-muted-foreground font-normal">/day</span>
                            </div>

                            {/* Specs Row */}
                            <div className="flex flex-wrap gap-1 mb-3">
                              {car.transmission && (
                                <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-800/50 px-2 py-1 rounded">
                                  <Settings size={12} className="w-3 h-3" />
                                  <span>{car.transmission}</span>
                                </div>
                              )}
                              {car.fuel_type && (
                                <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-800/50 px-2 py-1 rounded">
                                  <Fuel size={12} className="w-3 h-3" />
                                  <span>{car.fuel_type}</span>
                                </div>
                              )}
                              {car.seats > 0 && (
                                <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-800/50 px-2 py-1 rounded">
                                  <Users size={12} className="w-3 h-3" />
                                  <span>{car.seats} seats</span>
                                </div>
                              )}
                            </div>

                            {/* BOOK NOW + View Details */}
                            <div className="flex items-center justify-between gap-1 md:gap-2 mt-3 pt-2 border-t border-white/10">
                              {car.status === 'booked' ? (
                                <button
                                  disabled
                                  className="bg-green-500 text-green-100 text-[10px] md:text-xs font-black uppercase tracking-wider px-2 md:px-3 py-1 md:py-1.5 rounded-full whitespace-nowrap cursor-not-allowed opacity-75"
                                >
                                  BOOKED
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    window.location.href = `/cars/${car.id}?booking=true`;
                                  }}
                                  className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] md:text-xs font-black uppercase tracking-wider px-2 md:px-3 py-1 md:py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap"
                                >
                                  BOOK NOW
                                </button>
                              )}
                              <Link 
                                to={`/cars/${car.id}`}
                                className="flex items-center gap-1 md:gap-2 text-[10px] md:text-xs font-bold text-gray-400 hover:text-white hover:underline underline-offset-2 whitespace-nowrap transition-colors"
                              >
                                VIEW DETAILS
                                <ArrowRight size={12} className="hidden md:block" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={ref} className="h-10" />
              </div>
            )}

            {isHome && filteredCars.length > 20 && (
              <div className="mt-12 flex justify-center">
                <Link
                  to="/cars"
                  className="bg-primary text-black px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-105 transition-transform flex items-center gap-3 shadow-xl shadow-primary/20"
                >
                  View All Cars
                  <ArrowRight size={18} />
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
