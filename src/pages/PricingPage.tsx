import React, { useEffect, useState } from 'react';
import { PricingTableOne } from '@/components/billingsdk/pricing-table-one';
import { fallbackPricingPlans, type Plan } from '@/lib/billingsdk-config';
import { fetchMarketingPricingPlans } from '@/lib/marketingPricing';

interface PricingPageProps {
  /** Omit hero title/padding when embedded in marketing layout (e.g. Landing pricing tab). */
  embedded?: boolean;
}

const PricingPage: React.FC<PricingPageProps> = ({ embedded = false }) => {
  const [plans, setPlans] = useState<Plan[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await fetchMarketingPricingPlans();
      if (cancelled) return;
      setPlans(remote?.length ? remote : fallbackPricingPlans);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (plans === null) {
    return (
      <div
        className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${embedded ? 'py-4 md:py-6' : 'py-12'}`}
      >
        <div className="mx-auto max-w-3xl animate-pulse space-y-6 rounded-2xl border border-zinc-200 bg-white p-8">
          <div className="mx-auto h-8 w-48 rounded-md bg-zinc-200" />
          <div className="mx-auto h-4 w-full max-w-md rounded bg-zinc-100" />
          <div className="grid gap-4 pt-6 md:grid-cols-3">
            <div className="h-72 rounded-2xl bg-zinc-100" />
            <div className="h-72 rounded-2xl bg-zinc-100" />
            <div className="h-72 rounded-2xl bg-zinc-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${embedded ? 'py-4 md:py-6' : 'py-12'}`}>
      {!embedded && (
        <h1 className="mb-8 text-center text-4xl font-bold tracking-tight text-zinc-900">
          Our pricing plans
        </h1>
      )}
      <PricingTableOne
        plans={plans}
        onPlanSelect={(planId) => console.log('Selected plan:', planId)}
        size="large"
        theme="classic"
        title=""
        description={embedded ? '' : undefined}
      />
    </div>
  );
};

export default PricingPage;
