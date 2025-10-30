// src/components/AppTopbar.tsx
'use client';
import HeaderTitle from './HeaderTitle';

export default function AppTopbar({ onMenu }: { onMenu?: () => void }) {
  return (
    <header className="sticky top-0 z-30 h-14 flex items-center gap-3 border-b bg-white/70 backdrop-blur px-4">
      <button
        className="lg:hidden -ml-1 rounded p-2 focus:outline-none focus:ring"
        onClick={onMenu}
        aria-label="Abrir menú"
      >
        ☰
      </button>
      <h1 className="text-sm font-semibold tracking-tight">
        <HeaderTitle />
      </h1>
      <div className="ml-auto" />
    </header>
  );
}
