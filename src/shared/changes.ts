/** Lets slices say "local data changed" without knowing who listens (sync does), which keeps slice dependencies one-way. */
const listeners = new Set<() => void>();
export const onLocalChange = (f: () => void) => (listeners.add(f), () => listeners.delete(f));
export const notifyChange = () => listeners.forEach((f) => f());
