
import katex from 'katex';
import 'katex/dist/contrib/mhchem.js';

export const parsePseudoLatexAndMath = (text: string): string => {
  if (!text) return text;

  const renderedBlocks: string[] = [];
  let processedText = text;

  // Regex to find all math and chemistry blocks. 
  const mathChemRegex = /(\\\[.*?\\]|\\\(.*?\\\)|\\ce\{(?:[^{}]|{[^{}]*})*\}|\$\$.*?\$\$|\$.*?\$)/gs;

  processedText = processedText.replace(mathChemRegex, (match) => {
    let mathContent = match;
    const placeholder = `__MATH_BLOCK_${renderedBlocks.length}__`;

    const isDisplayMode = match.startsWith('$$') || match.startsWith('\\[');
    
    // Strip delimiters for KaTeX
    if (match.startsWith('$$') && match.endsWith('$$')) {
      mathContent = match.slice(2, -2);
    } else if (match.startsWith('$') && match.endsWith('$')) {
      mathContent = match.slice(1, -1);
    } else if (match.startsWith('\\[')) {
      mathContent = match.slice(2, -2);
    } else if (match.startsWith('\\(')) {
      mathContent = match.slice(2, -2);
    }

    try {
      const renderedHtml = katex.renderToString(mathContent, {
        throwOnError: false,
        displayMode: isDisplayMode,
      });
      renderedBlocks.push(renderedHtml);
      return placeholder;
    } catch (e) {
      console.error('KaTeX rendering error:', e);
      return `<span style="color: red;">${match}</span>`;
    }
  });

  // Stage 2: Safe HTML Conversion & Formatting
  processedText = processedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
    
  // Convert Markdown Bold/Italics (Fixes stars issue)
  processedText = processedText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  processedText = processedText.replace(/\*(.*?)\*/g, '<i>$1</i>');
    
  // Convert basic LaTeX commands
  processedText = processedText.replace(/\\section\{(.*?)\}/g, '<h2>$1</h2>');
  processedText = processedText.replace(/\\textbf\{(.*?)\}/g, '<b>$1</b>');
  processedText = processedText.replace(/\\textit\{(.*?)\}/g, '<i>$1</i>');
  processedText = processedText.replace(/\n/g, '<br />');

  // Stage 3: Re-injection
  processedText = processedText.replace(/__MATH_BLOCK_(\d+)__/g, (_, index) => {
    return renderedBlocks[parseInt(index, 10)];
  });

  return processedText;
};

export const stripLatexAndMarkup = (text: string): string => {
  if (!text) return text;

  let strippedText = text;

  // Remove all math and chemistry blocks entirely
  strippedText = strippedText.replace(/(\\[.*?\\]|\\\(.*?\\\)|\\ce\{(?:[^{}]|{[^{}]*})*\}|\$\$.*?\$\$|\$.*?\$)/gs, '');
  
  // Remove basic LaTeX commands, keeping content
  strippedText = strippedText.replace(/\\textbf\{(.*?)\}/g, '$1');
  strippedText = strippedText.replace(/\\textit\{(.*?)\}/g, '$1');
  strippedText = strippedText.replace(/\\section\{(.*?)\}/g, '$1');

  // Remove Markdown-style formatting, keeping content
  strippedText = strippedText.replace(/\*\*(.*?)\*\*/g, '$1');
  strippedText = strippedText.replace(/\*(.*?)\*/g, '$1');

  // Replace newlines with spaces for better flow in a single line
  strippedText = strippedText.replace(/\n/g, ' ');

  // Escape HTML characters to prevent any accidental rendering
  strippedText = strippedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  return strippedText;
};
