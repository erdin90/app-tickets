// src/lib/tickets.ts
import { supabase } from '@/lib/supabase';
import type { TicketStatus } from '@/lib/status';
import type { TicketPriority } from '@/lib/priority';

export type Ticket = {
  id: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  created_by?: string | null;
  assigned_to: string | null;
  assignees?: string[];
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  business?: string | null;

  // 👇 nuevos metadatos de comentarios
  comments_count?: number;
  last_comment_at?: string | null;

  // 👇 campos opcionales para clasificación exacta
  seen_by_assignee_at?: string | null;
  pending_since_at?: string | null;
  category?: 'new' | 'pending' | 'overdue' | 'completed';
};

type ListParams = {
  group?: 'active' | 'completed';
  priority?: TicketPriority;
  assignedTo?: string;
  business?: string;
  due?: 'all' | 'today' | 'week' | 'overdue';
  q?: string;
  page?: number;
  pageSize?: number;
  createdBy?: string; // limit to tickets created by this user (end-user dashboard)
};

/* --- util de vencimiento --- */
type FilterQuery = {
  neq: (column: string, value: string) => FilterQuery;
  lt: (column: string, value: string) => FilterQuery;
  gte: (column: string, value: string) => FilterQuery;
  lte: (column: string, value: string) => FilterQuery;
};

function applyDueFilter<T extends FilterQuery>(query: T, due?: 'all' | 'today' | 'week' | 'overdue'): T {
  if (!due || due === 'all') return query;
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999);
  if (due === 'overdue') {
    query = query.neq('status', 'completed').lt('due_date', todayStart.toISOString()) as T;
  } else if (due === 'today') {
    query = query.gte('due_date', todayStart.toISOString()).lte('due_date', todayEnd.toISOString()) as T;
  } else if (due === 'week') {
    const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
    query = query.gte('due_date', todayStart.toISOString()).lte('due_date', weekEnd.toISOString()) as T;
  }
  return query;
}

export async function listTickets(params: ListParams) {
  const { group, priority, assignedTo, business, due='all', q, page=1, pageSize=10, createdBy } = params ?? {};

  let query = supabase.from('tickets').select('*', { count: 'exact' });

  if (group === 'completed') query = query.eq('status', 'completed');
  if (group === 'active')    query = query.neq('status', 'completed');
  if (priority)              query = query.eq('priority', priority);
  if (business)              query = query.eq('business', business);
  if (createdBy)             query = query.eq('created_by', createdBy);

  query = applyDueFilter(query, due);

  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    query = query.or(`title.ilike.${like},description.ilike.${like}`);
  }

  // filtro por asignado (si viene), pero hacemos el filtro final en cliente
  // porque usamos multi-asignación desde una tabla aparte
  let doClientFilterByUser = false;
  let assignedUserId: string | null = null;
  if (assignedTo === 'unassigned') {
    query = query.is('assigned_to', null);
  } else if (assignedTo && assignedTo !== 'all') {
    doClientFilterByUser = true;
    assignedUserId = assignedTo;
  }

  const useClientPagination = doClientFilterByUser;
  const from = useClientPagination ? 0 : (page - 1) * pageSize;
  const to   = useClientPagination ? 999 : from + pageSize - 1;

  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data: baseTickets, error, count } = await query;
  if (error) return { data: [] as Ticket[], error, count: 0 };

  const tickets = (baseTickets as Ticket[]) ?? [];
  if (tickets.length === 0) return { data: [], error: null, count: 0 };

  // ---- multi-asignados
  const ids = tickets.map(t => t.id);
  let links: Array<{ ticket_id: string; user_id: string }> | null = null;
  try {
    const { data: ldata, error: lerr } = await supabase
      .from('ticket_assignees')
      .select('ticket_id,user_id')
      .in('ticket_id', ids);
    if (!lerr) links = (ldata as Array<{ ticket_id: string; user_id: string }> | null) ?? null;
  } catch (_) {
    links = null;
  }

  if (links && links.length) {
    const map = new Map<string, string[]>();
    links.forEach(r => {
      const arr = map.get(r.ticket_id) ?? [];
      arr.push(r.user_id);
      map.set(r.ticket_id, arr);
    });
    tickets.forEach(t => { t.assignees = map.get(t.id) ?? (t.assigned_to ? [t.assigned_to] : []); });
  } else {
    tickets.forEach(t => { t.assignees = t.assigned_to ? [t.assigned_to] : []; });
  }

  // ---- metadatos de comentarios (conteo + última fecha) por ticket
  // Usa agregaciones PostgREST: count:id, max:created_at y group(ticket_id)
  // ---- metadatos de comentarios (conteo + última fecha) por ticket
// NOTA: supabase-js v2 no tiene .group(); traemos filas y agregamos en JS.
const { data: crows, error: cErr } = await supabase
  .from('ticket_comments')
  .select('ticket_id, created_at')
  .in('ticket_id', ids);

if (!cErr && crows?.length) {
  const cmap = new Map<string, { count: number; max: string | null }>();
  for (const r of crows as { ticket_id: string; created_at: string }[]) {
    const prev = cmap.get(r.ticket_id) ?? { count: 0, max: null as string | null };
    const nextCount = prev.count + 1;
    const nextMax =
      !prev.max || new Date(r.created_at) > new Date(prev.max) ? r.created_at : prev.max;
    cmap.set(r.ticket_id, { count: nextCount, max: nextMax });
  }
  tickets.forEach(t => {
    const meta = cmap.get(t.id);
    t.comments_count = meta?.count ?? 0;
    t.last_comment_at = meta?.max ?? null;
  });
} else {
  tickets.forEach(t => { t.comments_count = 0; t.last_comment_at = null; });
}

  // ---- filtro final por usuario (si corresponde)
  let finalTickets = tickets;
  if (doClientFilterByUser && assignedUserId) {
    finalTickets = tickets.filter(t =>
      t.assigned_to === assignedUserId || (t.assignees ?? []).includes(assignedUserId)
    );
  }

  const finalCount = doClientFilterByUser ? finalTickets.length : (count ?? finalTickets.length);
  const finalPageSlice = useClientPagination
    ? finalTickets.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
    : finalTickets;

  return { data: finalPageSlice, error: null, count: finalCount };
}

// Variante: lista desde la vista tickets_with_meta para obtener `category`
export async function listTicketsMeta(params: ListParams) {
  const { group, priority, assignedTo, business, due='all', q, page=1, pageSize=10, createdBy } = params ?? {};

  let query = supabase.from('tickets_with_meta').select('*', { count: 'exact' });

  if (group === 'completed') query = query.eq('category', 'completed');
  if (group === 'active')    query = query.neq('category', 'completed');
  if (priority)              query = query.eq('priority', priority);
  if (business)              query = query.eq('business', business);
  if (createdBy)             query = query.eq('created_by', createdBy);

  query = applyDueFilter(query as unknown as FilterQuery, due) as any;

  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    query = query.or(`title.ilike.${like},description.ilike.${like}`);
  }

  // Filtro por asignado (igual que arriba)
  let doClientFilterByUser = false;
  let assignedUserId: string | null = null;
  if (assignedTo === 'unassigned') {
    query = query.is('assigned_to', null);
  } else if (assignedTo && assignedTo !== 'all') {
    doClientFilterByUser = true;
    assignedUserId = assignedTo;
  }

  const useClientPagination = doClientFilterByUser;
  const from = useClientPagination ? 0 : (page - 1) * pageSize;
  const to   = useClientPagination ? 999 : from + pageSize - 1;

  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data: baseTickets, error, count } = await query;
  if (error) return { data: [] as Ticket[], error, count: 0 };

  const tickets = (baseTickets as Ticket[]) ?? [];
  if (tickets.length === 0) return { data: [], error: null, count: 0 };

  // ---- multi-asignados
  const ids = tickets.map(t => t.id);
  let links: Array<{ ticket_id: string; user_id: string }> | null = null;
  try {
    const { data: ldata, error: lerr } = await supabase
      .from('ticket_assignees')
      .select('ticket_id,user_id')
      .in('ticket_id', ids);
    if (!lerr) links = (ldata as Array<{ ticket_id: string; user_id: string }> | null) ?? null;
  } catch (_) {
    links = null;
  }

  if (links && links.length) {
    const map = new Map<string, string[]>();
    links.forEach(r => {
      const arr = map.get(r.ticket_id) ?? [];
      arr.push(r.user_id);
      map.set(r.ticket_id, arr);
    });
    tickets.forEach(t => { t.assignees = map.get(t.id) ?? (t.assigned_to ? [t.assigned_to] : []); });
  } else {
    tickets.forEach(t => { t.assignees = t.assigned_to ? [t.assigned_to] : []; });
  }

  // ---- metadatos de comentarios
  const { data: crows, error: cErr } = await supabase
    .from('ticket_comments')
    .select('ticket_id, created_at')
    .in('ticket_id', ids);

  if (!cErr && crows?.length) {
    const cmap = new Map<string, { count: number; max: string | null }>();
    for (const r of crows as { ticket_id: string; created_at: string }[]) {
      const prev = cmap.get(r.ticket_id) ?? { count: 0, max: null as string | null };
      const nextCount = prev.count + 1;
      const nextMax = !prev.max || new Date(r.created_at) > new Date(prev.max) ? r.created_at : prev.max;
      cmap.set(r.ticket_id, { count: nextCount, max: nextMax });
    }
    tickets.forEach(t => {
      const meta = cmap.get(t.id);
      t.comments_count = meta?.count ?? 0;
      t.last_comment_at = meta?.max ?? null;
    });
  } else {
    tickets.forEach(t => { t.comments_count = 0; t.last_comment_at = null; });
  }

  // ---- filtro final por usuario (si corresponde)
  let finalTickets = tickets;
  if (doClientFilterByUser && assignedUserId) {
    finalTickets = tickets.filter(t =>
      t.assigned_to === assignedUserId || (t.assignees ?? []).includes(assignedUserId)
    );
  }

  const finalCount = doClientFilterByUser ? finalTickets.length : (count ?? finalTickets.length);
  const finalPageSlice = useClientPagination
    ? finalTickets.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
    : finalTickets;

  return { data: finalPageSlice, error: null, count: finalCount };
}

/** Cuenta por categoría usando la vista `tickets_with_meta`.
 * Retorna { new, pending, overdue, completed }
 */
export async function countTicketsByCategory(params?: { assignedTo?: string; business?: string; priority?: TicketPriority; createdBy?: string }) {
  const { assignedTo, business, priority, createdBy } = params ?? {};
  // If createdBy provided, count categories for tickets created by that user
  if (createdBy) {
    function base() {
      let q = supabase.from('tickets_with_meta').select('id', { count: 'exact', head: true }).eq('created_by', createdBy);
      if (business) q = q.eq('business', business);
      if (priority) q = q.eq('priority', priority);
      return q;
    }
    const queries = [
      base().eq('category', 'new'),
      base().eq('category', 'pending'),
      base().eq('category', 'overdue'),
      base().eq('category', 'completed'),
    ];
    const [qNew, qPending, qOverdue, qCompleted] = await Promise.all(queries);
    return {
      new: qNew.count ?? 0,
      pending: qPending.count ?? 0,
      overdue: qOverdue.count ?? 0,
      completed: qCompleted.count ?? 0,
    };
  }
  // Si assignedTo indica un usuario específico, obtener IDs de tickets primarios y multi-asignados
  if (assignedTo && assignedTo !== 'unassigned') {
    // 1) IDs con assigned_to = user
    const { data: primary } = await supabase
      .from('tickets')
      .select('id')
      .eq('assigned_to', assignedTo)
      .limit(2000);

    // 2) IDs desde tabla de multi-asignación
    let links: Array<{ ticket_id: string }> | null = null;
    try {
      const { data: ldata, error: lerr } = await supabase
        .from('ticket_assignees')
        .select('ticket_id')
        .eq('user_id', assignedTo)
        .limit(4000);
      if (!lerr) links = (ldata as Array<{ ticket_id: string }> | null) ?? null;
    } catch (_) {
      links = null;
    }

    const idSet = new Set<string>();
    (primary as Array<{ id: string }> ?? []).forEach(r => idSet.add(r.id));
    (links as Array<{ ticket_id: string }> ?? []).forEach(r => idSet.add(r.ticket_id));
    const ids = Array.from(idSet);
    if (ids.length === 0) {
      return { new: 0, pending: 0, overdue: 0, completed: 0 };
    }

    async function countFor(cat: 'new'|'pending'|'overdue'|'completed') {
      let q = supabase.from('tickets_with_meta').select('id', { count: 'exact', head: true })
        .eq('category', cat)
        .in('id', ids);
      if (business) q = q.eq('business', business);
      if (priority) q = q.eq('priority', priority);
      const { count } = await q;
      return count ?? 0;
    }

    const [cNew, cPending, cOverdue, cCompleted] = await Promise.all([
      countFor('new'),
      countFor('pending'),
      countFor('overdue'),
      countFor('completed'),
    ]);
    return { new: cNew, pending: cPending, overdue: cOverdue, completed: cCompleted };
  }

  // Ruta global/unassigned: conteos directos con filtros simples
  function base() {
    let q = supabase.from('tickets_with_meta').select('id', { count: 'exact', head: true });
    if (business) q = q.eq('business', business);
    if (priority) q = q.eq('priority', priority);
    if (assignedTo === 'unassigned') q = q.is('assigned_to', null);
    return q;
  }
  const queries = [
    base().eq('category', 'new'),
    base().eq('category', 'pending'),
    base().eq('category', 'overdue'),
    base().eq('category', 'completed'),
  ];
  const [qNew, qPending, qOverdue, qCompleted] = await Promise.all(queries);
  return {
    new: qNew.count ?? 0,
    pending: qPending.count ?? 0,
    overdue: qOverdue.count ?? 0,
    completed: qCompleted.count ?? 0,
  };
}

export async function getTicket(id: string) {
  const { data, error } = await supabase.from('tickets').select('*').eq('id', id).single();
  return { data: data as Ticket | null, error };
}

export async function createTicket(input: {
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to?: string | null;
  assignees?: string[];
  due_date?: string | null;
  business?: string | null;
}) {
  const { data, error } = await supabase
    .from('tickets')
    .insert({
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assigned_to: input.assignees?.[0] ?? input.assigned_to ?? null,
      due_date: input.due_date ?? null,
      business: input.business ?? null,
    })
    .select('id')
    .single();

  if (error) return { error };

  if (input.assignees?.length) {
    const rows = input.assignees.map(uid => ({ ticket_id: data!.id, user_id: uid }));
    const { error: e2 } = await supabase.from('ticket_assignees').insert(rows);
    if (e2) return { error: e2 };
  }
  return { data, error: null };
}

// Creador seguro que intenta usar una RPC SECURITY DEFINER para evitar bucles de RLS
export async function createTicketSafe(input: {
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to?: string | null;
  assignees?: string[];
  due_date?: string | null;
  business?: string | null;
}) {
  // Try server API first (uses service role with permission checks)
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          assigned_to: input.assignees?.[0] ?? input.assigned_to ?? null,
          assignees: input.assignees ?? [],
          due_date: input.due_date ?? null,
          business: input.business ?? null,
        }),
      });
      if (res.ok) {
        const j = await res.json().catch(() => ({}));
        return { data: j ?? null, error: null } as any;
      }
      // If server denies and not auth-related, fall through to RPC path to surface error details
    }
  } catch (_) {
    // ignore and fallback
  }

  try {
    const { data, error } = await supabase.rpc('create_ticket_secure', {
      p_title: input.title,
      p_description: input.description,
      p_status: input.status,
      p_priority: input.priority,
      p_assigned_to: input.assignees?.[0] ?? input.assigned_to ?? null,
      p_assignees: input.assignees ?? [],
      p_due_date: input.due_date ?? null,
      p_business: input.business ?? null,
    });
    if (!error) return { data, error: null };
    const msg = String(error.message || '');
    const missing = /does not exist|Could not find the function|schema cache|42883/i.test(msg);
    if (!missing) return { error } as any;
  } catch (_) {
    // ignore and fallback
  }
  return createTicket(input);
}

export async function updateTicketStatus(id: string, next: TicketStatus) {
  return supabase.from('tickets')
    .update({ status: next, completed_at: next === 'completed' ? new Date().toISOString() : null })
    .eq('id', id);
}

// Intenta usar una función RPC con SECURITY DEFINER para evitar problemas de RLS.
// Si no existe, hace fallback al update directo.
export async function updateTicketStatusSafe(id: string, next: TicketStatus) {
  try {
    const { error } = await supabase.rpc('update_ticket_status_secure', { p_ticket_id: id, p_next: next });
    if (!error) return { error: null };
    // Si la RPC no existe o no está en caché, haremos fallback al update directo
    const msg = String(error?.message ?? '');
    const looksMissing = /does not exist/i.test(msg) || /Could not find the function/i.test(msg) || /schema cache/i.test(msg) || (error as any)?.code === '42883';
    if (!looksMissing) {
      return { error };
    }
  } catch (e) {
    // Ignorar: puede ser que la RPC no exista
  }
  // Fallback al método estándar
  return updateTicketStatus(id, next);
}

// Marca un ticket como "visto" por el asignado (o por quien lo abre),
// usando una RPC si existe; si no, actualiza la columna seen_by_assignee_at.
export async function markTicketSeenSafe(id: string) {
  try {
    const { error } = await supabase.rpc('mark_ticket_seen', { p_ticket_id: id });
    if (!error) return { error: null };
    const msg = String(error?.message ?? '');
    const looksMissing = /does not exist/i.test(msg) || /Could not find the function/i.test(msg) || /schema cache/i.test(msg) || (error as any)?.code === '42883';
    if (!looksMissing) return { error };
  } catch (_) {
    // ignore
  }
  const { error } = await supabase
    .from('tickets')
    .update({ seen_by_assignee_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
}

export async function updateTicketPriority(id: string, next: TicketPriority) {
  return supabase.from('tickets').update({ priority: next }).eq('id', id);
}

export async function updateTicketAssignee(id: string, userId: string | null) {
  return supabase.from('tickets').update({ assigned_to: userId }).eq('id', id);
}

export async function updateTicketAssignees(ticketId: string, userIds: string[]) {
  // 1) Actualizar columna primaria assigned_to para que usuarios finales (con RLS sobre ticket_assignees) puedan ver el asignado
  const primary = userIds?.[0] ?? null;
  const { error: updErr } = await supabase.from('tickets').update({ assigned_to: primary }).eq('id', ticketId);
  if (updErr) return { error: updErr };

  // 2) Reescribir la tabla de multi-asignación
  const { error: delErr } = await supabase.from('ticket_assignees').delete().eq('ticket_id', ticketId);
  if (delErr) return { error: delErr };
  if (!userIds?.length) return { data: null, error: null };
  const rows = userIds.map(uid => ({ ticket_id: ticketId, user_id: uid }));
  const { error: insErr } = await supabase.from('ticket_assignees').insert(rows);
  return { data: null, error: insErr ?? null };
}

/* actualizar negocio */
export async function updateTicketBusiness(id: string, business: string | null) {
  const { error } = await supabase.from('tickets').update({ business }).eq('id', id);
  return { error };
}

export async function updateTicketInfo(
  id: string,
  payload: { title?: string; description?: string | null; due_date?: string | null; business?: string | null }
) {
  const clean: Partial<{ title: string; description: string | null; due_date: string | null; business: string | null }> = {};
  if (payload.title !== undefined) clean.title = payload.title;
  if (payload.description !== undefined) clean.description = payload.description;
  if (payload.due_date !== undefined) clean.due_date = payload.due_date;
  if (payload.business !== undefined) clean.business = payload.business;
  const { error } = await supabase.from('tickets').update(clean).eq('id', id);
  return { error };
}

/* realtime: ahora incluye comments */
export function subscribeTickets(cb: () => void) {
  const ch = supabase
    .channel('tickets_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => cb())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_assignees' }, () => cb())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_comments' }, () => cb())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
