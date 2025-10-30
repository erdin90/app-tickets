// src/lib/reports.ts
import { supabase } from '@/lib/supabase';
import { businessLabel } from '@/lib/businesses';

export type ReportFilters = {
  from?: string; // ISO date
  to?: string;   // ISO date
  status?: 'all' | 'open' | 'overdue' | 'completed';
  priority?: 'low' | 'normal' | 'high' | 'all';
  technician?: string | 'all' | 'unassigned';
  business?: string | 'all';
};

export type ReportSummary = { total: number; open: number; overdue: number; closed: number };

function startOfUtcMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

export async function getSummary(filters?: ReportFilters): Promise<ReportSummary> {
  // Total
  let totalQ = supabase.from('tickets').select('id', { count: 'exact', head: true });
  if (filters?.from) totalQ = totalQ.gte('created_at', filters.from);
  if (filters?.to) totalQ = totalQ.lte('created_at', filters.to);
  if (filters?.priority && filters.priority !== 'all') totalQ = totalQ.eq('priority', filters.priority);
  if (filters?.business && filters.business !== 'all') totalQ = totalQ.eq('business', filters.business);
  if (filters?.technician && filters.technician !== 'all') {
    totalQ = filters.technician === 'unassigned' ? totalQ.is('assigned_to', null) : totalQ.eq('assigned_to', filters.technician);
  }

  // Closed
  let closedQ = supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('status', 'completed');
  if (filters?.from) closedQ = closedQ.gte('created_at', filters.from);
  if (filters?.to) closedQ = closedQ.lte('created_at', filters.to);
  if (filters?.priority && filters.priority !== 'all') closedQ = closedQ.eq('priority', filters.priority);
  if (filters?.business && filters.business !== 'all') closedQ = closedQ.eq('business', filters.business);
  if (filters?.technician && filters.technician !== 'all') {
    closedQ = filters.technician === 'unassigned' ? closedQ.is('assigned_to', null) : closedQ.eq('assigned_to', filters.technician);
  }

  // Open
  let openQ = supabase.from('tickets').select('id', { count: 'exact', head: true }).neq('status', 'completed');
  if (filters?.from) openQ = openQ.gte('created_at', filters.from);
  if (filters?.to) openQ = openQ.lte('created_at', filters.to);
  if (filters?.priority && filters.priority !== 'all') openQ = openQ.eq('priority', filters.priority);
  if (filters?.business && filters.business !== 'all') openQ = openQ.eq('business', filters.business);
  if (filters?.technician && filters.technician !== 'all') {
    openQ = filters.technician === 'unassigned' ? openQ.is('assigned_to', null) : openQ.eq('assigned_to', filters.technician);
  }

  // Overdue
  let overdueQ = supabase.from('tickets').select('id', { count: 'exact', head: true }).neq('status', 'completed').lt('due_date', new Date().toISOString());
  if (filters?.from) overdueQ = overdueQ.gte('created_at', filters.from);
  if (filters?.to) overdueQ = overdueQ.lte('created_at', filters.to);
  if (filters?.priority && filters.priority !== 'all') overdueQ = overdueQ.eq('priority', filters.priority);
  if (filters?.business && filters.business !== 'all') overdueQ = overdueQ.eq('business', filters.business);
  if (filters?.technician && filters.technician !== 'all') {
    overdueQ = filters.technician === 'unassigned' ? overdueQ.is('assigned_to', null) : overdueQ.eq('assigned_to', filters.technician);
  }

  const [{ count: total }, { count: closed }, { count: open }, { count: overdue }] = await Promise.all([totalQ, closedQ, openQ, overdueQ]);

  return {
    total: total ?? 0,
    open: open ?? 0,
    overdue: overdue ?? 0,
    closed: closed ?? 0,
  };
}

/** Tickets creados por mes (últimos N meses) */
export async function getTicketsByMonth(months = 12, filters?: ReportFilters): Promise<{ labels: string[]; data: number[] }> {
  const to = new Date();
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (months - 1), 1));
  let q = supabase.from('tickets').select('created_at').gte('created_at', from.toISOString());
  if (filters?.priority && filters.priority !== 'all') q = q.eq('priority', filters.priority);
  if (filters?.business && filters.business !== 'all') q = q.eq('business', filters.business);
  if (filters?.technician && filters.technician !== 'all') q = filters.technician === 'unassigned' ? q.is('assigned_to', null) : q.eq('assigned_to', filters.technician);
  if (filters?.status === 'completed') q = q.eq('status', 'completed');
  if (filters?.status === 'open') q = q.neq('status', 'completed');
  if (filters?.status === 'overdue') q = q.neq('status', 'completed').lt('due_date', new Date().toISOString());
  const { data, error } = await q;
  if (error) throw error;

  // Inicializar buckets
  const buckets: Record<string, number> = {};
  const cursor = new Date(from);
  for (let i = 0; i < months; i++) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
    buckets[key] = 0;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  (data ?? []).forEach((r: { created_at: string }) => {
    const d = new Date(r.created_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (key in buckets) buckets[key] += 1;
  });

  const keys = Object.keys(buckets);
  const labels = keys.map((k) => {
    const [y, m] = k.split('-');
    const dd = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
    return dd.toLocaleString('es-ES', { month: 'short' });
  });
  const dataArr = keys.map((k) => buckets[k]);
  return { labels, data: dataArr };
}

/** Tickets por área (business) en los últimos N meses */
export async function getTicketsByBusiness(months = 12, filters?: ReportFilters): Promise<{ labels: string[]; data: number[] }> {
  const to = new Date();
  const from = startOfUtcMonth(new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (months - 1), 1)));
  let q = supabase.from('tickets').select('business, created_at').gte('created_at', from.toISOString());
  if (filters?.priority && filters.priority !== 'all') q = q.eq('priority', filters.priority);
  if (filters?.technician && filters.technician !== 'all') q = filters.technician === 'unassigned' ? q.is('assigned_to', null) : q.eq('assigned_to', filters.technician);
  if (filters?.status === 'completed') q = q.eq('status', 'completed');
  if (filters?.status === 'open') q = q.neq('status', 'completed');
  if (filters?.status === 'overdue') q = q.neq('status', 'completed').lt('due_date', new Date().toISOString());
  if (filters?.business && filters.business !== 'all') q = q.eq('business', filters.business);
  const { data, error } = await q;
  if (error) throw error;

  const map = new Map<string, number>();
  (data ?? []).forEach((r: { business: string | null }) => {
    const key = r.business ?? '—';
    map.set(key, (map.get(key) ?? 0) + 1);
  });

  // Ordenar por frecuencia desc, limitar a negocios conocidos primero
  const orderedKeys = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const labels = orderedKeys.map((k) => businessLabel(k));
  const values = orderedKeys.map((k) => map.get(k) ?? 0);
  return { labels, data: values };
}

/** Tickets por prioridad en los últimos N meses */
export async function getTicketsByPriority(months = 12, filters?: ReportFilters): Promise<{ labels: string[]; data: number[] }> {
  const to = new Date();
  const from = startOfUtcMonth(new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (months - 1), 1)));
  let q = supabase.from('tickets').select('priority, created_at').gte('created_at', from.toISOString());
  if (filters?.priority && filters.priority !== 'all') q = q.eq('priority', filters.priority);
  if (filters?.business && filters.business !== 'all') q = q.eq('business', filters.business);
  if (filters?.technician && filters.technician !== 'all') q = filters.technician === 'unassigned' ? q.is('assigned_to', null) : q.eq('assigned_to', filters.technician);
  if (filters?.status === 'completed') q = q.eq('status', 'completed');
  if (filters?.status === 'open') q = q.neq('status', 'completed');
  if (filters?.status === 'overdue') q = q.neq('status', 'completed').lt('due_date', new Date().toISOString());
  const { data, error } = await q;
  if (error) throw error;

  const order: Array<'low' | 'normal' | 'high' | '—'> = ['low', 'normal', 'high', '—'];
  const map = new Map<string, number>();
  (data ?? []).forEach((r: { priority: 'low' | 'normal' | 'high' | null }) => {
    const key = r.priority ?? '—';
    map.set(key, (map.get(key) ?? 0) + 1);
  });
  const keys = order.filter((k) => map.has(k));
  const labels = keys.map((k) => (k === 'low' ? 'Baja' : k === 'normal' ? 'Normal' : k === 'high' ? 'Alta' : '—'));
  const values = keys.map((k) => map.get(k) ?? 0);
  return { labels, data: values };
}

/** Serie apilada por mes: creados vs cerrados (últimos N meses) */
export async function getStackedByMonth(months = 12, filters?: ReportFilters): Promise<{ labels: string[]; created: number[]; closed: number[] }> {
  const to = new Date();
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (months - 1), 1));
  // Creados
  let qCreated = supabase.from('tickets').select('created_at').gte('created_at', from.toISOString());
  if (filters?.priority && filters.priority !== 'all') qCreated = qCreated.eq('priority', filters.priority);
  if (filters?.business && filters.business !== 'all') qCreated = qCreated.eq('business', filters.business);
  if (filters?.technician && filters.technician !== 'all') qCreated = filters.technician === 'unassigned' ? qCreated.is('assigned_to', null) : qCreated.eq('assigned_to', filters.technician);
  if (filters?.status === 'completed') qCreated = qCreated.eq('status', 'completed');
  if (filters?.status === 'open') qCreated = qCreated.neq('status', 'completed');
  if (filters?.status === 'overdue') qCreated = qCreated.neq('status', 'completed').lt('due_date', new Date().toISOString());
  const { data: dCreated, error: e1 } = await qCreated;
  if (e1) throw e1;
  // Cerrados
  let qClosed = supabase.from('tickets').select('completed_at').eq('status', 'completed').gte('completed_at', from.toISOString());
  if (filters?.priority && filters.priority !== 'all') qClosed = qClosed.eq('priority', filters.priority);
  if (filters?.business && filters.business !== 'all') qClosed = qClosed.eq('business', filters.business);
  if (filters?.technician && filters.technician !== 'all') qClosed = filters.technician === 'unassigned' ? qClosed.is('assigned_to', null) : qClosed.eq('assigned_to', filters.technician);
  const { data: dClosed, error: e2 } = await qClosed;
  if (e2) throw e2;

  // Prepara buckets
  const bucketsCreated: Record<string, number> = {};
  const bucketsClosed: Record<string, number> = {};
  const cursor = new Date(from);
  for (let i = 0; i < months; i++) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
    bucketsCreated[key] = 0;
    bucketsClosed[key] = 0;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  (dCreated ?? []).forEach((r: { created_at: string }) => {
    const d = new Date(r.created_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (key in bucketsCreated) bucketsCreated[key] += 1;
  });
  (dClosed ?? []).forEach((r: { completed_at: string | null }) => {
    if (!r.completed_at) return;
    const d = new Date(r.completed_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (key in bucketsClosed) bucketsClosed[key] += 1;
  });

  const keys = Object.keys(bucketsCreated);
  const labels = keys.map((k) => {
    const [y, m] = k.split('-');
    const dd = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
    return dd.toLocaleString('es-ES', { month: 'short' });
  });
  const created = keys.map((k) => bucketsCreated[k]);
  const closed = keys.map((k) => bucketsClosed[k]);
  return { labels, created, closed };
}

/** Dataset crudo para exportaciones según filtros */
export async function getTicketsRaw(filters?: ReportFilters) {
  let q = supabase.from('tickets').select('id, title, status, priority, business, created_at, completed_at, due_date, assigned_to');
  if (filters?.from) q = q.gte('created_at', filters.from);
  if (filters?.to) q = q.lte('created_at', filters.to);
  if (filters?.priority && filters.priority !== 'all') q = q.eq('priority', filters.priority);
  if (filters?.business && filters.business !== 'all') q = q.eq('business', filters.business);
  if (filters?.technician && filters.technician !== 'all') q = filters.technician === 'unassigned' ? q.is('assigned_to', null) : q.eq('assigned_to', filters.technician);
  if (filters?.status === 'completed') q = q.eq('status', 'completed');
  if (filters?.status === 'open') q = q.neq('status', 'completed');
  if (filters?.status === 'overdue') q = q.neq('status', 'completed').lt('due_date', new Date().toISOString());
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}

/** Week-over-week counts for New, Pending (approx.), Overdue and Completed.
 * - new: tickets created within week range
 * - pending: tickets with status in ('in_progress','on_hold') created within week range (approximation)
 * - completed: tickets completed within week range
 * - overdue: tickets whose due_date falls within week range and are not completed by end of range
 */
export async function getWeeklyCategoryCounts() {
  const now = new Date();
  const day = now.getDay(); // 0-6 (Sun=0)
  const diffToMon = (day === 0 ? -6 : 1 - day); // move to Monday
  const startThis = new Date(now);
  startThis.setHours(0, 0, 0, 0);
  startThis.setDate(startThis.getDate() + diffToMon);
  const startLast = new Date(startThis);
  startLast.setDate(startLast.getDate() - 7);
  const endLast = new Date(startThis);

  function range(where: 'this' | 'last') {
    const from = where === 'this' ? startThis : startLast;
    const to = where === 'this' ? now : endLast; // last week until start of this week
    return { from: from.toISOString(), to: to.toISOString() };
  }

  const rThis = range('this');
  const rLast = range('last');

  // Helpers (counts only)
  const countNew = async (r: { from: string; to: string }) =>
    (await supabase.from('tickets').select('id', { count: 'exact', head: true }).gte('created_at', r.from).lt('created_at', r.to)).count ?? 0;

  const countPending = async (r: { from: string; to: string }) =>
    (await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['in_progress', 'on_hold'] as any)
      .gte('created_at', r.from)
      .lt('created_at', r.to)
    ).count ?? 0;

  const countCompleted = async (r: { from: string; to: string }) =>
    (await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', r.from)
      .lt('completed_at', r.to)
    ).count ?? 0;

  const countOverdue = async (r: { from: string; to: string }) =>
    (await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'completed')
      .gte('due_date', r.from)
      .lt('due_date', r.to)
      .lt('due_date', new Date().toISOString()) // ensure due is in the past when range is current week
    ).count ?? 0;

  const [n1, n0, p1, p0, o1, o0, c1, c0] = await Promise.all([
    countNew(rThis), countNew(rLast),
    countPending(rThis), countPending(rLast),
    countOverdue(rThis), countOverdue(rLast),
    countCompleted(rThis), countCompleted(rLast),
  ]);

  const pct = (cur: number, prev: number) => {
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  return {
    new: { thisWeek: n1, lastWeek: n0, pct: pct(n1, n0) },
    pending: { thisWeek: p1, lastWeek: p0, pct: pct(p1, p0) },
    overdue: { thisWeek: o1, lastWeek: o0, pct: pct(o1, o0) },
    completed: { thisWeek: c1, lastWeek: c0, pct: pct(c1, c0) },
  } as const;
}
