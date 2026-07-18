-- WordWiz: automatic 30-day, no-card learning trial.
-- Apply this after revenuecat_subscription_migration.sql in the Supabase SQL editor.
-- Apple subscription trials remain opt-in; this server-side trial is WordWiz access
-- that begins the first time a signed-in learner uses the app.

alter table public.subscription_entitlements
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_expires_at timestamptz;

create or replace function public.get_trial_access()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trial_started_at timestamptz;
  v_trial_expires_at timestamptz;
  v_trial_active boolean := false;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  insert into public.subscription_entitlements (
    user_id,
    trial_started_at,
    trial_expires_at,
    updated_at
  ) values (
    v_user_id,
    now(),
    now() + interval '30 days',
    now()
  )
  on conflict (user_id) do update
    set trial_started_at = coalesce(
          public.subscription_entitlements.trial_started_at,
          excluded.trial_started_at
        ),
        trial_expires_at = coalesce(
          public.subscription_entitlements.trial_expires_at,
          excluded.trial_expires_at
        ),
        updated_at = now()
  returning trial_started_at, trial_expires_at
    into v_trial_started_at, v_trial_expires_at;

  v_trial_active := coalesce(v_trial_expires_at > now(), false);

  return jsonb_build_object(
    'trial_started_at', v_trial_started_at,
    'trial_expires_at', v_trial_expires_at,
    'trial_active', v_trial_active,
    'days_remaining', case
      when v_trial_active then greatest(
        1,
        ceil(extract(epoch from (v_trial_expires_at - now())) / 86400.0)::integer
      )
      else 0
    end
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
  v_is_trial boolean := false;
  v_words_added integer;
  v_word public.words;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- Start the automatic trial here too, so the server remains authoritative even
  -- if a client has not yet refreshed its trial display.
  insert into public.subscription_entitlements (
    user_id,
    trial_started_at,
    trial_expires_at,
    updated_at
  ) values (
    v_user_id,
    now(),
    now() + interval '30 days',
    now()
  )
  on conflict (user_id) do update
    set trial_started_at = coalesce(
          public.subscription_entitlements.trial_started_at,
          excluded.trial_started_at
        ),
        trial_expires_at = coalesce(
          public.subscription_entitlements.trial_expires_at,
          excluded.trial_expires_at
        ),
        updated_at = now();

  select
    coalesce(plus_is_active, false)
      and (plus_expires_at is null or plus_expires_at > now()),
    coalesce(trial_expires_at > now(), false)
    into v_is_plus, v_is_trial
  from public.subscription_entitlements
  where user_id = v_user_id;
  v_is_plus := coalesce(v_is_plus, false);
  v_is_trial := coalesce(v_is_trial, false);

  if not (v_is_plus or v_is_trial) then
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

grant execute on function public.get_trial_access() to authenticated;
grant execute on function public.create_word_with_monthly_limit(jsonb) to authenticated;
