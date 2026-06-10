import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { 
  ChevronLeft, Loader2, CreditCard, FileText, CheckCircle2, 
  XCircle, Car, MapPin, Flag, AlertTriangle, ShieldCheck, 
  Calendar, Clock, User, ArrowRight, Save, Image as ImageIcon, Send, X,
  Trash2, Mail, Phone, ExternalLink, MessageSquare
} from 'lucide-react';
import { logger } from '../../utils/logger';
import { adminService } from '../../services/adminService';
import { AdminBookingLifecycle } from './AdminBookingLifecycle';
type ModalType = 'pickup' | 'return' | 'extend' | 'flag' | null;
type CommunicateMode = 'approval' | 'payment_rejected' | 'docs_rejected';

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; // Distance in km
}

export function AdminBookingCommandCenter() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'documents' | 'communications' | 'inspections'>('overview');
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // States for Modals & Actions
  const [flagReason, setFlagReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [extensionDays, setExtensionDays] = useState(1);
  const [extensionCost, setExtensionCost] = useState(0);

  // States for Communications & Docs
  const [communicateMode, setCommunicateMode] = useState<CommunicateMode>('approval');
  const [adminMessage, setAdminMessage] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [docRejectionReason, setDocRejectionReason] = useState('');
  const [showDocRejection, setShowDocRejection] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [isAssigningDriver, setIsAssigningDriver] = useState(false);
  const [conductors, setConductors] = useState<Record<string, string>>({});

  const fetchDrivers = async () => {
    try {
      const data = await adminService.getDrivers();
      setDrivers(data || []);
    } catch (err) {
      logger.error('Failed to fetch drivers:', err);
    }
  };

  const handleAssignDriver = async (driverId: string | null) => {
    setIsAssigningDriver(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ driver_id: driverId })
        .eq('id', booking.id);

      if (error) throw error;
      toast.success(driverId ? 'Driver allocated successfully' : 'Driver unallocated successfully');
      fetchBooking(true);
    } catch (e: any) {
      toast.error('Failed to allocate driver: ' + e.message);
    } finally {
      setIsAssigningDriver(false);
    }
  };

  const fetchBooking = async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          cars (*),
          client:user_profiles!bookings_client_id_fkey (*),
          driver:user_profiles!bookings_driver_id_fkey (*),
          booking_inspections (*),
          booking_extensions (*),
          signed_contracts (*)
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      setBooking(data);

      // Fetch conductors details
      const inspects = data.booking_inspections || [];
      const userIds = inspects.map((i: any) => i.conducted_by).filter(Boolean);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .in('id', userIds);
        if (profiles) {
          const mapping = profiles.reduce((acc: any, curr: any) => {
            acc[curr.id] = curr.full_name;
            return acc;
          }, {});
          setConductors(mapping);
        }
      }
    } catch (err) {
      logger.error('Error fetching booking:', err);
      toast.error('Failed to load booking details');
      navigate('/admin/bookings');
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBooking();
    fetchDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Handle ESC for lightbox
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxUrl(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchBooking(true);
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to permanently delete this booking? This action cannot be undone.')) return;
    setIsDeleting(true);
    try {
      const result = await adminService.deleteBooking(booking.id);
      if (result && result.success) {
        toast.success('Booking deleted successfully');
        navigate('/admin/bookings');
      } else {
        throw new Error('Deletion failed');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete booking');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFlagToggle = async () => {
    setIsSubmitting(true);
    try {
      const newStatus = !booking.is_flagged;
      const res = await fetch(`/api/bookings/${booking.id}/flag`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_flagged: newStatus, flag_reason: newStatus ? flagReason : null })
      });
      if (!res.ok) throw new Error('Failed to update flag');
      toast.success(newStatus ? 'Booking flagged' : 'Flag removed');
      setActiveModal(null);
      setFlagReason('');
      fetchBooking(true);
    } catch (e) {
      toast.error('An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddExtension = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days_extended: extensionDays, extension_cost: extensionCost })
      });
      if (!res.ok) throw new Error('Failed to extend');
      toast.success('Extension added successfully');
      setActiveModal(null);
      fetchBooking(true);
    } catch (e) {
      toast.error('Failed to add extension');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-20">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  if (!booking) return null;

  // --- Derived Values ---
  const meta        = booking.metadata || {};
  const guestInfo   = meta.guest_info || {};
  const docs        = meta.documents || {};
  const clientName  = booking.client?.full_name    || guestInfo.full_name    || 'Guest';
  const clientEmail = booking.client?.email        || guestInfo.email        || 'N/A';
  const clientPhone = booking.client?.phone_number || booking.client?.phone  || guestInfo.phone || 'N/A';
  const idNumber    = guestInfo.id_number || guestInfo.national_id || docs.idNumber || docs.id_number || (meta as any).id_number || booking.client?.id_number || 'N/A';
  const licenseNum  = booking.client?.license_number || guestInfo.license_number || guestInfo.license || 'N/A';
  const transactionCode = booking.transaction_code || null;
  const isPaid      = booking.payment_status === 'paid';
  const docsOk      = booking.document_status === 'approved';
  
  const signedContract = booking.signed_contracts?.[0];
  const contractUrl = signedContract?.contract_url || meta.contract_url;
  const signatureData = signedContract?.signature_data || docs.signatureUrl || meta.signature || meta.signature_url;

  const bookingRef  = booking.id.slice(0, 8).toUpperCase();
  const carLine     = `${booking.cars?.make || ''} ${booking.cars?.model || ''}`.trim() || 'N/A';
  const carFull     = `${carLine}${booking.cars?.year ? ` (${booking.cars.year})` : ''}`;
  const waPhone     = clientPhone.replace(/\D/g, '').replace(/^0/, '254');
  const hasPhone    = waPhone.length >= 10;
  
  const today = new Date();
  const endDate = new Date(booking.end_date);
  const isOverdue = booking.status === 'on_trip' && endDate < today;

  const rentalDays  = (booking.start_date && booking.end_date)
    ? Math.max(1, Math.ceil((new Date(booking.end_date).getTime() - new Date(booking.start_date).getTime()) / 86400000))
    : 1;

  const totalCost = Number(booking.total_amount) || 0;
  const balance = isPaid ? 0 : totalCost;

  const inspections = booking.booking_inspections || [];
  const preInspection = inspections.find((i: any) => i.type === 'pre_handover');
  const postInspection = inspections.find((i: any) => i.type === 'post_return');

  // --- Helpers ---
  const buildMessage = (mode: CommunicateMode) => {
    if (mode === 'approval') {
      return `Dear ${clientName},\n\nGreat news! Your car rental booking has been fully reviewed and confirmed.\n\n✅ Payment Verified — KES ${totalCost.toLocaleString()}\n✅ Documents Approved\n✅ Vehicle Ready — ${carFull}\n\nPickup Location: ${booking.pickup_location || 'Contact us for details'}\nPickup Date: ${booking.start_date || 'N/A'}\nReturn Date: ${booking.end_date || 'N/A'}\n\nPlease bring your original driving licence and ID on pickup day.\n\nThank you for choosing LinkedUp Cars!\n\nThe LinkedUp Cars Team`;
    } else if (mode === 'payment_rejected') {
      return `Dear ${clientName},\n\nYour NCBA STK Push payment attempt for Booking #${bookingRef} was not completed successfully.\n\nNext Steps:\n1. Return to your booking payment screen\n2. Retry the NCBA STK Push using the correct phone number\n3. Enter your mobile money PIN when prompted\n\nYour booking remains pending payment verification until NCBA confirms successful payment.\n\nPlease contact us if you need assistance.\n\nThe LinkedUp Cars Team`;
    } else {
      return `Dear ${clientName},\n\nOur team has reviewed your submitted documents for Booking #${bookingRef}.\n\nUnfortunately, we were unable to approve your documents at this time.\n\nReason: ${docRejectionReason || 'Documents require correction'}\n\nNext Steps:\n1. Log into your client portal at linkedupcars.com\n2. Navigate to My Bookings\n3. Click "Resubmit Documents" to upload corrected copies\n\n✅ IMPORTANT: Your payment has been verified — you do NOT need to pay again.\n\nPlease contact us if you need help.\n\nThe LinkedUp Cars Team`;
    }
  };

  const enterCommunicateStep = (mode: CommunicateMode) => {
    setCommunicateMode(mode);
    setAdminMessage(buildMessage(mode));
    setActiveTab('communications');
  };

  const handleVerifyPayment = async (status: 'verified' | 'rejected') => {
    setIsVerifying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Admin authentication required'); return; }

      if (status === 'verified') {
        const { error: bookingErr } = await supabase.from('bookings').update({
          status: 'confirmed',
          payment_status: 'paid',
        }).eq('id', booking.id);
        if (bookingErr) throw bookingErr;

        if (booking.client_id) {
          await supabase.from('transactions').insert({
            booking_id: booking.id,
            user_id: booking.client_id,
            amount: booking.total_amount,
            type: 'payment_in',
            status: 'completed',
            transaction_code: transactionCode || booking.id,
          }).then(null, (e: any) => logger.warn('Transaction record error:', e));
        }
        toast.success('Payment verified ✓');
        fetchBooking(true);
        setActiveTab('documents');
      } else {
        const { error: rejectErr } = await supabase.from('bookings').update({
          payment_status: 'failed',
        }).eq('id', booking.id);
        if (rejectErr) throw rejectErr;
        toast.info('Payment rejected — composing client notification');
        fetchBooking(true);
        enterCommunicateStep('payment_rejected');
      }
    } catch (e: any) {
      toast.error('Failed to update payment status');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleApproveDocuments = async () => {
    setIsApproving(true);
    try {
      await supabase.from('bookings').update({
        document_status: 'approved',
        updated_at: new Date().toISOString(),
      }).eq('id', booking.id);
      toast.success('Documents approved ✓');
      fetchBooking(true);
      enterCommunicateStep('approval');
    } catch (e: any) {
      toast.error('Failed to approve documents');
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectDocuments = async () => {
    if (!docRejectionReason.trim()) { toast.error('Please enter a rejection reason'); return; }
    setIsApproving(true);
    try {
      await supabase.from('bookings').update({
        document_status: 'resubmission_required',
        admin_notes: docRejectionReason,
        updated_at: new Date().toISOString(),
      }).eq('id', booking.id);
      setShowDocRejection(false);
      toast.info('Documents rejected — composing client notification');
      fetchBooking(true);
      enterCommunicateStep('docs_rejected');
    } catch (e: any) {
      toast.error('Failed to reject documents');
    } finally {
      setIsApproving(false);
    }
  };

  const handleSendMessage = async () => {
    setIsSending(true);
    const fullMsg = adminMessage.trim() + (additionalNotes.trim() ? `\n\nAdmin Notes:\n${additionalNotes.trim()}` : '');
    const subject = communicateMode === 'approval'
      ? 'Booking Confirmed — LinkedUp Cars'
      : communicateMode === 'payment_rejected'
      ? 'Payment Review Update — LinkedUp Cars'
      : 'Action Required: Resubmit Documents — LinkedUp Cars';

    try {
      if (clientEmail !== 'N/A') {
        const htmlBody = `<div style="font-family:sans-serif;line-height:1.6;white-space:pre-wrap">${fullMsg.replace(/\n/g, '<br>')}</div>`;
        await supabase.functions.invoke('send-email', {
          body: { to: clientEmail, subject, html: htmlBody, text: fullMsg },
        }).catch(e => logger.warn('Email send error:', e));
      }

      if (booking.client_id) {
        try {
          await supabase.from('notifications').insert({
            user_id: booking.client_id,
            type: communicateMode === 'approval' ? 'booking_confirmed' : 'booking_update',
            title: communicateMode === 'approval' ? 'Booking Confirmed 🎉' : subject,
            content: fullMsg.slice(0, 300),
            is_read: false,
            link: `/booking-confirmation/${booking.id}`,
          });
        } catch (e) { logger.warn('Notification error:', e); }
      }

      if (communicateMode === 'approval') {
        await supabase.from('bookings').update({
          status: 'confirmed',
          payment_status: 'paid',
          updated_at: new Date().toISOString(),
        }).eq('id', booking.id);
        fetchBooking(true);
      }

      toast.success('Message sent successfully!');
      setAdminMessage('');
      setAdditionalNotes('');
    } catch (e: any) {
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const openWhatsApp = async () => {
    if (!hasPhone) { toast.error('No valid phone number on record'); return; }
    const text = encodeURIComponent(adminMessage.trim() + (additionalNotes.trim() ? `\n\nAdmin Notes:\n${additionalNotes.trim()}` : ''));
    window.open(`https://wa.me/${waPhone}?text=${text}`, '_blank', 'noopener,noreferrer');

    if (communicateMode === 'approval') {
      try {
        await supabase.from('bookings').update({
          status: 'confirmed',
          payment_status: 'paid',
          updated_at: new Date().toISOString(),
        }).eq('id', booking.id);
        fetchBooking(true);
      } catch (e: any) {
        logger.warn('WhatsApp confirm DB update failed:', e);
      }
    }
  };

  // --- Reusable Layout Components ---
  const SectionCard = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h3 className="text-xs font-black uppercase tracking-widest text-foreground">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );

  const Field = ({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) => (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold text-foreground mt-1 break-words ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );

  const ImageTile = ({ url, label }: { url?: string; label: string }) => (
    <div>
      <button
        onClick={() => url && setLightboxUrl(url)}
        disabled={!url}
        className="w-full h-32 rounded-xl overflow-hidden border border-border bg-muted/30 flex items-center justify-center hover:border-primary/50 transition-all disabled:cursor-default cursor-zoom-in group"
      >
        {url
          ? <img src={url} alt={label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150" />
          : <FileText size={24} className="text-muted-foreground opacity-50" />}
      </button>
      <p className="text-xs text-muted-foreground mt-2 text-center font-medium">
        {label} {url && <span className="text-primary">· zoom</span>}
      </p>
    </div>
  );

  // Banner Colors
  let bannerColor = 'bg-primary border-primary';
  let bannerText = 'text-primary-foreground';
  if (booking.is_flagged) {
    bannerColor = 'bg-red-600 border-red-600';
    bannerText = 'text-white';
  } else if (isOverdue) {
    bannerColor = 'bg-red-700 border-red-700';
    bannerText = 'text-white';
  } else if (booking.status === 'on_trip') {
    bannerColor = 'bg-blue-600 border-blue-600';
    bannerText = 'text-white';
  } else if (booking.status === 'pending_collection') {
    bannerColor = 'bg-orange-500 border-orange-500';
    bannerText = 'text-white';
  } else if (booking.status === 'completed') {
    bannerColor = 'bg-gray-600 border-gray-600';
    bannerText = 'text-white';
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-150 max-w-6xl mx-auto pb-20">
      {/* Top Nav */}
      <div className="flex items-center justify-between">
        <button 
          onClick={() => navigate('/admin/bookings')}
          className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} /> Back to Bookings
        </button>
        <div className="flex items-center gap-3">
          {isRefreshing && <Loader2 size={14} className="animate-spin text-primary" />}
          <span className="text-xs font-mono text-muted-foreground">ID: {booking.id.toUpperCase()}</span>
          <button onClick={handleDelete} disabled={isDeleting} className="p-2 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-xl transition-colors" title="Delete Booking">
            {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          </button>
        </div>
      </div>

      {/* Banner */}
      <div className={`rounded-3xl p-6 md:p-8 border shadow-xl ${bannerColor} ${bannerText} relative overflow-hidden flex flex-col md:flex-row md:items-end justify-between gap-6`}>
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="px-4 py-1.5 bg-white/20 rounded-full text-xs font-black uppercase tracking-widest backdrop-blur-md border border-white/20">
              {booking.status.replace(/_/g, ' ')}
            </span>
            {booking.sub_status && (
              <span className="px-4 py-1.5 bg-black/20 rounded-full text-xs font-black uppercase tracking-widest backdrop-blur-md border border-black/20">
                {booking.sub_status.replace(/_/g, ' ')}
              </span>
            )}
            {booking.is_flagged && (
              <span className="flex items-center gap-1.5 px-4 py-1.5 bg-black/30 rounded-full text-xs font-black uppercase tracking-widest backdrop-blur-md border border-black/20 text-red-100 shadow-sm">
                <Flag size={12} /> Flagged
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight">{clientName}</h1>
          <p className="text-base font-bold opacity-90 flex items-center gap-2">
            <Car size={18} /> {carFull} • <span className="font-mono bg-black/20 px-2 py-0.5 rounded">{booking.cars?.license_plate || 'No Plate'}</span>
          </p>
        </div>

        <div className="relative z-10 flex flex-col md:items-end gap-1">
          <p className="text-xs font-black uppercase tracking-widest opacity-80">Total Value</p>
          <p className="text-4xl font-black">KES {totalCost.toLocaleString()}</p>
          <p className={`text-sm font-bold ${balance > 0 ? 'text-red-200' : 'text-green-200'}`}>
            {balance > 0 ? `Unpaid: KES ${balance.toLocaleString()}` : 'Fully Paid'}
          </p>
        </div>
      </div>

      {/* Action Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(booking.status === 'confirmed' || booking.status === 'pending_collection') ? (
          <button onClick={() => setActiveModal('pickup')} className="col-span-2 py-4 bg-orange-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-orange-600 transition-all shadow-lg hover:shadow-orange-500/20">
            <MapPin size={18} /> Start Trip (Pickup Log)
          </button>
        ) : null}

        {booking.status === 'on_trip' ? (
          <>
            <button onClick={() => setActiveModal('return')} className="col-span-2 py-4 bg-teal-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-teal-600 transition-all shadow-lg hover:shadow-teal-500/20">
              <CheckCircle2 size={18} /> Process Return
            </button>
            <button onClick={() => setActiveModal('extend')} className="py-4 bg-purple-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-purple-600 transition-all">
              <Calendar size={18} /> Extend
            </button>
          </>
        ) : null}

        {/* Global Action: Flag */}
        <button 
          onClick={() => booking.is_flagged ? handleFlagToggle() : setActiveModal('flag')} 
          className={`py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
            (booking.status === 'confirmed' || booking.status === 'pending_collection' || booking.status === 'on_trip') ? '' : 'col-span-2 md:col-span-1'
          } ${
            booking.is_flagged 
              ? 'bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500/20' 
              : 'bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20'
          }`}
        >
          <Flag size={18} /> {booking.is_flagged ? 'Unflag Booking' : 'Flag Booking'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-border overflow-x-auto scrollbar-none">
        {['overview', 'financials', 'documents', 'communications', 'inspections'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`py-4 border-b-2 text-sm font-black uppercase tracking-widest transition-colors whitespace-nowrap ${
              activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
            {tab === 'documents' && !docsOk && <span className="ml-2 inline-flex w-2 h-2 rounded-full bg-red-500" />}
            {tab === 'financials' && !isPaid && <span className="ml-2 inline-flex w-2 h-2 rounded-full bg-amber-500" />}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <SectionCard title="Rental Timeline" icon={<Clock size={16} />}>
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  <div className="relative">
                    <div className="absolute -left-[27px] top-1 w-3 h-3 bg-primary rounded-full ring-4 ring-card" />
                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Pick-up</p>
                    <p className="text-base font-black">{new Date(booking.start_date).toLocaleDateString('en-KE', { weekday: 'short', month: 'long', day: 'numeric' })}</p>
                    <p className="text-sm text-muted-foreground mt-1">{booking.pickup_location || 'No location specified'}</p>
                  </div>
                  <div className="relative">
                    <div className={`absolute -left-[27px] top-1 w-3 h-3 rounded-full ring-4 ring-card ${isOverdue ? 'bg-red-500' : 'bg-border'}`} />
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isOverdue ? 'text-red-500' : 'text-muted-foreground'}`}>Drop-off</p>
                    <p className="text-base font-black">{new Date(booking.end_date).toLocaleDateString('en-KE', { weekday: 'short', month: 'long', day: 'numeric' })}</p>
                    <p className="text-sm text-muted-foreground mt-1">{booking.dropoff_location || booking.pickup_location || 'No location specified'}</p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Client Information" icon={<User size={16} />}>
                <div className="grid grid-cols-2 gap-y-4">
                  <Field label="Name" value={clientName} />
                  <Field label="ID Number" value={idNumber} />
                  <Field label="Phone" value={clientPhone} />
                  <Field label="Email" value={clientEmail} />
                </div>
              </SectionCard>
            </div>

            <div className="space-y-6">
              <SectionCard title="Driver & Logistics Allocation" icon={<Car size={16} />}>
                <div className="space-y-4">
                  {booking.driver ? (
                    <div className="space-y-3">
                      <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black uppercase text-primary tracking-widest">Currently Assigned Driver</p>
                          <p className="text-sm font-black text-foreground mt-1">{booking.driver.full_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{booking.driver.phone_number || booking.driver.phone || 'No Phone'}</p>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          booking.needs_chauffeur 
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' 
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        }`}>
                          {booking.needs_chauffeur ? 'Chauffeur' : 'Delivery Staff'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl p-3 flex items-start gap-2.5 text-xs font-bold leading-normal">
                      <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                      <div>
                        <p>No Driver Allocated</p>
                        <p className="text-[10px] text-amber-500/80 font-normal mt-0.5">
                          {booking.needs_chauffeur 
                            ? 'This booking requires a chauffeur. Please allocate a driver.' 
                            : 'Allocate a delivery agent to coordinate vehicle handover.'}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 pt-2 border-t border-border/50">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                      {booking.driver ? 'Reallocate / Change Driver' : 'Select Driver for Allocation'}
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={booking.driver_id || ''}
                        onChange={(e) => handleAssignDriver(e.target.value || null)}
                        disabled={isAssigningDriver}
                        className="flex-1 bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                      >
                        <option value="">-- Unallocated / Select Driver --</option>
                        {drivers.map((d: any) => (
                          <option key={d.id} value={d.id}>
                            {d.full_name} ({d.driver_profiles?.status || 'pending'})
                          </option>
                        ))}
                      </select>
                      {booking.driver_id && (
                        <button
                          onClick={() => handleAssignDriver(null)}
                          disabled={isAssigningDriver}
                          className="px-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 text-xs font-bold rounded-xl transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </SectionCard>

              {booking.is_flagged && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={18} className="text-red-500" />
                    <h3 className="text-sm font-black text-red-500 uppercase tracking-widest">Flagged Reason</h3>
                  </div>
                  <p className="text-sm text-red-400 leading-relaxed font-bold">
                    {booking.flag_reason || 'No specific reason provided.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FINANCIALS TAB */}
        {activeTab === 'financials' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SectionCard title="Financial Ledger" icon={<CreditCard size={16} />}>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-border/50">
                  <span className="text-sm font-bold text-muted-foreground">Base Rental Cost</span>
                  <span className="text-base font-black">KES {totalCost.toLocaleString()}</span>
                </div>
                {booking.metadata?.extensions?.map((ext: any, i: number) => (
                  <div key={i} className="flex justify-between items-center py-3 border-b border-border/50 text-purple-400">
                    <span className="text-sm font-bold">Extension ({ext.days} days)</span>
                    <span className="text-base font-black">+ KES {ext.cost?.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center py-4 bg-muted/20 px-4 rounded-xl mt-4">
                  <span className="text-xs font-black uppercase tracking-widest">Total Received</span>
                  <span className="text-xl font-black text-green-500">KES {(isPaid ? totalCost : 0).toLocaleString()}</span>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="NCBA STK Payment" icon={<CreditCard size={16} />}>
              <div className="mb-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">NCBA Transaction ID</p>
                {transactionCode ? (
                  <p className="text-3xl font-mono font-black text-primary tracking-widest">{transactionCode}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic font-medium">No NCBA transaction ID recorded yet</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border mb-6">
                <Field label="Amount" value={`KES ${totalCost.toLocaleString()}`} />
                <Field label="Date Submitted" value={new Date(booking.created_at).toLocaleDateString('en-KE', { dateStyle: 'medium' })} />
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Status</p>
                  <span className={`inline-flex mt-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    isPaid ? 'bg-green-500/15 text-green-500' :
                    booking.payment_status === 'failed' ? 'bg-red-500/15 text-red-500' :
                    'bg-amber-500/15 text-amber-500'
                  }`}>
                    {isPaid ? '✓ Verified' : booking.payment_status || 'pending'}
                  </span>
                </div>
              </div>

              {!isPaid && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-4 mt-2">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                    <p className="text-xs text-amber-600 font-bold leading-relaxed">
                      Payment must be confirmed by NCBA STK Push. Do not manually approve unless you have verified via portal.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleVerifyPayment('verified')} disabled={isVerifying} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-xs font-black hover:bg-green-700 flex items-center justify-center gap-2">
                      {isVerifying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Force Verify
                    </button>
                    <button onClick={() => handleVerifyPayment('rejected')} disabled={isVerifying} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-xs font-black hover:bg-red-700 flex items-center justify-center gap-2">
                      <XCircle size={14} /> Reject
                    </button>
                  </div>
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {/* DOCUMENTS TAB */}
        {activeTab === 'documents' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${docsOk ? 'bg-green-500/15 text-green-500' : 'bg-amber-500/15 text-amber-500'}`}>
                  {docsOk ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {docsOk ? 'Documents Approved' : 'Pending Review'}
                </span>
              </div>
              {!docsOk && (
                <div className="flex gap-2">
                  <button onClick={() => setShowDocRejection(true)} className="px-4 py-2 bg-red-600/15 text-red-500 rounded-lg text-xs font-black hover:bg-red-600/25 transition-colors">
                    Reject
                  </button>
                  <button onClick={handleApproveDocuments} disabled={isApproving} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-black hover:bg-green-700 transition-colors">
                    {isApproving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve
                  </button>
                </div>
              )}
            </div>

            {showDocRejection && (
              <div className="p-5 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-4">
                <p className="text-xs font-black uppercase tracking-widest text-red-500">Document Rejection Reason</p>
                <div className="flex flex-wrap gap-2">
                  {['ID document unclear', 'Licence document unclear', 'Documents don\'t match records', 'Incomplete submission'].map(r => (
                    <button key={r} onClick={() => setDocRejectionReason(r)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${docRejectionReason === r ? 'bg-red-600 text-white' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}>
                      {r}
                    </button>
                  ))}
                </div>
                <textarea
                  value={docRejectionReason}
                  onChange={e => setDocRejectionReason(e.target.value)}
                  placeholder="Or type a custom reason..."
                  rows={2}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground resize-none focus:outline-none focus:border-red-500 font-medium"
                />
                <div className="flex gap-2 pt-2">
                  <button onClick={handleRejectDocuments} disabled={!docRejectionReason.trim() || isApproving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-xl text-sm font-black hover:bg-red-700 transition-colors disabled:opacity-50">
                    {isApproving ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />} Confirm Rejection
                  </button>
                  <button onClick={() => { setShowDocRejection(false); setDocRejectionReason(''); }}
                    className="px-6 py-3 bg-muted text-muted-foreground rounded-xl text-sm font-bold hover:bg-muted/80 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SectionCard title="Client Identity" icon={<User size={16} />}>
                <div className="flex gap-6 items-start">
                  {docs.facePhotoUrl ? (
                    <button onClick={() => setLightboxUrl(docs.facePhotoUrl)} className="shrink-0 focus:outline-none group">
                      <img src={docs.facePhotoUrl} alt="Selfie" className="w-24 h-24 rounded-2xl object-cover border-2 border-primary/20 group-hover:border-primary transition-colors" />
                    </button>
                  ) : (
                    <div className="w-24 h-24 rounded-2xl bg-muted/40 border border-border flex items-center justify-center shrink-0">
                      <User size={32} className="text-muted-foreground opacity-50" />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4 flex-1">
                    <Field label="Full Name" value={clientName} />
                    <Field label="Email" value={clientEmail} />
                    <Field label="Phone" value={clientPhone} />
                    <Field label="Booking Date" value={new Date(booking.created_at).toLocaleDateString('en-KE')} />
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="National ID" icon={<ShieldCheck size={16} />}>
                <div className="mb-4">
                  <Field label="ID Number" value={idNumber} mono />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ImageTile url={docs.idFrontUrl} label="Front" />
                  <ImageTile url={docs.idBackUrl} label="Back" />
                </div>
              </SectionCard>

              <SectionCard title="Driver's Licence" icon={<CreditCard size={16} />}>
                <div className="mb-4">
                  <Field label="Licence Number" value={licenseNum} mono />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ImageTile url={docs.licenseFrontUrl} label="Front" />
                  <ImageTile url={docs.licenseBackUrl} label="Back" />
                </div>
              </SectionCard>

              {(contractUrl || signatureData) && (
                <SectionCard title="Contract & Signature" icon={<FileText size={16} />}>
                  <div className="flex flex-col gap-6">
                    {contractUrl && (
                      <a href={contractUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-primary/10 border border-primary/20 rounded-xl text-sm font-black text-primary hover:bg-primary/20 transition-colors w-full">
                        <ExternalLink size={16} /> View Final Signed Contract (PDF)
                      </a>
                    )}
                    {signatureData && (
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">Digital Signature Specimen</p>
                        <button onClick={() => setLightboxUrl(signatureData)} className="cursor-zoom-in w-full">
                          <img src={signatureData} alt="Signature" className="h-24 w-full bg-white rounded-xl p-2 border border-border hover:border-primary transition-colors object-contain" />
                        </button>
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}
            </div>
          </div>
        )}

        {/* COMMUNICATIONS TAB */}
        {activeTab === 'communications' && (
          <div className="max-w-3xl space-y-6">
            <div className={`flex items-start gap-4 p-5 rounded-2xl border shadow-sm ${
              communicateMode === 'approval'
                ? 'bg-green-500/10 border-green-500/20'
                : 'bg-red-500/10 border-red-500/20'
            }`}>
              {communicateMode === 'approval'
                ? <CheckCircle2 size={24} className="text-green-500 shrink-0" />
                : <XCircle size={24} className="text-red-500 shrink-0" />}
              <div>
                <p className={`text-base font-black ${communicateMode === 'approval' ? 'text-green-500' : 'text-red-500'}`}>
                  {communicateMode === 'approval' && 'Booking Approved — Send Confirmation'}
                  {communicateMode === 'payment_rejected' && 'Payment Rejected — Notify Client'}
                  {communicateMode === 'docs_rejected' && 'Documents Rejected — Request Resubmission'}
                </p>
                <p className="text-sm text-muted-foreground mt-1 font-medium">
                  {communicateMode === 'approval' && 'Booking status will be set to Confirmed once you send this message.'}
                  {communicateMode === 'payment_rejected' && 'Client will be asked to retry NCBA STK Push.'}
                  {communicateMode === 'docs_rejected' && 'Client must resubmit corrected documents. Payment remains valid.'}
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-4 mb-6 pb-6 border-b border-border">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">Recipient</p>
                  <div className="flex flex-wrap gap-4">
                    <span className="flex items-center gap-2 text-sm font-bold bg-muted/40 px-3 py-1.5 rounded-lg">
                      <Mail size={14} className="text-primary" /> {clientEmail}
                    </span>
                    {hasPhone && (
                      <span className="flex items-center gap-2 text-sm font-bold bg-muted/40 px-3 py-1.5 rounded-lg">
                        <Phone size={14} className="text-green-500" /> {clientPhone}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">Message Content</p>
                  <textarea
                    value={adminMessage}
                    onChange={e => setAdminMessage(e.target.value)}
                    rows={12}
                    className="w-full bg-muted/20 border border-border rounded-xl px-4 py-4 text-sm text-foreground resize-y focus:outline-none focus:border-primary font-mono leading-relaxed"
                  />
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">Admin Notes (Appended)</p>
                  <textarea
                    value={additionalNotes}
                    onChange={e => setAdditionalNotes(e.target.value)}
                    placeholder="Add any extra instructions..."
                    rows={3}
                    className="w-full bg-muted/20 border border-border rounded-xl px-4 py-3 text-sm text-foreground resize-none focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-border">
                  {hasPhone && (
                    <button
                      onClick={openWhatsApp}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-xl text-sm font-black hover:bg-green-700 transition-colors"
                    >
                      <Phone size={16} /> WhatsApp
                    </button>
                  )}
                  {hasPhone && (
                    <button
                      onClick={() => toast.info('SMS integration coming soon')}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-colors"
                    >
                      <MessageSquare size={16} /> SMS
                    </button>
                  )}
                  <button
                    onClick={handleSendMessage}
                    disabled={isSending || !adminMessage.trim()}
                    className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-black hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {communicateMode === 'approval' ? 'Send & Confirm Booking' : 'Send Message'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* INSPECTIONS TAB */}
        {activeTab === 'inspections' && (
          <div className="space-y-6">
            {!preInspection && !postInspection && (
              <div className="text-center py-20 bg-card border border-border rounded-3xl">
                <ShieldCheck size={48} className="mx-auto text-muted-foreground opacity-30 mb-4" />
                <h3 className="text-lg font-black text-foreground">No Inspections Logged</h3>
                <p className="text-sm text-muted-foreground mt-2">Inspections will appear here once the vehicle is picked up or returned.</p>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {preInspection && (() => {
                const conductorName = conductors[preInspection.conducted_by] || 'System / Staff';
                const hasCarCoords = booking.cars?.location_lat && booking.cars?.location_lon;
                const hasInspectCoords = preInspection.gps_lat && preInspection.gps_lon;
                let distance: number | null = null;
                if (hasCarCoords && hasInspectCoords) {
                  distance = calculateDistance(
                    Number(preInspection.gps_lat),
                    Number(preInspection.gps_lon),
                    Number(booking.cars.location_lat),
                    Number(booking.cars.location_lon)
                  );
                }

                return (
                  <SectionCard title="Pre-Handover Inspection" icon={<MapPin size={16} />}>
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Date Logged" value={new Date(preInspection.created_at).toLocaleString('en-KE')} />
                        <Field label="Conducted By" value={conductorName} />
                        <Field label="Odometer" value={`${preInspection.mileage?.toLocaleString() || 'N/A'} km`} mono />
                        <Field label="Fuel Level" value={preInspection.fuel_level?.toUpperCase() || 'N/A'} />
                      </div>

                      {/* GPS & Location Logging */}
                      <div className="bg-muted/10 p-4 rounded-xl border border-border space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Handover Location Check</p>
                        <p className="text-sm font-bold text-foreground">{preInspection.location || 'Field Handover'}</p>
                        {hasInspectCoords ? (
                          <div className="space-y-2 pt-1">
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${preInspection.gps_lat},${preInspection.gps_lon}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-bold"
                            >
                              <ExternalLink size={12} /> View Submission GPS Pin ({Number(preInspection.gps_lat).toFixed(5)}, {Number(preInspection.gps_lon).toFixed(5)})
                            </a>
                            {distance !== null && (
                              <div className={`p-2.5 rounded-lg text-xs font-bold border ${
                                distance > 1.0 
                                  ? 'bg-red-500/10 text-red-500 border-red-500/20' 
                                  : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              }`}>
                                {distance > 1.0 ? (
                                  <span className="flex items-center gap-1">
                                    <AlertTriangle size={14} className="shrink-0" />
                                    Distance Mismatch Alert: Submitted {distance.toFixed(2)} km from depot!
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <CheckCircle2 size={14} className="shrink-0" />
                                    Location Verified: Submitted {distance.toFixed(2)} km from depot.
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-amber-500 font-bold flex items-center gap-1">
                            <AlertTriangle size={13} /> No GPS coordinates logged.
                          </p>
                        )}
                      </div>

                      {preInspection.scratches_notes && (
                        <div className="bg-muted/30 p-4 rounded-xl border border-border">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Condition Notes</p>
                          <p className="text-sm font-medium">{preInspection.scratches_notes}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-3">Dashboard (Fuel/Odo)</p>
                          <ImageTile url={preInspection.photo_fuel_mileage} label="Dashboard Proof" />
                        </div>
                        {preInspection.client_signature_url && (
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-3">Client Signature Verification</p>
                            <button
                              onClick={() => setLightboxUrl(preInspection.client_signature_url)}
                              className="w-full h-32 rounded-xl border border-border bg-white flex items-center justify-center p-2 cursor-zoom-in hover:border-primary/50 transition-all"
                            >
                              <img src={preInspection.client_signature_url} alt="Client Signature" className="h-full object-contain" />
                            </button>
                            <p className="text-xs text-muted-foreground mt-2 text-center font-medium">Signed Agreement · zoom</p>
                          </div>
                        )}
                      </div>

                      {(preInspection.photos_exterior?.length > 0 || preInspection.photos_interior?.length > 0) && (
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-3">Additional Visual Evidence</p>
                          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                            {[...(preInspection.photos_exterior || []), ...(preInspection.photos_interior || [])].map((img, i) => (
                              <button key={i} onClick={() => setLightboxUrl(img)} className="w-24 h-24 shrink-0 rounded-xl overflow-hidden border border-border cursor-zoom-in">
                                <img src={img} alt="Evidence" className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </SectionCard>
                );
              })()}

              {postInspection && (() => {
                const conductorName = conductors[postInspection.conducted_by] || 'System / Staff';
                const hasCarCoords = booking.cars?.location_lat && booking.cars?.location_lon;
                const hasInspectCoords = postInspection.gps_lat && postInspection.gps_lon;
                let distance: number | null = null;
                if (hasCarCoords && hasInspectCoords) {
                  distance = calculateDistance(
                    Number(postInspection.gps_lat),
                    Number(postInspection.gps_lon),
                    Number(booking.cars.location_lat),
                    Number(booking.cars.location_lon)
                  );
                }

                return (
                  <SectionCard title="Post-Return Inspection" icon={<CheckCircle2 size={16} />}>
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Date Logged" value={new Date(postInspection.created_at).toLocaleString('en-KE')} />
                        <Field label="Conducted By" value={conductorName} />
                        <Field label="Odometer" value={`${postInspection.mileage?.toLocaleString() || 'N/A'} km`} mono />
                        <Field label="Fuel Level" value={postInspection.fuel_level?.toUpperCase() || 'N/A'} />
                      </div>

                      {/* GPS & Location Logging */}
                      <div className="bg-muted/10 p-4 rounded-xl border border-border space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Return Location Check</p>
                        <p className="text-sm font-bold text-foreground">{postInspection.location || 'Field Return'}</p>
                        {hasInspectCoords ? (
                          <div className="space-y-2 pt-1">
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${postInspection.gps_lat},${postInspection.gps_lon}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-bold"
                            >
                              <ExternalLink size={12} /> View Submission GPS Pin ({Number(postInspection.gps_lat).toFixed(5)}, {Number(postInspection.gps_lon).toFixed(5)})
                            </a>
                            {distance !== null && (
                              <div className={`p-2.5 rounded-lg text-xs font-bold border ${
                                distance > 1.0 
                                  ? 'bg-red-500/10 text-red-500 border-red-500/20' 
                                  : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              }`}>
                                {distance > 1.0 ? (
                                  <span className="flex items-center gap-1">
                                    <AlertTriangle size={14} className="shrink-0" />
                                    Distance Mismatch Alert: Submitted {distance.toFixed(2)} km from depot!
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <CheckCircle2 size={14} className="shrink-0" />
                                    Location Verified: Submitted {distance.toFixed(2)} km from depot.
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-amber-500 font-bold flex items-center gap-1">
                            <AlertTriangle size={13} /> No GPS coordinates logged.
                          </p>
                        )}
                      </div>

                      {postInspection.scratches_notes && (
                        <div className="bg-muted/30 p-4 rounded-xl border border-border">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Return Notes</p>
                          <p className="text-sm font-medium">{postInspection.scratches_notes}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-3">Dashboard (Fuel/Odo)</p>
                          <ImageTile url={postInspection.photo_fuel_mileage} label="Dashboard Proof" />
                        </div>
                        {postInspection.client_signature_url && (
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-3">Client Signature Verification</p>
                            <button
                              onClick={() => setLightboxUrl(postInspection.client_signature_url)}
                              className="w-full h-32 rounded-xl border border-border bg-white flex items-center justify-center p-2 cursor-zoom-in hover:border-primary/50 transition-all"
                            >
                              <img src={postInspection.client_signature_url} alt="Client Signature" className="h-full object-contain" />
                            </button>
                            <p className="text-xs text-muted-foreground mt-2 text-center font-medium">Signed Agreement · zoom</p>
                          </div>
                        )}
                      </div>

                      {(postInspection.photos_exterior?.length > 0 || postInspection.photos_interior?.length > 0) && (
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-3">Additional Visual Evidence</p>
                          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                            {[...(postInspection.photos_exterior || []), ...(postInspection.photos_interior || [])].map((img, i) => (
                              <button key={i} onClick={() => setLightboxUrl(img)} className="w-24 h-24 shrink-0 rounded-xl overflow-hidden border border-border cursor-zoom-in">
                                <img src={img} alt="Evidence" className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </SectionCard>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* --- MODALS --- */}
      {/* Pickup / Return Modal */}
      {(activeModal === 'pickup' || activeModal === 'return') && (
        <AdminBookingLifecycle
          booking={booking}
          onClose={() => setActiveModal(null)}
          onRefresh={() => fetchBooking(true)}
        />
      )}

      {/* Add Extension Modal */}
      {activeModal === 'extend' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
            <div className="p-6 md:p-8">
              <h3 className="text-xl font-black mb-1">Add Extension</h3>
              <p className="text-sm text-muted-foreground mb-8">Extend rental period and log additional charges.</p>
              
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-2">Extra Days</label>
                  <input 
                    type="number" min="1" 
                    value={extensionDays} 
                    onChange={e => {
                      const days = parseInt(e.target.value) || 0;
                      setExtensionDays(days);
                      setExtensionCost(days * (booking.cars?.daily_rate || 0));
                    }}
                    className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl font-black text-lg focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-2">Extension Cost (KES)</label>
                  <input 
                    type="number" min="0" 
                    value={extensionCost} 
                    onChange={e => setExtensionCost(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl font-black text-lg focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button onClick={() => setActiveModal(null)} className="flex-1 py-3.5 bg-muted text-muted-foreground rounded-xl font-black text-sm hover:bg-muted/80 transition-colors">Cancel</button>
                <button onClick={handleAddExtension} disabled={isSubmitting} className="flex-1 py-3.5 bg-primary text-primary-foreground rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors">
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flag Modal */}
      {activeModal === 'flag' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-red-500/30 rounded-3xl shadow-2xl shadow-red-500/10 w-full max-w-sm overflow-hidden animate-in zoom-in-95">
            <div className="p-6 md:p-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center text-red-500"><Flag size={20} /></div>
                <h3 className="text-xl font-black text-red-500">Flag Booking</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-8">Mark this booking for special attention or issues.</p>
              
              <div>
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-2">Reason (Optional)</label>
                <textarea 
                  value={flagReason} 
                  onChange={e => setFlagReason(e.target.value)}
                  placeholder="e.g. Client unresponsive, vehicle damaged..."
                  rows={4}
                  className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl font-medium text-sm focus:ring-2 focus:ring-red-500/20 resize-none"
                />
              </div>

              <div className="flex gap-3 mt-8">
                <button onClick={() => setActiveModal(null)} className="flex-1 py-3.5 bg-muted text-muted-foreground rounded-xl font-black text-sm hover:bg-muted/80 transition-colors">Cancel</button>
                <button onClick={handleFlagToggle} disabled={isSubmitting} className="flex-1 py-3.5 bg-red-600 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:bg-red-700 transition-colors">
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Flag Booking'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in"
          onClick={() => setLightboxUrl(null)}
        >
          <button 
            onClick={() => setLightboxUrl(null)}
            className="absolute top-6 right-6 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
          >
            <X size={24} />
          </button>
          <img 
            src={lightboxUrl} 
            alt="Expanded view"
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl animate-in zoom-in-95"
            onClick={e => e.stopPropagation()} 
          />
        </div>
      )}
    </div>
  );
}
