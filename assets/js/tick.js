(function () {
  const utils = window.OX500 && window.OX500.utils;
  if (!utils) return;

  const $ = (id) => document.getElementById(id);
  const clock = $("clock");

  let tickTimer = null;

  function tick() {
    const ts = Date.now();
    const d = new Date();
    if (clock) clock.textContent = `${utils.pad(d.getHours())}:${utils.pad(d.getMinutes())}:${utils.pad(d.getSeconds())}`;

    window.OX500?.bus?.emit("tick", { ts });
  }

  function startTick() {
    if (tickTimer) return;
    tick();
    tickTimer = setInterval(tick, 1000);
  }

  function stopTick() {
    if (!tickTimer) return;
    clearInterval(tickTimer);
    tickTimer = null;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopTick();
    else startTick();
  });

  startTick();
})();
