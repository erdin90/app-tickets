-- Idempotent SQL for roles, profiles auto-creation, refined RLS, and RPC helpers
-- Run in Supabase SQL editor

-- 1) profiles table (create if missing) + role constraint and defaults
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  role text not null default 'user',
  can_create_ticket boolean not null default true,
  locale text,
  timezone text,
  ext jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'profiles_set_updated_at'
  ) then
    create trigger profiles_set_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- role check constraint supports legacy aliases too (manager/client)
do $$ begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'profiles' and constraint_name = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('user','it','admin','manager','client'));
  end if;
end $$;

-- backfill null roles to 'user'
update public.profiles set role = 'user' where role is null;

-- ensure can_create_ticket column exists with default true
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='can_create_ticket'
  ) then
    alter table public.profiles add column can_create_ticket boolean not null default true;
  end if;
end $$;

-- 2) Auto-create profile on new user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Recreate trigger on auth.users
do $$ begin
  if exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
             where t.tgname='on_auth_user_created' and n.nspname='auth' and c.relname='users') then
    drop trigger on_auth_user_created on auth.users;
  end if;
  create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
end $$;

-- 3) Helper role predicates
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role in ('admin','manager')
  );
$$;

create or replace function public.is_it(uid uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role in ('it','technician')
  );
$$;

-- 4) Tickets ownership default (created_by) via trigger
create or replace function public.set_ticket_created_by()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

-- Create trigger if not exists
do $$ begin
  if exists (
    select 1 from pg_class where oid = 'public.tickets'::regclass
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'tickets_set_created_by') then
      create trigger tickets_set_created_by
      before insert on public.tickets
      for each row execute function public.set_ticket_created_by();
    end if;
  end if;
end $$;

-- 5) RLS for tickets: creator can READ; assigned IT can READ/UPDATE; admin full; others: no access
-- Enable RLS
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid='public.tickets'::regclass) THEN
    ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Drop ALL existing policies on tickets (ensures we remove any previous wide-open reads)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN (
    SELECT polname FROM pg_policies WHERE schemaname='public' AND tablename='tickets'
  ) LOOP
    EXECUTE format('DROP POLICY %I ON public.tickets', pol.polname);
  END LOOP;
END $$;

-- SELECT policy
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid='public.tickets'::regclass) THEN
    CREATE POLICY tickets_read_permitted ON public.tickets
      FOR SELECT USING (
        public.is_admin(auth.uid()) OR
        created_by = auth.uid() OR
        assigned_to = auth.uid() OR
        -- IT/technicians can also see unassigned tickets (queue)
        (public.is_it(auth.uid()) AND assigned_to IS NULL) OR
        EXISTS (
          SELECT 1 FROM public.ticket_assignees ta
          WHERE ta.ticket_id = id AND ta.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- INSERT policy (any authenticated can create; created_by enforced by trigger/check)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid='public.tickets'::regclass) THEN
    CREATE POLICY tickets_insert_self ON public.tickets
      FOR INSERT WITH CHECK (
        public.is_admin(auth.uid()) OR (
          (created_by = auth.uid() OR created_by IS NULL)
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.can_create_ticket = true
          )
        )
      );
  END IF;
END $$;

-- UPDATE policy (assignee or admin can update)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid='public.tickets'::regclass) THEN
    CREATE POLICY tickets_update_permitted ON public.tickets
      FOR UPDATE USING (
        public.is_admin(auth.uid()) OR
        assigned_to = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.ticket_assignees ta
          WHERE ta.ticket_id = id AND ta.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- DELETE policy (admin only)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid='public.tickets'::regclass) THEN
    CREATE POLICY tickets_delete_admin ON public.tickets
      FOR DELETE USING (public.is_admin(auth.uid()));
  END IF;
END $$;

-- 6) Optional: RLS for ticket_assignees to avoid leaking assignments
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid='public.ticket_assignees'::regclass) THEN
    ALTER TABLE public.ticket_assignees ENABLE ROW LEVEL SECURITY;

    IF EXISTS (SELECT 1 FROM pg_policy WHERE polname='assignees_read_permitted' AND polrelid='public.ticket_assignees'::regclass) THEN
      DROP POLICY assignees_read_permitted ON public.ticket_assignees;
    END IF;

    CREATE POLICY assignees_read_permitted ON public.ticket_assignees
      FOR SELECT USING (
        public.is_admin(auth.uid()) OR
        EXISTS (
          SELECT 1 FROM public.tickets t
          WHERE t.id = ticket_id AND (
            t.created_by = auth.uid() OR
            t.assigned_to = auth.uid() OR
            public.is_admin(auth.uid()) OR
            EXISTS (
              SELECT 1 FROM public.ticket_assignees ta2
              WHERE ta2.ticket_id = t.id AND ta2.user_id = auth.uid()
            )
          )
        )
      );
  END IF;
END $$;

-- 7) Optional: RLS for ticket_comments to mirror tickets visibility
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid='public.ticket_comments'::regclass) THEN
    ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

    -- Drop existing comment policies for idempotency
    PERFORM 1;
    IF EXISTS (SELECT 1 FROM pg_policy WHERE polname='comments_read_permitted' AND polrelid='public.ticket_comments'::regclass) THEN
      DROP POLICY comments_read_permitted ON public.ticket_comments;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policy WHERE polname='comments_insert_permitted' AND polrelid='public.ticket_comments'::regclass) THEN
      DROP POLICY comments_insert_permitted ON public.ticket_comments;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policy WHERE polname='comments_update_own_or_admin' AND polrelid='public.ticket_comments'::regclass) THEN
      DROP POLICY comments_update_own_or_admin ON public.ticket_comments;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policy WHERE polname='comments_delete_own_or_admin' AND polrelid='public.ticket_comments'::regclass) THEN
      DROP POLICY comments_delete_own_or_admin ON public.ticket_comments;
    END IF;

    -- SELECT: anyone who can see the ticket can read its comments (or admin)
    CREATE POLICY comments_read_permitted ON public.ticket_comments
      FOR SELECT USING (
        public.is_admin(auth.uid()) OR
        EXISTS (
          SELECT 1 FROM public.tickets t
          WHERE t.id = ticket_id AND (
            t.created_by = auth.uid() OR
            t.assigned_to = auth.uid() OR
            public.is_admin(auth.uid()) OR
            EXISTS (
              SELECT 1 FROM public.ticket_assignees ta2
              WHERE ta2.ticket_id = t.id AND ta2.user_id = auth.uid()
            )
          )
        )
      );

    -- INSERT: author must be current user AND user must have access to the ticket
    CREATE POLICY comments_insert_permitted ON public.ticket_comments
      FOR INSERT WITH CHECK (
        author = auth.uid() AND (
          public.is_admin(auth.uid()) OR
          EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_id AND (
              t.created_by = auth.uid() OR
              t.assigned_to = auth.uid() OR
              EXISTS (
                SELECT 1 FROM public.ticket_assignees ta2
                WHERE ta2.ticket_id = t.id AND ta2.user_id = auth.uid()
              )
            )
          )
        )
      );

    -- UPDATE: only the author can edit their comment, or admin
    CREATE POLICY comments_update_own_or_admin ON public.ticket_comments
      FOR UPDATE USING (
        author = auth.uid() OR public.is_admin(auth.uid())
      );

    -- DELETE: only the author can delete their comment, or admin (managers)
    CREATE POLICY comments_delete_own_or_admin ON public.ticket_comments
      FOR DELETE USING (
        author = auth.uid() OR public.is_admin(auth.uid())
      );
  END IF;
END $$;

-- 8) RPC helpers used by the app (SECURITY DEFINER with explicit permission checks)
-- Create ticket securely and return the new id
create or replace function public.create_ticket_secure(
  p_title text,
  p_description text,
  p_status text,
  p_priority text,
  p_assigned_to uuid,
  p_assignees uuid[],
  p_due_date timestamptz,
  p_business text
) returns uuid
language plpgsql
security definer
set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  insert into public.tickets (title, description, status, priority, created_by, assigned_to, due_date, business)
  values (p_title, p_description, p_status, p_priority, v_uid, p_assigned_to, p_due_date, p_business)
  returning id into v_id;

  if p_assignees is not null and array_length(p_assignees, 1) > 0 then
    insert into public.ticket_assignees (ticket_id, user_id)
    select v_id, unnest(p_assignees);
  end if;

  return v_id;
end;
$$;

-- Update ticket status securely (assignee or admin)
create or replace function public.update_ticket_status_secure(
  p_ticket_id uuid,
  p_next text
) returns void
language plpgsql
security definer
set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ok boolean;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select (
    public.is_admin(v_uid) OR
    exists (select 1 from public.tickets t where t.id = p_ticket_id and t.assigned_to = v_uid) OR
    exists (select 1 from public.ticket_assignees ta where ta.ticket_id = p_ticket_id and ta.user_id = v_uid)
  ) into v_ok;

  if not v_ok then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.tickets
  set status = p_next,
      completed_at = case when p_next = 'completed' then now() else null end
  where id = p_ticket_id;
end;
$$;

-- Mark ticket as seen by assignee
create or replace function public.mark_ticket_seen(
  p_ticket_id uuid
) returns void
language plpgsql
security definer
set search_path = public as $$
declare v_uid uuid := auth.uid(); v_ok boolean; begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select (
    public.is_admin(v_uid) OR
    exists (select 1 from public.tickets t where t.id = p_ticket_id and (t.assigned_to = v_uid or t.created_by = v_uid)) OR
    exists (select 1 from public.ticket_assignees ta where ta.ticket_id = p_ticket_id and ta.user_id = v_uid)
  ) into v_ok;

  if not v_ok then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.tickets set seen_by_assignee_at = now() where id = p_ticket_id;
end; $$;

-- Grants
grant execute on function public.create_ticket_secure(text,text,text,text,uuid,uuid[],timestamptz,text) to authenticated;
grant execute on function public.update_ticket_status_secure(uuid,text) to authenticated;
grant execute on function public.mark_ticket_seen(uuid) to authenticated;

-- 9) Profiles RLS: user can read/update own profile; admin can read all
alter table public.profiles enable row level security;

do $$ begin
  if exists (select 1 from pg_policy where polname='profiles_select_own_or_admin' and polrelid='public.profiles'::regclass) then
    drop policy profiles_select_own_or_admin on public.profiles;
  end if;
  if exists (select 1 from pg_policy where polname='profiles_update_own_or_admin' and polrelid='public.profiles'::regclass) then
    drop policy profiles_update_own_or_admin on public.profiles;
  end if;
end $$;

create policy profiles_select_own_or_admin on public.profiles
  for select using (id = auth.uid() or public.is_admin(auth.uid()));

create policy profiles_update_own_or_admin on public.profiles
  for update using (id = auth.uid() or public.is_admin(auth.uid()));
