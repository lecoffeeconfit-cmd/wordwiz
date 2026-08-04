-- Keep the top ten as Grandmasters, then assign the next 5% of the
-- currently ranked population to Master. The remaining percentage bands
-- continue to flow from the users left after those two tiers.
create or replace function public.community_leaderboard_level(p_rank bigint, p_total bigint)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_cutoff bigint;
  v_remaining bigint;
begin
  if p_rank is null or p_total is null or p_total < 1 then return 'Novice'; end if;

  v_cutoff := least(10, p_total);
  if p_rank <= v_cutoff then return 'Grandmaster'; end if;

  v_cutoff := least(p_total, v_cutoff + ceil(p_total * 0.05)::bigint);
  if p_rank <= v_cutoff then return 'Master'; end if;

  v_remaining := p_total - v_cutoff;
  v_cutoff := v_cutoff + ceil(v_remaining * 0.20)::bigint;
  if p_rank <= v_cutoff then return 'Mage'; end if;

  v_cutoff := v_cutoff + ceil(v_remaining * 0.25)::bigint;
  if p_rank <= v_cutoff then return 'Adept'; end if;

  v_cutoff := v_cutoff + ceil(v_remaining * 0.25)::bigint;
  if p_rank <= v_cutoff then return 'Journeyman'; end if;

  v_cutoff := v_cutoff + ceil(v_remaining * 0.20)::bigint;
  if p_rank <= v_cutoff then return 'Apprentice'; end if;
  return 'Novice';
end;
$$;

notify pgrst, 'reload schema';
