import katex from 'katex';
import 'katex/contrib/mhchem';

const samples = [
  String.raw`\ce{2H2 + O2 -> 2H2O}`,
  String.raw`\mathrm{pH} = -\log[\ce{H+}]`,
  String.raw`\ce{AgNO3(aq) + NaCl(aq) -> AgCl v + NaNO3(aq)}`,
  String.raw`\ce{N2 + 3H2 <=> 2NH3}`,
];

for (const x of samples) {
  const h = katex.renderToString(x, {
    throwOnError: false,
    trust: true,
    strict: false,
    macros: { '\\frac': '\\dfrac' },
  });
  const err = h.includes('katex-error');
  console.log('---', err ? 'ERR' : 'ok', x.slice(0, 50));
  console.log(h.slice(0, 200));
}
