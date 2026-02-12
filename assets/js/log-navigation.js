(function () {
  const container = document.getElementById("active-log-container");
  const nextBtn = document.getElementById("next-log");
  const prevBtn = document.getElementById("prev-log");
  const activeId = document.getElementById("activeLogId");
  const topbarLogStamp = document.getElementById("topbarLogStamp");
  const openDisruptionIndex = document.getElementById("openDisruptionIndex");
  const disruptionIndexTemplate = document.getElementById("disruptionIndexTemplate");
  const memoryScatter = document.getElementById("memory-scatter");

  if (!container || !nextBtn || !prevBtn) return;

  let logs = [];
  let currentIndex = 0;
  let currentPage = 0;
  let totalPages = null;
  let prefetchInProgress = false;
  let prefetchedPages = new Set();
  const DATA_BASE_PATH = "/data";
  let olderPageStep = -1;

  let y = 0;
  let lastTs = null;
  let loopCount = 0;
  let agentSpawned = false;
  let rafId = null;
  let resizeBound = false;
  let wheelBound = false;
  let clickPauseBound = false;
  let scrollPausedByClick = false;
  let visibilityBound = false;
  let recentLogsResizeBound = false;
  let isNavigating = false;
  let popstateBound = false;
  let archiveTopLockRaf = null;
  let archiveTopLockUntil = 0;
  const LIVE_ROTATE_MS = 35000;
  const USER_PAUSE_MS = 60000;
  let liveInterval = null;
  let pausedUntil = 0;

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function truncateFixed(text, maxChars = 28) {
    if (!text) return "";
    const t = String(text);
    if (t.length <= maxChars) return t.padEnd(maxChars, " ");
    return t.slice(0, maxChars - 3) + "...";
  }

  function getMonospaceCharWidth(sampleEl) {
    const probe = document.createElement("span");
    probe.textContent = "0000000000";
    probe.style.visibility = "hidden";
    probe.style.position = "absolute";
    probe.style.whiteSpace = "pre";
    sampleEl.appendChild(probe);
    const width = probe.getBoundingClientRect().width / 10;
    probe.remove();
    return width > 0 ? width : 8;
  }

  function applyRecentLogsFixedTruncation() {
    const lines = document.querySelectorAll(".recent-logs .log-line");
    lines.forEach((line) => {
      const idEl = line.querySelector(".log-id");
      const tag = line.querySelector(".log-tag");
      if (!idEl || !tag) return;

      if (!tag.dataset.fullTitle) {
        tag.dataset.fullTitle = (tag.textContent || "").trim();
      }

      const fullTitle = tag.dataset.fullTitle;
      const charWidth = getMonospaceCharWidth(tag);
      const idWidth = idEl.getBoundingClientRect().width;
      const lineWidth = line.getBoundingClientRect().width;
      const gapPx = 8;
      const availablePx = Math.max(0, lineWidth - idWidth - gapPx);
      const maxChars = Math.max(4, Math.floor(availablePx / charWidth));
      tag.textContent = truncateFixed(fullTitle, maxChars);
    });
  }

  function pushHistoryForLog(log) {
    if (!log || !log.url) return;
    if (window.location.pathname === log.url) return;
    history.pushState({ logId: log.id }, "", log.url);
  }

  function updateCanonicalForLog(log) {
    if (!log || !log.url) return;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) return;
    canonical.setAttribute("href", new URL(log.url, window.location.origin).href);
  }

  function findLogIndexById(logId) {
    const target = String(logId || "");
    return logs.findIndex((l) => String((l && l.id) || "") === target);
  }

  function normalizePath(pathLike) {
    if (!pathLike) return "";
    try {
      return new URL(pathLike, window.location.origin).pathname.replace(/\/+$/, "");
    } catch (_) {
      return "";
    }
  }

  function sortLogsNewestFirst(items) {
    return (Array.isArray(items) ? items : []).slice().sort((a, b) => {
      const aNum = Number(a && a.id);
      const bNum = Number(b && b.id);
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) return bNum - aNum;
      const aId = String((a && a.id) || "");
      const bId = String((b && b.id) || "");
      return bId.localeCompare(aId);
    });
  }

  function getMaxLogId(items) {
    const sorted = sortLogsNewestFirst(items);
    if (!sorted.length) return -1;
    const firstId = Number(sorted[0] && sorted[0].id);
    return Number.isFinite(firstId) ? firstId : -1;
  }

  async function fetchPagedJson(pathSuffix) {
    const url = `${DATA_BASE_PATH}/${pathSuffix}`;
    const res = await fetch(url, { cache: "no-cache" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`fetch failed: ${url}`);
    return await res.json();
  }

  async function fetchPage(pageNum) {
    if (prefetchedPages.has(pageNum)) return [];

    const data = await fetchPagedJson(`logs-page-${pageNum}.json`);
    if (data === null) {
      return null;
    }
    const pageLogs = sortLogsNewestFirst(data);
    prefetchedPages.add(pageNum);
    return pageLogs;
  }

  async function loadPreviousPageIfNeeded() {
    if (prefetchInProgress) return;
    if (totalPages == null) return false;
    const targetPage = currentPage + olderPageStep;
    if (targetPage < 1 || targetPage > totalPages) return false;
    if (prefetchedPages.has(targetPage)) return false;
    prefetchInProgress = true;
    try {
      const pageLogs = await fetchPage(targetPage);
      if (pageLogs === null) {
        updateButtons();
        return false;
      }
      if (!pageLogs.length) {
        updateButtons();
        return false;
      }
      logs = logs.concat(pageLogs);
      currentPage = targetPage;
      return true;
    } catch (_e) {
      return false;
    } finally {
      prefetchInProgress = false;
    }
  }

  function ensurePrefetchWindow() {
    if (currentIndex >= logs.length - 10) {
      loadPreviousPageIfNeeded().catch(() => {});
    }
  }

  function typeText(node, text) {
    let i = 0;
    const chunk = document.createTextNode("");
    node.appendChild(chunk);
    const iv = setInterval(() => {
      chunk.nodeValue += text[i];
      i += 1;
      if (i >= text.length) clearInterval(iv);
    }, 28);
  }

  function stagedSequence(node) {
    if (!window.OX500_AGENT_ENABLED) return;
    typeText(node, "PRESENCE DETECTED.");
    setTimeout(() => {
      node.appendChild(document.createElement("br"));
      typeText(node, "INPUT CHANNEL: NOT AVAILABLE.");
      setTimeout(() => {
        node.appendChild(document.createElement("br"));
        typeText(node, "SWITCHING TO INTERNAL MONOLOGUE.");
      }, 2000);
    }, 5000);
  }

  function spawnAgent() {
    if (!window.OX500_AGENT_ENABLED) return;
    if (agentSpawned) return;
    agentSpawned = true;

    const insert = document.getElementById("agent-insert-point");
    if (!insert) return;

    setTimeout(() => {
      const el = document.createElement("div");
      el.id = "agent-terminal";
      const line = document.createElement("div");
      el.appendChild(line);
      const cursor = document.createElement("span");
      cursor.className = "cursor";
      cursor.textContent = "\u2588";
      el.appendChild(cursor);
      insert.appendChild(el);
      stagedSequence(line);
    }, 700);
  }

  function updatePrevLogMemory() {
    if (!memoryScatter) return;
    const prev = logs[currentIndex + 1];
    memoryScatter.dataset.prevLog = prev && prev.text ? prev.text : "";
  }

  function removeAgentOverlay() {
    const overlays = container.querySelectorAll("#agent-terminal");
    overlays.forEach((n) => n.remove());
  }

  function removeArchiveCornerLabel() {
    const oldLabel = document.getElementById("archive-corner-label");
    if (oldLabel) oldLabel.remove();
  }

  function resetAutoscrollForArchiveOpen() {
    window.OX500_ARCHIVE_MODE = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    y = 0;
    lastTs = null;
    scrollPausedByClick = false;
    pausedUntil = 0;
    isNavigating = false;
    stopArchiveTopLock();
    stopLiveStation();
    removeAgentOverlay();

    const mover = document.getElementById("logMover");
    if (mover) {
      mover.style.transform = "translateY(0)";
      mover.style.top = "0";
      mover.style.left = "0";
      mover.style.right = "0";
      mover.style.bottom = "auto";
      mover.style.marginTop = "0";
      mover.style.marginBottom = "0";
    }

    if (container) {
      container.classList.remove("autoscroll-active");
      container.scrollTop = 0;
    }
  }

  document.addEventListener("ox500:archive-open", () => {
    resetAutoscrollForArchiveOpen();
  });

  // Public hard reset hook for other modules (e.g. disruption archive open).
  window.OX500_HARD_RESET_ACTIVE_VIEW = function () {
    resetAutoscrollForArchiveOpen();
  };

  function updateButtons() {
    nextBtn.disabled = currentIndex <= 0;

    const atLoadedEnd = currentIndex >= logs.length - 1;
    const nextOlderPage = currentPage + olderPageStep;
    const archiveEnded =
      totalPages != null && (nextOlderPage < 1 || nextOlderPage > totalPages);
    prevBtn.disabled = atLoadedEnd && archiveEnded;
  }

  function updateRecentLogHighlight() {
    const active = logs[currentIndex];
    const activeId = String((active && active.id) || "");
    const activePath = normalizePath(active && active.url ? active.url : "");
    const items = document.querySelectorAll(".recent-logs a.log-line");

    items.forEach((link) => {
      link.classList.add("recent-log-item");
      const linkPath = normalizePath(link.getAttribute("href") || "");
      let isActive = !!(activePath && linkPath && linkPath === activePath);

      if (!isActive && activeId) {
        const idEl = link.querySelector(".log-id");
        const idText = (idEl && idEl.textContent) || "";
        const m = idText.match(/(\d+)/);
        if (m && m[1] === activeId) isActive = true;
      }

      link.dataset.prefix = isActive ? ">" : "";
    });
  }

  function userSelectedLog(index) {
    pausedUntil = Date.now() + USER_PAUSE_MS;
    currentIndex = index;
    renderLog();
  }

  function tickLiveStation() {
    if (Date.now() < pausedUntil) return;
    if (!logs.length || isNavigating) return;

    if (currentIndex < logs.length - 1) {
      currentIndex += 1;
      renderLog();
      return;
    }

    loadPreviousPageIfNeeded()
      .then((loaded) => {
        if (loaded && currentIndex < logs.length - 1) {
          currentIndex += 1;
          renderLog();
          return;
        }
        currentIndex = 0;
        renderLog();
      })
      .catch(() => {
        currentIndex = 0;
        renderLog();
      });
  }

  function startLiveStation() {
    if (window.OX500_ARCHIVE_MODE) return;
    if (liveInterval) return;
    liveInterval = window.setInterval(tickLiveStation, LIVE_ROTATE_MS);
  }

  function stopLiveStation() {
    if (!liveInterval) return;
    window.clearInterval(liveInterval);
    liveInterval = null;
  }

  function forceArchiveTop(panelBody) {
    const targets = [container, panelBody, document.scrollingElement].filter(Boolean);
    targets.forEach((el) => {
      if (typeof el.scrollTop === "number") el.scrollTop = 0;
    });
  }

  function stopArchiveTopLock() {
    archiveTopLockUntil = 0;
    if (archiveTopLockRaf) {
      cancelAnimationFrame(archiveTopLockRaf);
      archiveTopLockRaf = null;
    }
  }

  function startArchiveTopLock(panelBody, ms) {
    stopArchiveTopLock();
    archiveTopLockUntil = Date.now() + ms;

    const tick = () => {
      if (!container.classList.contains("archive-view")) {
        stopArchiveTopLock();
        return;
      }
      if (Date.now() >= archiveTopLockUntil) {
        stopArchiveTopLock();
        return;
      }
      forceArchiveTop(panelBody);
      archiveTopLockRaf = requestAnimationFrame(tick);
    };

    archiveTopLockRaf = requestAnimationFrame(tick);
  }

  function renderLog(options) {
    window.OX500_ARCHIVE_MODE = false;
    const opts = options || {};
    const pushHistory = opts.pushHistory !== false;
    const log = logs[currentIndex];
    if (!log) return;

    agentSpawned = false;
    loopCount = 0;
    document.body.dataset.logLevel = String(log.id || "");
    container.classList.remove("archive-view");
    container.classList.remove("d-archive-mode");
    stopArchiveTopLock();
    removeArchiveCornerLabel();
    container.removeAttribute("style");
    const containerBody = container.parentElement;
    const nav = containerBody ? containerBody.querySelector(".log-nav") : null;
    if (containerBody) {
      containerBody.classList.remove("d-archive-panel-mode");
      containerBody.removeAttribute("style");
    }
    if (nav) nav.style.removeProperty("display");

    container.innerHTML = `
      <div id="logMover">
        <div class="active-log-title">${escapeHtml(log.title || "")}</div>
        <div class="log-body">${escapeHtml(log.text || "").replace(/\n/g, "<br>")}</div>
      </div>
      <div id="agent-insert-point"></div>
    `;

    removeAgentOverlay();
    scrollPausedByClick = false;
    container.scrollTop = 0;

    if (activeId) activeId.textContent = `LOG ${log.id || ""}`;
    if (topbarLogStamp) {
      topbarLogStamp.innerHTML = `<b>LOG</b> ${escapeHtml(log.id || "")} ${escapeHtml(log.date || "")}`;
    }
    updateCanonicalForLog(log);
    if (pushHistory) pushHistoryForLog(log);
    updateButtons();
    updatePrevLogMemory();
    updateRecentLogHighlight();

    document.dispatchEvent(new CustomEvent("ox500:active-log-updated"));
    startAutoScroll();

    ensurePrefetchWindow();
  }

  function startAutoScroll() {
    if (window.OX500_ARCHIVE_MODE) return;
    const mover = document.getElementById("logMover");
    if (!mover) return;

    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    if (!wheelBound) {
      container.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
        },
        { passive: false }
      );
      wheelBound = true;
    }

    if (!clickPauseBound) {
      container.addEventListener("click", () => {
        scrollPausedByClick = !scrollPausedByClick;
      });
      clickPauseBound = true;
    }

    const prefersReduced =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const originalHTML = mover.dataset.originalHtml || mover.innerHTML;
    if (!mover.dataset.originalHtml) {
      mover.dataset.originalHtml = originalHTML;
      mover.innerHTML = originalHTML + originalHTML;
    }

    const resetStart = () => {
      y = 0;
      lastTs = null;
      mover.style.transform = `translateY(${y}px)`;
    };

    const frame = (ts) => {
      if (scrollPausedByClick) {
        lastTs = ts;
        rafId = requestAnimationFrame(frame);
        return;
      }
      if (lastTs == null) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      const speedPxPerSec = 45;
      y -= speedPxPerSec * dt;

      const half = mover.scrollHeight / 2;
      if (-y >= half) {
        y += half;
        loopCount += 1;
        if (loopCount >= 1) spawnAgent();
      }

      mover.style.transform = `translateY(${y}px)`;
      rafId = requestAnimationFrame(frame);
    };

    resetStart();
    rafId = requestAnimationFrame(frame);

    if (!resizeBound) {
      window.addEventListener("resize", resetStart, { passive: true });
      resizeBound = true;
    }

    if (!visibilityBound) {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          return;
        }
        if (!logs.length) return;
        startAutoScroll();
      });
      visibilityBound = true;
    }
  }

  async function goOlder() {
    if (isNavigating) return;
    isNavigating = true;
    try {
      if (currentIndex < logs.length - 1) {
        currentIndex += 1;
        renderLog();
        return;
      }

      const loaded = await loadPreviousPageIfNeeded();
      if (loaded && currentIndex < logs.length - 1) {
        currentIndex += 1;
        renderLog();
        return;
      }

      updateButtons();
    } finally {
      isNavigating = false;
    }
  }

  function goNewer() {
    if (isNavigating) return;
    isNavigating = true;
    try {
      if (currentIndex > 0) {
        currentIndex -= 1;
        renderLog();
      }
    } finally {
      isNavigating = false;
    }
  }

  nextBtn.addEventListener("click", goNewer);
  prevBtn.addEventListener("click", () => {
    goOlder().catch(() => {});
  });

  const recentLogsRoot = document.querySelector(".recent-logs");
  if (recentLogsRoot) {
    recentLogsRoot.querySelectorAll("a.log-line").forEach((link) => {
      link.classList.add("recent-log-item");
    });
    recentLogsRoot.addEventListener("click", (e) => {
      const target = e.target;
      const link = target && target.closest ? target.closest("a.log-line") : null;
      if (!link) return;

      let idx = -1;

      const href = link.getAttribute("href") || "";
      if (href && logs.length) {
        const clickedPath = new URL(href, window.location.origin).pathname;
        idx = logs.findIndex((l) => {
          const url = l && l.url ? new URL(l.url, window.location.origin).pathname : "";
          return url === clickedPath;
        });
      }

      if (idx < 0) {
        const idEl = link.querySelector(".log-id");
        const idText = (idEl && idEl.textContent) || "";
        const m = idText.match(/(\d+)/);
        if (m) idx = findLogIndexById(m[1]);
      }

      if (idx < 0) return;
      e.preventDefault();
      userSelectedLog(idx);
    });
  }

  if (
    openDisruptionIndex &&
    disruptionIndexTemplate &&
    !window.OX500_DISABLE_LEGACY_DISRUPTION_INDEX
  ) {
    openDisruptionIndex.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      scrollPausedByClick = false;
      container.classList.add("archive-view");
      const panelBody = container.parentElement;
      const nav = panelBody ? panelBody.querySelector(".log-nav") : null;
      if (nav) nav.style.setProperty("display", "none", "important");
      container.style.setProperty("display", "flex", "important");
      container.style.setProperty("flex-direction", "column", "important");
      container.style.setProperty("position", "relative", "important");
      container.style.setProperty("overflow-y", "hidden", "important");
      container.style.setProperty("overflow-x", "hidden", "important");
      container.style.setProperty("height", "100%", "important");
      container.style.setProperty("min-height", "0", "important");
      container.style.setProperty("padding-top", "0", "important");
      container.style.setProperty("padding-bottom", "0", "important");
      container.style.setProperty("margin-top", "0", "important");
      container.style.setProperty("align-items", "stretch", "important");
      container.style.setProperty("justify-content", "flex-start", "important");
      container.style.setProperty("align-content", "flex-start", "important");
      container.style.setProperty("transform", "none", "important");
      container.style.setProperty("scroll-behavior", "auto", "important");
      let indexHtml = (disruptionIndexTemplate.innerHTML || "").trim();
      const tmp = document.createElement("div");
      tmp.innerHTML = indexHtml;
      let links = Array.from(tmp.querySelectorAll("a.log-line"));
      if (!links.length) {
        links = Array.from(
          document.querySelectorAll("#disruptionNodesPanel a.log-line:not(#openDisruptionIndex)")
        );
      }
      const normalizedLinks = links
        .map((a) => {
          const href = a.getAttribute("href") || "#";
          const body = a.innerHTML || a.textContent || "";
          return `<a class="log-line" href="${href}">${body}</a>`;
        })
        .join("");

      container.innerHTML = `<div id="agent-insert-point"></div>`;
      removeArchiveCornerLabel();
      if (panelBody) {
        panelBody.style.setProperty("position", "relative", "important");
        const label = document.createElement("div");
        label.id = "archive-corner-label";
        label.innerHTML = `
          <div class="archive-heading">DISRUPTION ARCHIVE</div>
          <div class="archive-list">${normalizedLinks}</div>
        `;
        label.style.setProperty("position", "absolute", "important");
        label.style.setProperty("left", "12px", "important");
        label.style.setProperty("top", "44px", "important");
        label.style.setProperty("bottom", "auto", "important");
        label.style.setProperty("z-index", "4", "important");
        label.style.setProperty("font-family", "var(--mono)", "important");
        label.style.setProperty("font-size", "13px", "important");
        label.style.setProperty("line-height", "1.5", "important");
        label.style.setProperty("letter-spacing", ".12em", "important");
        label.style.setProperty("font-weight", "500", "important");
        label.style.setProperty("text-transform", "uppercase", "important");
        label.style.setProperty("color", "rgba(185,214,223,.78)", "important");
        label.style.setProperty("max-height", "none", "important");
        label.style.setProperty("overflow", "visible", "important");
        label.style.setProperty("padding-right", "0", "important");
        label.style.setProperty("min-width", "320px", "important");
        panelBody.appendChild(label);
        const heading = label.querySelector(".archive-heading");
        const list = label.querySelector(".archive-list");
        if (list) {
          list.style.display = "grid";
          list.style.gridTemplateColumns = "1fr";
          list.style.gap = "6px 18px";
          list.style.alignContent = "start";
          const linksInList = Array.from(list.querySelectorAll("a.log-line"));
          linksInList.forEach((a) => {
            a.style.display = "block";
            a.style.breakInside = "avoid";
          });
          const headingH = heading ? heading.getBoundingClientRect().height : 0;
          const available = Math.max(0, panelBody.clientHeight - 44 - headingH - 16);
          if (list.scrollHeight > available) {
            list.style.gridTemplateColumns = "1fr 1fr";
          }
        }
      }
      forceArchiveTop(panelBody);
      requestAnimationFrame(() => {
        forceArchiveTop(panelBody);
        requestAnimationFrame(() => {
          forceArchiveTop(panelBody);
          setTimeout(() => forceArchiveTop(panelBody), 30);
        });
      });
      startArchiveTopLock(panelBody, 600);
      const stopOnUserInput = () => stopArchiveTopLock();
      container.addEventListener("wheel", stopOnUserInput, { once: true, passive: true });
      container.addEventListener("touchstart", stopOnUserInput, { once: true, passive: true });
      container.addEventListener("keydown", stopOnUserInput, { once: true });
      if (activeId) activeId.textContent = "INDEX";
      if (topbarLogStamp) {
        topbarLogStamp.innerHTML = `<b>NODE</b> DISRUPTION INDEX`;
      }
      document.dispatchEvent(new CustomEvent("ox500:active-log-updated"));
    });
  }

  applyRecentLogsFixedTruncation();
  if (!recentLogsResizeBound) {
    window.addEventListener("resize", applyRecentLogsFixedTruncation, { passive: true });
    recentLogsResizeBound = true;
  }

  if (!popstateBound) {
    window.addEventListener("popstate", () => {
      const stateId = history.state && history.state.logId;
      const idx = stateId ? findLogIndexById(stateId) : -1;
      if (idx >= 0) {
        currentIndex = idx;
        renderLog({ pushHistory: false });
        return;
      }
      window.location.href = window.location.pathname;
    });
    popstateBound = true;
  }

  fetchPagedJson("logs-pages-meta.json")
    .then((meta) => {
      if (!meta) throw new Error("meta fetch failed");
      totalPages = Number(meta && meta.total_pages) || 0;
      if (totalPages < 1) return { newestPage: 0, newestPageLogs: [] };
      return Promise.all([
        fetchPage(1),
        totalPages === 1 ? Promise.resolve([]) : fetchPage(totalPages),
      ]).then(([pageOneLogs, pageLastLogs]) => {
        const pageOneMaxId = getMaxLogId(pageOneLogs);
        const pageLastMaxId = getMaxLogId(pageLastLogs);
        const pageOneIsNewest = pageOneMaxId >= pageLastMaxId;
        olderPageStep = pageOneIsNewest ? 1 : -1;
        return {
          newestPage: pageOneIsNewest ? 1 : totalPages,
          newestPageLogs: pageOneIsNewest ? pageOneLogs : pageLastLogs,
        };
      });
    })
    .then(({ newestPage, newestPageLogs }) => {
      console.info("INIT newestPage:", newestPage);
      if (newestPage < 1) return [];
      currentPage = newestPage;
      logs = sortLogsNewestFirst(newestPageLogs);
      // Keep only the actually loaded page marked as prefetched.
      // The orientation probe may touch another page, but it is not merged into `logs` yet.
      prefetchedPages = new Set([newestPage]);
      currentIndex = 0;
      console.info("Loaded logs:", logs.length);
      console.info("Current log ID:", logs[0] && logs[0].id);
      if (!logs.length) {
        updateButtons();
        return;
      }
      renderLog();
      startLiveStation();
    })
    .catch(() => {
      logs = [];
      updateButtons();
      stopLiveStation();
    });
})();

// Clean-room mode for disruption archive: replace ACTIVE_VIEW container on demand.
(function () {
  if (window.__OX500_CLEAN_ARCHIVE_ROOM__) return;
  window.__OX500_CLEAN_ARCHIVE_ROOM__ = true;

  function getPanelBody() {
    return (
      document.querySelector("#indexLogPanel .bd.scroll.log-text") ||
      document.querySelector("#indexLogPanel .bd")
    );
  }

  function hardResetPanelBody(panelBody) {
    if (!panelBody) return;
    panelBody.scrollTop = 0;
    panelBody.style.display = "block";
    panelBody.style.alignItems = "flex-start";
    panelBody.style.justifyContent = "flex-start";
    panelBody.style.paddingTop = "0px";
    panelBody.style.marginTop = "0px";
  }

  function enforceTopLeft(root) {
    if (!root) return;
    root.scrollTop = 0;
    root.style.display = "block";
    root.style.position = "relative";
    root.style.top = "0px";
    root.style.left = "0px";
    root.style.right = "auto";
    root.style.bottom = "auto";
    root.style.margin = "0";
    root.style.padding = "0";
    root.style.transform = "none";
    root.style.overflowY = "auto";
    root.style.overflowX = "hidden";

    const nodes = root.querySelectorAll("*");
    for (const el of nodes) {
      el.style.transform = "none";
      if (
        el.id === "logMover" ||
        el.classList.contains("archive-mover") ||
        el.classList.contains("d-archive-shell")
      ) {
        el.style.position = "relative";
        el.style.top = "0px";
        el.style.left = "0px";
        el.style.right = "auto";
        el.style.bottom = "auto";
        el.style.margin = "0";
        el.style.paddingTop = "0px";
        el.style.transform = "none";
        el.style.width = "100%";
      }
    }
  }

  function remountArchiveAtRoot(root) {
    if (!root) return;

    // Prefer new disruption archive renderer node.
    let archiveNode =
      root.querySelector(".d-archive-shell") ||
      root.querySelector(".archive-mover");
    if (!archiveNode) return;

    // If archive is nested under transformed wrappers (e.g. #logMover),
    // move it directly under #active-log-container.
    if (archiveNode.parentElement !== root) {
      const mount = document.createElement("div");
      mount.className = "ox-archive-clean-root";
      mount.style.position = "relative";
      mount.style.top = "0px";
      mount.style.left = "0px";
      mount.style.margin = "0";
      mount.style.padding = "0";
      mount.style.transform = "none";
      mount.style.width = "100%";

      archiveNode.parentElement && archiveNode.parentElement.removeChild(archiveNode);
      mount.appendChild(archiveNode);

      root.innerHTML = "";
      root.appendChild(mount);
    }
  }

  function replaceActiveViewContainer() {
    // Keep the same DOM node instance; other modules may hold references to it.
    const root = document.getElementById("active-log-container");
    if (!root) return null;
    root.scrollTop = 0;
    root.removeAttribute("style");
    return root;
  }

  function activateCleanArchiveRoom() {
    window.OX500_DISABLE_LEGACY_DISRUPTION_INDEX = true;
    window.OX500_ARCHIVE_MODE = true;

    const panelBody = getPanelBody();
    hardResetPanelBody(panelBody);

    const root = replaceActiveViewContainer();
    if (!root) return;
    remountArchiveAtRoot(root);
    enforceTopLeft(root);

    // For late render/autoscroll callbacks: keep forcing top-left briefly.
    const started = Date.now();
    const obs = new MutationObserver(function () {
      hardResetPanelBody(panelBody);
      remountArchiveAtRoot(root);
      enforceTopLeft(root);
      if (Date.now() - started > 2500) {
        obs.disconnect();
      }
    });
    obs.observe(root, { childList: true, subtree: true });

    for (let i = 0; i < 60; i += 1) {
      setTimeout(function () {
        hardResetPanelBody(panelBody);
        remountArchiveAtRoot(root);
        enforceTopLeft(root);
      }, i * 40);
    }
  }

  document.addEventListener(
    "click",
    function (ev) {
      const trigger = ev.target && ev.target.closest ? ev.target.closest("a,button") : null;
      if (!trigger) return;
      const txt = (trigger.textContent || "").toUpperCase();
      if (txt.includes("OPEN DISRUPTION INDEX") || txt.includes("DISRUPTION INDEX")) {
        activateCleanArchiveRoom();
      }
    },
    true
  );
})();
// Hard runtime fix: force ACTIVE_VIEW archive content to top-left when disruption archive is visible.
(function () {
  if (window.__OX500_ARCHIVE_TOPLEFT_FIX__) return;
  window.__OX500_ARCHIVE_TOPLEFT_FIX__ = true;

  function forceTopLeft() {
    const heading = Array.from(document.querySelectorAll("*")).find((el) => {
      const t = (el.textContent || "").trim().toUpperCase();
      return t === "DISRUPTION ARCHIVE";
    });
    if (!heading) return;

    const panelBody =
      heading.closest("#indexLogPanel .bd") ||
      document.querySelector("#indexLogPanel .bd.scroll.log-text") ||
      document.querySelector("#indexLogPanel .bd");

    if (panelBody) {
      panelBody.scrollTop = 0;
      panelBody.style.display = "block";
      panelBody.style.alignItems = "flex-start";
      panelBody.style.justifyContent = "flex-start";
      panelBody.style.paddingTop = "0px";
      panelBody.style.marginTop = "0px";
    }

    // Reset the heading chain (up to ACTIVE_VIEW body) to remove autoscroll offsets.
    let node = heading;
    for (let i = 0; i < 10 && node; i += 1) {
      node.style.position = "relative";
      node.style.top = "0px";
      node.style.left = "0px";
      node.style.right = "auto";
      node.style.bottom = "auto";
      node.style.marginTop = "0px";
      node.style.paddingTop = "0px";
      node.style.transform = "none";
      node = node.parentElement;
      if (node && node.id === "indexLogPanel") break;
    }

    const activeContainer =
      heading.closest("#active-log-container") || document.getElementById("active-log-container");
    if (activeContainer) {
      activeContainer.scrollTop = 0;
      activeContainer.style.position = "relative";
      activeContainer.style.top = "0px";
      activeContainer.style.left = "0px";
      activeContainer.style.right = "auto";
      activeContainer.style.bottom = "auto";
      activeContainer.style.margin = "0";
      activeContainer.style.padding = "0";
      activeContainer.style.transform = "none";
      activeContainer.style.overflowY = "auto";
      activeContainer.style.overflowX = "hidden";
    }
  }

  function scheduleForceTopLeft() {
    for (let i = 0; i < 28; i += 1) {
      setTimeout(forceTopLeft, i * 35);
    }
  }

  document.addEventListener(
    "click",
    function (ev) {
      const trigger = ev.target && ev.target.closest ? ev.target.closest("a,button") : null;
      if (!trigger) return;
      const txt = (trigger.textContent || "").toUpperCase();
      if (txt.includes("OPEN DISRUPTION INDEX") || txt.includes("DISRUPTION INDEX")) {
        scheduleForceTopLeft();
      }
    },
    true
  );

  const obs = new MutationObserver(function () {
    if (document.body && document.body.textContent && document.body.textContent.toUpperCase().includes("DISRUPTION ARCHIVE")) {
      scheduleForceTopLeft();
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
