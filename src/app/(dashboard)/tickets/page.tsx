"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TicketsShell from "@/components/shell/TicketsShell";
import type { Ticket } from "@/lib/tickets";
import { listTicketsMeta as listTickets, subscribeTickets } from "@/lib/tickets";
import { statusLabel, type TicketStatus } from "@/lib/status";

function Badge({ children, color }: { children: React.ReactNode; color: "amber" | "green" | "red" | "blue" }) {
  const map: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${map[color]}`}>{children}</span>
  );
}

// Clasificación derivada con los campos actuales
function useClassification() {
  const now = new Date();
  function isOverdue(t: Ticket) {
    if (t.completed_at) return false;
    if (!t.due_date) return false;
    try { return new Date(t.due_date) < now; } catch { return false; }
  }
  function isCompleted(t: Ticket) { return t.status === "completed"; }
  function isNew(t: Ticket) { return t.status === "open"; }
  function isPending(t: Ticket) {
    // Pendiente: visto y en trabajo. Con el esquema actual lo aproximamos a in_progress / on_hold,
    // excluyendo vencidos y completados.
    if (isCompleted(t) || isOverdue(t)) return false;
    return t.status === "in_progress" || t.status === "on_hold";
  }
  return { isOverdue, isCompleted, isPending, isNew };
}

type Category = 'new' | 'pending' | 'overdue' | 'completed';

function TicketList({ items, onSelect, selectedId, category }:{ items: Ticket[]; onSelect: (t: Ticket)=>void; selectedId?: string | null; category: Category }){
  const color: Record<Category, { chip: React.ReactNode; hover: string; active: string; border: string }> = {
    new:       { chip: <Badge color="blue">Nuevo</Badge>,      hover: 'hover:bg-blue-50/40',  active: 'bg-blue-50/60',  border: 'border-blue-200' },
    pending:   { chip: <Badge color="amber">Pendiente</Badge>,  hover: 'hover:bg-amber-50/40', active: 'bg-amber-50/60', border: 'border-amber-200' },
    overdue:   { chip: <Badge color="red">Vencido</Badge>,     hover: 'hover:bg-rose-50/40',  active: 'bg-rose-50/60',  border: 'border-rose-200' },
    completed: { chip: <Badge color="green">Completado</Badge>, hover: 'hover:bg-emerald-50/40', active: 'bg-emerald-50/60', border: 'border-emerald-200' },
  };
  return (
    <div className="divide-y divide-neutral-200/70">
      {items.length === 0 && (
        <div className="text-sm text-neutral-500 px-3 py-8">No hay tickets.</div>
      )}
      {items.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t)}
          className={`w-full text-left px-3 py-3 transition rounded-lg ${color[category].hover} ${selectedId===t.id?`${color[category].active} border ${color[category].border}`:"bg-transparent"}`}
        >
          <div className="flex items-center gap-2">
            {color[category].chip}
            {t.due_date && (
              <span className="text-[11px] text-neutral-500">Vence {new Date(t.due_date).toLocaleDateString("es-ES", { day: '2-digit', month: 'short'})}</span>
            )}
          </div>
          <div className="mt-1 text-[13px] font-medium text-neutral-900 truncate">{t.title}</div>
          <div className="text-xs text-neutral-500 truncate">{t.description ?? ''}</div>
        </button>
      ))}
    </div>
  );
}

function Detail({ t, headingRef }: { t: Ticket | null; headingRef?: React.RefObject<HTMLHeadingElement | null> }){
  if (!t) {
    return (
      <div className="h-full grid place-items-center text-neutral-500">
        <div className="text-sm">Selecciona un ticket pendiente para ver el detalle</div>
      </div>
    );
  }
  const fmt = (ts?: string | null) => ts ? new Date(ts).toLocaleString('es-ES', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'}) : '';
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold leading-tight focus:outline-none focus:ring-2 focus:ring-neutral-300 rounded">
            {t.title}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <Badge color={t.status === 'completed' ? 'green' : 'amber'}>{statusLabel(t.status)}</Badge>
            {t.priority && (
              <span className="text-[11px] rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700">{t.priority}</span>
            )}
            <span className="text-[10px] rounded-full bg-neutral-50 border border-neutral-200 px-2 py-0.5 text-neutral-600">
              {((t as any)?.source === 'email') ? 'Email' : 'App'}
            </span>
          </div>
        </div>
      </div>

      {t.description && (
        <p className="mt-3 text-sm text-neutral-700 whitespace-pre-wrap">{t.description}</p>
      )}

      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs text-neutral-600">
        <div><span className="text-neutral-500">Creado:</span> {fmt(t.created_at)}</div>
        <div><span className="text-neutral-500">Vence:</span> {fmt(t.due_date)}</div>
        <div><span className="text-neutral-500">Completado:</span> {fmt(t.completed_at)}</div>
      </div>

      <div className="mt-6">
        <a className="inline-flex items-center gap-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-900 text-sm px-3.5 py-2" href={`/tickets/${t.id}`}>Abrir detalle completo</a>
      </div>
    </div>
  );
}

export default function TicketsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [category, setCategory] = useState<Category>('new');
  const { isPending, isOverdue, isNew, isCompleted } = useClassification();
  const detailRef = useRef<HTMLElement | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Scroll suave con easing, offset dinámico y cancelación de animaciones previas
  function smoothScrollToTarget(target: Element | null, baseExtraOffset = 12): Promise<void> {
    return new Promise((resolve) => {
      if (!target) return resolve();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Altura dinámica del header sticky principal
      const header = document.querySelector('header.sticky');
      const headerHeight = header instanceof HTMLElement ? header.getBoundingClientRect().height : 56;
      const OFFSET = headerHeight + baseExtraOffset; // compensación total

      const startY = window.scrollY || window.pageYOffset;
      const rect = target.getBoundingClientRect();
      const targetY = startY + rect.top - OFFSET;
      const delta = targetY - startY;
      if (Math.abs(delta) < 2) return resolve();

      // Si el destino está hacia abajo (scroll down), NO animar (salto inmediato)
      if (delta > 0) {
        window.scrollTo({ top: targetY, behavior: 'auto' });
        return resolve();
      }

      // Hacia arriba (scroll up): animación más lenta y suave
      const absDist = Math.abs(delta);
      const duration = Math.max(1000, Math.min(1700, absDist * 1.25));
      let startTs: number | null = null;
      const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

      const step = (ts: number) => {
        if (startTs === null) startTs = ts;
        const elapsed = ts - startTs;
        const t = Math.min(1, elapsed / duration);
        const y = startY + delta * easeInOutCubic(t);
        window.scrollTo({ top: y, behavior: 'auto' });
        if (t < 1) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          rafRef.current = null;
          resolve();
        }
      };
      rafRef.current = requestAnimationFrame(step);
    });
  }

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await listTickets({ group: 'active', pageSize: 100 });
    if (error) {
      setError('No se pudieron cargar los tickets');
      setTickets([]);
    } else {
      setTickets(data);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  // Realtime: refrescar cuando haya cambios en tickets/comments/asignaciones
  useEffect(() => {
    const unsub = subscribeTickets(() => load());
    return () => { unsub(); };
  // note: hooks deps rule disabled project-wide
  }, []);

  const lists = useMemo(() => ({
    new: tickets.filter(t => isNew(t) && !isOverdue(t)),
    pending: tickets.filter(t => isPending(t) && !isOverdue(t)),
    overdue: tickets.filter(t => isOverdue(t)),
    completed: tickets.filter(t => isCompleted(t)),
  }), [tickets]);

  const current = lists[category];

  useEffect(() => {
    if (!selected || !current.some(t => t.id === selected.id)) {
      setSelected(current[0] ?? null);
    }
  // note: hooks deps rule disabled project-wide
  }, [category, tickets]);

  // En selección: sin scroll y sin focus (por solicitud del usuario)
  useEffect(() => { /* no-op */ }, [selected?.id]);

  return (
    <TicketsShell>
      <section className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Tickets</h1>
          <p className="text-xs text-neutral-500">Gestión y seguimiento</p>
        </div>
        {/* Tabs de categoría */}
        <div className="flex items-center gap-2 rounded-full bg-neutral-100 px-1 py-1">
          {(
            [
              { key: 'new' as Category, label: 'Nuevos', count: lists.new.length },
              { key: 'pending' as Category, label: 'Pendientes', count: lists.pending.length },
              { key: 'overdue' as Category, label: 'Vencidos', count: lists.overdue.length },
              { key: 'completed' as Category, label: 'Completados', count: lists.completed.length },
            ]
          ).map(tab => (
            <button
              key={tab.key}
              onClick={() => { setCategory(tab.key); }}
              className={`text-sm px-3 py-1.5 rounded-full transition ${
                category===tab.key
                  ? 'bg-white shadow-sm text-neutral-900'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {tab.label}
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-white/70 text-neutral-700">{tab.count}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Lista izquierda */}
        <aside className="md:col-span-4 lg:col-span-3 rounded-xl border border-neutral-200 bg-white/60">
          <div className="px-3 py-2 border-b border-neutral-200 sticky top-16 bg-white/70 backdrop-blur rounded-t-xl">
            <div className="text-sm font-medium text-neutral-800">
              {category === 'new' && 'Nuevos'}
              {category === 'pending' && 'Pendientes'}
              {category === 'overdue' && 'Vencidos'}
              {category === 'completed' && 'Completados'}
            </div>
            <div className="text-[11px] text-neutral-500">
              {category === 'new' && 'Tickets recién creados (aprox. status Abierto)'}
              {category === 'pending' && 'Tickets vistos por el IT y aún no completados'}
              {category === 'overdue' && 'Tickets no completados con fecha de vencimiento pasada'}
              {category === 'completed' && 'Tickets finalizados'}
            </div>
          </div>
          {loading ? (
            <div className="p-4 text-sm text-neutral-500">Cargando…</div>
          ) : error ? (
            <div className="p-4 text-sm text-rose-600">{error}</div>
          ) : (
            <div className="p-2">
              <TicketList category={category} items={current} onSelect={setSelected} selectedId={selected?.id ?? null} />
            </div>
          )}
        </aside>

        {/* Detalle derecha */}
        <section ref={detailRef} className="md:col-span-8 lg:col-span-9 rounded-xl border border-neutral-200 bg-white/70 min-h-[360px]">
          <Detail t={selected} headingRef={detailHeadingRef} />
        </section>
      </div>
    </TicketsShell>
  );
}
