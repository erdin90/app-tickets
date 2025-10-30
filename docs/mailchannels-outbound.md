# Outbound email via Cloudflare + MailChannels

This project now sends status-change emails using MailChannels instead of Resend.

Two supported paths:

1) Cloudflare Worker (recommended)
   - Deploy `refs/outbound-mail-worker.js` as an HTTP Worker.
   - Set Worker vars:
     - `FROM` (e.g. `Soporte <soporte@paqva.com>`)
     - `REPLY_TO` (optional)
     - `AUTH_SECRET` (random string)
     - `ALLOW_ORIGIN` (optional CORS for browser testing)
   - In Supabase Edge Function environment (on-ticket-status), set:
     - `SEND_EMAIL_WORKER_URL` to the Worker URL
     - `MAILCHANNELS_FROM` (same as Worker FROM for consistency)
     - `MAILCHANNELS_REPLY_TO` (optional)
   - The Supabase function POSTs `{ to, subject, text, html }` to the Worker, which relays to MailChannels.

2) Direct MailChannels HTTP API (fallback)
   - If the Worker is not configured, the function posts directly to `https://api.mailchannels.net/tx/v1/send`.
   - NOTE: MailChannels free tier is optimized for Cloudflare Workers; sending directly may require domain authentication and can be rate limited by MailChannels. Prefer using the Worker.

## DNS and deliverability
- Ensure the `FROM` domain has valid SPF and DKIM records. If you use Cloudflare Email Routing/Workers with MailChannels, add the TXT records Cloudflare suggests.
- Set a valid `Reply-To` if you expect replies.

## Where the change lives
- Supabase Edge Function: `supabase/functions/on-ticket-status/index.ts`
- Cloudflare Worker example: `refs/outbound-mail-worker.js`

## Trigger
The `on-ticket-status` function expects a database webhook or trigger on `tickets` updates. It sends an email when a ticket transitions from `new/open` to `pending/in_progress`.
