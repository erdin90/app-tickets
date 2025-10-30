
'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { listComments, addComment, subscribeComments, deleteComment, type TicketComment } from '@/lib/comments';
import { getMyProfile } from '@/lib/users';
import Avatar from '@/components/ui/Avatar';

export default function CommentsModal({
  open,
  onClose,
  ticketId,
  meId,
}: {
  open: boolean;
  onClose: () => void;
  ticketId: string | null;
  meId: string | null;
}) {
  const [items, setItems] = useState<TicketComment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [myRole, setMyRole] = useState<'manager' | 'technician' | 'it' | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function refetch() {
    if (!ticketId) return;
    const { data } = await listComments(ticketId);
    setItems(data);
  }

  useEffect(() => {
    if (!open || !ticketId) return;
    refetch();
    const unsub = subscribeComments(ticketId, refetch);
    getMyProfile().then(({ data }) => {
      const rr = (data?.role || '').toLowerCase();
      const r = rr === 'manager' || rr === 'technician' || rr === 'it' ? (rr as any) : null;
      setMyRole(r);
    }).catch(() => {});
    return () => unsub();
  // note: hooks deps rule disabled project-wide
  }, [open, ticketId]);

  async function submit() {
    if (!ticketId || !meId) return;
    if (!text.trim()) return;
    setSending(true);
    const { error } = await addComment(ticketId, meId, text);
    setSending(false);
    if (error) {
      alert(error.message || 'No se pudo comentar');
      return;
    }
    setText('');
    // refetch lo hará el realtime; por si acaso:
    refetch();
  }

  async function onDelete(id: string) {
    if (!meId) return;
    const c = items.find(x => x.id === id);
    const isOwn = c?.author === meId;
    const authorRole = c?.author_profile?.role?.toLowerCase?.();
    const authorIsIT = authorRole === 'technician' || authorRole === 'it';
    const isManager = myRole === 'manager';
    const isIT = myRole === 'technician' || myRole === 'it';
    const allowed = (isManager && authorIsIT) || (isIT && isOwn) || (isManager && isOwn);
    if (!allowed) return alert('No tienes permiso para eliminar este comentario');
    setDeletingId(id);
    const { error } = await deleteComment(id);
    setDeletingId(null);
    if (error) return alert(error.message || 'No se pudo eliminar');
    refetch();
    setConfirmId(null);
    toast.success('Comentario eliminado');
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ fontWeight: 800 }}>Comentarios</div>
          <button className="btn btn-icon" onClick={onClose}>✖</button>
        </div>

        <div style={{ display: 'grid', gap: 12, maxHeight: '50vh', overflowY: 'auto', marginTop: 8 }}>
          {items.length === 0 && <div className="meta">Sin comentarios aún.</div>}
          {items.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Avatar
                src={c.author_profile?.avatar_url ?? null}
                alt={c.author_profile?.full_name || c.author_profile?.id || ''}
                seed={c.author_profile?.id || c.author_profile?.full_name || undefined}
                size={22}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, position: 'relative' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {c.author_profile?.full_name ?? c.author}
                    </div>
                    <div className="meta" style={{ marginTop: 2 }}>
                      {new Date(c.created_at).toLocaleString('es-ES')}
                    </div>
                  </div>
                  {meId && (() => {
                    const authorRole = c.author_profile?.role?.toLowerCase?.();
                    const authorIsIT = authorRole === 'technician' || authorRole === 'it';
                    const isOwn = c.author === meId;
                    const isManager = myRole === 'manager';
                    const isIT = myRole === 'technician' || myRole === 'it';
                    const show = (isManager && authorIsIT) || (isIT && isOwn) || (isManager && isOwn);
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
                                onClick={() => onDelete(c.id)}
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
                <div style={{ marginTop: 6 }}>{c.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <textarea
            className="input"
            placeholder={meId ? 'Escribe un comentario…' : 'Debes iniciar sesión para comentar'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!meId}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>Cerrar</button>
            <button className="btn btn-primary" onClick={submit} disabled={!meId || sending || !text.trim()}>
              {sending ? 'Enviando…' : 'Comentar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
