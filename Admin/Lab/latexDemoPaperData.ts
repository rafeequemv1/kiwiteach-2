import type { Question } from '../../Quiz/types';

/**
 * Static fixtures for LaTeX lab “paper demo” — every question type + heavy math/chem coverage.
 * Rendered with PaperRich → parsePseudoLatexAndMath (same as test paper / print preview).
 */
export const LATEX_LAB_DEMO_PAPER_QUESTIONS: Question[] = [
  {
    id: 'lab-paper-01',
    type: 'mcq',
    difficulty: 'Easy',
    topic_tag: 'Lab · demo',
    text: 'Basics: energy $E = mc^2$, fine-structure $\\alpha \\approx 7.3\\times 10^{-3}$, and angle $90^\\circ$.',
    options: [
      'Only $E=mc^2$ is dimensionally consistent',
      '$\\alpha$ is dimensionless; $E=mc^2$ and $90^\\circ$ are fine',
      '$90^\\circ$ must be written without degree symbol',
      '$\\alpha$ cannot appear beside $E$',
    ],
    correctIndex: 1,
    explanation: 'Degrees use ^\\circ; $\\alpha$ is a pure number.',
  },
  {
    id: 'lab-paper-02',
    type: 'mcq',
    difficulty: 'Medium',
    topic_tag: 'Lab · demo',
    text: 'Roots and powers: simplify $\\sqrt{x^2+y^2}$ when $x=3$, $y=4$; compare $\\sqrt[3]{27}$ and $2^3$.',
    options: ['$5$ and $3 < 8$', '$7$ and $9 = 8$', '$5$ and $3 = 8$', '$25$ and $3$'],
    correctIndex: 0,
    explanation: '$\\sqrt{9+16}=5$; $\\sqrt[3]{27}=3$, $2^3=8$.',
  },
  {
    id: 'lab-paper-03',
    type: 'mcq',
    difficulty: 'Medium',
    topic_tag: 'Lab · demo',
    text: 'Fractions: $\\dfrac{d}{dx}\\bigl(x^3\\bigr)$ and nested $\\dfrac{1}{1+\\dfrac{1}{x}}$. Lazy style $(a+b)/(c+d)$ when $a=b=c=d=1$.',
    options: [
      '$3x^2$ and $\\dfrac{x}{x+1}$; lazy gives $1$',
      '$x^2$ and $1$; lazy gives $2$',
      '$3x^3$ and $x+1$',
      '$0$ and undefined',
    ],
    correctIndex: 0,
    explanation: 'Derivative $3x^2$; nested fraction simplifies to $\\frac{x}{x+1}$; $(1+1)/(1+1)=1$.',
  },
  {
    id: 'lab-paper-04',
    type: 'mcq',
    difficulty: 'Easy',
    topic_tag: 'Lab · demo',
    text: 'Temperature: convert $T = 300\\,\\mathrm{K}$ to Celsius using $T_\\mathrm{C} = T - 273.15$. Boiling point of water at 1 atm is $100^\\circ\\mathrm{C}$.',
    options: [
      '$26.85^\\circ\\mathrm{C}$',
      '$573.15^\\circ\\mathrm{C}$',
      '$-26.85^\\circ\\mathrm{C}$',
      '$300^\\circ\\mathrm{C}$',
    ],
    correctIndex: 0,
    explanation: '$300 - 273.15 \\approx 26.85^\\circ\\mathrm{C}$.',
  },
  {
    id: 'lab-paper-05',
    type: 'mcq',
    difficulty: 'Hard',
    topic_tag: 'Lab · demo',
    text: 'Display integral: $$\\int_0^\\infty e^{-x^2}\\,dx = \\dfrac{\\sqrt{\\pi}}{2}$$ and sum $\\sum_{n=1}^N n^2 = \\dfrac{N(N+1)(2N+1)}{6}$.',
    options: [
      'Both identities are standard reference forms',
      'The integral equals $\\pi$',
      'The sum equals $N^3$',
      'Neither is valid for $N>1$',
    ],
    correctIndex: 0,
    explanation: 'Gaussian integral and square-pyramidal number formula.',
  },
  {
    id: 'lab-paper-06',
    type: 'mcq',
    difficulty: 'Medium',
    topic_tag: 'Lab · demo',
    text: 'Chemistry (mhchem): balance $\\ce{2H2 + O2 -> 2H2O}$, ions $\\ce{SO4^2-}$, complex $\\ce{[Cu(NH3)4]^2+}$, states $\\ce{NaCl(aq)}$, reaction $\\ce{AgNO3(aq) + NaCl(aq) -> AgCl v + NaNO3(aq)}$.',
    options: [
      'All \\ce{…} fragments are valid mhchem patterns',
      '$\\ce{SO4^2-}$ is invalid in KaTeX',
      'Precipitate symbol \\ce{v} is unsupported',
      '$\\ce{[Cu(NH3)4]^2+}$ breaks the parser',
    ],
    correctIndex: 0,
    explanation: 'Same mhchem path as the question bank.',
  },
  {
    id: 'lab-paper-07',
    type: 'mcq',
    difficulty: 'Medium',
    topic_tag: 'Lab · demo',
    text: 'Mixed math + chem: $\\mathrm{pH} = -\\log[\\ce{H+}]$, $K_a = \\dfrac{[\\ce{H+}][\\ce{A-}]}{[\\ce{HA}]}$, and $\\Delta H^\\circ$ for $\\ce{CH4(g) + 2O2(g) -> CO2(g) + 2H2O(l)}$.',
    options: [
      'KaTeX renders \\mathrm, fractions, and \\ce together',
      '\\ce cannot appear inside a fraction',
      '$\\Delta H^\\circ$ must be plain text',
      '$\\log$ is not supported',
    ],
    correctIndex: 0,
    explanation: 'Thermochemistry + acid–base notation regression.',
  },
  {
    id: 'lab-paper-08',
    type: 'reasoning',
    difficulty: 'Medium',
    topic_tag: 'Lab · demo',
    text: 'Assertion (A): $\\displaystyle \\lim_{x\\to 0}\\dfrac{\\sin x}{x} = 1$. Reason (R): $\\sin x \\approx x$ for small $x$ in radians.',
    options: [
      'Both A and R true; R explains A',
      'Both true; R does not explain A',
      'A true, R false',
      'A false, R true',
    ],
    correctIndex: 0,
    explanation: 'Standard limit; small-angle approximation motivates the proof.',
  },
  {
    id: 'lab-paper-09',
    type: 'statements',
    difficulty: 'Hard',
    topic_tag: 'Lab · demo',
    text: 'Consider statements: S1: $\\forall x\\in\\mathbb{R},\\; x^2 \\geq 0$. S2: $\\exists x\\in\\mathbb{R}$ such that $x^2 + 1 = 0$. Choose the correct option.',
    options: [
      'S1 true, S2 false',
      'S1 false, S2 true',
      'Both true',
      'Both false',
    ],
    correctIndex: 0,
    explanation: 'Squares are non-negative; no real root of $x^2+1$.',
  },
  {
    id: 'lab-paper-10',
    type: 'matching',
    difficulty: 'Medium',
    topic_tag: 'Lab · demo',
    text: 'Match physical quantities in Column A with SI units in Column B.',
    columnA: [
      'Force',
      'Energy',
      'Power',
      'Pressure',
    ],
    columnB: [
      '$\\mathrm{N}$',
      '$\\mathrm{J}$',
      '$\\mathrm{W}$',
      '$\\mathrm{Pa}$',
    ],
    options: [
      '(1) P-i, Q-ii, R-iii, S-iv',
      '(2) P-ii, Q-i, R-iv, S-iii',
      '(3) P-iv, Q-iii, R-ii, S-i',
      '(4) P-iii, Q-iv, R-i, S-ii',
    ],
    correctIndex: 0,
    explanation: 'Force–N, energy–J, power–W, pressure–Pa.',
  },
  {
    id: 'lab-paper-11',
    type: 'mcq',
    difficulty: 'Medium',
    topic_tag: 'Lab · demo',
    text: `Match the items in Column A with their corresponding units in Column B:

Column A:
(P) Zero order rate constant
(Q) First order rate constant
(R) Second order rate constant
(S) Third order rate constant

Column B:
(i) $\\mathrm{s}^{-1}$
(ii) $\\mathrm{mol\\,L^{-1}\\,s^{-1}}$
(iii) $\\mathrm{L^{2}\\,mol^{-2}\\,s^{-1}}$
(iv) $\\mathrm{L\\,mol^{-1}\\,s^{-1}}$

(Stem-only columns — type is mcq; paper code should still build the table.)`,
    options: [
      '(1) P-ii, Q-i, R-iv, S-iii',
      '(2) P-i, Q-ii, R-iii, S-iv',
      '(3) P-ii, Q-iv, R-i, S-iii',
      '(4) P-iv, Q-iii, R-ii, S-i',
    ],
    correctIndex: 0,
    explanation: 'Regression for resolveMatchingPaperColumns + table layout.',
  },
  {
    id: 'lab-paper-12',
    type: 'mcq',
    difficulty: 'Easy',
    topic_tag: 'Lab · demo',
    text: 'Matrices: $\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}$ and determinant $\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}$.',
    options: [
      'Identity has determinant $1$; $2\\times2$ determinant is $ad-bc$',
      'Determinant is always $a+b+c+d$',
      'pmatrix cannot nest',
      'Only square brackets work in KaTeX',
    ],
    correctIndex: 0,
    explanation: 'Basic linear algebra display.',
  },
  {
    id: 'lab-paper-12b',
    type: 'mcq',
    difficulty: 'Easy',
    topic_tag: 'Lab · demo',
    text: `Match Column I with Column II (Roman headers — stem parse).

Column I:
(P) $\\displaystyle \\int_0^1 x\\,dx$
(Q) $\\dfrac{d}{dx}(x^2)$

Column II:
(i) $2x$
(ii) $\\dfrac{1}{2}$`,
    options: ['(1) P-ii, Q-i', '(2) P-i, Q-ii', '(3) Both P-ii', '(4) Both Q-i'],
    correctIndex: 0,
    explanation: '$\\int_0^1 x\\,dx=\\frac12$; $\\frac{d}{dx}x^2=2x$. Column I/II header demo.',
  },
  {
    id: 'lab-paper-13',
    type: 'mcq',
    difficulty: 'Hard',
    topic_tag: 'Lab · demo',
    text: 'Parser repairs: typo $\\triangleriangle U$ (internal energy), and nested $\\text{\\dfrac{m}{s}}$ for units.',
    options: [
      'Typo maps to $\\Delta$; text+dfrac path is exercised',
      'Both should render as raw LaTeX errors',
      'Only the delta-typo is repaired; nested text+dfrac is ignored',
      'KaTeX does not unwrap a text wrapper around a dfrac macro',
    ],
    correctIndex: 0,
    explanation: 'Regression strings from latexRenderGalleryData.',
  },
];
