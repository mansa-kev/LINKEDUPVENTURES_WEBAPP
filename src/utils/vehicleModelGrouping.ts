import { VehicleModel } from '../types';

const TRIM_SUFFIX_PATTERNS = [
  /\be[\s-]?power\b/g,
  /\bnismo\b/g,
  /\bhybrid\b/g,
  /\bpremium\b/g,
  /\blimited\b/g,
  /\bsport\b/g,
  /\bspecial edition\b/g,
  /\bsignature\b/g,
  /\bexecutive\b/g,
  /\bdeluxe\b/g,
];

function normalizeModelText(value?: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripKnownTrimSuffixes(model?: string): string {
  let normalized = normalizeModelText(model);
  for (const pattern of TRIM_SUFFIX_PATTERNS) {
    normalized = normalized.replace(pattern, ' ').trim().replace(/\s+/g, ' ');
  }
  return normalized;
}

function deriveFamilyModelName(entry: VehicleModel, siblingModels: VehicleModel[]): string {
  const exactModel = normalizeModelText(entry.model);
  const siblingExactModels = new Set(
    siblingModels.map((sibling) => normalizeModelText(sibling.model)).filter(Boolean)
  );

  const stripped = stripKnownTrimSuffixes(entry.model);
  if (stripped && stripped !== exactModel && siblingExactModels.has(stripped)) {
    return stripped;
  }

  const sortedCandidates = [...siblingExactModels].sort((a, b) => a.length - b.length);
  const prefixCandidate = sortedCandidates.find((candidate) => {
    if (!candidate || candidate === exactModel) return false;
    return exactModel.startsWith(`${candidate} `);
  });

  return prefixCandidate || exactModel;
}

export function normalizeMakeModelKey(make?: string, model?: string): string {
  return `${(make || '').trim().toLowerCase()}::${(model || '').trim().toLowerCase()}`;
}

export function buildModelFamilySlug(make: string, model: string): string {
  return `${make}-${model}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type VehicleModelGroup = {
  groupKey: string;
  make: string;
  model: string;
  displayName: string;
  slug: string;
  representativeId: string;
  representative: VehicleModel;
  variants: VehicleModel[];
  unitCount: number;
  variantYears: number[];
  primary_image_url?: string;
  base_daily_rate?: number;
  category?: string;
  is_public: boolean;
};

export function groupVehicleModels(
  models: VehicleModel[],
  unitCountsByModelId: Record<string, number> = {}
): VehicleModelGroup[] {
  const buckets = new Map<string, VehicleModel[]>();
  const modelsByMake = new Map<string, VehicleModel[]>();

  for (const entry of models || []) {
    const makeKey = normalizeModelText(entry.make);
    if (!modelsByMake.has(makeKey)) modelsByMake.set(makeKey, []);
    modelsByMake.get(makeKey)!.push(entry);
  }

  for (const entry of models || []) {
    const makeKey = normalizeModelText(entry.make);
    const familyModelName = deriveFamilyModelName(entry, modelsByMake.get(makeKey) || []);
    const key = normalizeMakeModelKey(entry.make, familyModelName);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(entry);
  }

  const groups: VehicleModelGroup[] = [];

  for (const [groupKey, variants] of buckets) {
    const sorted = [...variants].sort((a, b) => {
      const unitsA = unitCountsByModelId[a.id] || 0;
      const unitsB = unitCountsByModelId[b.id] || 0;
      if (unitsB !== unitsA) return unitsB - unitsA;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    const representative = sorted[0];
    const publicVariant = sorted.find((v) => v.is_public !== false) || representative;
    const unitCount = sorted.reduce(
      (sum, variant) => sum + (unitCountsByModelId[variant.id] || 0),
      0
    );
    const variantYears = [...new Set(sorted.map((v) => v.year).filter(Boolean) as number[])].sort();
    const rates = sorted
      .map((v) => Number(v.base_daily_rate))
      .filter((rate) => Number.isFinite(rate) && rate > 0);

    groups.push({
      groupKey,
      make: representative.make,
      model: representative.model,
      displayName:
        publicVariant.display_name ||
        `${representative.make} ${representative.model}`.trim(),
      slug: buildModelFamilySlug(representative.make, representative.model),
      representativeId: representative.id,
      representative: publicVariant,
      variants: sorted,
      unitCount,
      variantYears,
      primary_image_url:
        publicVariant.primary_image_url || representative.primary_image_url,
      base_daily_rate:
        rates.length > 0 ? Math.min(...rates) : representative.base_daily_rate,
      category: publicVariant.category || representative.category,
      is_public: sorted.some((v) => v.is_public !== false),
    });
  }

  return groups.sort(
    (a, b) => (a.representative.sort_order || 0) - (b.representative.sort_order || 0)
  );
}

export function getVehicleModelIdsForGroup(group: VehicleModelGroup): string[] {
  return group.variants.map((variant) => variant.id);
}
