/// <reference lib="deno.ns" />
// supabase/functions/on-comment-created/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// payload que envía el Database Webhook al hacer INSERT en public.ticket_comments
type Row = {
  id: string;              // uuid del comentario
  ticket_id: string;       // uuid del ticket
  author: string | null;   // uuid del autor (IT)
  body: string | null;     // texto del comentario
  created_at: string;      // timestamptz
};

type WebhookBody = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Row;
  schema: string;
};

serve(async (req) => {
  try {
    // --- secretos ---
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!; // inyectado por la plataforma
    // admitir ambas convenciones de secreto para evitar faltantes
    const SERVICE_ROLE = Deno.env.get("SERVICE_ROLE") ?? Deno.env.get("SUPABASE_SERVICE_ROLE") ?? "";
    const SEND_EMAIL_WORKER_URL = Deno.env.get("SEND_EMAIL_WORKER_URL") ?? Deno.env.get("EMAIL_OUT_WORKER_URL") ?? "";
    if (!SERVICE_ROLE) {
      console.error("Missing SERVICE_ROLE/SUPABASE_SERVICE_ROLE secret");
      return new Response("missing service role", { status: 500 });
    }
    if (!SEND_EMAIL_WORKER_URL) {
      console.error("Missing SEND_EMAIL_WORKER_URL secret");
      return new Response("missing worker url", { status: 500 });
    }

    // --- leer payload del webhook ---
    const body = (await req.json()) as WebhookBody;
    if (body.table !== "ticket_comments" || body.type !== "INSERT") {
      return new Response("ignored", { status: 200 });
    }
    const comment = body.record;
    const commentText = (comment.body ?? "").trim();
    if (!commentText) return new Response("empty body", { status: 200 });

    // --- obtener datos del ticket (título y correo del solicitante) ---
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: ticket, error: tErr } = await supabase
      .from("tickets")
      .select("id, title, requester_email")
      .eq("id", comment.ticket_id)
      .single();

    if (tErr || !ticket) {
      return new Response("ticket not found", { status: 404 });
    }
    if (!ticket.requester_email) {
      return new Response("no requester email", { status: 200 });
    }

    // --- construir asunto y contenido ---
    const subject = `Actualización de ticket: ${ticket.title ?? ticket.id}`;
    const text = `Hola,

Se agregó un nuevo comentario a su ticket:

"${commentText}"

— Equipo de Soporte PaQva
`;
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
        <p>Hola,</p>
        <p>Se agregó un nuevo comentario a su ticket:</p>
        <blockquote style="margin:12px 0;padding:12px;border-left:4px solid #e5e7eb;background:#f9fafb">
          ${escapeHtml(commentText)}
        </blockquote>
        <p style="margin-top:16px">— Equipo de Soporte <strong>PaQva</strong></p>
      </div>`;

    // --- llamar al Worker de salida para enviar el correo ---
    const res = await fetch(SEND_EMAIL_WORKER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: ticket.requester_email,
        subject,
        text,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("send-email-worker error:", err);
      return new Response("worker error", { status: 500 });
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("unhandled:", e);
    return new Response("unhandled error", { status: 500 });
  }
});

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
