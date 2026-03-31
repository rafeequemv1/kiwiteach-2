/**
 * DOCX → plain text while preserving Mammoth IMAGE_N placeholders (innerText drops <img> nodes).
 */

export type DocxEmbeddedImage = { data: string; mimeType: string };

/**
 * Remove IMAGE_N tokens only. Does not normalize spaces or newlines — keeps stem/option text verbatim
 * except for stripping figure placeholders the model must not echo.
 */
export function stripDocxImageTokens(text: string): string {
  return String(text ?? '').replace(/\bIMAGE_\d+\b/gi, '');
}

export function htmlBodyToPlainTextWithImagePlaceholders(body: HTMLElement): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (tag === 'IMG') {
      const src = (el as HTMLImageElement).getAttribute('src')?.trim() || '';
      if (/^IMAGE_\d+$/i.test(src)) {
        parts.push(`\n${src}\n`);
      }
      return;
    }
    if (tag === 'BR') {
      parts.push('\n');
      return;
    }
    el.childNodes.forEach(walk);
  };
  walk(body);
  return parts
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type MammothFigureModule = {
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }, opts?: object) => Promise<{ value: string }>;
  images: {
    imgElement: (fn: (image: unknown) => Promise<{ src: string }>) => unknown;
  };
};

export async function parseDocxBufferWithEmbeddedImages(
  arrayBuffer: ArrayBuffer,
  mammoth: MammothFigureModule
): Promise<{ text: string; images: DocxEmbeddedImage[] }> {
  const images: DocxEmbeddedImage[] = [];
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement((image: any) =>
        image.read('base64').then((b64: string) => {
          const mimeType = image.contentType || 'image/png';
          images.push({ data: b64, mimeType });
          return { src: `IMAGE_${images.length - 1}` };
        })
      ),
    }
  );
  const parser = new DOMParser();
  const doc = parser.parseFromString(result.value || '', 'text/html');
  const body = doc.body;
  const txt = body ? htmlBodyToPlainTextWithImagePlaceholders(body) : '';
  return { text: txt, images };
}
