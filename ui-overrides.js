(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];


  const NativeAudio = window.Audio;
  let pendingPreviewId = null;
  let activePreviewId = null;
  let activePreviewAudio = null;

  function currentSelectedVoiceId(){
    return localStorage.getItem('kpnc:selectedVoice') || $('[data-voice-card].selected')?.dataset.voiceCard || null;
  }

  function refreshPreviewButtons(){
    $$('[data-preview-voice], [data-fish-preview]').forEach(btn => {
      const id = btn.dataset.previewVoice || btn.dataset.fishPreview;
      const active = activePreviewAudio && activePreviewId === id;
      btn.textContent = active && !activePreviewAudio.paused ? '❚❚' : '▶';
      btn.setAttribute('aria-label', active && !activePreviewAudio.paused ? 'Pausar prévia' : active ? 'Continuar prévia' : 'Ouvir prévia');
    });
    const studio = $('#previewSelectedBtn');
    if(studio){
      const active = activePreviewAudio && activePreviewId === currentSelectedVoiceId();
      studio.textContent = active && !activePreviewAudio.paused ? 'Pausar prévia' : active ? 'Continuar prévia' : 'Ouvir prévia';
    }
  }

  function clearTrackedPreview(audio){
    if(activePreviewAudio !== audio) return;
    activePreviewAudio = null;
    activePreviewId = null;
    refreshPreviewButtons();
  }

  function TrackedAudio(src){
    const audio = new NativeAudio(src);
    if(pendingPreviewId){
      const id = pendingPreviewId;
      pendingPreviewId = null;
      activePreviewId = id;
      activePreviewAudio = audio;
      audio.addEventListener('ended', () => clearTrackedPreview(audio), {once:true});
      audio.addEventListener('error', () => clearTrackedPreview(audio), {once:true});
      const nativePlay = audio.play.bind(audio);
      audio.play = (...args) => {
        const result = nativePlay(...args);
        Promise.resolve(result).finally(() => refreshPreviewButtons());
        return result;
      };
      const nativePause = audio.pause.bind(audio);
      audio.pause = (...args) => {
        const result = nativePause(...args);
        queueMicrotask(refreshPreviewButtons);
        return result;
      };
    }
    return audio;
  }
  TrackedAudio.prototype = NativeAudio.prototype;
  window.Audio = TrackedAudio;

  document.addEventListener('click', e => {
    const cardBtn = e.target.closest?.('[data-preview-voice]');
    const cloudBtn = e.target.closest?.('[data-fish-preview]');
    const studioBtn = e.target.closest?.('#previewSelectedBtn');
    if(!cardBtn && !cloudBtn && !studioBtn) return;
    const id = cardBtn?.dataset.previewVoice || cloudBtn?.dataset.fishPreview || currentSelectedVoiceId();
    if(!id) return;

    if(activePreviewAudio && activePreviewId === id){
      e.preventDefault();
      e.stopImmediatePropagation();
      if(activePreviewAudio.paused){
        activePreviewAudio.play().catch(() => {});
      } else {
        activePreviewAudio.pause();
      }
      refreshPreviewButtons();
      return;
    }

    if(activePreviewAudio){
      try{ activePreviewAudio.pause(); activePreviewAudio.currentTime = 0; }catch{}
      activePreviewAudio = null;
      activePreviewId = null;
    }
    pendingPreviewId = id;
    refreshPreviewButtons();
  }, true);

  const replacements = [
    [/Fish Audio/gi, 'Voice Cloud'],
    [/Fish API/gi, 'Voice Cloud'],
    [/Fish Voices/gi, 'Voice Cloud'],
    [/Fish S2\.1(?: Pro)?/gi, 'Studio Cloud'],
    [/Fish/gi, 'Voice Cloud'],
    [/Kokoro\/Vozz/gi, 'motor local'],
    [/Vozz\/Kokoro/gi, 'motor local'],
    [/Kokoro\.js/gi, 'motor local'],
    [/Kokoro/gi, 'motor local'],
    [/Vozz/gi, 'motor local'],
    [/Cloudflare Worker/gi, 'serviço protegido'],
    [/backend/gi, 'serviço'],
    [/FISH_API_KEY/g, 'chave privada'],
    [/reference_id/gi, 'perfil persistente'],
    [/WASM/gi, 'local'],
  ];

  function injectVisualFixes() {
    if ($('#kpnc-visual-fixes')) return;
    const style = document.createElement('style');
    style.id = 'kpnc-visual-fixes';
    style.textContent = `
      :root{
        --bg:#0f0f11!important;
        --surface:#171719!important;
        --surface-2:#202024!important;
        --elev:#1c1c20!important;
        --text:#f3f1f6!important;
        --muted:#9f9aa9!important;
        --line:rgba(255,255,255,.08)!important;
        --brand:#8b5cf6!important;
        --brand-2:#f59e0b!important;
        --shadow:0 18px 46px rgba(0,0,0,.28)!important;
      }
      html[data-theme="light"]{
        --bg:#f5f2ef!important;
        --surface:#ffffff!important;
        --surface-2:#f0ece8!important;
        --elev:#faf8f6!important;
        --text:#242027!important;
        --muted:#6f6876!important;
        --line:rgba(42,34,47,.10)!important;
        --brand:#7c3aed!important;
        --brand-2:#d97706!important;
        --shadow:0 14px 36px rgba(55,43,64,.10)!important;
      }
      html,body{
        background:
          radial-gradient(circle at 92% 4%,rgba(139,92,246,.11),transparent 26%),
          radial-gradient(circle at 55% 100%,rgba(245,158,11,.055),transparent 30%),
          var(--bg)!important;
      }
      .sidebar{background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.008))!important}
      .brand-logo,.primary-btn{background:linear-gradient(135deg,#7c3aed,#b65fcf)!important}
      .primary-btn{box-shadow:0 10px 25px rgba(124,58,237,.20)!important}
      .theme-dot,.progress-bar{background:linear-gradient(90deg,#8b5cf6,#f59e0b)!important}
      .hero{
        background:linear-gradient(135deg,rgba(139,92,246,.105),rgba(245,158,11,.045))!important;
        border-color:rgba(139,92,246,.14)!important;
      }
      .hero-grid{grid-template-columns:minmax(0,1fr)!important}
      .hero-art-panel{display:none!important}
      .hero h2{max-width:15ch!important}
      .voice-card:hover{border-color:rgba(139,92,246,.26)!important}
      .voice-card.selected,.voice-card.custom-card-selected{outline-color:rgba(139,92,246,.62)!important}
      .filter-chip.active,.filter-chip:hover{background:rgba(139,92,246,.10)!important;border-color:rgba(139,92,246,.30)!important}
      .selected-voice-art{background:linear-gradient(135deg,#4c1d95,#a855f7)!important}
      .custom-selected-icon{background:linear-gradient(135deg,#7c3aed,#c084fc)!important}
      .voice-art{background:#242126!important}
      .voice-cover{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}
      .voice-sub,.selected-sub{display:flex!important;align-items:center!important;gap:7px!important;flex-wrap:wrap!important}
      .flag-icon{width:22px!important;height:15px!important;object-fit:cover!important;border-radius:3px!important;display:inline-block!important;flex:0 0 auto!important;box-shadow:0 0 0 1px rgba(0,0,0,.10)!important}
      .flag-all{display:inline-grid!important;place-items:center!important;width:20px!important;height:16px!important;font-size:11px!important;color:var(--muted)!important}
      .filter-chip{display:inline-flex!important;align-items:center!important;gap:7px!important}
      .stat-flag{display:flex!important;align-items:center!important;min-height:22px!important}
      .stat-flag .flag-icon{width:28px!important;height:19px!important}
      .voice-play{font-size:15px!important;font-weight:800!important}
      #fishVoiceGrid .voice-art img{background:#272329!important}
      #fishVoiceGrid .voice-card{background:linear-gradient(180deg,var(--surface),#1b191d)!important}
      html[data-theme="light"] #fishVoiceGrid .voice-card{background:linear-gradient(180deg,var(--surface),#f8f5f2)!important}
      .fish-rights-callout,.custom-callout{border-color:rgba(245,158,11,.17)!important;background:rgba(245,158,11,.045)!important}
      .engine-pill.ready,.custom-engine-state.online{color:#b8e3c9!important;background:rgba(72,160,108,.09)!important;border-color:rgba(72,160,108,.20)!important}
      .searchbox:focus-within,.text-input:focus,.text-area:focus{border-color:rgba(139,92,246,.30)!important;box-shadow:0 0 0 3px rgba(139,92,246,.055)!important}
      .visually-hidden-monogram{opacity:0!important;position:absolute!important;pointer-events:none!important}
    `;
    document.head.appendChild(style);
  }

  function rewriteText(root = document.body) {
    if (!root) return;
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

  function removeDecorativeHero() {
    $('.hero-art-panel')?.remove();
  }

  function applyMarketingCopy() {
    const hero = $('#view-discovery .hero p');
    if (hero) hero.textContent = 'Explore perfis, ouça prévias e leve qualquer voz direto ao estúdio.';
    const engine = $('#enginePill');
    if (engine && /IA|motor local|motor inglês|PT-BR|WASM/i.test(engine.textContent)) engine.textContent = 'Modo local pronto';
  }

  function avatarUrl(name, id = '') {
    const seed = encodeURIComponent(`${name || 'Voice'}-${id || ''}`);
    return `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${seed}`;
  }

  function setupFallback(img, name, id) {
    if (!img || img.dataset.kpncFallbackBound === '1') return;
    img.dataset.kpncFallbackBound = '1';
    const fallback = () => {
      if (img.dataset.kpncUsingFallback === '1') return;
      img.dataset.kpncUsingFallback = '1';
      img.src = avatarUrl(name, id);
    };
    img.addEventListener('error', fallback);
    if (img.complete && img.naturalWidth === 0) fallback();
  }

  function decorateVoiceCards() {
    $$('[data-voice-card]').forEach(card => {
      const art = $('.voice-art', card); if (!art) return;
      const name = $('.voice-name', card)?.textContent?.trim() || card.dataset.voiceCard || 'Voice';
      let img = $('img.injected-cover', art);
      if (!img) {
        img = document.createElement('img');
        img.className = 'voice-cover injected-cover';
        img.alt = `Imagem da voz ${name}`;
        img.referrerPolicy = 'no-referrer';
        img.src = avatarUrl(name, card.dataset.voiceCard || name);
        art.prepend(img);
      }
      $('.voice-monogram', art)?.classList.add('visually-hidden-monogram');
    });

    $$('[data-fish-card]').forEach(card => {
      const art = $('.voice-art', card); if (!art) return;
      const name = $('.voice-name', card)?.textContent?.trim() || 'Voice';
      let img = $('img', art);
      if (!img) {
        img = document.createElement('img');
        img.className = 'voice-cover injected-cover';
        img.alt = `Imagem da voz ${name}`;
        img.referrerPolicy = 'no-referrer';
        img.src = avatarUrl(name, card.dataset.fishCard || name);
        art.prepend(img);
      }
      setupFallback(img, name, card.dataset.fishCard || name);
      $('.voice-monogram', art)?.classList.add('visually-hidden-monogram');
    });
  }


  function escapeHTML(value){
    return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function flagImage(code){
    return `<img class="flag-icon" src="https://flagcdn.com/w40/${code}.png" srcset="https://flagcdn.com/w80/${code}.png 2x" alt="" aria-hidden="true" loading="lazy">`;
  }

  function stripFlagEmoji(text){
    return String(text || '').replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu,'').trim();
  }

  function fixFlags(){
    $$('[data-voice-card] .voice-sub').forEach(el => {
      if(el.querySelector('.flag-icon')) return;
      const text = stripFlagEmoji(el.textContent);
      let code = null;
      if(/Português BR/i.test(text)) code = 'br';
      else if(/Inglês EUA/i.test(text)) code = 'us';
      else if(/Inglês UK/i.test(text)) code = 'gb';
      if(code) el.innerHTML = `${flagImage(code)}<span>${escapeHTML(text)}</span>`;
    });

    $$('#languageFilters [data-language]').forEach(btn => {
      const lang = btn.dataset.language;
      if(lang === 'all' || btn.querySelector('.flag-icon')) return;
      const code = lang === 'p' ? 'br' : lang === 'a' ? 'us' : lang === 'b' ? 'gb' : null;
      if(!code) return;
      const text = stripFlagEmoji(btn.textContent);
      btn.innerHTML = `${flagImage(code)}<span>${escapeHTML(text)}</span>`;
    });

    const selectedSub = $('#selectedVoicePanel .selected-sub');
    if(selectedSub && !selectedSub.querySelector('.flag-icon')){
      const text = stripFlagEmoji(selectedSub.textContent);
      let code = /Português BR/i.test(text) ? 'br' : /Inglês EUA/i.test(text) ? 'us' : /Inglês UK/i.test(text) ? 'gb' : null;
      if(code) selectedSub.innerHTML = `${flagImage(code)}<span>${escapeHTML(text)}</span>`;
      const stat = $('#selectedVoicePanel .stat:first-child strong');
      if(stat && code) stat.innerHTML = flagImage(code);
    }
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('kpnc:theme', theme);
    if ($('#themeToggleText')) $('#themeToggleText').textContent = theme === 'light' ? 'Light' : 'Dark';
    if ($('#settingsTheme')) $('#settingsTheme').textContent = theme === 'light' ? 'Light' : 'Dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5f2ef' : '#0f0f11');
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
      removeDecorativeHero();
      rewriteText();
      applyMarketingCopy();
      decorateVoiceCards();
      fixFlags();
      refreshPreviewButtons();
    });
  }

  injectVisualFixes();
  setupTheme();
  refresh();
  new MutationObserver(refresh).observe(document.body, {subtree:true, childList:true, characterData:true});
})();