import { supabase } from '@/lib/supabase';

export type TicketComment = {
  id: string;
  ticket_id: string;
  author: string;
  body: string;
  created_at: string;
  author_profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    role?: 'manager' | 'technician' | 'it' | 'client' | null;
  } | null;
};

type RawProfile = {
  id: unknown;
  full_name: unknown;
  avatar_url: unknown;
} | null | undefined;

type RawComment = {
  id: unknown;
  ticket_id: unknown;
  author: unknown;
  body: unknown;
  created_at: unknown;
  author_profile?: RawProfile | RawProfile[]; // supabase puede devolver array
};

function mapRaw(row: RawComment): TicketComment {
  const prof = Array.isArray(row.author_profile)
    ? row.author_profile[0] ?? null
    : (row.author_profile ?? null);

  return {
    id: String(row.id ?? ''),
    ticket_id: String(row.ticket_id ?? ''),
    author: String(row.author ?? ''),
    body: String(row.body ?? ''),
    created_at: String(row.created_at ?? ''),
    author_profile: prof
      ? {
          id: String(prof.id ?? ''),
          full_name: (prof.full_name ?? null) as string | null,
          avatar_url: (prof.avatar_url ?? null) as string | null,
          // @ts-ignore role may be present if requested in select
          role: (prof as any).role ?? null,
        }
      : null,
  };
}

export async function listComments(ticketId: string) {
  const { data, error } = await supabase
    .from('ticket_comments')
    .select(`
      id, ticket_id, author, body, created_at,
      author_profile:profiles ( id, full_name, avatar_url, role )
    `)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (error) return { data: [] as TicketComment[], error };
  return { data: (data as unknown as RawComment[]).map(mapRaw), error: null as unknown as null };
}

export async function addComment(ticketId: string, authorId: string, body: string) {
  const { data, error } = await supabase
    .from('ticket_comments')
    .insert({ ticket_id: ticketId, author: authorId, body })
    .select(`
      id, ticket_id, author, body, created_at,
      author_profile:profiles ( id, full_name, avatar_url, role )
    `)
    .single();

  if (error) return { data: null as TicketComment | null, error };
  const mapped = mapRaw(data as unknown as RawComment);
  return { data: mapped, error: null as unknown as null };
}

export function subscribeComments(ticketId: string, onChange: () => void) {
  const channel = supabase.channel(`comments.ticket.${ticketId}`);
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${ticketId}` },
    () => { try { onChange(); } catch {} }
  );
  channel.subscribe();
  return () => { supabase.removeChannel(channel); };
}

export async function deleteComment(id: string) {
  // obtener token actual para autorizar contra el API
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(`/api/tickets/comments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: new Error(body?.error || `HTTP ${res.status}`) };
  }
  return { error: null as unknown as null };
}
