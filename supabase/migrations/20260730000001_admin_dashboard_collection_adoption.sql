-- Admin-only aggregate adoption of WordWiz curated collections.
-- This is a current-library measure, not a download event log: removing a
-- collection removes it from the count. It never returns words or definitions.

create or replace function public.admin_dashboard_top_collections()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with collection_memberships as (
    select distinct
      w.user_id,
      membership->>'id' as collection_id,
      membership->>'name' as collection_name
    from public.words w
    cross join lateral jsonb_array_elements(
      coalesce(w.mastery_data->'studySets', '[]'::jsonb)
    ) membership
    where membership->>'kind' = 'collection'
      or membership->>'id' like 'wordwiz-collection:%'
  ),
  collection_totals as (
    select
      collection_id,
      max(collection_name) as collection_name,
      count(distinct user_id)::integer as learner_count,
      count(*)::integer as member_word_count
    from collection_memberships
    where nullif(trim(collection_id), '') is not null
      and nullif(trim(collection_name), '') is not null
    group by collection_id
    order by learner_count desc, member_word_count desc, collection_name
    limit 5
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'collectionId', collection_id,
        'name', collection_name,
        'learnerCount', learner_count,
        'memberWordCount', member_word_count
      )
      order by learner_count desc, member_word_count desc, collection_name
    ),
    '[]'::jsonb
  )
  from collection_totals;
$$;

revoke all on function public.admin_dashboard_top_collections() from public, anon, authenticated;
grant execute on function public.admin_dashboard_top_collections() to service_role;

notify pgrst, 'reload schema';
