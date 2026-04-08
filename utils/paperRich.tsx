import React from 'react';
import { parsePseudoLatexAndMath } from './latexParser';

export type PaperRichProps = {
  text: string;
  /** Extra classes on the host node (e.g. min-w-0). */
  className?: string;
  /** ResultScreen uses spans for stems/options inside a parent that has `math-content`. */
  as?: 'span' | 'div';
};

/**
 * Rich text exactly as the question-paper preview (ResultScreen BlockRenderer): KaTeX via
 * {@link parsePseudoLatexAndMath} only. No SMILES canvas — same as print preview.
 * Wrap with `className="math-content"` on this node or an ancestor for KaTeX CSS.
 */
export const PaperRich: React.FC<PaperRichProps> = ({ text, className = '', as: Tag = 'span' }) => (
  <Tag className={className} dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(text || '') }} />
);
