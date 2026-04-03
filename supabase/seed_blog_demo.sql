-- Single curated journal post (AI tools for teachers). Removes legacy demo slugs if present.
-- Run after schema + blog CMS migration so meta/faqs columns exist.

delete from public.blog_posts
where slug in (
  'designing-assessments-that-teach',
  'omr-without-the-anxiety',
  'ai-as-copilot-not-autopilot'
);

insert into public.blog_posts (
  slug,
  title,
  excerpt,
  content,
  category,
  cover_image_url,
  author_name,
  published,
  published_at,
  meta_title,
  meta_description,
  canonical_path,
  keywords,
  faqs
)
values (
  'ai-tools-for-teacher-quizzes',
  'AI tools for making quizzes: a practical list for teachers',
  'Curated platforms and assistants that help you draft, format, and deliver quizzes—with links you can try today.',
  $c$
<h2>Start with your goal</h2>
<p>Pick tools based on whether you need <strong>live engagement</strong>, <strong>homework-style forms</strong>, or <strong>AI-assisted drafting</strong> of stems and answer choices. Below are reputable options with official sites—always confirm pricing and school IT policies locally.</p>

<h2>Interactive quizzes & classroom engagement</h2>
<ul>
  <li><a href="https://kahoot.com" target="_blank" rel="noopener noreferrer">Kahoot</a> — game-style quizzes and polls; strong for whole-class energy.</li>
  <li><a href="https://quizizz.com" target="_blank" rel="noopener noreferrer">Quizizz</a> — practice sets, homework mode, and school-friendly workflows.</li>
  <li><a href="https://www.mentimeter.com" target="_blank" rel="noopener noreferrer">Mentimeter</a> — quick polls, word clouds, and Q&amp;A alongside slides.</li>
  <li><a href="https://www.socrative.com" target="_blank" rel="noopener noreferrer">Socrative</a> — exit tickets and short formative checks.</li>
</ul>

<h2>Forms and structured tests</h2>
<ul>
  <li><a href="https://forms.google.com" target="_blank" rel="noopener noreferrer">Google Forms</a> — simple quizzes and branching; pairs well with Google Classroom.</li>
  <li><a href="https://forms.office.com" target="_blank" rel="noopener noreferrer">Microsoft Forms</a> — similar pattern inside Microsoft 365 schools.</li>
</ul>

<h2>AI copilots for drafting and differentiation</h2>
<ul>
  <li><a href="https://www.magicschool.ai" target="_blank" rel="noopener noreferrer">MagicSchool AI</a> — educator-focused assistants for lesson and assessment ideas (review all output).</li>
  <li><a href="https://edpuzzle.com" target="_blank" rel="noopener noreferrer">Edpuzzle</a> — embed questions in video; useful for flipped review.</li>
</ul>

<h2>Using AI responsibly in assessment</h2>
<p>Verify facts, match difficulty to your class, and watch for biased wording. Keep a short <strong>human review</strong> step: one pass for accuracy, one for accessibility and sensitivity, one for alignment with your syllabus—same habits we describe across KiwiTeach workflows.</p>
$c$::text,
  'Technology',
  'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=80',
  'KiwiTeach Editorial',
  true,
  timezone('utc'::text, now()),
  'AI tools for teacher-made quizzes (2026) | KiwiTeach',
  'Compare AI-assisted quiz builders: interactive class tools, form-based tests, and copilots for stems and distractors—plus sensible classroom guardrails.',
  '/blog/ai-tools-for-teacher-quizzes',
  'AI quiz tools, teacher assessment, formative assessment, quiz generator, classroom technology',
  '[
    {"question": "Which AI quiz tools work well for live classrooms?", "answer": "Platforms like Kahoot, Quizizz, and Mentimeter support real-time participation and quick checks for understanding. Pick based on your devices, privacy policy, and whether you need proctoring."},
    {"question": "Should students know when content was AI-generated?", "answer": "Yes. Be transparent about how you use AI for drafting, and always review items for accuracy, bias, and syllabus fit before students see them."},
    {"question": "Can I combine AI drafting with my own question bank?", "answer": "Many teachers use AI to suggest stems or distractors, then edit in a dedicated assessment tool or LMS. Treat AI as a copilot, not the final authority."}
  ]'::jsonb
)
on conflict (slug) do update set
  title = excluded.title,
  excerpt = excluded.excerpt,
  content = excluded.content,
  category = excluded.category,
  cover_image_url = excluded.cover_image_url,
  author_name = excluded.author_name,
  published = excluded.published,
  published_at = excluded.published_at,
  meta_title = excluded.meta_title,
  meta_description = excluded.meta_description,
  canonical_path = excluded.canonical_path,
  keywords = excluded.keywords,
  faqs = excluded.faqs,
  updated_at = timezone('utc'::text, now());
