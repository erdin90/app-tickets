'use client';

import { useEffect } from 'react';

type Action = { label: string; onClick: () => void };

export default function AppModal({
  open,
  title = '',
  children,
  onClose,
  primary,
  secondary,
  variant = 'info',
}: {
  open: boolean;
  title?: string;
  children?: React.ReactNode;
  onClose: () => void;
  primary?: Action;
  secondary?: Action;
  variant?: 'info' | 'success' | 'warning' | 'danger';
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const ring =
    variant === 'success'
      ? '0 0 0 3px rgba(16,185,129,.25)'
      : variant === 'warning'
      ? '0 0 0 3px rgba(245,158,11,.25)'
      : variant === 'danger'
      ? '0 0 0 3px rgba(239,68,68,.25)'
      : '0 0 0 3px rgba(59,130,246,.25)';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(17,24,39,.45)',
        backdropFilter: 'saturate(130%) blur(4px)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="ticket"
        style={{
          width: 'min(600px, 96vw)',
          boxShadow: ring,
          cursor: 'default',
          borderRadius: 22,
          border: '1px solid var(--border)',
          background: 'linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.98))',
          color: 'var(--text, #0f172a)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          paddingBottom: 6
        }}>
          <div className="section-title" style={{ marginTop: 0, marginBottom: 0 }}>{title}</div>
          <button className="btn btn-icon" aria-label="Cerrar" onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>

        <div style={{ marginTop: 8 }}>{children}</div>

        <div
          className="toolbar"
          style={{ marginTop: 16, justifyContent: 'flex-end', gap: 8 }}
        >
          {secondary && (
            <button className="btn" onClick={secondary.onClick}>
              {secondary.label}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={primary?.onClick ?? onClose}
          >
            {primary?.label ?? 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  );
}
