// supabase/functions/on-ticket-status/index.ts
// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type WebhookBody = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown>;
  old_record?: Record<string, unknown>;
};

const DEBUG = true;

// Sinónimos comunes por si el estado es string o id numérico serializado
const STATUS_NEW = ["nuevo", "new", "open", "abierto", "0", "1"];
const STATUS_PENDING = [
  "pendiente",
  "en pendiente",
  "pending",
  "in progress",
  "in_progress",
  "on hold",
  "on_hold",
  "2",
];

function norm(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function getStatus(obj: Record<string, unknown>) {
  for (const key of ["status", "state", "status_id", "state_id"]) {
    if (key in obj) return norm(obj[key]);
  }
  return "";
}

function getRequester(rec: Record<string, unknown>) {
  for (const key of [
    "requester_email",
    "email",
    "requester",
    "user_email",
    "contact_email",
  ]) {
    const v = rec[key];
    if (v && String(v).includes("@")) return String(v);
  }
  return "";
}

serve(async (req: Request) => {
  try {
    const WORKER_URL =
      Deno.env.get("SEND_EMAIL_WORKER_URL") ||
      Deno.env.get("EMAIL_OUT_WORKER_URL") ||
      "";
    const WORKER_AUTH = Deno.env.get("SEND_EMAIL_WORKER_SECRET") || Deno.env.get("MAIL_WORKER_SECRET") || "";
    // MailChannels direct send (works best when invoked from Cloudflare Workers; also works from servers with proper domain auth)
    const MC_FROM = Deno.env.get("MAILCHANNELS_FROM") || "Soporte PaQva <soporte@paqva.com>";
    const MC_REPLY_TO = Deno.env.get("MAILCHANNELS_REPLY_TO") || undefined;

    const body = (await req.json()) as WebhookBody;
    if (body.table !== "tickets" || body.type !== "UPDATE") {
      if (DEBUG) console.log("ignored: wrong table/type", body.table, body.type);
      return new Response("ignored", { status: 200 });
    }

    const rec = body.record ?? {};
    const old = body.old_record ?? {};

    const to = getRequester(rec);
    const fromStatus = getStatus(old);
    const toStatus = getStatus(rec);
    const isNew = STATUS_NEW.includes(fromStatus) || fromStatus === ""; // si no envían old_record
    const isPending = STATUS_PENDING.includes(toStatus) || toStatus.includes("pend");

    if (DEBUG) console.log({ fromStatus, toStatus, isNew, isPending, to });

    if (!to) {
      if (DEBUG) console.log("no recipient in record");
      return new Response("no recipient", { status: 200 });
    }
    if (!(isNew && isPending)) {
      if (DEBUG) console.log("no-op transition");
      return new Response("no-op", { status: 200 });
    }

    const title = (rec["title"] as string | null) ?? (rec["id"] as string | null) ?? "Ticket";
    const subject = `Tu ticket pasó a pendiente: ${title}`;
    const text = `Hola,\n\nTu ticket ahora está en estado "Pendiente". Comenzaremos a revisarlo.\n\nGracias,\nEquipo de Soporte PaQva\n`;
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
        <p>Hola,</p>
        <p>Tu ticket ahora está en estado <strong>Pendiente</strong>. Comenzaremos a revisarlo.</p>
        <p style="margin-top:16px">— Equipo de Soporte <strong>PaQva</strong></p>
      </div>`;

    async function tryWorker() {
      if (!WORKER_URL) return { ok: false as const, msg: "no worker url" };
      const r = await fetch(WORKER_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(WORKER_AUTH ? { "x-mail-secret": WORKER_AUTH } : {}),
        },
        body: JSON.stringify({ to, subject, text, html }),
      });
      const t = await r.text().catch(() => "");
      if (DEBUG) console.log("worker resp", r.status, t);
      return { ok: r.ok as const, msg: t };
    }

    // Direct MailChannels send (HTTP API)
    async function tryMailChannels() {
      const payload = {
        personalizations: [
          {
            to: [{ email: to }],
          },
        ],
        from: MC_FROM.includes("<")
          ? {
              email: MC_FROM.match(/<([^>]+)>/)?.[1] || MC_FROM,
              name: MC_FROM.split("<")[0]?.trim().replace(/["<>]/g, "") || undefined,
            }
          : { email: MC_FROM },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
        headers: MC_REPLY_TO ? { "Reply-To": MC_REPLY_TO } : undefined,
      };

      const resp = await fetch("https://api.mailchannels.net/tx/v1/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const t = await resp.text().catch(() => "");
      if (DEBUG) console.log("mailchannels resp", resp.status, t);
      return { ok: resp.ok as const, msg: t };
    }

    // Prefer Cloudflare Worker (uses MailChannels with CF auth); fallback to direct MailChannels API
    const w = await tryWorker();
    if (!w.ok) {
      const m = await tryMailChannels();
      if (!m.ok) return new Response(`email error: ${w.msg || m.msg || 'unknown'}`, { status: 500 });
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("unhandled:", e);
    return new Response("unhandled error", { status: 500 });
  }
});
