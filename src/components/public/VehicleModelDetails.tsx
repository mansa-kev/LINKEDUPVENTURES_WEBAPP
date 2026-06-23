// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, CheckCircle, Clock, Fuel, Settings, Star, Users, X } from 'lucide-react';
import { fleetService } from '../../services/fleetService';
import { VehicleModel } from '../../types';
import { VehicleModelGroup, getVehicleModelIdsForGroup } from '../../utils/vehicleModelGrouping';
import { BookingFlow } from './BookingFlow/BookingFlow';
import { ReservationFlow } from './BookingFlow/ReservationFlow';
import { LogoLoader } from '../shared/LogoLoader';
import { FloatingSupportWidget } from './FloatingSupportWidget';
import { vehicleModelToCarLike } from '../../utils/vehicleModelAdapter';

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
  const [reviews, setReviews] = useState<any[]>([]);
  const [fleetUnits, setFleetUnits] = useState<any[]>([]);
  const [relatedModels, setRelatedModels] = useState<VehicleModelGroup[]>([]);

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
    async function fetchReviews() {
      if (!modelFamily?.variants?.length) return;
      const variantIds = modelFamily.variants.map((variant: VehicleModel) => variant.id);
      const reviewsData = await fleetService.getReviewsForVehicleModel(id || variantIds[0], variantIds);
      setReviews(reviewsData || []);
    }
    fetchReviews();
  }, [modelFamily, id]);

  useEffect(() => {
    async function fetchFleetAndRelated() {
      if (!modelFamily) {
        setFleetUnits([]);
        setRelatedModels([]);
        return;
      }

      const variantIds = getVehicleModelIdsForGroup(modelFamily);
      const [units, related] = await Promise.all([
        fleetService.getPublicUnitsForModelIds(variantIds),
        modelFamily.category
          ? fleetService.getRelatedVehicleModelGroups(modelFamily.category, modelFamily.groupKey)
          : Promise.resolve([]),
      ]);
      setFleetUnits(units || []);
      setRelatedModels(related || []);
    }
    fetchFleetAndRelated();
  }, [modelFamily]);

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

  if (loading) return <LogoLoader fullScreen message="Loading vehicle model..." />;
  if (!selectedVariant || !modelFamily) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-xl font-bold text-white">Vehicle model not found</p>
        <button onClick={() => navigate('/cars')} className="text-primary font-bold hover:underline">
          Browse all vehicles
        </button>
      </div>
    );
  }

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
  const carLike = vehicleModelToCarLike(model);

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
                          onClick={() => {
                            setSelectedVariant(variant);
                            navigate(`/models/${variant.id}${location.search}`, { replace: true });
                          }}
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

            {fleetUnits.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mt-12 md:mt-20"
              >
                <h2 className="text-2xl md:text-3xl font-serif font-black italic text-white mb-2">
                  Available Fleet Units
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Physical vehicles in our fleet for this model. A specific unit is assigned prior to handover.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {fleetUnits.map((unit) => {
                    const image =
                      unit.primary_image_url ||
                      (Array.isArray(unit.photos) ? unit.photos[0] : null) ||
                      model.primary_image_url;
                    return (
                      <div
                        key={unit.id}
                        className="p-4 bg-card/50 backdrop-blur-xl rounded-2xl border border-white/10 flex gap-4"
                      >
                        {image && (
                          <img
                            src={image}
                            alt=""
                            className="w-20 h-16 rounded-xl object-cover border border-white/10 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white">
                            {unit.year || '—'} · {unit.color || 'N/A'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {unit.transmission || '—'} · {unit.fuel_type || '—'}
                          </p>
                          {Number(unit.seats || 0) > 0 && (
                            <p className="text-xs text-muted-foreground mt-0.5">{unit.seats} seats</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {relatedModels.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mt-12 md:mt-20"
              >
                <div className="flex items-center justify-between gap-4 mb-6">
                  <h2 className="text-2xl md:text-3xl font-serif font-black italic text-white">
                    More {modelFamily.category} Vehicles
                  </h2>
                  <Link
                    to={`/cars?category=${encodeURIComponent((modelFamily.category || '').toLowerCase())}`}
                    className="text-xs font-bold uppercase tracking-wider text-primary hover:underline shrink-0"
                  >
                    View all
                  </Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                  {relatedModels.map((group) => {
                    const related = group.representative;
                    return (
                      <Link
                        key={group.groupKey}
                        to={`/models/${group.representativeId}`}
                        className="bg-card rounded-2xl overflow-hidden border border-white/10 hover:border-primary/40 transition-colors group"
                      >
                        <div className="h-32 md:h-36 overflow-hidden">
                          <img
                            src={
                              group.primary_image_url ||
                              related.primary_image_url ||
                              `https://picsum.photos/seed/${related.id}/800/500`
                            }
                            alt={group.displayName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-bold line-clamp-2 group-hover:text-primary transition-colors">
                            {group.displayName}
                          </p>
                          <p className="text-sm font-black text-primary mt-1">
                            KES {Number(group.base_daily_rate || 0).toLocaleString()}
                            <span className="text-[10px] text-muted-foreground font-normal">/day</span>
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {reviews.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mt-12 md:mt-20"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-8 mb-10 p-6 md:p-8 bg-card/50 rounded-3xl border border-white/10">
                  <div className="text-center">
                    <p className="text-5xl md:text-7xl font-black text-white leading-none">
                      {(reviews.reduce((sum: number, review: any) => sum + review.rating, 0) / reviews.length).toFixed(1)}
                    </p>
                    <div className="flex items-center justify-center gap-1 my-2">
                      {[...Array(5)].map((_, index) => {
                        const avg = reviews.reduce((sum: number, review: any) => sum + review.rating, 0) / reviews.length;
                        return (
                          <Star
                            key={index}
                            size={18}
                            className={index < Math.round(avg) ? 'text-amber-400 fill-amber-400' : 'text-white/20'}
                          />
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground font-bold">
                      {reviews.length} verified review{reviews.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>

                <h2 className="text-2xl md:text-3xl font-serif font-black italic text-white mb-6">What Customers Say</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {reviews.slice(0, 6).map((review: any, index: number) => {
                    const firstName = (review.user_profiles?.full_name || 'Customer').split(' ')[0];
                    return (
                      <motion.div
                        key={review.id}
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.05 }}
                        className="p-6 bg-card/50 backdrop-blur-xl rounded-2xl border border-white/5 flex flex-col gap-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, starIndex) => (
                              <Star
                                key={starIndex}
                                size={14}
                                className={starIndex < review.rating ? 'text-amber-400 fill-amber-400' : 'text-white/10'}
                              />
                            ))}
                          </div>
                          <span className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            <CheckCircle size={10} /> Verified
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed flex-1">"{review.comment}"</p>
                        <p className="text-xs font-bold text-white">{firstName}</p>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

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
                      vehicleModel={model}
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

