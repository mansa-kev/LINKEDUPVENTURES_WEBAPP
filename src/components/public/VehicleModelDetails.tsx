// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, CheckCircle, Clock, Fuel, Settings, Users, X } from 'lucide-react';
import { fleetService } from '../../services/fleetService';
import { VehicleModel, Car } from '../../types';
import { BookingFlow } from './BookingFlow/BookingFlow';
import { ReservationFlow } from './BookingFlow/ReservationFlow';
import { LogoLoader } from '../shared/LogoLoader';
import { FloatingSupportWidget } from './FloatingSupportWidget';

export function VehicleModelDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const reservationToken = searchParams.get('reservationToken');
  const [modelFamily, setModelFamily] = useState<any | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<VehicleModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [showBooking, setShowBooking] = useState(false);
  const [showReservation, setShowReservation] = useState(false);

  useEffect(() => {
    async function fetchModel() {
      if (!id) return;
      try {
        const family = await fleetService.getVehicleModelFamilyById(id);
        if (!family) {
          setModelFamily(null);
          setSelectedVariant(null);
          return;
        }
        setModelFamily(family);
        const initialVariant =
          family.variants.find((variant: VehicleModel) => variant.id === id) ||
          family.representative;
        setSelectedVariant(initialVariant);
      } finally {
        setLoading(false);
      }
    }
    fetchModel();
  }, [id]);

  useEffect(() => {
    if (searchParams.get('booking') === 'true' && selectedVariant) {
      setShowBooking(true);
    }
    if (searchParams.get('reservation') === 'true' && selectedVariant && !reservationToken) {
      setShowReservation(true);
    }
  }, [searchParams, selectedVariant, reservationToken]);

  const toggleBooking = () => {
    const next = !showBooking;
    setShowBooking(next);
    if (next) {
      searchParams.set('booking', 'true');
      searchParams.delete('reservation');
      setShowReservation(false);
    } else {
      searchParams.delete('booking');
    }
    navigate(`?${searchParams.toString()}`, { replace: true });
  };

  const toggleReservation = () => {
    const next = !showReservation;
    setShowReservation(next);
    if (next) {
      searchParams.set('reservation', 'true');
      searchParams.delete('booking');
      setShowBooking(false);
    } else {
      searchParams.delete('reservation');
    }
    navigate(`?${searchParams.toString()}`, { replace: true });
  };

  if (loading || !selectedVariant || !modelFamily) return <LogoLoader fullScreen message="Loading vehicle model..." />;

  const model = selectedVariant;

  const isValidUrl = (url: string) =>
    url && !url.startsWith('blob:') && (url.startsWith('http') || url.startsWith('/'));

  const rawImages: string[] = [
    ...(Array.isArray(model.gallery_urls) ? model.gallery_urls : []),
    ...(model.primary_image_url ? [model.primary_image_url] : []),
  ].filter((u) => isValidUrl(u));

  const images = [...new Set(rawImages)];
  if (images.length === 0) images.push(`https://picsum.photos/seed/${model.id}/1200/800`);

  const title = `${model.display_name || `${model.make} ${model.model}`} | Hire in Nairobi — LinkedUp Cars`;
  const desc = `Hire the ${model.display_name || `${model.make} ${model.model}`} in Nairobi from KES ${Number(model.base_daily_rate || 0).toLocaleString()}/day. ${model.seats || ''} seats, ${model.transmission || ''}.`;
  const image = model.primary_image_url || (images[0] as string);

  // Adapter: BookingFlow still expects a Car-like object for display fields.
  // We keep the booking target separate via vehicleModelId so the backend can allocate a unit.
  const carLike: Car = {
    id: model.id,
    vehicle_model_id: model.id,
    make: model.make,
    model: model.model,
    year: model.year || new Date().getFullYear(),
    color: 'N/A',
    license_plate: 'MODEL',
    category: model.category || 'N/A',
    description: model.description || '',
    primary_image_url: model.primary_image_url || '',
    photos: (model.gallery_urls || []) as any,
    video_url: model.video_url || '',
    transmission: model.transmission || '',
    fuel_type: model.fuel_type || '',
    seats: model.seats || 0,
    luggage: model.luggage || 0,
    features: (model.features || []) as any,
    daily_rate: Number(model.base_daily_rate || 0),
    overtime_rate: Number(model.overtime_rate || 0),
    security_deposit: Number(model.security_deposit || 0),
    status: 'available',
    maintenance_status: 'ok',
    created_at: model.created_at || new Date().toISOString(),
    vehicle_model: model,
  } as any;

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={desc} />
        <link rel="canonical" href={`https://linkedupcarsrentals.com/models/${model.id}`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={desc} />
        <meta property="og:image" content={image as string} />
        <meta property="og:url" content={`https://linkedupcarsrentals.com/models/${model.id}`} />
        <meta property="og:type" content="product" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:image" content={image as string} />
      </Helmet>

      <div className="relative bg-background min-h-screen overflow-hidden">
        <div className="fixed inset-0 z-0">
          <img
            src={images[activeImage]}
            alt="Background"
            className="w-full h-full object-cover blur-3xl opacity-20"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/40 to-background" />
        </div>

        <div className="relative z-10 pt-20 md:pt-32 pb-12 md:pb-20">
          <div className="max-w-7xl mx-auto px-3 sm:px-6">
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white group transition-colors"
              >
                <span className="text-lg group-hover:-translate-x-1 transition-transform inline-block">←</span>
                <span className="font-semibold">Back to Home</span>
              </button>
              <button
                onClick={() => navigate('/cars')}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white group transition-colors"
              >
                <span className="font-semibold">Browse</span>
                <span className="text-lg group-hover:translate-x-1 transition-transform inline-block">→</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-20">
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                <div className="relative aspect-[16/10] rounded-[20px] md:rounded-[60px] overflow-hidden border border-white/10 bg-card/50 backdrop-blur-xl group">
                  <img
                    src={images[activeImage]}
                    alt={model.display_name || `${model.make} ${model.model}`}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                </div>
                {images.length > 1 && (
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {images.map((img, idx) => (
                      <motion.button
                        key={idx}
                        onClick={() => setActiveImage(idx)}
                        whileHover={{ scale: 1.05 }}
                        className={`w-20 h-20 rounded-2xl overflow-hidden border-2 shrink-0 transition-all ${
                          activeImage === idx ? 'border-primary shadow-lg shadow-primary/20' : 'border-white/10'
                        }`}
                      >
                        <img src={img} alt="thumbnail" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </motion.button>
                    ))}
                  </div>
                )}
              </motion.div>

              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col justify-between">
                <div>
                  <h1 className="text-3xl sm:text-4xl md:text-6xl font-serif font-black italic text-white mb-2 sm:mb-4 tracking-tight">
                    {modelFamily.displayName}
                  </h1>
                  {modelFamily.variants.length > 1 && (
                    <div className="flex flex-wrap gap-2 mb-4 sm:mb-6">
                      {modelFamily.variants.map((variant: VehicleModel) => (
                        <button
                          key={variant.id}
                          type="button"
                          onClick={() => setSelectedVariant(variant)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                            selectedVariant.id === variant.id
                              ? 'bg-primary text-black border-primary'
                              : 'bg-card/50 text-white border-white/10 hover:border-primary/40'
                          }`}
                        >
                          {variant.year ? `${variant.year}` : 'Standard'}
                        </button>
                      ))}
                    </div>
                  )}
                  {modelFamily.unitCount > 0 && (
                    <p className="text-xs text-muted-foreground mb-4">
                      {modelFamily.unitCount} physical unit{modelFamily.unitCount === 1 ? '' : 's'} in fleet
                    </p>
                  )}
                  <p className="text-sm sm:text-base md:text-lg text-muted-foreground mb-4 sm:mb-8 leading-relaxed">
                    {model.description || ' '}
                  </p>
                  <p className="text-2xl sm:text-3xl md:text-4xl font-black mb-4 sm:mb-8 text-white">
                    <span className="text-primary">KES {Number(model.base_daily_rate || 0).toLocaleString()}</span>
                    <span className="text-xs sm:text-sm text-muted-foreground font-bold">/day</span>
                  </p>

                  <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-12">
                    <div className="p-2.5 sm:p-4 md:p-5 bg-card/50 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-white/10 flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3">
                      <Users className="text-primary" size={16} />
                      <div className="text-center sm:text-left">
                        <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-white/40">Seats</p>
                        <span className="text-xs sm:text-sm font-bold text-white">{model.seats || '—'}</span>
                      </div>
                    </div>
                    <div className="p-2.5 sm:p-4 md:p-5 bg-card/50 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-white/10 flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3">
                      <Fuel className="text-primary" size={16} />
                      <div className="text-center sm:text-left">
                        <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-white/40">Fuel</p>
                        <span className="text-xs sm:text-sm font-bold text-white">{model.fuel_type || '—'}</span>
                      </div>
                    </div>
                    <div className="p-2.5 sm:p-4 md:p-5 bg-card/50 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-white/10 flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3">
                      <Settings className="text-primary" size={16} />
                      <div className="text-center sm:text-left">
                        <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-white/40">Trans</p>
                        <span className="text-xs sm:text-sm font-bold text-white">{model.transmission || '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-success/10 text-success">
                    <CheckCircle size={16} /> Available (model-level)
                  </div>
                </div>

                <div className="flex gap-3 flex-wrap">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={toggleBooking}
                    className="flex-1 py-3.5 sm:py-5 bg-primary rounded-[14px] sm:rounded-[24px] text-black font-black uppercase tracking-[0.15em] text-xs sm:text-sm shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all"
                  >
                    {showBooking ? 'Close' : reservationToken ? 'Continue Booking' : 'Book Now'} <ArrowRight className="inline ml-2" size={18} />
                  </motion.button>
                  {!reservationToken && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={toggleReservation}
                      className="flex-1 py-3.5 sm:py-5 bg-white/5 border border-white/10 rounded-[14px] sm:rounded-[24px] text-white font-black uppercase tracking-[0.15em] text-xs sm:text-sm hover:bg-white/10 transition-all"
                    >
                      {showReservation ? 'Close' : 'Reserve'} <Clock className="inline ml-2" size={18} />
                    </motion.button>
                  )}
                </div>
              </motion.div>
            </div>

            <AnimatePresence>
              {showBooking && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="mt-6 md:mt-12 relative"
                >
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-orange-500/10 to-primary/20 rounded-[16px] sm:rounded-[32px] md:rounded-[48px] blur-2xl" />
                  <div className="relative p-2 sm:p-5 md:p-10 bg-card/50 backdrop-blur-xl rounded-[16px] sm:rounded-[32px] md:rounded-[48px] border border-primary/20">
                    <button
                      onClick={toggleBooking}
                      className="absolute top-3 right-3 md:top-6 md:right-6 p-2 hover:bg-white/10 rounded-full transition-all z-10"
                    >
                      <X size={24} className="text-white" />
                    </button>
                    <BookingFlow
                      car={carLike}
                      vehicleModelId={model.id}
                      uploadContextId={`model:${model.id}`}
                      reservationToken={reservationToken}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showReservation && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="mt-6 md:mt-12 relative"
                >
                  <div className="absolute -inset-1 bg-gradient-to-r from-warning/20 via-orange-500/10 to-warning/20 rounded-[16px] sm:rounded-[32px] md:rounded-[48px] blur-2xl" />
                  <div className="relative p-2 sm:p-5 md:p-10 bg-card/50 backdrop-blur-xl rounded-[16px] sm:rounded-[32px] md:rounded-[48px] border border-warning/20">
                    <button
                      onClick={toggleReservation}
                      className="absolute top-3 right-3 md:top-6 md:right-6 p-2 hover:bg-white/10 rounded-full transition-all z-10"
                    >
                      <X size={24} className="text-white" />
                    </button>
                    <ReservationFlow car={carLike} vehicleModelId={model.id} onClose={() => setShowReservation(false)} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <FloatingSupportWidget context={`Viewing Vehicle Model: ${model.make} ${model.model}`} />
    </>
  );
}

