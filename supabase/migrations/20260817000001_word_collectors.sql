-- Word Collectors is deliberately independent from Social XP and the existing
-- Connect rank tiers. A permanent normalized-term ledger prevents a learner
-- from increasing their score by deleting and re-adding a saved word.
--
-- Historical entries use each word's persisted creation time. That makes
-- Week/Month totals accurate where the existing data permits it, without
-- inventing dates for words that were never stored in the cloud.

create table if not exists public.word_collector_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  normalized_term text not null check (char_length(normalized_term) between 1 and 240),
  first_added_at timestamptz not null,
  source_word_id uuid references public.words(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, normalized_term)
);

-- These are private, coarse competition keys only. They are never selected by
-- a public leaderboard RPC: exact coordinates, addresses, and distances are
-- neither stored nor exposed.
create table if not exists public.word_collector_regions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  area_key text,
  state_key text,
  updated_at timestamptz not null default now(),
  check (area_key is null or area_key ~ '^[a-z0-9_-]{3,64}$'),
  check (state_key is null or state_key ~ '^[a-z0-9_-]{3,96}$')
);

create index if not exists word_collector_entries_period_idx
  on public.word_collector_entries (first_added_at, user_id);
create index if not exists word_collector_entries_user_first_added_idx
  on public.word_collector_entries (user_id, first_added_at);
create index if not exists word_collector_regions_area_idx
  on public.word_collector_regions (area_key, user_id) where area_key is not null;
create index if not exists word_collector_regions_state_idx
  on public.word_collector_regions (state_key, user_id) where state_key is not null;

alter table public.word_collector_entries enable row level security;
alter table public.word_collector_regions enable row level security;

-- There intentionally are no direct client policies for either table. The
-- trigger and narrowly-scoped security-definer functions below are the only
-- paths that can create counts or save a private coarse region.

create or replace function public.word_collector_normalize_term(p_term text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(btrim(coalesce(p_term, '')), '[[:space:]]+', ' ', 'g'));
$$;

create or replace function public.word_collector_record_word()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term text := public.word_collector_normalize_term(new.term);
begin
  -- Curated WordWiz starter collections are useful learning material, but are
  -- never competitive collector credit. Existing personal words have no
  -- librarySource and intentionally remain eligible for backward compatibility.
  if coalesce(new.mastery_data ->> 'librarySource', 'personal') = 'collection' then
    return new;
  end if;

  if v_term = '' then
    return new;
  end if;

  insert into public.word_collector_entries (user_id, normalized_term, first_added_at, source_word_id)
  values (new.user_id, v_term, new.created_at, new.id)
  on conflict (user_id, normalized_term) do nothing;

  return new;
end;
$$;

drop trigger if exists word_collector_words_insert on public.words;
create trigger word_collector_words_insert
after insert on public.words
for each row execute function public.word_collector_record_word();

-- Backfill only cloud words that are already known to be personal. The primary
-- key keeps this safe to run repeatedly and preserves the earliest saved date.
insert into public.word_collector_entries (user_id, normalized_term, first_added_at, source_word_id)
select distinct on (w.user_id, public.word_collector_normalize_term(w.term))
  w.user_id,
  public.word_collector_normalize_term(w.term),
  w.created_at,
  w.id
from public.words w
where coalesce(w.mastery_data ->> 'librarySource', 'personal') <> 'collection'
  and public.word_collector_normalize_term(w.term) <> ''
order by w.user_id, public.word_collector_normalize_term(w.term), w.created_at, w.id
on conflict (user_id, normalized_term) do update
set first_added_at = least(public.word_collector_entries.first_added_at, excluded.first_added_at),
    source_word_id = coalesce(public.word_collector_entries.source_word_id, excluded.source_word_id);

create or replace function public.word_collectors_set_my_location(
  p_area_key text,
  p_state_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_area_key text := lower(trim(p_area_key));
  v_state_key text := nullif(lower(trim(coalesce(p_state_key, ''))), '');
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if v_area_key !~ '^[a-z0-9_-]{3,64}$'
    or (v_state_key is not null and v_state_key !~ '^[a-z0-9_-]{3,96}$') then
    raise exception 'invalid_collector_region' using errcode = '22023';
  end if;

  insert into public.word_collector_regions (user_id, area_key, state_key, updated_at)
  values (v_user_id, v_area_key, v_state_key, now())
  on conflict (user_id) do update
  set area_key = excluded.area_key,
      state_key = excluded.state_key,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.word_collectors_leaderboard(
  p_period text default 'week',
  p_scope text default 'all',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_area_key text;
  v_state_key text;
begin
  if v_me is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_period not in ('week', 'month', 'all_time') then
    raise exception 'invalid_collector_period' using errcode = '22023';
  end if;
  if p_scope not in ('all', 'nearby', 'state', 'global') then
    raise exception 'invalid_collector_scope' using errcode = '22023';
  end if;

  select area_key, state_key into v_area_key, v_state_key
  from public.word_collector_regions where user_id = v_me;
  if p_scope = 'nearby' and v_area_key is null then
    raise exception 'collector_location_required' using errcode = 'P0001';
  end if;
  if p_scope = 'state' and v_state_key is null then
    raise exception 'collector_location_required' using errcode = 'P0001';
  end if;

  return (
    with bounds as (
      select case p_period
        when 'week' then date_trunc('week', timezone('UTC', now()))
        when 'month' then date_trunc('month', timezone('UTC', now()))
        else null
      end as since_at
    ),
    totals as (
      select e.user_id, count(*)::bigint as word_count, min(e.first_added_at) as first_added_at
      from public.word_collector_entries e cross join bounds b
      where p_period = 'all_time' or e.first_added_at >= b.since_at
      group by e.user_id
    ),
    ranked as (
      select
        p.user_id,
        p.public_id,
        p.display_name,
        p.avatar_path,
        t.word_count,
        row_number() over (order by t.word_count desc, t.first_added_at asc, p.public_id asc) as rank
      from totals t
      join public.community_profiles p on p.user_id = t.user_id
      left join public.word_collector_regions r on r.user_id = p.user_id
      where p.profile_visible and p.leaderboard_opt_in and p.leaderboard_eligible
        and (
          p_scope in ('all', 'global')
          or (p_scope = 'nearby' and r.area_key = v_area_key)
          or (p_scope = 'state' and r.state_key = v_state_key)
        )
    ),
    page as (
      select * from ranked
      order by rank
      limit least(greatest(p_limit, 1), 50)
      offset greatest(p_offset, 0)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'rank', rank,
      'publicId', public_id,
      'displayName', display_name,
      'avatarPath', avatar_path,
      'wordCount', word_count,
      'isMe', user_id = v_me
    ) order by rank), '[]'::jsonb)
    from page
  );
end;
$$;

create or replace function public.word_collectors_my_context(
  p_period text default 'week',
  p_scope text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_area_key text;
  v_state_key text;
  v_eligible boolean := false;
begin
  if v_me is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_period not in ('week', 'month', 'all_time') then
    raise exception 'invalid_collector_period' using errcode = '22023';
  end if;
  if p_scope not in ('all', 'nearby', 'state', 'global') then
    raise exception 'invalid_collector_scope' using errcode = '22023';
  end if;

  select area_key, state_key into v_area_key, v_state_key
  from public.word_collector_regions where user_id = v_me;
  select coalesce(profile_visible and leaderboard_opt_in and leaderboard_eligible, false)
  into v_eligible
  from public.community_profiles where user_id = v_me;

  return (
    with bounds as (
      select case p_period
        when 'week' then date_trunc('week', timezone('UTC', now()))
        when 'month' then date_trunc('month', timezone('UTC', now()))
        else null
      end as since_at
    ),
    totals as (
      select e.user_id, count(*)::bigint as word_count, min(e.first_added_at) as first_added_at
      from public.word_collector_entries e cross join bounds b
      where p_period = 'all_time' or e.first_added_at >= b.since_at
      group by e.user_id
    ),
    ranked as (
      select
        p.user_id,
        t.word_count,
        row_number() over (order by t.word_count desc, t.first_added_at asc, p.public_id asc) as rank
      from totals t
      join public.community_profiles p on p.user_id = t.user_id
      left join public.word_collector_regions r on r.user_id = p.user_id
      where p.profile_visible and p.leaderboard_opt_in and p.leaderboard_eligible
        and (
          p_scope in ('all', 'global')
          or (p_scope = 'nearby' and r.area_key = v_area_key)
          or (p_scope = 'state' and r.state_key = v_state_key)
        )
    )
    select jsonb_build_object(
      'eligible', v_eligible,
      'hasLocation', case p_scope
        when 'nearby' then v_area_key is not null
        when 'state' then v_state_key is not null
        else true
      end,
      'rank', (select rank from ranked where user_id = v_me),
      'wordCount', coalesce((select word_count from ranked where user_id = v_me), 0),
      'totalUsers', (select count(*) from ranked)
    )
  );
end;
$$;

create or replace function public.word_collectors_my_rank(
  p_period text default 'week',
  p_scope text default 'all',
  p_radius integer default 3
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_area_key text;
  v_state_key text;
  v_rank bigint;
begin
  if v_me is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_period not in ('week', 'month', 'all_time') then
    raise exception 'invalid_collector_period' using errcode = '22023';
  end if;
  if p_scope not in ('all', 'nearby', 'state', 'global') then
    raise exception 'invalid_collector_scope' using errcode = '22023';
  end if;

  select area_key, state_key into v_area_key, v_state_key
  from public.word_collector_regions where user_id = v_me;
  if (p_scope = 'nearby' and v_area_key is null) or (p_scope = 'state' and v_state_key is null) then
    raise exception 'collector_location_required' using errcode = 'P0001';
  end if;

  with bounds as (
    select case p_period
      when 'week' then date_trunc('week', timezone('UTC', now()))
      when 'month' then date_trunc('month', timezone('UTC', now()))
      else null
    end as since_at
  ),
  totals as (
    select e.user_id, count(*)::bigint as word_count, min(e.first_added_at) as first_added_at
    from public.word_collector_entries e cross join bounds b
    where p_period = 'all_time' or e.first_added_at >= b.since_at
    group by e.user_id
  ),
  ranked as (
    select
      p.user_id,
      p.public_id,
      p.display_name,
      p.avatar_path,
      t.word_count,
      row_number() over (order by t.word_count desc, t.first_added_at asc, p.public_id asc) as rank
    from totals t
    join public.community_profiles p on p.user_id = t.user_id
    left join public.word_collector_regions r on r.user_id = p.user_id
    where p.profile_visible and p.leaderboard_opt_in and p.leaderboard_eligible
      and (
        p_scope in ('all', 'global')
        or (p_scope = 'nearby' and r.area_key = v_area_key)
        or (p_scope = 'state' and r.state_key = v_state_key)
      )
  )
  select rank into v_rank from ranked where user_id = v_me;

  if v_rank is null then
    return '[]'::jsonb;
  end if;

  return (
    with bounds as (
      select case p_period
        when 'week' then date_trunc('week', timezone('UTC', now()))
        when 'month' then date_trunc('month', timezone('UTC', now()))
        else null
      end as since_at
    ),
    totals as (
      select e.user_id, count(*)::bigint as word_count, min(e.first_added_at) as first_added_at
      from public.word_collector_entries e cross join bounds b
      where p_period = 'all_time' or e.first_added_at >= b.since_at
      group by e.user_id
    ),
    ranked as (
      select
        p.user_id,
        p.public_id,
        p.display_name,
        p.avatar_path,
        t.word_count,
        row_number() over (order by t.word_count desc, t.first_added_at asc, p.public_id asc) as rank
      from totals t
      join public.community_profiles p on p.user_id = t.user_id
      left join public.word_collector_regions r on r.user_id = p.user_id
      where p.profile_visible and p.leaderboard_opt_in and p.leaderboard_eligible
        and (
          p_scope in ('all', 'global')
          or (p_scope = 'nearby' and r.area_key = v_area_key)
          or (p_scope = 'state' and r.state_key = v_state_key)
        )
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'rank', rank,
      'publicId', public_id,
      'displayName', display_name,
      'avatarPath', avatar_path,
      'wordCount', word_count,
      'isMe', user_id = v_me
    ) order by rank), '[]'::jsonb)
    from ranked
    where rank between greatest(1, v_rank - least(greatest(p_radius, 1), 5))
      and v_rank + least(greatest(p_radius, 1), 5)
  );
end;
$$;

revoke all on function public.word_collectors_set_my_location(text, text), public.word_collectors_leaderboard(text, text, integer, integer), public.word_collectors_my_context(text, text), public.word_collectors_my_rank(text, text, integer) from public;
grant execute on function public.word_collectors_set_my_location(text, text), public.word_collectors_leaderboard(text, text, integer, integer), public.word_collectors_my_context(text, text), public.word_collectors_my_rank(text, text, integer) to authenticated;

notify pgrst, 'reload schema';
