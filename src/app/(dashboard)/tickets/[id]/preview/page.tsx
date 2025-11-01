'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import AuthGuard from '@/components/AuthGuard';
import { getTicket, type Ticket } from '@/lib/tickets';
import { businessLabel } from '@/lib/businesses';
import { listTechnicians, type Profile } from '@/lib/users';
import { supabase } from '@/lib/supabase';
import * as stor from '@/lib/storage';

/* Helpers UI */
const fmt = (ts?: string) =>
  ts
    ? new Date(ts).toLocaleString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

function Avatar({ name, src }: { name?: string | null; src?: string | null }) {
  const letter = (name ?? '·').trim().slice(0, 1).toUpperCase();
  return (
    <span className="avatar">
      {src ? <img src={src} alt="" /> : letter}
    </span>
  );
}

export default function TicketPreviewPage() {
  return (
    <AuthGuard>
      <PreviewInner />
    </AuthGuard>
  );
}

function PreviewInner() {
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);

  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [techs, setTechs] = useState<Profile[]>([]);
  const [files, setFiles] = useState<Array<{ name: string; path: string; url: string }>>([]);

  useEffect(() => { listTechnicians().then(({ data }) => setTechs(data ?? [])); }, []);

  useEffect(() => {
    (async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await getTicket(id);
        if (error || !data) throw new Error(error?.message || 'No se encontró el ticket');
        setTicket(data);

        // multi-asignación; si no hay filas, usar el assigned_to
        const { data: links, error: e2 } = await supabase
          .from('ticket_assignees')
          .select('user_id')
          .eq('ticket_id', data.id);
        if (e2) throw e2;
        const ids = (links?.map(l => l.user_id) ?? []);
        if (ids.length === 0 && data.assigned_to) ids.push(data.assigned_to);
        setAssigneeIds(Array.from(new Set(ids)));

        // Cargar adjuntos desde el bucket "attachments" usando el ticket.id
        try {
          const list = await stor.listAttachments(String(data.id));
          setFiles(list);
        } catch (_) {
          setFiles([]);
        }
      } catch (e: any) {
        setError(e?.message || 'No se pudo cargar el ticket');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const assignees = useMemo(() => {
    return assigneeIds.map(uid => {
      const p = techs.find(t => t.id === uid);
      return { id: uid, name: p?.full_name ?? uid, avatar_url: p?.avatar_url ?? null };
    });
  }, [assigneeIds, techs]);

  if (loading) return <div className="container"><div className="meta">Cargando…</div></div>;
  if (error)   return <div className="container"><div className="meta text-danger">Error: {error}</div></div>;
  if (!ticket) return null;

  return (
    <div className="container">
      {/* Barra superior con estilo de la app */}
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <Link href="/dashboard" className="btn btn-ghost">‹ Volver</Link>
        <Link href={`/tickets/${ticket.id}`} className="btn btn-primary">Editar</Link>
        <span className="meta" style={{ marginLeft: 'auto' }}>ID: {ticket.id}</span>
      </div>

      {/* Tarjeta principal, misma estética que el tablero */}
      <article className="ticket ticket-v2">
        {/* Encabezado */}
        <div className="t2-row-info" style={{ alignItems: 'center' }}>
          <span className="badge">Creado: {fmt(ticket.created_at)}</span>
          {ticket.due_date && <span className="badge badge-due">Vence: {fmt(ticket.due_date)}</span>}
          {ticket.completed_at && <span className="badge">Completado: {fmt(ticket.completed_at)}</span>}
          <span className="badge" style={{ marginLeft: 'auto' }}>
            Negocio: {businessLabel(ticket.business)}
          </span>
        </div>

        {/* Título */}
        <h1 className="t2-title-line" style={{ fontSize: 22, marginTop: 6 }}>
          {ticket.title}
        </h1>

        {/* Cuerpo */}
        {ticket.description ? (
          <p className="t2-desc" style={{ whiteSpace: 'pre-wrap' }}>
            {ticket.description}
          </p>
        ) : (
          <div className="meta">Sin contenido.</div>
        )}

        {/* Asignados (chips como en las tarjetas) */}
        <div className="t2-row-info" style={{ marginTop: 10, alignItems: 'center' }}>
          <span className="meta" style={{ marginRight: 6 }}>Asignado a:</span>
          {assignees.length > 0 ? (
            <div className="flex" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {assignees.map(u => (
                <span key={u.id} className="user-chip">
                  <Avatar name={u.name} src={u.avatar_url} />
                  {u.name}
                </span>
              ))}
            </div>
          ) : (
            <span className="badge">Sin asignar</span>
          )}
        </div>
      </article>

      {/* Adjuntos (si los hay) */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3 style={{ margin: 0, fontSize: 16 }}>Adjuntos</h3>
        </div>
        <div className="card-body">
          {files.length === 0 ? (
            <div className="meta">Sin adjuntos.</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {files.map(f => (
                <li key={f.path} className="file-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="icon" aria-hidden>📎</span>
                  <a href={f.url} target="_blank" rel="noreferrer" className="link">
                    {f.name}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
