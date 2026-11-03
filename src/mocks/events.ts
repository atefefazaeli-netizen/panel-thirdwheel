// In-mock event bus: modules publish what happened (content.published, crisis.alert, …) and the
// integrations mock turns subscribed events into webhook deliveries.
type Listener = (type: string, data: Record<string, unknown>) => void;
const listeners = new Set<Listener>();

export function onMockEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitMockEvent(type: string, data: Record<string, unknown>): void {
  listeners.forEach((fn) => fn(type, data));
}
