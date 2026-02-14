// === OX500 EVENT BUS ===
// Central pub/sub bus. Import { bus } wherever events are needed.

const listeners = new Map();

export const bus = {
  on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
  },

  off(event, handler) {
    if (!listeners.has(event)) return;
    listeners.get(event).delete(handler);
  },

  emit(event, payload) {
    if (!listeners.has(event)) return;
    for (const handler of listeners.get(event)) {
      try { handler(payload); }
      catch (err) { console.error('OX500 BUS ERROR', event, err); }
    }
  },
};
