// @ts-nocheck
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { clientService } from '../../services/clientService';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { compressImage } from '../../utils/imageCompression';
import { validateFile } from '../../utils/fileValidation';
import {
  FileText, Download, Eye, CreditCard, ShieldCheck, AlertTriangle,
  Clock, CheckCircle2, User, IdCard, Loader2, FolderOpen, Receipt,
  Upload, X, RefreshCw,
} from 'lucide-react';

const DOC_SLOTS = [
  { key: 'facePhotoUrl',    label: 'Face / Passport Photo', icon: User },
  { key: 'licenseFrontUrl', label: 'License Front',         icon: IdCard },
  { key: 'licenseBackUrl',  label: 'License Back',          icon: IdCard },
  { key: 'idFrontUrl',      label: 'National ID Front',     icon: IdCard },
  { key: 'idBackUrl',       label: 'National ID Back',      icon: IdCard },
] as const;

function DocStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const map: Record<string, { label: string; cls: string }> = {
    approved:              { label: 'Approved',          cls: 'bg-success/10 text-success border-success/20' },
    pending:               { label: 'Pending Review',    cls: 'bg-warning/10 text-warning border-warning/20' },
    resubmission_required: { label: 'Action Required',  cls: 'bg-error/10 text-error border-error/20' },
    resubmitted:           { label: 'Under Review',     cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  };
  const s = map[status] || { label: status, cls: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${s.cls}`}>
      {s.label}
    </span>
  );
}

interface DocSlotRowProps {
  slotKey: string;
  label: string;
  Icon: any;
  url: string | null;
  isBusy: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

function DocSlotRow({ slotKey, label, Icon, url, isBusy, onUpload, onRemove }: DocSlotRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isBusy) return;
    if (inputRef.current) inputRef.current.value = '';
    inputRef.current?.click();
  };
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onUpload(file);
  };
  const isPdf = url && /\.pdf(\?|$)/i.test(url);

  return (
    <div className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${url ? 'bg-success/5 border-success/20' : 'bg-muted/20 border-border'}`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFile}
      />
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {url && !isPdf ? (
          <img src={url} alt={label} className="w-10 h-10 rounded-lg object-cover shrink-0" />
        ) : (
          <Icon size={16} className={url ? 'text-success shrink-0' : 'text-muted-foreground shrink-0'} />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{label}</p>
          {url ? (
            <p className="text-xs text-success flex items-center gap-1"><CheckCircle2 size={10} /> On file</p>
          ) : (
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={10} /> Not uploaded</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {isBusy ? (
          <Loader2 className="animate-spin text-primary" size={16} />
        ) : (
          <>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                title="View"
              >
                <Eye size={14} />
              </a>
            )}
            <button
              type="button"
              onClick={openPicker}
              className="p-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-foreground"
              title={url ? 'Replace' : 'Upload'}
            >
              {url ? <RefreshCw size={14} /> : <Upload size={14} />}
            </button>
            {url && (
              <button
                type="button"
                onClick={onRemove}
                className="p-2 bg-error/10 hover:bg-error/20 rounded-lg transition-colors text-error"
                title="Remove"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function DigitalGlovebox() {
  const [gloveboxData, setGloveboxData] = useState<any>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busySlot, setBusySlot] = useState<string | null>(null);

  const fetchData = useCallback(async (uid?: string) => {
    try {
      const id = uid || clientId;
      if (!id) return;
      const data = await clientService.getGloveboxData(id);
      setGloveboxData(data);
    } catch (err) {
      console.error('Glovebox fetch error:', err);
      setGloveboxData({ documents: {}, contracts: [], payments: [] });
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setClientId(user.id);
        await fetchData(user.id);
      } else {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = async (slotKey: string, file: File) => {
    if (!clientId) return;
    setBusySlot(slotKey);
    try {
      const v = await validateFile(file);
      if (!v.isValid) { toast.error(v.error || 'Invalid file'); return; }
      let final = file;
      if (file.type.startsWith('image/')) {
        await new Promise(r => requestAnimationFrame(() => r(undefined)));
        final = await compressImage(file, 1200, 1200, 0.7);
      }
      const url = await clientService.uploadGloveboxDocument(clientId, slotKey, final);
      // optimistic
      setGloveboxData((prev: any) => ({
        ...prev,
        documents: { ...(prev?.documents || {}), [slotKey]: url },
      }));
      toast.success('Document uploaded');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Upload failed');
    } finally {
      setBusySlot(null);
    }
  };

  const handleRemove = async (slotKey: string) => {
    if (!clientId) return;
    setBusySlot(slotKey);
    try {
      await clientService.removeGloveboxDocument(clientId, slotKey);
      setGloveboxData((prev: any) => ({
        ...prev,
        documents: { ...(prev?.documents || {}), [slotKey]: null },
      }));
      toast.success('Document removed');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Remove failed');
    } finally {
      setBusySlot(null);
    }
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  const { documents = {}, contracts = [], payments = [] } = gloveboxData || {};
  const docStatus = documents.status;
  const completed = DOC_SLOTS.filter(s => documents[s.key]).length;
  const completion = Math.round((completed / DOC_SLOTS.length) * 100);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div>
        <h2 className="text-2xl font-bold">Digital Glovebox</h2>
        <p className="text-muted-foreground text-sm mt-1">Your documents, contracts and payment history — all in one place.</p>
      </div>

      {/* My Documents */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" />
            <h3 className="font-bold">My Documents</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-bold">{completed}/{DOC_SLOTS.length} complete</span>
            {docStatus && <DocStatusBadge status={docStatus} />}
          </div>
        </div>

        {/* completion bar */}
        <div className="px-6 pt-4">
          <div className="w-full bg-muted rounded-full h-1.5">
            <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${completion}%` }} />
          </div>
        </div>

        {docStatus === 'resubmission_required' && gloveboxData?.docBooking?.admin_notes && (
          <div className="mx-6 mt-4 p-3 bg-error/10 border border-error/20 rounded-xl flex items-start gap-2">
            <AlertTriangle size={14} className="text-error mt-0.5 shrink-0" />
            <p className="text-xs text-error">
              <span className="font-bold">Documents rejected: </span>
              {gloveboxData.docBooking.admin_notes}
            </p>
          </div>
        )}

        <div className="p-6 space-y-3">
          {documents.idNumber && (
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border">
              <IdCard size={16} className="text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-bold">ID Number</p>
                <p className="text-sm font-mono font-bold">{documents.idNumber}</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {DOC_SLOTS.map(({ key, label, icon }) => (
              <DocSlotRow
                key={key}
                slotKey={key}
                label={label}
                Icon={icon}
                url={documents[key] || null}
                isBusy={busySlot === key}
                onUpload={(f) => handleUpload(key, f)}
                onRemove={() => handleRemove(key)}
              />
            ))}
          </div>
          {completed === 0 && (
            <div className="text-center py-6 space-y-2">
              <FolderOpen size={36} className="mx-auto text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                Upload your documents here once and we'll reuse them on every booking.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Contracts Vault */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
          <FileText size={18} className="text-primary" />
          <h3 className="font-bold">Contracts Vault</h3>
        </div>
        <div className="p-6">
          {contracts.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <FileText size={36} className="mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">No contracts yet.</p>
              <p className="text-xs text-muted-foreground">Signed contracts from your bookings will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-3 pr-4 font-bold text-xs uppercase tracking-wider">Booking</th>
                    <th className="pb-3 pr-4 font-bold text-xs uppercase tracking-wider">Car</th>
                    <th className="pb-3 pr-4 font-bold text-xs uppercase tracking-wider">Dates</th>
                    <th className="pb-3 font-bold text-xs uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {contracts.map((c: any) => (
                    <tr key={c.id}>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{c.id.slice(0, 8)}</td>
                      <td className="py-3 pr-4 font-medium">{c.car}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {c.start_date ? new Date(c.start_date).toLocaleDateString() : '—'} →{' '}
                        {c.end_date   ? new Date(c.end_date).toLocaleDateString()   : '—'}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {c.contract_url && (
                            <a href={c.contract_url} target="_blank" rel="noopener noreferrer"
                              className="p-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors" title="View Contract">
                              <Eye size={14} />
                            </a>
                          )}
                          {(c.contract_url || c.signature_url) && (
                            <a href={c.contract_url || c.signature_url} download
                              className="p-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors" title="Download">
                              <Download size={14} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Payment History */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
          <Receipt size={18} className="text-primary" />
          <h3 className="font-bold">Payment History</h3>
        </div>
        <div className="p-6">
          {payments.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <CreditCard size={36} className="mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">No payments yet.</p>
              <p className="text-xs text-muted-foreground">Payment records from your bookings will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-3 pr-4 font-bold text-xs uppercase tracking-wider">Date</th>
                    <th className="pb-3 pr-4 font-bold text-xs uppercase tracking-wider">Car</th>
                    <th className="pb-3 pr-4 font-bold text-xs uppercase tracking-wider">Amount</th>
                    <th className="pb-3 font-bold text-xs uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((p: any) => (
                    <tr key={p.id}>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 pr-4 font-medium">
                        {p.bookings?.cars ? `${p.bookings.cars.make} ${p.bookings.cars.model}` : '—'}
                      </td>
                      <td className="py-3 pr-4 font-bold text-primary">
                        KES {Number(p.amount || 0).toLocaleString()}
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          p.payment_status === 'verified' ? 'bg-success/10 text-success border-success/20' :
                          p.payment_status === 'failed'   ? 'bg-error/10 text-error border-error/20' :
                          'bg-warning/10 text-warning border-warning/20'
                        }`}>
                          {p.payment_status || 'pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
