import React, { useState, useCallback, useEffect } from 'react';
import { Car } from '../../../types';
import { Upload, ArrowRight, ArrowLeft, User, Mail, Phone, FileText, CheckCircle2, Loader2, Camera, Image, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
// Removed react-dropzone for mobile stability
import { bookingService } from '../../../services/bookingService';
import { clientService } from '../../../services/clientService';
import { AuthModal } from '../auth/AuthModal';
import { supabase } from '../../../lib/supabase';
import { InternationalPhoneInput } from '../../ui/InternationalPhoneInput';
import { toast } from 'sonner';
import { validateFile } from '../../../utils/fileValidation';
import { CameraCapture } from './CameraCapture';
import { compressImage } from '../../../utils/imageCompression';

interface Step2Props {
  car: Car;
  onNext: (data: any) => void;
  onPrev: () => void;
  initialData?: any;
}

type DocType = 'facePhoto' | 'licenseFront' | 'licenseBack' | 'idFront' | 'idBack';

type GloveboxDocuments = {
  idNumber?: string;
  facePhotoUrl?: string;
  licenseFrontUrl?: string;
  licenseBackUrl?: string;
  idFrontUrl?: string;
  idBackUrl?: string;
};

const DOC_LABELS: Record<DocType, string> = {
  facePhoto: 'Face Photo',
  licenseFront: 'License Front',
  licenseBack: 'License Back',
  idFront: 'ID Front',
  idBack: 'ID Back'
};

interface DocumentSlotProps {
  type: DocType;
  uploadedUrl: string;
  isUploading: boolean;
  disablePicker: boolean;
  onUploadFile: (file: File, type: DocType) => void;
  onOpenCamera: (type: DocType) => void;
}

function DocumentSlot({ type, uploadedUrl, isUploading, disablePicker, onUploadFile, onOpenCamera }: DocumentSlotProps) {
  return (
    <div className="space-y-2">
      <p className="text-[9px] font-black uppercase tracking-widest text-white/50 text-center">{DOC_LABELS[type]}</p>
      <div
        className={`relative p-4 border-2 border-dashed rounded-[16px] md:rounded-[20px] text-center transition-all ${
          uploadedUrl ? 'border-green-500/50 bg-green-500/5'
          : 'border-white/10 hover:border-white/20'
        }`}
      >
        <AnimatePresence mode="wait">
          {isUploading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-1 py-2">
              <Loader2 className="animate-spin text-primary" size={20} />
              <p className="text-[9px] font-black uppercase tracking-widest text-primary">Uploading...</p>
            </motion.div>
          ) : uploadedUrl ? (
            <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-1 py-2">
              <CheckCircle2 className="text-green-500" size={20} />
              <p className="text-[9px] font-black uppercase tracking-widest text-green-500">Done</p>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2 py-1">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    if (disablePicker) return;
                    onOpenCamera(type);
                  }}
                  disabled={disablePicker}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 rounded-xl text-primary hover:bg-primary/20 transition-colors"
                >
                  <Camera size={14} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Camera</span>
                </button>
                <label className={`flex items-center gap-1.5 px-3 py-2 bg-white/5 rounded-xl text-white/50 hover:bg-white/10 transition-colors ${disablePicker ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <Image size={14} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">File</span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    disabled={disablePicker}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onUploadFile(file, type);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function Step2({ car, onNext, onPrev, initialData }: Step2Props) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState<DocType | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [formData, setFormData] = useState(() => {
    const saved = sessionStorage.getItem(`step2_data_${car.id}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      fullName: '',
      email: '',
      phone: '',
      license: '',
      idNumber: '',
      poBox: '',
      facePhotoUrl: '',
      licenseFrontUrl: '',
      licenseBackUrl: '',
      idFrontUrl: '',
      idBackUrl: ''
    };
  });

  useEffect(() => {
    sessionStorage.setItem(`step2_data_${car.id}`, JSON.stringify(formData));
  }, [formData, car.id]);

  // Pre-fill from profile + glovebox for logged-in users
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [profileRes, gloveboxRes] = await Promise.allSettled([
        supabase.from('user_profiles').select('full_name, email, phone_number, license_number, id_number, role').eq('id', user.id).single(),
        clientService.getGloveboxData(user.id),
      ]);
      const profile = profileRes.status === 'fulfilled' ? profileRes.value.data : null;
      const glovebox = gloveboxRes.status === 'fulfilled' ? gloveboxRes.value : null;

      // Skip autofilling profile info if the user is an admin or fleet owner testing the flow
      if (profile?.role === 'admin' || profile?.role === 'fleet_owner') {
        return;
      }

      const docs: GloveboxDocuments = glovebox?.documents || {};
      setFormData(prev => ({
        ...prev,
        fullName:       profile?.full_name    || prev.fullName,
        email:          profile?.email        || prev.email,
        phone:          profile?.phone_number || prev.phone,
        license:        profile?.license_number || prev.license,
        idNumber:       profile?.id_number    || docs.idNumber         || prev.idNumber,
        poBox:          prev.poBox,
        facePhotoUrl:   docs.facePhotoUrl     || prev.facePhotoUrl,
        licenseFrontUrl:docs.licenseFrontUrl  || prev.licenseFrontUrl,
        licenseBackUrl: docs.licenseBackUrl   || prev.licenseBackUrl,
        idFrontUrl:     docs.idFrontUrl       || prev.idFrontUrl,
        idBackUrl:      docs.idBackUrl        || prev.idBackUrl,
      }));
      if (profile?.full_name) setPrefilled(true);
    })();
  }, []);

  useEffect(() => {
    if (!initialData) return;

    setFormData(prev => ({
      ...prev,
      fullName: initialData.fullName || prev.fullName,
      email: initialData.email || prev.email,
      phone: initialData.phone || prev.phone,
      license: initialData.license || prev.license,
      idNumber: initialData.idNumber || prev.idNumber,
      poBox: initialData.poBox || prev.poBox,
      facePhotoUrl: initialData.facePhotoUrl || prev.facePhotoUrl,
      licenseFrontUrl: initialData.licenseFrontUrl || prev.licenseFrontUrl,
      licenseBackUrl: initialData.licenseBackUrl || prev.licenseBackUrl,
      idFrontUrl: initialData.idFrontUrl || prev.idFrontUrl,
      idBackUrl: initialData.idBackUrl || prev.idBackUrl,
    }));

    if (initialData.fullName || initialData.email || initialData.phone) {
      setPrefilled(true);
    }
  }, [initialData]);

  const uploadFile = useCallback(async (file: File, type: DocType) => {
    if (uploading) return;

    setUploading(type);
    try {
      const validation = await validateFile(file);
      if (!validation.isValid) {
        toast.error(`File validation failed: ${validation.error}`);
        return;
      }
      
      let finalFile = file;
      // Compress only if it's an image (exclude PDFs)
      if (file.type.startsWith('image/')) {
        // Yield one frame so mobile browsers can fully close the file picker
        // before expensive image processing begins.
        await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
        finalFile = await compressImage(file, 1200, 1200, 0.7);
      }
      
      const url = await bookingService.uploadDocument(finalFile, type, `temp_${Date.now()}`);
      setFormData(prev => ({ ...prev, [`${type}Url`]: url }));
      toast.success(`${DOC_LABELS[type]} uploaded successfully`);
    } catch (error) {
      toast.error(`Failed to upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(null);
    }
  }, [uploading]);

  const handleCameraCapture = (file: File) => {
    if (showCamera) {
      uploadFile(file, showCamera);
    }
    setShowCamera(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const required: DocType[] = ['facePhoto', 'licenseFront', 'licenseBack', 'idFront', 'idBack'];
    const missing = required.filter(type => !formData[`${type}Url` as keyof typeof formData]);
    if (missing.length > 0) {
      toast.error(`Please upload: ${missing.map(t => DOC_LABELS[t]).join(', ')}`);
      return;
    }
    sessionStorage.removeItem('temp_step2_data');
    onNext({ ...formData, _fromGlovebox: prefilled });
  };

  return (
    <>
      {showCamera && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(null)}
          defaultFacing={showCamera === 'facePhoto' ? 'user' : 'environment'}
        />
      )}
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="space-y-1">
          <h3 className="text-xl sm:text-2xl md:text-3xl font-serif font-black italic text-foreground">Your Details</h3>
          <p className="text-muted-foreground text-xs sm:text-sm">Provide your information and verification documents.</p>
          {prefilled && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-success/10 border border-success/20 rounded-xl">
              <ShieldCheck size={14} className="text-success shrink-0" />
              <p className="text-xs text-success font-medium">Pre-filled from your profile &amp; glovebox — review and continue.</p>
            </div>
          )}
        </div>

        <div className="space-y-3 sm:space-y-4 md:space-y-6">
          {/* Personal Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="group relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={18} />
              <input
                type="text" placeholder="Full Name" required
                value={formData.fullName || ''} onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                className="w-full pl-12 pr-4 py-4 bg-card/50 border border-border rounded-[18px] text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all hover:bg-card/70"
              />
            </div>
            <div className="group relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={18} />
              <input
                type="email" placeholder="Email Address" required
                value={formData.email || ''} onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full pl-12 pr-4 py-4 bg-card/50 border border-border rounded-[18px] text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all hover:bg-card/70"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="group relative">
              <InternationalPhoneInput
                required
                value={formData.phone || ''}
                onChange={(val) => setFormData({...formData, phone: val})}
              />
            </div>
            <div className="group relative">
              <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={18} />
              <input
                type="text" placeholder="Driver's License No." required
                value={formData.license || ''} onChange={(e) => setFormData({...formData, license: e.target.value})}
                className="w-full pl-12 pr-4 py-4 bg-card/50 border border-border rounded-[18px] text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all hover:bg-card/70"
              />
            </div>
          </div>

          <div className="group relative">
            <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={18} />
            <input
              type="text" placeholder="National ID / Passport Number" required
              value={formData.idNumber || ''} onChange={(e) => setFormData({...formData, idNumber: e.target.value})}
              className="w-full pl-12 pr-4 py-4 bg-card/50 border border-border rounded-[18px] text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all hover:bg-card/70"
            />
          </div>

          <div className="group relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={18} />
            <input
              type="text" placeholder="P.O. Box (Optional)"
              value={formData.poBox || ''} onChange={(e) => setFormData({...formData, poBox: e.target.value})}
              className="w-full pl-12 pr-4 py-4 bg-card/50 border border-border rounded-[18px] text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all hover:bg-card/70"
            />
          </div>

          {/* Face Photo */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-3 block">Face Photo / Passport Photo</label>
            <div className="max-w-xs mx-auto">
              <DocumentSlot type="facePhoto" uploadedUrl={formData.facePhotoUrl} isUploading={uploading === 'facePhoto'} disablePicker={Boolean(uploading)} onUploadFile={uploadFile} onOpenCamera={setShowCamera} />
            </div>
          </div>

          {/* License Documents */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-3 block">Driver's License</label>
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <DocumentSlot type="licenseFront" uploadedUrl={formData.licenseFrontUrl} isUploading={uploading === 'licenseFront'} disablePicker={Boolean(uploading)} onUploadFile={uploadFile} onOpenCamera={setShowCamera} />
              <DocumentSlot type="licenseBack" uploadedUrl={formData.licenseBackUrl} isUploading={uploading === 'licenseBack'} disablePicker={Boolean(uploading)} onUploadFile={uploadFile} onOpenCamera={setShowCamera} />
            </div>
          </div>

          {/* ID Documents */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-3 block">National ID / Passport</label>
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <DocumentSlot type="idFront" uploadedUrl={formData.idFrontUrl} isUploading={uploading === 'idFront'} disablePicker={Boolean(uploading)} onUploadFile={uploadFile} onOpenCamera={setShowCamera} />
              <DocumentSlot type="idBack" uploadedUrl={formData.idBackUrl} isUploading={uploading === 'idBack'} disablePicker={Boolean(uploading)} onUploadFile={uploadFile} onOpenCamera={setShowCamera} />
            </div>
          </div>
        </div>

        <div className="flex gap-2 sm:gap-3">
          <button
            type="button" onClick={onPrev}
            className="w-1/5 sm:w-1/4 py-3.5 sm:py-4 bg-card/50 rounded-[14px] sm:rounded-[20px] text-foreground font-black uppercase tracking-widest hover:bg-card/70 transition-all flex items-center justify-center border border-border"
          >
            <ArrowLeft size={18} />
          </button>
          <button
            type="submit"
            className="flex-1 py-3.5 sm:py-4 bg-primary rounded-[14px] sm:rounded-[20px] text-black font-black uppercase tracking-[0.15em] text-[11px] sm:text-sm flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-primary/20 group"
          >
            Review Booking
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </form>
    </>
  );
}
