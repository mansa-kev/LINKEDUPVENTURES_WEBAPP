import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  X, Car, MapPin, Clock, CheckCircle2, User, Loader2, Send, 
  AlertTriangle, Gauge, ChevronDown, ChevronUp, Upload, Image as ImageIcon, Camera 
} from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '../../utils/logger';

type Stage = 'pickup' | 'in_transit' | 'return_form' | 'completed';

interface Props {
  booking: any;
  onClose: () => void;
  onRefresh: () => void;
}

const PICKUP_CHECKS = [
  'Client ID verified',
  'Contract signed',
  'Deposit collected',
  'Keys handed over',
];
const RETURN_CHECKS = [
  'Keys returned',
];

function fmtDur(ms: number) {
  if (ms <= 0) return '0h 0m';
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
}

function fmt(dt: string | null | undefined) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
}

// ── Reusable sub-components ───────────────────────────────────────────────
const SCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="bg-muted/20 rounded-xl border border-border overflow-hidden mb-4">
    <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2">
      <span className="text-primary">{icon}</span>
      <p className="text-xs font-black uppercase tracking-widest text-foreground">{title}</p>
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const F = ({ l, v }: { l: string; v: string }) => (
  <div>
    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{l}</p>
    <p className="text-sm font-semibold text-foreground">{v || '—'}</p>
  </div>
);

function HistoryCard({ emoji, title, color, children, defaultOpen = false }: {
  emoji: string; title: string; color: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-xl border overflow-hidden mb-4 ${color}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-xl">{emoji}</span>
        <p className="flex-1 text-sm font-black">{title}</p>
        {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3 border-t border-white/10">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
export function AdminBookingLifecycle({ booking: init, onClose, onRefresh }: Props) {
  const [booking, setBooking] = useState(init);

  const getStage = (b: any): Stage => {
    if (b.status === 'on_trip') return 'in_transit';
    if (b.status === 'returned' || b.status === 'completed') return 'completed';
    return 'pickup';
  };

  const [stage, setStage] = useState<Stage>(getStage(init));
  const [saving, setSaving] = useState(false);

  // Common Inspection State
  const [odo, setOdo] = useState('');
  const [fuel, setFuel] = useState('full');
  const [loc, setLoc] = useState('');
  const [notes, setNotes] = useState('');
  
  // Photos State
  const [exteriorPhotos, setExteriorPhotos] = useState<string[]>([]);
  const [interiorPhotos, setInteriorPhotos] = useState<string[]>([]);
  const [dashPhoto, setDashPhoto] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState(false);

  // Checklists
  const [pickupChecks, setPickupChecks] = useState<Record<string, boolean>>(
    Object.fromEntries(PICKUP_CHECKS.map(i => [i, false]))
  );
  const [returnChecks, setReturnChecks] = useState<Record<string, boolean>>(
    Object.fromEntries(RETURN_CHECKS.map(i => [i, false]))
  );

  // Time & Alerts
  const [now, setNow] = useState(new Date());
  const alertedRef = useRef<{ warn24: boolean; warn2: boolean }>({ warn24: false, warn2: false });
  const [showReminder, setShowReminder] = useState(false);
  const [reminderMsg, setReminderMsg] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  // Pre-fill location based on stage
  useEffect(() => {
    if (stage === 'pickup' && !loc) setLoc(init.actual_pickup_location || init.pickup_location || '');
    if (stage === 'return_form' && !loc) setLoc(init.dropoff_location || '');
  }, [stage]);

  // Derived
  const clientName  = booking.client?.full_name  || booking.metadata?.guest_info?.full_name  || 'Client';
  const clientEmail = booking.client?.email      || booking.metadata?.guest_info?.email      || '';
  const clientPhone = booking.client?.phone_number || booking.metadata?.guest_info?.phone     || '';
  const waPhone = clientPhone.replace(/\D/g, '').replace(/^0/, '254');
  const carLine = `${booking.cars?.make || ''} ${booking.cars?.model || ''}`.trim() || 'Vehicle';
  const plate   = booking.cars?.license_plate || '';
  const ref     = booking.id.slice(0, 8).toUpperCase();

  const endDate   = new Date(booking.end_date);   endDate.setHours(23, 59, 59, 999);
  const startDate = new Date(booking.start_date);
  const totalMs   = endDate.getTime() - startDate.getTime();
  const pickupTime = booking.pickup_confirmed_at ? new Date(booking.pickup_confirmed_at) : startDate;
  const elapsedMs = now.getTime() - pickupTime.getTime();
  const remainMs  = endDate.getTime() - now.getTime();
  const pct       = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  const isOverdue = remainMs < 0;
  const isWarn    = !isOverdue && remainMs < 86400000;
  const rentalDays = Math.max(1, Math.ceil(totalMs / 86400000));

  const otMs      = Math.max(0, now.getTime() - endDate.getTime());
  const otHrs     = parseFloat((otMs / 3600000).toFixed(2));
  const otRate    = booking.cars?.overtime_rate || (booking.cars?.daily_rate ? booking.cars.daily_rate / 24 : 0);
  const otCharge  = parseFloat((otHrs * otRate).toFixed(2));

  // --- Handlers ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, setter: any, multi = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploadingImage(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${ext}`;
        const filePath = `${booking.id}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('booking_inspections')
          .upload(filePath, file);

        if (uploadError) throw uploadError;
        
        const { data } = supabase.storage
          .from('booking_inspections')
          .getPublicUrl(filePath);
          
        urls.push(data.publicUrl);
      }
      
      if (multi) {
        setter((prev: string[]) => [...prev, ...urls]);
      } else {
        setter(urls[0]);
      }
      toast.success('Image(s) uploaded');
    } catch (err: any) {
      logger.error('Upload error:', err);
      toast.error('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const removePhoto = (setter: any, index: number) => {
    setter((prev: string[]) => prev.filter((_, i) => i !== index));
  };

  const submitInspection = async (type: 'pre_handover' | 'post_return') => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('booking_inspections').insert({
      booking_id: booking.id,
      type,
      fuel_level: fuel,
      mileage: parseInt(odo, 10) || null,
      location: loc,
      scratches_notes: notes,
      photos_exterior: exteriorPhotos,
      photos_interior: interiorPhotos,
      photo_fuel_mileage: dashPhoto,
      conducted_by: user?.id
    });
    if (error) throw error;
  };

  const handleLogPickup = async () => {
    const allPickup = Object.values(pickupChecks).every(Boolean);
    if (!allPickup) { toast.error('Complete the entire checklist first'); return; }
    if (!odo) { toast.error('Odometer reading is required'); return; }
    if (!dashPhoto) { toast.error('Dashboard photo is required'); return; }
    
    setSaving(true);
    try {
      await submitInspection('pre_handover');

      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('bookings').update({
        status: 'on_trip',
        sub_status: 'in_transit',
        pickup_confirmed_at: new Date().toISOString(),
        pickup_confirmed_by: user?.id,
        actual_pickup_location: loc,
        pickup_odometer: parseInt(odo, 10),
      }).eq('id', booking.id);
      
      if (error) throw error;
      
      toast.success('Pickup logged — now In Transit');
      setStage('in_transit');
      onRefresh();
    } catch (e) { 
      logger.error('Pickup error:', e); 
      toast.error('Failed to log pickup'); 
    } finally { 
      setSaving(false); 
    }
  };

  const handleLogReturn = async () => {
    const allReturn = Object.values(returnChecks).every(Boolean);
    if (!allReturn) { toast.error('Complete the entire checklist first'); return; }
    if (!odo) { toast.error('Odometer reading is required'); return; }
    
    setSaving(true);
    try {
      await submitInspection('post_return');

      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('bookings').update({
        status: 'completed',
        sub_status: 'completed',
        return_confirmed_at: new Date().toISOString(),
        return_confirmed_by: user?.id,
        return_notes: notes,
        overtime_hours: otHrs,
        overtime_charge: otCharge,
        return_odometer: parseInt(odo, 10),
      }).eq('id', booking.id);
      
      if (error) throw error;
      
      toast.success('Return logged — booking completed!');
      setStage('completed');
      onRefresh();
    } catch (e) { 
      logger.error('Return error:', e); 
      toast.error('Failed to log return'); 
    } finally { 
      setSaving(false); 
    }
  };

  const handleSendReminder = async () => {
    setSaving(true);
    try {
      if (clientEmail) void supabase.functions.invoke('send-email', { body: { to: clientEmail, subject: `Return Reminder — Booking #${ref}`, message: reminderMsg } });
      toast.success('Reminder sent!');
      setShowReminder(false);
    } catch { toast.error('Failed to send reminder'); }
    finally { setSaving(false); }
  };

  const PhotoUploadSection = ({ label, images, setter, multi }: any) => (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-muted-foreground uppercase tracking-wide">{label}</label>
        <label className="cursor-pointer bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors">
          <Camera size={12} /> {multi ? 'Add Photos' : 'Add Photo'}
          <input type="file" multiple={multi} accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, setter, multi)} disabled={uploadingImage} />
        </label>
      </div>
      
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {(!multi && images) ? (
          <div className="relative w-24 h-24 shrink-0 rounded-xl border border-border overflow-hidden">
            <img src={images} alt={label} className="w-full h-full object-cover" />
            <button onClick={() => setter('')} className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1"><X size={10} /></button>
          </div>
        ) : multi && images.map((img: string, i: number) => (
          <div key={i} className="relative w-24 h-24 shrink-0 rounded-xl border border-border overflow-hidden">
            <img src={img} alt={`${label} ${i}`} className="w-full h-full object-cover" />
            <button onClick={() => removePhoto(setter, i)} className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1"><X size={10} /></button>
          </div>
        ))}
        {((!multi && !images) || (multi && images.length === 0)) && (
          <div className="w-full h-24 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
            <ImageIcon size={20} className="mb-1 opacity-50" />
            <span className="text-[10px]">No photos</span>
          </div>
        )}
      </div>
    </div>
  );

  const InspectionForm = ({ type }: { type: 'pickup' | 'return' }) => (
    <>
      <SCard title={`${type === 'pickup' ? 'Pre-Handover' : 'Post-Return'} Checklist`} icon={<CheckCircle2 size={14} />}>
        <div className="space-y-2 mb-4">
          {(type === 'pickup' ? PICKUP_CHECKS : RETURN_CHECKS).map(item => {
            const checks = type === 'pickup' ? pickupChecks : returnChecks;
            const setChecks = type === 'pickup' ? setPickupChecks : setReturnChecks;
            return (
              <label key={item} className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={checks[item] || false} onChange={e => setChecks(p => ({ ...p, [item]: e.target.checked }))} className="w-4 h-4 accent-primary" />
                <span className={`text-sm ${checks[item] ? 'text-success line-through' : 'text-foreground'}`}>{item}</span>
              </label>
            );
          })}
        </div>
      </SCard>

      <SCard title="Vital Readings" icon={<Gauge size={14} />}>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1">Odometer (km)</label>
            <input type="number" value={odo} onChange={e => setOdo(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20" placeholder="e.g. 45230" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1">Fuel Level</label>
            <select value={fuel} onChange={e => setFuel(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20">
              <option value="full">Full (1/1)</option>
              <option value="3/4">3/4</option>
              <option value="1/2">Half (1/2)</option>
              <option value="1/4">1/4</option>
              <option value="empty">Empty</option>
            </select>
          </div>
        </div>
        <div className="mb-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1">Current Location</label>
          <input value={loc} onChange={e => setLoc(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20" placeholder="e.g. Airport Terminal 2" />
        </div>
      </SCard>

      <SCard title="Visual Inspection" icon={<Camera size={14} />}>
        <PhotoUploadSection label="Dashboard (Odo/Fuel)" images={dashPhoto} setter={setDashPhoto} multi={false} />
        <PhotoUploadSection label="Exterior Photos" images={exteriorPhotos} setter={setExteriorPhotos} multi={true} />
        <PhotoUploadSection label="Interior Photos" images={interiorPhotos} setter={setInteriorPhotos} multi={true} />
        
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1">Damage / Condition Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary/20" placeholder="Note any scratches, dents, or interior issues..." />
        </div>
      </SCard>
    </>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 md:p-4 bg-background/80 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-xl md:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-foreground">Action Needed: {stage === 'pickup' ? 'Pre-Handover' : stage === 'return_form' ? 'Post-Return' : stage === 'in_transit' ? 'In Transit' : 'Completed'}</h2>
            <p className="text-xs text-muted-foreground">#{ref} · {carLine}{plate ? ` · ${plate}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted text-muted-foreground rounded-xl"><X size={16} /></button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {stage === 'pickup' && (
            <>
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 mb-4 flex gap-3">
                <span className="text-2xl">🔑</span>
                <div>
                  <p className="text-sm font-bold text-orange-500">Log Vehicle Pickup</p>
                  <p className="text-xs text-muted-foreground">Complete the mandatory inspection form below before releasing the vehicle.</p>
                </div>
              </div>
              <InspectionForm type="pickup" />
              <button onClick={handleLogPickup} disabled={saving} className="w-full mt-4 py-3 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Car size={16} />}
                Confirm Pickup & Start Rental
              </button>
            </>
          )}

          {stage === 'in_transit' && (
            <div className="space-y-4">
              <div className={`border rounded-xl px-4 py-3 flex gap-3 ${isOverdue ? 'bg-error/10 border-error/20' : isWarn ? 'bg-warning/10 border-warning/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                <span className="text-2xl">{isOverdue ? '🚨' : isWarn ? '⏰' : '🚗'}</span>
                <div>
                  <p className={`text-sm font-bold ${isOverdue ? 'text-error' : isWarn ? 'text-warning' : 'text-blue-500'}`}>
                    {isOverdue ? `OVERDUE by ${fmtDur(Math.abs(remainMs))}` : isWarn ? `Due in ${fmtDur(remainMs)}` : `In Transit — ${fmtDur(remainMs)} remaining`}
                  </p>
                  <p className="text-xs text-muted-foreground">Return by {endDate.toLocaleDateString()} · {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="bg-muted/30 rounded-xl p-4 border border-border">
                <div className="flex justify-between text-xs text-muted-foreground mb-2">
                  <span>Elapsed: {fmtDur(elapsedMs)}</span>
                  <span>{isOverdue ? 'Overdue' : 'Remaining: ' + fmtDur(remainMs)}</span>
                </div>
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${isOverdue ? 'bg-error' : isWarn ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>

              {!showReminder ? (
                <button onClick={() => {
                  setReminderMsg(isOverdue ? `Dear ${clientName},\n\nYour ${carLine} rental (#${ref}) was due back ${fmtDur(Math.abs(remainMs))} ago.\n\nPlease return immediately or contact us.\n\nOvertime charges apply: KES ${otRate.toLocaleString()}/hr.` : `Dear ${clientName},\n\nFriendly reminder — your ${carLine} rental (#${ref}) is due in ${fmtDur(remainMs)}.\n\nReturn by: ${endDate.toLocaleDateString()}`);
                  setShowReminder(true);
                }} className="w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border bg-muted/30 text-muted-foreground border-border hover:bg-muted">
                  <Send size={14} /> Send Return Reminder
                </button>
              ) : (
                <SCard title="Return Reminder Message" icon={<Send size={14} />}>
                  <textarea value={reminderMsg} onChange={e => setReminderMsg(e.target.value)} rows={7} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none mb-3" />
                  <div className="flex gap-2">
                    {clientEmail && <button onClick={handleSendReminder} disabled={saving} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold flex items-center justify-center gap-2">{saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Send Email</button>}
                    {clientPhone && <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(reminderMsg)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2">💬 WhatsApp</a>}
                    <button onClick={() => setShowReminder(false)} className="px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted"><X size={14} /></button>
                  </div>
                </SCard>
              )}

              <button onClick={() => setStage('return_form')} className="w-full py-3 bg-teal-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-teal-700 transition-colors">
                <CheckCircle2 size={16} /> Log Car Returned
              </button>
            </div>
          )}

          {stage === 'return_form' && (
            <>
              <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl px-4 py-3 mb-4 flex gap-3">
                <span className="text-2xl">🏁</span>
                <div>
                  <p className="text-sm font-bold text-teal-500">Log Vehicle Return</p>
                  <p className="text-xs text-muted-foreground">Complete the return inspection form to finalise the rental.</p>
                </div>
              </div>
              
              {otHrs > 0 && (
                <div className="bg-error/10 border border-error/20 rounded-xl px-4 py-3 mb-4">
                  <p className="text-sm font-bold text-error">⚠ Overtime Detected</p>
                  <p className="text-xs text-muted-foreground mt-1">{otHrs.toFixed(1)} hrs × KES {otRate.toLocaleString()}/hr = <span className="font-bold text-error">KES {otCharge.toLocaleString()}</span></p>
                </div>
              )}

              <InspectionForm type="return" />
              <button onClick={handleLogReturn} disabled={saving} className="w-full mt-4 py-3 bg-teal-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-teal-700 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Finalise Return
              </button>
            </>
          )}

          {stage === 'completed' && (
            <div className="text-center py-10">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-2xl font-black text-success">Rental Complete</h2>
              <p className="text-muted-foreground mt-2">The return has been logged successfully.</p>
              <button onClick={onClose} className="mt-8 px-8 py-3 bg-primary text-primary-foreground font-bold rounded-xl">Close View</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
