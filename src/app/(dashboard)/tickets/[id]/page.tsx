'use client';
import { toast } from 'sonner';
// src/app/tickets/[id]/page.tsx
/* note: next image rule disabled project-wide */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  getTicket,
  updateTicketInfo,
  updateTicketPriority,
  updateTicketStatus,
  updateTicketAssignee,
  subscribeTickets,
  type Ticket,
} from '@/lib/tickets';
import { STATUS_OPTIONS, type TicketStatus } from '@/lib/status';
import type { TicketPriority } from '@/lib/priority';
import { listTechnicians, getMyProfile, type Profile } from '@/lib/users';
import { listComments, addComment, subscribeComments, deleteComment, type TicketComment } from '@/lib/comments';
import { listAttachments, addAttachmentRecord, removeAttachment, publicUrl, type Attachment } from '@/lib/attachments';
import { supabase } from '@/lib/supabase';

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  // Loading/errores
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Ticket + edición básica
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueInput, setDueInput] = useState(''); // datetime-local

  // Perfiles/yo
  const [techs, setTechs] = useState<Profile[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<'manager' | 'technician' | 'it' | null>(null);

  // Comentarios
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Adjuntos
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileInput, setFileInput] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const canManage = myRole === 'manager';
  const isIT = myRole === 'technician' || myRole === 'it';
  const canChangeStatus =
    canManage || (me && ticket?.assigned_to && me === ticket.assigned_to) ? true : false;

  const prioOptions = useMemo(
    () => ([
      { value: 'low' as TicketPriority,    label: 'Baja' },
      { value: 'normal' as TicketPriority, label: 'Normal' },
      { value: 'high' as TicketPriority,   label: 'Alta' },
    ]),
    []
  );

  // ===== helpers =====
  const fmt = (ts?: string) =>
    ts ? new Date(ts).toLocaleString('es-ES', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  const toInputValue = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // ===== Cargas =====
  async function load() {
    try {
      setLoading(true);
      setErr(null);
      const { data, error } = await getTicket(id);
      if (error) throw error;
      setTicket(data);
      setTitle(data?.title ?? '');
      setDescription(data?.description ?? '');
      setDueInput(toInputValue(data?.due_date ?? null));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo cargar el ticket';
      console.error(e);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadComments() {
    const { data } = await listComments(id);
    setComments(data);
  }

  async function loadAttachments() {
    const { data } = await listAttachments(id);
    setFiles(data);
  }

  // Perfiles + yo
  useEffect(() => {
    (async () => {
      const [{ data: techList }, { data: u }, { data: meProfile }] = await Promise.all([
        listTechnicians(),
        supabase.auth.getUser(),
        getMyProfile(),
      ]);
  setTechs(techList ?? []);
  setMe(u.user?.id ?? null);
  const rawRole = meProfile?.role ?? null;
  const role = rawRole === 'manager' || rawRole === 'technician' || rawRole === 'it' ? rawRole : null;
  setMyRole(role);
    })();
  }, []);

  // Datos del ticket + realtime
  useEffect(() => {
    load();
    loadComments();
    loadAttachments();
    const unsub1 = subscribeTickets(() => load());      // refresca si hay cambios en tickets
    const unsub2 = subscribeComments(id, loadComments); // refresca si hay nuevos comentarios
    return () => { unsub1(); unsub2(); };
  // note: hooks deps rule disabled project-wide
  }, [id]);

  // ===== Acciones =====
  async function saveBasics() {
    if (!ticket) return;
  if (!canManage) return toast.error('Solo managers pueden editar estos campos');

    // Convertir datetime-local a ISO (o null)
    const dueISO = dueInput ? new Date(dueInput).toISOString() : null;

    const { error } = await updateTicketInfo(ticket.id, {
      title,
      description,
      due_date: dueISO,
    });
  if (error) return toast.error('No se pudo guardar');
    await load();
  }

  async function onStatus(next: TicketStatus) {
    if (!ticket) return;
  if (!canChangeStatus) return toast.error('No tienes permiso para cambiar el estado');
    const { error } = await updateTicketStatus(ticket.id, next);
  if (error) return toast.error('No se pudo cambiar el estado');
  }

  async function onPriority(next: TicketPriority) {
    if (!ticket) return;
  if (!canManage) return toast.error('Solo managers');
    const { error } = await updateTicketPriority(ticket.id, next);
  if (error) return toast.error('No se pudo cambiar la prioridad');
  }

  async function onAssignee(userId: string) {
    if (!ticket) return;
    if (!canManage) return alert('Solo managers');
    const { error } = await updateTicketAssignee(ticket.id, userId || null);
    if (error) return alert('No se pudo cambiar la asignación');
  }

  function onEditFocus() {
    if (!canManage) return;
    try {
      titleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => titleRef.current?.focus(), 250);
    } catch {}
  }

  async function submitComment() {
    if (!me || !text.trim()) return;
    setSending(true);
    const { error } = await addComment(id, me, text);
    setSending(false);
    if (error) return alert('No se pudo comentar');
    setText('');
    loadComments();
  }

  async function onDeleteComment(cid: string) {
    if (!me) return alert('No autenticado');
    const c = comments.find(x => x.id === cid);
    const authorId = c?.author;
    const authorRole = c?.author_profile?.role?.toLowerCase?.();
    const authorIsIT = authorRole === 'technician' || authorRole === 'it';

    // Regla solicitada:
    // - Manager puede eliminar cualquier comentario hecho por IT
    // - IT puede eliminar solo sus propios comentarios
    const isOwn = authorId === me;
    const allowed = (canManage && authorIsIT) || (isIT && isOwn) || (canManage && isOwn);
    if (!allowed) {
      return alert('No tienes permiso para eliminar este comentario');
    }
    setDeletingId(cid);
    const { error } = await deleteComment(cid);
    setDeletingId(null);
    if (error) return alert(error.message);
    await loadComments();
    setConfirmId(null);
    toast.success('Comentario eliminado');
  }

  const BUCKET = 'ticket-files';
  async function uploadFile() {
    if (!ticket || !fileInput) return;
    setUploading(true);
    try {
      const safeName = fileInput.name.replace(/[^\w\-.]+/g, '_');
      const path = `${ticket.id}/${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, fileInput, {
          cacheControl: '3600',
          upsert: false,
          contentType: fileInput.type || undefined,
        });
      if (upErr) throw upErr;

      const { error: recErr } = await addAttachmentRecord({
        ticket_id: ticket.id,
        path,
        name: fileInput.name,
        mime: fileInput.type || null,
        size: fileInput.size,
        uploaded_by: me,
      });
      if (recErr) throw recErr;

      setFileInput(null);
      await loadAttachments();
    } catch (e: unknown) {
      console.error('[uploadFile]', e);
      const msg = e instanceof Error ? e.message : 'No se pudo subir el archivo';
      alert(msg);
    } finally {
      setUploading(false);
    }
  }

  async function onDeleteAttachment(a: Attachment) {
    if (!confirm(`¿Eliminar "${a.name}"?`)) return;
    const { error } = await removeAttachment(a.id, a.path);
    if (error) {
      console.error('[removeAttachment]', error);
      alert('No se pudo eliminar');
    } else {
      await loadAttachments();
    }
  }

  // ===== Renders =====
  if (loading) return <div className="container"><div className="meta">Cargando…</div></div>;
  if (err) return <div className="container"><div className="ticket" style={{ color: 'var(--danger)' }}>{err}</div></div>;
  if (!ticket) return <div className="container"><div className="ticket">Ticket no encontrado.</div></div>;

  return (
    <div className="container" style={{ display: 'grid', gap: 16 }}>
      {/* Header */}
      <div className="toolbar">
        <div className="filters" style={{ gap: 8 }}>
          <Link href="/dashboard" className="btn btn-ghost">‹ Volver</Link>
          <Link href="/tickets/board" className="btn btn-ghost">Tablero</Link>
        </div>
        <div className="meta">ID: {ticket.id}</div>
      </div>

      {!canManage && (
        <div className="ticket" style={{ color:'var(--warning)' }}>
          Estás en modo técnico. Puedes cambiar <b>Estado</b> solo si el ticket está asignado a ti. Los demás campos son solo para managers.
        </div>
      )}

      {/* Detalle principal */}
      <div className="ticket" style={{ display: 'grid', gap: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>Detalle del ticket</div>

        <input
          className="input"
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título"
          disabled={!canManage}
        />
        <textarea
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción"
          disabled={!canManage}
        />

        <div className="toolbar" style={{ margin: 0 }}>
          <div className="filters" style={{ gap: 10 }}>
            <label className="meta">Estado</label>
            <select
              className="input"
              style={{ width: 180 }}
              value={ticket.status}
              onChange={(e) => onStatus(e.target.value as TicketStatus)}
              disabled={!canChangeStatus}
              title={!canChangeStatus ? 'Solo manager o técnico asignado' : undefined}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <label className="meta">Prioridad</label>
            <select
              className="input"
              style={{ width: 140 }}
              value={ticket.priority}
              onChange={(e) => onPriority(e.target.value as TicketPriority)}
              disabled={!canManage}
            >
              {prioOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <label className="meta">Asignado</label>
            <select
              className="input"
              style={{ width: 220 }}
              value={ticket.assigned_to ?? ''}
              onChange={(e) => onAssignee(e.target.value)}
              disabled={!canManage}
            >
              <option value="">Sin asignar</option>
              {techs.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name ?? u.id}</option>
              ))}
            </select>

            <label className="meta">Vence</label>
            <input
              className="input"
              style={{ width: 220 }}
              type="datetime-local"
              value={dueInput}
              onChange={(e) => setDueInput(e.target.value)}
              disabled={!canManage}
            />
          </div>

          <button className="btn btn-primary" onClick={saveBasics} disabled={!canManage}>
            Guardar
          </button>
        </div>

        <div className="meta">
          Creado: {fmt(ticket.created_at)}
          {ticket.completed_at ? ` • Completado: ${fmt(ticket.completed_at)}` : ''}
          {ticket.due_date ? ` • Vence: ${fmt(ticket.due_date)}` : ''}
        </div>
      </div>

  {/* Comentarios */}
  <div className="ticket" style={{ display: 'grid', gap: 10, position: 'relative', paddingBottom: 80 }}>
        <div className="section-title" style={{ margin: 0 }}>Comentarios</div>
        <div style={{ display: 'grid', gap: 10, maxHeight: '40vh', overflowY: 'auto' }}>
          {comments.length === 0 && <div className="meta">Sin comentarios aún.</div>}
          {comments.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div className="avatar">
                {c.author_profile?.avatar_url
                  ? <img src={c.author_profile.avatar_url} alt="" />
                  : (c.author_profile?.full_name ?? '·').slice(0, 1).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, position: 'relative' }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{c.author_profile?.full_name ?? c.author}</div>
                    <div className="meta">{fmt(c.created_at)}</div>
                  </div>
                  {/* Botón eliminar si corresponde */}
                  {(canManage || isIT) && (() => {
                    const authorRole = c.author_profile?.role?.toLowerCase?.();
                    const authorIsIT = authorRole === 'technician' || authorRole === 'it';
                    const isOwn = c.author === me;
                    const show = (canManage && authorIsIT) || (isIT && isOwn) || (canManage && isOwn);
                    if (!show) return null;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          className="btn btn-ghost"
                          title="Eliminar comentario"
                          aria-label="Eliminar comentario"
                          onClick={() => setConfirmId(c.id)}
                          style={{ height: 28, padding: '0 10px', color: 'var(--danger)' }}
                        >
                          Eliminar
                        </button>
                        {confirmId === c.id && (
                          <div
                            role="dialog"
                            aria-label="Confirmar eliminación"
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'var(--panel, #fff)',
                              border: '1px solid var(--border)',
                              boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
                              borderRadius: 10,
                              padding: '10px 12px',
                              display: 'grid',
                              gap: 8,
                              zIndex: 10,
                              minWidth: 240,
                            }}
                          >
                            <div className="meta">Este comentario se eliminará definitivamente</div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button
                                className="btn btn-ghost"
                                onClick={() => setConfirmId(null)}
                                style={{ height: 28, padding: '0 10px' }}
                              >
                                Cancelar
                              </button>
                              <button
                                className="btn btn-danger"
                                onClick={() => onDeleteComment(c.id)}
                                disabled={deletingId === c.id}
                                style={{ height: 28, padding: '0 10px' }}
                              >
                                {deletingId === c.id ? 'Eliminando…' : 'Aceptar'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{c.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <textarea
            className="input"
            placeholder={me ? 'Escribe un comentario…' : 'Inicia sesión para comentar'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!me}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={submitComment}
              disabled={!me || sending || !text.trim()}
            >
              {sending ? 'Enviando…' : 'Comentar'}
            </button>
          </div>
        </div>
        {/* Acciones flotantes: esquina inferior derecha del componente */}
  <div className="ticket-actions-floating" aria-label="Acciones del ticket" style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          {ticket.status !== 'completed' ? (
            <>
              {canManage && (
                <button className="btn btn-draft" onClick={onEditFocus} style={{ height: 36, padding: '0 12px', width: 'auto' }}>Editar</button>
              )}
              <button
                className="btn btn-primary"
                onClick={() => onStatus('completed' as TicketStatus)}
                disabled={!canChangeStatus}
                style={{ height: 36, padding: '0 12px', width: 'auto' }}
              >
                Completar
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => onStatus('archived' as TicketStatus)}>🗄️ Archivar</button>
              <button className="btn btn-primary" onClick={() => onStatus('open' as TicketStatus)}>Reactivar</button>
            </>
          )}
        </div>
      </div>

      {/* Adjuntos */}
      <div className="ticket" style={{ display: 'grid', gap: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>Adjuntos</div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="file"
            onChange={(e) => setFileInput(e.target.files?.[0] ?? null)}
            className="input"
            style={{ maxWidth: 360, padding: 6 }}
          />
          <button className="btn btn-primary" onClick={uploadFile} disabled={!fileInput || uploading}>
            {uploading ? 'Subiendo…' : 'Subir'}
          </button>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {files.length === 0 && <div className="meta">Sin archivos.</div>}
          {files.map((a) => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '8px 10px',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ display: 'grid' }}>
                <div style={{ fontWeight: 800 }}>{a.name}</div>
                <div className="meta">
                  {(a.size ?? 0) > 0 ? `${(a.size! / 1024).toFixed(1)} KB` : ''} • {a.mime_type ?? ''}
                  {a.created_at ? ` • ${fmt(a.created_at)}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a className="btn" href={publicUrl(a.path)} target="_blank" rel="noreferrer">Ver/Descargar</a>
                <button className="btn btn-danger" onClick={() => onDeleteAttachment(a)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Overrides de estilo para las acciones flotantes (evitar width:100% en .btn-primary global) */}
      <style jsx global>{`
        .ticket-actions-floating{
          position: absolute;
          right: 14px;
          bottom: 14px;
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: nowrap;
          white-space: nowrap;
        }
        .ticket-actions-floating .btn,
        .ticket-actions-floating .btn-primary{
          width: auto !important;
          max-width: none !important;
          height: 36px;
          padding: 0 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .ticket-actions-floating .btn-draft{
          background: #fef3c7;
          color: #92400e;
          border-color: #f59e0b;
        }
      `}</style>
    </div>
  );
}

// Scoped styles flag for ISR compatibility
export const dynamic = 'force-dynamic';
