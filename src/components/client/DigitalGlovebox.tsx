import React, { useEffect, useState } from 'react';
import { clientService } from '../../services/clientService';
import { supabase } from '../../lib/supabase';
import {
  FileText, Download, Eye, CreditCard, ShieldCheck, AlertTriangle,
  Clock, CheckCircle2, User, IdCard, Car, Loader2, FolderOpen, Receipt
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

export function DigitalGlovebox() {
  const [gloveboxData, setGloveboxData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const data = await clientService.getGloveboxData(user.id);
        setGloveboxData(data);
      }
    } catch (err) {
      console.error('Glovebox fetch error:', err);
      setGloveboxData({ documents: {}, contracts: [], payments: [] });
    } finally {
      setLoading(false);
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
  const hasDocuments = DOC_SLOTS.some(s => documents[s.key]);
  const docStatus = documents.status;

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div>
        <h2 className="text-2xl font-bold">Digital Glovebox</h2>
        <p className="text-muted-foreground text-sm mt-1">Your documents, contracts and payment history — all in one place.</p>
      </div>

      {/* ── My Documents ── */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" />
            <h3 className="font-bold">My Documents</h3>
          </div>
          {docStatus && <DocStatusBadge status={docStatus} />}
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

        <div className="p-6">
          {!hasDocuments ? (
            <div className="text-center py-10 space-y-2">
              <FolderOpen size={40} className="mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">No documents on file yet.</p>
              <p className="text-xs text-muted-foreground">
                Complete a booking and your uploaded documents will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.idNumber && (
                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border">
                  <IdCard size={16} className="text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-bold">ID Number</p>
                    <p className="text-sm font-mono font-bold">{documents.idNumber}</p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {DOC_SLOTS.map(({ key, label, icon: Icon }) => {
                  const url = documents[key];
                  return (
                    <div key={key} className={`flex items-center justify-between p-3 rounded-xl border ${url ? 'bg-success/5 border-success/20' : 'bg-muted/20 border-border'}`}>
                      <div className="flex items-center gap-3">
                        <Icon size={16} className={url ? 'text-success' : 'text-muted-foreground'} />
                        <div>
                          <p className="text-sm font-medium">{label}</p>
                          {url
                            ? <p className="text-xs text-success flex items-center gap-1"><CheckCircle2 size={10} /> On file</p>
                            : <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={10} /> Not uploaded</p>
                          }
                        </div>
                      </div>
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
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Contracts Vault ── */}
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

      {/* ── Payment History ── */}
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
