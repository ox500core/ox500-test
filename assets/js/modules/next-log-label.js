const ONE_DAY_MS = 86400000;
const UNKNOWN_LABEL = 'UNKNOWN';

function normalizeDateToLocalMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function resolveCountdownLabel(rawNextLogDate) {
  if (!rawNextLogDate || rawNextLogDate === UNKNOWN_LABEL) {
    return UNKNOWN_LABEL;
  }

  const target = new Date(rawNextLogDate);
  const now = new Date();
  const todayLocal = normalizeDateToLocalMidnight(now);
  const targetLocal = normalizeDateToLocalMidnight(target);
  const diffDays = Math.round((targetLocal - todayLocal) / ONE_DAY_MS);

  if (diffDays <= 0) return 'TODAY';
  if (diffDays === 1) return '1 DAY';
  return `${diffDays} DAYS`;
}

export function initNextLogLabel() {
  const element = document.getElementById('nextLogCountdown');
  if (!element) return;
  element.textContent = resolveCountdownLabel(element.dataset.nextLog);
}
