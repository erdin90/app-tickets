"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FolderKanban, LayoutDashboard, BookOpen, Users, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import { getMyProfile, type Profile } from "@/lib/users";

type Item = { href: string; label: string; icon: React.ElementType };

const SECTIONS: Item[] = [
  { href: "/dashboard/tickets",      label: "Tickets",       icon: FolderKanban },
  { href: "/tablero",      label: "Tablero",       icon: LayoutDashboard },
  { href: "/conocimiento", label: "Conocimiento",  icon: BookOpen },
  { href: "/perfiles",     label: "Perfiles",      icon: Users },
];

export default function TicketsSidebar() {
  const pathname = usePathname();
  const [me, setMe] = useState<Profile | null>(null);

  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    // BroadcastChannel para escuchar actualizaciones locales del perfil (e.g., avatar cambiado desde /perfil)
    const bc = new BroadcastChannel('profile');
    bc.onmessage = (ev) => {
      const msg = ev.data as any;
      if (msg?.type === 'updated' && msg?.data) {
        setMe((prev) => ({ ...(prev ?? {} as any), ...(msg.data as any) }));
      }
    };
    (async () => {
      const { data } = await getMyProfile();
      if (!cancelled) setMe(data);

      // Escucha cambios en tu propio perfil para reflejar avatar al instante
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (uid) {
        ch = supabase
          .channel(`profile-realtime-${uid}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, (payload: any) => {
            const next = payload.new ?? payload.old;
            if (next) setMe((prev) => ({ ...(prev ?? {} as any), ...(next as any) }));
          })
          .subscribe();
      }
    })();
    // suscribe a cambios de sesión por si cambia el usuario logueado
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      getMyProfile().then(({ data }) => setMe(data));
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); if (ch) supabase.removeChannel(ch); bc.close(); };
  }, []);

  return (
    <aside className="hidden md:flex md:w-64 shrink-0 border-r border-neutral-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="flex h-svh w-full flex-col">
        {/* Header workspace */}
        <div className="h-16 flex items-center px-4">
          <div className="h-8 w-8 rounded-lg bg-black" />
          <span className="ml-2 text-sm font-semibold">IT System</span>
        </div>

        {/* Nav */}
        <nav className="px-2 pb-4 space-y-1 overflow-y-auto">
          {SECTIONS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} className="block">
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-800 hover:bg-neutral-100"
                  )}
                >
                  <motion.span
                    className="relative"
                    whileHover={{ rotate: 5 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Icon className="h-4 w-4" />
                    {/* punto animado cuando está activo */}
                    {active && (
                      <motion.span
                        layoutId="dot"
                        className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-500"
                      />
                    )}
                  </motion.span>
                  <span className="truncate">{label}</span>
                  {!active && (
                    <span className="ml-auto h-2 w-2 rounded-full bg-blue-500/0 group-hover:bg-blue-500/20 transition-colors" />
                  )}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* Footer cuenta */}
        <div className="mt-auto p-3">
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
            <div className="h-7 w-7 rounded-full bg-neutral-200 text-neutral-700 grid place-items-center overflow-hidden">
              {(me?.avatar_url ?? '').trim() ? (
                <img src={(me?.avatar_url ?? '').trim()} alt={me?.full_name ?? 'Avatar'} className="w-full h-full object-cover" />
              ) : (
                <User className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">{me?.full_name ?? '—'}</div>
              <div className="truncate text-[11px] text-neutral-500">{(me?.role ?? '').toString().toLowerCase() || 'user'}</div>
            </div>
            <span className="ml-auto text-[10px] rounded-full bg-rose-100 text-rose-700 px-1.5 py-[2px]">●</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
