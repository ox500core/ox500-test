// === OX500 UTILS ===
// Pure helper functions. No side effects, no DOM access.

export const utils = {
  pad(n) {
    return String(n).padStart(2, '0');
  },

  normalizeId(id) {
    return String(id || '').replace(/\D/g, '');
  },

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  safeParseDate(value) {
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
  },
};
