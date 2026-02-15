// === MOBILE LOGS — STORE ===
// Owns all log data. Handles paginated loading, deduplication,
// index resolution, and prefetch logic.
// No DOM access except reading body.dataset for currentIndex.

import { utils } from '../../core/utils.js';
import { fetchLogsPagesMeta, fetchLogsPage } from '../../core/logs-loader.js';
import { bus } from '../../core/event-bus.js';

// === STATE ===

const state = {
  logs: [],
  orderedIds: [],
  logsById: new Map(),

  totalPages: 0,
  loadedPages: new Set(),
  loadingPagePromises: new Map(),
  pagePayloads: new Map(),
  logsPagesMetaCache: null,

  loaded: false,
  loading: false,
  loadingPromise: null,
  allLogsLoaded: false,
  allLogsLoadingPromise: null,

  currentEntryId: '',
};

// === READ ===

export function getState() { return state; }
export function isLoaded() { return state.loaded; }
export function getLogs() { return state.logs; }
export function getLogsById() { return state.logsById; }
export function getOrderedIds() { return state.orderedIds; }

export function getCurrentEntryId() { return state.currentEntryId; }
export function setCurrentEntryId(id) { state.currentEntryId = id; }

export function maxLoadedPage() {
  return state.loadedPages.size ? Math.max(...state.loadedPages) : 0;
}

export function minLoadedPage() {
  return state.loadedPages.size ? Math.min(...state.loadedPages) : 0;
}

export function resolveCurrentIndex(stampEl) {
  const bodyId = utils.normalizeId(document.body?.dataset?.logLevel);
  const stampMatch = (stampEl?.textContent || '').match(/\bLOG\b\s+(\d+)/i);
  const stampId = utils.normalizeId(stampMatch ? stampMatch[1] : '');
  const currentId = bodyId || stampId;
  if (!currentId) return state.orderedIds.length - 1;
  const idx = state.orderedIds.indexOf(currentId);
  return idx >= 0 ? idx : state.orderedIds.length - 1;
}

// === WRITE ===

function rebuildFromLoadedPages() {
  const uniqueById = new Map();
  const pages = Array.from(state.loadedPages).sort((a, b) => a - b);

  pages.forEach((pageNum) => {
    const part = state.pagePayloads.get(pageNum);
    if (!Array.isArray(part) || !part.length) return;
    part.forEach((entry) => {
      const id = utils.normalizeId(entry?.id);
      if (!id || uniqueById.has(id)) return;
      uniqueById.set(id, entry);
    });
  });

  const sorted = Array.from(uniqueById.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));
  state.logs = sorted.map(([, entry]) => entry);
  state.logsById = new Map(sorted);
  state.orderedIds = sorted.map(([id]) => id);
}

// === LOADING ===

export async function loadPage(pageNum) {
  if (!pageNum || pageNum < 1) return false;
  if (state.totalPages && pageNum > state.totalPages) return false;
  if (state.loadedPages.has(pageNum)) return true;
  if (state.loadingPagePromises.has(pageNum)) {
    return await state.loadingPagePromises.get(pageNum);
  }

  const promise = (async () => {
    try {
      const page = await fetchLogsPage(pageNum);
      if (!Array.isArray(page) || !page.length) return false;
      state.pagePayloads.set(pageNum, page);
      state.loadedPages.add(pageNum);
      rebuildFromLoadedPages();
      bus.emit('logs:pageLoaded', { page: pageNum });
      return true;
    } catch (_) {
      return false;
    } finally {
      state.loadingPagePromises.delete(pageNum);
    }
  })();

  state.loadingPagePromises.set(pageNum, promise);
  return await promise;
}

export async function ensureLoaded() {
  if (state.loaded) return;
  if (state.loadingPromise) {
    await state.loadingPromise;
    return;
  }

  state.loading = true;
  state.loadingPromise = (async () => {
    let meta = state.logsPagesMetaCache;
    if (!meta) {
      meta = await fetchLogsPagesMeta();
      state.logsPagesMetaCache = meta || {};
    }
    if (meta && Number(meta.total_pages) > 0) {
      state.totalPages = Number(meta.total_pages);
      await loadPage(1);
      state.loaded = state.orderedIds.length > 0;
    }
  })().finally(() => {
    state.loading = false;
    state.loadingPromise = null;
  });

  await state.loadingPromise;
}

export async function ensureAllLogsLoaded() {
  await ensureLoaded();
  if (!state.loaded || state.allLogsLoaded) return;

  if (!state.allLogsLoadingPromise) {
    state.allLogsLoadingPromise = (async () => {
      let meta = state.logsPagesMetaCache;
      if (!meta) {
        meta = await fetchLogsPagesMeta();
        state.logsPagesMetaCache = meta || {};
      }
      const declaredTotal = Number(meta?.total_pages);
      if (declaredTotal > 0) {
        state.totalPages = Math.max(state.totalPages, declaredTotal);
      }
      if (state.totalPages <= 1) { state.allLogsLoaded = true; return; }
      for (let p = 2; p <= state.totalPages; p++) await loadPage(p);
      state.allLogsLoaded = true;
    })().finally(() => { state.allLogsLoadingPromise = null; });
  }

  await state.allLogsLoadingPromise;
}

export function maybePrefetchAroundCurrent(stampEl) {
  if (!state.loaded || !state.totalPages || !state.orderedIds.length) return;
  const idx = resolveCurrentIndex(stampEl);
  if (idx < 0) return;

  // Approaching older logs boundary → prefetch next (older) page
  if (idx <= 10) {
    const nextOlderPage = maxLoadedPage() + 1;
    if (nextOlderPage <= state.totalPages) loadPage(nextOlderPage);
  }

  // Approaching newer logs boundary → prefetch previous (newer) page
  if (state.orderedIds.length - 1 - idx <= 10) {
    const nextNewerPage = minLoadedPage() - 1;
    if (nextNewerPage >= 1) loadPage(nextNewerPage);
  }
}
