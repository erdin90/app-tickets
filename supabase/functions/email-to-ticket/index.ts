// supabase/functions/email-to-ticket/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type InPayload = {
  message_id: string;
  to: string;
  from: string;
  subject: string;
  text?: string;
  received_at?: string;
};

async function hmacHex(secret: string, data: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,"0")).join("");
}

serve(async (req) => {
  try {
    // SUPABASE_URL suele estar inyectada por la plataforma, no es necesario setearla como secret
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    // Usamos un nombre de secret no reservado por el CLI
    const SERVICE_ROLE = Deno.env.get("SERVICE_ROLE")!;
    const WEBHOOK_SECRET = Deno.env.get("EMAIL_WEBHOOK_SECRET")!;

    const raw = await req.text();
    const sig = req.headers.get("x-webhook-signature") || "";

    // 1) Validar firma
    const calc = await hmacHex(WEBHOOK_SECRET, raw);
    if (calc !== sig) {
      return new Response("invalid signature", { status: 401 });
    }

    // 2) Parsear payload
    const p = JSON.parse(raw) as InPayload;
    const requesterEmail = /<([^>]+)>/.exec(p.from)?.[1] || p.from;
    const title = (p.subject || "(sin asunto)").slice(0, 160);
    const description = (p.text || "").slice(0, 12000);

    // 3) Insertar ticket
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert({
        title,
        description,
        source: "email",
        requester_email: requesterEmail,
        external_message_id: p.message_id || crypto.randomUUID(),
        raw_from: p.from,
        raw_to: p.to,
        received_at: p.received_at || new Date().toISOString(),
        status: "open",
      })
      .select()
      .single();

    if (error) {
      // Devuelve el mensaje de error para que lo veas en logs
      return new Response(`ticket error: ${error.message}`, { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, ticket_id: ticket.id }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  } catch (e) {
    return new Response(`unhandled: ${(e as Error).message}`, { status: 500 });
  }
});
