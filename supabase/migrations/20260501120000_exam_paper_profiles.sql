-- Blueprints for full-format exam papers (per knowledge base): totals, style/subject/chapter mix, figures, exam type.

create table if not exists public.exam_paper_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  knowledge_base_id uuid not null references public.knowledge_bases (id) on delete cascade,
  name text not null,
  description text,
  exam_type text not null default 'mcq' check (exam_type in ('mcq', 'descriptive', 'mixed')),
  total_questions int not null check (total_questions > 0),
  figure_question_count int not null default 0 check (figure_question_count >= 0),
  style_mode text not null default 'count' check (style_mode in ('percent', 'count')),
  style_mix jsonb not null default '{}'::jsonb,
  subject_mode text not null default 'percent' check (subject_mode in ('percent', 'count')),
  subject_mix jsonb not null default '{}'::jsonb,
  chapter_mode text not null default 'percent' check (chapter_mode in ('percent', 'count')),
  chapter_mix jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null
);

create index if not exists exam_paper_profiles_kb_idx on public.exam_paper_profiles (knowledge_base_id);
create index if not exists exam_paper_profiles_kb_name_idx on public.exam_paper_profiles (knowledge_base_id, name);

comment on table public.exam_paper_profiles is 'Blueprint for full-format exam papers: totals, style/subject/chapter mix, figures, exam type.';
comment on column public.exam_paper_profiles.style_mix is 'Keys: mcq, reasoning, matching, statements — values are counts or % per style_mode.';
comment on column public.exam_paper_profiles.subject_mix is 'subject_name or subject_id string -> count or % per subject_mode.';
comment on column public.exam_paper_profiles.chapter_mix is 'chapter uuid string -> count or % per chapter_mode.';

alter table public.exam_paper_profiles enable row level security;

drop policy if exists exam_paper_profiles_select on public.exam_paper_profiles;
create policy exam_paper_profiles_select on public.exam_paper_profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.knowledge_bases kb
      where kb.id = exam_paper_profiles.knowledge_base_id
    )
  );

drop policy if exists exam_paper_profiles_insert on public.exam_paper_profiles;
create policy exam_paper_profiles_insert on public.exam_paper_profiles
  for insert to authenticated
  with check (
    public.is_developer()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'school_admin'
    )
  );

drop policy if exists exam_paper_profiles_update on public.exam_paper_profiles;
create policy exam_paper_profiles_update on public.exam_paper_profiles
  for update to authenticated
  using (
    public.is_developer()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'school_admin'
    )
  )
  with check (
    public.is_developer()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'school_admin'
    )
  );

drop policy if exists exam_paper_profiles_delete on public.exam_paper_profiles;
create policy exam_paper_profiles_delete on public.exam_paper_profiles
  for delete to authenticated
  using (
    public.is_developer()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'school_admin'
    )
  );
