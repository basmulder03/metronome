import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageText } from './readmarks';

/**
 * Text of one page in points from the top-left corner. Digitally produced scores keep tempo marks, rit./accel. words and
 * even time-signature digits as real text; scans have none.
 * shortcut: rotated pages are skipped, their coordinates would need transforming.
 */
export async function readPageText(doc: PDFDocumentProxy, pageIndex: number): Promise<PageText> {
  const page = await doc.getPage(pageIndex + 1);
  const [x0, y0, x1, y1] = page.view;
  const width = x1 - x0, height = y1 - y0;
  if (page.rotate % 360 !== 0) return { page: pageIndex, width, height, items: [] };
  const content = await page.getTextContent();
  const items = content.items.flatMap((it) =>
    'str' in it && it.str.trim()
      ? [{ str: it.str, x: it.transform[4] - x0, y: height - (it.transform[5] - y0), w: it.width, size: it.height }]
      : [],
  );
  return { page: pageIndex, width, height, items };
}
