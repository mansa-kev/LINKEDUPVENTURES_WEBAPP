import React, { useEffect, useMemo, useState } from 'react';
import { adminService } from '../../services/adminService';
import { groupVehicleModels } from '../../utils/vehicleModelGrouping';
import { VehicleModel } from '../../types';
import {
  Car,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

type VehicleModelRow = VehicleModel & {
  cars?: Array<{ id: string }>;
};

const EMPTY_FORM: Partial<VehicleModelRow> = {
  make: '',
  model: '',
  year: new Date().getFullYear(),
  display_name: '',
  slug: '',
  category: 'SUV',
  description: '',
  primary_image_url: '',
  gallery_urls: [],
  video_url: '',
  transmission: 'Automatic',
  fuel_type: 'Petrol',
  seats: 5,
  luggage: 2,
  features: [],
  base_daily_rate: 0,
  overtime_rate: 0,
  security_deposit: 0,
  is_chauffeured_only: false,
  is_public: true,
  sort_order: 0,
};

export function AdminVehicleModels() {
  const [models, setModels] = useState<VehicleModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedModel, setSelectedModel] = useState<VehicleModelRow | null>(null);
  const [formData, setFormData] = useState<Partial<VehicleModelRow>>(EMPTY_FORM);
  const [primaryImageFile, setPrimaryImageFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const result = await adminService.getVehicleModels(1, 200);
      if (result?.data) setModels(result.data as VehicleModelRow[]);
    } catch (error) {
      console.error('Failed to fetch vehicle models:', error);
      toast.error('Failed to load vehicle models');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);

  const groupedModels = useMemo(() => {
    const unitCounts: Record<string, number> = {};
    for (const row of models) {
      unitCounts[row.id] = row.cars?.length || 0;
    }
    return groupVehicleModels(models, unitCounts);
  }, [models]);

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return groupedModels;
    return groupedModels.filter((group) => {
      const haystack = [
        group.displayName,
        group.slug,
        group.category,
        group.variantYears.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [groupedModels, search]);

  const openCreate = () => {
    setSelectedModel(null);
    setFormData(EMPTY_FORM);
    setPrimaryImageFile(null);
    setGalleryFiles([]);
    setShowForm(true);
  };

  const openEdit = (model: VehicleModelRow) => {
    setSelectedModel(model);
    setFormData({
      ...EMPTY_FORM,
      ...model,
      gallery_urls: model.gallery_urls || [],
      features: model.features || [],
    });
    setPrimaryImageFile(null);
    setGalleryFiles([]);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.make || !formData.model) {
      toast.error('Make and model are required');
      return;
    }

    setSaving(true);
    try {
      let primaryImageUrl = formData.primary_image_url || '';
      if (primaryImageFile) {
        primaryImageUrl = await adminService.uploadCarImage(primaryImageFile);
      }

      let galleryUrls = [...(formData.gallery_urls || [])];
      if (galleryFiles.length > 0) {
        const uploaded = await Promise.all(galleryFiles.map((f) => adminService.uploadCarImage(f)));
        galleryUrls = [...galleryUrls, ...uploaded];
      }

      const payload = {
        ...formData,
        primary_image_url: primaryImageUrl,
        gallery_urls: galleryUrls,
      };

      if (selectedModel?.id) {
        await adminService.updateVehicleModel(selectedModel.id, payload);
        toast.success('Vehicle model updated');
      } else {
        await adminService.addVehicleModel(payload);
        toast.success('Vehicle model created');
      }

      setShowForm(false);
      setSelectedModel(null);
      setFormData(EMPTY_FORM);
      setPrimaryImageFile(null);
      setGalleryFiles([]);
      await fetchModels();
    } catch (error: any) {
      console.error('Failed to save vehicle model:', error);
      toast.error(error?.message || 'Failed to save vehicle model');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this vehicle model? Existing cars will lose the link if the database allows it.')) {
      return;
    }
    try {
      await adminService.deleteVehicleModel(id);
      toast.success('Vehicle model deleted');
      await fetchModels();
    } catch (error: any) {
      console.error('Failed to delete vehicle model:', error);
      toast.error(error?.message || 'Failed to delete vehicle model');
    }
  };

  const addFeature = (feature: string) => {
    const trimmed = feature.trim();
    if (!trimmed) return;
    const next = new Set([...(formData.features || []), trimmed]);
    setFormData((prev) => ({ ...prev, features: Array.from(next) }));
  };

  if (loading && models.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center p-20">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black">Vehicle Models</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the public catalog separately from physical fleet units.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-xl font-bold text-sm hover:scale-105 transition-transform shadow-lg shadow-primary/20"
        >
          <Plus size={16} /> Add Vehicle Model
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search vehicle models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </div>
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {filteredGroups.length} model famil{filteredGroups.length === 1 ? 'y' : 'ies'}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filteredGroups.map((group) => (
          <div key={group.groupKey} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="flex">
              <div className="w-36 h-32 bg-muted shrink-0 overflow-hidden">
                {group.primary_image_url ? (
                  <img
                    src={group.primary_image_url}
                    alt={group.displayName}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <Car size={28} />
                  </div>
                )}
              </div>
              <div className="flex-1 p-4 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold truncate">{group.displayName}</h3>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {group.slug}
                      {group.variantYears.length > 0 && ` · ${group.variantYears.join(', ')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${group.is_public ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {group.is_public ? 'Public' : 'Hidden'}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="text-muted-foreground">Category: <span className="text-foreground font-semibold">{group.category || 'N/A'}</span></div>
                  <div className="text-muted-foreground">Units: <span className="text-foreground font-semibold">{group.unitCount}</span></div>
                  <div className="text-muted-foreground">Variants: <span className="text-foreground font-semibold">{group.variants.length}</span></div>
                  <div className="text-muted-foreground">Rate: <span className="text-foreground font-semibold">{group.base_daily_rate ? `KES ${Number(group.base_daily_rate).toLocaleString()}` : 'N/A'}</span></div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setExpandedGroupKey(expandedGroupKey === group.groupKey ? null : group.groupKey)}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    {expandedGroupKey === group.groupKey ? 'Hide variants' : 'View variants'}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(group.representative)}
                      className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-primary transition-colors"
                      title="Edit primary variant"
                    >
                      <Edit3 size={16} />
                    </button>
                  </div>
                </div>

                {expandedGroupKey === group.groupKey && (
                  <div className="mt-4 space-y-2 border-t border-border pt-3">
                    {group.variants.map((variant) => (
                      <div key={variant.id} className="flex items-center justify-between gap-3 text-xs bg-muted/30 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">
                            {variant.year ? `${variant.year}` : 'No year'}
                            {variant.display_name && variant.display_name !== group.displayName ? ` · ${variant.display_name}` : ''}
                          </p>
                          <p className="text-muted-foreground truncate">{variant.slug}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-muted-foreground">{models.find((m) => m.id === variant.id)?.cars?.length || 0} units</span>
                          <button onClick={() => openEdit(variant as VehicleModelRow)} className="p-1.5 hover:bg-muted rounded-md" title="Edit variant">
                            <Edit3 size={14} />
                          </button>
                          <button onClick={() => handleDelete(variant.id)} className="p-1.5 hover:bg-error/10 rounded-md text-error" title="Delete variant">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredGroups.length === 0 && (
        <div className="p-12 text-center bg-card border border-border rounded-2xl">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Car size={32} className="text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold mb-1">No vehicle models found</h3>
          <p className="text-muted-foreground">Create the first model to start separating public listings from units.</p>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card w-full max-w-5xl rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 max-h-[92vh]">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">{selectedModel ? 'Edit Vehicle Model' : 'Add Vehicle Model'}</h3>
                <p className="text-sm text-muted-foreground mt-1">Public listing definition for one model family.</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-muted rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Make *</label>
                  <input value={formData.make || ''} onChange={(e) => setFormData({ ...formData, make: e.target.value })} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Model *</label>
                  <input value={formData.model || ''} onChange={(e) => setFormData({ ...formData, model: e.target.value })} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Year</label>
                  <input type="number" value={formData.year || ''} onChange={(e) => setFormData({ ...formData, year: e.target.value ? parseInt(e.target.value, 10) : undefined })} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Display Name</label>
                  <input value={formData.display_name || ''} onChange={(e) => setFormData({ ...formData, display_name: e.target.value })} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" placeholder="e.g. Toyota Hilux Double Cabin" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Slug</label>
                  <input value={formData.slug || ''} onChange={(e) => setFormData({ ...formData, slug: e.target.value })} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" placeholder="toyota-hilux-double-cabin" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category</label>
                  <input value={formData.category || ''} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label>
                  <textarea value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Daily Rate</label>
                  <input type="number" value={formData.base_daily_rate || ''} onChange={(e) => setFormData({ ...formData, base_daily_rate: e.target.value ? parseFloat(e.target.value) : 0 })} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Overtime Rate</label>
                  <input type="number" value={formData.overtime_rate || ''} onChange={(e) => setFormData({ ...formData, overtime_rate: e.target.value ? parseFloat(e.target.value) : 0 })} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Security Deposit</label>
                  <input type="number" value={formData.security_deposit || ''} onChange={(e) => setFormData({ ...formData, security_deposit: e.target.value ? parseFloat(e.target.value) : 0 })} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sort Order</label>
                  <input type="number" value={formData.sort_order || ''} onChange={(e) => setFormData({ ...formData, sort_order: e.target.value ? parseInt(e.target.value, 10) : 0 })} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Transmission</label>
                  <input value={formData.transmission || ''} onChange={(e) => setFormData({ ...formData, transmission: e.target.value })} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Fuel Type</label>
                  <input value={formData.fuel_type || ''} onChange={(e) => setFormData({ ...formData, fuel_type: e.target.value })} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Seats</label>
                  <input type="number" value={formData.seats || ''} onChange={(e) => setFormData({ ...formData, seats: e.target.value ? parseInt(e.target.value, 10) : 0 })} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Luggage</label>
                  <input type="number" value={formData.luggage || ''} onChange={(e) => setFormData({ ...formData, luggage: e.target.value ? parseInt(e.target.value, 10) : 0 })} className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Primary Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setPrimaryImageFile(file);
                      if (file) {
                        setFormData((prev) => ({ ...prev, primary_image_url: URL.createObjectURL(file) }));
                      }
                    }}
                    className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm file:mr-4 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-primary/10 file:text-primary"
                  />
                  {formData.primary_image_url && (
                    <div className="relative w-full h-44 rounded-xl overflow-hidden border border-border">
                      <img src={formData.primary_image_url} alt="Primary preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Gallery Images</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setGalleryFiles(Array.from(e.target.files || []))}
                    className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm file:mr-4 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-primary/10 file:text-primary"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    {(formData.gallery_urls || []).map((url, index) => (
                      <div key={index} className="relative h-24 rounded-xl overflow-hidden border border-border">
                        <img src={url} alt={`Gallery ${index + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, gallery_urls: (prev.gallery_urls || []).filter((_, i) => i !== index) }))}
                          className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {galleryFiles.length > 0 && (
                    <p className="text-xs text-muted-foreground">{galleryFiles.length} new gallery file(s) ready to upload on save.</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Features</label>
                <div className="flex flex-wrap gap-2">
                  {(formData.features || []).map((feature, index) => (
                    <span key={`${feature}-${index}`} className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full flex items-center gap-2">
                      {feature}
                      <button type="button" onClick={() => setFormData((prev) => ({ ...prev, features: (prev.features || []).filter((_, i) => i !== index) }))}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Type a feature and press Enter"
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addFeature((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="flex items-center gap-3 p-4 bg-muted/20 border border-border rounded-xl">
                  <input type="checkbox" checked={!!formData.is_public} onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })} />
                  <span className="text-sm font-medium flex items-center gap-2">{formData.is_public ? <Eye size={16} /> : <EyeOff size={16} />} Public listing visible</span>
                </label>
                <label className="flex items-center gap-3 p-4 bg-muted/20 border border-border rounded-xl">
                  <input type="checkbox" checked={!!formData.is_chauffeured_only} onChange={(e) => setFormData({ ...formData, is_chauffeured_only: e.target.checked })} />
                  <span className="text-sm font-medium">Chauffeured only</span>
                </label>
              </div>
            </div>

            <div className="p-6 border-t border-border bg-muted/10 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-6 py-2 rounded-xl font-bold border border-border bg-card hover:bg-muted transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-8 py-2 rounded-xl font-bold bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {selectedModel ? 'Update Vehicle Model' : 'Save Vehicle Model'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
