import React from 'react';
import { landingTheme } from './theme/landingTheme';

const wipeBand =
  'pointer-events-none absolute inset-y-0 -left-[40%] w-[55%] skew-x-[-14deg] bg-gradient-to-r from-transparent via-[rgba(242,196,78,0.5)] to-transparent opacity-0 transition-[transform,opacity] duration-0 group-hover:opacity-100 group-hover:duration-[480ms] group-hover:ease-out group-hover:translate-x-[320%]';

const baseRing =
  'group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full font-semibold transition-shadow duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2c44e]/80 disabled:pointer-events-none disabled:opacity-50';

type CtaVariant = 'navy' | 'white' | 'outlineLight';

const variantClass: Record<CtaVariant, string> = {
  navy: 'h-12 px-8 text-base text-white shadow-md hover:shadow-lg',
  white: 'h-12 px-10 text-base text-zinc-900 bg-white shadow-sm hover:shadow-md',
  outlineLight:
    'h-11 border border-white/25 bg-white/10 px-8 text-sm text-white backdrop-blur-sm hover:border-white/35 hover:bg-white/[0.14]',
};

function CtaInner({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className={wipeBand} aria-hidden />
      <span className="relative z-[1] flex items-center justify-center gap-2">{children}</span>
    </>
  );
}

export type LandingCtaButtonProps = {
  variant?: CtaVariant;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function LandingCtaButton({
  variant = 'navy',
  className = '',
  children,
  type = 'button',
  style,
  ...rest
}: LandingCtaButtonProps) {
  const customBg = !!style && ('background' in style || 'backgroundImage' in style);
  const mergedStyle: React.CSSProperties =
    variant === 'navy'
      ? customBg
        ? { ...style }
        : { backgroundColor: landingTheme.colors.navy, ...style }
      : { ...style };

  return (
    <button
      type={type}
      className={`${baseRing} ${variantClass[variant]} ${className}`}
      style={mergedStyle}
      {...rest}
    >
      <CtaInner>{children}</CtaInner>
    </button>
  );
}

export type LandingCtaAnchorProps = {
  variant?: CtaVariant;
  className?: string;
  children: React.ReactNode;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>;

export function LandingCtaAnchor({
  variant = 'navy',
  className = '',
  children,
  style,
  ...rest
}: LandingCtaAnchorProps) {
  const mergedStyle: React.CSSProperties =
    variant === 'navy'
      ? { backgroundColor: landingTheme.colors.navy, ...style }
      : { ...style };

  return (
    <a className={`${baseRing} ${variantClass[variant]} ${className}`} style={mergedStyle} {...rest}>
      <CtaInner>{children}</CtaInner>
    </a>
  );
}

/** Keyword highlight: golden underline on light UI; optional light tone for dark panels. */
export function LandingKeywordLine({
  children,
  className = '',
  tone = 'gold',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'gold' | 'light';
}) {
  const borderColor =
    tone === 'light' ? 'rgba(255, 255, 255, 0.9)' : `${landingTheme.colors.accentWarm}e6`;
  return (
    <span
      className={`border-b-2 pb-0.5 [box-decoration-break:clone] ${className}`}
      style={{ borderBottomColor: borderColor }}
    >
      {children}
    </span>
  );
}
