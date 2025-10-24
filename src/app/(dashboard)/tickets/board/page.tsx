'use client';
import { toast } from 'sonner';

import { useEffect, useMemo, useState } from 'react';
import { listTickets, updateTicketStatus, type Ticket } from '@/lib/tickets';
import type { TicketStatus } from '@/lib/status';
import { statusLabel } from '@/lib/status';
import { listTechnicians, type Profile } from '@/lib/users';
import AuthGuard from '@/components/AuthGuard';

type ColKey = 'open' | 'in_progress' | 'on_hold' | 'completed';
const COLS_ACTIVE: { key: ColKey; title: string }[] = [
  { key: 'open',        title: 'Abierto' },
  { key: 'in_progress', title: 'En progreso' },
  { key: 'on_hold',     title: 'En espera' },
];
const COL_COMPLETED: { key: ColKey; title: string } = { key: 'completed', title: 'Completado' };

/* --------------------- Contenido real del tablero --------------------- */
function BoardContent() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [techs, setTechs] = useState<Profile[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listTechnicians().then(({ data }) => setTechs(data));
  }, []);

  async function fetchAll() {
    try {
      setLoading(true);
      setErr(null);

      const active = await listTickets({ group: 'active', page: 1, pageSize: 500, q });
      if (active.error) throw active.error;

      let completed: Ticket[] = [];
      if (showCompleted) {
        const res = await listTickets({ group: 'completed', page: 1, pageSize: 500, q });
        if (res.error) throw res.error;
        completed = (res.data ?? []) as Ticket[];
      }

      setTickets([...(active.data ?? []), ...completed]);
    } catch (e: any) {
      console.error('[BOARD]', e);
      setErr(e?.message || 'No se pudieron cargar los tickets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  // note: hooks deps rule disabled project-wide
  }, [showCompleted, q]);

  const byStatus = useMemo(() => {
    const m: Record<ColKey, Ticket[]> = { open: [], in_progress: [], on_hold: [], completed: [] };
    for (const t of tickets) (m[t.status as ColKey] ?? []).push(t);
    return m;
  }, [tickets]);

  function nameOf(id: string | null) {
    return techs.find(p => p.id === id)?.full_name || '—';
  }

  async function moveTicket(id: string, to: ColKey) {
    // Update optimista
    setTickets(prev => prev.map(t => (t.id === id ? { ...t, status: to } : t)));
    const { error } = await updateTicketStatus(id, to as TicketStatus);
    if (error) {
  toast.error('No se pudo mover el ticket');
      fetchAll(); // revertir
    }
  }

  // Drag & Drop
  function onDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
  function onDrop(e: React.DragEvent, col: ColKey) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) moveTicket(id, col);
  }

  const columns = showCompleted ? [...COLS_ACTIVE, COL_COMPLETED] : COLS_ACTIVE;

  return (
    <div className="container">
      <div className="toolbar">
        <h1 className="section-title" style={{ margin: 0 }}>Tablero Kanban</h1>
        <div className="filters" style={{ gap: 8 }}>
          <input
            className="input"
            placeholder="Buscar por título o descripción…"
            style={{ width: 280 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <label className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            Mostrar “Completado”
          </label>
        </div>
      </div>

      {err && (
        <div className="ticket" style={{ color: 'var(--danger)', marginBottom: 12 }}>
          Error: {err}
        </div>
      )}

      <div className="kanban">
        {columns.map(col => (
          <section
            key={col.key}
            className="kanban-col"
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, col.key)}
          >
            <header className="kanban-head">
              <div style={{ fontWeight: 800 }}>{col.title}</div>
              <div className="meta">{byStatus[col.key].length} tickets</div>
            </header>

            <div className="kanban-drop">
              {loading && <div className="meta" style={{ padding: 8 }}>Cargando…</div>}
              {!loading && byStatus[col.key].length === 0 && (
                <div className="meta" style={{ padding: 8 }}>Sin tickets</div>
              )}
              {byStatus[col.key].map(t => (
                <article
                  key={t.id}
                  className="kanban-card"
                  draggable
                  onDragStart={(e) => onDragStart(e, t.id)}
                >
                  <div style={{ fontWeight: 800 }}>{t.title}</div>
                  {t.description && (
                    <div className="meta" style={{ marginTop: 4 }}>{t.description}</div>
                  )}
                  <div className="meta" style={{ marginTop: 6 }}>
                    Estado: {statusLabel(t.status)} • Asignado: {nameOf(t.assigned_to)}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/* --------------------- Export protegido --------------------- */
export default function BoardPage() {
  return (
    <AuthGuard>
      <BoardContent />
    </AuthGuard>
  );
}
