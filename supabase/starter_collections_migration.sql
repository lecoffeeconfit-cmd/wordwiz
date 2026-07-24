-- WordWiz: fast, removable starter collections.
-- Apply this once in the Supabase SQL editor after automatic_trial_migration.sql.
-- Collection saves remain server-enforced: a free account cannot bypass its
-- monthly allowance by sending a larger client-side batch.
create or replace function public.create_words_with_monthly_limit(p_words jsonb)
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
  v_current_usage integer := 0;
  v_requested_count integer := coalesce(jsonb_array_length(p_words), 0);
  v_payload jsonb;
  v_word public.words;
  v_saved_words jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_words) <> 'array' or v_requested_count < 1 or v_requested_count > 60 then
    raise exception 'invalid_collection_size' using errcode = '22023';
  end if;

  insert into public.subscription_entitlements (
    user_id, trial_started_at, trial_expires_at, updated_at
  ) values (
    v_user_id, now(), now() + interval '30 days', now()
  )
  on conflict (user_id) do update
    set trial_started_at = coalesce(public.subscription_entitlements.trial_started_at, excluded.trial_started_at),
        trial_expires_at = coalesce(public.subscription_entitlements.trial_expires_at, excluded.trial_expires_at),
        updated_at = now();

  select
    coalesce(plus_is_active, false) and (plus_expires_at is null or plus_expires_at > now()),
    coalesce(trial_expires_at > now(), false)
    into v_is_plus, v_is_trial
  from public.subscription_entitlements
  where user_id = v_user_id;

  if not (coalesce(v_is_plus, false) or coalesce(v_is_trial, false)) then
    select coalesce(words_added, 0) into v_current_usage
    from public.word_addition_usage
    where user_id = v_user_id and month_key = v_month_key;

    if coalesce(v_current_usage, 0) + v_requested_count > 10 then
      raise exception 'free_word_limit_reached' using errcode = 'P0001';
    end if;

    insert into public.word_addition_usage (user_id, month_key, words_added, updated_at)
    values (v_user_id, v_month_key, v_requested_count, now())
    on conflict (user_id, month_key) do update
      set words_added = public.word_addition_usage.words_added + excluded.words_added,
          updated_at = now();
  end if;

  for v_payload in select value from jsonb_array_elements(p_words)
  loop
    insert into public.words (
      id, user_id, term, definition, simple_definition, example, context_examples,
      part_of_speech, pronunciation, origin, origin_period, synonyms, antonyms,
      common_words, basic_info, reviews, mastery_data, is_flagged, flagged_at,
      created_at, updated_at
    ) values (
      coalesce(nullif(v_payload->>'id', '')::uuid, gen_random_uuid()),
      v_user_id,
      nullif(trim(v_payload->>'term'), ''),
      nullif(trim(v_payload->>'definition'), ''),
      nullif(v_payload->>'simple_definition', ''),
      nullif(trim(v_payload->>'example'), ''),
      coalesce(v_payload->'context_examples', '[]'::jsonb),
      nullif(v_payload->>'part_of_speech', ''),
      nullif(v_payload->>'pronunciation', ''),
      nullif(v_payload->>'origin', ''),
      nullif(v_payload->>'origin_period', ''),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_payload->'synonyms', '[]'::jsonb))), '{}'),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_payload->'antonyms', '[]'::jsonb))), '{}'),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_payload->'common_words', '[]'::jsonb))), '{}'),
      nullif(v_payload->>'basic_info', ''),
      greatest(coalesce((v_payload->>'reviews')::integer, 0), 0),
      coalesce(v_payload->'mastery_data', '{}'::jsonb),
      coalesce((v_payload->>'is_flagged')::boolean, false),
      case when coalesce((v_payload->>'is_flagged')::boolean, false)
        then nullif(v_payload->>'flagged_at', '')::timestamptz else null end,
      now(), now()
    ) returning * into v_word;

    v_saved_words := v_saved_words || jsonb_build_array(to_jsonb(v_word));
  end loop;

  return v_saved_words;
end;
$$;

create or replace function public.set_study_set_membership(
  p_word_ids uuid[],
  p_membership jsonb,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership_id text := nullif(trim(p_membership->>'id'), '');
  v_membership_name text := nullif(trim(p_membership->>'name'), '');
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if coalesce(array_length(p_word_ids, 1), 0) = 0 or v_membership_id is null or v_membership_name is null then
    raise exception 'invalid_study_set_membership' using errcode = '22023';
  end if;

  if p_enabled then
    update public.words
    set mastery_data = jsonb_set(
      coalesce(mastery_data, '{}'::jsonb),
      '{studySets}',
      coalesce(mastery_data->'studySets', '[]'::jsonb) || jsonb_build_array(p_membership),
      true
    ), updated_at = now()
    where user_id = v_user_id
      and id = any(p_word_ids)
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(mastery_data->'studySets', '[]'::jsonb)) existing_membership
        where existing_membership->>'id' = v_membership_id
      );
  else
    update public.words
    set mastery_data = jsonb_set(
      coalesce(mastery_data, '{}'::jsonb),
      '{studySets}',
      coalesce((
        select jsonb_agg(existing_membership)
        from jsonb_array_elements(coalesce(mastery_data->'studySets', '[]'::jsonb)) existing_membership
        where existing_membership->>'id' <> v_membership_id
      ), '[]'::jsonb),
      true
    ), updated_at = now()
    where user_id = v_user_id and id = any(p_word_ids);
  end if;
end;
$$;

grant execute on function public.create_words_with_monthly_limit(jsonb) to authenticated;
grant execute on function public.set_study_set_membership(uuid[], jsonb, boolean) to authenticated;
