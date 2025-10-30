// src/lib/businesses.ts
export type BusinessKey =
  | 'GALLARDO'
  | 'AVANA'
  | 'ARIA'
  | 'DALE'
  | 'ICON'
  | 'SEVENLOGIK'
  | 'CARE4 HAIR'
  | 'UNIQUE'
  | 'HACIENDA'
  | 'PRESTIGE'
  | 'ZENCARE'
  | 'BODY'
  | 'ADMINISTRACION';

export type BusinessItem = { value: BusinessKey; label: string; code: string; color: string };

export const BUSINESSES: BusinessItem[] = [
  { value: 'GALLARDO',       label: 'Gallardo Law Firm',     code: 'GLF', color: '#2563EB' },
  { value: 'AVANA',          label: 'Avana Plastic Surgery', code: 'AVA', color: '#EF4444' },
  { value: 'ARIA',           label: 'Aria Smile Design',     code: 'ARI', color: '#FACC15' },
  { value: 'DALE',           label: 'Dale Solution',         code: 'DAL', color: '#10B981' },
  { value: 'ICON',           label: 'Icon Cosmetic Center',  code: 'ICO', color: '#8B5CF6' },
  { value: 'SEVENLOGIK',     label: 'Sevenlogik',            code: 'SEV', color: '#0EA5E9' },
  { value: 'CARE4 HAIR',     label: 'Care4Hair',             code: 'C4H', color: '#E11D48' },
  { value: 'UNIQUE',         label: 'Unique',                code: 'UNQ', color: '#06B6D4' },
  { value: 'HACIENDA',       label: 'Hacienda Eloina',       code: 'HEL', color: '#84CC16' },
  { value: 'PRESTIGE',       label: 'Prestige',              code: 'PRE', color: '#D4AF37' },
  { value: 'ZENCARE',        label: 'Zencare',               code: 'ZEN', color: '#14B8A6' },
  { value: 'BODY',           label: 'Body',                  code: 'BDY', color: '#F97316' },
  { value: 'ADMINISTRACION', label: 'Administración',        code: 'ADM', color: '#64748B' },
];

export function businessLabel(v?: string | null) {
  return BUSINESSES.find(b => b.value === v)?.label ?? '—';
}

export function businessColorByLabel(label: string): string | undefined {
  return BUSINESSES.find(b => b.label === label)?.color;
}
