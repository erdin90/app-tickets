import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Minimal adapter type to avoid depending on Next internal types
type CookieStoreLike = {
  get: (name: string) => { name: string; value: string } | undefined;
  set: (init: { name: string; value: string } & Record<string, any>) => void;
};

// Helper to build the client from a concrete cookie store
function createClientWithCookieStore(cookieStore: CookieStoreLike) {
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

// Sync variant (Server Components, Route Handlers) — cookies() is sync here
export function getServerSupabase() {
  // In some Next.js setups (e.g., Server Actions on Next 15), cookies() returns a Promise.
  // We explicitly assert the sync type here because this variant is intended for
  // contexts where cookies() is synchronous.
  const cookieStore = cookies() as unknown as CookieStoreLike;
  return createClientWithCookieStore(cookieStore);
}

// Async variant (Server Actions / environments where cookies() is async)
export async function getServerSupabaseAsync() {
  const cookieStore = (await (cookies() as unknown as Promise<CookieStoreLike>));
  return createClientWithCookieStore(cookieStore);
}
