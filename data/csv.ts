// RFC4180-ish CSV reader. Small, dependency-free, and deliberately boring.
//
// Google Sheets' published-CSV export quotes any field containing a comma, quote or newline,
// and doubles embedded quotes. That is the whole grammar we need. We do NOT want a CSV
// library here: this file is ~40 lines, runs in the browser and in Apps Script, and a parser
// we own is a parser we can debug when a marbot pastes something strange into a cell.

/** Split CSV text into rows of raw string cells. Handles quotes, embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
  // Strip a UTF-8 BOM — Sheets exports one and it silently corrupts the first header name.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } // escaped quote
        else quoted = false;
      } else cell += c;
      continue;
    }

    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(cell); cell = ''; continue; }
    if (c === '\r') continue;                            // CRLF → LF
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }

  // Trailing cell/row (a file not ending in a newline).
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }

  // Drop wholly-blank rows — Sheets pads exports with them.
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/** Turn rows into objects keyed by the header row, trimmed and lower-cased for tolerance. */
export function toRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => { rec[h] = (r[i] ?? '').trim(); });
    return rec;
  });
}
