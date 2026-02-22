import { utils } from '../../core/utils.js';
import {
  getLogsById,
  getOrderedIds,
  getLogs,
  resolveCurrentIndex,
} from './store.js';

const MOBILE_TOPBAR_QUERY = '(max-width: 640px)';
const LOG_TITLE_PREFIX_RE = /^LOG\s*\d+\s*\/\/\s*/i;
const DISRUPTION_PREFIX_RE = /^DISRUPTION(?:_SERIES)?\s*\/\/\s*/i;
const SERIES_PREFIX_RE = /^SERIES\s*\/\/\s*/i;
const DISRUPTION_SLASH_PREFIX_RE = /^DISRUPTION\s*\/\s*/i;

function cleanupDisruptionText(rawText) {
  return String(rawText || '')
    .trim()
    .replace(DISRUPTION_PREFIX_RE, '')
    .replace(SERIES_PREFIX_RE, '')
    .replace(DISRUPTION_SLASH_PREFIX_RE, '')
    .trim();
}

function stripLogTitlePrefix(rawTitle) {
  return String(rawTitle || '').trim().replace(LOG_TITLE_PREFIX_RE, '').trim();
}

export function createTitleActionHtml(mobileQuery, nodeTitle) {
  const titleActionAttrs = mobileQuery.matches
    ? 'data-open-disruption-list="1" role="button" tabindex="0" aria-label="Open disruption log list"' : '';
  const titleActionHtml = mobileQuery.matches
    ? `<span class="mobile-active-log-name">${utils.escapeHtml(nodeTitle)}</span>`
    : `<a class="mobile-active-log-link" data-open-disruption-list="1" href="#" aria-label="Open disruption log list">${utils.escapeHtml(nodeTitle)}</a>`;
  return { titleActionAttrs, titleActionHtml };
}

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
  const rawTitle = stripLogTitlePrefix(entry?.title);

  let title = cleanupDisruptionText(rawSeries);
  if (!title) title = rawTitle;
  return title || 'UNTITLED';
}

export function deriveMobileLogEntryTitle(entry) {
  let title = stripLogTitlePrefix(entry?.title);
  title = title.replace(DISRUPTION_PREFIX_RE, '').trim();
  return title || 'UNTITLED';
}

export function disruptionKey(entry) {
  const cleanSlug = String(entry?.disruption_slug_clean || '').trim();
  if (cleanSlug) return cleanSlug;

  const title = cleanupDisruptionText(entry?.series || entry?.disruption || '');
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

function syncAvailableForMode(mode, disruptionTotal) {
  const availEl = document.getElementById('avail');
  if (!availEl) return;

  if (mode === 'disruption-list' && Number.isFinite(disruptionTotal)) {
    const next = String(Math.max(0, Math.trunc(disruptionTotal))).padStart(3, '0');
    availEl.dataset.dynamicValue = next;
    availEl.textContent = next;
    return;
  }

  delete availEl.dataset.dynamicValue;
  const base = String(availEl.dataset.buildValue || '').trim();
  if (base) availEl.textContent = base;
}

export function setLogStamp(stampEl, id, date) {
  if (!stampEl) return;
  const isNarrowMobile = typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_TOPBAR_QUERY).matches;
  const activeViewMode = document.querySelector('#activeViewPanel .bd.log-text')?.dataset?.viewMode || '';
  const isLogView = activeViewMode === 'entry' || activeViewMode === '';
  const rawDate = String(date || '').trim();
  const shortDateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const shortDate = shortDateMatch
    ? `${shortDateMatch[1].slice(-2)}.${shortDateMatch[2]}.${shortDateMatch[3]}`
    : rawDate;
  const displayDate = (isNarrowMobile && isLogView) ? shortDate : rawDate;
  stampEl.textContent = displayDate ? `${id} ${displayDate}` : `${id}`;
  const nodePill = document.getElementById('topbarNodePill');
  if (!nodePill) return;
  nodePill.dataset.nodeType = 'log';
  nodePill.dataset.logId = String(id || '');
  nodePill.dataset.logDateDisplay = String(displayDate || '');
  nodePill.textContent = 'NODE: ';
  const valueEl = document.createElement('b');
  valueEl.textContent = displayDate ? `LOG ${id} ${displayDate}` : `LOG ${id}`;
  nodePill.appendChild(valueEl);
}

export function setNodePill(text) {
  const nodePill = document.getElementById('topbarNodePill');
  if (!nodePill) return;
  delete nodePill.dataset.nodeType;
  delete nodePill.dataset.logId;
  delete nodePill.dataset.logDateDisplay;
  const raw = String(text || '');
  nodePill.textContent = '';
  const idx = raw.indexOf(':');
  if (idx > 0) {
    const prefix = raw.slice(0, idx + 1);
    const value = raw.slice(idx + 1).trim();
    nodePill.appendChild(document.createTextNode(`${prefix} `));
    const valueEl = document.createElement('b');
    valueEl.textContent = value;
    nodePill.appendChild(valueEl);
    return;
  }
  nodePill.textContent = raw;
}

export function markCurrentRecentLog(recentLogsRoot, logId) {
  if (!recentLogsRoot) return;
  const currentId = utils.normalizeId(logId || '');
  recentLogsRoot.querySelectorAll('a.log-line[href]').forEach((link) => {
    const id = logIdFromHref(link.getAttribute('href'));
    link.classList.toggle('is-current', Boolean(currentId && id === currentId));
  });
}

export function markCurrentDisruptionNode(entry) {
  const disruptionNodesRoot = document.getElementById('leftBlock3');
  if (!disruptionNodesRoot) return;
  const currentKey = String(disruptionKey(entry) || '').trim().toLowerCase();
  disruptionNodesRoot.querySelectorAll('a.log-line[href]').forEach((link) => {
    const slug = disruptionSlugFromHref(link.getAttribute('href'));
    link.classList.toggle('is-current', Boolean(currentKey && slug === currentKey));
  });
}

export function setViewMode(els, mode, options = {}) {
  const { textEl, scanWrap, mobileNav, scanBtn } = els;
  if (!textEl) return;

  textEl.dataset.viewMode = mode;
  const isScanMode = mode === 'scan';
  const hideMobileNav = isScanMode || mode === 'output';

  if (scanWrap) scanWrap.hidden = !isScanMode;
  if (mobileNav) mobileNav.hidden = hideMobileNav;
  textEl.hidden = isScanMode;

  if (scanBtn) {
    scanBtn.classList.toggle('is-scan', isScanMode);
    scanBtn.setAttribute('aria-expanded', isScanMode ? 'true' : 'false');
    scanBtn.setAttribute('aria-pressed', isScanMode ? 'true' : 'false');
  }

  if (isScanMode) setNodePill('NODE: QUERY_PORT');
  else if (mode === 'disruption-list') setNodePill('NODE: DISRUPTION');
  else if (mode === 'output') setNodePill('NODE: OUTPUT');
  else setNodePill('NODE: LOG');

  syncAvailableForMode(mode, options.disruptionTotal);
}

const ENTRY_SCROLL_RESET_RETRY_DELAYS_MS = [0, 60, 80, 180];

export function resetActiveViewScroll(textEl, mobileQuery) {
  if (!textEl) return;

  const panel = textEl.closest?.('#activeViewPanel') || textEl.closest?.('.active-view-panel') || null;
  const pageScroll = document.scrollingElement || document.documentElement || document.body || null;
  const coarsePointer = typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const shouldResetPage = Boolean(mobileQuery?.matches || coarsePointer);
  const scrollTargets = [textEl];
  let cur = textEl.parentElement;
  while (cur) {
    const style = window.getComputedStyle(cur);
    const oy = style.overflowY;
    const canScroll = (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
      cur.scrollHeight > cur.clientHeight;
    if (canScroll) scrollTargets.push(cur);
    if (panel && cur === panel) break;
    cur = cur.parentElement;
  }

  const reset = () => {
    scrollTargets.forEach((node) => {
      node.scrollTop = 0;
      if (typeof node.scrollTo === 'function') {
        node.scrollTo(0, 0);
      }
    });

    if (shouldResetPage) {
      if (pageScroll) pageScroll.scrollTop = 0;
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
      if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
    }
  };

  const activeEl = document.activeElement;
  if (shouldResetPage && activeEl?.classList?.contains('mobile-log-nav-btn')) {
    activeEl.blur();
  }

  reset();
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      reset();
      window.requestAnimationFrame(reset);
    });
  }
  ENTRY_SCROLL_RESET_RETRY_DELAYS_MS.forEach((delay) => {
    window.setTimeout(reset, delay);
  });
}
