// === OX500 LOGS LOADER ===
// Fetches paginated log data from /data/*.json endpoints.
// No state — pure async fetch functions.

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
  return fetchJson('/data/logs-pages-meta.json');
}

export async function fetchLogsPage(pageNum) {
  if (!pageNum || pageNum < 1) return null;
  const page = await fetchJson(`/data/logs-page-${pageNum}.json`);
  return Array.isArray(page) ? page : null;
}
