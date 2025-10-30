import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type EnsureManagerResult =
  | { ok: true; supabase: SupabaseClient }
  | { ok: false; status: number; message: string };

let cachedClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase service role configuration');
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}

export async function ensureManager(request: Request): Promise<EnsureManagerResult> {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';

  if (!token) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }

  const supabase = getServiceClient();

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();

  // Accept both legacy 'manager' and new 'admin' role for backward compatibility
  const role = profile?.role ?? null;
  const isAdmin = role === 'admin' || role === 'manager';
  if (profileError || !isAdmin) {
    return { ok: false, status: 403, message: 'Forbidden' };
  }

  return { ok: true, supabase };
}
