'use client';
import { toast } from 'sonner';
// src/app/(dashboard)/kb/page.tsx

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteKBById, listKB, createKB, updateKBBySlug, incrementKBViewsBySlug, type KBArticle, type KBStatus } from '@/lib/kb';
import { getMyProfile, getUsersByIds } from '@/lib/users';
import { supabase } from '@/lib/supabase';
import PageBar from '@/components/PageBar';
import AppModal from '@/components/AppModal';

type Row = KBArticle;

const PAGE_SIZE = 20;
const DEFAULT_STATUS: KBStatus | 'all' = 'all';

/** Debounce simple */
function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });

/** Limpia HTML/Markdown básico y recorta a N palabras */
function stripMarkup(input: string) {
  return (input || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/(```[\s\S]*?```)/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#>*_\-\+~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function excerpt(input: string, words = 50) {
  const clean = stripMarkup(input);
  const parts = clean.split(/\s+/);
  if (parts.length <= words) return clean;
  return parts.slice(0, words).join(' ') + '…';
}

export default function KBListPage() {
  const [qInput, setQInput] = useState('');
  const q = useDebouncedValue(qInput, 250);
  const [status] = useState<KBStatus | 'all'>(DEFAULT_STATUS);

  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // selección + móvil/desktop
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  // mapa id -> nombre autor
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [me, setMe] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Estado para el botón de refresco
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { setPage(1); }, [q]);

  // detectar móvil/desktop (con estado tri-state para evitar autoselección antes de saberlo)
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1024px)');
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setLoading(true);
    listKB({ q, status, page, pageSize: PAGE_SIZE }).then(async ({ data, total }) => {
      // Fallback: orden por fecha de creación DESC
      const sorted = (data ?? []).slice().sort((a, b) => {
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        return db - da;
      });

      setRows(sorted);
      setTotal(total ?? sorted.length);
      setLoading(false);

      // nombres de autor
      const ids = Array.from(new Set((sorted ?? []).map(r => r.created_by))).filter(Boolean);
      if (ids.length) {
        const { data: users } = await getUsersByIds(ids);
        const map = Object.fromEntries(users.map(u => [u.id, u.full_name ?? u.id]));
        setAuthors(map);
      } else {
        setAuthors({});
      }
    });
  }, [q, status, page]);

  async function doFullRefresh() {
    try {
      setRefreshing(true);
      const { data, total } = await listKB({ q, status, page, pageSize: PAGE_SIZE });
      const sorted = (data ?? []).slice().sort((a, b) => {
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        return db - da;
      });
      setRows(sorted);
      setTotal(total ?? sorted.length);
      const ids = Array.from(new Set((sorted ?? []).map(r => r.created_by))).filter(Boolean);
      if (ids.length) {
        const { data: users } = await getUsersByIds(ids);
        const map = Object.fromEntries(users.map(u => [u.id, u.full_name ?? u.id]));
        setAuthors(map);
      } else {
        setAuthors({});
      }
    } finally {
      setRefreshing(false);
    }
  }

  // realtime: refrescar lista cuando cambian artículos en la tabla
  useEffect(() => {
    const ch = supabase
      .channel('kb-stream')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kb_articles' }, () => {
        // recarga la lista (mantiene filtros/paginación)
        void listKB({ q, status, page, pageSize: PAGE_SIZE }).then(({ data, total }) => {
          const sorted = (data ?? []).slice().sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          setRows(sorted);
          setTotal(total ?? sorted.length);
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
    // note: hooks deps rule disabled project-wide
  }, [q, status, page]);

  // perfil
  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: u }, { data: profile }] = await Promise.all([
        supabase.auth.getUser(),
        getMyProfile(),
      ]);
      if (!active) return;
      setMe(u.user?.id ?? null);
      setMyRole((profile?.role as string | null) ?? null);
    })();
    return () => { active = false; };
  }, []);

  // autoselección SOLO en desktop (cuando ya sabemos si es móvil)
  useEffect(() => {
    if (isMobile === null) return; // aún no sabemos
    if (!isMobile) {
      if (!selectedId && rows.length > 0) setSelectedId(rows[0].id);
      if (selectedId && !rows.find(r => r.id === selectedId)) {
        setSelectedId(rows[0]?.id ?? null);
      }
    } else {
      // móvil: nunca autoseleccionar; si desaparece el seleccionado, limpiar
      if (!rows.find(r => r.id === selectedId)) setSelectedId(null);
    }
  }, [rows, selectedId, isMobile]);

  const normalizedRole = (myRole ?? '').toLowerCase();
  const canManageAll = normalizedRole === 'manager' || normalizedRole === 'admin';

  async function handleDelete(article: Row) {
    if (!article?.id) return;
    const isOwner = me && me === article.created_by;
    if (!canManageAll && !isOwner) return;

    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(`¿Seguro que deseas eliminar el artículo «${article.title}»?`);
    if (!confirmed) return;

    setDeletingId(article.id);
    const { error } = await deleteKBById(article.id);
    if (error) {
      console.error('[KB] delete', error);
      if (typeof window !== 'undefined') {
  toast.error('No se pudo eliminar el artículo.');
      }
      setDeletingId(null);
      return;
    }

    setRows((prev) => prev.filter((row) => row.id !== article.id));
    setTotal((prev) => Math.max(0, prev - 1));
    setDeletingId(null);
  }

  const pages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  /* ---------- PageBar ---------- */
  const Bar = (
    <PageBar
      title="Base de Conocimiento"
      subtitle="Artículos y guías"
      right={
        <button className="btn btn-primary" style={{ height: 32, padding: '0 12px', fontSize: 12 }} onClick={() => setNewOpen(true)}>
          Nuevo artículo
        </button>
      }
    />
  );

  // Nuevo artículo (modal)
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newStatus, setNewStatus] = useState<KBStatus>('draft');
  const [creating, setCreating] = useState(false);

  async function saveNew() {
    const errors: string[] = [];
    if (!newTitle.trim()) errors.push('Título requerido');
    if (!newContent.trim()) errors.push('Contenido requerido');
  if (errors.length) { toast.error(errors.join('\n')); return; }
    setCreating(true);
  const { data, error } = await createKB({ title: newTitle.trim(), summary: newSummary.trim() || undefined, content: newContent, status: newStatus });
    setCreating(false);
  if (error || !data) { console.error('[KB] create', error); toast.error('No se pudo crear el artículo'); return; }
    // añadir al listado y seleccionar
    setRows(prev => [data, ...prev]);
    setTotal(prev => prev + 1);
    setNewOpen(false);
    setNewTitle(''); setNewSummary(''); setNewContent('');
    setSelectedId(data.id);
  }

  // Artículo seleccionado (si lo hay)
  const selected = selectedId ? rows.find(r => r.id === selectedId) ?? null : null;

  // evitar incrementar múltiples veces durante la sesión
  const viewedRef = useRef<Set<string>>(new Set());

  // incrementar vistas cuando se selecciona un artículo en el panel derecho (solo una vez por slug por sesión)
  useEffect(() => {
    if (!selected) return;
    const slug = selected.slug;
    if (!slug) return;
    if (viewedRef.current.has(slug)) return;
    viewedRef.current.add(slug);
    void incrementKBViewsBySlug(slug).then(() => {
      setRows(prev => prev.map(r => r.id === selected.id ? { ...r, views: (r.views ?? 0) + 1 } : r));
    }).catch((e) => {
      console.error('[KB] increment views', e);
    });
  }, [selectedId]);

  function handleOpenArticle(a: Row | null) {
    if (!a || !a.slug) return;
    const slug = a.slug;
    if (viewedRef.current.has(slug)) return;
    viewedRef.current.add(slug);
    void incrementKBViewsBySlug(slug).then(() => {
      setRows(prev => prev.map(r => r.id === a.id ? { ...r, views: (r.views ?? 0) + 1 } : r));
    }).catch((e) => console.error('[KB] increment views', e));
  }

  // Edición: modal editable solo para el autor
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  function openEdit(article: KBArticle) {
    const isOwner = !!me && me === article.created_by;
    if (!isOwner && !canManageAll) {
      // no permitido
  toast.error('Solo el autor o un manager pueden editar este artículo.');
      return;
    }
    setEditTitle(article.title);
    setEditSummary(article.summary ?? '');
    setEditContent(article.content ?? '');
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    const patch: Partial<KBArticle> = { title: editTitle, summary: editSummary, content: editContent } as any;
    const { data, error } = await updateKBBySlug(selected.slug, patch);
    setSaving(false);
    if (error || !data) {
      console.error('[KB] update', error);
  toast.error('No se pudo guardar el artículo.');
      return;
    }
    // actualizar localmente
    setRows(prev => prev.map(r => r.id === data.id ? data : r));
    setEditOpen(false);
    // si está seleccionado, actualizar
    if (selectedId === data.id) setSelectedId(data.id);
  }

  return (
    <>
      {Bar}
          <div className="kb-page">
      <div className="container" style={{ maxWidth: 1100 }}>
        {/* Buscador (siempre visible) */}
        <div className="kb-search">
          <input
            className="input kb-search-input"
            placeholder="Buscar…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>

        {/* Split: lista | detalle */}
        <section className={`kb-split ${isMobile && selected ? 'show-detail' : ''}`}>
          {/* LISTA (izquierda / móvil: pantalla principal) */}
          <div className="kb-list-pane">
            <div style={{ display: 'grid', gap: 12 }}>
              {loading && <div className="ticket">Cargando…</div>}
              {!loading && rows.length === 0 && <div className="ticket">No se encontraron artículos.</div>}

              {rows.map((a) => {
                const isDraft = a.status === 'draft';
                const author = authors[a.created_by] ?? '—';
                const canDelete = canManageAll || (!!me && me === a.created_by);
                const isDeleting = deletingId === a.id;
                const previewText = excerpt(((a.summary as string | undefined) ?? (a as any).content ?? ''), 40);

                // Render like tickets list item
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="option"
                    aria-selected={selectedId === a.id}
                    className={`trow ${selectedId === a.id ? 'is-active' : ''}`}
                    onClick={() => setSelectedId(a.id)}
                    title={a.title}
                  >
                    <span className="avatar" aria-hidden>
                      {(author || '·').slice(0,1).toUpperCase()}
                    </span>

                    <div className="trow-main">
                      <div className="trow-title">{a.title}</div>
                      <div className="trow-meta">
                        <span>#{a.id.slice(0,6)}</span>
                        <span>{fmtDate(a.created_at)}</span>
                        <span>👁 {a.views ?? 0}</span>
                      </div>
                      <div className="meta kb-card-preview" style={{ marginTop: 6 }}>{previewText || 'Sin vista previa.'}</div>
                    </div>

                    <div className="trow-badges">
                      <span className={`badge ${a.status}`} title={`Estado: ${a.status}`}>{a.status}</span>
                      {!!(a.tags?.length) && <span className="badge" style={{ marginLeft: 6 }}>{a.tags.join(', ')}</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Paginación (solo en el pane de lista) */}
            <div className="pager" style={{ marginTop: 12 }}>
              <div className="meta">Mostrando {rows.length} de {total}</div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  ‹ Anterior
                </button>
                <span className="meta">pág. {page}/{Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
                <button className="btn" disabled={page >= Math.max(1, Math.ceil(total / PAGE_SIZE))} onClick={() => setPage((p) => Math.min(Math.max(1, Math.ceil(total / PAGE_SIZE)), p + 1))}>
                  Siguiente ›
                </button>
              </div>
            </div>
          </div>

          {/* DETALLE (derecha / móvil: pantalla secundaria) */}
          <aside className="kb-detail-pane">
            <div className="kb-detail-inner">
              {/* Botón volver solo en móvil */}
              {isMobile && selected && (
                <button
                  type="button"
                  className="btn"
                  style={{ marginBottom: 8, width: '100%', justifyContent: 'flex-start', height: 44, fontSize: 16, fontWeight: 800 }}
                  aria-label="Volver a la lista de artículos"
                  title="Volver a la lista de artículos"
                  onClick={() => setSelectedId(null)}
                >
                  ← Lista de Artículos
                </button>
              )}

              {!selected && (
                <div className="ticket" style={{ textAlign: 'center' }}>
                  Selecciona un artículo para ver el detalle
                </div>
              )}

              {selected && (
                <article className={`ticket ticket-v2`} style={{ margin: 0 }}>
                  <header style={{ padding: 18 }}>
                    <h2 style={{ margin: 0, fontSize: 28, lineHeight: 1.05 }}>{selected.title}</h2>
                    <div style={{ marginTop: 8, color: '#666' }}>por <strong>{authors[selected.created_by] ?? '—'}</strong> • {fmtDate(selected.created_at)} • 👁 {selected.views ?? 0}</div>
                  </header>

                  <div style={{ padding: 18 }}>
                    <div style={{ borderRadius: 12, padding: 14, background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.03)' }}>
                      {/* Mostrar resumen si existe */}
                      {selected.summary ? (
                        <div style={{ marginBottom: 12, padding: 12, background: '#fbfbfd', borderRadius: 8 }}>
                          <div style={{ color: '#333', whiteSpace: 'pre-wrap' }}>{selected.summary}</div>
                        </div>
                      ) : null}

                      {/* Cuerpo del artículo */}
                      <div style={{ whiteSpace: 'pre-wrap' }}>{selected.content ?? ''}</div>

                      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button className="btn" onClick={() => { handleOpenArticle(selected); window.location.href = `/kb/${selected.slug}`; }}>Abrir</button>
                        {(me && me === selected.created_by) || canManageAll ? (
                          <button className="btn btn-ghost" onClick={() => openEdit(selected)}>Editar</button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              )}
            </div>
          </aside>
        </section>
      </div>
      </div>
      {/* Modal: Nuevo artículo */}
      <AppModal open={newOpen} title="Nuevo artículo" onClose={() => setNewOpen(false)} primary={{ label: creating ? 'Creando...' : 'Crear', onClick: saveNew }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <label>Título<input className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /></label>
          <label>Resumen<textarea className="input" rows={3} value={newSummary} onChange={(e) => setNewSummary(e.target.value)} /></label>
          <label>Contenido<textarea className="input" rows={8} value={newContent} onChange={(e) => setNewContent(e.target.value)} /></label>
          <label>Estado<select className="input" value={newStatus} onChange={(e) => setNewStatus(e.target.value as KBStatus)}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select></label>
        </div>
      </AppModal>

      <AppModal open={editOpen} title="Editar artículo" onClose={() => setEditOpen(false)} primary={{ label: 'Guardar', onClick: saveEdit }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <label>Título<input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></label>
          <label>Resumen<textarea className="input" rows={3} value={editSummary} onChange={(e) => setEditSummary(e.target.value)} /></label>
          <label>Contenido<textarea className="input" rows={8} value={editContent} onChange={(e) => setEditContent(e.target.value)} /></label>
        </div>
      </AppModal>

      {/* FAB de refresco para KB */}
      <button
        type="button"
        className={`refresh-fab ${refreshing ? 'is-spinning' : ''}`}
        title="Actualizar"
        aria-label="Actualizar"
        aria-busy={refreshing}
        onClick={doFullRefresh}
      >
        ↻
      </button>

      <style jsx>{`
        .refresh-fab{
          position: fixed;
          right: 16px;
          bottom: 16px;
          width: 46px;
          height: 46px;
          border-radius: 999px;
          background: var(--blue-600);
          color: #fff;
          border: none;
          box-shadow: var(--shadow);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          z-index: 50;
        }
        .refresh-fab:hover{ background: var(--blue-700); }
        .refresh-fab.is-spinning{ animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
