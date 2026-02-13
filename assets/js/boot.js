(function () {
  window.addEventListener("load", () => {
    setTimeout(() => {
      const bootLayer = document.getElementById("boot-layer");
      if (!bootLayer) return;
      bootLayer.style.opacity = "0";
      setTimeout(() => {
        bootLayer.remove();
        window.OX500?.bus?.emit("boot:complete");
      }, 300);
    }, 400);
  });

  window.OX500_NEXT_LOG_STATIC = "04:12:33";
  const nextLogCountdown = document.getElementById("nextLogCountdown");
  if (nextLogCountdown) nextLogCountdown.textContent = window.OX500_NEXT_LOG_STATIC;

  function updateSysVersionPill() {
    const sysVerEl = document.getElementById("sysVer");
    const inlineSysVer = sysVerEl ? String(sysVerEl.textContent || "").trim() : "";
    const bodySysVer = document.body && document.body.dataset ? String(document.body.dataset.sysVer || "").trim() : "";
    const sysVer = inlineSysVer || bodySysVer;
    if (!sysVer) return;

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
    const observer = new MutationObserver(enforce);
    observer.observe(availEl, { childList: true, characterData: true, subtree: true });
  }

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
})();
