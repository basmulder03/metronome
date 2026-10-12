// Self-hosts the OCR engine (worker, WASM core, English data) under public/ocr so it works offline and under the CSP.
// Run automatically before dev/build; the output is not committed.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const out = 'public/ocr';
mkdirSync(out, { recursive: true });
const copy = (from, name = from.split('/').pop()) => copyFileSync(from, join(out, name));

copy('node_modules/tesseract.js/dist/worker.min.js');
// only the LSTM cores (that is what the English data needs); the engine picks the fastest one the browser supports
const core = 'node_modules/tesseract.js-core';
for (const f of readdirSync(core)) if (/^tesseract-core.*lstm\.wasm\.js$/.test(f)) copy(join(core, f));
const data = 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz';
if (!existsSync(data)) throw new Error('missing @tesseract.js-data/eng: run npm install');
copy(data);
console.log('OCR assets ready in', out);
