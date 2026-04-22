# KiwiTeach-Quiz — architecture (quick reference)

**Purpose:** Short, token-efficient map of the app for humans and AI agents. The in-app **Admin → App architecture** page shows Mermaid diagrams and the full `SUPABASE_TABLE_CATALOG` table.

**Stack:** React 19, Vite 5, TypeScript, Tailwind, Supabase (Auth, Postgres + RLS, Storage, RPCs), Google Gemini (text + image), KaTeX, Mermaid (admin diagrams).

---

## Entry points

| Area | Path | Notes |
|------|------|--------|
| Dashboard shell | `Quiz/Quiz.tsx` | Session, `LeftPanel` views, workspace fetch, per-user branding, routing slugs |
| Auth UI | `supabase/AuthUI.tsx` | Sign-in / sign-up |
| Landing | `Landing/LandingPage.tsx` | Marketing; SEO in `Landing/LandingSeoHelmet.tsx`, `seo/siteConfig.ts` |
| Admin console | `Admin/AdminView.tsx` | Nav groups gated by `developer` / `school_admin`; syllabus hub not for teachers |
| Question bank review | `Review/QuestionBankReviewWorkspace.tsx` | Reviewer / teacher / developer; **not** `school_admin` in sidebar |
| Figure forge UI | `Admin/QuestionBank/QuestionBankHome.tsx` | Neural Studio, batch 2×2 slice, syllabus modes |
| Roles (client) | `auth/roles.ts` | `resolveAppRole`, `viewsAllowedForRole`, `canAccessAdminConsole`, `canAccessQuestionBankReview` |

---

## Roles (client vs Postgres)

- **`profiles.role`** is authoritative for RLS/RPCs. Client helpers only affect **navigation and which views mount**.
- **`DEVELOPER_EMAIL_ALLOWLIST`** in `auth/roles.ts` upgrades UI to `developer` for listed emails (does not replace DB checks).

| Role | Teacher-style nav | Admin console | Question bank review nav |
|------|-------------------|---------------|---------------------------|
| `student` | — | — | — |
| `teacher` | Yes | — | Yes |
| `school_admin` | Yes | Yes | **No** |
| `reviewer` | — | — | Yes (default view) |
| `developer` | Yes (+ student zone) | Yes | Yes |

Postgres helpers (examples): `is_developer()`, `is_reviewer()`, `can_submit_question_bank_review()` (allows dev, reviewer, teacher — not school_admin).

---

## Branding (two layers)

1. **`branding_settings`** — Per **`user_id`**: sidebar name/logo, show on test/OMR. RLS: `auth.uid() = user_id`. Default display **KiwiTeach** until a row exists (`defaultUserBrandingConfig` in `Quiz/types.ts`). Loaded in `Quiz.tsx` via `maybeSingle()`.
2. **`platform_branding`** — Global shell theme (`id = 'default'`): colors, fonts, sidebar gradient. Edited under Admin → Branding (platform). `branding/platformBrandingService.ts`.

---

## Figures and papers

- **Batch 2×2:** Up to four figure prompts → one Gemini image → `splitBase64ImageTo2x2Grid` in `utils/splitImageGrid4x4.ts` with **inset crop** on shared quadrant edges to remove accidental grid strokes. Prompts in `services/geminiService.ts` (`GRID_LAYOUT_PREAMBLE`, synthetic/reference batch rules).
- **Paper assembly:** `Quiz/services/topicSpreadPick.ts` — figure slot allocation across chapters; interleaving figure vs non-figure items.
- **High-density figures:** `question_bank_neet.figure_high_density` — larger default figure tier on printed papers; RPC `admin_set_question_figure_high_density`.

---

## Question usage (no-repeat)

- **`question_usage`**: class-scoped uniqueness `(class_id, question_id)`.
- RPCs: `get_eligible_questions_for_class`, `record_question_usage_for_test`.
- Client: `Quiz/services/questionUsageService.ts` (and flows in `Quiz.tsx`).

---

## Review marks

- **`question_bank_review_marks`**: per `(question_id, reviewer_id)` flags (wrong, OOS, LaTeX, figure, notes). See migration `20260615100000_reviewer_role_rpc_sync_remote.sql`.

---

## Supabase layout

- **Migrations:** `supabase/migrations/`
- **Table catalog (source of truth for Admin UI table):** `Admin/AppArchitecture/supabaseTablesCatalog.ts`
- **Schema dump (may lag):** `supabase/schema.sql`

---

## Related docs in repo

- `Admin/AppArchitecture/AppArchitectureHome.tsx` — diagrams + embedded catalog
- `services/neuralStudioPromptBlueprint.ts` — neural / forge pipeline notes for docs/UI

When changing access rules, update **`auth/roles.ts`**, **`Panel/LeftPanel.tsx`**, **`Quiz/Quiz.tsx`** view guards, **`Admin/AdminView.tsx`** section `show` flags, and this file.
