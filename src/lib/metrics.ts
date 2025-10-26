// src/lib/metrics.ts
import { supabase } from '@/lib/supabase';


export async function getCompletedByDay(days = 30) {
  const { data, error } = await supabase.rpc('completed_by_day', { days });
  if (error) throw error;
  return data as { day: string; total: number }[];
}

export async function getCompletedTotals(range: { from: Date; to: Date }) {
  const { data, error } = await supabase.rpc('completed_totals', {
    from_ts: range.from.toISOString(),
    to_ts: range.to.toISOString(),
  });
  if (error) throw error;
  // devuelve [{ total: number }]
  const total = Array.isArray(data) && data[0]?.total ? Number(data[0].total) : 0;
  return { total };
}

export async function getCompletedByMonth(months = 12) {
  // Trae tickets completados en los últimos N meses y agrega en cliente
  const to = new Date();
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (months - 1), 1));
  const { data, error } = await supabase
    .from('tickets')
    .select('completed_at')
    .eq('status', 'completed')
    .gte('completed_at', from.toISOString());

  if (error) throw error;

  // Prepara buckets YYYY-MM
  const buckets: Record<string, number> = {};
  const cursor = new Date(from);
  for (let i = 0; i < months; i++) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
    buckets[key] = 0;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  (data ?? []).forEach((r: any) => {
    const d = new Date(r.completed_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (key in buckets) buckets[key] += 1;
  });

  // Devuelve serie ordenada
  return Object.entries(buckets).map(([month, total]) => ({ month, total }));
}
