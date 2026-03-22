-- Optional: load demo rows after `schema.sql` (or use `blog_posts_setup.sql` for table + seed in one go).
-- Demo UI also works without DB via fallback in `Blog/demoPosts.ts`.

insert into public.blog_posts (slug, title, excerpt, content, category, author_name, published, published_at)
values
(
  'designing-assessments-that-teach',
  'Designing assessments that actually teach',
  'How to align difficulty, clarity, and feedback so every test strengthens understanding—not just scores.',
  '<p>Great assessments are not traps—they are mirrors. They show what learners understand and where meaning breaks down.</p><p>Start with a single learning objective per block of items. If you cannot state the objective in one sentence, the question is probably doing too much.</p><p>Balance stems with stems: mix recall, transfer, and short reasoning so students practice the full arc of understanding.</p><p>Finally, pair every summative moment with a formative loop—quick feedback, a second attempt, or a micro-lesson—so the test becomes part of teaching, not the end of it.</p>',
  'Pedagogy',
  'KiwiTeach Editorial',
  true,
  now()
),
(
  'omr-without-the-anxiety',
  'OMR workflows without the anxiety',
  'Practical tips for bubble sheets, timing, and post-exam analytics in busy institutes.',
  '<p>Consistency beats cleverness. Same pen rules, same fill style, same room layout—every time.</p><p>Run a five-minute “dry bubble” drill before high-stakes days. It removes mechanical fear so cognition can show up.</p><p>After scanning, look at error clusters before individual ranks. Patterns tell you what to re-teach next week.</p>',
  'Operations',
  'KiwiTeach Editorial',
  true,
  now() - interval '5 days'
),
(
  'ai-as-copilot-not-autopilot',
  'AI as copilot, not autopilot',
  'Using generation tools to draft, then using teacher judgment to refine.',
  '<p>Let models propose stems and distractors; you decide what is fair for your classroom culture.</p><p>Keep a “human veto” pass: one read for sensitivity, one for syllabus fit, one for difficulty mix.</p><p>Document prompts and edits like lesson plans—your future self will thank you.</p>',
  'Technology',
  'KiwiTeach Editorial',
  true,
  now() - interval '12 days'
)
on conflict (slug) do nothing;
