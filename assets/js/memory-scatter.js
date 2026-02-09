(function () {
  const container = document.getElementById("memory-scatter");
  if (!container) return;

  const pool = ["SECTOR", "CRC", "MISMATCH", "RECOVERY", "BLOCK", "IRREVERSIBLE", "PROCEED", "CACHE"];

  function getPrevText() {
    return (container.dataset.prevLog || "").toUpperCase();
  }

  function pickPrevWord() {
    const prevText = getPrevText();
    const words = prevText.split(/\s+/).filter((w) => w.length > 4);
    if (!words.length) return null;
    return words[Math.floor(Math.random() * words.length)].slice(0, 12);
  }

  function spawnFragments() {
    container.innerHTML = "";
    const count = 3 + Math.floor(Math.random() * 3);

    for (let i = 0; i < count; i += 1) {
      const el = document.createElement("div");
      el.className = "memory-fragment" + (Math.random() < 0.4 ? " faint" : "");

      let text = Math.random() < 0.5 ? pool[Math.floor(Math.random() * pool.length)] : pickPrevWord();
      if (!text) text = pool[Math.floor(Math.random() * pool.length)];
      el.textContent = text;

      const x = 60 + Math.random() * 35;
      const y = 10 + Math.random() * 70;
      el.style.left = x + "%";
      el.style.top = y + "%";
      container.appendChild(el);
    }
  }

  spawnFragments();
  setInterval(spawnFragments, 30000 + Math.random() * 20000);
})();
