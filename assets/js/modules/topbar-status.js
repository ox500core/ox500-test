// Mobile topbar compact diagnostics status.
// Uses fixed DOM nodes and updates textContent only.

import { bus } from '../core/event-bus.js';

const PHASE_TO_EMOJI = {
  NOMINAL: '\uD83D\uDFE2',
  UNSTABLE: '\uD83D\uDFE1',
  INCIDENT: '\uD83D\uDD34',
};

const MOBILE_STATUS_QUERY = '(max-width: 640px)';
const TOPBAR_COVERING_CLASS = 'diag-covering';
const TOPBAR_OPEN_CLASS = 'diag-open';
const STATUS_EXPANDED_CLASS = 'show-diag';

function fmtDrift(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '+0.000';
  return `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(3)}`;
}

function fmtAnomaly(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function fmtDensity(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function isNarrowMobile() {
  return typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_STATUS_QUERY).matches;
}

function setTextIfChanged(element, nextValue) {
  if (!element) return;
  if (element.textContent === nextValue) return;
  element.textContent = nextValue;
}

export function initTopbarStatus() {
  const root = document.getElementById('topbarStatus');
  const topbar = root?.closest?.('.topbar') || null;
  const topbarLeft = topbar?.querySelector?.('.left') || null;
  const nodePill = document.getElementById('topbarNodePill');
  const driftValueEl = document.getElementById('topbarStatusDriftValue');
  const anomalyValueEl = document.getElementById('topbarStatusAnomalyValue');
  const densityValueEl = document.getElementById('topbarStatusDensityValue');
  const phaseIconEl = document.getElementById('topbarStatusPhaseIcon');
  if (!root || !topbar || !topbarLeft || !nodePill || !driftValueEl || !anomalyValueEl || !densityValueEl || !phaseIconEl) return;
  let coveringRaf = 0;

  function setLogNodeText(withDate) {
    if (nodePill.dataset.nodeType !== 'log') return;
    const valueEl = nodePill.querySelector('b');
    const id = String(nodePill.dataset.logId || '').trim();
    const date = String(nodePill.dataset.logDateDisplay || '').trim();
    if (!valueEl || !id) return;
    const nextText = (withDate && date) ? `LOG ${id} ${date}` : `LOG ${id}`;
    setTextIfChanged(valueEl, nextText);
  }

  function hasCollision() {
    const nodeRect = nodePill.getBoundingClientRect();
    const statusRect = root.getBoundingClientRect();
    const touchesNode = statusRect.left <= nodeRect.right;
    const nodeTruncated = (nodePill.scrollWidth - nodePill.clientWidth) > 0.5;
    return touchesNode || nodeTruncated;
  }

  function updateCoveringState() {
    if (!root.classList.contains(STATUS_EXPANDED_CLASS)) {
      return;
    }
    if (!isNarrowMobile()) {
      topbar.classList.remove(TOPBAR_COVERING_CLASS);
      setLogNodeText(true);
      return;
    }

    // 1) Try with date.
    setLogNodeText(true);
    if (!hasCollision()) {
      topbar.classList.remove(TOPBAR_COVERING_CLASS);
      return;
    }

    // 2) If LOG node collides, try without date.
    if (nodePill.dataset.nodeType === 'log') {
      setLogNodeText(false);
      if (!hasCollision()) {
        topbar.classList.remove(TOPBAR_COVERING_CLASS);
        return;
      }
    }

    // 3) Still colliding -> hide entire left block.
    topbar.classList.add(TOPBAR_COVERING_CLASS);
  }

  function scheduleCoveringUpdate() {
    if (coveringRaf) return;
    if (typeof window.requestAnimationFrame !== 'function') {
      updateCoveringState();
      return;
    }
    coveringRaf = window.requestAnimationFrame(() => {
      coveringRaf = 0;
      updateCoveringState();
    });
  }

  function setExpanded(expanded) {
    root.classList.toggle(STATUS_EXPANDED_CLASS, expanded);
    topbar.classList.toggle(TOPBAR_OPEN_CLASS, expanded);
    if (!expanded) {
      topbar.classList.remove(TOPBAR_COVERING_CLASS);
      setLogNodeText(true);
      return;
    }

    // Safe default: hide NODE immediately, then reveal when layout allows it.
    topbar.classList.add(TOPBAR_COVERING_CLASS);
    scheduleCoveringUpdate();
    window.setTimeout(scheduleCoveringUpdate, 50);
  }

  phaseIconEl.addEventListener('click', (event) => {
    if (!isNarrowMobile()) return;
    event.preventDefault();
    event.stopPropagation();
    setExpanded(!root.classList.contains(STATUS_EXPANDED_CLASS));
  });

  document.addEventListener('click', (event) => {
    if (!isNarrowMobile()) return;
    if (!root.classList.contains(STATUS_EXPANDED_CLASS)) return;
    if (root.contains(event.target)) return;
    setExpanded(false);
  });

  window.addEventListener('resize', scheduleCoveringUpdate, { passive: true });
  window.addEventListener('orientationchange', scheduleCoveringUpdate, { passive: true });

  bus.on('diagnostics:update', (payload) => {
    const phase = String(payload?.phase || 'NOMINAL').toUpperCase();
    setTextIfChanged(driftValueEl, fmtDrift(payload?.temporalDrift));
    setTextIfChanged(anomalyValueEl, fmtAnomaly(payload?.anomaly));
    setTextIfChanged(densityValueEl, fmtDensity(payload?.eventDensity));
    setTextIfChanged(phaseIconEl, PHASE_TO_EMOJI[phase] || PHASE_TO_EMOJI.NOMINAL);
    if (root.classList.contains(STATUS_EXPANDED_CLASS)) {
      scheduleCoveringUpdate();
    }
  });
}
