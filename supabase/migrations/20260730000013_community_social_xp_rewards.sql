-- Social XP rewards every learning surface, while giving the weekly Omega Test
-- a modest premium for its more demanding retrieval practice.
create or replace function public.community_quiz_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_omega boolean;
  v_xp_multiplier integer;
begin
  select exists (
    select 1
    from jsonb_array_elements(coalesce(new.answers, '[]'::jsonb)) as answer
    where answer->>'sessionMode' = 'omega-test'
  ) into v_is_omega;

  v_xp_multiplier := case when v_is_omega then 5 else 3 end;
  insert into public.community_xp_ledger(
    user_id, xp_amount, source_type, source_id, idempotency_key, occurred_at
  )
  values(
    new.user_id,
    greatest(new.score, 0) * v_xp_multiplier,
    'quiz_attempt',
    new.id,
    'quiz:' || new.id::text,
    new.completed_at
  )
  on conflict(idempotency_key) do nothing;
  return new;
end;
$$;

-- Flashcards already earn 2 XP for a remembered review and 1 XP for a
-- learning review through community_card_xp, so all active study modes count.
notify pgrst, 'reload schema';
