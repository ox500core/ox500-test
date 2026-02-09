(function () {
  const startStr = document.body ? document.body.dataset.coreStart : "";
  if (!startStr) return;

  const START = new Date(startStr).getTime();
  const el = document.getElementById("system-uptime");
  if (!el) return;

  function fmt(n) {
    return String(n).padStart(2, "0");
  }

  function update() {
    let diff = Math.floor((Date.now() - START) / 1000);
    if (diff < 0) diff = 0;

    const days = Math.floor(diff / 86400);
    diff %= 86400;
    const h = Math.floor(diff / 3600);
    diff %= 3600;
    const m = Math.floor(diff / 60);
    const s = diff % 60;

    el.textContent = `${days}d ${fmt(h)}:${fmt(m)}:${fmt(s)}`;
  }

  update();
  setInterval(update, 1000);
})();
