// ── State ──────────────────────────────────────────────────────────────────────
let currentPage    = 1;
let currentTotal   = 0;
let currentFilter  = {};
let currentMode    = 'keyword'; // 'keyword' | 'semantic'
const PAGE_SIZE    = 60;

// ── Boot ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadListings();
  loadSavedSearches();
  loadSchedulerStatus();
  loadVectorStatus();
});

// ── Mode toggle ────────────────────────────────────────────────────────────────
function setMode(mode) {
  currentMode = mode;
  const kwBtn  = document.getElementById('modeKeyword');
  const semBtn = document.getElementById('modeSemantic');
  const semBar = document.getElementById('semanticBar');

  if (mode === 'semantic') {
    kwBtn.className  = 'text-xs font-medium px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200';
    semBtn.className = 'text-xs font-medium px-3 py-1.5 rounded-full bg-purple-600 text-white';
    semBar.classList.remove('hidden');
  } else {
    kwBtn.className  = 'text-xs font-medium px-3 py-1.5 rounded-full bg-gray-800 text-white';
    semBtn.className = 'text-xs font-medium px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 hover:bg-purple-50 hover:text-purple-600';
    semBar.classList.add('hidden');
    currentPage = 1;
    loadListings();
  }
}

// ── Vector status ──────────────────────────────────────────────────────────────
async function loadVectorStatus() {
  const data = await api('/api/semantic/status');
  if (!data) return;
  const el = document.getElementById('vectorStatus');
  if (el) {
    el.textContent = data.available
      ? `${data.indexed.toLocaleString()} listings indexed`
      : 'unavailable';
    el.className = `text-[10px] px-2 py-0.5 rounded-full ${
      data.available ? 'bg-purple-50 text-purple-600' : 'bg-red-50 text-red-400'
    }`;
  }
}

// ── Semantic search ────────────────────────────────────────────────────────────
async function runSemanticSearch() {
  const input = document.getElementById('semanticInput');
  const query = input?.value?.trim();
  if (!query) return;

  document.getElementById('listingsGrid').innerHTML = '';
  document.getElementById('resultCount').textContent = 'Searching…';
  document.getElementById('emptyState').classList.add('hidden');

  const data = await api('/api/semantic/search', {
    method: 'POST',
    body:   JSON.stringify({ query, k: 20 }),
  });

  if (!data) return;

  const grid  = document.getElementById('listingsGrid');
  const empty = document.getElementById('emptyState');

  document.getElementById('resultCount').textContent =
    `${data.listings.length} semantic match${data.listings.length !== 1 ? 'es' : ''} for "${escHtml(query)}"`;

  if (!data.listings.length) {
    empty.classList.remove('hidden');
    empty.querySelector('p').textContent = 'No semantic matches found. Try crawling more listings first.';
    return;
  }

  for (const listing of data.listings) {
    grid.insertAdjacentHTML('beforeend', buildCard(listing));
  }

  document.getElementById('loadMoreWrapper').classList.add('hidden');
  loadVectorStatus();
}

// ── Listings ───────────────────────────────────────────────────────────────────
async function loadListings() {
  const params = new URLSearchParams({
    limit:  PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
    ...currentFilter,
  });

  const data = await api(`/api/listings?${params}`);
  if (!data) return;

  currentTotal = data.total;

  const grid  = document.getElementById('listingsGrid');
  const empty = document.getElementById('emptyState');

  document.getElementById('resultCount').textContent =
    `${data.total.toLocaleString()} listing${data.total !== 1 ? 's' : ''} found`;

  grid.innerHTML = '';

  if (!data.listings.length) {
    empty.classList.remove('hidden');
    renderPagination(0);
    return;
  }

  empty.classList.add('hidden');

  for (const listing of data.listings) {
    grid.insertAdjacentHTML('beforeend', buildCard(listing));
  }

  renderPagination(data.total);
}

function goToPage(page) {
  currentPage = page;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadListings();
}

function renderPagination(total) {
  const wrapper    = document.getElementById('paginationWrapper');
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (totalPages <= 1) {
    wrapper.classList.add('hidden');
    wrapper.innerHTML = '';
    return;
  }

  wrapper.classList.remove('hidden');

  const base     = 'min-w-[2rem] h-8 px-2.5 text-sm rounded-lg font-medium transition-colors';
  const active   = `${base} bg-blue-600 text-white`;
  const inactive = `${base} text-gray-600 hover:bg-gray-100`;
  const disabled = `${base} text-gray-300 cursor-not-allowed`;

  const pages = buildPageRange(currentPage, totalPages);
  const parts = [];

  parts.push(currentPage > 1
    ? `<button onclick="goToPage(${currentPage - 1})" class="${inactive}">‹</button>`
    : `<button disabled class="${disabled}">‹</button>`);

  for (const p of pages) {
    if (p === '...') {
      parts.push(`<span class="px-1 text-gray-400 text-sm select-none">…</span>`);
    } else {
      parts.push(`<button onclick="goToPage(${p})" class="${p === currentPage ? active : inactive}">${p}</button>`);
    }
  }

  parts.push(currentPage < totalPages
    ? `<button onclick="goToPage(${currentPage + 1})" class="${inactive}">›</button>`
    : `<button disabled class="${disabled}">›</button>`);

  wrapper.innerHTML = parts.join('');
}

function buildPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4)          return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3)  return [1, '...', total-4, total-3, total-2, total-1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}

function buildCard(l) {
  const timeInfo   = formatTimeRemaining(l.endTime);
  const price      = `$${l.currentPrice.toFixed(2)}`;
  const siteCls    = `site-badge-${l.site}`;
  const siteLabel  = l.site === 'shopgoodwill'         ? 'ShopGoodwill'
                   : l.site === 'govdeals'             ? 'GovDeals'
                   : l.site === 'shopthesalvationarmy' ? 'Salvation Army'
                   : l.site === 'kbid'                 ? 'K-BID'
                   : l.site === 'publicsurplus'        ? 'PublicSurplus'
                   : 'HiBid';
  const imgSrc     = l.imageUrl || 'https://placehold.co/300x200?text=No+Image';
  const title      = escHtml(l.title);
  const bidText    = l.bidCount ? `${l.bidCount} bid${l.bidCount !== 1 ? 's' : ''}` : 'No bids';

  const favCls = l.isFavorite ? 'fav-btn active' : 'fav-btn';
  const favIcon = l.isFavorite ? '♥' : '♡';

  return `
  <div class="card bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 flex flex-col group">
    <div class="relative aspect-[4/3] bg-gray-100 overflow-hidden">
      <a href="${escHtml(l.url)}" target="_blank" rel="noopener noreferrer" class="block w-full h-full">
        <img src="${escHtml(imgSrc)}" alt="${title}"
             class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
             onerror="this.src='https://placehold.co/300x200?text=No+Image'" />
      </a>
      <span class="absolute top-2 left-2 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full ${siteCls}">
        ${siteLabel}
      </span>
      <button class="${favCls}" onclick="toggleFavorite(event,'${escHtml(l.site)}','${escHtml(l.id)}')" title="Favorite">
        ${favIcon}
      </button>
      <button class="del-btn" onclick="deleteListing(event,'${escHtml(l.site)}','${escHtml(l.id)}')" title="Remove">✕</button>
    </div>
    <a href="${escHtml(l.url)}" target="_blank" rel="noopener noreferrer"
       class="p-3 flex flex-col flex-1 gap-1.5 hover:no-underline">
      <p class="text-sm font-medium text-gray-800 leading-snug line-clamp-2" title="${title}">${title}</p>
      <div class="flex items-center justify-between mt-auto pt-1">
        <span class="text-base font-bold text-green-700">${price}</span>
        <span class="text-[10px] font-semibold text-white px-2 py-0.5 rounded-full ${timeInfo.cls}">
          ${timeInfo.label}
        </span>
      </div>
      <p class="text-[11px] text-gray-400">${bidText}${l.category ? ' · ' + escHtml(l.category) : ''}</p>
    </a>
  </div>`;
}

function formatTimeRemaining(isoStr) {
  if (!isoStr) return { label: 'Unknown', cls: 'time-ok' };

  const ms   = new Date(isoStr).getTime() - Date.now();
  const mins = Math.floor(ms / 60_000);

  if (mins < 0)   return { label: 'Ended',   cls: 'bg-gray-400' };
  if (mins < 60)  return { label: `${mins}m`, cls: 'time-urgent' };

  const hrs  = Math.floor(mins / 60);
  if (hrs < 24)   return { label: `${hrs}h`,  cls: 'time-warning' };

  const days = Math.floor(hrs / 24);
  return { label: `${days}d`, cls: 'time-ok' };
}

// ── Favorites ──────────────────────────────────────────────────────────────────
async function deleteListing(e, site, id) {
  e.preventDefault();
  e.stopPropagation();
  const card = e.currentTarget.closest('.card');
  const resp = await fetch(`/api/listings/${site}/${id}`, { method: 'DELETE' });
  if (resp.status === 204) {
    card.remove();
  }
}

async function toggleFavorite(e, site, id) {
  e.preventDefault();
  e.stopPropagation();

  const btn  = e.currentTarget;
  const data = await api(`/api/listings/${site}/${id}/favorite`, { method: 'POST' });
  if (!data) return;

  btn.classList.toggle('active', data.isFavorite);
  btn.textContent = data.isFavorite ? '♥' : '♡';
}

// ── Filter ─────────────────────────────────────────────────────────────────────
function applyFilter(e) {
  e.preventDefault();

  const sites = [];
  if (document.getElementById('f_shopgoodwill').checked)         sites.push('shopgoodwill');
  if (document.getElementById('f_govdeals').checked)             sites.push('govdeals');
  if (document.getElementById('f_shopthesalvationarmy').checked) sites.push('shopthesalvationarmy');
  if (document.getElementById('f_hibid').checked)                sites.push('hibid');
  if (document.getElementById('f_kbid').checked)                 sites.push('kbid');
  if (document.getElementById('f_publicsurplus').checked)        sites.push('publicsurplus');

  currentFilter = {};

  const keyword  = document.getElementById('f_keyword').value.trim();
  const minPrice = document.getElementById('f_minPrice').value;
  const maxPrice = document.getElementById('f_maxPrice').value;
  const ending   = document.getElementById('f_endingWithin').value;
  const sortBy   = document.getElementById('f_sortBy').value;

  if (keyword)  currentFilter.keyword  = keyword;
  if (minPrice) currentFilter.minPrice = minPrice;
  if (maxPrice) currentFilter.maxPrice = maxPrice;
  if (ending)   currentFilter.endingWithinHours = ending;
  if (sortBy)   currentFilter.sortBy   = sortBy;
  if (sites.length < 4) currentFilter.sites = sites.join(',');
  if (document.getElementById('f_favoritesOnly').checked) currentFilter.favoritesOnly = 'true';

  currentPage = 1;
  loadListings();
}

function resetFilter() {
  currentFilter = {};
  document.getElementById('filterForm').reset();
  document.getElementById('f_shopgoodwill').checked         = true;
  document.getElementById('f_govdeals').checked             = true;
  document.getElementById('f_shopthesalvationarmy').checked = true;
  document.getElementById('f_hibid').checked                = true;
  document.getElementById('f_kbid').checked                 = true;
  document.getElementById('f_publicsurplus').checked        = true;
  document.getElementById('f_favoritesOnly').checked        = false;
  currentPage = 1;
  loadListings();
}

// ── Crawl ──────────────────────────────────────────────────────────────────────

// Toggle a crawl-site pill on/off and update the Crawl button label
function toggleCrawlPill(label, site) {
  // Prevent the label's default checkbox toggle so we control it manually
  const cb = label.querySelector('input[type="checkbox"]');
  cb.checked = !cb.checked;
  label.classList.toggle('active', cb.checked);
  updateCrawlBtnLabel();
}

function getSelectedCrawlSites() {
  return ['shopgoodwill', 'shopthesalvationarmy', 'govdeals', 'hibid', 'kbid', 'publicsurplus']
    .filter(s => document.querySelector(`#pill_${s} input`)?.checked);
}

function updateCrawlBtnLabel() {
  const btn = document.getElementById('crawlAllBtn');
  if (!btn || btn.disabled) return;
  const sites = getSelectedCrawlSites();
  if (sites.length === 6 || sites.length === 0) {
    btn.textContent = 'Crawl All';
  } else {
    const labels = { shopgoodwill: 'Good', shopthesalvationarmy: 'Army', govdeals: 'Gov', hibid: 'HiB', kbid: 'K-BID', publicsurplus: 'PuS' };
    btn.textContent = `Crawl ${sites.map(s => labels[s]).join(' + ')}`;
  }
}

async function crawlAll() {
  const sites = getSelectedCrawlSites();
  if (!sites.length) {
    toast('Select at least one site to crawl.', 'error');
    return;
  }

  const btn = document.getElementById('crawlAllBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Crawling…';

  const siteLabel = sites.length === 6 ? 'all sites' : sites.map(s => ({ shopgoodwill:'Good', shopthesalvationarmy:'Army', govdeals:'Gov', hibid:'HiB', kbid:'K-BID', publicsurplus:'PuS' }[s])).join(' + ');
  toast(`Crawling ${siteLabel}…`, 'info');

  const result = await api('/api/crawl/all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sites }),
  });

  btn.disabled = false;
  updateCrawlBtnLabel();

  if (result) {
    const removedStr = result.removed ? `, removed ${result.removed} expired` : '';
    toast(`Done — saved ${result.saved} listings${removedStr}.`, 'success');
    loadListings();
    loadSavedSearches();
    loadSchedulerStatus();
  }
}

async function crawlConfig(id) {
  toast('Crawling…', 'info');
  const result = await api(`/api/crawl/config/${id}`, { method: 'POST' });
  if (result) {
    const removedStr = result.removed ? `, removed ${result.removed} expired` : '';
    toast(`Done — saved ${result.saved} listings${removedStr}.`, 'success');
    loadListings();
    loadSavedSearches();
  }
}

async function cleanupExpired() {
  const btn = document.getElementById('cleanupBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Cleaning…'; }
  const result = await api('/api/crawl/cleanup', { method: 'POST' });
  if (btn) { btn.disabled = false; btn.textContent = 'Clean up expired'; }
  if (result) {
    toast(result.removed ? `Removed ${result.removed} expired listing${result.removed !== 1 ? 's' : ''}.` : 'Nothing to clean up — no expired listings.', result.removed ? 'success' : 'info');
    if (result.removed) loadListings();
  }
}

// ── Saved Searches ─────────────────────────────────────────────────────────────
async function loadSavedSearches() {
  const searches = await api('/api/searches');
  if (!searches) return;

  const list = document.getElementById('savedSearchList');

  if (!searches.length) {
    list.innerHTML = '<p class="text-xs text-gray-400">No saved searches yet.</p>';
    return;
  }

  list.innerHTML = searches.map(s => `
    <div class="rounded-lg p-3 text-sm border ${s.enabled ? 'bg-gray-50 border-transparent' : 'bg-white border-gray-200 opacity-60'}">
      <div class="flex items-start justify-between gap-1">
        <div>
          <div class="flex items-center gap-1.5">
            <p class="font-medium text-gray-800 leading-tight">${escHtml(s.name)}</p>
            ${!s.enabled ? '<span class="text-[9px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Paused</span>' : ''}
          </div>
          <p class="text-xs text-gray-400 mt-0.5">${s.keywords.join(', ')}</p>
          ${s.lastRunAt
            ? `<p class="text-[10px] text-gray-400 mt-1">Last run: ${relativeTime(s.lastRunAt)}</p>`
            : `<p class="text-[10px] text-gray-400 mt-1">Never run</p>`}
        </div>
        <div class="flex flex-col gap-1 shrink-0">
          ${s.enabled
            ? `<button onclick="crawlConfig(${s.id})" class="text-[11px] font-medium text-blue-600 hover:text-blue-800">Run</button>`
            : ''}
          <button onclick="toggleSearch(${s.id}, ${s.enabled})"
            class="text-[11px] font-medium ${s.enabled ? 'text-amber-500 hover:text-amber-700' : 'text-green-600 hover:text-green-800'}">
            ${s.enabled ? 'Pause' : 'Resume'}</button>
          <button onclick="openEditModal(${s.id})"
            class="text-[11px] font-medium text-gray-500 hover:text-gray-800">Edit</button>
          <button onclick="deleteSearch(${s.id})"
            class="text-[11px] font-medium text-red-400 hover:text-red-600">Del</button>
        </div>
      </div>
      ${s.scheduleInterval
        ? `<p class="text-[10px] text-blue-500 mt-1 font-mono">${escHtml(s.scheduleInterval)}</p>`
        : ''}
    </div>
  `).join('');


}


// ── Scheduler Status ───────────────────────────────────────────────────────────
async function loadSchedulerStatus() {
  const status = await api('/api/crawl/scheduler');
  if (!status) return;

  const el = document.getElementById('schedulerStatus');
  if (!status.totalJobs) {
    el.textContent = 'No scheduled jobs running.';
    return;
  }

  el.innerHTML = `<span class="text-green-600 font-medium">${status.totalJobs} job${status.totalJobs !== 1 ? 's' : ''} active</span>` +
    status.jobs.map(j =>
      `<div class="mt-1">${escHtml(j.configName)} <span class="font-mono text-blue-500">${escHtml(j.interval)}</span></div>`
    ).join('');
}

// ── Saved Search Modal ─────────────────────────────────────────────────────────
function openNewSearchModal() {
  document.getElementById('modalTitle').textContent = 'New Search Config';
  document.getElementById('searchForm').reset();
  document.getElementById('s_id').value = '';
  document.getElementById('searchModal').classList.remove('hidden');
}

async function openEditModal(id) {
  const s = await api(`/api/searches/${id}`);
  if (!s) return;

  document.getElementById('modalTitle').textContent = 'Edit Search Config';
  document.getElementById('s_id').value        = s.id;
  document.getElementById('s_name').value      = s.name;
  document.getElementById('s_keywords').value  = s.keywords.join(', ');
  document.getElementById('s_minPrice').value  = s.minPrice ?? '';
  document.getElementById('s_maxPrice').value  = s.maxPrice ?? '';
  document.getElementById('s_endingWithin').value = s.endingWithinHours ?? '';
  document.getElementById('s_schedule').value  = s.scheduleInterval ?? '';
  ['shopgoodwill', 'govdeals', 'shopthesalvationarmy', 'hibid', 'kbid', 'publicsurplus'].forEach(site => {
    const el = document.getElementById(`s_${site}`);
    if (el) el.checked = s.sites?.includes(site) ?? false;
  });
  document.getElementById('searchModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('searchModal').classList.add('hidden');
}

async function saveSearch(e) {
  e.preventDefault();

  const id       = document.getElementById('s_id').value;
  const keywords = document.getElementById('s_keywords').value
    .split(',').map(k => k.trim()).filter(Boolean);

  const body = {
    name:               document.getElementById('s_name').value.trim(),
    keywords,
    categories:         [],
    minPrice:           parseOptionalNumber('s_minPrice'),
    maxPrice:           parseOptionalNumber('s_maxPrice'),
    endingWithinHours:  parseOptionalNumber('s_endingWithin'),
    scheduleInterval:   document.getElementById('s_schedule').value.trim() || undefined,
    sites:              ['shopgoodwill', 'govdeals', 'shopthesalvationarmy', 'hibid', 'kbid', 'publicsurplus']
                          .filter(s => document.getElementById(`s_${s}`)?.checked),
    enabled:            true,
  };

  const url    = id ? `/api/searches/${id}` : '/api/searches';
  const method = id ? 'PUT' : 'POST';
  const result = await api(url, { method, body: JSON.stringify(body) });

  if (result) {
    toast(id ? 'Search updated.' : 'Search saved.', 'success');
    closeModal();
    loadSavedSearches();
    loadSchedulerStatus();
  }
}

async function deleteSearch(id) {
  if (!confirm('Delete this search config?')) return;
  const ok = await fetch(`/api/searches/${id}`, { method: 'DELETE' });
  if (ok.status === 204) {
    toast('Deleted.', 'success');
    loadSavedSearches();
    loadSchedulerStatus();
  }
}

async function toggleSearch(id, currentlyEnabled) {
  const result = await api(`/api/searches/${id}`, {
    method: 'PUT',
    body:   JSON.stringify({ enabled: !currentlyEnabled }),
  });
  if (result) {
    toast(currentlyEnabled ? 'Search paused.' : 'Search resumed.', 'success');
    loadSavedSearches();
    loadSchedulerStatus();
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function api(url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      toast(err.error ?? 'Request failed', 'error');
      return null;
    }
    if (res.status === 204) return true;
    return res.json();
  } catch (err) {
    toast('Network error', 'error');
    return null;
  }
}

function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `show ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3500);
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseOptionalNumber(id) {
  const v = document.getElementById(id).value;
  return v ? Number(v) : undefined;
}

function relativeTime(isoStr) {
  const ms   = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Import URL modal ──────────────────────────────────────────────────────────

function openImportModal() {
  document.getElementById('importUrlInput').value = '';
  document.getElementById('importError').classList.add('hidden');
  document.getElementById('importBtnLabel').textContent = 'Import';
  document.getElementById('importSubmitBtn').disabled = false;
  setImportMode('url');
  document.getElementById('importModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('importUrlInput').focus(), 50);
}

function setImportMode(mode) {
  const isUrl = mode === 'url';
  document.getElementById('importModeUrl').classList.toggle('hidden', !isUrl);
  document.getElementById('importModeManual').classList.toggle('hidden', isUrl);

  const tabUrl    = document.getElementById('importTabUrl');
  const tabManual = document.getElementById('importTabManual');
  tabUrl.className    = `flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${isUrl  ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`;
  tabManual.className = `flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${!isUrl ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`;

  if (!isUrl) setTimeout(() => document.getElementById('m_title').focus(), 50);
}

function closeImportModal() {
  document.getElementById('importModal').classList.add('hidden');
}

async function submitImportUrl(e) {
  e.preventDefault();
  const url     = document.getElementById('importUrlInput').value.trim();
  const errEl   = document.getElementById('importError');
  const btnLabel = document.getElementById('importBtnLabel');
  const submitBtn = document.getElementById('importSubmitBtn');

  errEl.classList.add('hidden');
  btnLabel.textContent = 'Importing…';
  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/listings/import-url', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error ?? 'Import failed';
      errEl.classList.remove('hidden');
      return;
    }
    closeImportModal();
    showToast(`Imported: ${data.title?.slice(0, 60)}`, 'success');
    loadListings(); // refresh the grid
  } catch (err) {
    errEl.textContent = 'Network error — try again';
    errEl.classList.remove('hidden');
  } finally {
    btnLabel.textContent = 'Import';
    submitBtn.disabled = false;
  }
}

async function submitManualEntry(e) {
  e.preventDefault();
  const errEl = document.getElementById('manualError');
  errEl.classList.add('hidden');

  const body = {
    site:     document.getElementById('m_site').value,
    title:    document.getElementById('m_title').value.trim(),
    url:      document.getElementById('m_url').value.trim(),
    price:    document.getElementById('m_price').value,
    endTime:  document.getElementById('m_endTime').value,   // datetime-local → "YYYY-MM-DDTHH:MM"
    imageUrl: document.getElementById('m_imageUrl').value.trim(),
  };

  try {
    const res = await fetch('/api/listings/manual', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error ?? 'Save failed';
      errEl.classList.remove('hidden');
      return;
    }
    closeImportModal();
    showToast(`Added: ${data.title?.slice(0, 60)}`, 'success');
    loadListings();
  } catch {
    errEl.textContent = 'Network error — try again';
    errEl.classList.remove('hidden');
  }
}

// Close modals on backdrop click
document.getElementById('searchModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

document.getElementById('importModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeImportModal();
});

// Enter key in semantic search input
document.getElementById('semanticInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') runSemanticSearch();
});
