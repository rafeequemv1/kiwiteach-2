/** Reference catalog for Admin → App architecture (aligns with migrations + app usage). */
export type SupabaseTableRow = {
  name: string;
  schema: string;
  purpose: string;
};

export const SUPABASE_TABLE_CATALOG: SupabaseTableRow[] = [
  { schema: 'auth', name: 'users', purpose: 'Supabase Auth identities, passwords, and sessions (platform-managed).' },
  { schema: 'public', name: 'profiles', purpose: 'App user row per auth user: role, business/institute/class links, display fields.' },
  { schema: 'public', name: 'businesses', purpose: 'Top-level tenant; owner user; scopes org data and KB access.' },
  { schema: 'public', name: 'institutes', purpose: 'Schools or branches under a business.' },
  { schema: 'public', name: 'classes', purpose: 'Teaching batches; assigned to tests and student roster.' },
  { schema: 'public', name: 'students', purpose: 'Roster records linked to a class for scheduling and online exams.' },
  { schema: 'public', name: 'team_profiles', purpose: 'Staff/team metadata linked to org and roles.' },
  { schema: 'public', name: 'knowledge_bases', purpose: 'Named curriculum corpora (e.g. NEET) driving chapters and questions.' },
  { schema: 'public', name: 'kb_classes', purpose: 'Tracks/grades within a knowledge base (curriculum “class”, not org class).' },
  { schema: 'public', name: 'subjects', purpose: 'Subjects under a kb_class; parent of chapters.' },
  { schema: 'public', name: 'chapters', purpose: 'Chapter metadata, syllabus linkage, storage paths for source PDFs/DOCX.' },
  { schema: 'public', name: 'question_bank_neet', purpose: 'Primary NEET-style question bank; keyed by chapter. prompt_set_id / prompt_generation_source for Neural Studio provenance; generation_model stores Gemini API id used for text synthesis.' },
  { schema: 'public', name: 'folders', purpose: 'User-owned folders for organizing tests in the hub.' },
  { schema: 'public', name: 'tests', purpose: 'Assessments: drafts, generated papers, scheduling, class_ids, JSON questions.' },
  { schema: 'public', name: 'question_usage', purpose: 'Class-scoped usage of question_id to enforce no-repeat draws.' },
  { schema: 'public', name: 'online_test_attempts', purpose: 'Student online exam attempt sessions (timing, status).' },
  { schema: 'public', name: 'online_test_attempt_responses', purpose: 'Per-question answers and scores for each attempt.' },
  { schema: 'public', name: 'branding_settings', purpose: 'Per-user branding for generated PDFs and OMR sheets.' },
  { schema: 'public', name: 'blog_posts', purpose: 'Marketing blog content; public read for published posts.' },
  { schema: 'public', name: 'payments', purpose: 'Dodo Payments events; written by webhook/service role.' },
  { schema: 'public', name: 'subscriptions', purpose: 'Dodo subscription state; billing and renewal fields.' },
  { schema: 'public', name: 'marketing_pricing_plans', purpose: 'Pricing page plans (INR, features JSON); public read when active.' },
  { schema: 'public', name: 'platform_branding', purpose: 'Global product theme (colors, fonts) for the signed-in shell.' },
  { schema: 'public', name: 'exam_paper_profiles', purpose: 'Exam paper layout/styling presets per knowledge base.' },
  { schema: 'public', name: 'syllabus_sets', purpose: 'Named syllabus versions tied to a knowledge base.' },
  { schema: 'public', name: 'syllabus_entries', purpose: 'Rows mapping syllabus sets to chapters / coverage.' },
  { schema: 'public', name: 'question_topic_exclusions', purpose: 'Per-user or scoped exclusions of topics from generation.' },
  { schema: 'public', name: 'out_of_syllabus_question_flags', purpose: 'Marks questions considered outside current syllabus.' },
  { schema: 'public', name: 'pyq_upload_sets', purpose: 'Metadata for batches of imported previous-year questions.' },
  { schema: 'public', name: 'pyq_questions_neet', purpose: 'Previous-year NEET items linked to upload sets and chapters.' },
  { schema: 'public', name: 'reference_question_sets', purpose: 'Curated reference question bundles for admin workflows.' },
  { schema: 'public', name: 'reference_questions', purpose: 'Individual reference items with storage for assets.' },
  {
    schema: 'public',
    name: 'prompt_reference_layers',
    purpose: 'Prompt Studio: uploaded reference papers (DOCX/PDF) per knowledge base for AI style analysis — not the reference_questions bank.',
  },
  {
    schema: 'public',
    name: 'kb_prompt_sets',
    purpose: 'Prompt Studio: saved NEET system prompt bundles per knowledge base (manual or derived from a reference layer).',
  },
  {
    schema: 'public',
    name: 'kb_prompt_preferences',
    purpose: 'Prompt Studio: generation_prompt_source (builtin_default | browser_local | cloud_set) plus active_prompt_set_id when cloud_set.',
  },
  { schema: 'public', name: 'subscription_tiers', purpose: 'Named tiers used for KB and feature gating.' },
  { schema: 'public', name: 'user_knowledge_base_access', purpose: 'Direct grants from a user to a knowledge base.' },
  {
    schema: 'public',
    name: 'subscription_tier_knowledge_base_access',
    purpose: 'Which KBs a subscription tier includes by default.',
  },
  {
    schema: 'public',
    name: 'business_knowledge_base_access',
    purpose: 'Business-level grants to knowledge bases (tenant-wide).',
  },
  { schema: 'public', name: 'role_registry', purpose: 'System and custom role slugs for the permission matrix.' },
  { schema: 'public', name: 'permission_registry', purpose: 'Fine-grained permission keys (nav, admin sections, etc.).' },
  { schema: 'public', name: 'role_permission_grant', purpose: 'Join: which permissions each role_registry row allows.' },
];

/** Mermaid: core foreign-key style links (simplified; not every column shown). */
export const DIAGRAM_SUPABASE_TABLE_LINKS = `flowchart TB
  subgraph AUTH["auth"]
    AU["users"]
  end
  subgraph ID["Identity"]
    PR["profiles"]
    TP["team_profiles"]
  end
  subgraph ORG["Organization"]
    BU["businesses"]
    IN["institutes"]
    CL["classes"]
    STU["students"]
  end
  subgraph CURR["Curriculum"]
    KB["knowledge_bases"]
    KBC["kb_classes"]
    SU["subjects"]
    CH["chapters"]
    QB["question_bank_neet"]
  end
  subgraph ASMT["Assessments"]
    FO["folders"]
    TE["tests"]
    QU["question_usage"]
  end
  subgraph ONLINE["Online exams"]
    OA["online_test_attempts"]
    OR["online_test_attempt_responses"]
  end
  subgraph SYL["Syllabus / PYQ / ref"]
    SS["syllabus_sets"]
    SE["syllabus_entries"]
    QTE["question_topic_exclusions"]
    OOS["out_of_syllabus_question_flags"]
    PYU["pyq_upload_sets"]
    PYQ["pyq_questions_neet"]
    RQS["reference_question_sets"]
    RQ["reference_questions"]
  end
  subgraph ACCESS["Access / roles"]
    STI["subscription_tiers"]
    UKA["user_knowledge_base_access"]
    SKA["subscription_tier_knowledge_base_access"]
    BKA["business_knowledge_base_access"]
    RR["role_registry"]
    PM["permission_registry"]
    RG["role_permission_grant"]
  end
  subgraph MKT["Marketing / billing"]
    BP["blog_posts"]
    PAY["payments"]
    SUB["subscriptions"]
    MPP["marketing_pricing_plans"]
    PB["platform_branding"]
    EP["exam_paper_profiles"]
  end
  subgraph UX["User prefs"]
    BR["branding_settings"]
  end
  AU --> PR
  PR --> BU
  PR --> IN
  PR --> CL
  TP --> PR
  TP --> BU
  TP --> IN
  BU --> IN
  IN --> CL
  STU --> CL
  KB --> KBC --> SU --> CH
  CH --> QB
  PYU --> PYQ
  RQS --> RQ
  KB --> SS
  SS --> SE
  SE -.-> CH
  CH --> OOS
  QB --> OOS
  AU --> BR
  PR --> FO
  PR --> TE
  FO --> TE
  CL --> QU
  QB --> QU
  TE --> QU
  TE --> OA
  STU --> OA
  OA --> OR
  KB --> EP
  STI --> SKA
  SKA --> KB
  UKA --> KB
  BU --> BKA
  BKA --> KB
  RR --> RG
  PM --> RG`;
