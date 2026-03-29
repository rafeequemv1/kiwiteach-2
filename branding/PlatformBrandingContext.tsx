import '../types';
import React, { createContext, useContext } from 'react';
import { resolvePlatformBranding } from './defaults';
import type { ResolvedPlatformBranding } from './types';

const PlatformBrandingContext = createContext<ResolvedPlatformBranding>(resolvePlatformBranding(null));

export const PlatformBrandingProvider: React.FC<{
  value: ResolvedPlatformBranding;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <PlatformBrandingContext.Provider value={value}>{children}</PlatformBrandingContext.Provider>
);

export function usePlatformBranding(): ResolvedPlatformBranding {
  return useContext(PlatformBrandingContext);
}
