/**
 * Reference strings for Question DB · LaTeX lab "Render matrix".
 * Rendered with PaperRich → parsePseudoLatexAndMath (same path as question paper preview).
 */

export type LatexGalleryItem = {
  label?: string;
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
    description: '$ $, $$ $$, \\[ \\], \\( \\)',
    items: [
      { label: 'inline', code: 'Energy $E = mc^2$ at rest.' },
      { label: 'display $$', code: '$$\\int_0^1 x^2\\,dx = \\dfrac{1}{3}$$' },
      { label: '\\[ … \\]', code: '\\[ \\sum_{i=1}^n i = \\dfrac{n(n+1)}{2} \\]' },
      { label: '\\( … \\)', code: '\\( \\alpha + \\beta = \\gamma \\)' },
    ],
  },
  {
    title: 'Greek (lower)',
    items: [
      {
        code: '$\\alpha, \\beta, \\gamma, \\delta, \\epsilon, \\varepsilon, \\zeta, \\eta, \\theta, \\vartheta, \\iota, \\kappa, \\lambda, \\mu, \\nu, \\xi, \\pi, \\varpi, \\rho, \\varrho, \\sigma, \\varsigma, \\tau, \\upsilon, \\phi, \\varphi, \\chi, \\psi, \\omega$',
      },
    ],
  },
  {
    title: 'Greek (upper)',
    items: [
      { code: '$\\Gamma, \\Delta, \\Theta, \\Lambda, \\Xi, \\Pi, \\Sigma, \\Upsilon, \\Phi, \\Psi, \\Omega$' },
    ],
  },
  {
    title: 'Operators and relations',
    items: [
      { code: '$a \\times b$, $a \\cdot b$, $a \\div b$, $a \\pm b$, $a \\mp b$' },
      { code: '$x \\approx y$, $x \\sim y$, $x \\simeq y$, $x \\propto y$' },
      { code: '$x = y$, $x \\neq y$, $x \\equiv y$, $x \\cong y$' },
      { code: '$x < y$, $x > y$, $x \\leq y$, $x \\geq y$, $x \\ll y$, $x \\gg y$' },
      { code: '$a \\parallel b$, $a \\perp b$, $a \\mid b$' },
      { code: '$\\infty$, $\\partial$, $\\nabla$, $\\forall$, $\\exists$, $\\nexists$' },
      { code: '$a \\to b$, $\\rightarrow$, $\\leftarrow$, $\\leftrightarrow$, $\\Rightarrow$, $\\Leftarrow$, $\\Leftrightarrow$' },
      { code: '$\\mapsto$, $\\longrightarrow$, $\\Longrightarrow$' },
      { code: '$A \\implies B$, $A \\iff B$' },
      { code: '$\\therefore$, $\\because$' },
    ],
  },
  {
    title: 'Sets and logic',
    items: [
      { code: '$\\emptyset$, $\\varnothing$, $x \\in A$, $x \\notin A$' },
      { code: '$A \\subset B$, $A \\subseteq B$, $A \\supset B$, $A \\cup B$, $A \\cap B$, $A \\setminus B$' },
      { code: '$\\neg p$, $p \\wedge q$, $p \\vee q$, $\\top$, $\\bot$' },
      { code: '$\\mathbb{N}, \\mathbb{Z}, \\mathbb{Q}, \\mathbb{R}, \\mathbb{C}$' },
    ],
  },
  {
    title: 'Fractions and stacking',
    items: [
      { code: '$\\dfrac{a}{b}$, $\\tfrac{a}{b}$, $\\frac{x+1}{x-1}$' },
      { code: '$\\dfrac{\\dfrac{1}{2}}{3}$ nested' },
      { label: 'lazy /', code: 'Paren fraction: $(x+1)/(x-1)$ and $ab/cd$ style $2/3$' },
      { code: '$\\dfrac{F}{m_1+m_2+m_3}$' },
      { code: '${n \\choose k}$, $\\binom{n}{k}$' },
    ],
  },
  {
    title: 'Roots and exponents',
    items: [
      { code: '$\\sqrt{x}$, $\\sqrt{x^2+y^2}$, $\\sqrt[n]{x}$, $\\sqrt[3]{27}$' },
      { code: '$x^2$, $x^{10}$, $x^{-1}$, $x_i$, $x_{ij}$, $x_i^2$, $x_{ij}^{2}$' },
      { code: '$e^{-t/\\tau}$, $10^{23}$, $2\\times 10^{-3}$' },
    ],
  },
  {
    title: 'Sums, products, integrals',
    items: [
      { code: '$\\sum_{i=1}^n a_i$, $\\sum\\limits_{i=1}^n a_i$' },
      { code: '$\\prod_{k=1}^n k$' },
      { code: '$\\int_0^\\infty e^{-x}\\,dx$, $\\int_a^b f(x)\\,dx$' },
      { code: '$\\oint_C \\vec{F}\\cdot d\\vec{r}$' },
      { code: '$\\iint_D f\\,dA$, $\\iiint_V f\\,dV$' },
      { label: 'parser: text+displaystyle+int', code: '$\\text{\\displaystyle\\int}_0^1 x\\,dx$' },
    ],
  },
  {
    title: 'Limits and calculus',
    items: [
      { code: '$\\lim_{x \\to 0} \\dfrac{\\sin x}{x} = 1$' },
      { code: '$\\lim\\limits_{n\\to\\infty} \\dfrac{1}{n} = 0$' },
      { code: '$\\limsup$, $\\liminf$' },
      { code: '$f^\\prime(x)$, $f^{\\prime\\prime}(x)$, $\\dfrac{dy}{dx}$, $\\dfrac{d^2y}{dx^2}$' },
    ],
  },
  {
    title: 'Trig, log, hyperbolic',
    items: [
      { code: '$\\sin\\theta$, $\\cos\\theta$, $\\tan\\theta$, $\\cot\\theta$, $\\sec\\theta$, $\\csc\\theta$' },
      { code: '$\\arcsin x$, $\\arccos x$, $\\arctan x$' },
      { code: '$\\sinh x$, $\\cosh x$, $\\tanh x$' },
      { code: '$\\ln x$, $\\log x$, $\\lg x$, $\\exp(x)$' },
    ],
  },
  {
    title: 'Named operators',
    items: [
      { code: '$\\det A$, $\\max f$, $\\min f$, $\\sup S$, $\\inf S$' },
      { code: '$\\arg z$, $\\deg p$, $\\gcd(m,n)$, $\\hom$, $\\ker$' },
    ],
  },
  {
    title: 'Matrices',
    items: [
      { code: '$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$' },
      { code: '$\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}$' },
      { code: '$\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}$' },
      { code: '$\\begin{Vmatrix} v \\end{Vmatrix}$, $\\begin{Bmatrix} x \\\\ y \\end{Bmatrix}$' },
      { code: '$\\begin{smallmatrix} a & b \\\\ c & d \\end{smallmatrix}$' },
    ],
  },
  {
    title: 'Cases and aligned',
    items: [
      {
        code: '$|x| = \\begin{cases} x & x\\geq 0 \\\\ -x & x<0 \\end{cases}$',
      },
      {
        label: 'aligned',
        code: '$\\begin{aligned} a &= b+c \\\\ &= d \\end{aligned}$',
      },
    ],
  },
  {
    title: 'Accents, vectors, over/under',
    items: [
      { code: '$\\hat{x}$, $\\widehat{abc}$, $\\bar{z}$, $\\overline{z}$, $\\vec{v}$, $\\overrightarrow{AB}$' },
      { code: '$\\dot{x}$, $\\ddot{x}$, $\\tilde{x}$, $\\widetilde{abc}$' },
      { code: '$\\mathring{a}$ (e.g. angstrom-style)' },
      { code: '$\\overset{?}{=}$, $\\underset{x\\to 0}{\\lim} f(x)$' },
      { code: '$\\stackrel{\\text{def}}{=}$' },
      { code: '$\\overbrace{1+2+3}^{6}$, $\\underbrace{a+b}_{\\text{sum}}$' },
    ],
  },
  {
    title: 'Spacing and punctuation',
    items: [
      { code: '$a\\,b\\;c\\quad d\\qquad e$' },
      { code: '$a\\!b$ (negative thin)' },
      { code: '$f\\colon X \\to Y$' },
    ],
  },
  {
    title: 'Delimiters (sized)',
    items: [
      { code: '$\\left( \\dfrac{1}{2} \\right)$, $\\left[ x \\right]$, $\\left\\{ x \\right\\}$' },
      { code: '$\\lfloor x \\rfloor$, $\\lceil x \\rceil$, $\\lvert z \\rvert$, $\\lVert v \\rVert$' },
      { code: '$\\langle u, v \\rangle$' },
    ],
  },
  {
    title: 'Ellipsis and dots',
    items: [
      { code: '$1,2,\\ldots,n$ and $1+2+\\cdots+n$' },
      { code: '$\\vdots$, $\\ddots$' },
    ],
  },
  {
    title: 'Geometry and angles',
    items: [
      { code: '$\\angle ABC$, $\\measuredangle$, $90^\\circ$, $45^\\prime$' },
      { code: '$\\triangle ABC$, $\\square$' },
    ],
  },
  {
    title: '\\mathrm, \\mathbf, \\mathcal, \\text',
    items: [
      { code: '$5\\,\\mathrm{m}$, $\\mathrm{kg\\cdot m/s^2}$' },
      { code: '$\\mathbf{v}$, $\\mathcal{L}$, $\\text{and } x^2$' },
      { code: '$T = 2\\pi\\sqrt{\\dfrac{L}{g}}$' },
      { code: '$\\text{Re}(z)$, $\\text{Im}(z)$' },
      { label: 'text with dfrac (unwrap)', code: '$\\text{\\dfrac{m}{s}}$' },
    ],
  },
  {
    title: 'Physics-style',
    items: [
      { code: '$\\hbar$, $\\ell$, $E = hf$, $\\lambda = h/p$' },
      { code: '$\\vec{F} = m\\vec{a}$, $\\vec{\\tau} = \\vec{r}\\times\\vec{F}$' },
      { code: '$\\mu_0$, $\\varepsilon_0$, $\\Omega$ (ohm)' },
    ],
  },
  {
    title: 'Chemistry · formulas & charges (mhchem \\ce)',
    description: 'KaTeX + mhchem; use $\\ce{...}$ inline. Same path as question bank.',
    items: [
      { label: 'water, ammonia', code: '$\\ce{H2O}$, $\\ce{NH3}$, $\\ce{CO2}$, $\\ce{CH4}$' },
      { label: 'ions', code: '$\\ce{Na+}$, $\\ce{Cl-}$, $\\ce{SO4^2-}$, $\\ce{PO4^3-}$, $\\ce{NH4+}$' },
      { label: 'transition metals', code: '$\\ce{Fe^{2+}}$, $\\ce{Fe^{3+}}$, $\\ce{Cu^{2+}}$, $\\ce{[Cu(NH3)4]^2+}$' },
      { label: 'hydrates', code: '$\\ce{CuSO4.5H2O}$, $\\ce{FeSO4.7H2O}$' },
      { label: 'isotope (mhchem)', code: '$\\ce{^{14}_{6}C}$, $\\ce{^{235}_{92}U}$' },
      { label: 'oxidation numbers', code: '$\\ce{KMnO4}$, $\\ce{K2Cr2O7}$, $\\ce{H2SO4}$' },
    ],
  },
  {
    title: 'Chemistry · physical states',
    items: [
      { code: '$\\ce{H2O(l)}$, $\\ce{H2O(s)}$, $\\ce{H2O(g)}$' },
      { code: '$\\ce{NaCl(aq)}$, $\\ce{Na+(aq) + Cl-(aq)}$' },
      { code: '$\\ce{CaCO3(s) -> CaO(s) + CO2(g)}$' },
    ],
  },
  {
    title: 'Chemistry · reaction arrows',
    items: [
      { label: 'yields', code: '$\\ce{2H2 + O2 -> 2H2O}$' },
      { label: 'reversible', code: '$\\ce{N2 + 3H2 <=> 2NH3}$' },
      { label: 'resonance / equilibrium variants', code: '$\\ce{A <=>> B}$, $\\ce{A <-> B}$' },
      { label: 'multiple steps', code: '$\\ce{A -> B -> C}$' },
    ],
  },
  {
    title: 'Chemistry · precipitation & gas',
    items: [
      { code: '$\\ce{AgNO3(aq) + NaCl(aq) -> AgCl v + NaNO3(aq)}$' },
      { code: '$\\ce{CaCO3(s) + 2HCl(aq) -> CaCl2(aq) + H2O(l) + CO2 ^}$' },
    ],
  },
  {
    title: 'Chemistry · redox & half-equations',
    items: [
      { code: '$\\ce{Zn -> Zn^{2+} + 2e-}$' },
      { code: '$\\ce{Cu^{2+} + 2e- -> Cu}$' },
      { code: '$\\ce{MnO4- + 8H+ + 5e- -> Mn^{2+} + 4H2O}$' },
      { code: '$\\ce{2H2O + 2e- -> H2 ^ + 2OH-}$' },
    ],
  },
  {
    title: 'Chemistry · electrolysis & ionic',
    items: [
      { code: '$\\ce{2NaCl(l) -> 2Na + Cl2 ^}$' },
      { code: '$\\ce{2H2O -> 2H2 ^ + O2 ^}$ (electrolysis, simplified)' },
      { code: '$\\ce{NaCl(s) -> Na+(aq) + Cl-(aq)}$' },
    ],
  },
  {
    title: 'Chemistry · organic (mhchem)',
    items: [
      { code: '$\\ce{CH3-CH2-OH}$, $\\ce{CH3COOH}$, $\\ce{CH2=CH2}$' },
      { code: '$\\ce{CH3-CH(CH3)-CH3}$' },
      { code: '$\\ce{C6H6}$ benzene formula' },
      { code: '$\\ce{CH3COO- + H2O <=> CH3COOH + OH-}$' },
    ],
  },
  {
    title: 'Chemistry · acid–base & pH (mixed math)',
    items: [
      { code: '$\\mathrm{pH} = -\\log[\\ce{H+}]$' },
      { code: '$K_a = \\dfrac{[\\ce{H+}][\\ce{A-}]}{[\\ce{HA}]}$' },
      { code: '$\\ce{H2O <=> H+ + OH-}$, $K_w = [\\ce{H+}][\\ce{OH-}]$' },
    ],
  },
  {
    title: 'Chemistry · thermochemistry',
    items: [
      { code: '$\\ce{CH4(g) + 2O2(g) -> CO2(g) + 2H2O(l)} \\quad \\Delta H < 0$' },
      { code: '$\\ce{N2(g) + 3H2(g) -> 2NH3(g)} \\quad \\Delta H^\\circ_{298}$' },
    ],
  },
  {
    title: 'Chemistry · stoichiometry & coefficients',
    items: [
      { code: '$\\ce{1/2 N2 + 3/2 H2 -> NH3}$' },
      { code: '$\\ce{2KClO3 -> 2KCl + 3O2 ^}$' },
      { code: '$\\ce{P4 + 5O2 -> P4O10}$' },
    ],
  },
  {
    title: 'Lazy / pseudo-LaTeX (parser)',
    items: [
      { label: 'sqrt()', code: 'Solve sqrt(x+1) = 2 for $x$.' },
      { label: 'paren frac', code: 'Ratio $(a+b)/(c+d)$ inline.' },
      { code: '$x^2$ with lazy exponent x ^ 2 in prose is not auto-fixed; use $x^2$.' },
    ],
  },
  {
    title: 'Parser repairs (regression)',
    items: [
      { label: 'triangletriangleK', code: 'Impulse: $\\triangletriangleK = \\frac{1}{2}I(v_1+v_2)$.' },
      { label: 'mid-frac newline', code: '$\\dfrac{12}\n{1+2+3}$' },
      { label: 'inline $ split', code: '$T_1 = m_1 \\times a$\n$= 2\\,\\text{N}$' },
      { label: 'triangleriangle typo', code: '$\\triangleriangle U$ internal energy change.' },
    ],
  },
  {
    title: 'SMILES (paper preview)',
    description:
      'Question paper uses parsePseudoLatexAndMath only — no SMILES canvas. Expect literal tag text; quiz UI uses SmiDrawer.',
    items: [
      {
        label: 'benzene',
        code: 'Planar ring: [SMILES:c1ccccc1] (paper shows raw tag).',
      },
    ],
  },
];
