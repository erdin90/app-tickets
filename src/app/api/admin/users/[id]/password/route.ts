import { NextResponse } from 'next/server';
import { ensureManager } from '@/lib/admin/supabase';

type PasswordPayload = { password: string };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await ensureManager(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const supabase = guard.supabase;
  const body = (await request.json().catch(() => null)) as PasswordPayload | null;
  if (!body || typeof body.password !== 'string' || body.password.length < 8) {
    return NextResponse.json({ error: 'Contraseña inválida (mínimo 8 caracteres)' }, { status: 400 });
  }

  const { id } = await params;
  const { error } = await supabase.auth.admin.updateUserById(id, { password: body.password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
