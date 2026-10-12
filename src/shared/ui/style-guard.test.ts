import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

// Raw colours live in shared/ui/tokens.css only. Everything else uses var(--token).
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

it('feature and app code contain no raw colour literals', () => {
  const files = [...walk('src/features'), 'src/App.svelte'].filter((f) => /\.(svelte|css|ts)$/.test(f) && !f.endsWith('.test.ts'));
  const offenders = files.filter((f) => COLOR.test(readFileSync(f, 'utf8')));
  expect(offenders).toEqual([]);
});

it('every token that changes per theme is defined once with light-dark()', () => {
  const css = readFileSync('src/shared/ui/tokens.css', 'utf8');
  expect(css).not.toMatch(/prefers-color-scheme/);
  expect(css).toMatch(/--bg: light-dark\(/);
});
