## Tickets App

Next.js app with Supabase (auth + Postgres + RLS) for ticket management. Profiles include roles (user | it | manager/admin) and per-user permissions to create tickets.

### Prerequisites
- Node 18+
- pnpm 8+
- Supabase project (URL + anon key + service role key)

### Environment variables
Create a `.env.local` file with:

```
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# Needed for server-side ticket creation API (/api/tickets)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

You can copy from `.env.example`.

### Database setup
Apply the idempotent SQL in `refs/sql/2025-10-21-roles-rls-and-rpc.sql` to your Supabase DB. This creates/updates:
- profiles table with role and can_create_ticket
- RLS policies for tickets, comments and assignees
- triggers for profile auto-create and ticket ownership
- helper RPCs with SECURITY DEFINER

### Run locally
- Install deps: `pnpm install`
- Dev server: `pnpm dev`
- Open http://localhost:3000

### Notes
- End-users create tickets through a server route that validates their profile and uses the Supabase service role. Managers can assign on creation; end-users cannot.
- Managers see global counts; IT see assigned-to-me; end-users see only their own tickets.
