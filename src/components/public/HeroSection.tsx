import React, { useState, useEffect } from 'react';
import { Search, MapPin, Calendar, Car, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';

interface HeroContent {
  id: string;
  media_type: 'image' | 'video';
  media_url: string;
  overlay_text: string;
  display_order: number;
}

export function HeroSection() {
  const navigate = useNavigate();
  const [heroContent, setHeroContent] = useState<HeroContent[]>(() => {
    // Initialize from localStorage immediately - no flash
    const storedHero = localStorage.getItem('linkedup_hero_image');
    if (storedHero) {
      try {
        return JSON.parse(storedHero);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'find' | 'browse'>('find');
  const [isLoading, setIsLoading] = useState(false);
  const [searchLocation, setSearchLocation] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');

  useEffect(() => {
    fetchHeroContent();
  }, []);

  const fetchHeroContent = async () => {
    try {
      const { data, error } = await supabase
        .from('hero_content')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      
      const newContent = data || [];
      
      // Update UI and localStorage if content changed
      if (JSON.stringify(newContent) !== JSON.stringify(heroContent)) {
        setHeroContent(newContent);
        localStorage.setItem('linkedup_hero_image', JSON.stringify(newContent));
      }
    } catch {
      const fallbackContent = [
        {
          id: '1',
          media_type: 'image',
          media_url: 'https://picsum.photos/seed/luxury-car-1/1920/1080',
          overlay_text: 'Experience the Pinnacle of Luxury',
          display_order: 0
        },
        {
          id: '2',
          media_type: 'image',
          media_url: 'https://picsum.photos/seed/luxury-car-2/1920/1080',
          overlay_text: 'Unforgettable Journeys Await',
          display_order: 1
        }
      ];
      
      // Update with fallback content
      setHeroContent(fallbackContent);
      localStorage.setItem('linkedup_hero_image', JSON.stringify(fallbackContent));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (heroContent.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % heroContent.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [heroContent]);

  const nextSlide = () => setCurrentIndex((prev) => (prev + 1) % heroContent.length);
  const prevSlide = () => setCurrentIndex((prev) => (prev - 1 + heroContent.length) % heroContent.length);

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchLocation) params.set('location', searchLocation);
    if (pickupDate) params.set('pickup', pickupDate);
    if (returnDate) params.set('return', returnDate);
    navigate(`/cars?${params.toString()}`);
  };

  const handleCategoryClick = (category: string) => {
    navigate(`/cars?category=${category.toLowerCase()}`);
  };

  return (
    <section className="relative h-[100svh] min-h-[600px] md:min-h-[700px] flex items-center justify-center overflow-hidden">
      {/* Background Carousel */}
      <div className="absolute inset-0 z-0">
        <AnimatePresence mode="wait">
          {heroContent.map((content, index) => (
            index === currentIndex && (
              <motion.div
                key={content.id}
                initial={{ opacity: 0, scale: 1.1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="absolute inset-0"
              >
                {content.media_type === 'video' ? (
                  <video
                    src={content.media_url}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={content.media_url}
                    alt={content.overlay_text}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/80" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40" />
              </motion.div>
            )
          ))}
        </AnimatePresence>
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 md:px-6 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-center mb-6 md:mb-12"
        >
          <h1 className="text-3xl sm:text-5xl md:text-8xl font-serif font-black tracking-tighter text-foreground italic mb-4 md:mb-6 drop-shadow-2xl">
            {heroContent[currentIndex]?.overlay_text || 'Experience Luxury'}
          </h1>
          <p className="text-base md:text-2xl text-foreground/80 font-medium max-w-2xl mx-auto drop-shadow-lg px-4">
            {heroContent[currentIndex]?.overlay_text ? '' : 'Curated fleet of world-class vehicles for your next journey.'}
          </p>
        </motion.div>

        {/* Search Widget */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="w-full max-w-4xl rounded-[24px] md:rounded-[40px] p-1.5 md:p-2 shadow-2xl overflow-hidden"
          style={{
            background: 'rgba(0, 0, 0, 0.18)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {/* Tabs */}
          <div className="flex p-1.5 md:p-2 gap-1.5 md:gap-2 bg-transparent">
            <button
              onClick={() => setActiveTab('find')}
              className={`flex-1 py-3 md:py-4 rounded-[18px] md:rounded-[30px] text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'find' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-foreground/60 hover:text-foreground hover:bg-accent'
              }`}
            >
              Find Your Car
            </button>
            <button
              onClick={() => setActiveTab('browse')}
              className={`flex-1 py-3 md:py-4 rounded-[18px] md:rounded-[30px] text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'browse' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-foreground/60 hover:text-foreground hover:bg-accent'
              }`}
            >
              Browse by Category
            </button>
          </div>

          {/* Form Area */}
          <div className="p-4 md:p-8 bg-transparent">
            <AnimatePresence mode="wait">
              {activeTab === 'find' ? (
                <motion.div
                  key="find"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6"
                >
                  {/* Location */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 flex items-center gap-2">
                      <MapPin size={12} className="text-primary" />
                      Pickup Location
                    </label>
                    <input
                      type="text"
                      value={searchLocation}
                      onChange={(e) => setSearchLocation(e.target.value)}
                      placeholder="e.g. Nairobi, Westlands, JKIA..."
                      className="w-full bg-card/50 border border-border rounded-2xl px-4 py-3 md:py-4 text-sm font-bold text-foreground outline-none focus:border-primary/50 transition-colors placeholder:text-foreground/30"
                    />
                  </div>

                  {/* Dates */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 flex items-center gap-2">
                      <Calendar size={12} className="text-primary" />
                      Pickup & Return
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={pickupDate}
                        onChange={(e) => setPickupDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full bg-card/50 border border-border rounded-2xl px-3 md:px-4 py-3 md:py-4 text-xs font-bold text-foreground outline-none focus:border-primary/50 transition-colors"
                      />
                      <input
                        type="date"
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                        min={pickupDate || new Date().toISOString().split('T')[0]}
                        className="w-full bg-card/50 border border-border rounded-2xl px-3 md:px-4 py-3 md:py-4 text-xs font-bold text-foreground outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Vehicle Preference */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 flex items-center gap-2">
                      <Car size={12} className="text-primary" />
                      Vehicle Preference
                    </label>
                    <select className="w-full bg-card/50 border border-border rounded-2xl px-4 py-3 md:py-4 text-sm font-bold text-foreground outline-none focus:border-primary/50 transition-colors appearance-none">
                      <option value="">All Makes</option>
                      <option value="toyota">Toyota</option>
                      <option value="mercedes">Mercedes-Benz</option>
                      <option value="bmw">BMW</option>
                      <option value="land-rover">Land Rover</option>
                      <option value="lexus">Lexus</option>
                      <option value="audi">Audi</option>
                    </select>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="browse"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4"
                >
                  {['Luxury', 'SUV', 'Sedan', 'Electric'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => handleCategoryClick(cat)}
                      className="p-4 md:p-6 bg-card/50 border border-border rounded-2xl md:rounded-3xl flex flex-col items-center gap-2 md:gap-3 hover:bg-primary/10 hover:border-primary/30 transition-all group"
                    >
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                        <Car size={20} />
                      </div>
                      <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-foreground">{cat}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* CTA Button */}
            <div className="mt-6 md:mt-10">
              <button
                onClick={handleSearch}
                className="w-full py-4 md:py-6 bg-primary text-primary-foreground rounded-[20px] md:rounded-[30px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-xs md:text-sm flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-primary/40 group"
              >
                <Search size={18} className="group-hover:rotate-12 transition-transform" />
                Search Available Fleet
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Carousel Controls - repositioned for mobile */}
      <div className="absolute bottom-6 right-4 md:bottom-12 md:right-12 flex gap-2 md:gap-4 z-20">
        <button
          onClick={prevSlide}
          className="w-10 h-10 md:w-12 md:h-12 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-accent transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={nextSlide}
          className="w-10 h-10 md:w-12 md:h-12 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-accent transition-colors"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Scroll Indicator - hidden on mobile to save space */}
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 hidden md:flex flex-col items-center gap-2"
      >
        <div className="w-px h-12 bg-gradient-to-b from-primary to-transparent" />
        <span className="text-[8px] font-black uppercase tracking-[0.3em] text-foreground/40">Scroll</span>
      </motion.div>
    </section>
  );
}
