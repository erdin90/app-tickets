'use client';

import { useEffect, useState } from 'react';
import { listComments, addComment, subscribeComments, type TicketComment } from '@/lib/comments';

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

  async function refetch() {
    if (!ticketId) return;
    const { data } = await listComments(ticketId);
    setItems(data);
  }

  useEffect(() => {
    if (!open || !ticketId) return;
    refetch();
    const unsub = subscribeComments(ticketId, refetch);
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <div key={c.id} style={{ display: 'flex', gap: 10 }}>
              <div className="avatar">
                {c.author_profile?.avatar_url
                  ? <img src={c.author_profile.avatar_url} alt="" />
                  : (c.author_profile?.full_name ?? '·').slice(0,1).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>
                  {c.author_profile?.full_name ?? c.author}
                </div>
                <div className="meta" style={{ marginTop: 2 }}>
                  {new Date(c.created_at).toLocaleString('es-ES')}
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
