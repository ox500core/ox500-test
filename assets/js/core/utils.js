// === OX500 UTILS ===
// Pure helper functions. No side effects, no DOM access.

const NON_DIGIT_RE = /\D/g;
const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const utils = {
  pad(n) {
    return String(n).padStart(2, '0');
  },

  normalizeId(id) {
    return String(id || '').replace(NON_DIGIT_RE, '');
  },

  escapeHtml(value) {
    return String(value).replace(HTML_ESCAPE_RE, (char) => HTML_ESCAPE_MAP[char] || char);
  },

  safeParseDate(value) {
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
  },
};
