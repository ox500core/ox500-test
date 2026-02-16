// === OX500 LOGS LOADER ===
// Fetches paginated log data from /data/*.json endpoints.
// No state — pure async fetch functions.

const DATA_ROOT = '/data';
const LOGS_META_PATH = `${DATA_ROOT}/logs-pages-meta.json`;

function logsPagePath(pageNum) {
  return `${DATA_ROOT}/logs-page-${pageNum}.json`;
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

export async function fetchLogsPagesMeta() {
  return fetchJson(LOGS_META_PATH);
}

export async function fetchLogsPage(pageNum) {
  if (!pageNum || pageNum < 1) return null;
  const page = await fetchJson(logsPagePath(pageNum));
  return Array.isArray(page) ? page : null;
}
