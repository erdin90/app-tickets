import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Single helper that works in both sync/async cookies() environments
export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, anon, {
    cookies: {
      async get(name: string) {
        const store = await (cookies() as unknown as Promise<ReturnType<typeof cookies>>);
        // @ts-ignore Next types vary between versions; we only need .get().value
        return store.get(name)?.value;
      },
      async set(name: string, value: string, options: any) {
        const store = await (cookies() as unknown as Promise<ReturnType<typeof cookies>>);
        // @ts-ignore see above
        store.set({ name, value, ...options });
      },
      async remove(name: string, options: any) {
        const store = await (cookies() as unknown as Promise<ReturnType<typeof cookies>>);
        // @ts-ignore see above
        store.set({ name, value: '', ...options, maxAge: 0 });
      },
    },
  });
}
