'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUI } from '@/providers/ui';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard,
  KanbanSquare,
  BookText,
  Languages,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  User,
  LogOut,
} from 'lucide-react';

type DisplayUser = { label: string };

export default function AppSidebarRight() {
  const { t, theme, toggleTheme, lang, setLang } = useUI();
  const [user, setUser] = useState<DisplayUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // cargar nombre
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      if (!user) { setUser(null); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      const label = (profile?.full_name?.trim() || user.email || '…');
      setUser({ label });
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!alive) return;
      if (!session) setUser(null);
      else setUser(prev => prev ?? { label: session.user.email ?? '' });
    });

    return () => { alive = false; sub.subscription?.unsubscribe(); };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push('/login');
  }

  const isActive = (href: string) => pathname?.startsWith(href);

  const items = useMemo(() => ([
    { href: '/tickets/board', icon: KanbanSquare, label: 'Tablero' },
    { href: '/dashboard',     icon: LayoutDashboard, label: t('menu.dashboard') },
    { href: '/kb',            icon: BookText, label: 'Conocimiento' },
  ]), [t]);

  // cierre al navegar en móvil
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      {/* FAB móvil */}
      <button
        className="sb-fab md-hidden"
        aria-label="Abrir menú"
        onClick={() => setMobileOpen(true)}
      >☰</button>

      {/* Overlay móvil */}
      <div
        className={`sb-overlay ${mobileOpen ? 'show' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={[
          'sb',
          collapsed ? 'is-collapsed' : '',
          mobileOpen ? 'is-open' : '',
        ].join(' ')}
        aria-label="Barra lateral de navegación"
      >
        {/* Header */}
        <div className="sb-header">
          <span className="brand" title="IT System">IT System</span>
          <button
            className="icon-btn"
            title={collapsed ? 'Expandir' : 'Colapsar'}
            onClick={() => setCollapsed(v => !v)}
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="sb-nav">
          {items.map(({ href, icon: Icon, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`sb-link ${active ? 'active' : ''}`}
                data-tip={label}
              >
                <span className="sb-icon"><Icon size={20} strokeWidth={2} /></span>
                <span className="sb-label">{label}</span>
                {active && <span className="sb-active-bar" aria-hidden />}
              </Link>
            );
          })}
        </nav>

        <div className="sb-sep" />

        {/* Idioma */}
        <div className="sb-block">
          <div className="sb-title">{t('menu.lang')}</div>
          <div className="flag-row">
            <button
              className={`icon-btn flag ${lang === 'es' ? 'on' : ''}`}
              onClick={() => setLang('es')}
              title="Español"
              aria-label="Español"
            >🇪🇸</button>
            <button
              className={`icon-btn flag ${lang === 'en' ? 'on' : ''}`}
              onClick={() => setLang('en')}
              title="English"
              aria-label="English"
            >🇺🇸</button>
            <div className="spacer" />
            <button
              className="icon-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Tema oscuro' : 'Tema claro'}
              aria-label="Cambiar tema"
            >
              {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </div>

        <div className="sb-sep" />

        {/* Perfil */}
        <div className="sb-block relative">
          <button
            className="sb-profile"
            onClick={() => setMenuOpen(v => !v)}
            aria-expanded={menuOpen}
          >
            <User size={18} />
            <span className="sb-profile-label">
              {user?.label ?? t('menu.signin')}
            </span>
          </button>

          <div className={`sb-menu ${menuOpen ? 'open' : ''}`} role="menu">
            <Link className="sb-menu-item" href="/profile" onClick={() => setMenuOpen(false)}>
              Profile
            </Link>

            {user ? (
              <button className="sb-menu-item danger" onClick={signOut}>
                <LogOut size={16} /> <span>Sign out</span>
              </button>
            ) : (
              <Link className="sb-menu-item" href="/login" onClick={() => setMenuOpen(false)}>
                {t('menu.signin')}
              </Link>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
