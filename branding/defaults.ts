import type { CSSProperties } from 'react';
import type { ButtonRadiusKey, ButtonVariantKey, PlatformBrandingRow, ResolvedPlatformBranding } from './types';

export const DEFAULT_PLATFORM_BRANDING: PlatformBrandingRow = {
  id: 'default',
  product_name: 'KiwiTeach',
  primary_color: '#6366f1',
  secondary_color: '#35c3ae',
  page_background: '#f5f6fb',
  surface_color: '#ffffff',
  text_primary: '#171a2e',
  text_muted: '#5f6783',
  accent_warm: '#f2c44e',
  sidebar_color_top: '#08132d',
  sidebar_color_mid: '#0b1a3a',
  sidebar_color_bottom: '#0f2248',
  font_family_sans: 'Inter, system-ui, sans-serif',
  font_family_heading: 'Lato, system-ui, sans-serif',
  button_radius: 'lg',
  button_variant: 'solid',
  updated_at: new Date().toISOString(),
  updated_by: null,
};

function clampRadius(v: string): ButtonRadiusKey {
  const allowed: ButtonRadiusKey[] = ['none', 'sm', 'md', 'lg', 'xl', 'full'];
  return (allowed.includes(v as ButtonRadiusKey) ? v : 'lg') as ButtonRadiusKey;
}

function clampVariant(v: string): ButtonVariantKey {
  const allowed: ButtonVariantKey[] = ['solid', 'soft', 'outline'];
  return (allowed.includes(v as ButtonVariantKey) ? v : 'solid') as ButtonVariantKey;
}

export function sidebarGradientFromRow(row: Pick<PlatformBrandingRow, 'sidebar_color_top' | 'sidebar_color_mid' | 'sidebar_color_bottom'>): string {
  return `linear-gradient(180deg, ${row.sidebar_color_top} 0%, ${row.sidebar_color_mid} 55%, ${row.sidebar_color_bottom} 100%)`;
}

/** Merge DB partial row with defaults and compute gradient. */
export function resolvePlatformBranding(partial: Partial<PlatformBrandingRow> | null | undefined): ResolvedPlatformBranding {
  const base = { ...DEFAULT_PLATFORM_BRANDING, ...partial, id: 'default' };
  const row: PlatformBrandingRow = {
    ...base,
    button_radius: clampRadius(base.button_radius),
    button_variant: clampVariant(base.button_variant),
  };
  return {
    ...row,
    sidebarGradient: sidebarGradientFromRow(row),
  };
}

/** Maps button_radius to CSS border-radius for inline preview / runtime. */
export function radiusToCss(r: ButtonRadiusKey): string {
  switch (r) {
    case 'none':
      return '0';
    case 'sm':
      return '0.25rem';
    case 'md':
      return '0.375rem';
    case 'lg':
      return '0.5rem';
    case 'xl':
      return '0.75rem';
    case 'full':
      return '9999px';
    default:
      return '0.5rem';
  }
}

export function primaryButtonStyle(b: ResolvedPlatformBranding): CSSProperties {
  const r = radiusToCss(b.button_radius);
  const { primary_color, secondary_color, surface_color, text_primary } = b;
  if (b.button_variant === 'outline') {
    return {
      borderRadius: r,
      border: `2px solid ${primary_color}`,
      background: 'transparent',
      color: primary_color,
      fontWeight: 600,
    };
  }
  if (b.button_variant === 'soft') {
    return {
      borderRadius: r,
      border: `1px solid color-mix(in srgb, ${primary_color} 35%, transparent)`,
      background: `color-mix(in srgb, ${primary_color} 18%, ${surface_color})`,
      color: text_primary,
      fontWeight: 600,
    };
  }
  return {
    borderRadius: r,
    border: 'none',
    background: `linear-gradient(90deg, ${primary_color} 0%, ${secondary_color} 100%)`,
    color: '#ffffff',
    fontWeight: 600,
  };
}

export function secondaryButtonStyle(b: ResolvedPlatformBranding): CSSProperties {
  const r = radiusToCss(b.button_radius);
  return {
    borderRadius: r,
    border: `1px solid color-mix(in srgb, ${b.secondary_color} 40%, transparent)`,
    background: `color-mix(in srgb, ${b.secondary_color} 15%, ${b.surface_color})`,
    color: b.text_primary,
    fontWeight: 600,
  };
}
