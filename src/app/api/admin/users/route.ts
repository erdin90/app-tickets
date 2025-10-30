import { NextResponse } from 'next/server';
import { ensureManager } from '@/lib/admin/supabase';

type ManagedUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  ext?: string | null;
  can_create_ticket?: boolean | null;
  status: 'active' | 'disabled';
  last_sign_in_at: string | null;
  created_at: string | null;
};

export async function GET(request: Request) {
  const guard = await ensureManager(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const supabase = guard.supabase;
  const url = new URL(request.url);
  const search = (url.searchParams.get('q') ?? '').toLowerCase();

  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = data?.users ?? [];
  const ids = users.map((u) => u.id);

  type ProfileRow = { id: string; full_name: string | null; avatar_url: string | null; role: string | null; ext: string | null; can_create_ticket: boolean | null };
  const profileMap = new Map<string, ProfileRow>();
  if (ids.length) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role, ext, can_create_ticket')
      .in('id', ids);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    for (const p of (profiles ?? []) as ProfileRow[]) {
      profileMap.set(p.id, {
        id: p.id,
        full_name: p.full_name ?? null,
        avatar_url: p.avatar_url ?? null,
        role: p.role ?? null,
        ext: p.ext ?? null,
        can_create_ticket: p.can_create_ticket ?? null,
      });
    }
  }

  let managedUsers: ManagedUser[] = users.map((user) => {
    const profile = profileMap.get(user.id);
  const disabled = ('banned_until' in user && (user as Record<string, unknown>)['banned_until']) || ('is_banned' in user && (user as Record<string, unknown>)['is_banned']) ? true : false;
    return {
      id: user.id,
      email: user.email ?? null,
      full_name: profile?.full_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      role: profile?.role ?? null,
      ext: profile?.ext ?? null,
      can_create_ticket: profile?.can_create_ticket ?? null,
      status: disabled ? 'disabled' : 'active',
      last_sign_in_at: user.last_sign_in_at ?? null,
      created_at: user.created_at ?? null,
    };
  });

  if (search) {
    managedUsers = managedUsers.filter((user) => {
      const haystack = [user.email, user.full_name, user.id].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(search);
    });
  }

  managedUsers.sort((a, b) => {
    const nameA = (a.full_name ?? a.email ?? '').toLowerCase();
    const nameB = (b.full_name ?? b.email ?? '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return NextResponse.json({ users: managedUsers });
}

export async function POST(request: Request) {
  const guard = await ensureManager(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const supabase = guard.supabase;
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { email, password, full_name, role, avatar_url, ext, can_create_ticket } = body as Record<string, string | undefined> & { can_create_ticket?: boolean };

  if (!email || !password) {
    return NextResponse.json({ error: 'Email y contraseña son obligatorios' }, { status: 400 });
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    return NextResponse.json({ error: error?.message ?? 'No se pudo crear el usuario' }, { status: 500 });
  }

  const newUser = data.user;

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: newUser.id,
    full_name: full_name ?? null,
    avatar_url: avatar_url ?? null,
    role: role ?? null,
    ext: ext ?? null,
    can_create_ticket: typeof can_create_ticket === 'boolean' ? can_create_ticket : true,
  });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({
    user: {
      id: newUser.id,
      email: newUser.email,
      full_name: full_name ?? null,
      avatar_url: avatar_url ?? null,
      role: role ?? null,
      status: 'active' as const,
      last_sign_in_at: newUser.last_sign_in_at ?? null,
      created_at: newUser.created_at ?? null,
    },
  });
}
