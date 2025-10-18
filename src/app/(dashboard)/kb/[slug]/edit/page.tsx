'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getKBBySlug, updateKBBySlug, type KBArticle } from '@/lib/kb';
import { getMyProfile } from '@/lib/users';

export default function KBEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();

  const [art, setArt] = useState<KBArticle | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<'manager' | 'technician' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campos
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft');
  const [tags, setTags] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: u }, { data: prof }, { data }] = await Promise.all([
        supabase.auth.getUser(),
        getMyProfile(),
        getKBBySlug(slug),
      ]);
      if (cancelled) return;

      setMe(u.user?.id ?? null);
      setMyRole((prof?.role as any) ?? null);

      setArt(data);
      if (data) {
        setTitle(data.title);
        setSummary(data.summary ?? '');
        setContent(data.content ?? '');
        setStatus(data.status);
        setTags((data.tags ?? []).join(', '));
      }
    })();
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

  const canEdit = me && (me === art.created_by || myRole === 'manager');
  if (!canEdit) {
    return (
      <div className="container">
        <div className="ticket">No tienes permisos para editar este artículo.</div>
      </div>
    );
  }

  async function save() {
    setError(null);
    setSaving(true);
    const patch = {
      title: title.trim(),
      summary: summary.trim() || null,
      content,
      status,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const { error } = await updateKBBySlug(slug, patch);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(`/kb/${slug}`);
  }

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      {/* Barra sticky responsive */}
      <div className="kb-sticky-bar">
        <div className="kb-toolbar">
          <h1 className="section-title" style={{ margin: 0 }}>
            Editar: {art.title}
          </h1>
          <div className="kb-actions">
            <Link className="btn btn-ghost" href={`/kb/${slug}`}>
              Ver artículo
            </Link>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="ticket" style={{ color: 'var(--danger)', marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="ticket" style={{ display: 'grid', gap: 10 }}>
        <label>
          <div className="meta">Título</div>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label>
          <div className="meta">Resumen</div>
          <textarea
            className="input"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
          />
        </label>

        <label>
          <div className="meta">Contenido</div>
          <textarea
            className="input"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
          />
        </label>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ minWidth: 220 }}>
            <div className="meta">Estado</div>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="archived">Archivado</option>
            </select>
          </label>

          <label style={{ flex: 1 }}>
            <div className="meta">Tags (separados por coma)</div>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
        </div>

        {/* En móvil la barra superior queda fija, por eso no repetimos acciones abajo */}
        <div className="meta" style={{ textAlign: 'right' }}>
          <button className="btn" onClick={() => history.back()} disabled={saving}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
