-- Longer learner-selected quizzes may intentionally revisit a word when a
-- study group has fewer words than the requested question count. Keep the
-- validation that protects ownership, score integrity, and bounded payloads,
-- but do not reject those deliberate repeated-word reviews.

create or replace function public.community_validate_quiz_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer jsonb;
  v_answer_count integer := 0;
  v_correct_count integer := 0;
  v_game_type text;
  v_game_key text;
  v_game_max_total integer;
  v_is_omega boolean := false;
begin
  if new.score < 0 or new.total < 0 or new.score > new.total then
    raise exception 'invalid_quiz_score' using errcode = '22023';
  end if;
  if new.duration_seconds < 0 or new.duration_seconds > 86400 then
    raise exception 'invalid_quiz_duration' using errcode = '22023';
  end if;
  if jsonb_typeof(new.answers) <> 'array' then
    raise exception 'invalid_quiz_answers' using errcode = '22023';
  end if;

  for v_answer in select value from jsonb_array_elements(new.answers)
  loop
    if jsonb_typeof(v_answer) <> 'object'
      or jsonb_typeof(v_answer -> 'correct') <> 'boolean'
      or coalesce(v_answer ->> 'wordId', '') = '' then
      raise exception 'invalid_quiz_answer' using errcode = '22023';
    end if;

    if (v_answer ->> 'sessionMode') = 'omega-test' then
      v_is_omega := true;
    end if;

    -- An ended-before-start Omega session uses one metadata marker, not a
    -- real answer. It should not make a zero-answer attempt invalid.
    if (v_answer -> 'isAttemptMarker') = 'true'::jsonb then
      continue;
    end if;

    v_answer_count := v_answer_count + 1;
    if (v_answer ->> 'correct')::boolean then
      v_correct_count := v_correct_count + 1;
    end if;

    if left(v_answer ->> 'wordId', 2) <> '__'
      and (v_answer ->> 'wordId') !~ '^starter-[1-3]$'
      and not exists (
        select 1
        from public.words w
        where w.id = (v_answer ->> 'wordId')::uuid
          and w.user_id = new.user_id
      ) then
      raise exception 'quiz_word_not_owned' using errcode = '42501';
    end if;

    if v_answer ? 'gameType' then
      if v_game_type is null then
        v_game_type := v_answer ->> 'gameType';
        v_game_key := v_answer ->> 'gameKey';
      elsif v_game_type <> (v_answer ->> 'gameType')
        or coalesce(v_game_key, '') <> coalesce(v_answer ->> 'gameKey', '') then
        raise exception 'mixed_game_attempt' using errcode = '22023';
      end if;
    elsif v_answer ? 'gameKey' then
      raise exception 'game_key_without_type' using errcode = '22023';
    end if;
  end loop;

  if v_correct_count <> new.score then
    raise exception 'quiz_score_does_not_match_answers' using errcode = '22023';
  end if;

  if v_game_type is not null then
    if coalesce(v_game_key, '') = '' then
      raise exception 'missing_game_key' using errcode = '22023';
    end if;
    v_game_max_total := case v_game_type
      when 'speed-match' then 4
      when 'fill-gap' then 5
      when 'word-connections' then 5
      when 'crossword' then 12
      when 'word-scramble' then 5
      when 'rapid-fire' then 120
      else null
    end;
    if v_game_max_total is null or new.total > v_game_max_total then
      raise exception 'invalid_game_total' using errcode = '22023';
    end if;
    if new.total = 0 and v_answer_count > 1 then
      raise exception 'invalid_empty_game' using errcode = '22023';
    end if;
  else
    -- This matches the app's largest learner-selectable regular quiz length
    -- and prevents oversized client payloads from becoming review/XP abuse.
    -- Omega Test is intentionally exempt because it covers the full library
    -- and can legitimately contain more than 20 prompts.
    if not v_is_omega and new.total > 20 then
      raise exception 'invalid_quiz_total' using errcode = '22023';
    end if;
    if v_answer_count > new.total then
      raise exception 'too_many_quiz_answers' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
