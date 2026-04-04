import type { Plan } from '@/lib/billingsdk-config';
import { supabase } from '../../supabase/client';

const INR = '₹';

export type MarketingPricingRow = {
  plan_key: string;
  title: string;
  description: string;
  currency: string;
  pricing_model: 'fixed' | 'custom';
  monthly_amount_paise: number | null;
  yearly_amount_paise: number | null;
  highlight: boolean;
  badge: string | null;
  button_text: string;
  features: unknown;
  sort_order: number;
};

function paiseToRupeeAmountString(paise: number): string {
  return String(Math.round(paise / 100));
}

function normalizeFeatures(raw: unknown): Plan['features'] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (item && typeof item === 'object' && 'name' in item) {
      const o = item as Record<string, unknown>;
      return {
        name: String(o.name ?? ''),
        icon: typeof o.icon === 'string' ? o.icon : 'check',
        iconColor: typeof o.iconColor === 'string' ? o.iconColor : 'text-zinc-500',
      };
    }
    return { name: '', icon: 'check', iconColor: 'text-zinc-500' };
  });
}

function rowToPlan(row: MarketingPricingRow): Plan {
  const base = {
    id: row.plan_key,
    title: row.title,
    description: row.description,
    currency: INR,
    highlight: row.highlight,
    badge: row.badge ?? undefined,
    buttonText: row.button_text,
    features: normalizeFeatures(row.features),
  };

  if (row.pricing_model === 'custom') {
    return {
      ...base,
      monthlyPrice: 'Custom',
      yearlyPrice: 'Custom',
    };
  }

  const m = row.monthly_amount_paise ?? 0;
  const y = row.yearly_amount_paise ?? 0;

  return {
    ...base,
    monthlyPrice: paiseToRupeeAmountString(m),
    yearlyPrice: paiseToRupeeAmountString(y),
  };
}

/** Loads active marketing plans from Supabase (INR). Returns null if the query fails or returns no rows. */
export async function fetchMarketingPricingPlans(): Promise<Plan[] | null> {
  const { data, error } = await supabase
    .from('marketing_pricing_plans')
    .select(
      'plan_key, title, description, currency, pricing_model, monthly_amount_paise, yearly_amount_paise, highlight, badge, button_text, features, sort_order',
    )
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.warn('fetchMarketingPricingPlans', error.message);
    return null;
  }
  if (!data?.length) return null;

  const rows = data as MarketingPricingRow[];
  for (const row of rows) {
    if (row.currency && row.currency !== 'INR') {
      console.warn('marketing_pricing_plans: expected INR only, got', row.currency, row.plan_key);
    }
  }

  return rows.map(rowToPlan);
}
