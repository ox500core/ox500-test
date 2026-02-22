import { utils } from '../../core/utils.js';

function numericId(value) {
  return Number(utils.normalizeId(value));
}

export function getLoadedPageBoundary(loadedPages, comparator) {
  if (!loadedPages.size) return 0;
  return comparator(...loadedPages);
}

export function resolveStampId(stampEl) {
  const stampMatch = (stampEl?.textContent || '').match(/(?:\bLOG\b\s+)?(\d+)/i);
  return utils.normalizeId(stampMatch ? stampMatch[1] : '');
}

export function rebuildFromLoadedPages(state) {
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

  const sorted = Array.from(uniqueById.entries()).sort((a, b) => numericId(a[0]) - numericId(b[0]));
  state.logs = sorted.map(([, entry]) => entry);
  state.logsById = new Map(sorted);
  state.orderedIds = sorted.map(([id]) => id);
}

export function computePrefetchPages(state, currentIndex, totalLength, edgeThreshold = 5) {
  if (!state.loaded || !state.totalPages || !Number.isFinite(currentIndex) || !Number.isFinite(totalLength)) {
    return [];
  }
  if (totalLength <= 0 || currentIndex < 0) return [];

  const threshold = Math.max(0, Number(edgeThreshold) || 0);
  const nearStart = currentIndex <= threshold;
  const nearEnd = (totalLength - 1 - currentIndex) <= threshold;
  const jobs = [];

  if (nearStart) {
    const nextOlderPage = getLoadedPageBoundary(state.loadedPages, Math.max) + 1;
    if (nextOlderPage <= state.totalPages) jobs.push(nextOlderPage);
  }
  if (nearEnd) {
    const nextNewerPage = getLoadedPageBoundary(state.loadedPages, Math.min) - 1;
    if (nextNewerPage >= 1) jobs.push(nextNewerPage);
  }
  return jobs;
}
