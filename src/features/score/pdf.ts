import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Open a PDF. The extra URLs matter: without `wasmUrl` pdf.js cannot decode JBIG2 or JPEG 2000 images, which is how most
 * scanned scores are stored, so their pages would render blank. Fonts and character maps are for text that is not embedded.
 * All of it is served from /pdfjs (see scripts/copy-assets.mjs).
 */
export const openPdf = (data: Uint8Array) =>
  pdfjs.getDocument({
    data,
    wasmUrl: '/pdfjs/wasm/',
    iccUrl: '/pdfjs/iccs/',
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
  }).promise;
