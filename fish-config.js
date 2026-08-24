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

    let wrap = document.querySelector('#kpncCloudPagination');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'kpncCloudPagination';
      wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;margin:18px 0 2px;';
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
    updateCatalogControls();
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        updateCatalogControls();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
