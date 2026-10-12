import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Measure } from '../../shared/types';
import type { PageText, TextItem } from './readmarks';

/** A recognised word in pixels of the image it came from. */
export type Word = { text: string; x0: number; y0: number; x1: number; y1: number; confidence: number };

/**
 * Convert words from image pixels to PDF points, gluing only what belongs together in a tempo mark ("F" + "=" + "130" -> "F=130").
 * Other words stay separate: OCR boxes for one printed line are often at different heights, and the reader attaches a
 * neighbouring "molto"/"poco" itself. `origin` is the image's top-left in points, `scale` is pixels per point.
 */
export function wordsToItems(words: Word[], scale: number, origin: { x: number; y: number }): TextItem[] {
  // Tesseract often reports confidence 0 for a tempo mark it read correctly, so words that look like one are always kept
  // (and a note symbol with its equals sign comes out as junk like "(}=" at confidence 0, but the = is what joins it to the number)
  const meaningful = (t: string) => t.includes('=') || /\b(rit|rall|accel|allarg|string|tempo|calm|adagio|andant|allegr|moderato|vivace|presto|largo|lento|grave|maestoso)/i.test(t);
  const good = words.filter((w) => /[\p{L}\p{N}=]/u.test(w.text) && (w.confidence >= 35 || meaningful(w.text)));

  // Group into printed lines first (word boxes on one line differ in height and bottom edge, so ordering by bottom edge swaps
  // neighbours: "72)" before "=" ), then read each line left to right.
  const lines: Word[][] = [];
  for (const w of [...good].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1))) {
    const cy = (w.y0 + w.y1) / 2, h = w.y1 - w.y0;
    const line = lines.find((l) => {
      const lcy = l.reduce((s, x) => s + (x.y0 + x.y1) / 2, 0) / l.length;
      return Math.abs(cy - lcy) < Math.max(h, ...l.map((x) => x.y1 - x.y0)) * 0.6;
    });
    if (line) line.push(w); else lines.push([w]);
  }

  const out: TextItem[] = [];
  for (const line of lines) {
    let cur: { text: string; x0: number; x1: number; y1: number; h: number } | null = null;
    const flush = () => {
      if (!cur) return;
      out.push({ str: cur.text, x: origin.x + cur.x0 / scale, y: origin.y + cur.y1 / scale, w: (cur.x1 - cur.x0) / scale, size: (cur.h / scale) * 1.15 });
      cur = null;
    };
    for (const w of line.sort((a, b) => a.x0 - b.x0)) {
      const h = w.y1 - w.y0;
      const joins = cur && (w.text.startsWith('=') || cur.text.endsWith('=')) && w.x0 - cur.x1 < Math.max(h, cur.h) * 1.2;
      if (cur && joins) { cur.text += w.text; cur.x1 = w.x1; cur.h = Math.max(cur.h, h); }
      else { flush(); cur = { text: w.text, x0: w.x0, x1: w.x1, y1: w.y1, h }; }
    }
    flush();
  }
  return out;
}

type Band = { y0: number; y1: number }; // page fractions

/** Strips of page above each system, where tempo marks and rit./accel. words are printed (staff lines would only confuse the reader). */
export function bandsAbove(measures: Measure[], page: number): Band[] {
  const boxes = measures.filter((m) => m.page === page).map((m) => m.rect);
  const systems: { top: number; bottom: number }[] = [];
  for (const r of [...boxes].sort((a, b) => a.y - b.y)) {
    const s = systems.find((x) => Math.abs(x.top - r.y) < r.h / 2);
    if (s) s.bottom = Math.max(s.bottom, r.y + r.h); else systems.push({ top: r.y, bottom: r.y + r.h });
  }
  return systems.map((s, i) => {
    const h = s.bottom - s.top;
    const prev = i ? systems[i - 1].bottom : 0;
    return { y0: Math.max(prev + 0.003, s.top - h * 0.8), y1: s.top + h * 0.06 };
  });
}

/**
 * What to read above each system: the whole strip, and a second one without its lower part. High notes push their stems and beams up
 * into the strip, and where they touch a tempo mark they turn its digits into garbage; the upper part is clear of them more often.
 * Both are read and the reader keeps whatever makes sense.
 */
export function stripsFor(bands: Band[]): Band[] {
  return bands.flatMap((b) => [b, { y0: b.y0, y1: b.y0 + (b.y1 - b.y0) * 0.62 }]);
}

/** Where the OCR engine lives (see scripts/copy-assets.mjs). */
const BASE = '/ocr/';

/**
 * Read text above each system with OCR, for scanned PDFs that have no text layer.
 * Finds tempo marks and rit./accel. words; time signatures are music-font digits that OCR cannot read.
 * The engine (about 7 MB) is downloaded and cached the first time this runs.
 */
export async function ocrPages(
  doc: PDFDocumentProxy,
  measures: Measure[],
  onProgress: (done: number, total: number) => void,
): Promise<PageText[]> {
  const pages = [...new Set(measures.map((m) => m.page))].sort((a, b) => a - b);
  const jobs = pages.map((p) => ({ p, bands: bandsAbove(measures, p) }));
  const total = jobs.reduce((n, j) => n + stripsFor(j.bands).length, 0);
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { workerPath: `${BASE}worker.min.js`, corePath: BASE, langPath: BASE, gzip: true, workerBlobURL: false });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' });
  const result: PageText[] = [];
  let done = 0;
  try {
    for (const { p, bands } of jobs) {
      const page = await doc.getPage(p + 1);
      const [x0, y0, x1, y1] = page.view;
      const width = x1 - x0, height = y1 - y0;
      const scale = Math.min(4, 2400 / width); // pixels per point: small print needs about 4x; bounded for memory
      const viewport = page.getViewport({ scale });
      const full = document.createElement('canvas');
      full.width = Math.ceil(viewport.width);
      full.height = Math.ceil(viewport.height);
      await page.render({ canvas: full, viewport }).promise;
      const items: TextItem[] = [];
      for (const b of stripsFor(bands)) {
        const py = Math.floor(b.y0 * full.height), ph = Math.max(8, Math.ceil((b.y1 - b.y0) * full.height));
        const strip = document.createElement('canvas');
        strip.width = full.width;
        strip.height = ph;
        strip.getContext('2d')!.drawImage(full, 0, py, full.width, ph, 0, 0, full.width, ph);
        const { data } = await worker.recognize(strip, {}, { blocks: true });
        const words = (data.blocks ?? []).flatMap((bl) => bl.paragraphs.flatMap((pa) => pa.lines.flatMap((l) => l.words)))
          .map((w) => ({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, confidence: w.confidence }));
        items.push(...wordsToItems(words, scale, { x: 0, y: py / scale }));
        onProgress(++done, total);
      }
      result.push({ page: p, width, height, items });
    }
  } finally {
    await worker.terminate();
  }
  return result;
}
