export interface Plan {
  id: string;
  title: string;
  description: string;
  highlight?: boolean;
  type?: "monthly" | "yearly";
  currency?: string;
  monthlyPrice: string;
  yearlyPrice: string;
  buttonText: string;
  badge?: string;
  features: {
    name: string;
    icon: string;
    iconColor?: string;
  }[];
}

export interface CurrentPlan {
  plan: Plan;
  type: "monthly" | "yearly" | "custom";
  price?: string;
  nextBillingDate: string;
  paymentMethod: string;
  status: "active" | "inactive" | "past_due" | "cancelled";
}

/** Used when `marketing_pricing_plans` is missing or the Supabase fetch fails (offline / migration not applied). INR amounts as whole rupees in string form. */
export const fallbackPricingPlans: Plan[] = [
  {
    id: "starter",
    title: "Starter",
    description:
      "For individual teachers getting started with AI test papers and a single class.",
    currency: "₹",
    monthlyPrice: "0",
    yearlyPrice: "0",
    buttonText: "Start free",
    features: [
      {
        name: "Core question bank access",
        icon: "check",
        iconColor: "text-green-500",
      },
      {
        name: "Limited test generations per month",
        icon: "check",
        iconColor: "text-orange-500",
      },
      {
        name: "Community support",
        icon: "check",
        iconColor: "text-teal-500",
      },
      {
        name: "Single teacher workspace",
        icon: "check",
        iconColor: "text-blue-500",
      },
    ],
  },
  {
    id: "pro",
    title: "Pro",
    description:
      "For institutes running online exams, student rosters, and scaled test series.",
    currency: "₹",
    monthlyPrice: "1999",
    yearlyPrice: "19999",
    buttonText: "Get Pro",
    badge: "Most popular",
    highlight: true,
    features: [
      {
        name: "Unlimited paper tests & scheduling",
        icon: "check",
        iconColor: "text-green-500",
      },
      {
        name: "Online exams & proctoring basics",
        icon: "check",
        iconColor: "text-orange-500",
      },
      {
        name: "Student profiles & classes",
        icon: "check",
        iconColor: "text-teal-500",
      },
      {
        name: "OMR & performance reports",
        icon: "check",
        iconColor: "text-blue-500",
      },
      {
        name: "Email support",
        icon: "check",
        iconColor: "text-zinc-500",
      },
    ],
  },
  {
    id: "enterprise",
    title: "Enterprise",
    description:
      "Custom rollout, SSO, dedicated support, and compliance for large chains.",
    currency: "₹",
    monthlyPrice: "Custom",
    yearlyPrice: "Custom",
    buttonText: "Talk to sales",
    features: [
      {
        name: "Everything in Pro",
        icon: "check",
        iconColor: "text-green-500",
      },
      {
        name: "Custom integrations & SLAs",
        icon: "check",
        iconColor: "text-orange-500",
      },
      {
        name: "Onboarding & training",
        icon: "check",
        iconColor: "text-teal-500",
      },
      {
        name: "Dedicated success manager",
        icon: "check",
        iconColor: "text-blue-500",
      },
    ],
  },
];
