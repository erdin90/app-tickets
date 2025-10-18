import { NextResponse } from 'next/server';
import { ensureManager } from '@/lib/admin/supabase';

type StatusPayload = {
  status: 'active' | 'disabled';
  reason?: string | null;
  contact?: string | null;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await ensureManager(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const supabase = guard.supabase;
  const body = (await request.json().catch(() => null)) as StatusPayload | null;
  if (!body || (body.status !== 'active' && body.status !== 'disabled')) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }

  // Ban indefinido: usar una duración muy larga en horas (100 años)
  const ban_duration = body.status === 'disabled' ? '876000h' : 'none';
  const { id } = await params;
  const { error } = await supabase.auth.admin.updateUserById(id, { ban_duration } as any);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // Marcar también el perfil como desactivado/activado para que el cliente pueda reaccionar en tiempo real
  const disabled = body.status === 'disabled';
  const { error: profileErr } = await supabase
    .from('profiles')
  .upsert({ id, disabled, disabled_reason: body.reason ?? null, admin_contact: body.contact ?? null }, { onConflict: 'id' });
  if (profileErr) {
    // No es crítico para el estado de auth, pero lo reportamos
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  // Invalida refresh tokens para forzar expiración de sesiones
  try {
    // supabase-js v2
    // @ts-ignore
    if (typeof supabase.auth.admin.invalidateRefreshTokens === 'function') {
      // @ts-ignore
      await supabase.auth.admin.invalidateRefreshTokens(id);
    } else if (typeof (supabase.auth.admin as any).revokeRefreshTokens === 'function') {
      await (supabase.auth.admin as any).revokeRefreshTokens(id);
    }
  } catch {
    // Ignorar si la función no existe; el ban también impedirá nuevas sesiones
  }

  return NextResponse.json({ success: true });
}
