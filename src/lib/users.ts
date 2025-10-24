// src/lib/users.ts

import { supabase } from '@/lib/supabase';


export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role?: 'manager' | 'technician' | 'it' | 'client' | null;
  ext?: string | null;
  can_create_ticket?: boolean | null;
};

export async function listTechnicians() {
  // Sólo técnicos (technician/it) y managers. Excluye usuarios finales.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role')
    .in('role', ['technician', 'it', 'manager'])
    .order('full_name', { ascending: true });

  return { data: (data as Profile[]) ?? [], error };
}

export async function getMyProfile() {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return { data: null as Profile | null, error: null };

  // Try selecting with ext; if the column doesn't exist yet, fall back to a minimal select so the UI can render.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role, ext, can_create_ticket')
    .eq('id', uid)
    .maybeSingle();
  if (error) {
    const { data: data2 } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role')
      .eq('id', uid)
      .maybeSingle();
    return { data: (data2 ?? null) as Profile | null, error: null };
  }
  return { data: (data ?? null) as Profile | null, error: null };
}

export async function getUsersByIds(ids: string[]) {
  if (!ids.length) return { data: [] as Profile[], error: null };
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', ids);
  return { data: (data ?? []) as Profile[], error };
}