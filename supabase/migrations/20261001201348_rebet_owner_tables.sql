-- Prepared locally. Do not apply until the intended Rebet project is identified.
-- Fail on conflicting table names rather than altering an unrelated app's tables.
begin;

create table public.bets (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 128),
  title text not null,
  pick text not null default '',
  league text not null default '',
  market text not null default '',
  bet_key text not null default '',
  game_start timestamptz,
  has_time boolean not null default false,
  units numeric check (units >= 0 and units <= 1000000),
  odds integer check (abs(odds::bigint) between 100 and 1000000),
  lead_hours numeric check (lead_hours between 0 and 168),
  status text not null default 'pending'
    check (status in ('pending','placed','won','lost','push','skipped')),
  notes text not null default '',
  signal jsonb not null default '{}'::jsonb check (jsonb_typeof(signal) = 'object'),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  primary key (user_id, id),
  check (has_time = (game_start is not null))
);
create index bets_pending_start_idx on public.bets (game_start, user_id)
  where status = 'pending' and deleted_at is null and has_time;
create index bets_owner_key_idx on public.bets (user_id, bet_key) where bet_key <> '';

create table public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  signal_tz text not null default 'America/New_York',
  display_tz text,
  lead_hours numeric not null default 3 check (lead_hours between 0 and 168),
  second_lead_hours numeric check (second_lead_hours between 0 and 168),
  default_odds integer not null default -110 check (abs(default_odds::bigint) between 100 and 1000000),
  email_reminders boolean not null default false,
  push_reminders boolean not null default false,
  updated_at timestamptz not null default now(),
  revision bigint not null default 1
);

create table public.push_subscriptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  endpoint text not null check (endpoint ~ '^https://' and length(endpoint) <= 2048),
  p256dh text not null check (length(p256dh) between 1 and 256),
  auth text not null check (length(auth) between 1 and 256),
  expiration_time timestamptz,
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  primary key (user_id, id),
  unique (user_id, endpoint)
);

create table public.reminders_sent (
  user_id uuid not null,
  id uuid not null default gen_random_uuid(),
  bet_id text not null,
  channel text not null check (channel in ('email', 'push')),
  -- 'email' or the push subscription id. One independent delivery per device.
  delivery_key text not null,
  scheduled_for timestamptz not null,
  game_start timestamptz not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  lease_until timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, bet_id) references public.bets(user_id, id) on delete cascade,
  unique (user_id, bet_id, channel, delivery_key, scheduled_for)
);

-- Server revisions support conditional updates: a stale offline device must
-- detect a conflict rather than silently overwrite a newer cloud edit.
create function public.rebet_touch_row() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  new.revision := case when tg_op = 'INSERT' then 1 else old.revision + 1 end;
  return new;
end;
$$;
revoke all on function public.rebet_touch_row() from public, anon, authenticated;

create trigger bets_touch before insert or update on public.bets
  for each row execute function public.rebet_touch_row();
create trigger settings_touch before insert or update on public.settings
  for each row execute function public.rebet_touch_row();
create trigger push_subscriptions_touch before insert or update on public.push_subscriptions
  for each row execute function public.rebet_touch_row();

alter table public.bets enable row level security;
alter table public.settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminders_sent enable row level security;

create policy bets_owner on public.bets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy settings_owner on public.settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy push_subscriptions_owner on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy reminders_owner_read on public.reminders_sent for select to authenticated
  using ((select auth.uid()) = user_id);

-- Explicit grants are needed for current Supabase Data API behavior. RLS is
-- enabled first; public/anonymous callers get no table access.
revoke all on public.bets, public.settings, public.push_subscriptions, public.reminders_sent
  from public, anon, authenticated;
grant select, insert, update, delete on public.bets, public.settings, public.push_subscriptions to authenticated;
grant select on public.reminders_sent to authenticated;
grant select, insert, update, delete on public.bets, public.settings, public.push_subscriptions, public.reminders_sent to service_role;

commit;
