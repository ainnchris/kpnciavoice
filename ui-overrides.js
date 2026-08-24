(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const replacements = [
    [/Fish Audio/gi, 'Voice Cloud'],
    [/Fish API/gi, 'Voice Cloud'],
    [/Fish Voices/gi, 'Voice Cloud'],
    [/Fish S2\.1/gi, 'Studio Cloud'],
    [/Fish/gi, 'Voice Cloud'],
    [/Kokoro\/Vozz/gi, 'motor local'],
    [/Vozz\/Kokoro/gi, 'motor local'],
    [/Kokoro\.js/gi, 'motor local'],
    [/Kokoro/gi, 'motor local'],
    [/Vozz/gi, 'motor local'],
    [/FISH_API_KEY/g, 'chave privada'],
    [/reference_id/gi, 'perfil persistente'],
  ];

  function rewriteText(root = document.body) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement?.closest('script,style,code')) continue;
      let next = node.nodeValue;
      for (const [rx, value] of replacements) next = next.replace(rx, value);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
  }

  function applyMarketingCopy() {
    const hero = $('#view-discovery .hero p');
    if (hero) hero.textContent = 'Uma biblioteca visual para explorar perfis, ouvir prévias e levar qualquer voz direto ao estúdio.';
    const engine = $('#enginePill');
    if (engine && /IA|motor local|motor inglês|PT-BR/i.test(engine.textContent)) engine.textContent = 'Modo local pronto';
  }

  function gradient(seed = 'voice') {
    const pairs = [['#695cff','#3cb7ff'],['#f66092','#ffa54f'],['#24c4a6','#7ee676'],['#865fff','#d75cff'],['#2a84ff','#69d3ff'],['#7b5cff','#ff7196'],['#2ea77a','#5bd5c4'],['#8d59ff','#54a9ff']];
    let hash = 0; for (const c of seed) hash = ((hash * 31) + c.charCodeAt(0)) >>> 0;
    return pairs[hash % pairs.length];
  }

  function cardSvg(name, label, seed) {
    const [a,b] = gradient(seed);
    const parts = String(name || 'Voice').trim().split(/\s+/);
    const initials = ((parts[0]?.[0] || 'V') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
    const esc = s => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="640" height="480" rx="42" fill="url(#g)"/><circle cx="520" cy="110" r="130" fill="rgba(255,255,255,.14)"/><circle cx="110" cy="410" r="150" fill="rgba(0,0,0,.08)"/><rect x="48" y="50" width="544" height="380" rx="30" fill="rgba(8,12,24,.14)" stroke="rgba(255,255,255,.24)"/><text x="320" y="202" text-anchor="middle" fill="white" font-size="112" font-weight="800" font-family="Inter,Arial">${esc(initials)}</text><text x="320" y="282" text-anchor="middle" fill="white" font-size="34" font-weight="800" font-family="Inter,Arial">${esc(name)}</text><text x="320" y="326" text-anchor="middle" fill="rgba(255,255,255,.84)" font-size="18" font-weight="700" letter-spacing="2" font-family="Inter,Arial">${esc(label)}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function decorateVoiceCards() {
    $$('[data-voice-card]').forEach(card => {
      const art = $('.voice-art', card); if (!art || art.querySelector('.injected-cover')) return;
      const name = $('.voice-name', card)?.textContent?.trim() || card.dataset.voiceCard;
      const sub = $('.voice-sub', card)?.textContent?.split('·')[0]?.trim() || 'VOICE';
      const img = document.createElement('img'); img.className = 'voice-cover injected-cover'; img.alt = `Capa da voz ${name}`; img.src = cardSvg(name, sub, card.dataset.voiceCard || name);
      art.prepend(img);
      $('.voice-monogram', art)?.classList.add('visually-hidden-monogram');
    });
    $$('[data-fish-card]').forEach(card => {
      const art = $('.voice-art', card); if (!art || art.querySelector('img')) return;
      const name = $('.voice-name', card)?.textContent?.trim() || 'Voice';
      const sub = $('.voice-sub', card)?.textContent?.split('·')[0]?.trim() || 'VOICE CLOUD';
      const img = document.createElement('img'); img.className = 'voice-cover injected-cover'; img.alt = `Capa da voz ${name}`; img.src = cardSvg(name, sub, card.dataset.fishCard || name);
      art.prepend(img);
      $('.voice-monogram', art)?.classList.add('visually-hidden-monogram');
    });
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('kpnc:theme', theme);
    $('#themeToggleText') && ($('#themeToggleText').textContent = theme === 'light' ? 'Light' : 'Dark');
    $('#settingsTheme') && ($('#settingsTheme').textContent = theme === 'light' ? 'Light' : 'Dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5f7fb' : '#0b1020');
  }

  function setupTheme() {
    setTheme(localStorage.getItem('kpnc:theme') || 'dark');
    $('#themeToggle')?.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    $('#mobileMenuTop')?.addEventListener('click', () => $('#sidebar')?.classList.toggle('open'));
    $('#heroStudioSecondary')?.addEventListener('click', () => document.querySelector('[data-view-target="studio"]')?.click());
  }

  let scheduled = false;
  function refresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      rewriteText();
      applyMarketingCopy();
      decorateVoiceCards();
    });
  }

  setupTheme();
  refresh();
  new MutationObserver(refresh).observe(document.body, {subtree:true, childList:true, characterData:true});
})();
