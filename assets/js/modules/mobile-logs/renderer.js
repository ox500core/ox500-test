// === MOBILE LOGS — RENDERER ===
// All HTML construction and DOM mutation lives here.
// Reads store state, never writes it (except via setCurrentEntryId via bus).

import { utils } from '../../core/utils.js';
import { bus } from '../../core/event-bus.js';
import {
  getLogsById,
  getOrderedIds,
  getLogs,
  resolveCurrentIndex,
  setCurrentEntryId,
  maybePrefetchAroundCurrent,
} from './store.js';

// === TEXT HELPERS ===

export function toLogHtml(rawText) {
  const normalized = String(rawText || '').replace(/\r\n/g, '\n');
  const blocks = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const paragraphs = (blocks.length ? blocks : [normalized])
    .map((p) => `<p>${utils.escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return paragraphs || '<p></p>';
}

export function deriveMobileDisruptionTitle(entry) {
  const clean = String(entry?.disruption_title_clean || '').trim();
  if (clean) return clean;

  const rawSeries = String(entry?.series || entry?.disruption || '').trim();
  const rawTitle = String(entry?.title || '').trim();

  let title = rawSeries;
  title = title.replace(/^DISRUPTION(?:_SERIES)?\s*\/\/\s*/i, '').trim();
  title = title.replace(/^SERIES\s*\/\/\s*/i, '').trim();
  title = title.replace(/^DISRUPTION\s*\/\s*/i, '').trim();

  if (!title) title = rawTitle.replace(/^LOG\s*\d+\s*\/\/\s*/i, '').trim();
  return title || 'UNTITLED';
}

export function deriveMobileLogEntryTitle(entry) {
  let title = String(entry?.title || '').trim();
  title = title.replace(/^LOG\s*\d+\s*\/\/\s*/i, '').trim();
  title = title.replace(/^DISRUPTION(?:_SERIES)?\s*\/\/\s*/i, '').trim();
  return title || 'UNTITLED';
}

export function disruptionKey(entry) {
  const cleanSlug = String(entry?.disruption_slug_clean || '').trim();
  if (cleanSlug) return cleanSlug;

  let title = String(entry?.series || entry?.disruption || '').trim();
  title = title.replace(/^DISRUPTION(?:_SERIES)?\s*\/\/\s*/i, '').trim();
  title = title.replace(/^SERIES\s*\/\/\s*/i, '').trim();
  title = title.replace(/^DISRUPTION\s*\/\s*/i, '').trim();
  return title.toUpperCase();
}

export function disruptionSlugFromHref(href) {
  const match = String(href || '').match(/\/disruption\/([^/?#]+)\.html(?:[?#].*)?$/i);
  return match ? match[1].trim().toLowerCase() : '';
}

export function logIdFromHref(href) {
  const match = String(href || '').match(/\/logs\/\d{4}\/\d{2}\/log-(\d+)-[^/?#]+\.html(?:[?#].*)?$/i);
  return match ? utils.normalizeId(match[1]) : '';
}

export function getCurrentEntry(stampEl) {
  const currentId =
    utils.normalizeId(getOrderedIds()[resolveCurrentIndex(stampEl)]);
  return currentId ? getLogsById().get(currentId) : null;
}

export function pickEntryForDisruptionSlug(slug) {
  if (!slug) return null;
  const list = getLogs()
    .filter((entry) => disruptionKey(entry) === slug)
    .slice()
    .sort((a, b) => Number(utils.normalizeId(b.id)) - Number(utils.normalizeId(a.id)));
  return list.length ? list[0] : null;
}

// === DOM HELPERS ===

export function setLogStamp(stampEl, id, date) {
  if (!stampEl) return;
  stampEl.textContent = '';
  const label = document.createElement('b');
  label.textContent = 'LOG';
  stampEl.appendChild(label);
  stampEl.appendChild(document.createTextNode(` ${id} ${date}`));
}

export function setNodePill(text) {
  const nodePill = document.getElementById('topbarNodePill');
  if (!nodePill) return;
  nodePill.textContent = String(text || '');
}

export function markCurrentRecentLog(recentLogsRoot, logId) {
  if (!recentLogsRoot) return;
  const currentId = utils.normalizeId(logId || '');
  recentLogsRoot.querySelectorAll('a.log-line[href]').forEach((link) => {
    const id = logIdFromHref(link.getAttribute('href'));
    link.classList.toggle('is-current', Boolean(currentId && id === currentId));
  });
}

// === VIEW MODE ===

export function setViewMode(els, mode) {
  const { textEl, scanWrap, mobileNav, scanBtn } = els;
  if (!textEl) return;

  textEl.dataset.viewMode = mode;
  const isScanMode = mode === 'scan';

  if (scanWrap) scanWrap.hidden = !isScanMode;
  if (mobileNav) mobileNav.hidden = isScanMode;
  textEl.hidden = isScanMode;

  if (scanBtn) {
    scanBtn.classList.toggle('is-scan', isScanMode);
    scanBtn.setAttribute('aria-pressed', isScanMode ? 'true' : 'false');
  }

  if (isScanMode) setNodePill('NODE: QUERY_PORT');
  else if (mode === 'disruption-list') setNodePill('NODE: DISRUPTION_LIST');
  else setNodePill('NODE: LOG_STREAM');
}

// === RENDER FUNCTIONS ===

export function renderDisruptionList(els, mobileQuery, sourceEntry, stampEl) {
  const { textEl } = els;
  const entry = sourceEntry || getCurrentEntry(stampEl);
  if (!entry) return;

  const key = disruptionKey(entry);
  if (!key) return;

  const nodeTitle = deriveMobileDisruptionTitle(entry);
  const list = getLogs()
    .filter((item) => disruptionKey(item) === key)
    .slice()
    .sort((a, b) => Number(utils.normalizeId(a.id)) - Number(utils.normalizeId(b.id)));

  if (!list.length) return;

  const listHtml = list
    .map((item) => {
      const id = utils.normalizeId(item.id);
      const title = deriveMobileLogEntryTitle(item);
      const href = String(item.url || '#');
      return (
        `<a class="log-line naked mobile-disruption-item" data-log-id="${utils.escapeHtml(id)}" href="${utils.escapeHtml(href)}">` +
        `<span class="log-id">LOG ${utils.escapeHtml(id)} //</span> ` +
        `<span class="log-tag">${utils.escapeHtml(title)}</span>` +
        `</a>`
      );
    })
    .join('');

  const titleActionAttrs = mobileQuery.matches
    ? `data-open-disruption-list="1" role="button" tabindex="0"` : '';
  const titleActionHtml = mobileQuery.matches
    ? `<span class="mobile-active-log-name">${utils.escapeHtml(nodeTitle)}</span>`
    : `<a class="mobile-active-log-link" data-open-disruption-list="1" href="#">${utils.escapeHtml(nodeTitle)}</a>`;

  setViewMode(els, 'disruption-list');
  textEl.innerHTML =
    `<div class="mobile-active-log-title" ${titleActionAttrs}>` +
    `<span class="mobile-active-log-prefix">DISRUPTION //</span> ` +
    titleActionHtml +
    `<div class="mobile-active-log-entry">// ${list.length} LOGS</div>` +
    `</div>` +
    `<div class="mobile-disruption-list">${listHtml}</div>`;
}

export function renderEntry(els, mobileQuery, entry, stampEl, recentLogsRoot, updateControls) {
  if (!entry) return;

  const { textEl } = els;
  const wasScanMode = Boolean(textEl?.dataset?.viewMode === 'scan');

  const bodyHtml = toLogHtml(entry?.text || '');
  const cleanTitle = deriveMobileDisruptionTitle(entry);
  const cleanLogTitle = deriveMobileLogEntryTitle(entry);

  const titleActionAttrs = mobileQuery.matches
    ? `data-open-disruption-list="1" role="button" tabindex="0"` : '';
  const titleActionHtml = mobileQuery.matches
    ? `<span class="mobile-active-log-name">${utils.escapeHtml(cleanTitle)}</span>`
    : `<a class="mobile-active-log-link" data-open-disruption-list="1" href="#">${utils.escapeHtml(cleanTitle)}</a>`;

  const titleHtml =
    `<div class="mobile-active-log-title" ${titleActionAttrs}>` +
    `<span class="mobile-active-log-prefix">DISRUPTION //</span> ` +
    titleActionHtml +
    `<div class="mobile-active-log-entry">//${utils.escapeHtml(cleanLogTitle)}</div>` +
    `</div>`;

  setViewMode(els, 'entry');
  if (wasScanMode) resetScanUi(els);

  textEl.innerHTML = titleHtml + bodyHtml;

  const id = entry?.id || '----';
  const date = entry?.date || '----';
  setLogStamp(stampEl, id, date);

  const currentId = utils.normalizeId(entry?.id || '');
  setCurrentEntryId(currentId);
  markCurrentRecentLog(recentLogsRoot, currentId);

  if (document.body) {
    document.body.dataset.logLevel = currentId;
  }

  bus.emit('log:changed', {
    id: utils.normalizeId(entry?._nid || entry?.id || ''),
  });

  updateControls();
  maybePrefetchAroundCurrent(stampEl);
}

// === SCAN UI RESET ===

export function resetScanUi(els) {
  const { scanInput, scanResults } = els;
  if (scanInput) { scanInput.value = ''; scanInput.blur(); }
  if (scanResults) {
    scanResults.innerHTML = '<span class="scan-hint">TYPE TO SCAN...</span>';
  }
}
