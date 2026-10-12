/** Common tempo words and the quarter-note speed they usually mean (the middle of the traditional range). Longest names first. */
export const TEMPO_NAMES: [name: string, bpm: number][] = [
  ['allegro vivace', 150], ['allegro moderato', 120], ['andante maestoso', 66], ['andante moderato', 90],
  ['prestissimo', 200], ['larghetto', 63], ['allegretto', 112], ['andantino', 84], ['moderato', 108],
  ['maestoso', 66], ['adagio', 70], ['andante', 80], ['allegro', 132], ['vivace', 160], ['presto', 184],
  ['grave', 40], ['largo', 50], ['lento', 52],
];

/** The average tempo for a tempo word in `text` (case-insensitive, whole words), or undefined. */
export function tempoByName(text: string): { name: string; bpm: number } | undefined {
  const t = text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ');
  for (const [name, bpm] of TEMPO_NAMES) if (new RegExp(`(^| )${name}( |$)`).test(t)) return { name, bpm };
  return undefined;
}
