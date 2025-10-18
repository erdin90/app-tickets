// src/app/kb/new/page.tsx
'use client';

import { useState } from 'react';
import { createKB, KBStatus } from '@/lib/kb';
import { useRouter } from 'next/navigation';

export default function KBNewPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string>('');
  const [status, setStatus] = useState<KBStatus>('draft');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSave(nextStatus?: KBStatus) {
    setMsg(null);

    const finalStatus = nextStatus ?? status;
    if (!title.trim() || !content.trim()) {
      setMsg('Título y contenido son obligatorios');
      return;
    }

    setLoading(true);
    const { data, error } = await createKB({
      title,
      summary,
      content,
      status: finalStatus,
      category: category || undefined,
      tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [],
    });
    setLoading(false);

    if (error || !data) {
      setMsg(error?.message || 'No se pudo crear');
      return;
    }
    router.replace(`/kb/${data.slug}`);
  }

  return (
    <div className="container" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="toolbar" style={{ alignItems: 'center', gap: 12 }}>
        <button className="btn" onClick={() => history.back()}>Volver</button>
        <h1 className="section-title" style={{ margin: 0 }}>Nuevo artículo</h1>
      </div>

      {/* Mensaje */}
      {msg && (
        <div className="ticket" style={{ color: '#b91c1c', borderColor: '#fecaca', background: '#fef2f2' }}>
          {msg}
        </div>
      )}

      {/* Card del formulario */}
      <form
        className="ticket kb-form"
        onSubmit={(e) => { e.preventDefault(); onSave(); }}
      >
        {/* Título */}
        <label className="kb-label">Título</label>
        <input
          className="input"
          placeholder="Ej. Cómo resetear la contraseña"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />

        {/* Resumen */}
        <label className="kb-label">Resumen (opcional)</label>
        <input
          className="input"
          placeholder="Breve descripción…"
          value={summary}
          onChange={e => setSummary(e.target.value)}
        />

        {/* Grid de metadatos (responsive) */}
        <div className="kb-grid">
          <div className="kb-field">
            <label className="kb-label">Categoría</label>
            <input
              className="input"
              placeholder="Ej. Acceso, Redes, Software…"
              value={category}
              onChange={e => setCategory(e.target.value)}
            />
          </div>

          <div className="kb-field">
            <label className="kb-label">Tags (coma)</label>
            <input
              className="input"
              placeholder="vpn, wifi, onboarding"
              value={tags}
              onChange={e => setTags(e.target.value)}
            />
          </div>

          {/*<div className="kb-field">
            <label className="kb-label">Estado</label>
            <select
              className="input"
              value={status}
              onChange={e => setStatus(e.target.value as KBStatus)}
            >
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="archived">Archivado</option>
            </select>
          </div>*/}
        </div>

        {/* Contenido */}
        <label className="kb-label">Contenido</label>
        <textarea
          className="input"
          rows={16}
          placeholder="Guía paso a paso…"
          value={content}
          onChange={e => setContent(e.target.value)}
        />

        {/* Acciones */}
        <div className="kb-actions">
          <button
            type="button"
            className="btn"
            onClick={() => history.back()}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onSave('draft')}
            disabled={loading}
          >
            Guardar como borrador
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}
