'use client';

import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  getKBBySlug,
  incrementKBViewsBySlug,
  type KBArticle,
} from '@/lib/kb';
import { getMyProfile } from '@/lib/users';

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: '2-digit' });

export default function KBViewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const [art, setArt] = useState<KBArticle | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<'manager' | 'technician' | null>(null);
  const incrementOnceRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: u }, { data: prof }] = await Promise.all([
        supabase.auth.getUser(),
        getMyProfile(),
      ]);
      if (!cancelled) {
        setMe(u.user?.id ?? null);
        setMyRole((prof?.role as any) ?? null);
      }
    })();

    getKBBySlug(slug).then(({ data }) => !cancelled && setArt(data));

    if (!incrementOnceRef.current) {
      incrementOnceRef.current = true;
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        incrementKBViewsBySlug(slug);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!art) {
    return (
      <div className="container">
        <div className="ticket">Cargando…</div>
      </div>
    );
  }

  const isDraft = art.status === 'draft';
  const canEdit = me && (me === art.created_by || myRole === 'manager');

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <div className="kb-toolbar">
        <h1 className="section-title" style={{ margin: 0 }}>
          {art.title}
        </h1>
        {canEdit && (
          <div className="kb-actions">
            <button className="btn" onClick={() => history.back()}>Volver</button>
            <Link className="btn btn-primary" href={`/kb/${slug}/edit`}>
              Editar
            </Link>
          </div>
        )}
      </div>

      <div className="meta" style={{ marginBottom: 12 }}>
        Estado:{' '}
        <span
          className="badge"
          style={{
            background: isDraft ? '#f59e0b20' : undefined,
            border: isDraft ? '1px solid #f59e0b' : undefined,
            color: isDraft ? '#b45309' : 'var(--text)',
          }}
        >
          {art.status}
        </span>{' '}
        • Creado: {fmtDate(art.created_at)} • 👁 {art.views ?? 0}
      </div>

      {art.summary && (
        <div className="ticket" style={{ marginBottom: 12 }}>
          <strong>Resumen:
            </strong> {art.summary}
        </div>
      )}

      <article className="ticket">
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}><strong>Contenido: 
            </strong>{art.content}</pre>
      </article>
    </div>
  );
}
