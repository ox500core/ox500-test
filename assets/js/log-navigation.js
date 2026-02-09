(function () {
  const container = document.getElementById("active-log-container");
  const nextBtn = document.getElementById("next-log");
  const prevBtn = document.getElementById("prev-log");
  const activeId = document.getElementById("activeLogId");
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

  let isInitialLogRender = true;
  let y = 0;
  let lastTs = null;
  let loopCount = 0;
  let agentSpawned = false;
  let rafId = null;
  let resizeBound = false;
  let wheelBound = false;
  let visibilityBound = false;
  let recentLogsResizeBound = false;

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
    const res = await fetch(url, { cache: "force-cache" });
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

    if (prefetchInProgress) return;
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

  function updateButtons() {
    nextBtn.disabled = currentIndex <= 0;

    const atLoadedEnd = currentIndex >= logs.length - 1;
    const nextOlderPage = currentPage + olderPageStep;
    const archiveEnded =
      totalPages != null && (nextOlderPage < 1 || nextOlderPage > totalPages);
    prevBtn.disabled = atLoadedEnd && archiveEnded;
  }

  function renderLog() {
    const log = logs[currentIndex];
    if (!log) return;

    agentSpawned = false;
    loopCount = 0;
    document.body.dataset.logLevel = String(log.id || "");

    container.innerHTML = `
      <div id="logMover">
        <div class="log-body">${escapeHtml(log.text || "").replace(/\n/g, "<br>")}</div>
      </div>
      <div id="agent-insert-point"></div>
    `;

    removeAgentOverlay();
    container.scrollTop = 0;

    if (activeId) activeId.textContent = `LOG ${log.id || ""}`;
    updateButtons();
    updatePrevLogMemory();

    document.dispatchEvent(new CustomEvent("ox500:active-log-updated"));
    startAutoScroll(isInitialLogRender);
    isInitialLogRender = false;

    ensurePrefetchWindow();
  }

  function startAutoScroll(initialFromBottom) {
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

    const prefersReduced =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const originalHTML = mover.dataset.originalHtml || mover.innerHTML;
    if (!mover.dataset.originalHtml) {
      mover.dataset.originalHtml = originalHTML;
      mover.innerHTML = originalHTML + originalHTML;
    }

    const resetStart = () => {
      const h = container.getBoundingClientRect().height;
      y = initialFromBottom ? h + 2 : Math.round(h * 0.66);
      lastTs = null;
      mover.style.transform = `translateY(${y}px)`;
    };

    const frame = (ts) => {
      if (lastTs == null) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      const speedPxPerSec = 45;
      y -= speedPxPerSec * dt;

      const half = mover.scrollHeight / 2;
      if (-y >= half) {
        y += half;
        loopCount += 1;
        if (loopCount >= 2) spawnAgent();
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
        startAutoScroll(false);
      });
      visibilityBound = true;
    }
  }

  async function goOlder() {
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
  }

  function goNewer() {
    if (currentIndex > 0) {
      currentIndex -= 1;
      renderLog();
    }
  }

  nextBtn.addEventListener("click", goNewer);
  prevBtn.addEventListener("click", () => {
    goOlder().catch(() => {});
  });

  applyRecentLogsFixedTruncation();
  if (!recentLogsResizeBound) {
    window.addEventListener("resize", applyRecentLogsFixedTruncation, { passive: true });
    recentLogsResizeBound = true;
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
      currentIndex = 0;
      console.info("Loaded logs:", logs.length);
      console.info("Current log ID:", logs[0] && logs[0].id);
      if (!logs.length) {
        updateButtons();
        return;
      }
      renderLog();
    })
    .catch(() => {
      logs = [];
      updateButtons();
    });
})();
