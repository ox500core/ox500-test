(function(){
  const el = document.getElementById("nextLogCountdown");
  if (!el) return;

  const raw = el.dataset.nextLog;
  if (!raw || raw === "UNKNOWN") {
    el.textContent = "UNKNOWN";
    return;
  }

  const target = new Date(raw);
  const now = new Date();

  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetLocal = new Date(target.getFullYear(), target.getMonth(), target.getDate());

  const diffDays = Math.round((targetLocal - todayLocal) / 86400000);

  let label;

  if (diffDays <= 0) label = "TODAY";
  else if (diffDays === 1) label = "1 DAY";
  else label = diffDays + " DAYS";

  el.textContent = label;
})();
