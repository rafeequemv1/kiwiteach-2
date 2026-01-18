
import React, { useEffect, useRef } from 'react';

interface SmilesRendererProps {
  smiles: string;
  width?: number;
  height?: number;
  theme?: 'light' | 'dark' | 'oldschool';
}

const SmilesRenderer: React.FC<SmilesRendererProps> = ({ 
  smiles, 
  width = 150, 
  height = 150, 
  theme = 'light' 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !smiles) return;

    // Check if SmiDrawer is available from index.html script
    const SmiDrawer = (window as any).SmiDrawer;
    if (!SmiDrawer) {
      console.warn('SmilesDrawer not loaded');
      return;
    }

    try {
      const options = {
        width,
        height,
        bondThickness: 1,
        bondLength: 15,
        fontSizeLarge: 10,
        fontSizeSmall: 8,
        padding: 5
      };
      
      const drawer = new SmiDrawer(options, {});
      drawer.draw(smiles, canvasRef.current, theme);
    } catch (err) {
      console.error('Error drawing SMILES:', err);
    }
  }, [smiles, width, height, theme]);

  if (!smiles) return null;

  return (
    <div className="inline-block bg-white rounded-lg p-1 border border-slate-100 shadow-sm overflow-hidden" style={{ width, height }}>
      <canvas ref={canvasRef} width={width} height={height} className="block mx-auto" />
    </div>
  );
};

/**
 * Utility to check if a string contains a SMILES tag and split it.
 * Format expected: "some text [SMILES:C1=CC=CC=C1] more text"
 */
export const renderWithSmiles = (text: string, size = 120): React.ReactNode[] => {
    if (!text) return [];
    
    const parts = text.split(/(\[SMILES:.*?\])/g);
    return parts.map((part, i) => {
        if (part.startsWith('[SMILES:') && part.endsWith(']')) {
            const smiles = part.slice(8, -1);
            return <SmilesRenderer key={i} smiles={smiles} width={size} height={size} />;
        }
        return <span key={i} dangerouslySetInnerHTML={{ __html: part }} />;
    });
};

export default SmilesRenderer;
