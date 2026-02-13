(function () {
  window.OX500 = window.OX500 || {};

  const listeners = new Map();

  const bus = {
    on(event, handler) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event).add(handler);
    },

    off(event, handler) {
      if (!listeners.has(event)) return;
      listeners.get(event).delete(handler);
    },

    emit(event, payload) {
      if (!listeners.has(event)) return;

      for (const handler of listeners.get(event)) {
        try {
          handler(payload);
        } catch (err) {
          console.error("OX500 BUS ERROR", event, err);
        }
      }
    },
  };

  window.OX500.bus = bus;
})();
