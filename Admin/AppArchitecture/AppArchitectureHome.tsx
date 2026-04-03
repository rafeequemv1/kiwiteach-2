import '../../types';
import React, { useEffect, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

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

type DiagramItem = {
  id: string;
  title: string;
  description?: string;
  definition: string;
};

const DIAGRAM_ITEMS: DiagramItem[] = [
  { id: 'db', title: 'Database structure', definition: DIAGRAM_DB },
  {
    id: 'qusage',
    title: 'Question usage — organization and database',
    description:
      'Class-scoped no-repeat: the same question_id cannot be drawn again for the same classes.id until you allow repeats. Flow ties org classes to question_bank_neet via RPCs.',
    definition: DIAGRAM_QUESTION_USAGE,
  },
  {
    id: 'roles',
    title: 'Roles, permissions, and access hierarchy',
    description:
      'profiles.role drives dashboard views; businesses → institutes → classes → students is the tenant tree. role_registry / permission_registry / role_permission_grant store the admin permission matrix (seeded per role; customizable by developer).',
    definition: DIAGRAM_ROLES_ACCESS,
  },
  { id: 'user', title: 'User flow', definition: DIAGRAM_USER },
  { id: 'app', title: 'Application architecture', definition: DIAGRAM_APP },
];

const mermaidSvgCache = new Map<string, string>();

function useMermaidSvg(diagramKey: string, definition: string, enabled: boolean) {
  const [svg, setSvg] = useState<string | null>(() => mermaidSvgCache.get(diagramKey) ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const cached = mermaidSvgCache.get(diagramKey);
    if (cached) {
      setSvg(cached);
      return;
    }
    let cancelled = false;
    setPending(true);
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'loose',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          flowchart: { htmlLabels: true, curve: 'basis' },
        });
        const graphId = `arch-${diagramKey}-${Math.random().toString(36).slice(2, 11)}`;
        const { svg: out } = await mermaid.render(graphId, definition);
        if (cancelled) return;
        mermaidSvgCache.set(diagramKey, out);
        setSvg(out);
        setErr(null);
      } catch (e: unknown) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [diagramKey, definition, enabled]);

  return { svg, err, pending };
}

function ZoomToolbar({
  zoomIn,
  zoomOut,
  resetTransform,
  variant,
}: {
  zoomIn: () => void;
  zoomOut: () => void;
  resetTransform: () => void;
  variant: 'inline' | 'fullscreen';
}) {
  const btn =
    variant === 'fullscreen'
      ? 'rounded-md border border-zinc-600 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700'
      : 'rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 shadow-sm hover:bg-zinc-50';
  return (
    <div className="pointer-events-auto flex items-center gap-1">
      <button type="button" className={btn} onClick={() => zoomIn()} title="Zoom in">
        +
      </button>
      <button type="button" className={btn} onClick={() => zoomOut()} title="Zoom out">
        −
      </button>
      <button type="button" className={btn} onClick={() => resetTransform()} title="Reset pan and zoom">
        Reset
      </button>
    </div>
  );
}

function ZoomableDiagram({
  svgHtml,
  variant,
}: {
  svgHtml: string;
  variant: 'inline' | 'fullscreen';
}) {
  const isFs = variant === 'fullscreen';
  return (
    <TransformWrapper
      initialScale={isFs ? 0.9 : 1}
      minScale={0.2}
      maxScale={6}
      centerOnInit
      limitToBounds={false}
      wheel={{ step: 0.12, wheelDisabled: false }}
      pinch={{ step: 6, disabled: false }}
      panning={{ disabled: false, velocityDisabled: false }}
      doubleClick={{ mode: 'reset', step: 0.7 }}
    >
      {({ zoomIn, zoomOut, resetTransform }) => (
        <div className={`relative flex min-h-0 w-full flex-col ${isFs ? 'h-full' : 'max-h-[min(78vh,820px)] min-h-[200px]'}`}>
          <div
            className={`absolute z-20 flex items-center gap-2 ${isFs ? 'right-3 top-3' : 'right-2 top-2'}`}
          >
            <ZoomToolbar
              variant={variant}
              zoomIn={() => zoomIn()}
              zoomOut={() => zoomOut()}
              resetTransform={() => resetTransform()}
            />
          </div>
          <TransformComponent
            wrapperClass={`w-full min-h-0 flex-1 touch-none ${isFs ? 'h-full' : ''}`}
            contentClass="flex items-start justify-center px-3 pb-4 pt-10"
          >
            <div
              className="[&_svg]:block [&_svg]:max-w-none [&_svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          </TransformComponent>
        </div>
      )}
    </TransformWrapper>
  );
}

function DiagramPanel({
  diagramKey,
  definition,
  enabled,
  variant,
}: {
  diagramKey: string;
  definition: string;
  enabled: boolean;
  variant: 'inline' | 'fullscreen';
}) {
  const { svg, err, pending } = useMermaidSvg(diagramKey, definition, enabled);

  if (!enabled) return null;

  if (pending && !svg) {
    return (
      <div className="flex min-h-[200px] items-center justify-center p-8 text-sm text-zinc-500">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-indigo-600" />
          Rendering diagram…
        </div>
      </div>
    );
  }

  if (err) {
    return <p className="p-4 text-xs text-rose-600">Diagram error: {err}</p>;
  }

  if (!svg) return null;

  return <ZoomableDiagram svgHtml={svg} variant={variant} />;
}

const AppArchitectureHome: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(DIAGRAM_ITEMS[0]?.id ?? null);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);

  useEffect(() => {
    if (!fullscreenId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreenId]);

  const fullscreenItem = fullscreenId ? DIAGRAM_ITEMS.find((i) => i.id === fullscreenId) : null;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="max-w-3xl space-y-2">
        <p className="text-[13px] leading-relaxed text-zinc-600">
          High-level maps: full database sketch, question usage, roles and access, user journeys, and
          frontend-to-backend flow. Open one section at a time; use fullscreen for wheel zoom, pinch, and drag pan.
        </p>
      </div>

      <div className="space-y-2">
        {DIAGRAM_ITEMS.map((item) => {
          const expanded = openId === item.id;
          return (
            <div key={item.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex min-h-[52px] items-stretch border-b border-zinc-100 bg-zinc-50/90">
                <button
                  type="button"
                  onClick={() => setOpenId((o) => (o === item.id ? null : item.id))}
                  className="flex min-w-0 flex-1 items-start gap-2 px-3 py-3 text-left transition-colors hover:bg-zinc-100/80 md:px-4"
                >
                  <iconify-icon
                    icon={expanded ? 'mdi:chevron-down' : 'mdi:chevron-right'}
                    className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold tracking-tight text-zinc-900">{item.title}</span>
                    {item.description ? (
                      <span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">{item.description}</span>
                    ) : null}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFullscreenId(item.id);
                  }}
                  className="flex shrink-0 items-center justify-center border-l border-zinc-200 bg-white px-3 text-zinc-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                  title="Fullscreen — zoom and pan"
                  aria-label="Open diagram in fullscreen"
                >
                  <iconify-icon icon="mdi:fullscreen" className="h-5 w-5" />
                </button>
              </div>
              {expanded ? (
                <div className="border-t border-zinc-100 bg-white">
                  <DiagramPanel
                    diagramKey={item.id}
                    definition={item.definition}
                    enabled={expanded}
                    variant="inline"
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {fullscreenItem ? (
        <div
          className="fixed inset-0 z-[400] flex flex-col bg-zinc-950/97 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="arch-fs-title"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-700/80 bg-zinc-900 px-3 py-2.5 text-white md:px-4">
            <h2 id="arch-fs-title" className="min-w-0 truncate text-sm font-semibold">
              {fullscreenItem.title}
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden text-[10px] text-zinc-400 sm:inline">Wheel · pinch · drag</span>
              <button
                type="button"
                onClick={() => setFullscreenId(null)}
                className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
              >
                Close
              </button>
            </div>
          </header>
          <div className="min-h-0 flex-1 bg-zinc-900">
            <DiagramPanel
              key={fullscreenItem.id}
              diagramKey={fullscreenItem.id}
              definition={fullscreenItem.definition}
              enabled
              variant="fullscreen"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AppArchitectureHome;
