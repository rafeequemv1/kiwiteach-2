import type { BlogPost } from './types';

/** Shown when Supabase has no rows or table not migrated yet */
export const DEMO_BLOG_POSTS: BlogPost[] = [
  {
    id: 'demo-1',
    slug: 'designing-assessments-that-teach',
    title: 'Designing assessments that actually teach',
    excerpt:
      'How to align difficulty, clarity, and feedback so every test strengthens understanding—not just scores.',
    category: 'Pedagogy',
    author_name: 'KiwiTeach Editorial',
    published_at: new Date().toISOString(),
    cover_image_url:
      'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80',
    content: `
<p>Great assessments are not traps—they are mirrors. They show what learners understand and where meaning breaks down.</p>
<p>Start with a single learning objective per block of items. If you cannot state the objective in one sentence, the question is probably doing too much.</p>
<p>Balance stems with stems: mix recall, transfer, and short reasoning so students practice the full arc of understanding.</p>
<p>Finally, pair every summative moment with a formative loop—quick feedback, a second attempt, or a micro-lesson—so the test becomes part of teaching, not the end of it.</p>
    `.trim(),
  },
  {
    id: 'demo-2',
    slug: 'omr-without-the-anxiety',
    title: 'OMR workflows without the anxiety',
    excerpt: 'Practical tips for bubble sheets, timing, and post-exam analytics in busy institutes.',
    category: 'Operations',
    author_name: 'KiwiTeach Editorial',
    published_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    cover_image_url:
      'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80',
    content: `
<p>Consistency beats cleverness. Same pen rules, same fill style, same room layout—every time.</p>
<p>Run a five-minute “dry bubble” drill before high-stakes days. It removes mechanical fear so cognition can show up.</p>
<p>After scanning, look at error clusters before individual ranks. Patterns tell you what to re-teach next week.</p>
    `.trim(),
  },
  {
    id: 'demo-3',
    slug: 'ai-as-copilot-not-autopilot',
    title: 'AI as copilot, not autopilot',
    excerpt: 'Using generation tools to draft, then using teacher judgment to refine.',
    category: 'Technology',
    author_name: 'KiwiTeach Editorial',
    published_at: new Date(Date.now() - 86400000 * 12).toISOString(),
    cover_image_url:
      'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=80',
    content: `
<p>Let models propose stems and distractors; you decide what is fair for your classroom culture.</p>
<p>Keep a “human veto” pass: one read for sensitivity, one for syllabus fit, one for difficulty mix.</p>
<p>Document prompts and edits like lesson plans—your future self will thank you.</p>
    `.trim(),
  },
];
