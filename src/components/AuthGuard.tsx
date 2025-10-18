'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    let profileSub: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      const session = data.session;
      if (!session) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      const userId = session.user.id;
      // Fetch profile to see if disabled
      const { data: prof } = await supabase.from('profiles').select('disabled, disabled_reason, admin_contact').eq('id', userId).maybeSingle();
      if ((prof as any)?.disabled) {
        const reason = (prof as any)?.disabled_reason || 'Tu cuenta ha sido desactivada.';
        const contact = (prof as any)?.admin_contact ? ` Contacto: ${(prof as any).admin_contact}` : '';
        toast.warning(`${reason}${contact ? ` — ${contact}` : ''}`);
        setTimeout(async () => {
          await supabase.auth.signOut();
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        }, 1200);
        return;
      }
      // Subscribe to profile changes to detect disable in realtime
      profileSub = supabase.channel(`profile:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, async (payload) => {
          const row = ((payload as any).new ?? (payload as any).old ?? {}) as any;
          if (row && row.disabled) {
            const reason = row.disabled_reason || 'Tu cuenta ha sido desactivada.';
            const contact = row.admin_contact ? ` Contacto: ${row.admin_contact}` : '';
            toast.warning(`${reason}${contact ? ` — ${contact}` : ''}`);
            setTimeout(async () => {
              await supabase.auth.signOut();
              router.replace(`/login?next=${encodeURIComponent(pathname)}`);
            }, 1200);
          }
        });
      void profileSub.subscribe();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!alive) return;
      if (!session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    });

    return () => {
      alive = false;
      sub.subscription?.unsubscribe();
      if (profileSub) supabase.removeChannel(profileSub);
    };
  }, [router, pathname]);

  return <>{children}</>;
}
