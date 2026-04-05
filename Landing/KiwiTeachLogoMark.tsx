import React from 'react';
import { cn } from '@/lib/utils';

/** Brand mark aligned with `public/favicon.svg` / OG-style tile (K + accent dot). */
export function KiwiTeachLogoMark({
  className,
  decorative = false,
  title = 'KiwiTeach',
}: {
  className?: string;
  /** When true, hide from assistive tech (use beside visible “KiwiTeach” text). */
  decorative?: boolean;
  /** Accessible name when not decorative. */
  title?: string | undefined;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      className={cn('shrink-0', className)}
    >
      <rect width="64" height="64" rx="14" fill="#18181b" />
      <path d="M18 20h28v4H35v20h-6V24H18z" fill="#ffffff" />
      <circle cx="49" cy="15" r="6" fill="#4f46e5" />
    </svg>
  );
}
