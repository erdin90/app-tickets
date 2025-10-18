// src/lib/sections.ts
const TITLE_OVERRIDES: Record<string, string> = {
  // Tickets / KB
  dashboard: 'Tickets',
  tickets: 'Tickets',
  conocimiento: 'Conocimiento',
  kb: 'Base de Conocimiento',

  // Perfil / Perfiles (todas las variantes comunes)
  profile: 'Perfil',
  profiles: 'Perfiles',
  perfil: 'Perfil',
  perfiles: 'Perfiles',
  usuario: 'Perfil',
  usuarios: 'Perfiles',
  account: 'Perfil',
};

function titleCase(slug: string) {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function getSectionTitle(pathname: string): string {
  const clean = pathname.split('?')[0].split('#')[0];
  const first = clean.split('/').filter(Boolean)[0] ?? '';
  if (!first) return 'Inicio';
  return TITLE_OVERRIDES[first] ?? titleCase(first);
}
