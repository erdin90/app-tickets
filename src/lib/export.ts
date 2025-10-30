// src/lib/export.ts
export function downloadCSV(rows: Record<string, any>[], filename = 'tickets.csv') {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (s: any) =>
    String(s ?? '')
      .replaceAll('"', '""')
      .replace(/\r?\n/g, ' ')
      .trim();

  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => `"${esc(r[h])}"`).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
