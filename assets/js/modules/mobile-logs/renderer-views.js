import { utils } from '../../core/utils.js';
import { bus } from '../../core/event-bus.js';
import {
  getLogs,
  setCurrentEntryId,
  maybePrefetchAroundCurrent,
  getState,
} from './store.js';
import {
  toLogHtml,
  deriveMobileDisruptionTitle,
  deriveMobileLogEntryTitle,
  disruptionKey,
  getCurrentEntry,
  setViewMode,
  setLogStamp,
  markCurrentRecentLog,
  markCurrentDisruptionNode,
  createTitleActionHtml,
  resetActiveViewScroll,
} from './renderer-shared.js';

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
  const totalDisruptions = new Set(
    getLogs()
      .map((item) => disruptionKey(item))
      .filter(Boolean),
  ).size;

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
        '</a>'
      );
    })
    .join('');

  const { titleActionAttrs, titleActionHtml } = createTitleActionHtml(mobileQuery, nodeTitle);

  setViewMode(els, 'disruption-list', { disruptionTotal: totalDisruptions });
  markCurrentDisruptionNode(entry);
  textEl.innerHTML =
    `<div class="mobile-active-log-title" ${titleActionAttrs}>` +
    '<span class="mobile-active-log-prefix">DISRUPTION //</span> ' +
    titleActionHtml +
    `<div class="mobile-active-log-entry">// ${list.length} LOGS</div>` +
    '</div>' +
    `<div class="mobile-disruption-list">${listHtml}</div>`;
  resetActiveViewScroll(textEl, mobileQuery);
}

export function renderEntry(els, mobileQuery, entry, stampEl, recentLogsRoot, updateControls) {
  if (!entry) return;

  const { textEl } = els;
  const wasScanMode = Boolean(textEl?.dataset?.viewMode === 'scan');

  const bodyHtml = toLogHtml(entry?.text || '');
  const cleanTitle = deriveMobileDisruptionTitle(entry);
  const cleanLogTitle = deriveMobileLogEntryTitle(entry);

  const { titleActionAttrs, titleActionHtml } = createTitleActionHtml(mobileQuery, cleanTitle);

  const titleHtml =
    `<div class="mobile-active-log-title" ${titleActionAttrs}>` +
    '<span class="mobile-active-log-prefix">DISRUPTION //</span> ' +
    titleActionHtml +
    `<div class="mobile-active-log-entry">//${utils.escapeHtml(cleanLogTitle)}</div>` +
    '</div>';

  setViewMode(els, 'entry');
  if (wasScanMode && !getState().fromSearch) resetScanUi(els);

  textEl.innerHTML = titleHtml + bodyHtml;
  resetActiveViewScroll(textEl, mobileQuery);

  const id = entry?.id || '----';
  const date = entry?.date || '----';
  setLogStamp(stampEl, id, date);

  const currentId = utils.normalizeId(entry?.id || '');
  setCurrentEntryId(currentId);
  markCurrentRecentLog(recentLogsRoot, currentId);
  markCurrentDisruptionNode(entry);

  if (document.body) {
    document.body.dataset.logLevel = currentId;
  }

  bus.emit('log:changed', {
    id: utils.normalizeId(entry?._nid || entry?.id || ''),
  });

  updateControls();
  maybePrefetchAroundCurrent(stampEl);
}

export function resetScanUi(els) {
  const { scanInput, scanResults } = els;
  if (scanInput) { scanInput.value = ''; scanInput.blur(); }
  if (scanResults) {
    scanResults.innerHTML = '<span class="scan-hint">TYPE TO SCAN...</span>';
  }
}
