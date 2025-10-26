import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getServerSupabase() {
  // In Next.js 15, cookies() may be async in some runtimes; support both.
  const raw: any = cookies() as any;
  const cookieStore: any = typeof raw?.then === 'function' ? await raw : raw;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: '', ...options, maxAge: 0 });
      },
    },
  });
}
