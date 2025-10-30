import { NextResponse } from 'next/server';
import { ensureManager } from '@/lib/admin/supabase';

type UpdatePayload = {
  email?: string;
  full_name?: string | null;
  avatar_url?: string | null;
  role?: string | null;
};

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const guard = await ensureManager(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const supabase = guard.supabase;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { email, full_name, avatar_url, role } = body as UpdatePayload;
  const userId = params.id;

  if (email) {
    const { error } = await supabase.auth.admin.updateUserById(userId, { email });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    full_name: full_name ?? null,
    avatar_url: avatar_url ?? null,
    role: role ?? null,
  });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const guard = await ensureManager(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const supabase = guard.supabase;
  const userId = params.id;

  const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId);
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
