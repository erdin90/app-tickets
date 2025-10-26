// src/components/TicketCreateButton.tsx
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

type Props = {
  onCreated?: () => void;
};

export default function TicketCreateButton({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);

  async function createTicket() {
    if (!title.trim()) {
      toast.error('El título es obligatorio');
      return;
    }
    setLoading(true);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) {
        toast.error('Debes iniciar sesión');
        return;
      }

      const { error } = await supabase.from('tickets').insert({
        title: title.trim(),
        description: desc.trim() || null,
        status: 'open',         // App usa 'open'|'in_progress'|'on_hold'|'completed'
        priority: 'normal',
        assigned_to: null,
        business: null,
        source: 'app',          // <- diferencia con los tickets creados por email
        created_by: user.id,    // si no existe la columna en tu tabla, puedes quitarla
      });

      if (error) throw error;
      toast.success('Ticket creado');
      setOpen(false);
      setTitle('');
      setDesc('');
      onCreated?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al crear el ticket');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="px-3 py-2 border rounded btn btn-primary"
        onClick={() => setOpen(true)}
      >
        Nuevo ticket
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[520px] max-w-[94vw] rounded bg-white p-4 dark:bg-neutral-900 border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Crear ticket</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm opacity-70"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <input
                className="w-full border p-2 rounded"
                placeholder="Título"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <textarea
                className="w-full border p-2 rounded"
                placeholder="Descripción"
                rows={4}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-2 border rounded"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={createTicket}
                  disabled={loading || !title.trim()}
                  className="px-3 py-2 border rounded"
                >
                  {loading ? 'Creando…' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
