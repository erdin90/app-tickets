import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceRoleKey) throw new Error('Missing Supabase service role configuration');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getServiceClient();
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const uid = userData.user.id;
    const { data: profile, error: pErr } = await admin
      .from('profiles')
      .select('role, can_create_ticket')
      .eq('id', uid)
      .maybeSingle();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

    const role = (profile?.role || '').toLowerCase();
    const isManager = role === 'admin' || role === 'manager';
    const canCreate = !!profile?.can_create_ticket || isManager;
    if (!canCreate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

    const {
      title,
      description,
      status,
      priority,
      assigned_to,
      assignees,
      due_date,
      business,
    } = body as {
      title: string; description: string | null; status: string; priority: string;
      assigned_to?: string | null; assignees?: string[]; due_date?: string | null; business?: string | null;
    };

    if (!title || !priority || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    // Only managers can assign on creation
    const insertPayload: Record<string, any> = {
      title,
      description: description ?? null,
      status,
      priority,
      created_by: uid,
      assigned_to: isManager ? (assigned_to ?? null) : null,
      due_date: due_date ?? null,
      business: business ?? null,
    };

    const { data: ins, error: insErr } = await admin
      .from('tickets')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insErr || !ins) return NextResponse.json({ error: insErr?.message || 'Insert failed' }, { status: 400 });

    if (isManager && Array.isArray(assignees) && assignees.length) {
      const rows = assignees.map((uid: string) => ({ ticket_id: ins.id, user_id: uid }));
      const { error: aErr } = await admin.from('ticket_assignees').insert(rows);
      if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 });
    }

    return NextResponse.json({ id: ins.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
