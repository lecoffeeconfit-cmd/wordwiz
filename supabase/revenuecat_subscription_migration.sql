-- WordWiz Plus: server-enforced monthly free-word allowance and RevenueCat entitlement cache.
-- Apply this in the Supabase SQL editor after wordwiz_schema.sql.

create table if not exists public.word_addition_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  words_added integer not null default 0 check (words_added between 0 and 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, month_key)
);

create table if not exists public.subscription_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plus_is_active boolean not null default false,
  plus_expires_at timestamptz,
  revenuecat_event_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.word_addition_usage enable row level security;
alter table public.subscription_entitlements enable row level security;

drop policy if exists "Users can read their own word addition usage" on public.word_addition_usage;
create policy "Users can read their own word addition usage"
  on public.word_addition_usage for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own subscription entitlement" on public.subscription_entitlements;
create policy "Users can read their own subscription entitlement"
  on public.subscription_entitlements for select
  using (auth.uid() = user_id);

-- All client-created words go through the RPC below. This prevents a client
-- from bypassing the allowance with a direct table insert.
drop policy if exists "Users can insert their own words" on public.words;
create policy "Words are created through the allowance RPC"
  on public.words for insert
  with check (false);

create or replace function public.get_free_word_usage()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_key text := to_char(timezone('UTC', now()), 'YYYY-MM');
  v_words_added integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select words_added into v_words_added
  from public.word_addition_usage
  where user_id = v_user_id and month_key = v_month_key;

  return jsonb_build_object(
    'month_key', v_month_key,
    'words_added', coalesce(v_words_added, 0),
    'limit', 10
  );
end;
$$;

create or replace function public.create_word_with_monthly_limit(p_word jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_key text := to_char(timezone('UTC', now()), 'YYYY-MM');
  v_is_plus boolean := false;
  v_words_added integer;
  v_word public.words;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select coalesce(plus_is_active, false)
      and (plus_expires_at is null or plus_expires_at > now())
    into v_is_plus
  from public.subscription_entitlements
  where user_id = v_user_id;
  v_is_plus := coalesce(v_is_plus, false);

  if not v_is_plus then
    insert into public.word_addition_usage (user_id, month_key, words_added, updated_at)
    values (v_user_id, v_month_key, 1, now())
    on conflict (user_id, month_key) do update
      set words_added = public.word_addition_usage.words_added + 1,
          updated_at = now()
      where public.word_addition_usage.words_added < 10
    returning words_added into v_words_added;

    if not found then
      raise exception 'free_word_limit_reached' using errcode = 'P0001';
    end if;
  end if;

  insert into public.words (
    id, user_id, term, definition, simple_definition, example, context_examples,
    part_of_speech, pronunciation, origin, origin_period, synonyms, antonyms,
    common_words, basic_info, reviews, mastery_data, is_flagged, flagged_at,
    created_at, updated_at
  ) values (
    coalesce(nullif(p_word->>'id', '')::uuid, gen_random_uuid()),
    v_user_id,
    nullif(trim(p_word->>'term'), ''),
    nullif(trim(p_word->>'definition'), ''),
    nullif(p_word->>'simple_definition', ''),
    nullif(trim(p_word->>'example'), ''),
    coalesce(p_word->'context_examples', '[]'::jsonb),
    nullif(p_word->>'part_of_speech', ''),
    nullif(p_word->>'pronunciation', ''),
    nullif(p_word->>'origin', ''),
    nullif(p_word->>'origin_period', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_word->'synonyms', '[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_word->'antonyms', '[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_word->'common_words', '[]'::jsonb))), '{}'),
    nullif(p_word->>'basic_info', ''),
    greatest(coalesce((p_word->>'reviews')::integer, 0), 0),
    coalesce(p_word->'mastery_data', '{}'::jsonb),
    coalesce((p_word->>'is_flagged')::boolean, false),
    case when coalesce((p_word->>'is_flagged')::boolean, false)
      then nullif(p_word->>'flagged_at', '')::timestamptz else null end,
    now(), now()
  ) returning * into v_word;

  return to_jsonb(v_word);
end;
$$;

grant execute on function public.get_free_word_usage() to authenticated;
grant execute on function public.create_word_with_monthly_limit(jsonb) to authenticated;
