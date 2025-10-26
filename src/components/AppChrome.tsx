'use client';
import { useEffect, useState } from 'react';
import AppSidebarLeft from '@/components/AppSidebarLeft';
import HeaderTitle from './HeaderTitle';

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (mobileOpen) root.classList.add('drawer-open');
    else root.classList.remove('drawer-open');
    return () => root.classList.remove('drawer-open');
  }, [mobileOpen]);

  return (
    <div className="app-shell">
      <header className="app-banner">
        <div className="banner-inner">
          <span className="banner-title"><HeaderTitle /></span>
          <button className="hamburger" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">☰</button>
        </div>
      </header>

      <AppSidebarLeft mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <main className="app-content">
        <div className="content-wrap">{children}</div>
      </main>
    </div>
  );
}
