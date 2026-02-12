(function () {
  const container = document.getElementById("active-log-container");
  let openDisruptionIndex = document.getElementById("openDisruptionIndex");
  const disruptionIndexTemplate = document.getElementById("disruptionIndexTemplate");
  const prevBtnGlobal = document.getElementById("prev-log");
  const nextBtnGlobal = document.getElementById("next-log");
  const activeLogId = document.getElementById("activeLogId");

  if (!container || !openDisruptionIndex) return;

  const openClone = openDisruptionIndex.cloneNode(true);
  openDisruptionIndex.parentNode.replaceChild(openClone, openDisruptionIndex);
  openDisruptionIndex = openClone;

  const state = {
    allItems: [],
    loaded: false,
    page: 1,
    itemsPerPage: 1,
    totalPages: 1,
    archiveMode: false,
    resizeTicking: false,
    topLockRaf: null,
  };
  window.OX500_ARCHIVE_MODE = false;

  const esc = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  async function fetchJson(fileName) {
    const res = await fetch(`/data/${fileName}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${fileName}`);
    return res.json();
  }

  function dedupeByUrl(items) {
    const out = [];
    const seen = new Set();
    for (const item of items || []) {
      const key = String((item && item.url) || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  async function loadAllDisruptions() {
    if (state.loaded) return;
    let all = [];
    try {
      const meta = await fetchJson("disruptions-pages-meta.json");
      const total = Math.max(1, Number(meta.total_pages || 1));
      const reqs = [];
      for (let i = 1; i <= total; i += 1) reqs.push(fetchJson(`disruptions-page-${i}.json`));
      const chunks = await Promise.all(reqs);
      chunks.forEach((chunk) => {
        if (Array.isArray(chunk)) all = all.concat(chunk);
      });
    } catch (_err) {
      let i = 1;
      while (i <= 500) {
        try {
          const chunk = await fetchJson(`disruptions-page-${i}.json`);
          if (!Array.isArray(chunk) || chunk.length === 0) break;
          all = all.concat(chunk);
          i += 1;
        } catch (_err2) {
          break;
        }
      }
    }
    state.allItems = dedupeByUrl(all);
    state.loaded = true;
  }

  function buildArchiveShell() {
    // Tell log-navigation to fully stop/reset autoscroll state.
    window.OX500_ARCHIVE_MODE = true;
    if (typeof window.OX500_HARD_RESET_ACTIVE_VIEW === "function") {
      window.OX500_HARD_RESET_ACTIVE_VIEW();
    }
    document.dispatchEvent(new CustomEvent("ox500:archive-open"));

    container.classList.remove("archive-view");
    container.classList.add("d-archive-mode");
    const panelBody = container.parentElement;
    const setImportant = (el, prop, value) => {
      if (!el) return;
      el.style.setProperty(prop, value, "important");
    };
    if (panelBody) {
      panelBody.classList.add("d-archive-panel-mode");
      setImportant(panelBody, "display", "block");
      setImportant(panelBody, "align-items", "stretch");
      setImportant(panelBody, "justify-content", "flex-start");
      setImportant(panelBody, "overflow", "hidden");
      setImportant(panelBody, "padding-top", "0");
      panelBody.scrollTop = 0;
    }
    setImportant(container, "position", "relative");
    setImportant(container, "display", "block");
    setImportant(container, "overflow-y", "hidden");
    setImportant(container, "overflow-x", "hidden");
    setImportant(container, "padding", "0");
    setImportant(container, "margin", "0");
    setImportant(container, "top", "0");
    setImportant(container, "left", "0");
    setImportant(container, "right", "0");
    setImportant(container, "transform", "none");
    setImportant(container, "scroll-behavior", "auto");
    container.classList.remove("autoscroll-active");
    container.scrollTop = 0;
    container.parentElement.scrollTop = 0;
    setTimeout(() => {
      container.scrollTop = 0;
      if (container.parentElement) container.parentElement.scrollTop = 0;
    }, 0);
    container.innerHTML = `
      <div class="d-archive-shell" style="display:flex;flex-direction:column;justify-content:flex-start;align-items:stretch;min-height:100%;margin:0;padding:0 12px 10px;box-sizing:border-box;">
        <div class="d-archive-header" style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 8px;padding:0;">
          <p class="d-archive-title" style="margin:0;color:rgba(185,214,223,.92);font-size:13px;letter-spacing:.12em;line-height:1.4;">DISRUPTION ARCHIVE</p>
          <div class="d-archive-pager" aria-label="disruption archive pages" style="display:inline-flex;align-items:center;gap:8px;">
            <button class="meta-pill" id="d-archive-prev" type="button">PREV</button>
            <span class="d-archive-meta" id="d-archive-page-meta" style="font-size:11px;letter-spacing:.09em;color:rgba(185,214,223,.72);">PAGE 1 / 1</span>
            <button class="meta-pill" id="d-archive-next" type="button">NEXT</button>
          </div>
        </div>
        <div class="d-archive-list" id="d-archive-list" style="display:flex;flex-wrap:wrap;align-content:flex-start;justify-content:flex-start;gap:8px 14px;margin:0;padding:0;"></div>
      </div>
    `;
  }

  function stopTopLock() {
    if (state.topLockRaf) {
      cancelAnimationFrame(state.topLockRaf);
      state.topLockRaf = null;
    }
  }

  function startTopLock(ms) {
    stopTopLock();
    const until = Date.now() + ms;
    const panelBody = container.parentElement;
    const tick = () => {
      container.scrollTop = 0;
      if (panelBody && typeof panelBody.scrollTop === "number") {
        panelBody.scrollTop = 0;
      }
      const shell = container.querySelector(".d-archive-shell");
      if (shell) {
        shell.style.setProperty("margin-top", "0", "important");
        shell.style.setProperty("padding-top", "0", "important");
        shell.style.setProperty("top", "0", "important");
        shell.style.setProperty("transform", "none", "important");
      }
      if (Date.now() < until) {
        state.topLockRaf = requestAnimationFrame(tick);
      } else {
        state.topLockRaf = null;
      }
    };
    state.topLockRaf = requestAnimationFrame(tick);
  }

  function renderList(items) {
    const list = container.querySelector("#d-archive-list");
    if (!list) return;
    if (!Array.isArray(items) || items.length === 0) {
      list.innerHTML = '<p class="d-archive-empty" style="margin:2px 0;color:rgba(185,214,223,.72);">No disruption nodes available.</p>';
      return;
    }
    list.innerHTML = items
      .map(
        (item) => `
        <a class="log-line d-archive-link" href="${esc(item.url || "#")}" style="display:inline-flex;align-items:baseline;width:calc(50% - 7px);max-width:calc(50% - 7px);padding:2px 0;border:none;background:none;box-shadow:none;text-decoration:none;color:rgba(185,214,223,.92);margin:0;">
          <span class="log-id">DISRUPTION //</span>
          <span class="log-tag"><span class="node-name">${esc(item.name || "")}</span> <span class="node-count">[${esc(item.count || 0)}]</span> <span class="node-suffix">NODE</span></span>
        </a>
      `
      )
      .join("");
  }

  function renderFallbackFromTemplate() {
    const list = container.querySelector("#d-archive-list");
    if (!list || !disruptionIndexTemplate) return;
    list.innerHTML = disruptionIndexTemplate.innerHTML || "";
  }

  function computeColumns(list) {
    const children = list ? list.children : null;
    if (!children || children.length < 2) return 1;
    const firstTop = children[0].offsetTop;
    const secondTop = children[1].offsetTop;
    return Math.abs(firstTop - secondTop) <= 1 ? 2 : 1;
  }

  function measureItemsPerPage() {
    const shell = container.querySelector(".d-archive-shell");
    const header = container.querySelector(".d-archive-header");
    const list = container.querySelector("#d-archive-list");
    if (!shell || !header || !list) return state.itemsPerPage || 1;
    if (!state.allItems.length) return 1;

    renderList(state.allItems.slice(0, 8));
    const firstItem = list.children[0];
    if (!firstItem) return 1;

    const listStyle = window.getComputedStyle(list);
    const rowGapRaw = listStyle.rowGap || listStyle.gap || "8";
    const rowGap = Number.parseFloat(rowGapRaw) || 8;
    const itemHeight = firstItem.getBoundingClientRect().height || 20;
    const headerHeight = header.getBoundingClientRect().height || 0;
    const availableHeight = Math.max(1, container.clientHeight - headerHeight - 12);
    const rows = Math.max(1, Math.floor((availableHeight + rowGap) / (itemHeight + rowGap)));
    const cols = computeColumns(list);
    return Math.max(1, rows * cols);
  }

  function recalcPaginationPreservingPosition() {
    const oldPerPage = Math.max(1, state.itemsPerPage || 1);
    const firstIndex = (state.page - 1) * oldPerPage;
    state.itemsPerPage = Math.max(1, measureItemsPerPage());
    state.totalPages = Math.max(1, Math.ceil(state.allItems.length / state.itemsPerPage));
    state.page = Math.min(state.totalPages, Math.max(1, Math.floor(firstIndex / state.itemsPerPage) + 1));
  }

  function updatePagerUi() {
    const prevLocal = container.querySelector("#d-archive-prev");
    const nextLocal = container.querySelector("#d-archive-next");
    const metaLocal = container.querySelector("#d-archive-page-meta");
    const totalItems = state.allItems.length;

    if (metaLocal) metaLocal.textContent = `PAGE ${state.page} / ${state.totalPages}  [${totalItems}]`;
    if (prevLocal) prevLocal.disabled = state.page <= 1;
    if (nextLocal) nextLocal.disabled = state.page >= state.totalPages;

    if (activeLogId) activeLogId.textContent = `DISRUPTION INDEX ${state.page}/${state.totalPages}`;
    if (prevBtnGlobal) {
      prevBtnGlobal.textContent = "PREV PAGE";
      prevBtnGlobal.disabled = state.page <= 1;
    }
    if (nextBtnGlobal) {
      nextBtnGlobal.textContent = "NEXT PAGE";
      nextBtnGlobal.disabled = state.page >= state.totalPages;
    }
  }

  function renderCurrentPage() {
    if (!state.allItems.length) {
      renderFallbackFromTemplate();
      state.page = 1;
      state.totalPages = 1;
      updatePagerUi();
      return;
    }
    recalcPaginationPreservingPosition();
    const start = (state.page - 1) * state.itemsPerPage;
    const end = start + state.itemsPerPage;
    renderList(state.allItems.slice(start, end));
    container.scrollTop = 0;
    updatePagerUi();
  }

  function bindLocalPagerHandlers() {
    const prevLocal = container.querySelector("#d-archive-prev");
    const nextLocal = container.querySelector("#d-archive-next");
    if (prevLocal) {
      prevLocal.onclick = () => {
        if (state.page <= 1) return;
        state.page -= 1;
        renderCurrentPage();
      };
    }
    if (nextLocal) {
      nextLocal.onclick = () => {
        if (state.page >= state.totalPages) return;
        state.page += 1;
        renderCurrentPage();
      };
    }
  }

  function onGlobalPrevClick(e) {
    if (!state.archiveMode || !container.classList.contains("d-archive-mode")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (state.page <= 1) return;
    state.page -= 1;
    renderCurrentPage();
  }

  function onGlobalNextClick(e) {
    if (!state.archiveMode || !container.classList.contains("d-archive-mode")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (state.page >= state.totalPages) return;
    state.page += 1;
    renderCurrentPage();
  }

  function onResize() {
    if (!state.archiveMode || !container.classList.contains("d-archive-mode")) return;
    if (state.resizeTicking) return;
    state.resizeTicking = true;
    requestAnimationFrame(() => {
      state.resizeTicking = false;
      renderCurrentPage();
    });
  }

  openDisruptionIndex.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
    await loadAllDisruptions();
    state.archiveMode = true;
    state.page = 1;
    buildArchiveShell();
    bindLocalPagerHandlers();
    renderCurrentPage();
    startTopLock(800);
    requestAnimationFrame(() => {
      container.scrollTop = 0;
    });
  }, true);

  if (prevBtnGlobal) prevBtnGlobal.addEventListener("click", onGlobalPrevClick, true);
  if (nextBtnGlobal) nextBtnGlobal.addEventListener("click", onGlobalNextClick, true);
  window.addEventListener("resize", onResize);
})();
