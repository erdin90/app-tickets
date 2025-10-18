'use client';

import { useUI } from '@/providers/ui';

export default function AppBar() {
  const { lang, setLang } = useUI();

  return (
    <header className="topbar">
      <span className="brand">IT System</span>
      <div className="topbar-right">
        <button
          className={`btn btn-icon flag ${lang === 'es' ? 'is-active' : ''}`}
          onClick={() => setLang('es')}
        >ES</button>
        <button
          className={`btn btn-icon flag ${lang === 'en' ? 'is-active' : ''}`}
          onClick={() => setLang('en')}
        >US</button>
      </div>
    </header>
  );
}
