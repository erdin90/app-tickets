'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Theme = 'light' | 'dark';
type Lang = 'es' | 'en';

type UIContextType = {
  theme: Theme;
  lang: Lang;
  toggleTheme: () => void;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
};

const UIContext = createContext<UIContextType>({
  theme: 'light',
  lang: 'es',
  toggleTheme: () => {},
  setLang: () => {},
  t: (k) => k,
});

const DICT: Record<Lang, Record<string, string>> = {
  es: {
    'app.title': 'Tickets',
    'tabs.active': 'Nuevos',
    'tabs.completed': 'Completados',
    'form.newTicket': 'Nuevo ticket',
    'form.title': 'Título',
    'form.desc': 'Descripción (opcional)',
    'form.initialStatus': 'Estado inicial:',
    'form.create': 'Crear',
    'form.creating': 'Creando…',
    'metrics.week': 'Completados (últimos 7 días)',
    'metrics.month': 'Completados (mes actual)',
    'metrics.perDay': 'Completados por día',
    'metrics.range': 'Rango serie',
    'list.empty': 'No hay tickets en esta vista.',
    'labels.created': 'Creado',
    'labels.completed': 'Completado',
    'labels.status': 'Estado',
    'menu.dashboard': 'Tickets',
    'menu.theme': 'Tema',
    'menu.lang': 'Idioma',
    'menu.profile': 'Perfil',
    'menu.signin': 'Iniciar sesión',
    'menu.signout': 'Cerrar sesión',
    'theme.light': 'Claro',
    'theme.dark': 'Oscuro',
    'filters.priority': 'Prioridad',
'form.priority': 'Prioridad:',
'priority.low': 'Baja',
'priority.normal': 'Normal',
'priority.high': 'Alta',
'labels.priority': 'Prioridad',
'filters.search': 'Buscar',
'pager.prev': 'Anterior',
'pager.next': 'Siguiente',
'pager.showing': 'Mostrando',
'pager.of': 'de',
'pager.perPage': 'por página',
// === Perfil (ES) ===
'profile.title': 'Perfil',
'profile.name': 'Nombre',
'profile.email': 'Email',
'profile.role': 'Rol',
'profile.save': 'Guardar cambios',
'profile.loading': 'Cargando…',
'profile.error': 'No se pudo cargar el perfil',
'profile.back': '‹ Volver',

// Manager
'profile.managerStats.total': 'Tickets totales',
'profile.managerStats.active': 'Activos',
'profile.managerStats.completed': 'Completados',
'profile.managerStats.overdue': 'Vencidos',
'profile.managerStats.topTechs': 'Top técnicos (últimos 30 días)',
'profile.managerStats.noData': 'Sin datos.',

// Técnico
'profile.techStats.completedAll': 'Completados (total)',
'profile.techStats.completed30d': 'Completados (30 días)',
'profile.techStats.openAssigned': 'Asignados abiertos',
'profile.techStats.overdueAssigned': 'Vencidos',
'profile.techStats.avgResolution': 'Promedio resolución',
'profile.techStats.lastTickets': 'Últimos tickets asignados',
'profile.techStats.none': 'Sin tickets recientes.',
'profile.techStats.recommendations': 'Recomendaciones',

// Recomendaciones (con {count})
'profile.reco.overdue': 'Prioriza los {count} tickets vencidos.',
'profile.reco.tooManyOpen': 'Tienes varios tickets abiertos; considera actualizar estados o pedir ayuda.',
'profile.reco.good': '¡Buen ritmo! Mantén tus tickets al día y documenta en comentarios.',

// Roles y comunes
'role.manager': 'Manager / Admin',
'role.technician': 'Técnico',
'common.back': '‹ Volver',
'common.save': 'Guardar',
'common.loading': 'Cargando…',


  },
  en: {
    'app.title': 'Tickets',
    'tabs.active': 'News',
    'tabs.completed': 'Completed',
    'form.newTicket': 'New ticket',
    'form.title': 'Title',
    'form.desc': 'Description (optional)',
    'form.initialStatus': 'Initial status:',
    'form.create': 'Create',
    'form.creating': 'Creating…',
    'metrics.week': 'Completed (last 7 days)',
    'metrics.month': 'Completed (current month)',
    'metrics.perDay': 'Completed per day',
    'metrics.range': 'Range',
    'list.empty': 'No tickets in this view.',
    'labels.created': 'Created',
    'labels.completed': 'Completed',
    'labels.status': 'Status',
    'menu.dashboard': 'Tickets',
    'menu.theme': 'Theme',
    'menu.lang': 'Language',
    'menu.profile': 'Profile',
    'menu.signin': 'Sign in',
    'menu.signout': 'Sign out',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'filters.priority': 'Priority',
'form.priority': 'Priority:',
'priority.low': 'Low',
'priority.normal': 'Normal',
'priority.high': 'High',
'labels.priority': 'Priority',
'filters.search': 'Search',
'pager.prev': 'Prev',
'pager.next': 'Next',
'pager.showing': 'Showing',
'pager.of': 'of',
'pager.perPage': 'per page',
// === Profile (EN) ===
'profile.title': 'Profile',
'profile.name': 'Name',
'profile.email': 'Email',
'profile.role': 'Role',
'profile.save': 'Save changes',
'profile.loading': 'Loading…',
'profile.error': 'Could not load profile',
'profile.back': '‹ Back',

// Manager
'profile.managerStats.total': 'Total tickets',
'profile.managerStats.active': 'Active',
'profile.managerStats.completed': 'Completed',
'profile.managerStats.overdue': 'Overdue',
'profile.managerStats.topTechs': 'Top technicians (last 30 days)',
'profile.managerStats.noData': 'No data.',

// Technician
'profile.techStats.completedAll': 'Completed (all time)',
'profile.techStats.completed30d': 'Completed (30 days)',
'profile.techStats.openAssigned': 'Open assigned',
'profile.techStats.overdueAssigned': 'Overdue',
'profile.techStats.avgResolution': 'Average resolution',
'profile.techStats.lastTickets': 'Last assigned tickets',
'profile.techStats.none': 'No recent tickets.',
'profile.techStats.recommendations': 'Recommendations',

// Recommendations (with {count})
'profile.reco.overdue': 'Prioritize the {count} overdue tickets.',
'profile.reco.tooManyOpen': 'You have many open tickets; consider updating statuses or asking for help.',
'profile.reco.good': 'Nice pace! Keep tickets up-to-date and add comments.',

// Roles & common
'role.manager': 'Manager / Admin',
'role.technician': 'Technician',
'common.back': '‹ Back',
'common.save': 'Save',
'common.loading': 'Loading…',

  },
  
};


export function UIProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [lang, setLang] = useState<Lang>('es');

  // Cargar preferencias guardadas
  useEffect(() => {
    const th = (localStorage.getItem('it.theme') as Theme) || 'light';
    const lg = (localStorage.getItem('it.lang') as Lang) || 'es';
    setTheme(th);
    setLang(lg);
  }, []);

  // Sincronizar atributo data-theme con tu CSS
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('it.theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('it.lang', lang);
  }, [lang]);

  const value = useMemo<UIContextType>(
    () => ({
      theme,
      lang,
  toggleTheme: () => setTheme((p) => (p === 'light' ? 'dark' : 'light')),
      setLang: (l: Lang) => setLang(l),
      t: (key: string) => DICT[lang][key] ?? key,
    }),
    [theme, lang]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  return useContext(UIContext);
}
