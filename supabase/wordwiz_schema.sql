create extension if not exists pgcrypto;

create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  term text not null,
  definition text not null,
  simple_definition text,
  example text not null,
  part_of_speech text,
  pronunciation text,
  origin text,
  origin_period text,
  synonyms text[] not null default '{}',
  common_words text[] not null default '{}',
  basic_info text,
  reviews integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_date date not null,
  score integer not null,
  total integer not null,
  duration_seconds integer not null default 0,
  answers jsonb not null default '[]'::jsonb,
  completed_at timestamptz not null default now()
);

create table if not exists public.card_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id uuid references public.words(id) on delete cascade,
  review_date date not null,
  remembered boolean not null,
  duration_seconds integer not null default 0,
  studied_at timestamptz not null default now()
);

create table if not exists public.reminder_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  hour integer not null default 19 check (hour between 0 and 23),
  minute integer not null default 0 check (minute between 0 and 59),
  updated_at timestamptz not null default now()
);

alter table public.words enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.card_reviews enable row level security;
alter table public.reminder_settings enable row level security;

drop policy if exists "Users can read their own words" on public.words;
create policy "Users can read their own words"
  on public.words for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own words" on public.words;
create policy "Users can insert their own words"
  on public.words for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own words" on public.words;
create policy "Users can update their own words"
  on public.words for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own words" on public.words;
create policy "Users can delete their own words"
  on public.words for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own quiz attempts" on public.quiz_attempts;
create policy "Users can read their own quiz attempts"
  on public.quiz_attempts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own quiz attempts" on public.quiz_attempts;
create policy "Users can insert their own quiz attempts"
  on public.quiz_attempts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their own card reviews" on public.card_reviews;
create policy "Users can read their own card reviews"
  on public.card_reviews for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own card reviews" on public.card_reviews;
create policy "Users can insert their own card reviews"
  on public.card_reviews for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their own reminder settings" on public.reminder_settings;
create policy "Users can read their own reminder settings"
  on public.reminder_settings for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own reminder settings" on public.reminder_settings;
create policy "Users can insert their own reminder settings"
  on public.reminder_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own reminder settings" on public.reminder_settings;
create policy "Users can update their own reminder settings"
  on public.reminder_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists words_user_id_created_at_idx
  on public.words(user_id, created_at desc);

create unique index if not exists words_user_id_lower_term_idx
  on public.words(user_id, lower(term));

create index if not exists quiz_attempts_user_id_completed_at_idx
  on public.quiz_attempts(user_id, completed_at desc);

create index if not exists card_reviews_user_id_studied_at_idx
  on public.card_reviews(user_id, studied_at desc);
