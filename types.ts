

import React, { DetailedHTMLProps, HTMLAttributes } from 'react';

/**
 * Augment the global JSX namespace to include the 'iconify-icon' custom element.
 * We nest this inside React.JSX to ensure proper merging with standard HTML elements
 * in React 18+ environments, avoiding shadowing of the global JSX namespace.
 */
declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        // Fix: Use imported types directly to avoid shadowing issues where 'React' inside this block refers to the namespace being augmented rather than the imported module.
        'iconify-icon': DetailedHTMLProps<HTMLAttributes<HTMLElement> & {
          icon?: string;
          width?: string | number;
          height?: string | number;
          flip?: string;
          rotate?: string | number;
          mode?: string;
          inline?: boolean;
          class?: string;
          className?: string;
        }, HTMLElement>;
      }
    }
  }
}

export {};
