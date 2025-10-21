import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ensureManager } from '@/lib/admin/supabase';

// We will use a server-side supabase client with anon key for row-level security checks
// and validate the user + role via the provided bearer token from the client.

function getServerClient(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
  return client;
}

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const auth = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getServerClient(token);

    // 1) Identify current user and role
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const me = userData.user.id;
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', me)
      .maybeSingle();
  const myRole = (myProfile?.role || '').toLowerCase();
  const isManager = myRole === 'manager' || myRole === 'admin';

    // 2) Load comment author to check self-delete
    const { data: comment, error: cErr } = await supabase
      .from('ticket_comments')
      .select('id, author')
      .eq('id', id)
      .maybeSingle();
    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 400 });
    }
    if (!comment) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // 3) Authorization:
    // - Manager can delete comments authored by IT/technician
    // - Any user can delete their own comment (practical UX)
    const isOwn = comment.author === me;
    if (isOwn) {
      // try delete with RLS (anon client)
      const { error: delErr } = await supabase.from('ticket_comments').delete().eq('id', id);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (!isManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Manager path: verify author role is IT/technician
    const { data: authorProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', comment.author)
      .maybeSingle();
    const authorRole = (authorProfile?.role || '').toLowerCase();
    const authorIsIT = authorRole === 'technician' || authorRole === 'it';
    if (!authorIsIT) {
      return NextResponse.json({ error: 'Solo comentarios de IT pueden ser eliminados por managers' }, { status: 403 });
    }

    // Use service role to bypass potential RLS for deleting others' comments
    const mgrGuard = await ensureManager(request);
    if (!mgrGuard.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const admin = mgrGuard.supabase;
    const { error: delErr2 } = await admin.from('ticket_comments').delete().eq('id', id);
    if (delErr2) {
      return NextResponse.json({ error: delErr2.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
