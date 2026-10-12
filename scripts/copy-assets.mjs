// Self-hosts files the app loads at run time, so it works offline and under the content security policy:
//  - public/pdfjs: pdf.js's WASM image decoders (JBIG2 and JPEG 2000 scans!), colour profiles, standard fonts, character maps
//  - public/ocr: the OCR engine (worker, WASM core, English data)
// Run automatically before dev and build; the output is not committed.
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const copyInto = (dir, from, name = from.split('/').pop()) => { mkdirSync(dir, { recursive: true }); copyFileSync(from, join(dir, name)); };

// pdf.js
const pdf = 'node_modules/pdfjs-dist';
for (const d of ['wasm', 'iccs', 'standard_fonts', 'cmaps']) {
  if (!existsSync(join(pdf, d))) throw new Error(`missing ${join(pdf, d)}: run npm install`);
  cpSync(join(pdf, d), join('public/pdfjs', d), { recursive: true });
}

// OCR
const ocr = 'public/ocr';
copyInto(ocr, 'node_modules/tesseract.js/dist/worker.min.js');
// only the LSTM cores (that is what the English data needs); the engine picks the fastest one the browser supports
const core = 'node_modules/tesseract.js-core';
for (const f of readdirSync(core)) if (/^tesseract-core.*lstm\.wasm\.js$/.test(f)) copyInto(ocr, join(core, f));
const data = 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz';
if (!existsSync(data)) throw new Error('missing @tesseract.js-data/eng: run npm install');
copyInto(ocr, data);
console.log('runtime assets ready in public/pdfjs and public/ocr');
