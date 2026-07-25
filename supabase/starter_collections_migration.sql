-- WordWiz: production-safe starter collections.
-- Apply this after wordwiz_schema.sql, revenuecat_subscription_migration.sql,
-- and final_access_model_migration.sql. It is safe to run more than once.
--
-- Collections are saved in one transaction. A failed import rolls back both
-- the inserted words and any monthly-allowance increment.

alter table public.words
  add column if not exists context_examples jsonb not null default '[]'::jsonb,
  add column if not exists antonyms text[] not null default '{}',
  add column if not exists mastery_data jsonb not null default '{}'::jsonb,
  add column if not exists is_flagged boolean not null default false,
  add column if not exists flagged_at timestamptz;

create or replace function public.create_words_with_monthly_limit(p_words jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_month_key text := to_char(timezone('UTC', v_now), 'YYYY-MM');
  v_is_plus boolean := false;
  v_complimentary_active boolean := false;
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

  insert into public.complimentary_access (
    user_id, complimentary_started_at, complimentary_expires_at
  ) values (
    v_user_id, v_now, v_now + interval '30 days'
  ) on conflict (user_id) do nothing;

  select coalesce(plus_is_active, false)
      and (plus_expires_at is null or plus_expires_at > v_now)
    into v_is_plus
  from public.subscription_entitlements
  where user_id = v_user_id;
  v_is_plus := coalesce(v_is_plus, false);

  select complimentary_expires_at > v_now
    into v_complimentary_active
  from public.complimentary_access
  where user_id = v_user_id;
  v_complimentary_active := coalesce(v_complimentary_active, false);

  if not (v_is_plus or v_complimentary_active) then
    if v_requested_count > 10 then
      raise exception 'free_word_limit_reached' using errcode = 'P0001';
    end if;

    insert into public.word_addition_usage (user_id, month_key, words_added, updated_at)
    values (v_user_id, v_month_key, v_requested_count, v_now)
    on conflict (user_id, month_key) do update
      set words_added = public.word_addition_usage.words_added + excluded.words_added,
          updated_at = excluded.updated_at
      where public.word_addition_usage.words_added + excluded.words_added <= 10;

    if not found then
      raise exception 'free_word_limit_reached' using errcode = 'P0001';
    end if;
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
      v_now, v_now
    ) returning * into v_word;

    v_saved_words := v_saved_words || jsonb_build_array(to_jsonb(v_word));
  end loop;

  return v_saved_words;
end;
$$;

-- A starter collection can include both new words and words the learner had
-- already saved. Keep those two operations in one transaction so a deck never
-- looks complete locally while only part of it reached Supabase.
create or replace function public.add_starter_collection(
  p_words jsonb,
  p_existing_word_ids uuid[],
  p_membership jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_is_plus boolean := false;
  v_complimentary_active boolean := false;
  v_requested_count integer := coalesce(jsonb_array_length(p_words), 0);
  v_existing_word_ids uuid[] := coalesce(p_existing_word_ids, '{}'::uuid[]);
  v_existing_count integer := 0;
  v_membership_id text := nullif(trim(p_membership->>'id'), '');
  v_membership_name text := nullif(trim(p_membership->>'name'), '');
  v_payload jsonb;
  v_word public.words;
  v_saved_words jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_words) <> 'array'
    or v_requested_count > 60
    or v_membership_id is null
    or v_membership_name is null then
    raise exception 'invalid_starter_collection' using errcode = '22023';
  end if;

  if v_requested_count + coalesce(array_length(v_existing_word_ids, 1), 0) < 1 then
    raise exception 'invalid_starter_collection' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_words) payload
    where nullif(trim(payload->>'term'), '') is null
       or nullif(trim(payload->>'definition'), '') is null
       or nullif(trim(payload->>'example'), '') is null
  ) then
    raise exception 'invalid_starter_collection_word' using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select lower(trim(payload->>'term')) as term_key
      from jsonb_array_elements(p_words) payload
    ) terms
    group by term_key
    having count(*) > 1
  ) then
    raise exception 'duplicate_collection_word' using errcode = '23505';
  end if;

  insert into public.complimentary_access (
    user_id, complimentary_started_at, complimentary_expires_at
  ) values (
    v_user_id, v_now, v_now + interval '30 days'
  ) on conflict (user_id) do nothing;

  select coalesce(plus_is_active, false)
      and (plus_expires_at is null or plus_expires_at > v_now)
    into v_is_plus
  from public.subscription_entitlements
  where user_id = v_user_id;
  v_is_plus := coalesce(v_is_plus, false);

  select complimentary_expires_at > v_now
    into v_complimentary_active
  from public.complimentary_access
  where user_id = v_user_id;
  v_complimentary_active := coalesce(v_complimentary_active, false);

  if not (v_is_plus or v_complimentary_active) then
    raise exception 'premium_access_required' using errcode = 'P0001';
  end if;

  select count(*) into v_existing_count
  from public.words
  where user_id = v_user_id and id = any(v_existing_word_ids);

  if v_existing_count <> coalesce(array_length(v_existing_word_ids, 1), 0) then
    raise exception 'collection_words_changed' using errcode = 'P0001';
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
      jsonb_set(
        coalesce(v_payload->'mastery_data', '{}'::jsonb),
        '{studySets}',
        jsonb_build_array(p_membership),
        true
      ),
      coalesce((v_payload->>'is_flagged')::boolean, false),
      case when coalesce((v_payload->>'is_flagged')::boolean, false)
        then nullif(v_payload->>'flagged_at', '')::timestamptz else null end,
      v_now, v_now
    ) returning * into v_word;

    v_saved_words := v_saved_words || jsonb_build_array(to_jsonb(v_word));
  end loop;

  for v_word in
    update public.words
    set mastery_data = case
      when exists (
        select 1
        from jsonb_array_elements(coalesce(mastery_data->'studySets', '[]'::jsonb)) existing_membership
        where existing_membership->>'id' = v_membership_id
      ) then mastery_data
      else jsonb_set(
        coalesce(mastery_data, '{}'::jsonb),
        '{studySets}',
        coalesce(mastery_data->'studySets', '[]'::jsonb) || jsonb_build_array(p_membership),
        true
      )
    end, updated_at = v_now
    where user_id = v_user_id
      and id = any(v_existing_word_ids)
    returning *
  loop
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

  if coalesce(array_length(p_word_ids, 1), 0) = 0
    or v_membership_id is null
    or v_membership_name is null then
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
grant execute on function public.add_starter_collection(jsonb, uuid[], jsonb) to authenticated;
grant execute on function public.set_study_set_membership(uuid[], jsonb, boolean) to authenticated;

-- Make the new collection RPCs available immediately after this migration.
notify pgrst, 'reload schema';
