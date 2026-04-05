/**
 * RFC-style CSV matrix parse: quoted fields may contain commas and newlines
 * (e.g. data:image/...;base64,... in one cell). Shared by PYQ-style bank imports.
 */
export function parseCsvMatrix(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQ = false;

  const pushField = () => {
    row.push(field.trim());
    field = '';
  };

  while (i < s.length) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (c === ',') {
      pushField();
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      pushField();
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  pushField();
  rows.push(row);

  return rows.filter((r) => {
    if (!r.some((cell) => String(cell).trim().length > 0)) return false;
    const first = String(r[0] ?? '').trim();
    if (first.startsWith('#')) return false;
    return true;
  });
}

export function normalizeCsvHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_');
}
