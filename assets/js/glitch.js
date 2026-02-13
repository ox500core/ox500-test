(function () {
  const prefersReduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const staticHomeHero = document.body && document.body.dataset.layout === "home";

  const hero = document.getElementById("hero");
  const title = document.getElementById("title");
  const status = document.getElementById("status");

  const WHISPERS = [
    "i can feel you watching",
    "this wasn't meant for you",
    "every click leaves a trace",
    "you shouldn't be seeing this",
    "unauthorized presence detected",
    "this terminal is watching back",
  ];

  let glitchTimer = null;
  let whisperLock = false;

  function scheduleGlitch(delayMs = 1200 + Math.random() * 3000) {
    if (glitchTimer) clearTimeout(glitchTimer);
    glitchTimer = setTimeout(doGlitch, delayMs);
  }

  function doGlitch() {
    glitchTimer = null;

    if (document.hidden) {
      scheduleGlitch(3000);
      return;
    }
    if (staticHomeHero) return;
    if (prefersReduced || !hero || !title || !status) return;

    const r = Math.random();
    if (r > 0.995) {
      hero.classList.add("glitch-invert");
      window.OX500?.bus?.emit("glitch:trigger", { type: "invert" });
      setTimeout(() => hero.classList.remove("glitch-invert"), 55);
    }
    if (r > 0.989) {
      title.classList.add("glitch-shift");
      window.OX500?.bus?.emit("glitch:trigger", { type: "shift" });
      setTimeout(() => title.classList.remove("glitch-shift"), 90);
    }
    if (!whisperLock && r > 0.993) {
      whisperLock = true;
      window.OX500?.bus?.emit("glitch:trigger", { type: "whisper" });
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
      if (glitchTimer) {
        clearTimeout(glitchTimer);
        glitchTimer = null;
      }
      return;
    }

    if (!prefersReduced && hero && title && status && !glitchTimer && !staticHomeHero) scheduleGlitch(500);
  });
})();
