(function () {
  window.OX500 = window.OX500 || {};

  async function fetchJson(url) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  async function fetchLogsPagesMeta() {
    return await fetchJson("/data/logs-pages-meta.json");
  }

  async function fetchLogsPage(pageNum) {
    if (!pageNum || pageNum < 1) return null;
    const page = await fetchJson(`/data/logs-page-${pageNum}.json`);
    return Array.isArray(page) ? page : null;
  }

  window.OX500.fetchLogsPagesMeta = fetchLogsPagesMeta;
  window.OX500.fetchLogsPage = fetchLogsPage;
})();
