// supabase/functions/inbound-email/index.ts

// Habilita soporte npm en Deno (ya viene en funciones de Supabase)
import { createClient } from "npm:@supabase/supabase-js";

type ParsedInbound = {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  text?: string;
  html?: string;
  "message-id"?: string; // sendgrid
  "Message-Id"?: string; // mailgun
  "MessageID"?: string;  // postmark
  date?: string;         // sendgrid/mailgun
  Date?: string;         // postmark
};

const DOMAIN_BUSINESS_MAP: Record<string, string> = {
  "gallardolawfirms.com": "GALLARDO",
  "care4hairclinic.com": "CARE4 HAIR",
  // Agrega aquí nuevos dominios -> negocio según sea necesario
};


// Sanitiza HTML simple
function toSafeHtml(html: string) {
  return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
}
function stripHtml(html: string) {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
}
function firstNonEmpty(...vals: Array<string | undefined | null>) {
  for (const v of vals) {
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

function parseFirstEmail(raw: string) {
  if (!raw) return "";
  const first = raw.split(",")[0]?.trim() ?? "";
  const match = first.match(/<([^>]+)>/);
  const email = match ? match[1] : first;
  return email.trim().toLowerCase();
}

function guessBusinessFromEmail(rawFrom: string): string | null {
  const email = parseFirstEmail(rawFrom);
  const [, domain] = email.split("@");
  if (!domain) return null;
  return DOMAIN_BUSINESS_MAP[domain.toLowerCase()] ?? null;
}

Deno.serve(async (req: Request) => {
  try {
    // 1) Protege el endpoint con un secret en la URL: ?secret=XYZ
    const url = new URL(req.url);
    const urlSecret = url.searchParams.get("secret");
    const EXPECTED = Deno.env.get("INBOUND_SECRET");
    if (!EXPECTED || urlSecret !== EXPECTED) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE")!;
    const DEFAULT_OWNER = Deno.env.get("DEFAULT_TICKET_OWNER_UUID")!;
    if (!SUPABASE_URL || !SERVICE_ROLE || !DEFAULT_OWNER) {
      return new Response(JSON.stringify({ error: "Missing env vars" }), { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const contentType = req.headers.get("content-type") || "";
    let data: ParsedInbound;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();

      // SendGrid Inbound Parse:
      // keys comunes: from, to, cc, subject, text, html, message-id, date
      data = {
        from: String(form.get("from") || ""),
        to: String(form.get("to") || ""),
        cc: form.get("cc") ? String(form.get("cc")) : undefined,
        subject: String(form.get("subject") || "(sin asunto)"),
        text: form.get("text") ? String(form.get("text")) : undefined,
        html: form.get("html") ? String(form.get("html")) : undefined,
        "message-id": form.get("message-id") ? String(form.get("message-id")) : undefined,
        date: form.get("date") ? String(form.get("date")) : undefined,
      };

      // Nota: Si activas "POST the raw, full MIME message", el campo es "email"; aquí
      // estamos usando el parseo estándar (text/html separadas). Adjuntos: form.get('attachment1'|...)
      // Si quieres guardar adjuntos en Storage, puedo pasarte snippet adicional.
    } else if (contentType.includes("application/json")) {
      // Por si usas Postmark/Mailgun Inbound (JSON)
      data = await req.json();
    } else {
      return new Response(JSON.stringify({ error: "Unsupported content-type" }), { status: 415 });
    }

    // Normaliza
    const email_subject = (data.subject || "(sin asunto)").slice(0, 500);
    const email_from = data.from || "";
    const email_to = data.to || "";
    const email_cc = data.cc || "";
    const email_message_id =
      firstNonEmpty(data["message-id"], data["Message-Id"], data["MessageID"]);
    const when = firstNonEmpty(data.date, data.Date);
    const email_date = when ? new Date(when) : new Date();

    // Cuerpo: prioriza text; cae a html->texto
    const bodyText =
      firstNonEmpty(data.text) ??
      (data.html ? stripHtml(toSafeHtml(data.html)) : "(sin contenido)");
     const detectedBusiness = guessBusinessFromEmail(email_from);
    // Inserta ticket
    const { data: inserted, error } = await supabase
      .from("tickets")
      .insert([
        {
          title: email_subject,
          content: bodyText,
          source: "email",
          email_from,
          email_to,
          email_cc,
          email_message_id,
          email_date,
          email_subject,
          status: "open",
          created_by: DEFAULT_OWNER,
           business: detectedBusiness,
        },
      ])
      .select("id");

    if (error) {
      console.error("Insert error:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, ticket_id: inserted?.[0]?.id ?? null }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("Handler error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), { status: 500 });
  }
});
