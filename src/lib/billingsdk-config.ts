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
    id: "tier-1",
    title: "Tier 1",
    description: "",
    currency: "Rs",
    monthlyPrice: "3000",
    yearlyPrice: "36000",
    buttonText: "Choose Tier 1",
    features: [
      { name: "Class Test QP PDF", icon: "check", iconColor: "text-green-500" },
      { name: "Cost per student: Rs 10", icon: "check", iconColor: "text-orange-500" },
      { name: "Rs 3000 per month", icon: "check", iconColor: "text-teal-500" },
      { name: "Monthly QP limit applies", icon: "check", iconColor: "text-blue-500" },
    ],
  },
  {
    id: "tier-2",
    title: "Tier 2",
    description: "",
    currency: "Rs",
    monthlyPrice: "120",
    yearlyPrice: "1440",
    buttonText: "Choose Tier 2",
    badge: "Most popular",
    highlight: true,
    features: [
      { name: "Class Test QP PDF", icon: "check", iconColor: "text-green-500" },
      { name: "Online exam", icon: "check", iconColor: "text-orange-500" },
      { name: "Mock Test", icon: "check", iconColor: "text-teal-500" },
      { name: "Student profile", icon: "check", iconColor: "text-blue-500" },
      { name: "Report", icon: "check", iconColor: "text-zinc-500" },
      { name: "Cost per student: Rs 15", icon: "check", iconColor: "text-zinc-500" },
      { name: "Rs 120 per month (per student)", icon: "check", iconColor: "text-zinc-500" },
    ],
  },
  {
    id: "tier-3",
    title: "Tier 3",
    description: "",
    currency: "Rs",
    monthlyPrice: "200",
    yearlyPrice: "2400",
    buttonText: "Choose Tier 3",
    features: [
      { name: "Question Paper (Class Test)", icon: "check", iconColor: "text-green-500" },
      { name: "Student Profiles", icon: "check", iconColor: "text-orange-500" },
      { name: "Online Test", icon: "check", iconColor: "text-teal-500" },
      { name: "AI student report", icon: "check", iconColor: "text-blue-500" },
      { name: "Report", icon: "check", iconColor: "text-zinc-500" },
      { name: "Institute / Class Management", icon: "check", iconColor: "text-zinc-500" },
      { name: "Cost per student: Rs 25", icon: "check", iconColor: "text-zinc-500" },
      {
        name: "Rs 200 per month (per student, negotiable with student count)",
        icon: "check",
        iconColor: "text-zinc-500",
      },
    ],
  },
];
