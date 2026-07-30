-- Preserve vetted dictionary-source alternatives so advanced quizzes can vary
-- their wording without changing the learner's intended definition.
alter table public.words
  add column if not exists definition_variants jsonb not null default '[]'::jsonb;

-- Keep the server-authoritative creation path in sync with the new word field.
create or replace function public.create_word_with_monthly_limit(p_word jsonb)
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
  v_words_added integer;
  v_word public.words;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
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
    insert into public.word_addition_usage (user_id, month_key, words_added, updated_at)
    values (v_user_id, v_month_key, 1, v_now)
    on conflict (user_id, month_key) do update
      set words_added = public.word_addition_usage.words_added + 1,
          updated_at = excluded.updated_at
      where public.word_addition_usage.words_added < 10
    returning words_added into v_words_added;

    if not found then
      raise exception 'free_word_limit_reached' using errcode = 'P0001';
    end if;
  end if;

  insert into public.words (
    id, user_id, term, definition, simple_definition, definition_variants,
    example, context_examples, part_of_speech, pronunciation, origin,
    origin_period, synonyms, antonyms, common_words, basic_info, reviews,
    mastery_data, is_flagged, flagged_at, created_at, updated_at
  ) values (
    coalesce(nullif(p_word->>'id', '')::uuid, gen_random_uuid()),
    v_user_id,
    nullif(trim(p_word->>'term'), ''),
    nullif(trim(p_word->>'definition'), ''),
    nullif(p_word->>'simple_definition', ''),
    coalesce(p_word->'definition_variants', '[]'::jsonb),
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
    v_now, v_now
  ) returning * into v_word;

  return to_jsonb(v_word);
end;
$$;

grant execute on function public.create_word_with_monthly_limit(jsonb) to authenticated;
notify pgrst, 'reload schema';
