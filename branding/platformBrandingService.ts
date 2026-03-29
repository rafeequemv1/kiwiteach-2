import { supabase } from '../supabase/client';
import type { PlatformBrandingRow } from './types';

const SELECT_FIELDS =
  'id, product_name, primary_color, secondary_color, page_background, surface_color, text_primary, text_muted, accent_warm, sidebar_color_top, sidebar_color_mid, sidebar_color_bottom, font_family_sans, font_family_heading, button_radius, button_variant, updated_at, updated_by';

export async function fetchPlatformBrandingRow(): Promise<PlatformBrandingRow | null> {
  const { data, error } = await supabase.from('platform_branding').select(SELECT_FIELDS).eq('id', 'default').maybeSingle();
  if (error) {
    console.warn('platform_branding fetch:', error.message);
    return null;
  }
  return data as PlatformBrandingRow | null;
}

export async function savePlatformBranding(
  row: PlatformBrandingRow,
  userId: string | null
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('platform_branding').upsert(
    {
      id: 'default',
      product_name: row.product_name,
      primary_color: row.primary_color,
      secondary_color: row.secondary_color,
      page_background: row.page_background,
      surface_color: row.surface_color,
      text_primary: row.text_primary,
      text_muted: row.text_muted,
      accent_warm: row.accent_warm,
      sidebar_color_top: row.sidebar_color_top,
      sidebar_color_mid: row.sidebar_color_mid,
      sidebar_color_bottom: row.sidebar_color_bottom,
      font_family_sans: row.font_family_sans,
      font_family_heading: row.font_family_heading,
      button_radius: row.button_radius,
      button_variant: row.button_variant,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: 'id' }
  );
  return { error: error ? new Error(error.message) : null };
}

export const PLATFORM_BRANDING_UPDATED_EVENT = 'kiwiteach:platform-branding-updated';

export function notifyPlatformBrandingUpdated() {
  window.dispatchEvent(new Event(PLATFORM_BRANDING_UPDATED_EVENT));
}
