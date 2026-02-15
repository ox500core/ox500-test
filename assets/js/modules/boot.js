// === BOOT ===
// Boot layer fade-out, version pill, avail lock, tab buttons.

import { bus } from '../core/event-bus.js';

// === INIT ===

export function initBoot() {
  _scheduleBootLayer();
  _setNextLogCountdown();
  _updateSysVersionPill();
  _lockAvailableFromBuild();
  _initTabButtons();
}

// === PRIVATE ===

function _scheduleBootLayer() {
  window.addEventListener('load', () => {
    setTimeout(() => {
      const bootLayer = document.getElementById('boot-layer');
      if (!bootLayer) return;
      bootLayer.style.opacity = '0';
      setTimeout(() => {
        bootLayer.remove();
        bus.emit('boot:complete');
      }, 300);
    }, 400);
  });
}

function _setNextLogCountdown() {
  const el = document.getElementById('nextLogCountdown');
  if (!el) return;
  const current = String(el.textContent || '').trim();
  if (current) return;
  window.OX500_NEXT_LOG_STATIC = 'UNKNOWN';
  el.textContent = window.OX500_NEXT_LOG_STATIC;
}

function _updateSysVersionPill() {
  const sysVerEl = document.getElementById('sysVer');
  const inlineSysVer = sysVerEl ? String(sysVerEl.textContent || '').trim() : '';
  const bodySysVer = document.body?.dataset
    ? String(document.body.dataset.sysVer || '').trim()
    : '';
  const sysVer = inlineSysVer || bodySysVer;
  if (!sysVer) return;

  if (sysVerEl) {
    sysVerEl.textContent = sysVer;
    return;
  }
  const sysPill = document.querySelector('.topbar .right .pill');
  if (sysPill && /^SYS\s+/i.test((sysPill.textContent || '').trim())) {
    sysPill.textContent = `SYS ${sysVer}`;
  }
}

function _lockAvailableFromBuild() {
  const availEl = document.getElementById('avail');
  if (!availEl) return;
  const buildValue = (availEl.textContent || '').trim();
  if (!buildValue) return;

  const enforce = () => {
    if ((availEl.textContent || '').trim() !== buildValue) {
      availEl.textContent = buildValue;
    }
  };

  enforce();
  const observer = new MutationObserver(enforce);
  observer.observe(availEl, { childList: true, characterData: true, subtree: true });
}

function _initTabButtons() {
  document.querySelectorAll('.btn[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn[data-tab]').forEach((b) => b.classList.remove('primary'));
      btn.classList.add('primary');
    }, { passive: true });
  });
}
