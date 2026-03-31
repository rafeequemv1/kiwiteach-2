
import katex from 'katex';
import 'katex/dist/contrib/mhchem.js';

/**
 * Robust LaTeX and Math Parser for Academic Content.
 * Handles standard delimiters ($, $$, \[, \() and "Lazy LaTeX" 
 * where common commands like \sqrt, \frac, and exponents are not wrapped.
 */
export const parsePseudoLatexAndMath = (text: string): string => {
  if (!text) return text;

  let processedText = text;

  // Normalize over-escaped LaTeX commands from imported/generated text.
  // Example: "\\text{\\dfrac{m}{s}}" -> "\text{\dfrac{m}{s}}"
  processedText = processedText.replace(/\\\\([a-zA-Z]+)/g, '\\$1');

  // 1. PROTECTION PHASE: Handle common \ce arrows and AI artifacts manually
  
  // Replace \ce{->} and variations with standard LaTeX Math arrows
  processedText = processedText.replace(/\\ce\s*\{\s*->\s*\}/gi, ' $\\rightarrow$ ');
  processedText = processedText.replace(/\\ce\s*\{\s*<-\s*\}/gi, ' $\\leftarrow$ ');
  processedText = processedText.replace(/\\ce\s*\{\s*<->\s*\}/gi, ' $\\leftrightarrow$ ');
  processedText = processedText.replace(/\\ce\s*\{\s*<=>\s*\}/gi, ' $\\rightleftharpoons$ ');
  processedText = processedText.replace(/\\ce\s*\{\s*=>\s*\}/gi, ' $\\Rightarrow$ ');
  
  // Handle "Lazy" \ce usage (e.g., \ce -> without braces)
  processedText = processedText.replace(/\\ce\s*->/gi, ' $\\rightarrow$ ');

  // Convert bare text arrows to LaTeX
  processedText = processedText.replace(/([a-zA-Z0-9)])\s*(->|=>|-->|==>)\s*([a-zA-Z0-9(])/g, '$1 $\\rightarrow$ $3');

  // --- SQUARE ROOT FIXES ---
  // Fix specific artifact where root renders as Coproduct (∐) or Amalg
  processedText = processedText.replace(/∐/g, '\\sqrt');
  processedText = processedText.replace(/\\coprod/g, '\\sqrt'); 
  
  // Convert "sqrt(...)" or "sqrt{...}" without backslash to "\sqrt{...}"
  // Matches "sqrt" preceded by start-of-line or non-backslash character
  processedText = processedText.replace(/([^\\]|^)\bsqrt\s*(?=[({[])/g, '$1\\sqrt');

  // Handle "Lazy" roots using parentheses: \sqrt(x) -> \sqrt{x}
  processedText = processedText.replace(/\\sqrt\s*\(([^)]+)\)/gi, '\\sqrt{$1}');
  
  // Handle Unicode Square Root: √x or √(x) -> \sqrt{x}
  processedText = processedText.replace(/√\s*\(([^)]+)\)/gi, '\\sqrt{$1}');
  processedText = processedText.replace(/√\s*([a-zA-Z0-9]+)/gi, '\\sqrt{$1}');

  // --- FONT SIZE & SPACING STANDARDIZATION ---
  // Replace \frac with \dfrac to force full-size fractions
  processedText = processedText.replace(/\\frac/g, '\\dfrac');
  
  // Ensure integrals and sums are display style for clarity
  processedText = processedText.replace(/\\int/g, '\\displaystyle\\int');
  processedText = processedText.replace(/\\sum/g, '\\displaystyle\\sum');

  // --- ISOTOPE / PRE-SCRIPT HANDLING ---
  // Matches _{1}^{2}H or ^{2}_{1}H patterns often used in physics/chemistry questions
  processedText = processedText.replace(/_\{([^{}]+)\}\^\{([^{}]+)\}([A-Za-z]+)/g, '${}_{$1}^{$2}\\mathrm{$3}$');
  processedText = processedText.replace(/\^\{([^{}]+)\}_\{([^{}]+)\}([A-Za-z]+)/g, '${}_{$2}^{$1}\\mathrm{$3}$');

  // --- FRACTION PARSING (Convert slash / to \dfrac) ---
  // Only convert if operands are distinct math tokens.
  
  // 1. Parentheses groups: (a+b)/(c+d) -> \dfrac{a+b}{c+d}
  processedText = processedText.replace(/\(([^)]+)\)\s*\/\s*\(([^)]+)\)/g, '\\dfrac{$1}{$2}');
  
  // 2. Mixed: (group)/var or var/(group) where var is math-like
  processedText = processedText.replace(/\(([^)]+)\)\s*\/\s*([a-zA-Z0-9\.]+(?:\^\{?[a-zA-Z0-9\+\-]+\}?)?)/g, '\\dfrac{$1}{$2}');
  processedText = processedText.replace(/([a-zA-Z0-9\.]+(?:\^\{?[a-zA-Z0-9\+\-]+\}?)?)\s*\/\s*\(([^)]+)\)/g, '\\dfrac{$1}{$2}');

  // 3. Mixed with Sqrt or Greek
  // Handle things like \sqrt{3}/2 or \pi/4
  processedText = processedText.replace(/(\\sqrt\{[^}]+\}|\\pi|\\omega|\\theta|\\alpha|\\beta)\s*\/\s*(\d+|[a-zA-Z])/g, '\\dfrac{$1}{$2}');
  processedText = processedText.replace(/(\d+|[a-zA-Z])\s*\/\s*(\\sqrt\{[^}]+\}|\\pi|\\omega|\\theta|\\alpha|\\beta)/g, '\\dfrac{$1}{$2}');

  // 4. Variables, Numbers, Units
  // STRICTER REGEX:
  // Numerator/Denominator must be: digits OR single letter OR letter with exponent.
  // Excludes words > 1 char unless they are known units like 'cm', 'mm'.
  // Using negative lookahead/behind to skip URL protocols.
  
  const mathToken = `(?:\\d+(?:\\.\\d+)?|[a-zA-Z](?:\\^\\{?[a-zA-Z0-9\\+\\-]+\\}?)?)`; 
  // Pattern: token / token
  // We use a custom replacer to check if it's a word like "True/False"
  processedText = processedText.replace(new RegExp(`(?<!http:|https:)(?<!\\w)(${mathToken})\\s*\\/\\s*(${mathToken})(?!\\w)`, 'g'), (match, n, d) => {
      // Safety check: if numerator or denominator are simple words > 2 chars and no digits, ignore
      // e.g. "True/False", "High/Low"
      const isWord = (s: string) => /^[a-zA-Z]{2,}$/.test(s);
      if (isWord(n) && isWord(d)) {
          // Allow units like mm/s, kg/m
          const units = ['mm', 'cm', 'km', 'kg', 'mg', 'sec', 'mol'];
          if (units.includes(n) || units.includes(d)) return `\\dfrac{${n}}{${d}}`;
          return match; // Leave as text slash
      }
      return `\\dfrac{${n}}{${d}}`;
  });
  
  // 2. COMPREHENSIVE REGEX for KaTeX detection.
  // Separated into:
  // - Environments ($$, \[)
  // - Functions with arguments (\sqrt{...}, \dfrac{...}) - UPDATED FOR DEEP NESTING
  // - Standalone symbols (\pi, \omega)
  // - Lazy Scripts (x^2)

  // List of functions that typically require arguments {}
  const funcs = 'sqrt|frac|dfrac|mathrm|mathbf|text|textbf|textit|underline|sum|int|lim|vec|hat|bar|over|binom';
  
  // List of standalone symbols (Greek, operators) that don't necessarily need arguments
  const symbols = 'alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|omicron|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|infty|pm|approx|neq|leq|geq|times|div|cdot|partial|nabla|forall|exists|empty|emptyset|to|rightarrow|leftarrow|leftrightarrow|implies|iff|angle|circ|degree';

  // Recursive-like pattern for balanced braces (depth 2) to handle \dfrac{\sqrt{x}}{y}
  // L0: [^{}]*
  // L1: (?:[^{}]|{[^{}]*})*
  // L2: (?:[^{}]|{(?:[^{}]|{[^{}]*})*})*
  const balancedBraces = '(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*';

  const mathChemRegex = new RegExp(
    // 1. Explicit Math Environments
    '(\\\\\\\[[\\s\\S]*?\\\\\\]|\\\\\\(.*?\\\\\\)|\\\\ce\\{(?:[^{}]|{[^{}]*})*\\}|\\$\\$[\\s\\S]*?\\$\\$|\\$[^$\\n]+?\\$|' +
    // 2. Functions with braces (Depth 2 support)
    // Matches \cmd{arg1}{arg2} or \cmd{arg1}
    '\\\\(?:' + funcs + ')\\s*\\{' + balancedBraces + '\\}(?:\\s*\\{' + balancedBraces + '\\})?|' +
    // 3. Standalone Symbols (must be matched as whole words to avoid prefix matching)
    '\\\\(?:' + symbols + ')\\b|' +
    // 4. Lazy Sub/Superscripts (trailing check)
    // Allows optional space around operator: x ^ 2
    '(?<=[\\s\\w)\\]}.,:;+\\-*/=<>|]|^)[a-zA-Z0-9]*\\s*[\\^_]\\s*\\{?[a-zA-Z0-9+\\-]+\\}?(?=[\\s\\w)\\]}.,:;+\\-*/=<>|]|$))',
    'gs'
  );

  const renderedBlocks: string[] = [];
  
  processedText = processedText.replace(mathChemRegex, (match) => {
    let mathContent = '';
    let isDisplayMode = false;

    // Determine content and mode based on delimiters
    if (match.startsWith('$$') && match.endsWith('$$')) {
      mathContent = match.slice(2, -2);
      isDisplayMode = true;
    } else if (match.startsWith('$') && match.endsWith('$')) {
      mathContent = match.slice(1, -1);
      isDisplayMode = false;
    } else if (match.startsWith('\\[')) {
      mathContent = match.slice(2, -2);
      isDisplayMode = true;
    } else if (match.startsWith('\\(')) {
      mathContent = match.slice(2, -2);
      isDisplayMode = false;
    } else if (match.startsWith('\\ce{')) {
      mathContent = match; // KaTeX mhchem handles \ce{...} directly if loaded
      isDisplayMode = false;
    } else {
      // It's a bare command (like \pi or \dfrac{...}) or exponent
      // Wrap it in standard LaTeX for KaTeX
      mathContent = match;
      isDisplayMode = false;
    }

    try {
      const renderedHtml = katex.renderToString(mathContent.trim(), {
        throwOnError: false, 
        errorColor: '#000000', // FORCE BLACK for errors (no red font in paper)
        displayMode: isDisplayMode,
        trust: true,
        strict: false,
        macros: {
          "\\ce": "\\ce", // Ensure mhchem macro is recognized if available
          "\\frac": "\\dfrac" // Macro override just in case
        }
      });
      const placeholder = `__MATH_BLOCK_${renderedBlocks.length}__`;
      renderedBlocks.push(renderedHtml);
      return placeholder;
    } catch (e) {
      console.error('KaTeX rendering error:', e);
      // Fallback: If it failed, strip the latex command and show text
      return match.replace(/^\\[a-zA-Z]+{/, '').replace(/}$/, '');
    }
  });

  // 3. FALLBACK formatting for remaining text symbols (Outside of LaTeX blocks)
  processedText = processedText.replace(/->/g, ' → ');
  processedText = processedText.replace(/=>/g, ' ⇒ ');
  processedText = processedText.replace(/<->/g, ' ↔ ');
  processedText = processedText.replace(/<=>/g, ' ⇔ ');

  // Standard Markdown/HTML sanitization (but skip already rendered math blocks)
  const tempMap: Record<string, string> = {};
  processedText = processedText.replace(/__MATH_BLOCK_(\d+)__/g, (match) => {
      const id = `PLACEHOLDER_${Math.random().toString(36).substr(2, 9)}`;
      tempMap[id] = match;
      return id;
  });

  // Safe HTML Conversion for the "text" parts
  processedText = processedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
    
  // Convert Markdown leftovers
  processedText = processedText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  processedText = processedText.replace(/\*(.*?)\*/g, '<i>$1</i>');
  processedText = processedText.replace(/\n/g, '<br />');

  // Restore placeholders
  Object.keys(tempMap).forEach(id => {
      processedText = processedText.replace(id, tempMap[id]);
  });

  // 4. Final Injection of KaTeX HTML
  processedText = processedText.replace(/__MATH_BLOCK_(\d+)__/g, (_, index) => {
    return renderedBlocks[parseInt(index, 10)];
  });

  return processedText;
};

/** Find byte index just after the matching `</table>` for a fragment that starts with `<table`. Handles nested tables. */
function findClosingTableTagEnd(html: string): number {
  const lower = html.toLowerCase();
  if (!lower.startsWith('<table')) return -1;
  let depth = 1;
  let pos = lower.indexOf('>', 0) + 1;
  while (pos < html.length && depth > 0) {
    const openAt = lower.indexOf('<table', pos);
    const closeAt = lower.indexOf('</table>', pos);
    if (closeAt === -1) return -1;
    if (openAt !== -1 && openAt < closeAt) {
      depth++;
      pos = openAt + 6;
    } else {
      depth--;
      pos = closeAt + '</table>'.length;
      if (depth === 0) return pos;
    }
  }
  return -1;
}

function sanitizeInlineTableHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html.trim(), 'text/html');
    const table = doc.querySelector('table');
    if (!table) return '';
    table.querySelectorAll('*').forEach((el) => {
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') {
        el.remove();
        return;
      }
      [...el.attributes].forEach((attr) => {
        const n = attr.name.toLowerCase();
        if (tag === 'TD' || tag === 'TH') {
          if (n !== 'colspan' && n !== 'rowspan') el.removeAttribute(attr.name);
        } else if (tag === 'IMG') {
          if (n !== 'src' && n !== 'alt') el.removeAttribute(attr.name);
        } else {
          el.removeAttribute(attr.name);
        }
      });
      if (tag === 'IMG') {
        const src = el.getAttribute('src') || '';
        if (!/^https?:\/\//i.test(src) && !src.startsWith('data:image/')) {
          el.removeAttribute('src');
        }
        (el as HTMLImageElement).className = 'max-h-44 max-w-full object-contain mx-auto';
      }
    });
    table.className =
      'pyq-inline-table border-collapse w-full my-1 text-[9pt] [&_td]:border [&_td]:border-zinc-400 [&_th]:border [&_th]:border-zinc-400 [&_td]:px-1.5 [&_th]:px-1.5 [&_th]:bg-zinc-50';
    return table.outerHTML;
  } catch {
    return '';
  }
}

/**
 * Like {@link parsePseudoLatexAndMath} but leaves `<table>…</table>` regions as sanitized HTML (for match lists / column layouts).
 * Other segments still go through KaTeX / pseudo-LaTeX.
 */
export const parsePseudoLatexAndMathAllowTables = (text: string): string => {
  if (!text) return text;
  let result = '';
  let rest = text;
  while (rest.length > 0) {
    const idx = rest.search(/<table\b/i);
    if (idx === -1) {
      result += parsePseudoLatexAndMath(rest);
      break;
    }
    if (idx > 0) result += parsePseudoLatexAndMath(rest.slice(0, idx));
    const slice = rest.slice(idx);
    const end = findClosingTableTagEnd(slice);
    if (end === -1) {
      result += parsePseudoLatexAndMath(slice);
      break;
    }
    const tableHtml = slice.slice(0, end);
    const sanitized = sanitizeInlineTableHtml(tableHtml);
    result += sanitized || parsePseudoLatexAndMath(tableHtml.replace(/<[^>]+>/g, ' '));
    rest = slice.slice(end);
  }
  return result;
};

export const stripLatexAndMarkup = (text: string): string => {
  if (!text) return text;
  let strippedText = text;
  // Strip LaTeX blocks
  strippedText = strippedText.replace(/(\\[.*?\\]|\\\(.*?\\\)|\\ce\{(?:[^{}]|{[^{}]*})*\}|\$\$.*?\$\$|\$.*?\$)/gs, '');
  // Strip bare LaTeX commands
  strippedText = strippedText.replace(/\\[a-zA-Z]+\{.*?\}/g, '');
  // Strip Markdown
  strippedText = strippedText.replace(/\*\*(.*?)\*\*/g, '$1');
  strippedText = strippedText.replace(/\*(.*?)\*/g, '$1');
  // Normalize arrows
  strippedText = strippedText.replace(/->/g, '→');
  strippedText = strippedText.replace(/=>/g, '⇒');
  strippedText = strippedText.replace(/\n/g, ' ');
  return strippedText.trim();
};
