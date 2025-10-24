'use client';

type Props = {
  /** 'viewport' = pegado al borde de la pantalla
   *  'container' = alineado al borde derecho del container (1100px por tu CSS)
   */
  align?: 'viewport' | 'container';
  /** 'bottom' o 'top' por si alguna vista lo prefiere arriba */
  vertical?: 'bottom' | 'top';
};

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';
const AUTHOR  = process.env.NEXT_PUBLIC_APP_AUTHOR  ?? '';

export default function VersionBanner({ align = 'container', vertical = 'bottom' }: Props) {
  // right calculado para alinear con tu .container (max-width: 1100px)
  const rightForContainer =
    'max(12px, calc((100vw - 1100px) / 2 + 12px))';

  return (
    <div
      className={[
        'ver-banner',
        vertical === 'top' ? 'is-top' : 'is-bottom',
      ].join(' ')}
      style={align === 'container' ? { right: `var(--ver-right, ${rightForContainer})` } : undefined}
      role="note"
      aria-live="polite"
      title={`Versión ${VERSION}${AUTHOR ? ` • ${AUTHOR}` : ''}`}
    >
      <div className="ver-icon" aria-hidden>
        {/* mini rocket */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M5 19l3-1 9-9a4 4 0 10-5-5l-9 9-1 3 3-1 1 3-1 1z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="15.5" cy="8.5" r="1.6" fill="currentColor"/>
        </svg>
      </div>
      <div className="ver-text">
        <strong>v{VERSION}</strong>
        {AUTHOR && <span className="sep">•</span>}
        {AUTHOR && <span className="by">{AUTHOR}</span>}
      </div>
    </div>
  );
}
