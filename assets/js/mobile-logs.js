(function () {
  const utils = window.OX500 && window.OX500.utils;
  if (!utils) return;

  const staticHomeHero = document.body && document.body.dataset.layout === "home";

  function toLogHtml(rawText) {
    const normalized = String(rawText || "").replace(/\r\n/g, "\n");
    const blocks = normalized
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);

    const paragraphs = (blocks.length ? blocks : [normalized])
      .map((part) => `<p>${utils.escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
      .join("");

    return paragraphs || "<p></p>";
  }

  function deriveMobileDisruptionTitle(entry) {
    const clean = String((entry && entry.disruption_title_clean) || "").trim();
    if (clean) return clean;

    const rawSeries = String((entry && (entry.series || entry.disruption)) || "").trim();
    const rawTitle = String((entry && entry.title) || "").trim();

    let title = rawSeries;
    title = title.replace(/^DISRUPTION(?:_SERIES)?\s*\/\/\s*/i, "").trim();
    title = title.replace(/^SERIES\s*\/\/\s*/i, "").trim();
    title = title.replace(/^DISRUPTION\s*\/\s*/i, "").trim();

    if (!title) {
      title = rawTitle.replace(/^LOG\s*\d+\s*\/\/\s*/i, "").trim();
    }
    return title || "UNTITLED";
  }

  function deriveMobileLogEntryTitle(entry) {
    const rawTitle = String((entry && entry.title) || "").trim();
    let title = rawTitle;
    title = title.replace(/^LOG\s*\d+\s*\/\/\s*/i, "").trim();
    title = title.replace(/^DISRUPTION(?:_SERIES)?\s*\/\/\s*/i, "").trim();
    return title || "UNTITLED";
  }

  function setLogStamp(stampEl, id, date) {
    if (!stampEl) return;
    stampEl.textContent = "";
    const label = document.createElement("b");
    label.textContent = "LOG";
    stampEl.appendChild(label);
    stampEl.appendChild(document.createTextNode(` ${id} ${date}`));
  }

  function setNodePill(text) {
    const nodePill = document.getElementById("topbarNodePill");
    if (!nodePill) return;
    nodePill.textContent = String(text || "");
  }

  function setupHomeMobileSwipeLogs() {
    if (!staticHomeHero || !window.matchMedia) return;

    const mobileQuery = window.matchMedia("(max-width: 980px)");
    const panel = document.getElementById("activeViewPanel");
    const textEl = panel ? panel.querySelector(".bd.log-text") : null;
    const stampEl = document.getElementById("topbarLogStamp");
    const recentLogsRoot = document.getElementById("leftBlock2");
    const disruptionNodesRoot = document.getElementById("leftBlock3");
    const prevBtn = document.getElementById("mobilePrevLogBtn");
    const nextBtn = document.getElementById("mobileNextLogBtn");
    const mobileNav = panel ? panel.querySelector(".mobile-log-nav") : null;
    const scanWrap = document.getElementById("avScan");
    const scanInput = document.getElementById("scanInput");
    const scanResults = document.getElementById("scanResults");
    const scanBtn = document.getElementById("scanModeBtn");
    if (!panel || !textEl || !stampEl) return;

    let logs = [];
    let orderedIds = [];
    let logsById = new Map();
    let totalPages = 0;
    const loadedPages = new Set();
    const loadingPages = new Set();
    const pagePayloads = new Map();
    let logsPagesMetaCache = null;
    let loaded = false;
    let loading = false;
    let allLogsLoaded = false;
    let allLogsLoadingPromise = null;
    let currentEntryId = "";
    let lastNonScanMode = "entry";

    let startX = 0;
    let startY = 0;
    let startAt = 0;
    let trackingTouch = false;

    const SWIPE_MIN_X = 50;
    const SWIPE_MAX_Y = 70;
    const SWIPE_MAX_MS = 700;
    const TAP_MAX_MOVE = 14;
    const TAP_MAX_MS = 450;
    const MAX_SCAN_RESULTS = 80;
    const DEEP_TEXT_SEARCH = false;
    let deepTextSearchEnabled = DEEP_TEXT_SEARCH;
    let scanResultsLimit = MAX_SCAN_RESULTS;
    let scanLastNeedle = "";
    let scanMatchesCache = [];
    let scanInputDebounceTimer = null;

    const fetchLogsPagesMeta = async () => {
      if (!window.OX500 || typeof window.OX500.fetchLogsPagesMeta !== "function") return null;
      return await window.OX500.fetchLogsPagesMeta();
    };

    const fetchLogsPage = async (pageNum) => {
      if (!window.OX500 || typeof window.OX500.fetchLogsPage !== "function") return null;
      return await window.OX500.fetchLogsPage(pageNum);
    };

    const fetchLogsPagesMetaDirect = async () => {
      if (typeof fetch !== "function") return null;
      try {
        const response = await fetch("/data/logs-pages-meta.json");
        if (!response.ok) return null;
        return await response.json();
      } catch (_) {
        return null;
      }
    };

    async function getLogsPagesMetaCached() {
      if (logsPagesMetaCache) return logsPagesMetaCache;
      const viaApi = await fetchLogsPagesMeta();
      logsPagesMetaCache = viaApi || (await fetchLogsPagesMetaDirect()) || {};
      return logsPagesMetaCache;
    }

    function resolveCurrentIndex() {
      const bodyId = utils.normalizeId(document.body && document.body.dataset.logLevel);
      const stampMatch = (stampEl.textContent || "").match(/\d{5}/);
      const stampId = utils.normalizeId(stampMatch ? stampMatch[0] : "");
      const currentId = bodyId || stampId;
      if (!currentId) return orderedIds.length - 1;
      const idx = orderedIds.indexOf(currentId);
      return idx >= 0 ? idx : orderedIds.length - 1;
    }

    function maxLoadedPage() {
      return loadedPages.size ? Math.max(...loadedPages) : 0;
    }

    function minLoadedPage() {
      return loadedPages.size ? Math.min(...loadedPages) : 0;
    }

    function rebuildFromLoadedPages() {
      const uniqueById = new Map();
      const pages = Array.from(loadedPages).sort((a, b) => a - b);
      pages.forEach((pageNum) => {
        const part = pagePayloads.get(pageNum);
        if (!Array.isArray(part) || !part.length) return;
        part.forEach((entry) => {
          const id = utils.normalizeId(entry && entry.id);
          if (!id || uniqueById.has(id)) return;
          uniqueById.set(id, entry);
        });
      });

      const sorted = Array.from(uniqueById.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));
      logs = sorted.map(([, entry]) => entry);
      logsById = new Map(sorted);
      orderedIds = sorted.map(([id]) => id);
    }

    async function loadPage(pageNum) {
      if (!pageNum || pageNum < 1) return false;
      if (totalPages && pageNum > totalPages) return false;
      if (loadedPages.has(pageNum) || loadingPages.has(pageNum)) return false;

      loadingPages.add(pageNum);
      try {
        const page = await fetchLogsPage(pageNum);
        if (!Array.isArray(page) || !page.length) return false;
        pagePayloads.set(pageNum, page);
        loadedPages.add(pageNum);
        rebuildFromLoadedPages();
        window.OX500?.bus?.emit("logs:pageLoaded", { page: pageNum });
        updateControls();
        return true;
      } finally {
        loadingPages.delete(pageNum);
      }
    }

    function maybePrefetchAroundCurrent() {
      if (!loaded || !totalPages || !orderedIds.length) return;
      const idx = resolveCurrentIndex();
      if (idx < 0) return;

      if (idx <= 10) {
        const nextOlderPage = maxLoadedPage() + 1;
        if (nextOlderPage <= totalPages) {
          loadPage(nextOlderPage);
        }
      }

      if (orderedIds.length - 1 - idx <= 10) {
        const nextNewerPage = minLoadedPage() - 1;
        if (nextNewerPage >= 1) {
          loadPage(nextNewerPage);
        }
      }
    }

    function updateControls() {
      if (!prevBtn || !nextBtn) return;
      if (!loaded || !orderedIds.length) {
        prevBtn.disabled = false;
        nextBtn.disabled = false;
        prevBtn.classList.remove("disabled");
        nextBtn.classList.remove("disabled");
        return;
      }
      const idx = resolveCurrentIndex();
      const canPrev = idx > 0;
      const canNext = idx >= 0 && idx < orderedIds.length - 1;

      prevBtn.disabled = !canPrev;
      nextBtn.disabled = !canNext;
      prevBtn.classList.toggle("disabled", !canPrev);
      nextBtn.classList.toggle("disabled", !canNext);
    }

    function disruptionKey(entry) {
      const cleanSlug = String((entry && entry.disruption_slug_clean) || "").trim();
      if (cleanSlug) return cleanSlug;

      const rawSeries = String((entry && (entry.series || entry.disruption)) || "").trim();
      let title = rawSeries;
      title = title.replace(/^DISRUPTION(?:_SERIES)?\s*\/\/\s*/i, "").trim();
      title = title.replace(/^SERIES\s*\/\/\s*/i, "").trim();
      title = title.replace(/^DISRUPTION\s*\/\s*/i, "").trim();
      return title.toUpperCase();
    }

    function getCurrentEntry() {
      const currentId = utils.normalizeId(currentEntryId) || orderedIds[resolveCurrentIndex()];
      return currentId ? logsById.get(currentId) : null;
    }

    function disruptionSlugFromHref(href) {
      const raw = String(href || "");
      const match = raw.match(/\/disruption\/([^/?#]+)\.html(?:[?#].*)?$/i);
      return match ? match[1].trim().toLowerCase() : "";
    }

    function pickEntryForDisruptionSlug(slug) {
      if (!slug) return null;
      const list = logs
        .filter((entry) => disruptionKey(entry) === slug)
        .slice()
        .sort((a, b) => Number(utils.normalizeId(b.id)) - Number(utils.normalizeId(a.id)));
      return list.length ? list[0] : null;
    }

    function logIdFromHref(href) {
      const raw = String(href || "");
      const match = raw.match(/\/logs\/\d{4}\/\d{2}\/log-(\d+)-[^/?#]+\.html(?:[?#].*)?$/i);
      return match ? utils.normalizeId(match[1]) : "";
    }

    function markCurrentRecentLog(logId) {
      if (!recentLogsRoot) return;
      const currentId = utils.normalizeId(logId || "");
      const links = recentLogsRoot.querySelectorAll("a.log-line[href]");
      links.forEach((link) => {
        const id = logIdFromHref(link.getAttribute("href"));
        link.classList.toggle("is-current", Boolean(currentId && id === currentId));
      });
    }

    function setViewMode(mode) {
      if (!textEl) return;
      textEl.dataset.viewMode = mode;
      const isScanMode = mode === "scan";
      if (mode !== "scan") {
        lastNonScanMode = mode;
      }
      if (scanWrap) {
        scanWrap.hidden = !isScanMode;
      }
      if (mobileNav) {
        mobileNav.hidden = isScanMode;
      }
      textEl.hidden = isScanMode;
      if (scanBtn) {
        scanBtn.classList.toggle("is-scan", isScanMode);
        scanBtn.setAttribute("aria-pressed", isScanMode ? "true" : "false");
      }

      if (isScanMode) {
        setNodePill("NODE: QUERY_PORT");
      } else if (mode === "disruption-list") {
        setNodePill("NODE: DISRUPTION_LIST");
      } else {
        setNodePill("NODE: LOG_STREAM");
      }
    }

    function resetScanUi() {
      scanLastNeedle = "";
      scanMatchesCache = [];
      scanResultsLimit = MAX_SCAN_RESULTS;
      if (scanInput) {
        scanInput.value = "";
        scanInput.blur();
      }
      if (scanResults) {
        scanResults.innerHTML = '<span class="scan-hint">TYPE TO SCAN...</span>';
      }
    }

    function renderDisruptionList(sourceEntry) {
      const entry = sourceEntry || getCurrentEntry();
      if (!entry) return;

      const key = disruptionKey(entry);
      if (!key) return;

      const nodeTitle = deriveMobileDisruptionTitle(entry);
      const list = logs
        .filter((item) => disruptionKey(item) === key)
        .slice()
        .sort((a, b) => Number(utils.normalizeId(a.id)) - Number(utils.normalizeId(b.id)));

      if (!list.length) return;

      const listHtml = list
        .map((item) => {
          const id = utils.normalizeId(item.id);
          const title = deriveMobileLogEntryTitle(item);
          const href = String(item.url || "#");
          return (
            `<a class="log-line naked mobile-disruption-item" data-log-id="${utils.escapeHtml(id)}" href="${utils.escapeHtml(href)}">` +
            `<span class="log-id">LOG ${utils.escapeHtml(id)} //</span> ` +
            `<span class="log-tag">${utils.escapeHtml(title)}</span>` +
            `</a>`
          );
        })
        .join("");

      const titleActionAttrs = mobileQuery.matches
        ? `data-open-disruption-list="1" role="button" tabindex="0"`
        : "";
      const titleActionHtml = mobileQuery.matches
        ? `<span class="mobile-active-log-name">${utils.escapeHtml(nodeTitle)}</span>`
        : `<a class="mobile-active-log-link" data-open-disruption-list="1" href="#">${utils.escapeHtml(nodeTitle)}</a>`;

      setViewMode("disruption-list");
      textEl.innerHTML =
        `<div class="mobile-active-log-title" ${titleActionAttrs}>` +
        `<span class="mobile-active-log-prefix">DISRUPTION //</span> ` +
        titleActionHtml +
        `<div class="mobile-active-log-entry">// ${list.length} LOGS</div>` +
        `</div>` +
        `<div class="mobile-disruption-list">${listHtml}</div>`;
    }

    function renderEntry(entry) {
      if (!entry) return;
      const wasScanMode = Boolean(textEl && textEl.dataset.viewMode === "scan");
      const bodyHtml = toLogHtml(entry && entry.text ? entry.text : "");
      const cleanTitle = deriveMobileDisruptionTitle(entry);
      const cleanLogTitle = deriveMobileLogEntryTitle(entry);
      const titleActionAttrs = mobileQuery.matches
        ? `data-open-disruption-list="1" role="button" tabindex="0"`
        : "";
      const titleActionHtml = mobileQuery.matches
        ? `<span class="mobile-active-log-name">${utils.escapeHtml(cleanTitle)}</span>`
        : `<a class="mobile-active-log-link" data-open-disruption-list="1" href="#">${utils.escapeHtml(cleanTitle)}</a>`;
      const titleHtml =
        `<div class="mobile-active-log-title" ${titleActionAttrs}>` +
        `<span class="mobile-active-log-prefix">DISRUPTION //</span> ` +
        titleActionHtml +
        `<div class="mobile-active-log-entry">//${utils.escapeHtml(cleanLogTitle)}</div>` +
        `</div>`;
      setViewMode("entry");
      if (wasScanMode) {
        resetScanUi();
      }
      textEl.innerHTML = titleHtml + bodyHtml;
      setLogStamp(stampEl, entry && entry.id ? entry.id : "----", entry && entry.date ? entry.date : "----");
      currentEntryId = utils.normalizeId(entry && entry.id ? entry.id : "");
      markCurrentRecentLog(currentEntryId);
      if (document.body) {
        document.body.dataset.logLevel = utils.normalizeId(entry && entry.id ? entry.id : "");
      }
      window.OX500?.bus?.emit("log:changed", {
        id: utils.normalizeId((entry && (entry._nid || entry.id)) || ""),
      });
      updateControls();
      maybePrefetchAroundCurrent();
    }

    function renderScanResults(q, options) {
      if (!scanResults) return;
      const opts = options || {};
      const needle = String(q || "").trim().toLowerCase();
      const deepActive = deepTextSearchEnabled && needle.length >= 4;
      if (!needle) {
        scanLastNeedle = "";
        scanMatchesCache = [];
        scanResultsLimit = MAX_SCAN_RESULTS;
        scanResults.innerHTML = '<span class="scan-hint">TYPE TO SCAN...</span>';
        return;
      }

      if (!opts.keepLimit) {
        scanResultsLimit = MAX_SCAN_RESULTS;
      }

      let matchesAll = [];
      if (opts.useCached && needle === scanLastNeedle) {
        matchesAll = scanMatchesCache;
      } else {
        matchesAll = logs
          .filter((entry) => {
            const id = String(entry && entry.id ? entry.id : "").toLowerCase();
            const title = String(entry && entry.title ? entry.title : "").toLowerCase();
            const tag = String(entry && entry.tag ? entry.tag : "").toLowerCase();
            const disruptionTitle = String(entry && entry.disruption_title_clean ? entry.disruption_title_clean : "").toLowerCase();
            const disruptionSlug = String(entry && entry.disruption_slug_clean ? entry.disruption_slug_clean : "").toLowerCase();
            const excerpt = String(entry && entry.excerpt ? entry.excerpt : "").toLowerCase();
            let textMatch = false;
            if (deepActive) {
              textMatch = String(entry && entry.text ? entry.text : "").toLowerCase().includes(needle);
            }
            return (
              id.includes(needle) ||
              title.includes(needle) ||
              tag.includes(needle) ||
              disruptionTitle.includes(needle) ||
              disruptionSlug.includes(needle) ||
              excerpt.includes(needle) ||
              textMatch
            );
          })
          .sort((a, b) => Number(utils.normalizeId(b.id)) - Number(utils.normalizeId(a.id)));
        scanLastNeedle = needle;
        scanMatchesCache = matchesAll;
      }

      const shown = Math.min(matchesAll.length, scanResultsLimit);
      const results = matchesAll.slice(0, shown);
      const deepSwitchClass = deepTextSearchEnabled ? "is-deep-on" : "is-deep-off";
      const deepHint = deepTextSearchEnabled && !deepActive ? " (min 4 chars for TEXT)" : "";
      const statusHtml =
        `<span class="log-line scan-deep-toggle" data-scan-deep-toggle="1">` +
        `SCAN_MODE // DEEP: <span class="scan-deep-switch ${deepSwitchClass}" data-scan-deep-toggle="1">` +
        `<span class="scan-deep-opt scan-deep-opt-on">ON</span>` +
        `<span class="scan-deep-sep" aria-hidden="true">/</span>` +
        `<span class="scan-deep-opt scan-deep-opt-off">OFF</span>` +
        `</span>${deepHint} | MATCHES: ${matchesAll.length} | SHOWING: ${shown}` +
        `</span>`;

      if (!results.length) {
        scanResults.innerHTML = statusHtml + '<span class="scan-hint">NO MATCHES</span>';
        return;
      }

      const resultsHtml = results
        .map((entry) => {
          const id = utils.normalizeId(entry.id);
          const title = deriveMobileLogEntryTitle(entry);
          const href = String(entry.url || "#");
          return (
            `<a class="log-line naked mobile-disruption-item" data-scan-id="${utils.escapeHtml(id)}" href="${utils.escapeHtml(href)}">` +
            `<span class="log-id">LOG ${utils.escapeHtml(id)}</span>` +
            `<span class="log-tag">${utils.escapeHtml(title)}</span>` +
            `</a>`
          );
        })
        .join("");

      const moreHtml =
        matchesAll.length > shown
          ? '<span class="log-line" data-scan-more="1">LOAD MORE...</span>'
          : "";

      scanResults.innerHTML = statusHtml + resultsHtml + moreHtml;
    }

    async function openScan() {
      await ensureAllLogsLoaded();
      if (!loaded) return;
      setViewMode("scan");
      if (scanInput) {
        renderScanResults(scanInput.value);
        scanInput.focus();
      } else {
        renderScanResults("");
      }
    }

    function closeScan() {
      if (!textEl || textEl.dataset.viewMode !== "scan") return;
      const entry = getCurrentEntry();
      if (lastNonScanMode === "disruption-list" && entry) {
        renderDisruptionList(entry);
        resetScanUi();
        return;
      }
      if (entry) {
        renderEntry(entry);
        resetScanUi();
      } else {
        setViewMode("entry");
        resetScanUi();
      }
    }

    async function stepBy(direction) {
      let currentIndex = resolveCurrentIndex();
      if (currentIndex < 0) return;

      let nextIndex = currentIndex + direction;
      if (nextIndex < 0) {
        const olderPage = maxLoadedPage() + 1;
        if (olderPage <= totalPages) {
          const loadedNow = await loadPage(olderPage);
          if (loadedNow) {
            currentIndex = resolveCurrentIndex();
            nextIndex = currentIndex + direction;
          }
        }
      } else if (nextIndex >= orderedIds.length) {
        const newerPage = minLoadedPage() - 1;
        if (newerPage >= 1) {
          const loadedNow = await loadPage(newerPage);
          if (loadedNow) {
            currentIndex = resolveCurrentIndex();
            nextIndex = currentIndex + direction;
          }
        }
      }

      if (nextIndex < 0 || nextIndex >= orderedIds.length) return;
      const nextId = orderedIds[nextIndex];
      renderEntry(logsById.get(nextId));
    }

    function vibrateTap(ms = 10) {
      try {
        if (!mobileQuery.matches) return;
        if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
        navigator.vibrate(ms);
      } catch (_) {}
    }

    function isInteractiveTarget(target) {
      if (!target || !target.closest) return false;
      return Boolean(
        target.closest(
          "a,button,input,textarea,select,label,summary,details,[data-no-log-tap],.mobile-active-log-title,.mobile-disruption-item"
        )
      );
    }

    async function ensureLoaded() {
      if (loaded || loading) return;
      loading = true;
      try {
        const meta = await getLogsPagesMetaCached();
        if (meta && Number(meta.total_pages) > 0) {
          totalPages = Number(meta.total_pages);
          await loadPage(1);
          loaded = orderedIds.length > 0;
          if (loaded) {
            const currentId = orderedIds[resolveCurrentIndex()];
            if (currentId) renderEntry(logsById.get(currentId));
          }
          updateControls();
          maybePrefetchAroundCurrent();
          if (loaded) return;
        }

        return;
      } finally {
        loading = false;
      }
    }

    async function ensureAllLogsLoaded() {
      await ensureLoaded();
      if (!loaded || allLogsLoaded) return;

      if (!allLogsLoadingPromise) {
        allLogsLoadingPromise = (async () => {
          const meta = await getLogsPagesMetaCached();
          const declaredTotal = Number(meta && meta.total_pages);
          if (declaredTotal > 0) {
            totalPages = Math.max(totalPages, declaredTotal);
          }

          if (totalPages <= 1) {
            allLogsLoaded = true;
            return;
          }

          for (let pageNum = 2; pageNum <= totalPages; pageNum += 1) {
            await loadPage(pageNum);
          }
          allLogsLoaded = true;
        })().finally(() => {
          allLogsLoadingPromise = null;
        });
      }

      await allLogsLoadingPromise;
    }

    function onTouchStart(e) {
      if (!mobileQuery.matches || !e.touches || e.touches.length !== 1) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startAt = Date.now();
      trackingTouch = true;

      const title = e.target && e.target.closest
        ? e.target.closest(".mobile-active-log-title")
        : null;
      if (title) title.classList.add("is-pressed");
    }

    function onTouchEnd(e) {
      if (!trackingTouch || !mobileQuery.matches || !loaded) return;
      trackingTouch = false;
      panel
        .querySelectorAll(".mobile-active-log-title.is-pressed")
        .forEach((el) => el.classList.remove("is-pressed"));

      const touch = e.changedTouches && e.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const elapsed = Date.now() - startAt;
      const target = e.target;

      if (target && target.closest && target.closest(".mobile-active-log-title")) {
        vibrateTap(10);
        renderDisruptionList(getCurrentEntry());
        return;
      }

      if (textEl.dataset.viewMode === "disruption-list" || textEl.dataset.viewMode === "scan") {
        return;
      }

      if (
        elapsed <= TAP_MAX_MS &&
        Math.abs(deltaX) <= TAP_MAX_MOVE &&
        Math.abs(deltaY) <= TAP_MAX_MOVE &&
        !isInteractiveTarget(target)
      ) {
        const selection = window.getSelection ? window.getSelection() : null;
        if (selection && String(selection).trim()) return;

        const rect = panel.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        if (x < rect.width / 2) {
          stepBy(-1);
        } else {
          stepBy(1);
        }
        return;
      }

      if (elapsed > SWIPE_MAX_MS) return;
      if (Math.abs(deltaX) < SWIPE_MIN_X) return;
      if (Math.abs(deltaY) > SWIPE_MAX_Y) return;

      if (deltaX > 0) {
        stepBy(-1);
      } else {
        stepBy(1);
      }
    }

    textEl.addEventListener("click", (e) => {
      const titleTarget = e.target && e.target.closest
        ? e.target.closest(".mobile-active-log-title")
        : null;
      if (titleTarget) {
        if (mobileQuery.matches) {
          e.preventDefault();
          renderDisruptionList(getCurrentEntry());
          return;
        }
        const linkTarget = e.target && e.target.closest
          ? e.target.closest(".mobile-active-log-link[data-open-disruption-list='1']")
          : null;
        if (linkTarget) {
          e.preventDefault();
          renderDisruptionList(getCurrentEntry());
          return;
        }
      }

      const item = e.target && e.target.closest
        ? e.target.closest(".mobile-disruption-item[data-log-id]")
        : null;
      if (!item) return;
      e.preventDefault();
      const logId = utils.normalizeId(item.getAttribute("data-log-id"));
      if (!logId) return;
      const entry = logsById.get(logId);
      if (entry) renderEntry(entry);
    });

    textEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (!mobileQuery.matches) return;
      const target = e.target && e.target.closest
        ? e.target.closest(".mobile-active-log-title[data-open-disruption-list='1']")
        : null;
      if (!target) return;
      e.preventDefault();
      renderDisruptionList(getCurrentEntry());
    });

    if (scanBtn) {
      scanBtn.addEventListener(
        "click",
        async () => {
          if (textEl && textEl.dataset.viewMode === "scan") {
            closeScan();
            return;
          }
          await openScan();
        },
        { passive: true }
      );
    }

    if (scanInput) {
      scanInput.addEventListener("input", () => {
        if (scanInputDebounceTimer) {
          clearTimeout(scanInputDebounceTimer);
        }
        scanInputDebounceTimer = setTimeout(() => {
          renderScanResults(scanInput.value);
          scanInputDebounceTimer = null;
        }, 120);
      });

    }

    if (scanResults) {
      scanResults.addEventListener("click", (e) => {
        const deepToggleBlock = e.target && e.target.closest ? e.target.closest("[data-scan-deep-toggle='1']") : null;
        const shouldToggleDeep = Boolean(deepToggleBlock);
        if (shouldToggleDeep) {
          e.preventDefault();
          deepTextSearchEnabled = !deepTextSearchEnabled;
          renderScanResults(scanInput ? scanInput.value : "");
          return;
        }

        const more = e.target && e.target.closest ? e.target.closest("[data-scan-more='1']") : null;
        if (more) {
          e.preventDefault();
          scanResultsLimit += MAX_SCAN_RESULTS;
          renderScanResults(scanInput ? scanInput.value : "", { keepLimit: true, useCached: true });
          return;
        }

        const item = e.target && e.target.closest ? e.target.closest("[data-scan-id]") : null;
        if (!item) return;
        e.preventDefault();
        const logId = utils.normalizeId(item.getAttribute("data-scan-id"));
        if (!logId) return;
        const entry = logsById.get(logId);
        if (!entry) return;
        currentEntryId = logId;
        renderEntry(entry);
      });
    }

    if (disruptionNodesRoot) {
      disruptionNodesRoot.addEventListener("click", async (e) => {
        const link = e.target && e.target.closest ? e.target.closest("a.log-line[href]") : null;
        if (!link) return;

        const slug = disruptionSlugFromHref(link.getAttribute("href"));
        if (!slug) return;

        e.preventDefault();
        await ensureLoaded();
        if (!loaded) return;

        const entry = pickEntryForDisruptionSlug(slug);
        if (!entry) return;
        currentEntryId = utils.normalizeId(entry.id);
        renderDisruptionList(entry);
      });
    }

    if (recentLogsRoot) {
      recentLogsRoot.addEventListener("click", async (e) => {
        const link = e.target && e.target.closest ? e.target.closest("a.log-line[href]") : null;
        if (!link) return;

        const logId = logIdFromHref(link.getAttribute("href"));
        if (!logId) return;

        e.preventDefault();
        await ensureLoaded();
        if (!loaded) return;

        const entry = logsById.get(logId);
        if (!entry) return;
        currentEntryId = logId;
        renderEntry(entry);
      });
    }

    document.addEventListener("keydown", (e) => {
      const tag = document.activeElement && document.activeElement.tagName
        ? document.activeElement.tagName.toUpperCase()
        : "";
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isTyping && document.activeElement !== scanInput) return;
        e.preventDefault();
        openScan();
        return;
      }

      if (e.key === "Escape" && textEl.dataset.viewMode === "scan") {
        e.preventDefault();
        closeScan();
      }
    });

    panel.addEventListener("touchstart", onTouchStart, { passive: true });
    panel.addEventListener("touchend", onTouchEnd, { passive: true });
    panel.addEventListener(
      "touchcancel",
      () => {
        trackingTouch = false;
        panel
          .querySelectorAll(".mobile-active-log-title.is-pressed")
          .forEach((el) => el.classList.remove("is-pressed"));
      },
      { passive: true }
    );
    if (prevBtn) {
      prevBtn.addEventListener(
        "click",
        async () => {
          await ensureLoaded();
          if (!loaded) return;
          stepBy(-1);
        },
        { passive: true }
      );
    }
    if (nextBtn) {
      nextBtn.addEventListener(
        "click",
        async () => {
          await ensureLoaded();
          if (!loaded) return;
          stepBy(1);
        },
        { passive: true }
      );
    }

    const onMediaChange = () => {
      if (mobileQuery.matches) ensureLoaded();
      updateControls();
    };

    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", onMediaChange);
    } else if (typeof mobileQuery.addListener === "function") {
      mobileQuery.addListener(onMediaChange);
    }

    ensureLoaded();
    updateControls();
  }

  setupHomeMobileSwipeLogs();
})();
