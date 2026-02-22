import { utils } from '../../core/utils.js';
import { deriveMobileLogEntryTitle } from './renderer.js';
import { SCAN_CONFIG } from './config.js';

function buildStatusHtml(deepTextSearchEnabled, deepActive, matchesCount, shownCount) {
  const deepSwitchClass = deepTextSearchEnabled ? 'is-deep-on' : 'is-deep-off';
  const deepHint =
    deepTextSearchEnabled && !deepActive
      ? ` (min ${SCAN_CONFIG.DEEP_SEARCH_MIN_CHARS} chars for TEXT)`
      : '';

  return (
    '<button type="button" class="log-line scan-deep-toggle" data-scan-deep-toggle="1" aria-label="Toggle deep text scan mode">' +
    `SCAN_MODE // DEEP: <span class="scan-deep-switch ${deepSwitchClass}" data-scan-deep-toggle="1">` +
    '<span class="scan-deep-opt scan-deep-opt-on">ON</span>' +
    '<span class="scan-deep-sep" aria-hidden="true">/</span>' +
    '<span class="scan-deep-opt scan-deep-opt-off">OFF</span>' +
    `</span>${deepHint} | MATCHES: ${matchesCount} | SHOWING: ${shownCount}` +
    '</button>'
  );
}

function buildResultsHtml(results) {
  return results
    .map((entry) => {
      const id = utils.normalizeId(entry.id);
      const title = deriveMobileLogEntryTitle(entry);
      const href = String(entry.url || '#');
      return (
        `<a class="log-line naked mobile-disruption-item" data-scan-id="${utils.escapeHtml(id)}" href="${utils.escapeHtml(href)}">` +
        `<span class="log-id">LOG ${utils.escapeHtml(id)}</span>` +
        `<span class="log-tag">${utils.escapeHtml(title)}</span>` +
        '</a>'
      );
    })
    .join('');
}

export function renderEmptyScanResults(scanResults) {
  if (!scanResults) return;
  scanResults.innerHTML = '<span class="scan-hint">TYPE TO SCAN...</span>';
}

export function renderScanResultsHtml(scanResults, payload) {
  if (!scanResults) return;

  const {
    deepTextSearchEnabled,
    deepActive,
    matchesAll,
    shown,
    results,
  } = payload;

  const statusHtml = buildStatusHtml(deepTextSearchEnabled, deepActive, matchesAll.length, shown);
  if (!results.length) {
    scanResults.innerHTML = statusHtml + '<span class="scan-hint">NO MATCHES</span>';
    return;
  }

  const resultsHtml = buildResultsHtml(results);
  const moreHtml = matchesAll.length > shown
    ? '<button type="button" class="log-line scan-more-btn" data-scan-more="1" aria-label="Load more scan results">LOAD MORE...</button>'
    : '';
  scanResults.innerHTML = statusHtml + resultsHtml + moreHtml;
}
