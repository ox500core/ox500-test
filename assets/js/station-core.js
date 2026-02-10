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

  const $ = (id) => document.getElementById(id);
  const clock = $("clock");
  const avail = $("avail");
  const coords = $("coords");
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

  function deriveFeedFromActiveLog() {
    const logEl = $("active-log-container");
    if (!logEl) return [];

    const raw = (logEl.textContent || "").toUpperCase();
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
    const derived = deriveFeedFromActiveLog();
    feedPool = derived.length ? derived : FEED_DEFAULT.slice();
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

  function updateCoords() {
    if (document.hidden) return;
    if (!coords) return;
    const lat = 52.2297 + (Math.random() * 0.08 - 0.04);
    const lon = 21.0122 + (Math.random() * 0.08 - 0.04);
    coords.textContent = `${lat.toFixed(4)}\u00B0 N, ${lon.toFixed(4)}\u00B0 E`;
  }
  updateCoords();
  setInterval(updateCoords, 4500);

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
    target.classList.remove("pulse");
    void target.offsetWidth;
    target.classList.add("pulse");
    feedIdx += 1;
    scheduleFeed(6500 + Math.random() * 6500);
  }
  refreshFeedPool();
  scheduleFeed(1800);

  async function updateSysVersionPill() {
    const candidates = [];
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    candidates.push(new URL("/logs.json", window.location.origin).href);
    candidates.push(new URL("logs.json", window.location.href).href);
    for (let i = 0; i < pathParts.length; i += 1) {
      candidates.push(new URL(`${"../".repeat(i + 1)}logs.json`, window.location.href).href);
    }

    let sysVer = "";
    for (const url of [...new Set(candidates)]) {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) continue;
        const json = await res.json();
        const value = json && json.system && json.system.sys_ver;
        if (value) {
          sysVer = String(value).trim();
          break;
        }
      } catch (_) {}
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
    document.addEventListener("ox500:active-log-updated", enforce);
    const observer = new MutationObserver(enforce);
    observer.observe(availEl, { childList: true, characterData: true, subtree: true });
  }

  document.addEventListener("ox500:active-log-updated", refreshFeedPool);
  lockAvailableFromBuild();
  updateSysVersionPill();

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
    scheduleGlitch(2200);
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
    updateCoords();
    if (!feedTimer) scheduleFeed(800);
    if (!prefersReduced && hero && title && status && !glitchTimer) scheduleGlitch(1400);
  });
})();
