export type ButtonRadiusKey = 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
export type ButtonVariantKey = 'solid' | 'soft' | 'outline';

/** Row shape from public.platform_branding */
export interface PlatformBrandingRow {
  id: string;
  product_name: string;
  primary_color: string;
  secondary_color: string;
  page_background: string;
  surface_color: string;
  text_primary: string;
  text_muted: string;
  accent_warm: string;
  sidebar_color_top: string;
  sidebar_color_mid: string;
  sidebar_color_bottom: string;
  font_family_sans: string;
  font_family_heading: string;
  button_radius: ButtonRadiusKey;
  button_variant: ButtonVariantKey;
  updated_at: string;
  updated_by: string | null;
}

export interface ResolvedPlatformBranding extends PlatformBrandingRow {
  sidebarGradient: string;
}
