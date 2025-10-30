// src/lib/profileStats.ts
import { supabase } from '@/lib/supabase';

const ACTIVE: Array<'open' | 'in_progress' | 'on_hold'> = ['open', 'in_progress', 'on_hold'];

export type ManagerStats = {
  total: number;
  open: number;
  completed: number;
  overdue: number;
  topTechs30d: Array<{ id: string; name: string; completed: number }>;
};

export type TechnicianStats = {
  completedAll: number;
  completed30d: number;
  openAssigned: number;
  overdueAssigned: number;
  avgResolutionHours: number | null;
  lastTickets: Array<{ id: string; title: string; status: string; completed_at: string | null; created_at: string; due_date: string | null }>;
};

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function getManagerStats(): Promise<ManagerStats> {
  const today = startOfTodayISO();
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();

  const [{ count: total }, { count: open }, { count: completed }, { count: overdue }] =
    await Promise.all([
      supabase.from('tickets').select('id', { count: 'exact', head: true }),
      supabase.from('tickets').select('id', { count: 'exact', head: true }).in('status', ACTIVE),
      supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .lt('due_date', today)
        .not('status', 'eq', 'completed'),
    ]);

  // Top técnicos últimos 30d (agregamos en cliente)
  const { data: recent } = await supabase
    .from('tickets')
    .select('assigned_to')
    .eq('status', 'completed')
    .gte('completed_at', since30)
    .not('assigned_to', 'is', null);

  const counts = new Map<string, number>();
  (recent ?? []).forEach(r => {
    if (!r.assigned_to) return;
    counts.set(r.assigned_to, (counts.get(r.assigned_to) ?? 0) + 1);
  });
  const ids = Array.from(counts.keys());
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', ids);
    (profiles ?? []).forEach((p: { id: string; full_name: string | null }) => {
      names[p.id] = p.full_name ?? p.id;
    });
  }
  const topTechs30d = Array.from(counts.entries())
    .map(([id, n]) => ({ id, name: names[id] ?? id, completed: n }))
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 5);

  return {
    total: total ?? 0,
    open: open ?? 0,
    completed: completed ?? 0,
    overdue: overdue ?? 0,
    topTechs30d,
  };
}

export async function getTechnicianStats(userId: string): Promise<TechnicianStats> {
  const today = startOfTodayISO();
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();

  const [
    { count: completedAll },
    { count: completed30d },
    { count: openAssigned },
    { count: overdueAssigned },
    { data: completedRows },
    { data: lastTickets },
  ] = await Promise.all([
    supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .eq('status', 'completed'),
    supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .eq('status', 'completed')
      .gte('completed_at', since30),
    supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .in('status', ACTIVE),
    supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .lt('due_date', today)
      .not('status', 'eq', 'completed'),
    supabase
      .from('tickets')
      .select('created_at, completed_at')
      .eq('assigned_to', userId)
      .eq('status', 'completed'),
    supabase
      .from('tickets')
      .select('id, title, status, completed_at, created_at, due_date')
      .eq('assigned_to', userId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  // promedio horas resolución
  type CompletedRow = { created_at: string; completed_at: string | null };
  const durations = ((completedRows ?? []) as CompletedRow[])
    .filter((r) => !!r.completed_at)
    .map((r) => (new Date(r.completed_at as string).getTime() - new Date(r.created_at).getTime()) / 36e5);
  const avgResolutionHours = durations.length
    ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length
    : null;

  return {
    completedAll: completedAll ?? 0,
    completed30d: completed30d ?? 0,
    openAssigned: openAssigned ?? 0,
    overdueAssigned: overdueAssigned ?? 0,
    avgResolutionHours,
    lastTickets: ((lastTickets ?? []) as Array<{ id: string; title: string; status: string; completed_at: string | null; created_at: string; due_date: string | null }>),
  };
}
