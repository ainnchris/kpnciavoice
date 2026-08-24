window.KPNC_FISH_API_BASE = 'https://kpnc-voice-api.erikchristian2.workers.dev';

(() => {
  const nativeFetch = window.fetch.bind(window);
  const apiBase = String(window.KPNC_FISH_API_BASE || '').replace(/\/+$/, '');
  let apiOrigin = '';
  try { apiOrigin = new URL(apiBase).origin; } catch {}

  const catalog = window.KPNC_VOICE_CLOUD_CATALOG = {
    pages: 1,
    pageSize: 100,
    maxPages: 50,
    total: 0,
    loaded: 0,
    hasMore: false,
    loading: false,
  };

  function injectCompactCloudStyle() {
    if (document.querySelector('#kpnc-cloud-compact-style')) return;
    const style = document.createElement('style');
    style.id = 'kpnc-cloud-compact-style';
    style.textContent = `
      #view-custom .fish-library-panel,
      #view-custom .catalog-panel { padding:14px!important; }

      #view-custom .fish-toolbar-head { margin-bottom:10px!important; }
      #view-custom .fish-toolbar-head h3,
      #view-custom .fish-toolbar-head h2 { font-size:18px!important; margin:3px 0!important; }
      #view-custom .fish-toolbar-head .status-text,
      #view-custom #fishBackendNote { font-size:11px!important; }

      #view-custom .fish-filters,
      #view-custom .catalog-toolbar { gap:8px!important; margin-bottom:8px!important; }
      #view-custom .fish-filters .searchbox,
      #view-custom .fish-filters .text-input,
      #view-custom .fish-filters .custom-select,
      #view-custom .fish-filters .fish-toggle,
      #view-custom .fish-filters .toggle-inline { min-height:38px!important; height:38px!important; border-radius:11px!important; font-size:12px!important; }
      #view-custom .fish-filters .searchbox { padding:0 11px!important; }

      #view-custom .fish-list-summary,
      #view-custom .catalog-meta { margin:6px 0 8px!important; font-size:10px!important; }

      #view-custom #fishVoiceGrid {
        display:grid!important;
        grid-template-columns:repeat(3,minmax(250px,1fr))!important;
        gap:4px 14px!important;
      }

      #view-custom #fishVoiceGrid .voice-card {
        display:grid!important;
        grid-template-columns:48px minmax(0,1fr)!important;
        align-items:center!important;
        column-gap:10px!important;
        min-height:68px!important;
        padding:7px 6px!important;
        border-radius:12px!important;
        border:1px solid transparent!important;
        background:transparent!important;
        box-shadow:none!important;
        transform:none!important;
      }

      #view-custom #fishVoiceGrid .voice-card:hover {
        background:rgba(255,255,255,.035)!important;
        border-color:var(--line)!important;
        transform:none!important;
      }
      html[data-theme='light'] #view-custom #fishVoiceGrid .voice-card:hover { background:rgba(25,20,30,.035)!important; }

      #view-custom #fishVoiceGrid .voice-card.custom-card-selected {
        outline:1px solid rgba(139,92,246,.55)!important;
        outline-offset:0!important;
        background:rgba(139,92,246,.055)!important;
      }

      #view-custom #fishVoiceGrid .voice-art {
        grid-column:1!important;
        width:46px!important;
        height:46px!important;
        min-height:46px!important;
        max-height:46px!important;
        aspect-ratio:1/1!important;
        border-radius:50%!important;
        overflow:visible!important;
        align-self:center!important;
        background:#252229!important;
        box-shadow:none!important;
      }
      #view-custom #fishVoiceGrid .voice-art::after { display:none!important; }
      #view-custom #fishVoiceGrid .voice-art img,
      #view-custom #fishVoiceGrid .voice-cover {
        width:46px!important;
        height:46px!important;
        min-width:46px!important;
        min-height:46px!important;
        border-radius:50%!important;
        object-fit:cover!important;
        display:block!important;
        background:#252229!important;
        box-shadow:0 0 0 1px var(--line)!important;
      }
      #view-custom #fishVoiceGrid .voice-monogram { display:none!important; }

      #view-custom #fishVoiceGrid .voice-play {
        position:absolute!important;
        right:-4px!important;
        bottom:-4px!important;
        width:23px!important;
        height:23px!important;
        min-width:23px!important;
        border-radius:50%!important;
        padding:0!important;
        font-size:10px!important;
        display:grid!important;
        place-items:center!important;
        background:rgba(20,18,22,.90)!important;
        border:1px solid rgba(255,255,255,.14)!important;
      }

      #view-custom #fishVoiceGrid .voice-meta {
        grid-column:2!important;
        display:flex!important;
        align-items:center!important;
        justify-content:space-between!important;
        gap:8px!important;
        min-width:0!important;
      }
      #view-custom #fishVoiceGrid .voice-meta > div { min-width:0!important; }
      #view-custom #fishVoiceGrid .voice-name {
        font-size:12px!important;
        line-height:1.25!important;
        font-weight:750!important;
        white-space:nowrap!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        max-width:100%!important;
      }
      #view-custom #fishVoiceGrid .voice-sub {
        display:block!important;
        margin-top:3px!important;
        font-size:9.5px!important;
        line-height:1.25!important;
        color:var(--muted)!important;
        white-space:nowrap!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        max-width:100%!important;
      }
      #view-custom #fishVoiceGrid .fish-use-count {
        flex:0 0 auto!important;
        font-size:9px!important;
        color:var(--muted)!important;
      }

      #kpncCloudPagination { margin:10px 0 0!important; }
      #kpncCloudPagination .secondary-btn { min-height:34px!important; height:34px!important; padding:0 12px!important; border-radius:10px!important; font-size:11px!important; }
      #kpncCloudPaginationText { font-size:10px!important; }

      @media (max-width:1200px) {
        #view-custom #fishVoiceGrid { grid-template-columns:repeat(2,minmax(250px,1fr))!important; }
      }
      @media (max-width:720px) {
        #view-custom #fishVoiceGrid { grid-template-columns:1fr!important; }
      }
    `;
    document.head.appendChild(style);
  }

  function genericCover(name = 'Voice', id = '') {
    let hash = 0;
    for (const ch of `${name}-${id}`) hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0;
    const palettes = [
      ['#302d36','#6b5f78'], ['#25282c','#56616c'], ['#342b2b','#7b5b4c'],
      ['#252d2a','#567063'], ['#2f2935','#695871'], ['#302d27','#77654f']
    ];
    const [a,b] = palettes[hash % palettes.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="160" height="160" rx="80" fill="url(#g)"/><g stroke="rgba(255,255,255,.76)" stroke-width="8" stroke-linecap="round"><path d="M48 87V73"/><path d="M64 101V59"/><path d="M80 111V49"/><path d="M96 99V61"/><path d="M112 87V73"/></g></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function normalizeCoverUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (value.startsWith('//')) return `https:${value}`;
    if (value.startsWith('/')) return `https://fish.audio${value}`;
    return value;
  }

  function ensureOfficialCover(card) {
    const art = card?.querySelector('.voice-art');
    if (!art) return;
    const name = card.querySelector('.voice-name')?.textContent?.trim() || 'Voice';
    const id = card.dataset.fishCard || name;
    let img = art.querySelector('img');

    if (!img) {
      img = document.createElement('img');
      img.className = 'voice-cover kpnc-generic-cover';
      img.alt = '';
      img.src = genericCover(name, id);
      img.dataset.kpncGenericCover = '1';
      img.dataset.kpncFallbackBound = '1';
      art.prepend(img);
      return;
    }

    img.removeAttribute('referrerpolicy');
    img.referrerPolicy = '';

    const raw = normalizeCoverUrl(img.getAttribute('src'));
    if (raw && raw !== img.getAttribute('src')) img.src = raw;

    if (/api\.dicebear\.com/i.test(img.src)) {
      img.src = genericCover(name, id);
      img.dataset.kpncGenericCover = '1';
    }

    if (img.dataset.kpncOfficialCoverGuard === '1') return;
    img.dataset.kpncOfficialCoverGuard = '1';

    img.addEventListener('error', () => {
      setTimeout(() => {
        if (!img.isConnected) return;
        img.src = genericCover(name, id);
        img.dataset.kpncGenericCover = '1';
        img.dataset.kpncFallbackBound = '1';
      }, 0);
    });
  }

  function refreshCloudCovers(root = document) {
    root.querySelectorAll?.('#fishVoiceGrid [data-fish-card]').forEach(ensureOfficialCover);
  }

  injectCompactCloudStyle();
  const coverObserver = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('#fishVoiceGrid [data-fish-card]')) ensureOfficialCover(node);
        refreshCloudCovers(node);
      }
    }
  });
  coverObserver.observe(document.documentElement, { childList:true, subtree:true });

  function isVoiceListRequest(url, init) {
    if (!apiOrigin || url.origin !== apiOrigin) return false;
    if (url.pathname !== '/api/voices') return false;
    const method = String(init?.method || 'GET').toUpperCase();
    return method === 'GET';
  }

  function pageUrl(baseUrl, pageNumber) {
    const url = new URL(baseUrl.toString());
    url.searchParams.set('page_size', String(catalog.pageSize));
    url.searchParams.set('page_number', String(pageNumber));
    return url;
  }

  function mergeItems(pages) {
    const byId = new Map();
    for (const data of pages) {
      const items = Array.isArray(data?.items) ? data.items : [];
      for (const item of items) {
        const id = item?.id || item?._id;
        if (id && !byId.has(id)) byId.set(id, item);
      }
    }
    return [...byId.values()];
  }

  window.fetch = async function kpncExpandedCatalogFetch(input, init = {}) {
    const rawUrl = input instanceof Request ? input.url : String(input);
    let url;
    try { url = new URL(rawUrl, location.href); } catch { return nativeFetch(input, init); }

    if (!isVoiceListRequest(url, init)) return nativeFetch(input, init);

    const requestedPage = Number.parseInt(url.searchParams.get('page_number') || '1', 10) || 1;
    if (requestedPage !== 1) return nativeFetch(input, init);

    catalog.loading = true;
    updateCatalogControls();

    try {
      const firstResponse = await nativeFetch(pageUrl(url, 1).toString(), init);
      if (!firstResponse.ok) return firstResponse;

      const firstData = await firstResponse.clone().json();
      const total = Math.max(0, Number(firstData?.total || 0));
      const totalPages = Math.max(1, Math.ceil(total / catalog.pageSize));
      const pagesToLoad = Math.max(1, Math.min(catalog.pages, totalPages, catalog.maxPages));
      const pageData = [firstData];

      if (pagesToLoad > 1) {
        const requests = [];
        for (let page = 2; page <= pagesToLoad; page++) {
          requests.push(
            nativeFetch(pageUrl(url, page).toString(), init)
              .then(async response => response.ok ? response.json() : null)
              .catch(() => null)
          );
        }
        const rest = await Promise.all(requests);
        for (const data of rest) if (data) pageData.push(data);
      }

      const items = mergeItems(pageData);
      catalog.total = total || items.length;
      catalog.loaded = items.length;
      catalog.hasMore = catalog.loaded < catalog.total && catalog.pages < catalog.maxPages;

      const merged = {
        ...firstData,
        total: catalog.total,
        items,
        page_number: 1,
        page_size: catalog.pageSize,
        has_more: catalog.hasMore,
      };

      setTimeout(updateCatalogControls, 80);
      return new Response(JSON.stringify(merged), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    } finally {
      catalog.loading = false;
      setTimeout(updateCatalogControls, 100);
    }
  };

  function resetCatalogPages() {
    if (catalog.pages === 1) return;
    catalog.pages = 1;
    catalog.loaded = 0;
    catalog.hasMore = false;
    updateCatalogControls();
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function updateCatalogControls() {
    const grid = document.querySelector('#fishVoiceGrid');
    if (!grid) return;

    refreshCloudCovers(document);

    let wrap = document.querySelector('#kpncCloudPagination');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'kpncCloudPagination';
      wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;margin:10px 0 2px;';
      wrap.innerHTML = '<span id="kpncCloudPaginationText" class="status-text"></span><button id="kpncCloudLoadMore" class="secondary-btn" type="button">Carregar mais vozes</button>';
      grid.insertAdjacentElement('afterend', wrap);

      wrap.querySelector('#kpncCloudLoadMore')?.addEventListener('click', () => {
        if (catalog.loading || !catalog.hasMore) return;
        catalog.pages = Math.min(catalog.pages + 1, catalog.maxPages);
        const refresh = document.querySelector('#fishRefreshBtn');
        if (refresh) refresh.click();
      });
    }

    const text = wrap.querySelector('#kpncCloudPaginationText');
    const button = wrap.querySelector('#kpncCloudLoadMore');
    const loaded = catalog.loaded || document.querySelectorAll('#fishVoiceGrid [data-fish-card]').length;
    const total = catalog.total || loaded;

    const statusText = catalog.loading
      ? 'Carregando catálogo...'
      : total > loaded
        ? `${loaded.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} vozes carregadas`
        : `${loaded.toLocaleString('pt-BR')} vozes carregadas`;
    setText(text, statusText);

    if (button) {
      button.disabled = catalog.loading || !catalog.hasMore;
      setText(button, catalog.loading ? 'Carregando...' : catalog.hasMore ? `Carregar mais ${catalog.pageSize}` : 'Todas carregadas');
      button.style.display = total > catalog.pageSize || catalog.hasMore ? '' : 'none';
    }

    const note = document.querySelector('#fishBackendNote');
    if (note && /48 por busca|modelos encontrados|vozes disponíveis|vozes encontradas no catálogo|vozes carregadas do catálogo/i.test(note.textContent || '')) {
      setText(note, total > loaded
        ? `${total.toLocaleString('pt-BR')} vozes encontradas no catálogo. ${loaded.toLocaleString('pt-BR')} carregadas agora.`
        : `${loaded.toLocaleString('pt-BR')} vozes carregadas do catálogo.`);
    }
  }

  document.addEventListener('input', event => {
    if (event.target?.matches?.('#fishVoiceSearch')) resetCatalogPages();
  }, true);

  document.addEventListener('change', event => {
    if (event.target?.matches?.('#fishLanguage, #fishSort, #fishLicensedOnly')) resetCatalogPages();
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    refreshCloudCovers(document);
    updateCatalogControls();
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        refreshCloudCovers(document);
        updateCatalogControls();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
