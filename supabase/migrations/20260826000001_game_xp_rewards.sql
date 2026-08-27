-- Games live in the quiz_attempts table so they can reuse the existing
-- server-validated XP path, but they have lighter weights and replay limits.
alter table public.community_xp_ledger
  drop constraint if exists community_xp_ledger_source_type_check;

alter table public.community_xp_ledger
  add constraint community_xp_ledger_source_type_check
  check (source_type in ('quiz_attempt', 'game_attempt', 'card_review', 'baseline'));

create or replace function public.community_quiz_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_type text;
  v_game_key text;
  v_is_replay boolean := false;
  v_xp integer;
  v_multiplier integer;
  v_perfect_bonus integer;
begin
  if exists (
    select 1
    from jsonb_array_elements(coalesce(new.answers, '[]'::jsonb)) as answer
    where answer ->> 'attemptStatus' = 'incomplete'
  ) then
    return new;
  end if;

  select answer->>'gameType', answer->>'gameKey'
    into v_game_type, v_game_key
  from jsonb_array_elements(coalesce(new.answers, '[]'::jsonb)) as answer
  where answer ? 'gameType'
  limit 1;

  if v_game_type is not null then
    v_multiplier := case v_game_type
      when 'fill-gap' then 3
      when 'crossword' then 3
      else 2
    end;
    v_perfect_bonus := case v_game_type
      when 'fill-gap' then 4
      when 'crossword' then 8
      when 'rapid-fire' then 6
      when 'speed-match' then 3
      when 'word-connections' then 3
      else 3
    end;

    select exists (
      select 1
      from public.quiz_attempts prior
      where prior.user_id = new.user_id
        and prior.id <> new.id
        and exists (
          select 1
          from jsonb_array_elements(coalesce(prior.answers, '[]'::jsonb)) as prior_answer
          where prior_answer->>'gameType' = v_game_type
            and prior_answer->>'gameKey' = coalesce(v_game_key, '')
        )
    ) into v_is_replay;

    v_xp := greatest(new.score, 0) * v_multiplier;
    if not v_is_replay and new.total > 0 and new.score >= new.total then
      v_xp := v_xp + v_perfect_bonus;
    end if;
    if v_is_replay then
      v_xp := case
        when v_xp > 0 then greatest(1, floor(v_xp * 0.25)::integer)
        else 0
      end;
    end if;

    insert into public.community_xp_ledger(
      user_id, xp_amount, source_type, source_id, idempotency_key, occurred_at
    )
    values(
      new.user_id,
      v_xp,
      'game_attempt',
      new.id,
      'game:' || new.id::text,
      new.completed_at
    )
    on conflict(idempotency_key) do nothing;
    return new;
  end if;

  insert into public.community_xp_ledger(
    user_id, xp_amount, source_type, source_id, idempotency_key, occurred_at
  )
  values(
    new.user_id,
    greatest(new.score, 0) * case when exists (
      select 1
      from jsonb_array_elements(coalesce(new.answers, '[]'::jsonb)) as answer
      where answer->>'sessionMode' = 'omega-test'
    ) then 5 else 3 end,
    'quiz_attempt',
    new.id,
    'quiz:' || new.id::text,
    new.completed_at
  )
  on conflict(idempotency_key) do nothing;
  return new;
end;
$$;

notify pgrst, 'reload schema';
