import React from 'react';
import { BookOpen, ClipboardCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { LANDING_NEET_COMMAND_IMAGE, LANDING_WORKFLOW_STEP_IMAGES } from './theme';

const steps = [
  {
    key: 'syllabus',
    step: '01',
    title: 'Teach a topic, lock the paper to it',
    description:
      'No more "generic NEET PDFs" that skip what you just finished. Pick the exact chapters and lines you covered so every question matches this week\'s class, not last year\'s booklet.',
    icon: BookOpen,
    imageSrc: LANDING_WORKFLOW_STEP_IMAGES[0],
    imageLabel: 'Syllabus & topics',
  },
  {
    key: 'mix',
    step: '02',
    title: 'Set the bite: difficulty mix & question styles',
    description:
      "Your batch isn't everyone else's batch. Control Easy / Medium / Hard, pick question styles that match your board, or start from ready-made templates in Test Studio—so every paper feels intentional, not generic.",
    icon: SlidersHorizontal,
    imageSrc: LANDING_WORKFLOW_STEP_IMAGES[1],
    imageLabel: 'Test Studio — styles & templates',
  },
  {
    key: 'generate',
    step: '03',
    title: 'One click → a full NEET-style set',
    description:
      'KiwiTeach builds a balanced paper from your rules. You review, tweak odd lines if you want, then ship, instead of burning Sunday night typing MCQs.',
    icon: Sparkles,
    imageSrc: LANDING_WORKFLOW_STEP_IMAGES[2],
    imageLabel: 'Generate paper',
  },
  {
    key: 'deliver',
    step: '04',
    title: 'Run the mock online or hand out prints',
    description:
      'Same paper: assign on screen for the batch or print for the hall. Results land where you can actually use them, so the next class fixes weak spots, not guesswork.',
    icon: ClipboardCheck,
    imageSrc: LANDING_WORKFLOW_STEP_IMAGES[3],
    imageLabel: 'Deliver & review',
  },
] as const;

function StepImagePlaceholder({ stepNum, label }: { stepNum: string; label: string }) {
  return (
    <div
      className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 px-6 text-center shadow-inner"
      role="img"
      aria-label={`Placeholder image for step ${stepNum}: ${label}`}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Image placeholder</span>
      <span className="font-heading text-sm font-semibold text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">Step {stepNum} — replace in code when ready</span>
    </div>
  );
}

function StepVisual({
  stepNum,
  label,
  imageSrc,
}: {
  stepNum: string;
  label: string;
  imageSrc: string | null;
}) {
  if (imageSrc) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <img
          src={imageSrc}
          alt={`${label} — workflow step ${stepNum}`}
          className="aspect-[4/3] w-full object-cover"
          width={960}
          height={720}
          decoding="async"
        />
      </div>
    );
  }
  return <StepImagePlaceholder stepNum={stepNum} label={label} />;
}

/** NEET Test Prep: vertical timeline workflow + command center. */
export function LandingHowItWorksSection({ sectionId = 'how-it-works' }: { sectionId?: string }) {
  return (
    <section
      id={sectionId}
      className="border-b border-border bg-muted/30 px-4 py-16 md:px-6 md:py-24"
      aria-labelledby="landing-how-it-works-heading"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-14 max-w-2xl text-center md:mb-16">
          <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider">
            <Sparkles className="size-3" aria-hidden />
            Your NEET prep workflow
          </Badge>
          <h2
            id="landing-how-it-works-heading"
            className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
          >
            From &ldquo;what we taught this week&rdquo; to a mock they can sit tomorrow
          </h2>
          <p className="mt-3 text-base text-muted-foreground md:text-lg">
            You&apos;re not short on dedication. You&apos;re short on hours. KiwiTeach removes the busywork between your lesson
            plan and a paper that actually feels like NEET: syllabus-true, difficulty-controlled, ready to run online or in
            the hall.
          </p>
        </div>

        <div className="relative">
          <div
            className="absolute bottom-0 left-[1.125rem] top-2 w-px bg-border md:left-1/2 md:-translate-x-1/2"
            aria-hidden
          />

          <ol className="relative space-y-14 md:space-y-20">
            {steps.map((s, index) => {
              const Icon = s.icon;
              const isEven = index % 2 === 0;
              return (
                <li key={s.key} className="relative">
                  <span
                    className="absolute left-[1.125rem] top-10 z-[1] size-3.5 -translate-x-1/2 rounded-full border-[3px] border-background bg-primary shadow-sm md:left-1/2"
                    aria-hidden
                  />

                  <div className="grid gap-8 pl-10 md:grid-cols-2 md:items-center md:gap-12 md:pl-0">
                    <div className={`min-w-0 ${!isEven ? 'md:order-2' : ''}`}>
                      <StepVisual stepNum={s.step} label={s.imageLabel} imageSrc={s.imageSrc} />
                    </div>

                    <div className={`min-w-0 space-y-4 ${!isEven ? 'md:order-1' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-background shadow-sm">
                          <Icon className="size-5" strokeWidth={2} aria-hidden />
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Step {s.step}
                        </span>
                      </div>
                      <h3 className="font-heading text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                        {s.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground md:text-base">{s.description}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <Card className="mt-16 overflow-hidden border border-border/80 bg-card shadow-sm md:mt-20">
          <CardContent className="grid items-center gap-8 p-6 md:grid-cols-2 md:gap-10 md:p-10">
            <div>
              <Badge variant="outline" className="mb-4">
                Command center
              </Badge>
              <h3 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                One place to steer the batch, not ten tabs and a folder of PDFs
              </h3>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                See what you&apos;re running at a glance: which topics are in today&apos;s set, how hard you&apos;ve set the
                paper, and whether the next mock is ready to push to class. Built for teachers who&apos;d rather coach
                students than chase files.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-foreground">
                <li className="flex gap-2">
                  <span className="mt-0.5 text-muted-foreground">✓</span>
                  <span>Batch and paper in one view: assign or print without re-formatting.</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 text-muted-foreground">✓</span>
                  <span>Syllabus filters so &ldquo;NEET prep&rdquo; stays tied to what you actually taught.</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 text-muted-foreground">✓</span>
                  <span>Less admin, more teaching: the painkiller for crowded prep seasons.</span>
                </li>
              </ul>
            </div>
            <div className="overflow-hidden rounded-xl border border-border/80 bg-muted/20 shadow-sm">
              <img
                src={LANDING_NEET_COMMAND_IMAGE}
                alt="Teacher hub with laptop and printed tests in one organized workspace"
                className="aspect-[4/3] w-full object-cover md:aspect-auto md:min-h-[280px] md:max-h-[340px]"
                width={960}
                height={720}
                decoding="async"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
