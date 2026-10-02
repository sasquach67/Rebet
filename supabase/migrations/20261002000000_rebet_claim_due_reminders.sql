-- Atomic reminder claiming for the send-reminders Edge Function (service_role only).
-- Not applied to any hosted project by this file's authoring. Review, then apply.
--
-- A bet is due when it is pending, not deleted, has a game time that has not
-- started, and now >= game_start - lead. Lead is the bet's own lead_hours, else
-- the owner's settings.lead_hours; settings.second_lead_hours adds a later slot.
-- If several slots are due at once only the latest is claimed (no burst of emails
-- for a signal that arrives late). Claims are rows in reminders_sent; the unique
-- key makes concurrent runs safe. Stale 'sending' leases and 'failed' rows with
-- fewer than 3 attempts are re-claimed until the game starts.
begin;

create function public.rebet_claim_due_reminders(
  p_now timestamptz default now(),
  p_channels text[] default array['email'],
  p_limit integer default 100,
  p_lease interval default interval '5 minutes'
) returns table (
  o_claim_id uuid, o_user_id uuid, o_bet_id text, o_channel text, o_delivery_key text,
  o_scheduled_for timestamptz, o_game_start timestamptz, o_attempts integer,
  o_title text, o_pick text, o_league text, o_units numeric, o_odds integer,
  o_email text, o_signal_tz text, o_display_tz text
)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with slots as (
    select distinct on (b.user_id, b.id)
           b.user_id, b.id as bet_id, b.game_start,
           b.game_start - make_interval(secs => (h.hours * 3600)::double precision) as scheduled_for,
           s.email_reminders, s.push_reminders
      from public.bets b
      join public.settings s on s.user_id = b.user_id
      cross join lateral (values (coalesce(b.lead_hours, s.lead_hours)), (s.second_lead_hours)) as h(hours)
     where b.status = 'pending' and b.deleted_at is null and b.has_time
       and b.game_start > p_now and h.hours is not null
       and p_now >= b.game_start - make_interval(secs => (h.hours * 3600)::double precision)
     order by b.user_id, b.id, 4 desc
  ), targets as (
    select sl.user_id, sl.bet_id, sl.game_start, sl.scheduled_for, 'email'::text as channel, 'email'::text as delivery_key
      from slots sl where sl.email_reminders and 'email' = any (p_channels)
    union all
    select sl.user_id, sl.bet_id, sl.game_start, sl.scheduled_for, 'push'::text, ps.id::text
      from slots sl join public.push_subscriptions ps on ps.user_id = sl.user_id
     where sl.push_reminders and 'push' = any (p_channels)
       and (ps.expiration_time is null or ps.expiration_time > p_now)
  ), limited as (
    select * from targets order by game_start, user_id, bet_id limit p_limit
  ), ins as (
    insert into public.reminders_sent as r (user_id, bet_id, channel, delivery_key, scheduled_for, game_start,
                                            status, attempts, lease_until)
    select l.user_id, l.bet_id, l.channel, l.delivery_key, l.scheduled_for, l.game_start,
           'sending', 1, p_now + p_lease
      from limited l
    on conflict (user_id, bet_id, channel, delivery_key, scheduled_for) do nothing
    returning r.id, r.user_id, r.bet_id, r.channel, r.delivery_key, r.scheduled_for, r.game_start, r.attempts
  ), re as (
    update public.reminders_sent r
       set status = 'sending', attempts = r.attempts + 1, lease_until = p_now + p_lease, last_error = null
      from public.bets b
     where b.user_id = r.user_id and b.id = r.bet_id
       and b.status = 'pending' and b.deleted_at is null and b.game_start > p_now
       and r.game_start > p_now and r.channel = any (p_channels) and r.attempts < 3
       and ((r.status = 'sending' and r.lease_until < p_now) or r.status = 'failed')
       and not exists (select 1 from ins i where i.id = r.id)
    returning r.id, r.user_id, r.bet_id, r.channel, r.delivery_key, r.scheduled_for, r.game_start, r.attempts
  ), claimed as (
    select * from ins union all select * from re
  )
  select c.id, c.user_id, c.bet_id, c.channel, c.delivery_key, c.scheduled_for, c.game_start, c.attempts,
         b.title, b.pick, b.league, b.units, b.odds, u.email::text, s.signal_tz, s.display_tz
    from claimed c
    join public.bets b on b.user_id = c.user_id and b.id = c.bet_id
    join public.settings s on s.user_id = c.user_id
    left join auth.users u on u.id = c.user_id
   order by c.game_start, c.user_id, c.bet_id;
end;
$$;

revoke all on function public.rebet_claim_due_reminders(timestamptz, text[], integer, interval)
  from public, anon, authenticated;
grant execute on function public.rebet_claim_due_reminders(timestamptz, text[], integer, interval) to service_role;

commit;
