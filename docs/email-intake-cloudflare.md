# Email intake with Cloudflare Email Routing

Goal: Convert emails sent to `info@paqva.com` into tickets automatically.

This repo already includes an intake API at `src/app/api/intake/email/route.ts` and a Cloudflare Email Worker (`cloudflare/email-worker.js`). Follow these steps to wire it up.

## 1) Configure the intake API secret

Set the same secret in both your Next.js server and the Cloudflare Worker.

- Next.js (server env): `INTAKE_SECRET="<a-strong-random-string>"`
- Optional domain mapping on server (fallback): `INTAKE_DOMAIN_BUSINESS_MAP='{"paqva.com":"PAQVA"}'`

The server-side Supabase keys must also be configured (already used by the API):
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 2) Deploy the Cloudflare Worker

Files:
- `cloudflare/email-worker.js`: Worker source
- `cloudflare/wrangler.toml`: Worker config

Set Worker environment variables in Cloudflare (Dashboard → Workers & Pages → your Worker → Settings → Variables):
- `INTAKE_ENDPOINT = https://<your-domain>/api/intake/email`
- `INTAKE_SECRET = <same as step 1>`
- (optional) `DOMAIN_BUSINESS_MAP = {"paqva.com":"PAQVA"}`

Then associate Email Routing to the Worker (Dashboard → Email → Routes):
- Create a route: `info@paqva.com` → Action: Deliver to Worker → select your Worker

Notes:
- The Worker never throws on failures to avoid bouncing the email; it logs errors.
- The Worker prefers the plain text body and truncates to 20k chars.

## 3) Sanity checks

- Hit GET on the intake endpoint to verify it responds (no auth required):
  - `GET https://<your-domain>/api/intake/email`
- POST a test payload locally:
  - Set env vars `INTAKE_ENDPOINT` and `INTAKE_SECRET`
  - Run: `pnpm intake:test`

Expected:
- 201 response with `{ id: <ticket_id> }`
- A new row in `tickets` with `source = 'email'` and your payload fields.

## 4) Attachments (optional)

This initial setup ignores attachments. If you want to store attachments:
- In the Worker, iterate `message.attachments` and upload to Supabase Storage.
- Include a list of uploaded files in the payload (e.g. `attachments: [{name, url, size}]`).
- Extend the intake API to persist them (e.g. `ticket_attachments` table).

## 5) Security

- The intake API validates a shared secret via `X-Intake-Secret`.
- Do not expose Supabase service keys in the Worker.
- Keep Email Worker logging minimal; avoid printing the entire email body in production.

## 6) Alternatives

- Supabase Edge Function `inbound-email` is available for direct inbound webhook providers (SendGrid/Mailgun/Postmark). Cloudflare Email Workers + Intake API is recommended here because it keeps secrets server-side and uses a single path.
