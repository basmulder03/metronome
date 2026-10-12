import { expect, it } from 'vitest';
import { concatPcm, wavBlob } from './audio';

it('concatPcm puts silence only between parts', () => {
  const out = concatPcm([new Float32Array([1, 1]), new Float32Array([2])], 0.5, 10);
  expect([...out]).toEqual([1, 1, 0, 0, 0, 0, 0, 2]);
  expect(concatPcm([new Float32Array(3)], 9, 10)).toHaveLength(3);
});

it('wavBlob writes a valid mono 16-bit header', async () => {
  const buf = new DataView(await wavBlob(new Float32Array(100), 44100).arrayBuffer());
  expect(String.fromCharCode(buf.getUint8(0), buf.getUint8(1), buf.getUint8(2), buf.getUint8(3))).toBe('RIFF');
  expect(buf.getUint32(24, true)).toBe(44100);
  expect(buf.getUint32(40, true)).toBe(200);
  expect(buf.byteLength).toBe(244);
});
