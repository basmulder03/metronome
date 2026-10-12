// Writes a one-page PDF with two systems of 5 staff lines and 4 barlines each (no music notation needed to test markup).
import { writeFileSync } from 'node:fs';

export function makePdf(path) {
  const ops = [];
  for (const top of [700, 500]) {
    for (let i = 0; i < 5; i++) ops.push(`50 ${top - i * 10} m 550 ${top - i * 10} l S`);
    for (const x of [50, 175, 300, 425, 550]) ops.push(`${x} ${top} m ${x} ${top - 40} l S`);
  }
  const stream = ops.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offs = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  writeFileSync(path, out);
}
if (process.argv[1]?.endsWith('make-pdf.mjs')) makePdf(process.argv[2] ?? 'e2e/score.pdf');
