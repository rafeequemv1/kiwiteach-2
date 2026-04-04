import { Check, Zap } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type Plan } from "@/lib/billingsdk-config";
import { cn } from "@/lib/utils";

function parseNumericPrice(value: string): number {
  const lower = value.toLowerCase().trim();
  if (lower === "custom") return NaN;
  const n = parseFloat(value.replace(/,/g, "").replace(/\s/g, ""));
  return n;
}

function isNumericPrice(value: string): boolean {
  return !Number.isNaN(parseNumericPrice(value));
}

function formatPriceDisplay(currency: string, raw: string): string {
  if (!isNumericPrice(raw)) return raw;
  const n = parseNumericPrice(raw);
  if (currency === "₹") return n.toLocaleString("en-IN");
  return n.toLocaleString("en-US");
}

function calculateDiscount(monthlyPrice: string, yearlyPrice: string): number {
  const monthly = parseNumericPrice(monthlyPrice);
  const yearly = parseNumericPrice(yearlyPrice);
  if (
    monthlyPrice.toLowerCase() === "custom" ||
    yearlyPrice.toLowerCase() === "custom" ||
    Number.isNaN(monthly) ||
    Number.isNaN(yearly) ||
    monthly === 0
  ) {
    return 0;
  }
  return Math.round(((monthly * 12 - yearly) / (monthly * 12)) * 100);
}

export interface PricingTableOneProps {
  className?: string;
  plans: Plan[];
  /** Section heading; omit or pass empty string to hide (e.g. when parent already has a hero). */
  title?: string;
  description?: string;
  onPlanSelect?: (planId: string) => void;
  size?: "small" | "medium" | "large";
  /** `classic` = gradient section, elevated cards. `minimal` = flatter, compact. */
  theme?: "minimal" | "classic";
}

const sizePad = {
  small: "p-4 md:p-5",
  medium: "p-5 md:p-6",
  large: "p-6 md:p-7",
} as const;

const sizeGap = {
  small: "gap-4",
  medium: "gap-5",
  large: "gap-6",
} as const;

const sizeTitle = {
  small: "text-2xl md:text-3xl",
  medium: "text-3xl md:text-4xl",
  large: "text-3xl md:text-5xl",
} as const;

const sizePrice = {
  small: "text-3xl",
  medium: "text-4xl",
  large: "text-4xl md:text-5xl",
} as const;

export function PricingTableOne({
  className,
  plans,
  title,
  description,
  onPlanSelect,
  size = "large",
  theme = "classic",
}: PricingTableOneProps) {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  const yearlyPriceDiscount = plans.length
    ? Math.max(
        ...plans.map((plan) =>
          calculateDiscount(plan.monthlyPrice, plan.yearlyPrice),
        ),
      )
    : 0;

  const isClassic = theme === "classic";

  const headline = title !== undefined && title !== "" ? title : null;
  const tagline =
    description === ""
      ? null
      : description ??
        (isClassic
          ? "Transparent pricing with no hidden fees. Upgrade or downgrade anytime."
          : null);
  const showIntro = Boolean(headline || tagline);

  return (
    <section
      className={cn(
        "relative w-full overflow-hidden",
        isClassic
          ? "bg-gradient-to-b from-zinc-50 via-white to-zinc-100 py-12 md:py-16 lg:py-20"
          : "bg-white py-8 md:py-12",
        className,
      )}
    >
      {/* shadcn-like soft orbs */}
      {isClassic && (
        <>
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgb(228 228 231) 1px, transparent 0)`,
              backgroundSize: "24px 24px",
            }}
          />
          <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-indigo-400/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-violet-400/10 blur-3xl" />
        </>
      )}

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {showIntro && (
          <div
            className={cn(
              "mx-auto mb-10 max-w-2xl",
              isClassic ? "text-center" : "text-left",
            )}
          >
            {headline && (
              <h2
                className={cn(
                  "font-bold tracking-tight text-zinc-900",
                  sizeTitle[size],
                )}
              >
                {headline}
              </h2>
            )}
            {tagline && (
              <p
                className={cn(
                  "text-pretty text-zinc-600",
                  headline ? "mt-3" : "",
                  size === "small" ? "text-sm" : "text-base md:text-lg",
                  isClassic && "mx-auto max-w-xl",
                )}
              >
                {tagline}
              </p>
            )}
          </div>
        )}

        <div
          className={cn(
            "mb-10 flex flex-col items-stretch justify-between gap-4 md:mb-12",
            isClassic ? "md:items-center" : "md:flex-row md:items-end",
          )}
        >
          <div
            className={cn(
              "inline-flex rounded-xl border border-zinc-200/80 bg-zinc-100/80 p-1 shadow-inner backdrop-blur-sm",
              isClassic && "mx-auto",
            )}
            role="group"
            aria-label="Billing period"
          >
            <button
              type="button"
              onClick={() => setBilling("monthly")}
              className={cn(
                "rounded-lg px-4 py-2.5 text-sm font-semibold transition-all md:px-8",
                billing === "monthly"
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80"
                  : "text-zinc-600 hover:text-zinc-900",
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBilling("yearly")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all md:px-8",
                billing === "yearly"
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80"
                  : "text-zinc-600 hover:text-zinc-900",
              )}
            >
              Yearly
              {yearlyPriceDiscount > 0 && (
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  Save {yearlyPriceDiscount}%
                </span>
              )}
            </button>
          </div>
        </div>

        <div
          className={cn(
            "grid grid-cols-1 md:grid-cols-3",
            sizeGap[size],
            "items-stretch",
          )}
        >
          {plans.map((plan, index) => {
            const discount = calculateDiscount(
              plan.monthlyPrice,
              plan.yearlyPrice,
            );
            const showCurrencyMonthly = isNumericPrice(plan.monthlyPrice);
            const showCurrencyYearly = isNumericPrice(plan.yearlyPrice);

            return (
              <motion.article
                key={plan.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.08 }}
                className={cn(
                  "relative flex flex-col rounded-2xl border text-left shadow-sm transition-all duration-300",
                  sizePad[size],
                  plan.highlight
                    ? "border-indigo-200 bg-gradient-to-b from-white to-indigo-50/40 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/20 md:-translate-y-1 md:shadow-lg"
                    : "border-zinc-200/90 bg-white hover:border-zinc-300 hover:shadow-md",
                )}
              >
                {plan.highlight && (
                  <div className="absolute right-4 top-4">
                    <span className="inline-flex items-center rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                      {plan.badge || "Most popular"}
                    </span>
                  </div>
                )}

                <span
                  className={cn(
                    "mb-6 inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                    plan.highlight
                      ? "border-indigo-200 bg-indigo-50 text-indigo-900"
                      : "border-zinc-200 bg-zinc-50 text-zinc-700",
                  )}
                >
                  {plan.title}
                </span>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={billing}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="min-h-[5.5rem]"
                  >
                    {billing === "yearly" ? (
                      <>
                        <div
                          className={cn(
                            "font-bold tracking-tight text-zinc-900",
                            sizePrice[size],
                            isClassic &&
                              "bg-gradient-to-br from-zinc-900 to-zinc-600 bg-clip-text text-transparent",
                          )}
                        >
                          {showCurrencyYearly && (
                            <span className="mr-0.5 text-zinc-600">
                              {plan.currency}
                            </span>
                          )}
                          {formatPriceDisplay(plan.currency ?? "₹", plan.yearlyPrice)}
                          {discount > 0 && (
                            <span className="ml-2 align-middle text-sm font-semibold text-emerald-600">
                              {discount}% off
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-zinc-500">per year</p>
                      </>
                    ) : (
                      <>
                        <div
                          className={cn(
                            "font-bold tracking-tight text-zinc-900",
                            sizePrice[size],
                            isClassic &&
                              "bg-gradient-to-br from-zinc-900 to-zinc-600 bg-clip-text text-transparent",
                          )}
                        >
                          {showCurrencyMonthly && (
                            <span className="mr-0.5 text-zinc-600">
                              {plan.currency}
                            </span>
                          )}
                          {formatPriceDisplay(plan.currency ?? "₹", plan.monthlyPrice)}
                        </div>
                        <p className="mt-1 text-sm text-zinc-500">per month</p>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>

                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {plan.description}
                </p>

                <div
                  className={cn(
                    "my-6 h-px w-full bg-gradient-to-r from-transparent via-zinc-200 to-transparent",
                    plan.highlight && "via-indigo-100",
                  )}
                />

                <ul className="mb-8 flex-1 space-y-3 text-sm text-zinc-600">
                  {plan.features.map((feature, featureIndex) => (
                    <motion.li
                      key={`${plan.id}-f-${featureIndex}`}
                      className="flex gap-3"
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.25,
                        delay: index * 0.06 + featureIndex * 0.04,
                      }}
                    >
                      <Check
                        className={cn(
                          "mt-0.5 h-5 w-5 shrink-0",
                          isClassic ? "text-emerald-600" : "text-zinc-900",
                        )}
                        strokeWidth={2.5}
                      />
                      <span className="leading-snug">{feature.name}</span>
                    </motion.li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => onPlanSelect?.(plan.id)}
                  aria-label={`Select ${plan.title} plan`}
                  className={cn(
                    "group relative mt-auto inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-3 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
                    plan.highlight
                      ? "bg-indigo-600 text-white shadow-md hover:bg-indigo-700 active:scale-[0.98]"
                      : "border border-zinc-200 bg-zinc-900 text-white shadow-sm hover:bg-zinc-800 active:scale-[0.98]",
                  )}
                >
                  {plan.highlight && <Zap className="h-4 w-4" />}
                  {plan.buttonText}
                  {plan.highlight && isClassic && (
                    <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  )}
                </button>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
