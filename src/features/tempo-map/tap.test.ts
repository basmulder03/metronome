import { describe, expect, it } from 'vitest';
import { tapBpm } from './tap';

describe('tapBpm', () => {
  it('needs two taps', () => {
    expect(tapBpm([])).toBeNull();
    expect(tapBpm([1000])).toBeNull();
  });

  it('500 ms apart is 120 bpm', () => expect(tapBpm([0, 500, 1000, 1500])).toBe(120));

  it('averages out an uneven player', () => expect(tapBpm([0, 480, 1020, 1500, 2010])).toBe(119));

  it('a pause starts a new count', () => expect(tapBpm([0, 300, 600, 10_000, 10_500])).toBe(120));

  it('only the last five taps count, so it follows a tempo change', () => {
    expect(tapBpm([0, 1000, 2000, 3000, 3500, 4000, 4500, 5000])).toBe(120);
  });

  it('clamps to a sensible range', () => {
    expect(tapBpm([0, 50])).toBe(400);
    expect(tapBpm([0, 1900])).toBe(32);
  });
});
