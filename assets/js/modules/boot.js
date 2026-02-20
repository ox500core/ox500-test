// === BOOT ===
// Boot layer fade-out, version pill, avail lock, tab buttons.

import { bus } from '../core/event-bus.js';

const BOOT_FADE_DELAY_MS = 400;
const BOOT_REMOVE_DELAY_MS = 300;
const TOPBAR_SYS_PILL_SELECTOR = '.topbar .right .pill';
const TOPBAR_TAB_SELECTOR = '.btn[data-tab]';
const MOBILE_BOOT_QUERY = '(max-width: 980px), (hover:none) and (pointer:coarse)';

// === INIT ===

export function initBoot() {
  scheduleBootLayer();
  setNextLogCountdown();
  updateSysVersionPill();
  lockAvailableFromBuild();
  initTabButtons();
}

// === PRIVATE ===

function scheduleBootLayer() {
  const hideBootLayer = () => {
    const bootLayer = document.getElementById('boot-layer');
    if (!bootLayer) return;

    const isMobile = window.matchMedia?.(MOBILE_BOOT_QUERY).matches ?? false;
    if (isMobile) {
      bootLayer.remove();
      bus.emit('boot:complete');
      return;
    }

    setTimeout(() => {
      bootLayer.classList.add('is-hidden');
      setTimeout(() => {
        bootLayer.remove();
        bus.emit('boot:complete');
      }, BOOT_REMOVE_DELAY_MS);
    }, BOOT_FADE_DELAY_MS);
  };

  const runDesktopBoot = () => {
    if (document.readyState === 'complete') {
      hideBootLayer();
      return;
    }
    window.addEventListener('load', hideBootLayer, { once: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runDesktopBoot, { once: true });
    return;
  }
  runDesktopBoot();
}

function setNextLogCountdown() {
  const el = document.getElementById('nextLogCountdown');
  if (!el) return;
  const current = String(el.textContent || '').trim();
  if (current) return;
  window.OX500_NEXT_LOG_STATIC = 'UNKNOWN';
  el.textContent = window.OX500_NEXT_LOG_STATIC;
}

function readInlineSysVersion() {
  const sysVerEl = document.getElementById('sysVer');
  return sysVerEl ? String(sysVerEl.textContent || '').trim() : '';
}

function readBodySysVersion() {
  return document.body?.dataset
    ? String(document.body.dataset.sysVer || '').trim()
    : '';
}

function updateSysVersionPill() {
  const sysVerEl = document.getElementById('sysVer');
  const sysVer = readInlineSysVersion() || readBodySysVersion();
  if (!sysVer) return;

  if (sysVerEl) {
    sysVerEl.textContent = sysVer;
    return;
  }
  const sysPill = document.querySelector(TOPBAR_SYS_PILL_SELECTOR);
  if (sysPill && /^SYS\s+/i.test((sysPill.textContent || '').trim())) {
    sysPill.textContent = `SYS ${sysVer}`;
  }
}

function lockAvailableFromBuild() {
  const availEl = document.getElementById('avail');
  if (!availEl) return;
  const buildValue = (availEl.textContent || '').trim();
  if (!buildValue) return;
  availEl.dataset.buildValue = buildValue;

  const enforce = () => {
    const dynamicValue = String(availEl.dataset.dynamicValue || '').trim();
    const targetValue = dynamicValue || buildValue;
    if ((availEl.textContent || '').trim() !== targetValue) {
      availEl.textContent = targetValue;
    }
  };

  enforce();
  const observer = new MutationObserver(enforce);
  observer.observe(availEl, { childList: true, characterData: true, subtree: true });
}

function initTabButtons() {
  document.querySelectorAll(TOPBAR_TAB_SELECTOR).forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(TOPBAR_TAB_SELECTOR).forEach((b) => b.classList.remove('primary'));
      btn.classList.add('primary');
    }, { passive: true });
  });
}
