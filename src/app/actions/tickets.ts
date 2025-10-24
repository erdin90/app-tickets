"use server";
import { getServerSupabase } from '@/lib/supabaseServer';

export type TicketRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  created_by: string | null;
  assigned_to: string | null;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  business: string | null;
};

export async function getMyTickets(limit: number = 100): Promise<TicketRow[]> {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as TicketRow[];
}

export async function getAssignedTickets(limit: number = 100): Promise<TicketRow[]> {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Tickets with primary assignment
  const { data: primary } = await supabase
    .from('tickets')
    .select('id')
    .eq('assigned_to', user.id)
    .limit(2000);

  // Tickets with secondary (multi) assignment
  const { data: links } = await supabase
    .from('ticket_assignees')
    .select('ticket_id')
    .eq('user_id', user.id)
    .limit(4000);

  const idSet = new Set<string>();
  (primary as Array<{ id: string }> ?? []).forEach(r => idSet.add(r.id));
  (links as Array<{ ticket_id: string }> ?? []).forEach(r => idSet.add(r.ticket_id));
  const ids = Array.from(idSet);

  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .in('id', ids)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as TicketRow[];
}
