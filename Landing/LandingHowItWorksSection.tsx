import React from 'react';
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Clock,
  Layers,
  Route,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const steps = [
  {
    key: 'syllabus',
    step: '01',
    title: 'Lock to your syllabus',
    description:
      'Pick chapters and topics from your bank so every item matches this week’s class—not a stale PDF from years ago.',
    icon: BookOpen,
  },
  {
    key: 'mix',
    step: '02',
    title: 'Dial difficulty',
    description:
      'Set Easy, Medium, and Hard counts (or ratios) so the paper feels fair for this batch before you generate.',
    icon: SlidersHorizontal,
  },
  {
    key: 'generate',
    step: '03',
    title: 'Generate in one pass',
    description:
      'KiwiTeach assembles a balanced set from your rules—ready to review, tweak, or ship immediately.',
    icon: Sparkles,
  },
  {
    key: 'deliver',
    step: '04',
    title: 'Assign or print',
    description:
      'Push to your online test for the batch or export a print-ready paper. Same flow, two delivery modes.',
    icon: ClipboardCheck,
  },
] as const;

const highlights = [
  {
    title: 'Syllabus as source of truth',
    body: 'Filter by subject, chapter, and topic so assessments stay aligned with what you actually taught.',
    icon: Layers,
  },
  {
    title: 'Visual pipeline',
    body: 'See the hand-off from selection → constraints → generation → classroom without juggling five tools.',
    icon: Route,
  },
  {
    title: 'Teacher-first defaults',
    body: 'Start from sensible mixes, then refine. No blank-slate paralysis when the period ends in an hour.',
    icon: Clock,
  },
] as const;

/** Home landing: “How it works” with shadcn cards + responsive flow connectors. */
export function LandingHowItWorksSection({ sectionId = 'how-it-works' }: { sectionId?: string }) {
  return (
    <section
      id={sectionId}
      className="border-b border-border bg-muted/30 px-4 py-16 md:px-6 md:py-24"
      aria-labelledby="landing-how-it-works-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-12 max-w-2xl text-center md:mb-14">
          <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider">
            <Layers className="size-3" aria-hidden />
            How it works
          </Badge>
          <h2
            id="landing-how-it-works-heading"
            className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
          >
            From chapter pick to class-ready paper
          </h2>
          <p className="mt-3 text-base text-muted-foreground md:text-lg">
            One straight line: choose what you taught, set how hard the set should bite, generate once, then deliver
            online or on paper—without losing your evening to formatting.
          </p>
        </div>

        <Card className="overflow-hidden border-border/80 bg-card shadow-sm">
          <CardHeader className="border-b border-border bg-muted/40 pb-4">
            <CardTitle className="font-heading text-lg md:text-xl">End-to-end flow</CardTitle>
            <CardDescription>
              Each step is a decision you already make; KiwiTeach connects them into a single workflow.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-6 md:p-6">
            <div className="flex flex-col md:flex-row md:items-stretch md:justify-between md:gap-0">
              {steps.map((s, index) => {
                const Icon = s.icon;
                const isLast = index === steps.length - 1;
                return (
                  <React.Fragment key={s.key}>
                    <div className="relative flex min-w-0 flex-1 flex-col">
                      <div className="flex h-full flex-col rounded-lg border border-border bg-background p-4 shadow-sm transition-colors hover:bg-muted/30 md:p-5">
                        <div className="mb-3 flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                            <Icon className="size-5" strokeWidth={2} aria-hidden />
                          </div>
                          <span className="text-xs font-medium tabular-nums text-muted-foreground">Step {s.step}</span>
                        </div>
                        <h3 className="font-heading text-base font-semibold text-foreground">{s.title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.description}</p>
                      </div>
                    </div>
                    {!isLast && (
                      <>
                        <div
                          className="flex shrink-0 items-center justify-center py-2 md:hidden"
                          aria-hidden
                        >
                          <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
                            <div className="h-6 w-px bg-border" />
                            <ArrowDown className="size-4" strokeWidth={2} />
                            <div className="h-6 w-px bg-border" />
                          </div>
                        </div>
                        <div
                          className="hidden w-10 shrink-0 items-center justify-center self-center md:flex"
                          aria-hidden
                        >
                          <ArrowRight className="size-5 text-muted-foreground/80" strokeWidth={2} />
                        </div>
                      </>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Desktop flow diagram: simple SVG lanes */}
            <div className="mt-8 hidden rounded-lg border border-dashed border-border bg-muted/20 p-4 md:block">
              <p className="mb-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
                At a glance
              </p>
              <svg
                viewBox="0 0 800 120"
                className="h-auto w-full"
                aria-hidden
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <marker
                    id="landing-flow-arrow"
                    markerWidth="7"
                    markerHeight="7"
                    refX="6"
                    refY="3.5"
                    orient="auto"
                  >
                    <path d="M0,0 L7,3.5 L0,7 Z" fill="var(--border)" />
                  </marker>
                </defs>
                <line
                  x1="56"
                  y1="60"
                  x2="736"
                  y2="60"
                  stroke="var(--border)"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  markerEnd="url(#landing-flow-arrow)"
                />
                {[110, 280, 450, 620].map((cx, i) => (
                  <g key={i}>
                    <circle cx={cx} cy="60" r="10" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
                    <text
                      x={cx}
                      y="64"
                      textAnchor="middle"
                      fill="var(--foreground)"
                      fontSize="11"
                      fontWeight="600"
                    >
                      {i + 1}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </CardContent>
        </Card>

        <Separator className="my-12" />

        <div className="grid gap-4 md:grid-cols-3">
          {highlights.map((h) => {
            const Hi = h.icon;
            return (
              <Card key={h.title} className="border-border/80 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="mb-2 flex size-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                    <Hi className="size-4" strokeWidth={2} aria-hidden />
                  </div>
                  <CardTitle className="font-heading text-base">{h.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">{h.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
