## Tickets App (Next.js + Supabase)

Production-ready monorepo app for ticket management. Built with Next.js App Router (15), React 19, TypeScript, and Supabase (Auth + Postgres + RLS).

Key features
- Tickets list/detail with auto-scroll and focus (desktop + mobile)
- Admin for users (ban/reactivate), toasts everywhere, polished modal UI
- Tasks weekly matrix with realtime updates and manager controls
- Reports with mobile-friendly charts
- Email intake: create tickets from emails via Cloudflare Email Routing → Worker → Next API


## Requirements

- Node 22.14+
- pnpm 10.16+
- Supabase project (URL + anon key + service role key)
- Vercel account (recommended for deploy)


## Environment variables

Create a .env.local (for dev) using refs/.env.example as a template:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (server only)
- INTAKE_SECRET (shared secret for email intake)
- Optional: NEXT_PUBLIC_APP_NAME, NEXT_TELEMETRY_DISABLED

Never expose SUPABASE_SERVICE_ROLE_KEY to the browser. It’s used only in server routes (like the intake API).


## Local development

1) Install deps
	pnpm install

2) Run the dev server
	pnpm dev

3) Typecheck and build
	pnpm types:check
	pnpm build

Open http://localhost:3000


## Deploy to Vercel

1) Push the repository to GitHub (main branch)
2) Import the repo in Vercel
3) Set Environment Variables in Vercel Project Settings → Environment Variables:
	- NEXT_PUBLIC_SUPABASE_URL
	- NEXT_PUBLIC_SUPABASE_ANON_KEY
	- SUPABASE_SERVICE_ROLE_KEY
	- INTAKE_SECRET
4) Deploy. Optionally add a custom domain (e.g., it.paqva.com)

Tip: If a service role key was ever committed locally, rotate it in Supabase and update Vercel.


## Email intake (Cloudflare Email Routing)

Goal: Emails to your address (e.g., itemail@paqva.com) become tickets automatically.

Flow
- Cloudflare Email Routing receives the email
- A Cloudflare Worker (Email) parses the message and POSTs JSON to our Next.js API route
- The API authenticates using the shared INTAKE_SECRET and inserts a ticket with idempotency by message_id

API endpoint
- POST /api/intake/email
  Headers: X-Intake-Secret: <INTAKE_SECRET>
  Body JSON fields accepted:
  - title: string
  - content: string
  - requester_email: string (required)
  - requester_name: string (optional)
  - business_key: string | null (optional code like "GLF")
  - received_at: ISO string (optional)
  - message_id: string | null (used for idempotency)

Worker example
- See refs/email-worker-example.js for a robust example with try/catch and no-throw behavior to avoid bounces.
- Configure Worker environment variables:
  - INTAKE_ENDPOINT = https://<your-domain>/api/intake/email
  - INTAKE_SECRET = same value as in Vercel
  - DOMAIN_BUSINESS_MAP = JSON like {"glf.com":"GLF","paqva.com":"PAQ"}

Important
- Do not throw in the Worker when the upstream fails; accept the message and log. You can retry via a queue if desired.
- The API is idempotent by message_id when provided.


## Database notes (Supabase)

- Tickets table must include columns used by intake route: title, description, status, priority, assigned_to, due_date, business (string), requester_email, requester_name, source, received_at, message_id, created_at
- If you want business/domain mapping in DB, add businesses and business_domains tables and map domains to a business code.
- Enable RLS for user-facing tables; use service role only in server contexts.


## Scripts

- pnpm stack:report — print toolchain versions
- pnpm intake:test — local POST against the intake API using INTAKE_SECRET/INTAKE_ENDPOINT from env


## Troubleshooting

- Build fails on Deno edge functions: they’re excluded from TS via tsconfig.json (supabase/functions/**). Ensure that remains.
- “relation public.businesses does not exist”: create the table or switch business to a string code as this project expects by default.
- Rotate leaked keys immediately in Supabase and update Vercel.
