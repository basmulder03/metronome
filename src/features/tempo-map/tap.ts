/** Taps further apart than this start a new count. */
export const TAP_RESET_MS = 2000;

/**
 * BPM from tap times (ms). Uses the last 5 taps so it follows the player without lurching on the first tap.
 * Returns null until there are two taps in the current run.
 */
export function tapBpm(times: number[]): number | null {
  // keep only the current run: a long pause means the player started over
  let start = 0;
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > TAP_RESET_MS) start = i;
  const run = times.slice(start).slice(-5);
  if (run.length < 2) return null;
  const avg = (run[run.length - 1] - run[0]) / (run.length - 1);
  return Math.min(400, Math.max(20, Math.round(60000 / avg)));
}
