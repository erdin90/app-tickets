'use client';

import { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;           // acciones a la derecha (botones, filtros rápidos)
  onMenuClick?: () => void;    // abre el sidebar móvil (opcional)
};

export default function PageBar({ title, subtitle, right, onMenuClick }: Props) {
  return (
    <header className="pagebar" role="banner">
      <div className="pagebar-inner">
        <div className="pagebar-left">
          {/* Hamburguesa solo en móvil */}
          {onMenuClick && (
            <button
              className="nav-trigger"
              aria-label="Abrir menú"
              onClick={onMenuClick}
            >
              <span aria-hidden>☰</span>
            </button>
          )}
          <div className="pagebar-titles">
            <h1 className="page-title">{title}</h1>
            {subtitle && <p className="page-sub">{subtitle}</p>}
          </div>
        </div>

        {right && <div className="pagebar-right">{right}</div>}
      </div>
    </header>
  );
}
