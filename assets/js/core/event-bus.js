// === OX500 EVENT BUS ===
// Central pub/sub bus. Import { bus } wherever events are needed.

const listeners = new Map();

function ensureEventSet(event) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  return listeners.get(event);
}

function getEventSet(event) {
  return listeners.get(event) || null;
}

export const bus = {
  on(event, handler) {
    ensureEventSet(event).add(handler);
  },

  off(event, handler) {
    const eventSet = getEventSet(event);
    if (!eventSet) return;
    eventSet.delete(handler);
    if (!eventSet.size) listeners.delete(event);
  },

  emit(event, payload) {
    const eventSet = getEventSet(event);
    if (!eventSet || !eventSet.size) return;
    for (const handler of Array.from(eventSet)) {
      try { handler(payload); }
      catch (err) { console.error('OX500 BUS ERROR', event, err); }
    }
  },
};
