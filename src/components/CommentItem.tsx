'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export type CommentModel = { id: string; body: string; author: string; created_at: string };

export default function CommentItem({
  c, userId, canAdmin, onEdited, onDeleted,
}: {
  c: CommentModel;
  userId: string | null;
  canAdmin: boolean;
  onEdited: (id: string, body: string) => void;
  onDeleted: (id: string) => void;
}) {
  const canEdit = userId === c.author || canAdmin;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    onEdited(c.id, text.trim()); // optimista
    const { error } = await supabase.from('comments').update({ body: text.trim() }).eq('id', c.id);
    setSaving(false);
    if (error) alert(error.message);
    setEditing(false);
  };

  const del = async () => {
    if (!confirm('¿Eliminar este comentario?')) return;
    setDeleting(true);
    onDeleted(c.id); // optimista
    const { error } = await supabase.from('comments').delete().eq('id', c.id);
    setDeleting(false);
    if (error) alert(error.message);
  };

  return (
    <li className="border rounded p-2">
      {!editing ? (
        <>
          <div className="text-sm whitespace-pre-wrap">{c.body}</div>
          <div className="flex items-center justify-between mt-1">
            <div className="text-xs opacity-60">{new Date(c.created_at).toLocaleString()}</div>
            {canEdit && (
              <div className="flex gap-2">
                <button className="text-xs underline" onClick={() => setEditing(true)}>Editar</button>
                <button className="text-xs underline" onClick={del} disabled={deleting}>
                  {deleting ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <textarea className="w-full border rounded p-2 text-sm" value={text} onChange={(e)=>setText(e.target.value)} />
          <div className="flex gap-2">
            <button className="px-2 py-1 border rounded text-xs" onClick={()=>{ setText(c.body); setEditing(false); }}>
              Cancelar
            </button>
            <button className="px-2 py-1 border rounded text-xs" onClick={save} disabled={saving || !text.trim()}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
