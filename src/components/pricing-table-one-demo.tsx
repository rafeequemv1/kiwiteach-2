import { PricingTableOne } from "@/components/billingsdk/pricing-table-one";
import { fallbackPricingPlans } from "@/lib/billingsdk-config";

export function PricingTableOneDemo() {
  return (
    <PricingTableOne
      plans={fallbackPricingPlans}
      title="Pricing"
      description="Choose the plan that's right for you"
      onPlanSelect={(planId) => console.log("Selected plan:", planId)}
      size="medium" // small, medium, large
      theme="classic" // minimal or classic
      className="w-full"
    />
  );
}
