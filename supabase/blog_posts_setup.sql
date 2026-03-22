-- =============================================================================
-- KiwiTeach — Blog posts: table + RLS + sample rows
-- Run this whole script in: Supabase Dashboard → SQL → New query → Run
-- Safe to run more than once (ON CONFLICT skips duplicate slugs).
-- =============================================================================

-- Table
create table if not exists public.blog_posts (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  slug text not null unique,
  title text not null,
  excerpt text,
  content text not null,
  category text not null default 'General',
  cover_image_url text,
  author_name text default 'KiwiTeach',
  published boolean default true not null,
  published_at timestamp with time zone default timezone('utc'::text, now())
);

create index if not exists blog_posts_published_at_idx
  on public.blog_posts (published_at desc nulls last);

-- API roles can read rows (RLS still applies)
grant select on public.blog_posts to anon, authenticated;

alter table public.blog_posts enable row level security;

drop policy if exists "Public read published blog posts" on public.blog_posts;
create policy "Public read published blog posts"
on public.blog_posts for select
using (published = true);

-- Sample posts (Medium-style HTML in content)
insert into public.blog_posts (slug, title, excerpt, content, category, author_name, published, published_at, cover_image_url)
values
(
  'designing-assessments-that-teach',
  'Designing assessments that actually teach',
  'How to align difficulty, clarity, and feedback so every test strengthens understanding—not just scores.',
  '<p>Great assessments are not traps—they are mirrors. They show what learners understand and where meaning breaks down.</p><p>Start with a single learning objective per block of items. If you cannot state the objective in one sentence, the question is probably doing too much.</p><p>Balance stems with stems: mix recall, transfer, and short reasoning so students practice the full arc of understanding.</p><p>Finally, pair every summative moment with a formative loop—quick feedback, a second attempt, or a micro-lesson—so the test becomes part of teaching, not the end of it.</p>',
  'Pedagogy',
  'KiwiTeach Editorial',
  true,
  now(),
  'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1200&q=80'
),
(
  'omr-without-the-anxiety',
  'OMR workflows without the anxiety',
  'Practical tips for bubble sheets, timing, and post-exam analytics in busy institutes.',
  '<p>Consistency beats cleverness. Same pen rules, same fill style, same room layout—every time.</p><p>Run a five-minute “dry bubble” drill before high-stakes days. It removes mechanical fear so cognition can show up.</p><p>After scanning, look at error clusters before individual ranks. Patterns tell you what to re-teach next week.</p>',
  'Operations',
  'KiwiTeach Editorial',
  true,
  now() - interval '5 days',
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80'
),
(
  'ai-as-copilot-not-autopilot',
  'AI as copilot, not autopilot',
  'Using generation tools to draft, then using teacher judgment to refine.',
  '<p>Let models propose stems and distractors; you decide what is fair for your classroom culture.</p><p>Keep a “human veto” pass: one read for sensitivity, one for syllabus fit, one for difficulty mix.</p><p>Document prompts and edits like lesson plans—your future self will thank you.</p>',
  'Technology',
  'KiwiTeach Editorial',
  true,
  now() - interval '12 days',
  'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&q=80'
)
on conflict (slug) do nothing;
