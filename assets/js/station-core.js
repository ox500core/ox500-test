(function () {
  window.addEventListener("load", () => {
    setTimeout(() => {
      const bootLayer = document.getElementById("boot-layer");
      if (!bootLayer) return;
      bootLayer.style.opacity = "0";
      setTimeout(() => bootLayer.remove(), 300);
    }, 400);
  });

  window.OX500_NEXT_LOG_STATIC = "04:12:33";
  const nextLogCountdown = document.getElementById("nextLogCountdown");
  if (nextLogCountdown) nextLogCountdown.textContent = window.OX500_NEXT_LOG_STATIC;

  const prefersReduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const staticHomeHero = document.body && document.body.dataset.layout === "home";

  const $ = (id) => document.getElementById(id);
  const clock = $("clock");
  const avail = $("avail");
  const hero = $("hero");
  const title = $("title");
  const status = $("status");

  const feedEls = [$("feed1"), $("feed2"), $("feed3")].filter(Boolean);

  const FEED_DEFAULT = [
    "PROC_KILL: 0xA42F... TERMINATED",
    "MEM_LEAK: SECTOR 0x7B... CRITICAL",
    "AUTH_FAIL: USER_UNKNOWN",
    "DISK_ERR: BLOCK 2847 UNREADABLE",
    "NET_TIMEOUT: CONN_LOST",
    "SYS_WARN: THERMAL THRESHOLD",
    "DATA_CORRUPT: CRC MISMATCH",
    "PERM_DENIED: ACCESS VIOLATION",
    "STACK_OVERFLOW: 0x4F2A...",
    "NULL_PTR: SEGFAULT",
    "WATCHDOG: RESET IMMINENT",
    "I/O_ERROR: DEVICE NOT READY",
    "CACHE_MISS: PIPELINE STALL",
    "PRIORITY_INVERSION: DEADLOCK",
    "BUFFER_OVERRUN: 0x9C1E...",
    "SIGNAL_11: TERMINATED",
    "PAGE_FAULT: 0x0000...",
    "INIT_FAIL: MODULE CORRUPT",
    "CHECKSUM_ERR: DATA INVALID",
    "FIRMWARE_MISMATCH: ABORT",
  ];

  const FEED_KEYWORDS = ["PROCEED", "DENIED", "OBEY", "IRREVERSIBLE"];
  let feedPool = FEED_DEFAULT.slice();

  const WHISPERS = [
    "i can feel you watching",
    "this wasn't meant for you",
    "every click leaves a trace",
    "you shouldn't be seeing this",
    "unauthorized presence detected",
    "this terminal is watching back",
  ];

  let feedTimer = null;
  let glitchTimer = null;

  function scheduleFeed(delayMs) {
    if (feedTimer) clearTimeout(feedTimer);
    feedTimer = setTimeout(pushFeed, delayMs);
  }

  function scheduleGlitch(delayMs) {
    if (glitchTimer) clearTimeout(glitchTimer);
    glitchTimer = setTimeout(doGlitch, delayMs);
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function deriveFeedKeywordsFromPage() {
    const raw = (document.body.textContent || "").toUpperCase();
    const found = new Set();

    FEED_KEYWORDS.forEach((kw) => {
      if (raw.includes(kw)) found.add(kw);
    });

    const upperWords = raw.match(/\b[A-Z]{3,}\b/g) || [];
    upperWords.forEach((w) => {
      if (w.length <= 24) found.add(w);
    });

    return Array.from(found).slice(0, 24).map((kw) => "KEYWORD: " + kw);
  }

  function refreshFeedPool() {
    const derived = deriveFeedKeywordsFromPage();
    feedPool = derived.length ? derived : FEED_DEFAULT.slice();
  }

  function buildLogsJsonCandidates() {
    const candidates = [];
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    candidates.push(new URL("/logs.json", window.location.origin).href);
    candidates.push(new URL("logs.json", window.location.href).href);
    for (let i = 0; i < pathParts.length; i += 1) {
      candidates.push(new URL(`${"../".repeat(i + 1)}logs.json`, window.location.href).href);
    }
    return [...new Set(candidates)];
  }

  function buildDataCandidates(fileName) {
    const candidates = [];
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    candidates.push(new URL(`/data/${fileName}`, window.location.origin).href);
    candidates.push(new URL(`data/${fileName}`, window.location.href).href);
    for (let i = 0; i < pathParts.length; i += 1) {
      candidates.push(new URL(`${"../".repeat(i + 1)}data/${fileName}`, window.location.href).href);
    }
    return [...new Set(candidates)];
  }

  async function fetchLogsJson() {
    for (const url of buildLogsJsonCandidates()) {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) continue;
        const json = await res.json();
        if (json && Array.isArray(json.logs)) return json;
      } catch (_) {}
    }
    return null;
  }

  async function fetchJsonFromCandidates(candidates) {
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) continue;
        return await res.json();
      } catch (_) {}
    }
    return null;
  }

  async function fetchLogsPagesMeta() {
    return await fetchJsonFromCandidates(buildDataCandidates("logs-pages-meta.json"));
  }

  async function fetchLogsPage(pageNum) {
    if (!pageNum || pageNum < 1) return null;
    const page = await fetchJsonFromCandidates(buildDataCandidates(`logs-page-${pageNum}.json`));
    return Array.isArray(page) ? page : null;
  }

  function tick() {
    if (document.hidden) return;

    const d = new Date();
    if (clock) clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    if (avail && !prefersReduced && Math.random() > 0.92) {
      let v = parseInt(avail.textContent, 10) || 565;
      v += (Math.random() > 0.5 ? 1 : -1) * (1 + Math.floor(Math.random() * 2));
      v = Math.max(120, Math.min(9999, v));
      avail.textContent = String(v).padStart(4, "0");
    }
  }
  tick();
  setInterval(tick, 1000);

  let feedIdx = 0;
  function pushFeed() {
    if (document.hidden) {
      scheduleFeed(3000);
      return;
    }
    if (!feedEls.length) return;

    const msg = feedPool[Math.floor(Math.random() * feedPool.length)];
    const target = feedEls[feedIdx % feedEls.length];
    const d = new Date();
    const stamp = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    target.textContent = `[${stamp}] ${msg}`;
    feedIdx += 1;
    scheduleFeed(6500 + Math.random() * 6500);
  }
  refreshFeedPool();
  scheduleFeed(1800);

  async function updateSysVersionPill() {
    let sysVer = "";
    const json = await fetchLogsJson();
    if (json && json.system && json.system.sys_ver) {
      sysVer = String(json.system.sys_ver).trim();
    }
    if (!sysVer) return;

    const sysVerEl = document.getElementById("sysVer");
    if (sysVerEl) {
      sysVerEl.textContent = sysVer;
      return;
    }
    const sysPill = document.querySelector(".topbar .right .pill");
    if (sysPill && /^SYS\s+/i.test((sysPill.textContent || "").trim())) {
      sysPill.textContent = `SYS ${sysVer}`;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toLogHtml(rawText) {
    const normalized = String(rawText || "").replace(/\r\n/g, "\n");
    const blocks = normalized
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);

    const paragraphs = (blocks.length ? blocks : [normalized])
      .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
      .join("");

    return paragraphs || "<p></p>";
  }

  function deriveMobileDisruptionTitle(entry) {
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

  function setupHomeMobileSwipeLogs() {
    if (!staticHomeHero || !window.matchMedia) return;

    const mobileQuery = window.matchMedia("(max-width: 980px)");
    const panel = document.getElementById("activeViewPanel");
    const textEl = panel ? panel.querySelector(".bd.log-text") : null;
    const stampEl = document.getElementById("topbarLogStamp");
    const prevBtn = document.getElementById("mobilePrevLogBtn");
    const nextBtn = document.getElementById("mobileNextLogBtn");
    if (!panel || !textEl || !stampEl) return;

    let logs = [];
    let orderedIds = [];
    let logsById = new Map();
    let totalPages = 0;
    const loadedPages = new Set();
    const loadingPages = new Set();
    const pagePayloads = new Map();
    let loaded = false;
    let loading = false;
    let currentEntryId = "";

    let startX = 0;
    let startY = 0;
    let startAt = 0;
    let trackingTouch = false;

    const SWIPE_MIN_X = 50;
    const SWIPE_MAX_Y = 70;
    const SWIPE_MAX_MS = 700;
    const TAP_MAX_MOVE = 14;
    const TAP_MAX_MS = 450;

    function normalizeId(id) {
      return String(id || "").replace(/\D/g, "");
    }

    function resolveCurrentIndex() {
      const bodyId = normalizeId(document.body && document.body.dataset.logLevel);
      const stampMatch = (stampEl.textContent || "").match(/\d{5}/);
      const stampId = normalizeId(stampMatch ? stampMatch[0] : "");
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
      const merged = [];
      const pages = Array.from(loadedPages).sort((a, b) => a - b);
      pages.forEach((pageNum) => {
        const part = pagePayloads.get(pageNum);
        if (Array.isArray(part) && part.length) merged.push(...part);
      });

      logs = merged
        .slice()
        .sort((a, b) => Number(normalizeId(a.id)) - Number(normalizeId(b.id)));
      logsById = new Map(logs.map((entry) => [normalizeId(entry.id), entry]));
      orderedIds = logs.map((entry) => normalizeId(entry.id));
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

      // User is approaching older logs boundary -> prefetch next (older) page.
      if (idx <= 10) {
        const nextOlderPage = maxLoadedPage() + 1;
        if (nextOlderPage <= totalPages) {
          loadPage(nextOlderPage);
        }
      }

      // User is approaching newer logs boundary -> prefetch previous (newer) page.
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
      const rawSeries = String((entry && (entry.series || entry.disruption)) || "").trim();
      let title = rawSeries;
      title = title.replace(/^DISRUPTION(?:_SERIES)?\s*\/\/\s*/i, "").trim();
      title = title.replace(/^SERIES\s*\/\/\s*/i, "").trim();
      title = title.replace(/^DISRUPTION\s*\/\s*/i, "").trim();
      return title.toUpperCase();
    }

    function getCurrentEntry() {
      const currentId = normalizeId(currentEntryId) || orderedIds[resolveCurrentIndex()];
      return currentId ? logsById.get(currentId) : null;
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
        .sort((a, b) => Number(normalizeId(b.id)) - Number(normalizeId(a.id)));

      if (!list.length) return;

      const listHtml = list
        .map((item) => {
          const id = normalizeId(item.id);
          const title = deriveMobileLogEntryTitle(item);
          const href = String(item.url || "#");
          return (
            `<a class="log-line mobile-disruption-item" data-log-id="${escapeHtml(id)}" href="${escapeHtml(href)}">` +
            `<span class="log-id">LOG ${escapeHtml(id)}</span>` +
            `<span class="log-tag">${escapeHtml(title)}</span>` +
            `</a>`
          );
        })
        .join("");

      const titleActionAttrs = mobileQuery.matches
        ? `data-open-disruption-list="1" role="button" tabindex="0"`
        : "";
      const titleActionHtml = mobileQuery.matches
        ? `<span class="mobile-active-log-name">${escapeHtml(nodeTitle)}</span>`
        : `<a class="mobile-active-log-link" data-open-disruption-list="1" href="#">${escapeHtml(nodeTitle)}</a>`;

      textEl.dataset.viewMode = "disruption-list";
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
      const bodyHtml = toLogHtml(entry && entry.text ? entry.text : "");
      const cleanTitle = deriveMobileDisruptionTitle(entry);
      const cleanLogTitle = deriveMobileLogEntryTitle(entry);
      const titleActionAttrs = mobileQuery.matches
        ? `data-open-disruption-list="1" role="button" tabindex="0"`
        : "";
      const titleActionHtml = mobileQuery.matches
        ? `<span class="mobile-active-log-name">${escapeHtml(cleanTitle)}</span>`
        : `<a class="mobile-active-log-link" data-open-disruption-list="1" href="#">${escapeHtml(cleanTitle)}</a>`;
      const titleHtml =
        `<div class="mobile-active-log-title" ${titleActionAttrs}>` +
        `<span class="mobile-active-log-prefix">DISRUPTION //</span> ` +
        titleActionHtml +
        `<div class="mobile-active-log-entry">//${escapeHtml(cleanLogTitle)}</div>` +
        `</div>`;
      textEl.dataset.viewMode = "entry";
      textEl.innerHTML = titleHtml + bodyHtml;
      setLogStamp(stampEl, entry && entry.id ? entry.id : "----", entry && entry.date ? entry.date : "----");
      currentEntryId = normalizeId(entry && entry.id ? entry.id : "");
      if (document.body) {
        document.body.dataset.logLevel = normalizeId(entry && entry.id ? entry.id : "");
      }
      updateControls();
      maybePrefetchAroundCurrent();
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
        const meta = await fetchLogsPagesMeta();
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

        const json = await fetchLogsJson();
        if (!json || !Array.isArray(json.logs) || !json.logs.length) return;
        logs = json.logs
          .slice()
          .sort((a, b) => Number(normalizeId(a.id)) - Number(normalizeId(b.id)));
        logsById = new Map(logs.map((entry) => [normalizeId(entry.id), entry]));
        orderedIds = logs.map((entry) => normalizeId(entry.id));
        loaded = true;
        if (loaded) {
          const currentId = orderedIds[resolveCurrentIndex()];
          if (currentId) renderEntry(logsById.get(currentId));
        }
        updateControls();
        maybePrefetchAroundCurrent();
      } finally {
        loading = false;
      }
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

      if (textEl.dataset.viewMode === "disruption-list") {
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
      const logId = normalizeId(item.getAttribute("data-log-id"));
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

  function lockAvailableFromBuild() {
    const availEl = document.getElementById("avail");
    if (!availEl) return;
    const buildValue = (availEl.textContent || "").trim();
    if (!buildValue) return;

    const enforce = () => {
      if ((availEl.textContent || "").trim() !== buildValue) {
        availEl.textContent = buildValue;
      }
    };

    enforce();
    const observer = new MutationObserver(enforce);
    observer.observe(availEl, { childList: true, characterData: true, subtree: true });
  }

  lockAvailableFromBuild();
  updateSysVersionPill();
  setupHomeMobileSwipeLogs();

  document.querySelectorAll(".btn[data-tab]").forEach((btn) => {
    btn.addEventListener(
      "click",
      () => {
        document.querySelectorAll(".btn[data-tab]").forEach((b) => b.classList.remove("primary"));
        btn.classList.add("primary");
      },
      { passive: true }
    );
  });

  let whisperLock = false;
  function doGlitch() {
    if (document.hidden) {
      scheduleGlitch(3000);
      return;
    }
    if (staticHomeHero) return;
    if (prefersReduced || !hero || !title || !status) return;

    const r = Math.random();
    if (r > 0.995) {
      hero.classList.add("glitch-invert");
      setTimeout(() => hero.classList.remove("glitch-invert"), 55);
    }
    if (r > 0.989) {
      title.classList.add("glitch-shift");
      setTimeout(() => title.classList.remove("glitch-shift"), 90);
    }
    if (!whisperLock && r > 0.993) {
      whisperLock = true;
      const text = WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
      const original = status.innerHTML;
      status.innerHTML = `<div class="line"><span class="key">WHISPER:</span> <span class="val">${text}</span></div>`;
      status.classList.add("glitch-dim");
      setTimeout(() => {
        status.innerHTML = original;
        status.classList.remove("glitch-dim");
        setTimeout(() => {
          whisperLock = false;
        }, 60000);
      }, 9000 + Math.random() * 5000);
    }
    scheduleGlitch(1200 + Math.random() * 3000);
  }

  if (!prefersReduced && hero && title && status) {
    if (!staticHomeHero) scheduleGlitch(2200);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (feedTimer) {
        clearTimeout(feedTimer);
        feedTimer = null;
      }
      if (glitchTimer) {
        clearTimeout(glitchTimer);
        glitchTimer = null;
      }
      return;
    }

    tick();
    if (!feedTimer) scheduleFeed(800);
    if (!prefersReduced && hero && title && status && !glitchTimer && !staticHomeHero) scheduleGlitch(1400);
  });
})();
