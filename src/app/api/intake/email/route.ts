import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type IntakePayload = {
  title?: string;
  content?: string;
  requester_email?: string;
  requester_name?: string;
  business_key?: string | null; // e.g. 'GLF'
  received_at?: string;         // ISO string
  source?: string;              // expected 'email'
  message_id?: string | null;
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function getServiceClient() {
  const url = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function baseDomainFrom(emailOrDomain: string): string {
  const d = emailOrDomain.includes('@') ? emailOrDomain.split('@')[1] : emailOrDomain;
  const parts = (d || '').toLowerCase().split('.');
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(-2).join('.');
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Intake-Secret',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET() {
  const body = {
    ok: true,
    note: 'Use POST to create tickets. This GET is only for health/info.',
    expects: ['title', 'content', 'requester_email', 'message_id (optional)', 'business_key (optional)'],
  };
  return NextResponse.json(body, { status: 200, headers: corsHeaders() });
}

export async function POST(request: Request) {
  try {
    try { console.log('intake: POST hit'); } catch {}
    // 1) Auth by shared secret
    const intakeSecret = process.env.INTAKE_SECRET || '';
    const headerSecret = request.headers.get('x-intake-secret') || request.headers.get('X-Intake-Secret') || '';
    if (!intakeSecret || headerSecret !== intakeSecret) {
      try {
        console.warn('intake: unauthorized', {
          hasEnv: Boolean(intakeSecret),
          provided: headerSecret ? 'yes' : 'no',
        });
      } catch {}
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2) Parse
    let body: IntakePayload;
    try {
      body = await request.json();
    } catch {
      try { console.error('intake: invalid json'); } catch {}
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const title = (body.title ?? '').trim() || '(sin asunto)';
    const description = (body.content ?? '').toString();
    const requester_email = (body.requester_email ?? '').toLowerCase();
    const requester_name = body.requester_name?.trim() || null;
  let business = (body.business_key ?? null) || null; // app usa string code en columna `business`
    // Fallback: mapear dominio->business vía env si no viene business_key
    if (!business && requester_email.includes('@')) {
      try {
        const domain = baseDomainFrom(requester_email);
        const mapRaw = process.env.INTAKE_DOMAIN_BUSINESS_MAP || '{}';
        const map = JSON.parse(mapRaw) as Record<string, string>;
        if (map && typeof map === 'object') {
          const key = Object.keys(map).find(k => k.toLowerCase() === domain);
          business = key ? map[key] ?? null : null;
        }
      } catch {
        // ignore mapping errors
      }
    }
    const receivedAt = body.received_at ? new Date(body.received_at) : new Date();
    const messageId = body.message_id?.trim() || null;

    if (!requester_email) {
      try { console.warn('intake: missing requester_email'); } catch {}
      return NextResponse.json({ error: 'requester_email required' }, { status: 400 });
    }

    const supa = getServiceClient();

    // 3) Idempotencia por message_id si viene
    if (messageId) {
      const { data: existing, error: selErr } = await supa
        .from('tickets')
        .select('id')
        .eq('message_id', messageId)
        .maybeSingle();
      if (!selErr && existing) {
        return NextResponse.json({ id: existing.id, status: 'exists' }, { status: 200 });
      }
    }

    // 4) Insert ticket
  const insertPayload: Record<string, unknown> = {
      title,
      description,
      status: 'open',
      priority: 'normal',
      assigned_to: null,
      due_date: null,
      business,                 // columna string (códigos)
      requester_email,
      requester_name,
  source: 'email',          // para diferenciarlo de 'app'
      received_at: receivedAt.toISOString(),
      message_id: messageId,
      created_at: receivedAt.toISOString(),
    };

    const { data, error } = await supa
      .from('tickets')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) {
      try { console.error('intake: insert error', { messageId, requester_email, err: error.message }); } catch {}
      return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
    }

    try { console.log('intake: insert ok', { id: data?.id, messageId, requester_email, business }); } catch {}
    return NextResponse.json({ id: data?.id }, { status: 201, headers: corsHeaders() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Server error';
    try { console.error('intake: exception', msg); } catch {}
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders() });
  }
}
