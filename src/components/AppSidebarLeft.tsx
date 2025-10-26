'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LogOut as LogoutIcon } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';

type UserProfile = { full_name?: string; role?: string; email?: string; avatar_url?: string | null };
type NavChild = { href: string; label: string };
type NavItem = { href: string; icon: string; label: string; children?: NavChild[] };

export default function AppSidebarLeft({
  mobileOpen,
  onClose,
}: { mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [me, setMe] = useState<string | null>(null);

  // ---- contador en badge ----
  const [assignedCount, setAssignedCount] = useState(0);
  const [adminCompletedCount, setAdminCompletedCount] = useState(0);
  const [adminActiveCount, setAdminActiveCount] = useState(0);

  const matchPath = (href: string) => pathname?.startsWith(href);

  useEffect(() => {
    let alive = true;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    const bc = new BroadcastChannel('profile');
    bc.onmessage = (ev) => {
      const msg = ev.data as any;
      if (msg?.type === 'updated') {
        setUser((prev) => ({ ...(prev ?? {}), ...(msg.data || {}) }));
      }
    };
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(user?.id ?? null);
      if (!user) { setUser(null); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      setUser({
        full_name: profile?.full_name || user.email || '',
        role: (profile?.role || '—') as string,
        email: user.email || '',
        avatar_url: profile?.avatar_url ?? null,
      });

      // Realtime: escucha cambios en tu fila de profiles
      if (user.id) {
        ch = supabase
          .channel(`sidebar-profile-${user.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, (payload: any) => {
            const next = payload.new ?? payload.old;
            if (next) setUser((prev) => ({ ...(prev ?? {}), ...(next as any) }));
          })
          .subscribe();
      }
    })();
    return () => { alive = false; if (ch) supabase.removeChannel(ch); bc.close(); };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    onClose();
  }

  const normalizedRole = useMemo(() => (user?.role ?? '').toLowerCase(), [user?.role]);
  const isManagerRole  = normalizedRole === 'manager' || normalizedRole === 'admin';
  const isTechnician   = normalizedRole === 'it' || normalizedRole === 'technician';
  const isUserOnly     = normalizedRole === 'user' || normalizedRole === 'client';

  const navItems = useMemo<NavItem[]>(() => {
    // Usuarios finales: menú mínimo
    if (isUserOnly) {
      return [
        { href: '/dashboard', icon: '🎫', label: 'Tickets' },
        { href: '/profile', icon: '👤', label: 'Mi perfil' },
      ];
    }

    const items: NavItem[] = [
      { href: '/dashboard', icon: '🎫', label: 'Tickets' },
      { href: '/kb', icon: '📚', label: 'Conocimiento' },
      { href: '/reports', icon: '📊', label: 'Reportes' },
      { href: '/tasks', icon: '🗓️', label: 'Tareas' },
    ];
    if (isManagerRole) items.push({ href: '/profiles', icon: '🧑‍🤝‍🧑', label: 'Perfiles' });
    return items;
  }, [isManagerRole, isUserOnly]);

  const isItemActive = (item: NavItem) => {
    if (matchPath(item.href)) return true;
    return item.children?.some((child) => matchPath(child.href)) ?? false;
  };

  /* =========================
     Conteo exacto con RPC
     ========================= */
  const refetchAssignedCount = useCallback(async () => {
    if (!isTechnician || !me) { setAssignedCount(0); return; }

    try {
      // 1) tickets where assigned_to = me and not completed
      const { data: direct, error: e1 } = await supabase
        .from('tickets')
        .select('id')
        .neq('status', 'completed')
        .eq('assigned_to', me)
        .limit(1000);
      if (e1) throw e1;

      // 2) ticket ids from ticket_assignees for me
      let linkedIds: string[] = [];
      try {
        const { data: links, error: e2 } = await supabase
          .from('ticket_assignees')
          .select('ticket_id')
          .eq('user_id', me)
          .limit(1000);
        if (e2) throw e2;
        linkedIds = (links ?? []).map((r: { ticket_id: string }) => r.ticket_id);
      } catch {
        // Si RLS bloquea ticket_assignees, seguimos solo con assigned_to
        linkedIds = [];
      }

      let linkedTickets: { id: string }[] = [];
      if (linkedIds.length) {
        const { data: ldata, error: e3 } = await supabase
          .from('tickets')
          .select('id')
          .neq('status', 'completed')
          .in('id', linkedIds)
          .limit(1000);
        if (e3) throw e3;
        linkedTickets = ldata ?? [];
      }

      // combine ids to avoid duplicates
      const set = new Set<string>();
  (direct ?? []).forEach((r: { id: string }) => set.add(r.id));
  linkedTickets.forEach((r: { id: string }) => set.add(r.id));
      setAssignedCount(set.size);
    } catch (err) {
      // Evita ruido si hay RLS; simplemente deja el contador en 0
      if (process.env.NODE_ENV !== 'production') {
        console.error('[assignedCount]', err);
      }
      setAssignedCount(0);
    }
  }, [isTechnician, me]);

  /* Conteos globales para administradores: completados (green) y nuevos/activos (red) */
  async function refetchAdminCounts() {
    try {
      const { count: completedCount, error: e1 } = await supabase
        .from('tickets')
        .select('id', { count: 'exact' })
        .eq('status', 'completed');
      if (e1) throw e1;

      const { count: activeCount, error: e2 } = await supabase
        .from('tickets')
        .select('id', { count: 'exact' })
        .neq('status', 'completed');
      if (e2) throw e2;

      setAdminCompletedCount(completedCount ?? 0);
      setAdminActiveCount(activeCount ?? 0);
    } catch (err) {
      console.error('[adminCounts]', err);
      setAdminCompletedCount(0);
      setAdminActiveCount(0);
    }
  }

  // carga inicial cuando tenemos usuario/rol
  useEffect(() => {
    if (me) {
      void refetchAssignedCount();
      if (isManagerRole) void refetchAdminCounts();
    }
  }, [me, isTechnician, isManagerRole, refetchAssignedCount]);

  // ---- realtime para refrescar el badge ----
  useEffect(() => {
    if (!me || !isTechnician) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void refetchAssignedCount(); }, 150);
    };

  let chTickets: ReturnType<typeof supabase.channel> | null = null;
  let chAssignees: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      try {
        chTickets = supabase.channel(`badge:tickets:${me}`);
        chTickets.on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `assigned_to=eq.${me}` }, () => schedule());
        await chTickets.subscribe();

        chAssignees = supabase.channel(`badge:assignees:${me}`);
        chAssignees.on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_assignees', filter: `user_id=eq.${me}` }, () => schedule());
        await chAssignees.subscribe();
      } catch (err) {
        console.error('subscribe badge channels', err);
      }
    })();

    return () => {
      if (timer) clearTimeout(timer);
      if (chTickets) supabase.removeChannel(chTickets);
      if (chAssignees) supabase.removeChannel(chAssignees);
    };
  }, [me, isTechnician, refetchAssignedCount]);

  // realtime global para administradores: actualiza contadores
  useEffect(() => {
    if (!isManagerRole) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void refetchAdminCounts(); }, 150); };

    const ch = supabase.channel('admin.tickets');
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => schedule());
    void ch.subscribe();

    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch); };
  }, [isManagerRole]);

  // ---- badge visual, no altera tu CSS base ----
  const badge = (n: number) => (
    <span
      className="side-badge"
      style={{
        marginLeft: 8,
        minWidth: 18,
        height: 18,
        padding: '0 6px',
        borderRadius: 999,
        background: '#2563eb',
        color: 'white',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: '18px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title={`${n} tickets asignados (activos)`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );

  const roleLabel = useMemo(() => {
    const r = normalizedRole;
    if (r === 'manager' || r === 'admin') return 'Manager';
    if (r === 'it' || r === 'technician') return 'IT';
    if (r === 'user' || r === 'client') return 'User';
    return user?.role || '—';
  }, [normalizedRole, user?.role]);

  const SidebarContent = (
    <div className="side-inner">
      <div className="side-logo">IT System</div>

      <nav className="side-list">
        {navItems.map((item) => {
          const active = isItemActive(item);
          const isTickets = item.href === '/dashboard';
          return (
            <div key={item.href} className="side-group">
              <Link
                href={item.href}
                className={`side-item ${active ? 'is-active' : ''} ${item.children?.length ? 'has-children' : ''}`}
                onClick={onClose}
              >
                <span className="i">
                  {item.href === '/profile' ? (
                    <Avatar
                      src={user?.avatar_url ?? null}
                      alt={user?.full_name || user?.email || 'Perfil'}
                      seed={user?.email || user?.full_name || undefined}
                      size={18}
                    />
                  ) : (
                    item.icon
                  )}
                </span>
                <span className="t">
                  {item.label}
                  {/* badge solo para IT y en “Tickets” */}
                  {isTickets && isTechnician && assignedCount > 0 && badge(assignedCount)}
                  {isTickets && isManagerRole && (
                    <span style={{ display: 'inline-flex', gap: 6, marginLeft: 8, alignItems: 'center' }}>
                      {/* active/new tickets (red) */}
                      <span className="side-badge" style={{ background: '#b9d2ff' }} title={`${adminActiveCount} activos`}>{adminActiveCount > 99 ? '99+' : adminActiveCount}</span>
                      {/* completed (green) */}
                      <span className="side-badge" style={{ background: '#16a34a' }} title={`${adminCompletedCount} completados`}>{adminCompletedCount > 99 ? '99+' : adminCompletedCount}</span>
                    </span>
                  )}
                </span>
                <span className="active-pill" />
              </Link>

              {!!item.children?.length && (
                <div className="side-sublist">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`side-subitem ${matchPath(child.href) ? 'is-active' : ''}`}
                      onClick={onClose}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="side-footer">
        <div className="user-card">
          <Link href="/profile" className="avatar" title="Perfil" onClick={onClose}>
            <Avatar
              src={user?.avatar_url ?? null}
              alt={user?.full_name || user?.email || 'Perfil'}
              seed={user?.email || user?.full_name || undefined}
              size={40}
            />
          </Link>
          <div className="user-meta">
            <div className="user-name">{user?.full_name || '—'}</div>
            <div className="user-role">{roleLabel}</div>
          </div>
          <button className="btn btn-icon exit-btn" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={signOut}>
            <LogoutIcon width={18} height={18} strokeWidth={2.2} />
          </button>
          </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Fijo en desktop */}
      <aside className="sidebar-fixed">{SidebarContent}</aside>

      {/* Drawer móvil */}
      {mobileOpen && (
        <>
          <div className="drawer-backdrop" onClick={onClose} />
          <aside className="drawer-panel">{SidebarContent}</aside>
        </>
      )}
    </>
  );
}
