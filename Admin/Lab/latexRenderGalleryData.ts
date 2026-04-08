/**
 * Reference strings for Question DB · LaTeX lab "Render matrix".
 * Each `code` is fed through parsePseudoLatexAndMath (same as stems/options in the app).
 */

export type LatexGalleryItem = {
  /** Short note in the matrix (optional) */
  label?: string;
  /** Raw string as stored / typed in the bank */
  code: string;
};

export type LatexGallerySection = {
  title: string;
  description?: string;
  items: LatexGalleryItem[];
};

export const LATEX_RENDER_GALLERY: LatexGallerySection[] = [
  {
    title: 'Delimiters',
    description: 'Explicit math boundaries',
    items: [
      { label: 'inline', code: 'Energy $E = mc^2$ at rest.' },
      { label: 'double', code: '$$\\int_0^1 x^2\\,dx = \\dfrac{1}{3}$$' },
      { label: 'brackets', code: '\\[ \\sum_{i=1}^n i = \\dfrac{n(n+1)}{2} \\]' },
      { label: 'parens', code: '\\( \\alpha + \\beta = \\gamma \\)' },
    ],
  },
  {
    title: 'Greek letters',
    items: [
      { code: '$\\alpha, \\beta, \\gamma, \\delta, \\epsilon, \\theta, \\lambda, \\mu, \\pi, \\sigma, \\phi, \\omega$' },
      { code: '$\\Gamma, \\Delta, \\Theta, \\Lambda, \\Pi, \\Sigma, \\Phi, \\Omega$' },
      { code: 'Delta typo fix: $\\triangletriangle K$ should become $\\Delta K$.' },
    ],
  },
  {
    title: 'Operators and relations',
    items: [
      { code: '$a \\times b$, $a \\cdot b$, $a \\pm b$, $a \\mp b$' },
      { code: '$x \\approx y$, $x \\neq y$, $x \\leq y$, $x \\geq y$, $x \\equiv y$' },
      { code: '$\\infty$, $\\partial$, $\\nabla$, $\\forall$, $\\exists$' },
      { code: '$a \\to b$, $a \\rightarrow b$, $a \\leftarrow b$, $a \\leftrightarrow b$' },
      { code: '$A \\implies B$, $A \\iff B$' },
    ],
  },
  {
    title: 'Fractions and stacking',
    items: [
      { code: '$\\dfrac{a}{b}$ and $\\frac{x+1}{x-1}$' },
      { code: '$\\dfrac{\\dfrac{1}{2}}{3}$ nested' },
      { code: 'Paren fraction: $(x+1)/(x-1)$ lazy' },
      { code: '$\\dfrac{F}{m_1+m_2+m_3}$' },
    ],
  },
  {
    title: 'Roots and exponents',
    items: [
      { code: '$\\sqrt{x}$, $\\sqrt{x^2+y^2}$, $\\sqrt[3]{27}$' },
      { code: '$x^2$, $x^{10}$, $x_i$, $x_{ij}$, $x_i^2$' },
      { code: '$e^{-t/\\tau}$, $10^{23}$, $2\\times 10^{-3}$' },
    ],
  },
  {
    title: 'Sums, products, integrals',
    items: [
      { code: '$\\sum_{i=1}^n a_i$' },
      { code: '$\\prod_{k=1}^n k$' },
      { code: '$\\int_0^\\infty e^{-x}\\,dx$' },
      { code: '$\\int_a^b f(x)\\,dx = F(b)-F(a)$' },
      { label: 'text-wrapped int (parser unwrap)', code: '$\\text{\\displaystyle\\int}_0^1 x\\,dx$' },
    ],
  },
  {
    title: 'Limits and functions',
    items: [
      { code: '$\\lim_{x \\to 0} \\dfrac{\\sin x}{x} = 1$' },
      { code: '$\\sin\\theta$, $\\cos\\theta$, $\\tan\\theta$, $\\ln x$, $\\log x$' },
      { code: '$\\arcsin x$, $\\arctan x$' },
    ],
  },
  {
    title: 'Sets and logic',
    items: [
      { code: '$\\emptyset$, $x \\in A$, $A \\subset B$' },
      { code: '$\\cup$, $\\cap$, $\\setminus$' },
    ],
  },
  {
    title: 'Matrices (must be in math mode)',
    items: [
      { code: '$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$' },
      { code: '$\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}$' },
    ],
  },
  {
    title: 'Accents and vectors',
    items: [
      { code: '$\\hat{x}$, $\\bar{z}$, $\\vec{v}$, $\\overline{AB}$' },
    ],
  },
  {
    title: '\\mathrm, \\text, units',
    items: [
      { code: '$5\\,\\mathrm{m}$, $9.8\\,\\mathrm{m/s^2}$' },
      { code: '$T = 2\\pi\\sqrt{\\dfrac{L}{g}}$' },
      { code: '$\\text{Re}(z)$ mixed with $x^2$' },
    ],
  },
  {
    title: 'mhchem (if loaded)',
    items: [
      { code: '$\\ce{H2O}$' },
      { code: '$\\ce{2H2 + O2 -> 2H2O}$' },
      { code: '$\\ce{A <=> B}$' },
    ],
  },
  {
    title: 'Parser repairs (regression)',
    items: [
      { label: 'triangletriangle', code: 'Change in $K$: $\\triangletriangleK$.' },
      { label: 'mid-frac newline', code: '$\\dfrac{12}\n{1+2+3}$' },
      { label: 'inline $ split', code: '$T_1 = m_1 \\times a$\n$= 2\\,\\text{N}$' },
    ],
  },
  {
    title: 'SMILES hook (same as bank)',
    items: [
      {
        label: 'benzene',
        code: 'Benzene is planar: [SMILES:c1ccccc1] aromatic.',
      },
    ],
  },
];
