
import katex from 'katex';
/** ESM entry — must match `katex` package import (not UMD `dist/contrib/mhchem.js` or \\ce never registers). */
import 'katex/contrib/mhchem';

/**
 * KaTeX math mode treats `_` as subscripts. Old placeholders `__MATH_BLOCK_0__` inside `$...$`
 * were parsed as nested subscripts and leaked visibly. Use BMP private-use sentinels instead.
 */
const KTX_START = '\uFFF9'; // interlinear annotation anchor — not used in exam prose
const KTX_END = '\uFFF8';
const KTX_CODE0 = 0xe000;

function ktxPlaceholder(blockIndex: number): string {
  return `${KTX_START}${String.fromCharCode(KTX_CODE0 + blockIndex)}${KTX_END}`;
}

/** Passed to every KaTeX render here so typo commands still resolve if they slip into math mode. */
const KATEX_PAPER_MACROS: Record<string, string> = {
  '\\frac': '\\dfrac',
  '\\triangleriangle': '\\Delta',
  '\\Triangleriangle': '\\Delta',
};

/**
 * Gen-AI typo \\triangleriangle (often \\triangleriangleH_{mix}) — normalize to \\Delta everywhere we can.
 * Handles missing/extra backslashes and stray whitespace after \\.
 */
function normalizeTriangleriangleTypo(s: string): string {
  let t = s;
  t = t.replace(/\\{1,3}\s*triangleriangle/gi, '\\Delta');
  t = t.replace(/(^|[^\\])triangleriangle/gi, '$1\\Delta');
  return t;
}

/** Hold `\ce{…}` while running global \frac/\int/slash preprocessors — those corrupt mhchem. */
const CE_HOLD_START = '\uFFF7';
const CE_HOLD_END = '\uFFF6';
const CE_HOLD_CODE0 = 0xe600;

function ceHoldPlaceholder(i: number): string {
  return `${CE_HOLD_START}${String.fromCharCode(CE_HOLD_CODE0 + i)}${CE_HOLD_END}`;
}

function protectMhchemSegments(s: string): { t: string; parts: string[] } {
  const parts: string[] = [];
  let i = 0;
  let out = '';
  while (i < s.length) {
    const k = s.indexOf('\\ce', i);
    if (k === -1) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, k);
    let p = k + 3;
    while (p < s.length && /\s/.test(s[p])) p++;
    if (p < s.length && s[p] === '{') {
      const close = endOfBalancedGroup(s, p);
      if (close !== null) {
        parts.push(s.slice(k, close));
        out += ceHoldPlaceholder(parts.length - 1);
        i = close;
        continue;
      }
    }
    out += s.slice(k, k + 3);
    i = k + 3;
  }
  return { t: out, parts };
}

function restoreMhchemSegments(s: string, parts: string[]): string {
  let t = s;
  for (let idx = 0; idx < parts.length; idx++) {
    t = t.split(ceHoldPlaceholder(idx)).join(parts[idx]);
  }
  return t;
}

/** Index after the `}` that matches `openIdx` (`openIdx` must point at `{`). */
function endOfBalancedGroup(str: string, openIdx: number): number | null {
  if (openIdx < 0 || openIdx >= str.length || str[openIdx] !== '{') return null;
  let depth = 1;
  let k = openIdx + 1;
  while (k < str.length && depth > 0) {
    const c = str[k];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    k++;
  }
  return depth === 0 ? k : null;
}

/** KaTeX renders \\sqrt as literal text inside \\text{…} / \\mathrm{…}. Unwrap when the body is only one math command. */
const TEXT_WRAPPER_PREFIXES = ['\\text{', '\\mathrm{', '\\textbf{', '\\textit{'] as const;
const UNWRAP_INNER_MATH_PREFIXES = ['\\sqrt', '\\dfrac', '\\frac', '\\sum', '\\int', '\\prod'] as const;

/** `\text{\le}` etc. — math operators wrongly wrapped in text mode (saved tests / bad generation). */
function unwrapTextWrappedSymbolCommands(str: string): string {
  let s = str;
  const pairs: [RegExp, string][] = [
    [/\\text\{\\le\}/g, '\\le'],
    [/\\text\{\\ge\}/g, '\\ge'],
    [/\\text\{\\ne\}/g, '\\ne'],
    [/\\text\{\\leq\}/g, '\\leq'],
    [/\\text\{\\geq\}/g, '\\geq'],
    [/\\text\{\\times\}/g, '\\times'],
    [/\\text\{\\cdot\}/g, '\\cdot'],
    [/\\text\{\\pm\}/g, '\\pm'],
    [/\\text\{\\mp\}/g, '\\mp'],
    [/\\text\{\\approx\}/g, '\\approx'],
    [/\\text\{\\equiv\}/g, '\\equiv'],
    [/\\text\{\\mu\}/g, '\\mu'],
    [/\\text\{\\pi\}/g, '\\pi'],
    [/\\mathrm\{\\le\}/g, '\\le'],
    [/\\mathrm\{\\ge\}/g, '\\ge'],
    [/\\mathrm\{\\mu\}/g, '\\mu'],
    [/\\mathrm\{\\pi\}/g, '\\pi'],
  ];
  for (const [re, rep] of pairs) {
    s = s.replace(re, rep);
  }
  return s;
}

function unwrapTextWrappedMathCommands(str: string): string {
  let result = str;
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (const prefix of TEXT_WRAPPER_PREFIXES) {
      let i = 0;
      while (i < result.length) {
        const j = result.indexOf(prefix, i);
        if (j === -1) break;
        const openIdx = j + prefix.length - 1;
        if (openIdx >= result.length || result[openIdx] !== '{') {
          i = j + 1;
          continue;
        }
        const closeK = endOfBalancedGroup(result, openIdx);
        if (closeK === null) {
          i = j + 1;
          continue;
        }
        const inner = result.slice(openIdx + 1, closeK - 1);
        const lead = inner.match(/^\s*/)?.[0].length ?? 0;
        const innerAfterLead = inner.slice(lead);
        const disp = innerAfterLead.match(/^\\displaystyle\s*/i);
        const displaySkip = disp ? disp[0].length : 0;
        const rest = innerAfterLead.slice(displaySkip);
        if (!rest) {
          i = closeK;
          continue;
        }
        const contentStart = openIdx + 1 + lead + displaySkip;

        for (const mc of UNWRAP_INNER_MATH_PREFIXES) {
          if (!rest.startsWith(mc)) continue;
          let p = contentStart + mc.length;
          while (p < result.length && /\s/.test(result[p])) p++;
          if (p >= result.length || result[p] !== '{') continue;
          const endCmd = endOfBalancedGroup(result, p);
          if (endCmd === null || endCmd > closeK) continue;
          let spanEnd = endCmd;
          if (mc === '\\dfrac' || mc === '\\frac') {
            let p2 = spanEnd;
            while (p2 < result.length && /\s/.test(result[p2])) p2++;
            if (p2 < closeK && result[p2] === '{') {
              const end2 = endOfBalancedGroup(result, p2);
              if (end2 !== null && end2 <= closeK) spanEnd = end2;
            }
          }
          if (mc === '\\sqrt') {
            const tailRaw = result.slice(endCmd, closeK - 1);
            const tailTrim = tailRaw.trim();
            const okTail =
              tailTrim === '' ||
              (/^[\s_a-zA-Z0-9^+\-\\.]+$/.test(tailTrim) && !/[{}]/.test(tailTrim));
            if (!okTail) continue;
            const extracted = result.slice(contentStart, closeK - 1).replace(/\s+$/u, '');
            result = result.slice(0, j) + extracted + result.slice(closeK);
            changed = true;
            break outer;
          }
          const tail = result.slice(spanEnd, closeK - 1).trim();
          if (tail !== '') continue;
          const extracted = result.slice(contentStart, spanEnd);
          result = result.slice(0, j) + extracted + result.slice(closeK);
          changed = true;
          break outer;
        }
        i = closeK;
      }
    }
  }
  return result;
}

/**
 * Robust LaTeX and Math Parser for Academic Content.
 * Handles standard delimiters ($, $$, \[, \() and "Lazy LaTeX" 
 * where common commands like \sqrt, \frac, and exponents are not wrapped.
 */
export const parsePseudoLatexAndMath = (text: string): string => {
  if (!text) return text;

  let processedText = text;

  // Strip legacy leaked placeholders from older renderer bugs (no HTML to restore).
  processedText = processedText.replace(/__MATH_BLOCK_\d+__/g, '');

  processedText = normalizeTriangleriangleTypo(processedText);
  // Model typo: "triangleriangle" (ΔH_mix / ΔV_mix) — map to Δ. No \b: stems use \triangleriangleH_{mix}.
  processedText = processedText.replace(/\\triangleriangle/gi, '\\Delta');
  // Duplicate token / bad export: "\triangletriangle" (meant Δ, e.g. ΔK) — not valid KaTeX.
  processedText = processedText.replace(/\\triangletriangle(?=[A-Za-z])/gi, '\\Delta ');
  processedText = processedText.replace(/\\triangletriangle/gi, '\\Delta');

  // `\int` (and similar) inside `\text{\displaystyle ...}` renders as raw text in KaTeX.
  processedText = processedText.replace(/\\text\{\s*\\displaystyle\s*\\int\s*\}/gi, '\\int');
  processedText = processedText.replace(/\\mathrm\{\s*\\displaystyle\s*\\int\s*\}/gi, '\\int');

  // LLM / DB line wraps mid-fraction: \dfrac{F}\n{m_1+...}  →  \dfrac{F}{m_1+...
  processedText = processedText.replace(/\\(?:dfrac|frac)\{([^{}]+)\}\s*\r?\n\s*\{/g, '\\dfrac{$1}{');

  // Model placeholder glyphs (empty numeric slots) — avoid KaTeX / font tofu in explanations.
  processedText = processedText
    .replace(/\u25A1/g, '?')
    .replace(/\uFFFD/g, '?')
    .replace(/\u25AF/g, '?');

  // JSON double-escape artifact: \_ \{name\} → _{name} (closing may be \} or }).
  processedText = processedText.replace(/\\_\{([^}\\]{1,64})\\}/g, '_{$1}');
  processedText = processedText.replace(/\\_\{([^}\\]{1,64})\}/g, '_{$1}');

  // Greek glued to unit letters (\pi\b fails on \pim). Keep list short to limit false positives.
  processedText = processedText.replace(/\\picm\b/gi, '\\pi\\,\\mathrm{cm}');
  processedText = processedText.replace(/\\pim\b/gi, '\\pi\\,\\mathrm{m}');
  processedText = processedText.replace(/\\pis\b/gi, '\\pi\\,\\mathrm{s}');
  processedText = processedText.replace(/\\muM\b/g, '\\mu\\,\\mathrm{M}');
  processedText = processedText.replace(/\\mum\b/gi, '\\mu\\,\\mathrm{m}');

  // Normalize over-escaped LaTeX commands from imported/generated text.
  // Example: "\\text{\\dfrac{m}{s}}" -> "\text{\dfrac{m}{s}}"
  processedText = processedText.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
  // Re-apply after unescape in case JSON had "\\triangleriangle…".
  processedText = processedText.replace(/\\triangleriangle/gi, '\\Delta');
  processedText = normalizeTriangleriangleTypo(processedText);

  // \text{\le}, \text{\mu}, … then \text{\sqrt{…}} with optional _s g R tail — unwrap for KaTeX.
  processedText = unwrapTextWrappedSymbolCommands(processedText);
  processedText = unwrapTextWrappedMathCommands(processedText);
  processedText = unwrapTextWrappedSymbolCommands(processedText);

  // JSON.parse treats `\t` as a tab. That mangles LaTeX that starts with `t` after a backslash:
  // "\triangle" → TAB + "riangle", "\times" → TAB + "imes", "\text{" → TAB + "ext{", etc.
  // Restore before KaTeX / regex math pass (order: more specific patterns first).
  processedText = processedText.replace(/\t(?=riangleq\b)/gi, '\\triangleq');
  processedText = processedText.replace(/\t(?=riangle\$[HVSGUhvsgu])/gi, '\\Delta');
  processedText = processedText.replace(/\t(?=riangle\b)/gi, '\\triangle');
  processedText = processedText.replace(/\t(?=imes\b)/g, '\\times');
  processedText = processedText.replace(/\t(?=heta\b)/gi, '\\theta');
  processedText = processedText.replace(/\t(?=herefore\b)/g, '\\therefore');
  processedText = processedText.replace(/\t(?=ext\{)/g, '\\text');

  // JSON.parse: `\r` is carriage return — `\rightarrow`, `\right`, `\rightharpoonup`, etc. lose the backslash-r.
  processedText = processedText.replace(/\r(?=ight)/gi, '\\r');

  // JSON.parse: `\t` is tab — bare `\to` (short arrow) becomes TAB + "o".
  processedText = processedText.replace(/\t(?=o\b)/g, '\\to');

  // Model often emits literal backslash-n as two characters for line breaks; real `\n` is rare in LaTeX prose.
  processedText = processedText.replace(/\\n\\n/g, '\n\n');
  processedText = processedText.replace(
    /\\n(?=Step\s*\d|:?\s*Distractor|The\s+correct|Answer\s*:|Explanation\s*:|\d+\.\s|[-•#]\s|\*\*Statement|Statement\s+(?:[IVXLCM]+|\d+)\b|\*\*Assertion|Assertion\b|\*\*Reason|\*\*Reasoning|\s*Column\s+[AB]\b|\s*List\s+(?:[IV]|[12])\b)/gi,
    '\n'
  );

  // 1. PROTECTION PHASE: Handle common \ce arrows and AI artifacts manually
  
  // Replace \ce{->} and variations with standard LaTeX Math arrows
  processedText = processedText.replace(/\\ce\s*\{\s*->\s*\}/gi, ' $\\rightarrow$ ');
  processedText = processedText.replace(/\\ce\s*\{\s*<-\s*\}/gi, ' $\\leftarrow$ ');
  processedText = processedText.replace(/\\ce\s*\{\s*<->\s*\}/gi, ' $\\leftrightarrow$ ');
  processedText = processedText.replace(/\\ce\s*\{\s*<=>\s*\}/gi, ' $\\rightleftharpoons$ ');
  processedText = processedText.replace(/\\ce\s*\{\s*=>\s*\}/gi, ' $\\Rightarrow$ ');
  
  // Handle "Lazy" \ce usage (e.g., \ce -> without braces)
  processedText = processedText.replace(/\\ce\s*->/gi, ' $\\rightarrow$ ');

  // Shield mhchem bodies from global \dfrac, \displaystyle\int, and slash→\dfrac rules below.
  const mhchemShield = protectMhchemSegments(processedText);
  processedText = mhchemShield.t;
  const mhchemParts = mhchemShield.parts;

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

  processedText = restoreMhchemSegments(processedText, mhchemParts);

  // Empty \text{} breaks KaTeX; do NOT substitute \alpha globally (reaction schemes use empty \text{} as spacers → spurious α).
  // Thin space in text mode keeps layout stable; real α must be written as \alpha in source.
  processedText = processedText.replace(/\\text\{\s*\}/g, '\\text{\\,}');
  
  // 2. COMPREHENSIVE REGEX for KaTeX detection.
  // Separated into:
  // - Environments ($$, \[)
  // - Functions with arguments (\sqrt{...}, \dfrac{...}) - UPDATED FOR DEEP NESTING
  // - Standalone symbols (\pi, \omega)
  // - Lazy Scripts (x^2)

  // List of functions that typically require arguments {}
  const funcs = 'sqrt|frac|dfrac|mathrm|mathbf|text|textbf|textit|underline|sum|int|lim|vec|hat|bar|over|binom';
  
  // List of standalone symbols (Greek, operators) that don't necessarily need arguments
  const symbols =
    'alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|omicron|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|' +
    'arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|sec|csc|' +
    'log|ln|lg|exp|lim|' +
    'infty|pm|mp|approx|neq|leq|geq|le|ge|times|div|cdot|partial|nabla|forall|exists|empty|emptyset|to|rightarrow|leftarrow|leftrightarrow|implies|iff|angle|circ|degree|cdots|ldots|vdots|ddots';

  // Balanced `{…}` for regex fallback (dfrac is handled separately with real brace counting).
  let balancedBraces = '[^{}]*';
  for (let d = 0; d < 12; d++) {
    balancedBraces = `(?:[^{}]|{${balancedBraces}})*`;
  }

  const renderedBlocks: string[] = [];
  // Note: do not pre-render \\dfrac into sentinels here — that breaks $...$ blocks (e.g.
  // $\\sqrt{\\dfrac{a}{b}}$) by injecting BMP sentinels into math KaTeX must parse.

  // `$...$` split across one line break never matches `\$[^$\n]+?\$`; join into a single pair.
  {
    let mergeGuard = 0;
    let prevMerge = '';
    while (prevMerge !== processedText && mergeGuard < 48) {
      prevMerge = processedText;
      processedText = processedText.replace(
        /\$([^$\n]+)\r?\n[ \t]*([^$\n]*)\$/g,
        '$$$1 $2$$'
      );
      mergeGuard++;
    }
  }

  processedText = normalizeTriangleriangleTypo(processedText);
  processedText = processedText.replace(/\\triangleriangle/gi, '\\Delta');

  const mathChemRegex = new RegExp(
    // 1. Explicit Math Environments (\ce uses full balanced braces — nested ^{2+} etc.)
    '(\\\\\\\[[\\s\\S]*?\\\\\\]|\\\\\\(.*?\\\\\\)|\\\\ce\\{' + balancedBraces + '\\}|\\$\\$[\\s\\S]*?\\$\\$|\\$[^$\\n]+?\\$|' +
    // 2. Functions with braces (Depth 2 support)
    // Matches \cmd{arg1}{arg2} or \cmd{arg1}
    '\\\\(?:' + funcs + ')\\s*\\{' + balancedBraces + '\\}(?:\\s*\\{' + balancedBraces + '\\})?|' +
    // 3. Standalone symbols + optional subscript/superscript (\\omega_0 — \b after \\omega alone fails)
    '\\\\(?:' + symbols + ')(?:_[a-zA-Z0-9]+|_\\{[^{}]+\\}|\\^[a-zA-Z0-9]+|\\^\\{[^{}]+\\})?\\b|' +
    // 4. Lazy Sub/Superscripts (trailing check)
    // Allows optional space around operator: x ^ 2
    '(?<=[\\s\\w)\\]}.,:;+\\-*/=<>|]|^)[a-zA-Z0-9]*\\s*[\\^_]\\s*\\{?[a-zA-Z0-9+\\-]+\\}?(?=[\\s\\w)\\]}.,:;+\\-*/=<>|]|$))',
    'gs'
  );

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

    mathContent = normalizeTriangleriangleTypo(mathContent);
    mathContent = mathContent.replace(/\\triangleriangle/gi, '\\Delta');

    try {
      const renderedHtml = katex.renderToString(mathContent.trim(), {
        throwOnError: false, 
        errorColor: '#000000', // FORCE BLACK for errors (no red font in paper)
        displayMode: isDisplayMode,
        trust: true,
        strict: false,
        // Do not override \\ce — breaks mhchem contrib. \\frac→\\dfrac for normal math only.
        macros: { ...KATEX_PAPER_MACROS },
      });
      renderedBlocks.push(renderedHtml);
      return ktxPlaceholder(renderedBlocks.length - 1);
    } catch (e) {
      console.error('KaTeX rendering error:', e);
      // Fallback: If it failed, strip the latex command and show text
      return match.replace(/^\\[a-zA-Z]+{/, '').replace(/}$/, '');
    }
  });

  // Bare operators outside $...$ (e.g. "2.99 \times 10^{-23}" with broken delimiters).
  const orphanOps =
    'approx|times|cdot|pm|mp|equiv|ne|leq|geq|le|ge|div|cdots|ldots|partial|nabla|infty';
  processedText = processedText.replace(new RegExp(`\\\\(${orphanOps})\\b`, 'g'), (match) => {
    try {
      const renderedHtml = katex.renderToString(
        normalizeTriangleriangleTypo(match).replace(/\\triangleriangle/gi, '\\Delta'),
        {
        throwOnError: false,
        errorColor: '#000000',
        displayMode: false,
        trust: true,
        strict: false,
        macros: { ...KATEX_PAPER_MACROS },
      }
      );
      renderedBlocks.push(renderedHtml);
      return ktxPlaceholder(renderedBlocks.length - 1);
    } catch {
      return match;
    }
  });

  // 3. FALLBACK formatting for remaining text symbols (Outside of LaTeX blocks)
  processedText = processedText.replace(/->/g, ' → ');
  processedText = processedText.replace(/=>/g, ' ⇒ ');
  processedText = processedText.replace(/<->/g, ' ↔ ');
  processedText = processedText.replace(/<=>/g, ' ⇔ ');

  // Safe HTML Conversion for text (KTX sentinels contain no & < > and survive this pass)
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

  // 4. Inject KaTeX HTML (sentinel → span; must run after escaping so markup is not mangled)
  const ktxSlotRe = new RegExp(`${KTX_START}([\\uE000-\\uF8FF])${KTX_END}`, 'g');
  processedText = processedText.replace(ktxSlotRe, (_, ch: string) => {
    const idx = ch.charCodeAt(0) - KTX_CODE0;
    const html = renderedBlocks[idx];
    return html ?? '';
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
