import '../../types';
import React, { useEffect, useId, useRef, useState } from 'react';
import { DIAGRAM_SUPABASE_TABLE_LINKS, SUPABASE_TABLE_CATALOG } from './supabaseTablesCatalog';

const DIAGRAM_DB = `flowchart TB
  subgraph AUTH["Authentication"]
    U["auth.users"]
    P["profiles"]
  end
  subgraph ORG["Organization and roster"]
    BU["businesses"]
    IN["institutes"]
    CL["classes batches"]
    ST["students"]
  end
  subgraph CURR["Curriculum"]
    KB["knowledge_bases"]
    KC["kb_classes"]
    SU["subjects"]
    CH["chapters"]
    QB["question_bank_neet"]
  end
  subgraph ASSESS["Assessments"]
    FO["folders"]
    TE["tests"]
    EP["exam_paper_profiles"]
  end
  subgraph USAGE["Question usage no-repeat"]
    QU["question_usage"]
  end
  subgraph ONLINE["Online exams"]
    OA["assignments and attempts"]
  end
  subgraph EXTRA["Reference and PYQ"]
    PYQ["pyq tables and storage"]
    REF["reference_questions"]
  end
  subgraph ACCESS["Access control"]
    KA["knowledge_base_access"]
    TI["subscription_tiers"]
    RP["roles and permissions"]
  end
  subgraph META["Platform"]
    BR["platform_branding global shell theme"]
    BS["branding_settings per user PDFs OMR"]
    SY["syllabus_sets and exclusions"]
    FL["out_of_syllabus flags"]
  end
  U --> P
  P --> BS
  BU --> IN --> CL
  P --> BU
  ST --> CL
  KB --> KC --> SU --> CH
  CH --> QB
  CH -.->|storage bucket| STG["Storage chapters PDFs DOCX"]
  CL --> QU
  QB --> QU
  TE --> QU
  FO --> TE
  KB --> EP
  CL --> OA
  ST --> OA
  TE --> OA
  KA --> KB
  TI --> KA
  RP --> P
  QB --> FL
  CH --> SY`;

const DIAGRAM_USER = `flowchart TD
  L["Landing page"] --> SI["Sign in / Sign up Supabase Auth"]
  SI --> R{"profiles.role → resolveAppRole UI"}
  R -->|developer| AD["Workspace + Admin console + Question bank review + dev-only labs"]
  R -->|school_admin| SA["Workspace + Admin console org syllabus KB access NO review nav"]
  R -->|teacher| TW["Workspace + Question bank review + class tools"]
  R -->|reviewer| RV["Question bank review workspace only"]
  R -->|student| SW["Online tests + mock tests"]
  AD --> QZ["Quiz.tsx hub tests folders"]
  SA --> QZ
  TW --> QZ
  TW --> TS["Online exam scheduler"]
  AD --> ADM["AdminView syllabus prompts knowledge dev sections"]
  SA --> ADM
  SW --> SE["Scheduled exams attempts"]
  QZ --> DB["Save tests to Supabase"]
  QZ --> GEN["Gemini text + batched figure generation"]
  SE --> OA["Online attempt RPCs"]`;

const DIAGRAM_APP = `flowchart LR
  subgraph UI["KiwiTeach UI React Vite"]
    Q["Quiz.tsx dashboard views"]
    T["Teacher panels"]
    A["AdminView role-gated sections"]
    RVW["QuestionBankReviewWorkspace"]
    LA["Landing marketing shell"]
  end
  subgraph SVC["Client services"]
    SB["supabase client"]
    GS["geminiService forge figures prompts"]
    QUS["questionUsageService eligible + commit"]
    SY["syllabusService topics exclusions"]
    SP["splitImageGrid4x4 2x2 inset crop"]
    TSP["topicSpreadPick figure slots on papers"]
  end
  subgraph SBAPI["Supabase platform"]
    SAUTH["Auth JWT"]
    SDB["Postgres RLS"]
    SRPC["RPCs eligible usage review marks"]
    SST["Storage buckets"]
  end
  subgraph EXT["External"]
    GEM["Google Gemini API"]
  end
  Q --> SB
  A --> SB
  T --> SB
  RVW --> SB
  Q --> GS
  A --> GS
  Q --> QUS
  Q --> SP
  GS --> GEM
  GS --> SP
  Q --> TSP
  SB --> SAUTH
  SB --> SDB
  SB --> SRPC
  SB --> SST`;

/** Optional: up to four figure prompts per Gemini image call; client crops quadrants with inset to drop model grid lines */
const DIAGRAM_FIGURE_PIPELINE = `flowchart TB
  subgraph BANK["Question Bank forge"]
    TOG["2x2 batch + slice mode"]
    HD["figure_high_density row flag"]
  end
  subgraph GEM["Gemini image"]
    PR["Prompts forbid strokes on crop midlines"]
    IMG["One square raster 2x2"]
  end
  subgraph WEB["Browser"]
    SL["splitBase64ImageTo2x2Grid inset crop"]
    OUT["Four cells to bank rows"]
  end
  TOG --> PR --> IMG --> SL --> OUT
  HD -.->|printed paper figure tier| OUT`;

/** Organization + tables + pick/save flow for class-scoped no-repeat */
const DIAGRAM_QUESTION_USAGE = `flowchart TB
  subgraph ORG["Tenant hierarchy affects which class_id is used"]
    BU["businesses"]
    INS["institutes business_id"]
    CL["classes org batch UUID"]
    ST["students linked to class"]
    PR["profiles business_id institute_id"]
  end
  subgraph CURR["Curriculum source of questions"]
    KB["knowledge_bases"]
    CH["chapters"]
    QB["question_bank_neet"]
  end
  subgraph USAGE["Postgres usage state"]
    QU["question_usage UNIQUE class_id question_id"]
    TE["tests class_ids JSON question_ids"]
  end
  subgraph RPC["Security definer RPCs"]
    GQ["get_eligible_questions_for_class"]
    RU["record_question_usage_for_test"]
  end
  subgraph APP["Client questionUsageService.ts Quiz.tsx"]
    FE["fetchEligibleQuestions classId chapter optional type"]
    CM["commitTestToHub recordQuestionUsageForTest"]
  end
  BU --> INS --> CL
  ST --> CL
  PR --> INS
  KB --> CH --> QB
  CL --> QU
  QB --> QU
  FE --> GQ
  GQ --> QB
  GQ --> QU
  CM --> RU
  RU --> QU
  TE --> RU
  FE --> CM
  N1["Eligible LEFT JOIN question_usage on class_id omit used unless allowRepeats"]
  GQ -.-> N1`;

/** Roles hierarchy: org tree + profile role + permission registry + UI */
const DIAGRAM_ROLES_ACCESS = `flowchart TB
  subgraph HIER["Organization tree RLS scoped"]
    B["businesses owner user_id"]
    I["institutes"]
    C["classes batches"]
    S["students"]
  end
  subgraph ID["Identity and app role"]
    AU["auth.users"]
    PF["profiles id role full_name business institute"]
    AL["Developer email allowlist UI only roles.ts"]
  end
  subgraph REG["Fine-grained registry Admin Roles UI"]
    RR["role_registry role_slug system custom"]
    PM["permission_registry perm_key nav admin categories"]
    GR["role_permission_grant role_id permission_id allowed"]
  end
  subgraph ENF["App enforcement layers"]
    RV["resolveAppRole UI shell allowlist email"]
    VW["viewsAllowedForRole dashboard routes"]
    AC["canAccessAdminConsole developer school_admin"]
    QR["canAccessQuestionBankReview developer teacher reviewer not school_admin"]
    ADM["AdminView per-section gates"]
    RPCD["Postgres is_developer is_reviewer RLS RPCs"]
  end
  B --> I --> C
  S --> C
  AU --> PF
  AL --> RV
  PF --> RV
  RV --> VW
  RV --> AC
  RV --> QR
  RV --> ADM
  RR --> GR
  PM --> GR
  GR -.-> ADM
  PF --> B
  PF --> I
  RPCD --> REG
  KBA["knowledge_base_access user to KB"]
  KB2["knowledge_bases"]
  PF --> KBA --> KB2`;

function MermaidBlock({
  definition,
  title,
  diagramKey,
  description,
}: {
  definition: string;
  title: string;
  diagramKey: string;
  description?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const baseId = useId().replace(/:/g, '');

  useEffect(() => {
    let cancelled = false;
    const el = containerRef.current;
    if (!el) return undefined;

    (async () => {
      setErr(null);
      el.innerHTML = '';
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'loose',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          flowchart: { htmlLabels: true, curve: 'basis' },
        });
        const graphId = `mmd-${baseId}-${diagramKey}`;
        const { svg } = await mermaid.render(graphId, definition);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [definition, baseId, diagramKey]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-2.5">
        <h3 className="text-[13px] font-semibold tracking-tight text-zinc-900">{title}</h3>
        {description ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">{description}</p>
        ) : null}
      </div>
      <div className="max-h-[min(78vh,820px)] overflow-auto p-4 custom-scrollbar">
        {err ? (
          <p className="text-xs text-rose-600">Diagram error: {err}</p>
        ) : (
          <div ref={containerRef} className="flex min-h-[200px] justify-center [&_svg]:max-w-full" />
        )}
      </div>
    </div>
  );
}

const AppArchitectureHome: React.FC = () => {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="max-w-3xl space-y-2">
        <p className="text-[13px] leading-relaxed text-zinc-600">
          High-level maps: database sketch, question usage and org linkage, roles with client route gates (
          <code className="rounded bg-zinc-100 px-1">auth/roles.ts</code>), user journeys, app layers, batched figure pipeline, and
          conceptual table links. Scroll wide diagrams. A compact markdown mirror for editors and AI context lives at repo root:{' '}
          <code className="rounded bg-zinc-100 px-1">ARCHITECTURE.md</code>.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-2.5">
          <h3 className="text-[13px] font-semibold tracking-tight text-zinc-900">Supabase tables</h3>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
            Complete list of application tables (plus <code className="rounded bg-zinc-100 px-1">auth.users</code>). Descriptions reflect how KiwiTeach uses each object; see migrations for exact columns and RLS.
          </p>
        </div>
        <div className="max-h-[min(70vh,560px)] overflow-auto custom-scrollbar">
          <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
            <thead className="sticky top-0 z-[1] bg-zinc-100/95 backdrop-blur-sm">
              <tr className="border-b border-zinc-200">
                <th className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-700">Schema</th>
                <th className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-700">Table</th>
                <th className="px-3 py-2 font-semibold text-zinc-700">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {SUPABASE_TABLE_CATALOG.map((row) => (
                <tr key={`${row.schema}.${row.name}`} className="border-b border-zinc-100 hover:bg-zinc-50/80">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-zinc-500">{row.schema}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-zinc-900">{row.name}</td>
                  <td className="px-3 py-2 leading-snug text-zinc-600">{row.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <MermaidBlock
        diagramKey="supabase-fk"
        title="Table links (conceptual)"
        description="High-level relationships and groupings. Solid arrows indicate primary ownership or FK-style flows used by the app; dotted lines are associative or syllabus-mapping links."
        definition={DIAGRAM_SUPABASE_TABLE_LINKS}
      />

      <MermaidBlock diagramKey="db" title="Database structure" definition={DIAGRAM_DB} />
      <MermaidBlock
        diagramKey="qusage"
        title="Question usage — organization and database"
        description="Class-scoped no-repeat: the same question_id cannot be drawn again for the same classes.id until you allow repeats. Flow ties org classes to question_bank_neet via RPCs."
        definition={DIAGRAM_QUESTION_USAGE}
      />
      <MermaidBlock
        diagramKey="roles"
        title="Roles, permissions, and access hierarchy"
        description="profiles.role drives RLS and RPCs (e.g. is_developer, is_reviewer). Client: resolveAppRole (developer email allowlist is UI-only), viewsAllowedForRole, canAccessAdminConsole (developer + school_admin), canAccessQuestionBankReview (developer + teacher + reviewer — not school_admin). Tenant tree: businesses → institutes → classes → students. role_registry / permission_registry / role_permission_grant back the Roles admin UI."
        definition={DIAGRAM_ROLES_ACCESS}
      />
      <MermaidBlock diagramKey="user" title="User flow" definition={DIAGRAM_USER} />
      <MermaidBlock diagramKey="app" title="Application architecture" definition={DIAGRAM_APP} />
      <MermaidBlock
        diagramKey="figures"
        title="Batched figure generation (2×2 slice)"
        description="Neural Studio can batch up to four figure prompts in one Gemini image call; the client splits the composite with pixel inset on internal edges so model-drawn grid lines are not kept. topicSpreadPick allocates figure slots when assembling papers."
        definition={DIAGRAM_FIGURE_PIPELINE}
      />
    </div>
  );
};

export default AppArchitectureHome;
