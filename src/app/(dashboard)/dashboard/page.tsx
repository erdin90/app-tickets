'use client';
/* note: rule disabled project-wide; removing file-level disable */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { User as UserIcon, Mail as MailIcon } from 'lucide-react';

import AuthGuard from '../../../components/AuthGuard';
import PageBar from '@/components/PageBar';
// import AppChrome from '@/components/AppChrome';

import { useUI } from '@/providers/ui';
import { type TicketStatus } from '@/lib/status';
import {
  listTicketsMeta as listTickets,
  createTicketSafe as createTicket,
  updateTicketStatusSafe,
  updateTicketPriority,
  updateTicketAssignees,
  updateTicketInfo,
  type Ticket,
  countTicketsByCategory,
  markTicketSeenSafe,

// Tipo local para tickets con comentarios
  // Extiende el tipo Ticket para incluir comentarios
  // Puedes mover esto a un archivo de tipos si lo prefieres
} from '@/lib/tickets';
import type { TicketPriority } from '@/lib/priority';
// Tipo local para tickets con comentarios
type TicketWithComments = Ticket & {
  comments?: TicketComment[];
};
import { downloadCSV } from '@/lib/export';
import { getWeeklyCategoryCounts } from '@/lib/reports';
import { listTechnicians, getMyProfile, getUsersByIds, type Profile } from '@/lib/users';
import { supabase } from '@/lib/supabase';
import AppModal from '@/components/AppModal';
import CommentsModal from '@/components/CommentsModal';
import { listComments, addComment, subscribeComments, type TicketComment } from '@/lib/comments';
import { BUSINESSES, businessLabel } from '@/lib/businesses';

/* ---------- Badges ---------- */
function prioBadge(p: TicketPriority) {
  switch (p) {
    case 'low': return 'badge badge-prio-low';
    case 'normal': return 'badge badge-prio-normal';
    case 'high': return 'badge badge-prio-high';
    default: return 'badge';
  }
}
const prioLabel = { low: 'Baja', normal: 'Normal', high: 'Alta' } as const;

// (badge auxiliar no usado)

const fmt = (ts?: string) =>
  ts ? new Date(ts).toLocaleString('es-ES', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

/* ---------- MultiAssigneePicker COMPACTO ---------- */
function MultiAssigneePicker({
  options,
  value,
  onChange,
  disabled,
  placeholder = 'Asignar…',
}: {
  options: { id: string; label: string; avatar_url?: string | null }[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = options.filter(o => value.includes(o.id));
  const primary = selected[0];
  const extra = Math.max(0, selected.length - 1);

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 160 }}>
      <button
        type="button"
        className="input"
        style={{
          height: 32, padding: '0 8px', fontSize: 12,
          display: 'flex', alignItems: 'center', gap: 6,
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
        onClick={() => !disabled && setOpen(o => !o)}
        aria-label={placeholder}
        disabled={disabled}
      >
        <span className="avatar" style={{ width: 20, height: 20, display:'inline-grid', placeItems:'center', borderRadius:9999, overflow:'hidden', background:'#eef2ff' }}>
          {primary?.avatar_url ? <img src={primary.avatar_url} alt="" /> : <UserIcon style={{ width: 12, height: 12, opacity: .85 }} />}
        </span>
        <span className="truncate" style={{ maxWidth: 120 }}>
          {primary ? primary.label : placeholder}
        </span>
        {extra > 0 && <span className="badge" style={{ fontSize: 10, padding: '2px 6px' }}>+{extra}</span>}
      </button>

      {open && !disabled && (
        <div
          className="ticket"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40,
            width: 288, maxWidth: '92vw', maxHeight: 320, overflow: 'auto', padding: 8
          }}
        >
          <div className="meta" style={{ fontSize: 10, textTransform: 'uppercase', marginBottom: 6 }}>
            Multi-asignación
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <label
              className="hoverable"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor:'pointer' }}
              onClick={() => onChange([])}
            >
              <input
                type="checkbox"
                checked={value.length === 0}
                onChange={() => onChange([])}
              />
              <span className="avatar" style={{ width: 18, height: 18 }}>—</span>
              <span className="truncate">Sin asignar</span>
            </label>

            {options.map(opt => {
              const checked = value.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className="hoverable"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 8, cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...value, opt.id]
                        : value.filter(v => v !== opt.id);
                      onChange(next);
                    }}
                    style={{ width: 14, height: 14 }}
                  />
                  <span className="avatar" style={{ width: 18, height: 18, display:'inline-grid', placeItems:'center', borderRadius:9999, overflow:'hidden', background:'#eef2ff' }}>
                    {opt.avatar_url ? <img src={opt.avatar_url} alt="" /> : <UserIcon style={{ width: 11, height: 11, opacity: .85 }} />}
                  </span>
                  <span className="truncate">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   PAGE WRAPPER (AuthGuard)
=========================================================== */
export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardInner />
    </AuthGuard>
  );
}



/* ===========================================================
   PAGE CONTENT
=========================================================== */
function DashboardInner() {
  // Helper: badge by current category (Nuevo/Pendiente/Vencido/Completado)
  const categoryBadge = (cat: 'new'|'pending'|'overdue'|'completed') => {
    const map = {
      new:       { cls: 'badge badge-open',     label: 'Nuevo' },
      pending:   { cls: 'badge badge-pending',  label: 'Pendiente' },
      overdue:   { cls: 'badge badge-overdue',  label: 'Vencido' },
      completed: { cls: 'badge badge-closed',   label: 'Completado' },
    } as const;
    const m = map[cat];
    return <span className={m.cls}>{m.label}</span>;
  };
  // Función auxiliar para renderizar el detalle del ticket
  function renderTicketDetail() {
    const tk = items.find(x => x.id === selectedId);
    if (!tk) {
      return <div className="ticket-empty">Selecciona un ticket para ver el detalle</div>;
    }
  const assignees = (tk.assignees && tk.assignees.length) ? tk.assignees : (tk.assigned_to ? [tk.assigned_to] : []);
  const shown = assignees.slice(0, 1);
  const commentsCount = (tk as unknown as { comments_count?: number }).comments_count ?? 0;

    return (
      <article
        className={`ticket ticket-v2 ${tk.status === 'completed' ? 'is-completed' : ''}`}
        style={{ margin: 0, paddingLeft: 8, paddingRight: 8, position: 'relative', paddingBottom: 76 }}
      >
        <header style={{ padding: 18 }}>
          {/* Título + columna derecha con chips */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 260, flex: '1 1 380px' }}>
              <h2 ref={detailHeadingRef} tabIndex={-1} style={{ margin: 0, fontSize: 28, lineHeight: 1.05, outline: 'none' }}>{tk.title}</h2>
              {tk.description && (
                <p style={{ marginTop: 10, color: '#444', whiteSpace: 'pre-wrap' }}>{tk.description}</p>
              )}
              <div style={{ marginTop: 12, color: '#666', fontSize: 13, display:'flex', alignItems:'center', gap:8 }}>
                {tk.source === 'email' && <MailIcon style={{ width:14, height:14, opacity:.85 }} aria-label="Desde email" />}
                <span>
                  Creado: {tk.source === 'email' ? ((tk as any).requester_email || (tk as any).raw_from || 'correo') + ' • ' : ''}{fmt(tk.created_at)}
                </span>
              </div>
            </div>

            {/* Derecha: solo valores (sin etiquetas) */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end', minWidth: 260, flex: '0 0 auto', flexWrap: 'wrap' }}>
              <div className={prioBadge(tk.priority)}>{prioLabel[tk.priority as keyof typeof prioLabel]}</div>
              <div className="badge">{businessLabel(tk.business)}</div>
              {/* Mostrar el estado según la vista actual (categoría) */}
              <div>{categoryBadge(category)}</div>
            </div>
          </div>
        </header>

        {/* Acciones de cabecera a la derecha: Asignado (chip con inicial) + Comentarios */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 18px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 220 }}>
            <MultiAssigneePicker options={techOptions} value={assignees} onChange={(ids) => handleAssigneesChange(tk.id, ids)} disabled={!canManage} placeholder={shown.length ? nameOf(shown[0]) : 'Sin asignar'} />
          </div>
          <button className="btn" onClick={() => { setCommentsTicket(tk.id); setCommentsOpen(true); }} style={{ height: 40 }}>
            💬 Comentarios{commentsCount ? ` (${commentsCount > 99 ? '99+' : commentsCount})` : ''}
          </button>
        </div>

        <div style={{ padding: '12px 12px 18px', maxWidth: 760, margin: '0 auto', boxSizing: 'border-box' }}>
          {/* Divisor suave entre cuerpo y comentarios */}
          <div style={{ height: 1, background: '#eef2f6', borderRadius: 1, margin: '6px 0 14px' }} />

          {/* Comentarios debajo del ticket (desde commentsMap si está disponible) */}
          <div style={{ marginTop: 12 }}>
            {/** Lista de comentarios preferentemente desde commentsMap */}
            {(() => {
              const commentsList: TicketComment[] = (commentsMap[tk.id] ?? (tk.comments ?? []));
              const count = commentsList.length;
              return (
                <>
                  <h3 style={{ margin: '8px 0' }}>Comentarios{count ? ` (${count})` : ''}</h3>
                  {count === 0 ? (
                    <div style={{ color: '#666', marginBottom: 8 }}>Sin comentarios aún.</div>
                  ) : (
                    commentsList.map((c) => (
                      <div key={c.id} style={{ marginBottom: 10, padding: 10, background: '#f9f9f9', borderRadius: 8 }}>
                        <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                        <div style={{ fontSize: 12, color: '#777', marginTop: 6 }}>Por: {c.author_profile?.full_name ?? c.author} • {fmt(c.created_at)}</div>
                      </div>
                    ))
                  )}

                  {/* Input para agregar comentario inline */}
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-end', width: '100%' }}>
                    <textarea
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      placeholder="Agregar un comentario..."
                      rows={2}
                      style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e6e6e6', resize: 'vertical', minWidth: 0 }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 96 }}>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleAddComment(tk.id)}
                        disabled={addingComment || !newCommentText.trim()}
                        style={{ whiteSpace: 'nowrap' }}
                      >{addingComment ? 'Enviando…' : 'Agregar'}</button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Acciones flotantes: fija en la esquina inferior derecha del componente */}
  <div className="ticket-actions-floating" aria-label="Acciones del ticket" style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          {tab === 'active' ? (
            <>
              {/* Comenzar: visible si el ticket está en 'new' y el usuario puede trabajarlo */}
              {(() => {
                const isNewView = category === 'new';
                const assigned = me ? getAssigneeIds(tk).includes(me) : false;
                if (isNewView && (assigned || canManage)) {
                  return (
                    <button
                      className="btn"
                      onClick={() => handleStart(tk)}
                      style={{ height: 36, padding: '0 12px', width: 'auto', whiteSpace: 'nowrap' }}
                    >Comenzar</button>
                  );
                }
                return null;
              })()}
              {canManage && (
                <button className="btn btn-draft" onClick={() => openEditModal(tk)} style={{ height: 36, padding: '0 12px', width: 'auto', whiteSpace: 'nowrap' }}>Editar</button>
              )}
              {(category === 'pending' || category === 'overdue') && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleComplete(tk.id)}
                  disabled={!canCompleteTicket(tk)}
                  style={{ height: 36, padding: '0 12px', width: 'auto', whiteSpace: 'nowrap' }}
                >
                  Completar
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => handleArchive(tk.id)} style={{ height: 36, padding: '0 12px', width: 'auto', whiteSpace: 'nowrap' }}>🗄️ Archivar</button>
              <button className="btn btn-primary" onClick={() => handleReactivate(tk.id)} style={{ height: 36, padding: '0 12px', width: 'auto', whiteSpace: 'nowrap' }}>Reactivar</button>
            </>
          )}
        </div>
      </article>
    );
  }
  const { t } = useUI();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const detailPaneRef = useRef<HTMLElement | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  

  const [me, setMe] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<'manager' | 'technician' | 'it' | 'user' | null>(null);
  const [canCreateTickets, setCanCreateTickets] = useState(false);
  const canManage = myRole === 'manager';
  const isTechnician = myRole === 'technician' || myRole === 'it';
  const isUserOnly  = myRole === 'user' || (!isTechnician && !canManage);
  // Restricción estricta: tanto 'technician' como 'it' sólo ven asignados a sí mismos
  const isStrictTechnician = myRole === 'technician' || myRole === 'it';

  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const [category, setCategory] = useState<'new'|'pending'|'overdue'|'completed'>('new');

  const [items, setItems] = useState<TicketWithComments[]>([]);
    // Usamos el tipo extendido para incluir comentarios
  const [total, setTotal] = useState(0);
  // Secuencia para descartar respuestas obsoletas del listado (evita flicker por carreras)
  const listReqSeqRef = useRef(0);

  const [priorityFilter, setPriorityFilter] = useState<'all' | TicketPriority>('all');
  const [businessFilter, setBusinessFilter] = useState<'all' | string>('all');
  const [assignedFilter, setAssignedFilter] = useState<'all' | 'unassigned' | string>('all');
  const [dueFilter, setDueFilter] = useState<'all' | 'today' | 'week' | 'overdue'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Nuevo
  const [newStatus, setNewStatus] = useState<'' | TicketStatus>('' );
  const [newPriority, setNewPriority] = useState<'' | TicketPriority>('' );
  const [newAssignees, setNewAssignees] = useState<string[]>([]);
  const [newBusiness, setNewBusiness] = useState<string>('');
  const [newDue, setNewDue] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  // Métricas
  const [statCompleted, setStatCompleted] = useState(0);
  const [statNew, setStatNew] = useState(0);
  const [statPending, setStatPending] = useState(0);
  const [statOverdue, setStatOverdue] = useState(0);
  const [trend, setTrend] = useState<{ new: number; pending: number; overdue: number; completed: number }>({ new: 0, pending: 0, overdue: 0, completed: 0 });

  // Técnicos
  const [techs, setTechs] = useState<Profile[]>([]);
  // Perfiles arbitrarios (creadores y otros ids que no están en "techs")
  const [peopleMap, setPeopleMap] = useState<Record<string, Profile>>({});

// --- filtros pro/minimal ---
const [advancedOpen, setAdvancedOpen] = useState(false);
// Evita auto-abrir repetidamente y respeta la preferencia del usuario
const hasAutoOpenedRef = useRef(false);
const activeFiltersCount = useMemo(() => {
  let c = 0;
  if (priorityFilter !== 'all') c++;
  if (businessFilter !== 'all') c++;
  // Técnicos e IT: el valor por defecto es "asignados a mí" y no debe contar
  const isDefaultAssigned = isTechnician && me ? (assignedFilter === me) : (assignedFilter === 'all');
  if (!isDefaultAssigned) c++;
  if (dueFilter !== 'all') c++;
  return c;
}, [priorityFilter, businessFilter, assignedFilter, dueFilter, isTechnician, me]);

  // Modal genérico
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogBody, setDialogBody] = useState<React.ReactNode>(null);
  const [dialogVariant, setDialogVariant] = useState<'info'|'success'|'warning'|'danger'>('info');
  const openDialog = (opts: { title: string; body: React.ReactNode; variant?: 'info'|'success'|'warning'|'danger' }) => {
    setDialogTitle(opts.title); setDialogBody(opts.body); setDialogVariant(opts.variant ?? 'info'); setDialogOpen(true);
  };
  const closeDialog = () => setDialogOpen(false);

  // Estados para edición rápida
  const [editTicketId, setEditTicketId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<TicketPriority>('normal');
  const [editBusiness, setEditBusiness] = useState<string>('');
  const [editAssignees, setEditAssignees] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  // Abre el modal de edición con valores del ticket
  function openEditModal(ticket: Ticket) {
    if (ticket.status === 'completed') {
      openDialog({ title: 'No permitido', body: <div>No se puede editar un ticket completado.</div>, variant: 'warning' });
      return;
    }
    setEditTicketId(ticket.id);
    setEditTitle(ticket.title);
    setEditDescription(ticket.description ?? '');
    setEditPriority(ticket.priority);
  setEditBusiness(ticket.business ?? '');
    setEditAssignees(getAssigneeIds(ticket));
    setDialogTitle('Editar ticket');
    setDialogVariant('info');
    setDialogBody(null); // lo rellenamos en el JSX del modal
    setDialogOpen(true);
  }

  async function saveEdit() {
    if (!editTicketId) return;
    setSavingEdit(true);
    try {
      // actualizar título/description en backend
      const { error: infoErr } = await updateTicketInfo(editTicketId, { title: editTitle, description: editDescription, business: editBusiness });
      if (infoErr) throw infoErr;

      if (editPriority) {
        const { error } = await updateTicketPriority(editTicketId, editPriority);
        if (error) throw error;
      }

      {
        const { error } = await updateTicketAssignees(editTicketId, editAssignees);
        if (error) throw error;
      }

      // actualizar localmente el ticket completo
      setItems(prev => prev.map(t => t.id === editTicketId ? { ...t, title: editTitle, description: editDescription, priority: editPriority, business: editBusiness, assignees: editAssignees } : t));
      setDialogOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? 'Error');
      openDialog({ title: 'Error', body: <div>Error guardando: {msg}</div>, variant: 'danger' });
    } finally {
      setSavingEdit(false);
    }
  }

  // Comments modal
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsTicket, setCommentsTicket] = useState<string | null>(null);

  // Comentarios locales: map ticketId -> comments
  const [commentsMap, setCommentsMap] = useState<Record<string, TicketComment[]>>({});
  const [newCommentText, setNewCommentText] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  // Estado para el botón flotante de refresco
  const [refreshing, setRefreshing] = useState(false);

  // Cargar comentarios cuando cambia la selección y subscribir a cambios
  useEffect(() => {
    if (!selectedId) return;
    let mounted = true;
    (async () => {
      const { data } = await listComments(selectedId);
      if (!mounted) return;
      setCommentsMap(prev => ({ ...prev, [selectedId]: data }));
    })();
    const unsub = subscribeComments(selectedId, async () => {
      const { data } = await listComments(selectedId);
      setCommentsMap(prev => ({ ...prev, [selectedId]: data }));
    });
    return () => { mounted = false; unsub(); };
  }, [selectedId]);

  async function handleAddComment(ticketId: string) {
    if (!me) { openDialog({ title: 'Login requerido', body: 'Debes iniciar sesión para comentar', variant: 'warning' }); return; }
    if (!newCommentText.trim()) return;
    setAddingComment(true);
    const { data, error } = await addComment(ticketId, me, newCommentText.trim());
    setAddingComment(false);
    if (error || !data) {
      openDialog({ title: 'Error', body: <div>No se pudo agregar el comentario: {error?.message ?? 'error'}</div>, variant: 'danger' });
      return;
    }
  setCommentsMap(prev => ({ ...prev, [ticketId]: [...(prev[ticketId] ?? []), data] }));
  setNewCommentText('');
  // actualizar comments_count localmente
  const current = (items.find(x => x.id === ticketId) as (Ticket & { comments_count?: number }) | undefined)?.comments_count ?? 0;
  patchTicket(ticketId, { comments_count: (current + 1) } as unknown as Partial<Ticket>);
  }

  // Refrescar todo: lista, métricas y comentarios del ticket seleccionado
  async function doFullRefresh() {
    try {
      setRefreshing(true);
      await Promise.all([
        (async () => { await refetchList(); })(),
        (async () => { await refetchStats(); })(),
      ]);
      if (selectedId) {
        const { data } = await listComments(selectedId);
        setCommentsMap(prev => ({ ...prev, [selectedId]: data }));
      }
    } finally {
      setRefreshing(false);
    }
  }

  const prioOptions = useMemo(
    () => ([{ value: 'low' as TicketPriority, label: 'Baja' },
            { value: 'normal' as TicketPriority, label: 'Normal' },
            { value: 'high' as TicketPriority, label: 'Alta' }]),
    []
  );

  const displayName = (p?: Profile) =>
    (p?.full_name ?? p?.id ?? '—').toString().split(/\r?\n/)[0];

  const techOptions = useMemo(
    () => techs.map(p => ({ id: p.id, label: displayName(p), avatar_url: p.avatar_url })),
    [techs]
  );


  // utilidades sin uso eliminadas

useEffect(() => {
  const mql = window.matchMedia('(max-width: 1024px)');
  const onChange = () => setIsMobile(mql.matches);
  onChange(); // set inicial
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}, []);

// Sin auto-scroll ni focus al cambiar selección (solicitado por el usuario)
useEffect(() => { /* no-op */ }, [selectedId]);

useEffect(() => {
  if (!isMobile) {
    // Desktop: auto-selecciona el primero si no hay selección
    if (!selectedId && items.length > 0) setSelectedId(items[0].id);
    if (selectedId && !items.find(t => t.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null);
    }
  } else {
    // Móvil: NUNCA autoselecciones; vuelve a la lista si el seleccionado ya no existe
    if (!items.find(t => t.id === selectedId)) setSelectedId(null);
  }
}, [items, selectedId, isMobile]);


// Auto-abrir filtros avanzados solo para roles no técnicos.
// Para IT/técnicos, mantener "básico" por defecto aunque haya filtros activos
useEffect(() => {
  if (hasAutoOpenedRef.current) return;
  if (activeFiltersCount > 0) {
    if (myRole !== 'it' && myRole !== 'technician') {
      setAdvancedOpen(true);
    }
    hasAutoOpenedRef.current = true;
  }
}, [activeFiltersCount, myRole]);

function resetFilters() {
  setPage(1);
  setPriorityFilter('all');
  setBusinessFilter('all');
  setAssignedFilter('all');
  setDueFilter('all');
  setSearchInput('');
}

  function patchTicket(id: string, patch: Partial<Ticket>) {
    setItems(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function refetchList() {
    // Gate inicial: no pedir datos hasta conocer el rol del usuario
    if (myRole === null) return;
    // Técnicos/IT: esperar a que el filtro "asignados a mí" esté aplicado para evitar mostrar de más
    if (isStrictTechnician && me && assignedFilter !== me) return;
    // Secuencia para ignorar respuestas antiguas si hay múltiples llamadas en vuelo
    const reqId = ++listReqSeqRef.current;
    const pr = priorityFilter === 'all' ? undefined : priorityFilter;
    const biz = businessFilter === 'all' ? undefined : businessFilter;
    const asg = (isStrictTechnician && me)
      ? me
      : (assignedFilter === 'all' ? undefined : assignedFilter);
    const group = category === 'completed' ? 'completed' : 'active';
    const createdBy = (!isTechnician && !canManage && me) ? me : undefined;
    const { data, error } = await listTickets({
      group, priority: pr, business: biz, assignedTo: asg, createdBy, due: dueFilter, q, page, pageSize,
    });
    if (error) { console.error('[LIST]', error); return; }
    // Si llegó otra respuesta más reciente, descartar esta
    if (reqId !== listReqSeqRef.current) return;
    const list = (data as Ticket[]) ?? [];
    const now = new Date();
    const computeCat = (t: Ticket): 'new'|'pending'|'overdue'|'completed' => {
      const anyT = t as unknown as { category?: string; pending_since_at?: string | null };
      if (anyT.category === 'new' || anyT.category === 'pending' || anyT.category === 'overdue' || anyT.category === 'completed') {
        return anyT.category as 'new'|'pending'|'overdue'|'completed';
      }
      if (t.status === 'completed') return 'completed';
      const overdue = !t.completed_at && t.due_date ? new Date(t.due_date) < now : false;
      if (overdue) return 'overdue';
      if (t.status === 'open') return 'new';
      return 'pending';
    };
    const filtered = list.filter(t => computeCat(t) === category);
    setItems(filtered);
    setTotal(filtered.length);

    // Precargar perfiles de los creadores para mostrar su nombre debajo del título
    try {
      const creatorIds = Array.from(new Set(filtered.map(t => t.created_by).filter(Boolean) as string[]));
      const missing = creatorIds.filter(id => !peopleMap[id]);
      if (missing.length) {
        const { data } = await getUsersByIds(missing);
        if (data?.length) {
          setPeopleMap(prev => ({ ...prev, ...Object.fromEntries(data.map(p => [p.id, p])) }));
        }
      }
    } catch (_) { /* ignore */ }
  }

  const refetchStats = useCallback(async () => {
    // Reglas:
    // - IT: métricas de asignados a mí
    // - Manager/Admin: globales
    // - Usuario final: métricas de tickets creados por mí
  const assignedTo = (isTechnician && me) ? me : undefined;
  const createdBy = (!isTechnician && !canManage && me) ? me : undefined;
    try {
      const counts = await countTicketsByCategory({ assignedTo, createdBy });
      setStatNew(counts.new);
      setStatPending(counts.pending);
      setStatOverdue(counts.overdue);
      setStatCompleted(counts.completed);
      // Trends: global for now (simple and fast)
      try {
        const w = await getWeeklyCategoryCounts();
        setTrend({ new: w.new.pct, pending: w.pending.pct, overdue: w.overdue.pct, completed: w.completed.pct });
      } catch (_) { /* ignore */ }
    } catch (e) {
      console.error('[stats by category]', e);
      setStatNew(0); setStatPending(0); setStatOverdue(0); setStatCompleted(0);
      setTrend({ new: 0, pending: 0, overdue: 0, completed: 0 });
    }
  }, [isTechnician, canManage, me]);
    
  // Eliminado: este efecto autoseleccionaba siempre el primer ticket sin respetar móvil,
  // causando que en móvil no se muestre la lista primero. La lógica correcta ya existe
  // más arriba y distingue entre desktop/móvil.
  /* --------- bootstrap usuario/roles/techs --------- */
  useEffect(() => {
    listTechnicians().then(({ data }) => setTechs(data));
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setMe(u.user?.id ?? null);
      const { data: p } = await getMyProfile();
      const rawRole = (p?.role ?? null) as string | null;
      const role = (rawRole ? rawRole.toLowerCase() : null) as 'manager' | 'technician' | 'it' | 'user' | null;
      setMyRole(role);
      setCanCreateTickets(role === 'manager' || !!p?.can_create_ticket);
    })();
  }, []);

  useEffect(() => {
    // Técnicos e IT: forzar "asignados a mí" por defecto
    if (me && (myRole === 'technician' || myRole === 'it')) {
      setAssignedFilter((prev) => (prev === me ? prev : me));
    }
  }, [me, myRole]);

  /* --------- primera carga --------- */
  // Evitamos el fetch inmediato para no mostrar resultados incorrectos antes de
  // resolver usuario/rol y aplicar filtros por defecto (p. ej., técnicos: "asignados a mí").
  useEffect(() => { /* no-op: el primer fetch ocurre tras resolver usuario/rol */ }, []);

  // Cuando se resuelve el usuario/rol, recalcular lista para aplicar filtros
  useEffect(() => {
    if (me !== null) {
      refetchList();
    }
    // note: hooks deps rule disabled project-wide
  }, [me, isTechnician, canManage]);

  // Mantener 'tab' (activos/completados) en sincronía con la categoría
  useEffect(() => {
    setTab(category === 'completed' ? 'completed' : 'active');
    setPage(1);
    refetchList();
    // note: hooks deps rule disabled project-wide
  }, [category]);

  // Recalcular métricas cuando se cargue el usuario o cambie el rol relevante
  useEffect(() => {
    // Recalcular cuando cambie el usuario o el rol (incluye manager)
    if (me || isTechnician || canManage) {
      void refetchStats();
    }
  }, [me, isTechnician, canManage, refetchStats]);

  /* --------- realtime directo (robusto) --------- */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { refetchList(); refetchStats(); }, 120); };

    const ch = supabase
      .channel(`tickets-realtime-${me ?? 'guest'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, (payload: any) => {
        if (!me) { schedule(); return; }
        const oldAssigned = payload?.old?.assigned_to ?? null;
        const newAssigned = payload?.new?.assigned_to ?? null;
        const oldCreator = payload?.old?.created_by ?? null;
        const newCreator = payload?.new?.created_by ?? null;
        if (oldAssigned === me || newAssigned === me || oldCreator === me || newCreator === me) schedule();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_assignees' }, (payload: any) => {
        if (!me) { schedule(); return; }
        const uOld = payload?.old?.user_id ?? null;
        const uNew = payload?.new?.user_id ?? null;
        if (uOld === me || uNew === me) schedule();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_comments' }, () => schedule());

    void ch.subscribe();
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch); };
    // note: hooks deps rule disabled project-wide
  }, [me, tab, q, page, pageSize, priorityFilter, assignedFilter, dueFilter]);

  /* --------- debounce de búsqueda --------- */
  useEffect(() => {
    const id = setTimeout(() => { setPage(1); setQ(searchInput); }, 200);
    return () => clearTimeout(id);
  }, [searchInput]);

  /* --------- refetch cuando cambian filtros --------- */
  useEffect(() => {
    refetchList();
    // note: hooks deps rule disabled project-wide
  }, [tab, q, page, pageSize, priorityFilter, businessFilter, assignedFilter, dueFilter]);

  async function handleCreate() {
    const errors: string[] = [];
    if (!title.trim()) errors.push('Título requerido');
    if (!description.trim()) errors.push('Contenido requerido');
    const st: TicketStatus = (newStatus || 'open') as TicketStatus;
    const pr: TicketPriority = (newPriority || 'normal') as TicketPriority;
    if (newDue && new Date(newDue) < new Date()) errors.push('La fecha de vencimiento no puede ser pasada');
    if (!canCreateTickets) errors.push('No tienes permiso para crear tickets');

    if (errors.length) {
      openDialog({
        title: 'Revisa estos campos',
        body: <ul style={{ margin:'8px 0 0 18px' }}>{errors.map((e,i)=><li key={i}>{e}</li>)}</ul>,
        variant: 'warning'
      });
      return;
    }

    setLoading(true);
    const { error } = await createTicket({
      title,
      description,
      status: st,
      priority: pr,
      assignees: canManage ? newAssignees : [],
      assigned_to: canManage ? (newAssignees[0] ?? null) : null,
      due_date: newDue ? new Date(newDue).toISOString() : null,
      business: newBusiness || null,
    });
    setLoading(false);

    if (error) {
      openDialog({ title: 'Ocurrió un error', body: <div>No se pudo crear el ticket: {error.message}</div>, variant: 'danger' });
      return;
    }

    setTitle(''); setDescription('');
    setNewStatus(''); setNewPriority('');
    setNewAssignees([]); setNewDue(''); setNewBusiness('');
    setPage(1);
    await refetchList(); await refetchStats();
  }

  async function handleStatusChange(id: string, next: TicketStatus) {
    if (tab === 'active' && next === 'completed') {
      setItems(prev => prev.filter(t => t.id !== id));
    } else if (tab === 'completed' && next !== 'completed') {
      setItems(prev => prev.filter(t => t.id !== id));
    } else {
      patchTicket(id, { status: next, completed_at: next === 'completed' ? new Date().toISOString() : null });
    }
    const { error } = await updateTicketStatusSafe(id, next);
    if (error) openDialog({ title: 'Ocurrió un error', body: <div>No se pudo cambiar el estado: {error.message}</div>, variant: 'danger' });
    await refetchList(); await refetchStats();
  }

  // (cambio de prioridad inline no utilizado en esta vista)

  async function handleAssigneesChange(id: string, userIds: string[]) {
    if (!canManage) { openDialog({ title:'Permisos insuficientes', body:'Solo managers', variant:'warning' }); return; }
    patchTicket(id, { assignees: userIds, assigned_to: userIds[0] ?? null });
    const { error } = await updateTicketAssignees(id, userIds);
    if (error) openDialog({ title:'Ocurrió un error', body:<div>No se pudo actualizar asignados: {error.message}</div>, variant:'danger' });
    await refetchStats();
  }

  // (cambio de negocio inline no utilizado en esta vista)

  async function handleComplete(id: string) {
    const ticket = items.find((t) => t.id === id);
    if (!ticket || !canCompleteTicket(ticket)) {
      openDialog({
        title: 'Permisos insuficientes',
        body: <div>Solo el manager o el técnico asignado puede completar este ticket.</div>,
        variant: 'warning',
      });
      return;
    }
    await handleStatusChange(id, 'completed');
  }
  async function handleReactivate(id: string) {
    const tk = items.find(t => t.id === id) as Ticket | undefined;
    const { error } = await updateTicketStatusSafe(id, 'open' as TicketStatus);
    if (error) { openDialog({ title:'Ocurrió un error', body:<div>No se pudo reactivar: {error.message}</div>, variant:'danger' }); return; }
    // Elegir categoría destino según vencimiento
    const duePast = tk?.due_date ? (new Date(tk.due_date) < new Date()) : false;
    setCategory(duePast ? 'overdue' : 'new');
    await refetchList();
    await refetchStats();
  }
  async function handleArchive(id: string) {
    const { error } = await updateTicketStatusSafe(id, 'archived' as unknown as TicketStatus);
    if (error) { openDialog({ title:'Ocurrió un error', body:<div>No se pudo archivar: {error.message}</div>, variant:'danger' }); return; }
    setItems(prev => prev.filter(t => t.id !== id));
    await refetchStats();
  }

  // "Comenzar": para técnicos asignados en tickets NUEVOS, mueve a Pendientes (marca visto y opcionalmente pone in_progress)
  async function handleStart(ticket: Ticket) {
    // Confirmación informativa
    openDialog({
      title: 'Comenzar trabajo',
      body: (
        <div>
          Su ticket pasará al estado de <strong>pendiente</strong> hasta que lo complete.
        </div>
      ),
      variant: 'info'
    });
    // Ejecutar el cambio inmediatamente después de mostrar el mensaje informativo
    const { error } = await markTicketSeenSafe(ticket.id);
    if (!error) {
      await updateTicketStatusSafe(ticket.id, 'in_progress' as TicketStatus);
      setCategory('pending');
      await refetchList();
      await refetchStats();
    } else {
      openDialog({ title: 'Ocurrió un error', body: <div>No se pudo iniciar: {error.message}</div>, variant: 'danger' });
    }
  }

  const namesOf = (ids: string[]) =>
    ids.map(id => {
      const p = techs.find(x => x.id === id);
      return p ? displayName(p) : id;
    }).join(', ');

  const getAssigneeIds = (ticket: Ticket) => {
    if (ticket.assignees && ticket.assignees.length) {
      return ticket.assignees;
    }
    return ticket.assigned_to ? [ticket.assigned_to] : [];
  };

  function canCompleteTicket(ticket: Ticket) {
    // Se permite completar desde la vista Pendientes o Vencidos
    const cat = category; // vista actual
    if (!(cat === 'pending' || cat === 'overdue')) return false;
    if (!me) return canManage; // por si se requiere permitir a manager sin sesión válida
    const isAssigned = getAssigneeIds(ticket).includes(me);
    return canManage || isAssigned;
  }

  async function exportAllFiltered() {
    const pr = priorityFilter === 'all' ? undefined : priorityFilter;
    const biz = businessFilter === 'all' ? undefined : businessFilter;
    const asg = (isStrictTechnician && me)
      ? me
      : (assignedFilter === 'all' ? undefined : assignedFilter);
    let acc: Ticket[] = []; let fetched = 0; const chunk = 1000;
    while (true) {
      const { data } = await listTickets({ group: tab, priority: pr, business: biz, assignedTo: asg, due: dueFilter, q, page: Math.floor(fetched / chunk) + 1, pageSize: chunk });
      const part = (data as Ticket[]) ?? []; acc = acc.concat(part); fetched += part.length; if (part.length < chunk) break;
    }
    const rows = acc.map((t) => {
      const ass = t.assignees && t.assignees.length ? t.assignees : (t.assigned_to ? [t.assigned_to] : []);
      return {
        id: t.id, titulo: t.title, descripcion: t.description ?? '', estado: t.status, prioridad: t.priority,
        asignados: namesOf(ass), vence: t.due_date ?? '', creado: t.created_at, completado: t.completed_at ?? '',
        negocio: businessLabel(t.business),
      };
    });
    downloadCSV(rows, `tickets_${tab}_filtered.csv`);
  }

  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(total, page * pageSize);
  const canPrev = page > 1;
  const canNext = page * pageSize < total;
  const nameOf = (id: string | null | undefined) => {
    if (!id) return '—';
    const p = techs.find(x => x.id === id);
    return p ? displayName(p) : id;
  };
  // Forzar value a "yo" si es técnico o IT
  const assignedValue = ((myRole === 'technician' || myRole === 'it') && me) ? me : assignedFilter;

  return (
    <>
      {/* ===== Barra superior sticky ===== */}
      <PageBar title="Tickets" subtitle="Gestión y seguimiento" right={null} />

      <div className="container">
        {/* MÉTRICAS */}
        <section className="stats-grid">
          {/* Nuevo orden: Nuevos (azul), Pendientes (amarillo), Vencidos (rojo), Completados (verde) */}
          <StatCard label="Nuevos" value={statNew} variant="active" trendPct={trend.new} onClick={() => { setCategory('new'); setPage(1); }} />
          <StatCard label="Pendientes" value={statPending} variant="pending" trendPct={trend.pending} onClick={() => { setCategory('pending'); setPage(1); }} />
          <StatCard label="Vencidos" value={statOverdue} variant="overdue" trendPct={trend.overdue} onClick={() => { setCategory('overdue'); setPage(1); }} />
          <StatCard label="Completados" value={statCompleted} variant="completed" trendPct={trend.completed} onClick={() => { setCategory('completed'); setPage(1); }} />
        </section>

        {/* NUEVO */}
        {canCreateTickets && (
          <section className="ticket new-ticket" style={{ marginBottom: 16 }}>
            <div className="section-title" style={{ fontSize: 18, margin: '0 0 10px' }}>Nuevo</div>

            <div style={{ display: 'grid', gap: 10 }}>
              <input className="input" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canCreateTickets} />
              <textarea className="input" placeholder="Descripción (contenido)" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canCreateTickets} />

              <div className="toolbar" style={{ flexWrap:'wrap', gap:10, alignItems:'center' }}>
                

                <select
                  className="input"
                  style={{ width: 180, height: 32, padding: '0 8px', fontSize: 12 }}
                  value={newPriority}
                  onChange={(e) => setNewPriority((e.target.value as TicketPriority) || '')}
                  disabled={!canCreateTickets}
                  aria-label="Prioridad"
                >
                  <option value="" disabled>— Prioridad —</option>
                  {prioOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                {/* Negocio */}
                <select
                  className="input"
                  style={{ width: 200, height: 32, padding: '0 8px', fontSize: 12 }}
                  value={newBusiness}
                  onChange={(e) => setNewBusiness(e.target.value)}
                  disabled={!canCreateTickets}
                  aria-label="Negocio"
                >
                  <option value="">— Negocio —</option>
                  {BUSINESSES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>

                {canManage && (
                  <div className="assignees-wrap">
                    <MultiAssigneePicker options={techOptions} value={newAssignees} onChange={setNewAssignees} disabled={!canCreateTickets} placeholder="Asignar…" />
                  </div>
                )}

                {/* 📅 Vencimiento */}
                <div className="due-field" style={{ position:'relative', width: 210 }}>
                  <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', opacity:.6 }}>📅</span>
                  <input
                    className="input"
                    type="datetime-local"
                    style={{ width: 210, paddingLeft: 34, height: 32, fontSize: 12 }}
                    value={newDue}
                    onChange={(e) => setNewDue(e.target.value)}
                    disabled={!canCreateTickets}
                    aria-label="Vence"
                    min={new Date().toISOString().slice(0,16)}
                    placeholder="— Vencimiento —"
                  />
                </div>

                <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !canCreateTickets} style={{ marginLeft: 'auto', height: 32, padding: '0 12px', fontSize: 12 }}>
                  {loading ? (t('form.creating') ?? 'Creando…') : (t('form.create') ?? 'Crear')}
                </button>
              </div>
            </div>
          </section>
        )}

  {/* FILTROS (solo tarjeta) */}
      {/* FILTROS (pro + minimal) */}
<section className="ticket filter-card" style={{ marginBottom: 16 }}>
  <div className="filters-grid">
    {/* Fila superior: buscador + toggle */}
    <div className="filters-row top">
      <input
        className="input"
        placeholder="Buscar por título, descripción, asignado…"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        style={{ height: 32, fontSize: 12 }}
        aria-label="Buscar"
      />

      <div style={{ display:'flex', gap:8, alignItems:'center', justifyContent:'flex-end' }}>
        <button
          type="button"
          className="btn"
          onClick={() => setAdvancedOpen(v => !v)}
          aria-expanded={advancedOpen}
          aria-controls="advanced-filters"
          style={{ height:36, width:36, padding:0, fontSize:14, display:'inline-flex', alignItems:'center', justifyContent:'center' }}
          title={advancedOpen ? 'Volver a búsqueda básica' : 'Mostrar búsqueda avanzada'}
          aria-label={advancedOpen ? 'Volver a búsqueda básica' : 'Mostrar búsqueda avanzada'}
        >
          <span aria-hidden="true" style={{ display:'inline-flex', width:18, height:18, alignItems:'center', justifyContent:'center' }}>
            {advancedOpen ? '−' : '+'}
          </span>
        </button>
      </div>
    </div>

    {/* Fila inferior: filtros avanzados (colapsable) */}
    {advancedOpen && (
      <div
        id="advanced-filters"
        className="adv-grid"
        role="region"
        aria-label="Filtros avanzados"
      >
        {myRole === 'it' ? (
          <>
            {/* IT: solo selects sin etiquetas: Negocio, Asignado (bloqueado a mí), Vencimiento */}
            <select
              className="input"
              value={businessFilter}
              onChange={(e) => { setPage(1); setBusinessFilter(e.target.value as 'all' | string); }}
              aria-label="Negocio"
              style={{ height: 36, fontSize: 13, color: '#111', background: '#fff' }}
            >
              <option value="all">— Negocio —</option>
              {BUSINESSES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>

            <select
              className="input"
              value={assignedValue}
              onChange={(e) => { setPage(1); setAssignedFilter(e.target.value as 'all' | 'unassigned' | string); }}
              aria-label="Asignado"
              style={{ height: 36, fontSize: 13, color: '#111', background: '#fff' }}
            >
              <option value="all">— Asignado —</option>
              <option value="unassigned">Sin asignar</option>
              {me && <option value={me}>Asignados a mí</option>}
            </select>

            <select
              className="input"
              value={dueFilter}
              onChange={(e) => { setPage(1); setDueFilter(e.target.value as 'all' | 'today' | 'week' | 'overdue'); }}
              aria-label="Vencimiento"
              style={{ height: 36, fontSize: 13, color: '#111', background: '#fff' }}
            >
              <option value="all">— Vencimiento —</option>
              <option value="today">Hoy</option>
              <option value="week">Esta semana</option>
              <option value="overdue">Vencidos</option>
            </select>
          </>
        ) : myRole === 'manager' ? (
          <>
            {/* Manager: sin etiquetas, mostrar Negocio, Asignado y Vencimiento */}
            <select
              className="input"
              value={businessFilter}
              onChange={(e) => { setPage(1); setBusinessFilter(e.target.value as 'all' | string); }}
              aria-label="Negocio"
              style={{ height: 36, fontSize: 13, color: '#111', background: '#fff' }}
            >
              <option value="all">— Negocio —</option>
              {BUSINESSES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>

            <select
              className="input"
              value={assignedValue}
              onChange={(e) => { setPage(1); setAssignedFilter(e.target.value as 'all' | 'unassigned' | string); }}
              aria-label="Asignado"
              style={{ height: 36, fontSize: 13, color: '#111', background: '#fff' }}
            >
              <option value="all">— Asignado —</option>
              <option value="unassigned">Sin asignar</option>
              {me && <option value={me}>Asignados a mí</option>}
              {techs.map(u => <option key={u.id} value={u.id}>{displayName(u)}</option>)}
            </select>

            <select
              className="input"
              value={dueFilter}
              onChange={(e) => { setPage(1); setDueFilter(e.target.value as 'all' | 'today' | 'week' | 'overdue'); }}
              aria-label="Vencimiento"
              style={{ height: 36, fontSize: 13, color: '#111', background: '#fff' }}
            >
              <option value="all">— Vencimiento —</option>
              <option value="today">Hoy</option>
              <option value="week">Esta semana</option>
              <option value="overdue">Vencidos</option>
            </select>
          </>
        ) : (
          <>
            <label className="field">
              <span className="meta">Prioridad</span>
              <select
                className="input"
                value={priorityFilter}
                onChange={(e) => { setPage(1); setPriorityFilter(e.target.value as 'all' | TicketPriority); }}
                aria-label="Prioridad"
                style={{ height: 36, fontSize: 13, color: '#111', background: '#fff' }}
              >
                <option value="all">— Prioridad —</option>
                {prioOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>

            <label className="field">
              <span className="meta">Asignado</span>
              <select
                className="input"
                value={assignedValue}
                onChange={(e) => { setPage(1); setAssignedFilter(e.target.value as 'all' | 'unassigned' | string); }}
                aria-label="Asignado"
                style={{ height: 36, fontSize: 13, color: '#111', background: '#fff' }}
                disabled={myRole === 'technician'}
              >
                <option value="all">— Asignado —</option>
                <option value="unassigned">Sin asignar</option>
                {me && <option value={me}>Asignados a mí</option>}
                {myRole !== 'technician' && techs.map(u => <option key={u.id} value={u.id}>{displayName(u)}</option>)}
              </select>
            </label>

            <label className="field">
              <span className="meta">Vencimiento</span>
              <select
                className="input"
                value={dueFilter}
                onChange={(e) => { setPage(1); setDueFilter(e.target.value as 'all' | 'today' | 'week' | 'overdue'); }}
                aria-label="Vencimiento"
                style={{ height: 36, fontSize: 13, color: '#111', background: '#fff' }}
              >
                <option value="all">— Vencimiento —</option>
                <option value="today">Hoy</option>
                <option value="week">Esta semana</option>
                <option value="overdue">Vencidos</option>
              </select>
            </label>
          </>
        )}

        {/* Acciones: misma línea, a la derecha */}
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={resetFilters}
            style={{ height: 36, width: 36, padding: 0, fontSize: 16 }}
            aria-label="Limpiar filtros"
            title="Limpiar filtros"
          >
            <span aria-hidden="true">🧹</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={exportAllFiltered}
            style={{ height: 36, width: 36, padding: 0, fontSize: 16 }}
            title="Exportar resultados filtrados"
            aria-label="Exportar resultados filtrados"
          >
            <span aria-hidden="true">⬇️</span>
          </button>
        </div>
      </div>
    )}
  </div>
</section>



       {/* LISTADO — Split view (lista | detalle) */}
      {/* Tabs de grupo (Activos/Completados) sobre el listado */}
      {/*<div className="list-topbar" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', margin: '6px 0 8px' }}>
        <div role="tablist" aria-label="Categorías de tickets" style={{ display:'flex', gap:8, background:'#f3f4f6', padding:4, borderRadius:9999 }}>
          {[
            { key:'new' as const, label:'Nuevos',   bg:'#e6f0ff', fg:'#1d4ed8' },
            { key:'pending' as const, label:'Pendientes', bg:'#fff7ed', fg:'#b45309' },
            { key:'overdue' as const, label:'Vencidos', bg:'#fee2e2', fg:'#b91c1c' },
            { key:'completed' as const, label:'Completados', bg:'#dcfce7', fg:'#166534' },
          ].map(tab => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={category===tab.key}
              onClick={() => setCategory(tab.key)}
              style={{
                fontSize: 13,
                padding: '6px 10px',
                borderRadius: 9999,
                background: category===tab.key ? '#fff' : tab.bg,
                color: category===tab.key ? '#111' : tab.fg,
                boxShadow: category===tab.key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: '1px solid rgba(0,0,0,0.04)'
              }}
            >{tab.label}</button>
          ))}
        </div>
      </div>*/}
{/* ===================== SPLIT: LISTA (izq) | DETALLE (der) ===================== */}
<section
  className={`tickets-split ${category === 'completed' ? 'theme-green' : category==='overdue' ? 'theme-red' : category==='pending' ? 'theme-amber' : 'theme-blue'} ${isMobile && selectedId ? 'show-detail' : ''}`}
  aria-label="Listado de tickets con panel de detalle"
>
  {/* ---------- IZQUIERDA: LISTA ---------- */}
  <aside className="tickets-list-pane">
    <div className="tks-list-head">
      <span className="meta">Resultados: {total}</span>
    </div>

  <div className="tks-list" role="listbox" aria-label="Tickets">
      {items.length === 0 && (
        <div className="meta">No hay tickets en esta vista.</div>
      )}

      {items.map((tk) => {
        // Assignees for the chip on the right (IT responsable)
        const assignees = (tk.assignees && tk.assignees.length)
          ? tk.assignees
          : (tk.assigned_to ? [tk.assigned_to] : []);
        const itId = assignees[0] ?? null;
        const itProfile = itId ? techs.find(x => x.id === itId) : undefined;
        const assignedName = itId ? nameOf(itId) : 'Sin asignar';

  // Creator info shown under the title (user/manager who created the ticket)
  const creatorProfile = tk.created_by ? (peopleMap[tk.created_by] || techs.find(x => x.id === tk.created_by)) : undefined;

        const active = selectedId === tk.id;
        const desc = (tk.description ?? '').trim();

        return (
          <button
            key={tk.id}
            type="button"
            role="option"
            aria-selected={active}
            className={`trow ${active ? 'is-active' : ''}`}
            onClick={() => setSelectedId(tk.id)}
            title={tk.title}
          >
            {/* Avatar/Inicial: Creador (user/manager) */}
            <span className="avatar" style={{ width: 28, height: 28, display:'inline-grid', placeItems:'center', borderRadius:9999, overflow:'hidden', background:'#eef2ff' }}>
              {creatorProfile?.avatar_url
                ? <img src={creatorProfile.avatar_url} alt="" />
                : <UserIcon style={{ width: 16, height: 16, opacity: .85 }} />}
            </span>

            <div className="trow-main">
              <div className="trow-title" style={{ display:'flex', alignItems:'center', gap:6 }}>
                {tk.source === 'email' && <MailIcon style={{ width:14, height:14, opacity:.9 }} aria-hidden="true" />}
                <span>{tk.title}</span>
              </div>
              {/* Debajo del título: nombre del creador (user o manager) */}
              <div className="trow-author">{tk.source === 'email' ? ((tk as any).requester_email || (tk as any).raw_from || '—') : (creatorProfile ? (creatorProfile.full_name ?? creatorProfile.id) : '—')}</div>
              {desc && <div className="trow-summary">{desc}</div>}
              <div className="trow-footer">
                <span>{fmt(tk.created_at)}</span>
                {tk.business && <span>{businessLabel(tk.business)}</span>}
              </div>
            </div>

            <div className="trow-badges">
              {/* Última columna: avatar + nombre del IT */}
              <span className="badge badge-assigned with-avatar">
                <span className="avatar" style={{ width: 18, height: 18, display:'inline-grid', placeItems:'center', borderRadius:9999, overflow:'hidden', background:'#eef2ff' }}>
                  {itProfile?.avatar_url
                    ? <img src={itProfile.avatar_url} alt="" />
                    : <UserIcon style={{ width: 11, height: 11, opacity: .85 }} />}
                </span>
                <span className="truncate" style={{ maxWidth: 140 }}>{assignedName}</span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  </aside>

  {/* ---------- DERECHA: DETALLE ---------- */}
  <section ref={detailPaneRef} className="tickets-detail-pane scroll-mt-16" aria-label="Detalle del ticket">
    {isMobile && selectedId && (() => {
      const cat = category; // 'new' | 'pending' | 'overdue' | 'completed'
      const map = {
        new:       { label: 'Nuevos',      bg: '#e7f0ff', fg: '#0b4aa2', border: '#b9d2ff' },
        pending:   { label: 'Pendientes',  bg: '#fff7ed', fg: '#9a3412', border: '#fed7aa' },
        overdue:   { label: 'Vencidos',    bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' },
        completed: { label: 'Completados', bg: '#dcfce7', fg: '#166534', border: '#86efac' },
      } as const;
      const ui = map[cat];
      return (
        <button
          type="button"
          className="btn"
          onClick={() => setSelectedId(null)}
          style={{
            marginBottom: 8,
            width: '100%',
            justifyContent: 'flex-start',
            height: 44,
            fontSize: 16,
            fontWeight: 800,
            background: ui.bg,
            color: ui.fg,
            borderColor: ui.border,
          }}
          aria-label={`Volver a la lista de ${ui.label}`}
          title={`Volver a la lista de ${ui.label}`}
        >
          ← Lista de {ui.label}
        </button>
      );
    })()}

    <div className="tks-detail">
  {/* Corregido: cierre de etiqueta <div> */}
      {renderTicketDetail()}
    </div>
  </section>
</section>



        {/* Paginación */}
        <div className="pager">
          <div className="meta">{(t('pager.showing') ?? 'Mostrando')} {showingFrom}-{showingTo} {(t('pager.of') ?? 'de')} {total}</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="meta">{t('pager.perPage') ?? 'por página'}:</span>
            <select className="input" style={{ width: 90, height: 32, padding: '0 8px', fontSize: 12 }} value={pageSize} onChange={(e) => { setPage(1); setPageSize(parseInt(e.target.value, 10)); }}>
              <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
            </select>
            <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!canPrev} style={{ height: 32, padding: '0 12px', fontSize: 12 }}>‹ {t('pager.prev') ?? 'Anterior'}</button>
            <button className="btn" onClick={() => setPage((p) => p + 1)} disabled={!canNext} style={{ height: 32, padding: '0 12px', fontSize: 12 }}>{t('pager.next') ?? 'Siguiente'} ›</button>
          </div>
        </div>

        {/* Modal de validaciones */}
        <AppModal
          open={dialogOpen}
          title={dialogTitle}
          variant={dialogVariant}
          onClose={closeDialog}
              primary={{ label: 'Guardar', onClick: () => { if (!savingEdit) saveEdit(); } }}
        >
              {dialogTitle === 'Editar ticket' ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    Título
                    <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    Descripción
                    <textarea className="input" rows={4} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={{ flex: 1 }}>
                      Prioridad
                      <select className="input" value={editPriority} onChange={(e) => setEditPriority(e.target.value as TicketPriority)}>
                        <option value="low">Baja</option>
                        <option value="normal">Normal</option>
                        <option value="high">Alta</option>
                      </select>
                    </label>
                    <label style={{ flex: 1 }}>
                      Negocio
                      <select className="input" value={editBusiness} onChange={(e) => setEditBusiness(e.target.value)}>
                        {BUSINESSES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                      </select>
                    </label>
                  </div>

                  <label>
                    Asignados
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {techOptions.map(opt => {
                        const sel = editAssignees.includes(opt.id);
                        return (
                          <label key={opt.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input type="checkbox" checked={sel} onChange={(e) => {
                              const next = e.target.checked ? [...editAssignees, opt.id] : editAssignees.filter(x => x !== opt.id);
                              setEditAssignees(next);
                            }} />
                            <span className="truncate">{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </label>
                </div>
              ) : dialogBody}
        </AppModal>

        {/* CommentsModal */}
        <CommentsModal open={commentsOpen} onClose={() => setCommentsOpen(false)} ticketId={commentsTicket} meId={me} />

        {/* FAB de refresco global (actualiza lista, métricas y comentarios del seleccionado) */}
        <button
          type="button"
          className={`refresh-fab ${refreshing ? 'is-spinning' : ''}`}
          title="Actualizar todo"
          aria-label="Actualizar todo"
          aria-busy={refreshing}
          onClick={doFullRefresh}
        >
          ↻
        </button>
      </div>
      {/* Scoped styles for advanced filters layout */}
      <style jsx>{`
        .adv-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(220px, 1fr)) auto;
          gap: 12px;
          align-items: end;
        }
        .adv-grid .field { display: flex; flex-direction: column; gap: 6px; }
        .adv-grid .meta { font-size: 12px; color: #6b7280; }
        .adv-grid .input {
          padding: 8px 12px;
          border-radius: 12px;
          border: 1px solid #e6eef2;
          background: #fff;
          color: #111;
        }
        .adv-grid .actions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 8px;
          flex-wrap: nowrap;
          margin-top: 4px;
        }
        .adv-grid .actions .btn {
          width: auto;
          display: inline-flex;
          height: 36px;
          padding: 0 12px;
          font-size: 13px;
          border-radius: 12px;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
        .adv-grid .actions .btn.btn-primary { padding: 0 14px; }
        /* Top row: search + toggle aligned */
        .filters-row.top{ display:flex; gap:8px; align-items:center; }
        .filters-row.top > .input{ flex:1 1 auto; }
        .filters-row.top > div{ flex:0 0 auto; }
        @media (max-width: 1024px) {
          .adv-grid { grid-template-columns: repeat(2, minmax(200px, 1fr)) auto; }
        }
        @media (max-width: 680px) {
          .adv-grid { grid-template-columns: 1fr; }
          .adv-grid .actions { justify-content: stretch; flex-wrap: wrap; }
          .adv-grid .actions .btn { flex: 1 1 auto; text-align: center; }
          /* Ensure ticket rows fit mobile width while keeping fixed height */
          .tks-list{ align-items: stretch; }
          .tks-list .trow{ width: 100%; max-width: 100%; height: 115px; }
          /* Keep search and + on the same line in mobile */
          .filters-row.top{ display:flex; gap:8px; }
          .filters-row.top > .input{ min-width: 0; }
          .filters-row.top button.btn{ width:36px; min-width:36px; }
          /* New ticket mobile layout improvements */
          .ticket.new-ticket .toolbar{ display:flex; flex-wrap:wrap; gap:8px; }
          .ticket.new-ticket .toolbar .input{ width:100% !important; height:38px !important; font-size:13px !important; }
          .ticket.new-ticket .toolbar select.input{ padding:0 10px; }
          .ticket.new-ticket .assignees-wrap{ width:100%; }
          .ticket.new-ticket .due-field{ width:100% !important; }
          .ticket.new-ticket .due-field input.input{ width:100% !important; }
          .ticket.new-ticket button.btn.btn-primary{ margin-left:0 !important; width:100%; height:40px !important; }
        }

        /* Acciones flotantes en el ticket */
        .ticket-actions-floating{
          position: absolute;
          right: 14px;
          bottom: 14px;
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .ticket-actions-floating .btn{
          width: auto;
          height: 36px;
          padding: 0 12px;
        }
        /* Botón estilo 'draft' (ámbar) para Editar */
        .btn-draft{
          background: #fef3c7; /* var(--amber-chip-bg) */
          color: #92400e;      /* var(--amber-chip-fg) */
          border-color: #f59e0b;
        }
        .btn-draft:hover{ filter: brightness(0.98); }

        /* FAB de refresco */
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

        /* Themed list item styles for left tickets list */
        .tks-list{ display:flex; flex-direction:column; align-items:center; }
        .tks-list .trow{
          width: 345px;
          height: 115px;
          box-sizing: border-box;
          text-align: left;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 12px;
          padding: 10px 12px;
          display: grid;
          grid-template-columns: 32px 1fr auto; /* más espacio para avatar del creador */
          align-items: center;
          gap: 12px; /* separación mayor entre avatar y texto */
          margin: 6px 4px;
          transition: background .15s ease, border-color .15s ease;
          overflow: hidden;
        }
        .tks-list .trow .trow-title{ font-weight: 700; font-size: 14px; }
  .tks-list .trow .trow-meta{ color: #6b7280; display:flex; gap:10px; font-size: 12px; }
  .tks-list .trow .trow-author{ color:#6b7280; font-size:12px; margin-top:2px; }
  .tks-list .trow .trow-summary{ color:#6b7280; font-size:12px; margin-top:4px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis; }
  .tks-list .trow .trow-footer{ color:#6b7280; font-size:12px; display:flex; gap:10px; margin-top:6px; }
  .tks-list .trow .badge-assigned{ background:#eef2f6; color:#111827; border-color:#e5e7eb; }
  .tks-list .trow .badge-assigned.with-avatar{ display:inline-flex; align-items:center; gap:6px; }
  .tks-list .trow .badge-assigned.with-avatar .avatar{ display:inline-grid; place-items:center; border-radius:9999px; background:#f1f5f9; font-weight:700; font-size:11px; width:18px; height:18px; overflow:hidden; }
  .tks-list .trow .badge-assigned.with-avatar .avatar img{ width:100%; height:100%; object-fit:cover; }

  /* Blue theme (Nuevos) */
        .tickets-split.theme-blue .trow:hover{ background: #e7f0ff; }
        .tickets-split.theme-blue .trow.is-active{ background: #e7f0ff; border-color: rgba(147,197,253,.66); }
  .tickets-split.theme-blue .cat-chip{ background:#e7f0ff; color:#0b4aa2; border-color:#b9d2ff; }

  /* Amber theme (Pendientes) */
        .tickets-split.theme-amber .trow:hover{ background: #fff7ed; }
        .tickets-split.theme-amber .trow.is-active{ background: #fff7ed; border-color: rgba(245,158,11,.45); }
  .tickets-split.theme-amber .cat-chip{ background:#fff7ed; color:#9a3412; border-color:#fed7aa; }

  /* Red theme (Vencidos) */
        .tickets-split.theme-red .trow:hover{ background: #fee2e2; }
        .tickets-split.theme-red .trow.is-active{ background: #fee2e2; border-color: rgba(239,68,68,.45); }
  .tickets-split.theme-red .cat-chip{ background:#fee2e2; color:#991b1b; border-color:#fecaca; }

  /* Green theme (Completados) */
        .tickets-split.theme-green .trow:hover{ background: #dcfce7; }
        .tickets-split.theme-green .trow.is-active{ background: #dcfce7; border-color: rgba(134,239,172,.55); }
  .tickets-split.theme-green .cat-chip{ background:#dcfce7; color:#166534; border-color:#86efac; }
      `}</style>
    </>
  );
}

/* ---------- Métrica simple ---------- */
function StatCard({ label, value, variant, trendPct, onClick }: { label: string; value: number | string; variant: 'completed'|'active'|'pending'|'overdue'; trendPct?: number; onClick?: () => void }) {
  const Icon = () => {
    const common = { width: 22, height: 22 } as const;
    switch (variant) {
      case 'active': // plus
        return (
          <svg {...common} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 5a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H6a1 1 0 1 1 0-2h5V6a1 1 0 0 1 1-1z"/></svg>
        );
      case 'pending': // calendar/clock
        return (
          <svg {...common} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 2a1 1 0 1 1 2 0v1h6V2a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v4H2V5a2 2 0 0 1 2-2h1V2a1 1 0 1 1 2 0v1zM2 10h20v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9zm12.5 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm-.5 2a1 1 0 0 1 1 1v1.382l1.447.724a1 1 0 1 1-.894 1.788l-2-1A1 1 0 0 1 13 18v-2a1 1 0 0 1 1-1z"/></svg>
        );
      case 'completed': // check
        return (
          <svg {...common} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.707 13.293 18 5l1.414 1.414-9.707 9.707L4.879 11l1.414-1.414 3.414 3.707z"/></svg>
        );
      case 'overdue': // alert
        return (
          <svg {...common} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v7h-2V7h2zm-1 10a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg>
        );
    }
  };

  const trendLabel = (() => {
    if (trendPct === undefined || trendPct === null) return null;
    const sign = trendPct > 0 ? '+' : '';
    // Color semantics per variant
    let cls = 'trend neutral';
    if (variant === 'completed') cls = trendPct >= 0 ? 'trend good' : 'trend bad';
    else if (variant === 'overdue') cls = trendPct >= 0 ? 'trend bad' : 'trend good';
    else if (variant === 'pending') cls = 'trend warn'; // keep amber tone as requested
    else cls = trendPct >= 0 ? 'trend good' : 'trend bad';
    return <div className={cls}>{`${sign}${trendPct}% esta semana`}</div>;
  })();

  return (
    <div
      className={`stat-card stat--${variant}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div className="stat-top">
        <div className="stat-label">{label}</div>
        <span className="stat-icon" aria-hidden="true"><Icon /></span>
      </div>
      <div className="stat-value">{value ?? 0}</div>
      {trendLabel}
    </div>
  );
}
