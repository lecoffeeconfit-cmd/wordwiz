-- Help & Feedback: reports are private to their creator, with app_admins using
-- the existing admin-role system for triage and replies.
create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  category text not null check (category in ('bug', 'incorrect_word_info', 'feature_request', 'account_subscription', 'general_feedback', 'other')),
  subject text not null check (char_length(subject) between 1 and 120),
  description text not null check (char_length(description) between 1 and 3000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'in_progress', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  screenshot_path text,
  screen text,
  word_id uuid,
  word text,
  word_section text,
  app_version text,
  build_number text,
  device_model text,
  os_version text,
  access_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.feedback_reports(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  sender_role text not null check (sender_role in ('user', 'admin')),
  message text not null check (char_length(message) between 1 and 3000),
  created_at timestamptz not null default now()
);

create index if not exists feedback_reports_user_updated_idx on public.feedback_reports(user_id, updated_at desc);
create index if not exists feedback_reports_triage_idx on public.feedback_reports(status, priority, created_at desc);
create index if not exists feedback_messages_report_created_idx on public.feedback_messages(report_id, created_at);

create or replace function public.feedback_touch_report()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.feedback_reports set updated_at = now() where id = new.report_id;
  return new;
end;
$$;

drop trigger if exists feedback_message_updates_report on public.feedback_messages;
create trigger feedback_message_updates_report after insert on public.feedback_messages
for each row execute function public.feedback_touch_report();

alter table public.feedback_reports enable row level security;
alter table public.feedback_messages enable row level security;

drop policy if exists "Users can create their feedback reports" on public.feedback_reports;
create policy "Users can create their feedback reports" on public.feedback_reports for insert
with check (auth.uid() = user_id);
drop policy if exists "Users can read their feedback reports" on public.feedback_reports;
create policy "Users can read their feedback reports" on public.feedback_reports for select
using (auth.uid() = user_id or public.is_my_admin());
drop policy if exists "Admins can update feedback reports" on public.feedback_reports;
create policy "Admins can update feedback reports" on public.feedback_reports for update
using (public.is_my_admin()) with check (public.is_my_admin());

drop policy if exists "Users can read feedback messages for their reports" on public.feedback_messages;
create policy "Users can read feedback messages for their reports" on public.feedback_messages for select
using (exists (select 1 from public.feedback_reports r where r.id = report_id and (r.user_id = auth.uid() or public.is_my_admin())));
drop policy if exists "Users can add messages to their own reports" on public.feedback_messages;
create policy "Users can add messages to their own reports" on public.feedback_messages for insert
with check (
  sender_id = auth.uid()
  and ((sender_role = 'user' and exists (select 1 from public.feedback_reports r where r.id = report_id and r.user_id = auth.uid()))
    or (sender_role = 'admin' and public.is_my_admin()))
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-screenshots', 'feedback-screenshots', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 4194304, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload their feedback screenshots" on storage.objects;
create policy "Users upload their feedback screenshots" on storage.objects for insert to authenticated
with check (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users read their feedback screenshots" on storage.objects;
create policy "Users read their feedback screenshots" on storage.objects for select to authenticated
using (bucket_id = 'feedback-screenshots' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_my_admin()));
drop policy if exists "Users delete their feedback screenshots" on storage.objects;
create policy "Users delete their feedback screenshots" on storage.objects for delete to authenticated
using (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

grant select, insert, update on public.feedback_reports to authenticated;
grant select, insert on public.feedback_messages to authenticated;
grant select, insert, update on public.feedback_reports, public.feedback_messages to service_role;
