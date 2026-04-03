import '../../types';
import React, { useEffect, useId, useRef, useState } from 'react';

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
    QH["question_usage_history"]
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
    BR["platform_branding"]
    SY["syllabus_sets and exclusions"]
    FL["out_of_syllabus flags"]
  end
  U --> P
  BU --> IN --> CL
  P --> BU
  ST --> CL
  KB --> KC --> SU --> CH
  CH --> QB
  CH -.->|storage bucket| STG["Storage chapters PDFs DOCX"]
  CL --> QU
  QB --> QU
  QU --> QH
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
  SI --> R{"App role"}
  R -->|developer| AD["Full Admin plus dev tools"]
  R -->|school_admin| SA["Admin org branding exam papers syllabus"]
  R -->|teacher| TW["Teacher workspace"]
  R -->|student| SW["Student workspace"]
  AD --> QZ["Quiz studio tests folders"]
  SA --> QZ
  TW --> QZ
  TW --> TS["Online exam scheduler"]
  TW --> SYH["Syllabus hub"]
  SW --> SE["Scheduled exams and attempts"]
  SW --> SR["Results and review"]
  QZ --> DB["Save tests to Supabase"]
  QZ --> GEN["Optional Gemini generation"]
  SE --> OA["Online attempt RPCs"]
  OA --> SR`;

const DIAGRAM_APP = `flowchart LR
  subgraph UI["KiwiTeach UI React Vite"]
    Q["Quiz.tsx views"]
    T["Teacher panels"]
    A["AdminView sections"]
    LA["Landing"]
  end
  subgraph SVC["Client services"]
    SB["supabase client"]
    GS["geminiService"]
    QUS["questionUsageService"]
    SY["syllabusService"]
  end
  subgraph SBAPI["Supabase platform"]
    SAUTH["Auth JWT"]
    SDB["Postgres RLS"]
    SRPC["RPCs e.g. eligible questions record usage"]
    SST["Storage buckets"]
  end
  subgraph EXT["External"]
    GEM["Google Gemini API"]
  end
  Q --> SB
  A --> SB
  T --> SB
  Q --> GS
  A --> GS
  Q --> QUS
  SB --> SAUTH
  SB --> SDB
  SB --> SRPC
  SB --> SST
  GS --> GEM`;

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
    QH["question_usage_history append-only log"]
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
  QU --> QH
  FE --> GQ
  GQ --> QB
  GQ --> QU
  CM --> RU
  RU --> QU
  RU --> QH
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
    AL["Developer email allowlist in roles.ts"]
  end
  subgraph REG["Fine-grained registry Admin Roles UI"]
    RR["role_registry role_slug system custom"]
    PM["permission_registry perm_key nav admin categories"]
    GR["role_permission_grant role_id permission_id allowed"]
  end
  subgraph ENF["App enforcement layers"]
    RV["resolveAppRole"]
    VW["viewsAllowedForRole dashboard views"]
    ADM["AdminView section gates developer school_admin"]
    RPCD["RPCs is_developer admin_*"]
  end
  B --> I --> C
  S --> C
  AU --> PF
  AL --> RV
  PF --> RV
  RV --> VW
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
          High-level maps: full database sketch, detailed question-usage and org linkage, roles/permissions hierarchy,
          user journeys, and frontend-to-backend flow. Mermaid diagrams — scroll each panel when content is large.
        </p>
      </div>

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
        description="profiles.role drives dashboard views; businesses → institutes → classes → students is the tenant tree. role_registry / permission_registry / role_permission_grant store the admin permission matrix (seeded per role; customizable by developer)."
        definition={DIAGRAM_ROLES_ACCESS}
      />
      <MermaidBlock diagramKey="user" title="User flow" definition={DIAGRAM_USER} />
      <MermaidBlock diagramKey="app" title="Application architecture" definition={DIAGRAM_APP} />
    </div>
  );
};

export default AppArchitectureHome;
