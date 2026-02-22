function normalizedId(value) {
  return String(value || '').replace(/\D/g, '');
}

function numericId(value) {
  return Number(normalizedId(value));
}

function applyNavButtonState(button, enabled) {
  if (!button) return;
  button.disabled = !enabled;
  button.classList.toggle('disabled', !enabled);
}

function buildDisruptionOrderMap(logs, disruptionKey) {
  const newestByKey = new Map();
  logs.forEach((entry) => {
    const key = disruptionKey(entry);
    if (!key) return;
    const idNum = numericId(entry?.id);
    const previous = newestByKey.get(key);
    if (!previous || idNum > previous.idNum) newestByKey.set(key, { idNum, entry });
  });
  const disruptionOrder = Array.from(newestByKey.entries())
    .sort((a, b) => a[1].idNum - b[1].idNum)
    .map(([key]) => key);
  return { newestByKey, disruptionOrder };
}

function createDisruptionCache() {
  return {
    key: '',
    disruptionOrder: [],
    newestByKey: new Map(),
    entriesByKey: new Map(),
  };
}

export function createMobileNavController(options) {
  const {
    textEl,
    stampEl,
    prevBtn,
    nextBtn,
    backFromSearchBtn,
    isFromSearch,
    isFromDisruption,
    isLoaded,
    getOrderedIds,
    resolveCurrentIndex,
    getLogs,
    maybePrefetchAroundListIndex,
    getCurrentEntry,
    disruptionKey,
  } = options;

  const disruptionCache = createDisruptionCache();

  function getLogsVersionKey() {
    const logs = getLogs();
    if (!logs.length) return '0';
    return `${logs.length}:${logs[0]?.id || ''}:${logs[logs.length - 1]?.id || ''}`;
  }

  function getDisruptionData() {
    const key = getLogsVersionKey();
    if (disruptionCache.key === key) return disruptionCache;

    const logs = getLogs();
    const { newestByKey, disruptionOrder } = buildDisruptionOrderMap(logs, disruptionKey);
    const entriesByKey = new Map();
    logs.forEach((entry) => {
      const dKey = disruptionKey(entry);
      if (!dKey) return;
      if (!entriesByKey.has(dKey)) entriesByKey.set(dKey, []);
      entriesByKey.get(dKey).push(entry);
    });

    disruptionCache.key = key;
    disruptionCache.disruptionOrder = disruptionOrder;
    disruptionCache.newestByKey = newestByKey;
    disruptionCache.entriesByKey = entriesByKey;
    return disruptionCache;
  }

  function updateControls() {
    if (!prevBtn || !nextBtn) return;
    if (backFromSearchBtn) {
      const inEntryMode = textEl?.dataset?.viewMode === 'entry';
      const backToSearch = Boolean(isFromSearch() && inEntryMode);
      const backToDisruption = Boolean(isFromDisruption() && inEntryMode);
      const showBack = backToSearch || backToDisruption;
      backFromSearchBtn.hidden = !showBack;
      if (showBack) {
        backFromSearchBtn.textContent = '\u21A9 BACK';
        backFromSearchBtn.setAttribute('aria-label', backToSearch ? 'Back to search results' : 'Back to disruption list');
      }
    }
    if (!isLoaded() || !getOrderedIds().length) {
      prevBtn.disabled = false;
      nextBtn.disabled = false;
      prevBtn.classList.remove('disabled');
      nextBtn.classList.remove('disabled');
      return;
    }

    if (textEl?.dataset?.viewMode === 'disruption-list') {
      const currentEntry = getCurrentEntry(stampEl);
      const currentKey = disruptionKey(currentEntry);
      if (!currentKey) {
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        prevBtn.classList.add('disabled');
        nextBtn.classList.add('disabled');
        return;
      }

      const { disruptionOrder } = getDisruptionData();
      const idx = disruptionOrder.indexOf(currentKey);
      const canPrev = idx > 0;
      const canNext = idx >= 0 && idx < disruptionOrder.length - 1;

      if (idx >= 0) {
        void maybePrefetchAroundListIndex(idx, disruptionOrder.length, 10);
      }

      applyNavButtonState(prevBtn, canPrev);
      applyNavButtonState(nextBtn, canNext);
      return;
    }

    if (textEl?.dataset?.viewMode === 'entry' && isFromDisruption()) {
      const currentEntry = getCurrentEntry(stampEl);
      const currentKey = disruptionKey(currentEntry);
      if (currentEntry && currentKey) {
        const { entriesByKey } = getDisruptionData();
        const list = entriesByKey.get(currentKey) || [];

        const currentId = normalizedId(currentEntry?.id);
        const idx = list.findIndex((entry) => normalizedId(entry?.id) === currentId);

        if (idx >= 0) {
          void maybePrefetchAroundListIndex(idx, list.length, 10);
          const canPrev = idx > 0;
          const canNext = idx < list.length - 1;
          applyNavButtonState(prevBtn, canPrev);
          applyNavButtonState(nextBtn, canNext);
          return;
        }
      }
    }

    const idx = resolveCurrentIndex(stampEl);
    const canPrev = idx > 0;
    const canNext = idx >= 0 && idx < getOrderedIds().length - 1;

    applyNavButtonState(prevBtn, canPrev);
    applyNavButtonState(nextBtn, canNext);
  }

  function getLatestDisruptionEntry() {
    const { disruptionOrder, newestByKey } = getDisruptionData();
    if (!disruptionOrder.length) return null;
    const latestKey = disruptionOrder[disruptionOrder.length - 1];
    return newestByKey.get(latestKey)?.entry || null;
  }

  return {
    updateControls,
    getLatestDisruptionEntry,
  };
}
