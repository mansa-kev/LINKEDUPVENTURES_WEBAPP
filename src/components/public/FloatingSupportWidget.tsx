import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { InternationalPhoneInput } from '../ui/InternationalPhoneInput';
import { toast } from 'sonner';

interface FloatingSupportWidgetProps {
  context?: string;
}

export function FloatingSupportWidget({ context = 'General Website Inquiry' }: FloatingSupportWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    message: ''
  });

  // Fetch user if logged in to autofill
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', session.user.id)
          .single();
          
        if (profile) {
          setFormData(prev => ({
            ...prev,
            name: profile.full_name || '',
            phone: profile.phone || ''
          }));
        }
      }
    };
    fetchUser();
    
    // Auto-hide tooltip after 10 seconds to not be annoying
    const timer = setTimeout(() => setShowTooltip(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.message) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      // 1. Auto-save to contact_messages
      const { error } = await supabase
        .from('contact_messages')
        .insert([{
          name: formData.name,
          phone: formData.phone,
          email: 'support-widget@linkedup.com', // Placeholder since email isn't asked
          subject: `Support Request: ${context}`,
          message: formData.message,
        }]);

      if (error) throw error;

      // 2. Redirect to WhatsApp
      const waNumber = '254714764162';
      const waText = `Hello LinkedUp Cars!%0A%0AMy name is ${formData.name}.%0AI need help regarding: *${context}*.%0A%0A${formData.message}`;
      const waUrl = `https://wa.me/${waNumber}?text=${waText}`;
      
      window.open(waUrl, '_blank');
      setIsOpen(false);
      toast.success('Redirecting to WhatsApp...');
      
      // Reset form message
      setFormData(prev => ({ ...prev, message: '' }));
      
    } catch (error) {
      console.error('Error saving support message:', error);
      toast.error('Failed to initiate chat. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-24 right-6 md:bottom-8 md:right-8 z-[100] flex flex-col items-end">
      
      <AnimatePresence>
        {/* Support Form Card */}
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="mb-4 w-[340px] max-w-[calc(100vw-48px)] glass-dark border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-black/50"
          >
            <div className="bg-primary p-4 flex justify-between items-center text-black">
              <div>
                <h3 className="font-black text-sm uppercase tracking-widest">LinkedUp Support</h3>
                <p className="text-[10px] font-bold opacity-80 mt-0.5">{context}</p>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-black/10 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-2">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your Name"
                  className="w-full bg-background border border-white/5 rounded-xl px-4 py-2.5 text-sm focus:border-primary outline-none"
                />
              </div>
              
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-2">Phone</label>
                <InternationalPhoneInput
                  value={formData.phone}
                  onChange={val => setFormData({ ...formData, phone: val })}
                />
              </div>
              
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-2">How can we help?</label>
                <textarea
                  required
                  rows={3}
                  value={formData.message}
                  onChange={e => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Describe your issue..."
                  className="w-full bg-background border border-white/5 rounded-xl px-4 py-2.5 text-sm focus:border-primary outline-none resize-none"
                />
              </div>
              
              <button
                type="submit"
                disabled={loading || !formData.phone}
                className="w-full py-3 bg-emerald-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all disabled:opacity-50 text-sm mt-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
                Start WhatsApp Chat
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button & Tooltip */}
      <div className="relative flex items-center justify-end">
        <AnimatePresence>
          {showTooltip && !isOpen && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute right-full mr-4 bg-card border border-border px-4 py-2 rounded-2xl shadow-xl flex items-center gap-3 whitespace-nowrap"
            >
              <span className="text-xs font-bold text-foreground">Encountering an issue?</span>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowTooltip(false); }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setShowTooltip(false);
          }}
          className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 ${
            isOpen ? 'bg-card border border-border text-foreground' : 'bg-primary text-black'
          }`}
        >
          {isOpen ? <X size={24} /> : <MessageCircle size={28} className={!isOpen ? 'animate-pulse' : ''} />}
        </button>
      </div>

    </div>
  );
}
