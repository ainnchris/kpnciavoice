const VOICES = [
  ["pf_dora", "p", "F"], ["pm_alex", "p", "M"], ["pm_santa", "p", "M"],
  ["af_alloy", "a", "F"], ["af_aoede", "a", "F"], ["af_bella", "a", "F"], ["af_heart", "a", "F"], ["af_jessica", "a", "F"], ["af_kore", "a", "F"], ["af_nicole", "a", "F"], ["af_nova", "a", "F"], ["af_river", "a", "F"], ["af_sarah", "a", "F"], ["af_sky", "a", "F"],
  ["am_adam", "a", "M"], ["am_echo", "a", "M"], ["am_eric", "a", "M"], ["am_fenrir", "a", "M"], ["am_liam", "a", "M"], ["am_michael", "a", "M"], ["am_onyx", "a", "M"], ["am_puck", "a", "M"], ["am_santa", "a", "M"],
  ["bf_alice", "b", "F"], ["bf_emma", "b", "F"], ["bf_isabella", "b", "F"], ["bf_lily", "b", "F"],
  ["bm_daniel", "b", "M"], ["bm_fable", "b", "M"], ["bm_george", "b", "M"], ["bm_lewis", "b", "M"],
  ["ef_dora", "e", "F"], ["em_alex", "e", "M"], ["em_santa", "e", "M"],
  ["ff_siwis", "f", "F"],
  ["hf_alpha", "h", "F"], ["hf_beta", "h", "F"], ["hm_omega", "h", "M"], ["hm_psi", "h", "M"],
  ["if_sara", "i", "F"], ["im_nicola", "i", "M"],
  ["jf_alpha", "j", "F"], ["jf_gongitsune", "j", "F"], ["jf_nezumi", "j", "F"], ["jf_tebukuro", "j", "F"], ["jm_kumo", "j", "M"],
  ["zf_xiaobei", "z", "F"], ["zf_xiaoni", "z", "F"], ["zf_xiaoxiao", "z", "F"], ["zf_xiaoyi", "z", "F"], ["zm_yunjian", "z", "M"], ["zm_yunxi", "z", "M"], ["zm_yunxia", "z", "M"], ["zm_yunyang", "z", "M"],
].map(([id, language, gender]) => ({ id, language, gender }));

const LANGUAGES = {
  all: { name: "Todos", flag: "◉" },
  p: { name: "Português BR", flag: "🇧🇷" },
  a: { name: "Inglês EUA", flag: "🇺🇸" },
  b: { name: "Inglês UK", flag: "🇬🇧" },
  e: { name: "Espanhol", flag: "🇪🇸" },
  f: { name: "Francês", flag: "🇫🇷" },
  i: { name: "Italiano", flag: "🇮🇹" },
  j: { name: "Japonês", flag: "🇯🇵" },
  z: { name: "Mandarim", flag: "🇨🇳" },
  h: { name: "Hindi", flag: "🇮🇳" },
};

const PREVIEW_TEXT = {
  p: "Olá. Esta é uma prévia da minha voz em português brasileiro.",
  a: "Hello. This is a short preview of my voice.",
  b: "Hello. This is a short preview of my British voice.",
  e: "Hola. Esta es una breve muestra de mi voz.",
  f: "Bonjour. Voici un court aperçu de ma voix.",
  i: "Ciao. Questa è una breve anteprima della mia voce.",
  j: "こんにちは。これは私の声の短いプレビューです。",
  z: "你好。这是我的声音的简短预览。",
  h: "नमस्ते। यह मेरी आवाज़ का एक छोटा सा नमूना है।",
};

const FEATURED = new Set(["pm_alex", "pf_dora", "af_heart", "af_bella", "am_onyx", "bf_emma", "bm_george", "jf_alpha", "zf_xiaoxiao"]);
const COLOR_PAIRS = [
  ["#5167ff", "#8f5cff"], ["#1768a9", "#4f8dff"], ["#6941c6", "#b45cff"],
  ["#1c6b63", "#3b9f8f"], ["#8b3e5c", "#d76084"], ["#6d5526", "#c48a33"],
  ["#395273", "#738db2"], ["#663d7b", "#9d65b8"], ["#405b43", "#78a26c"],
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  view: "discovery",
  selectedVoiceId: localStorage.getItem("kpnc:selectedVoice") || "pm_alex",
  language: "all",
  search: "",
  favorites: new Set(readJSON("kpnc:favorites", [])),
  aliases: readJSON("kpnc:aliases", {}),
  modelReady: false,
  modelEngine: null,
  busy: false,
  currentBlob: null,
  currentUrl: null,
  worker: null,
  pending: new Map(),
  loadWaiters: [],
  historyCount: 0,
};

function readJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function titleCase(value) {
  return value
    .split("_")
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(" ");
}

function baseVoiceName(voice) {
  return titleCase(voice.id.split("_").slice(1).join("_"));
}

function voiceName(voice) {
  const alias = state.aliases[voice.id]?.trim();
  return alias || baseVoiceName(voice);
}

function voiceById(id) {
  return VOICES.find((voice) => voice.id === id) || VOICES[0];
}

function voiceColors(id) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLOR_PAIRS[hash % COLOR_PAIRS.length];
}

function voiceInitials(voice) {
  const name = voiceName(voice);
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "V") + (parts[1]?.[0] || parts[0]?.[1] || "");
}

function genderLabel(gender) {
  return gender === "F" ? "Feminina" : "Masculina";
}

function voiceMatches(voice) {
  if (state.language !== "all" && voice.language !== state.language) return false;
  if (!state.search) return true;
  const lang = LANGUAGES[voice.language]?.name || "";
  const haystack = `${voiceName(voice)} ${baseVoiceName(voice)} ${voice.id} ${lang} ${genderLabel(voice.gender)}`.toLowerCase();
  return haystack.includes(state.search.toLowerCase());
}

function sortedVoices() {
  return [...VOICES].sort((a, b) => {
    const ap = a.language === "p" ? 2 : FEATURED.has(a.id) ? 1 : 0;
    const bp = b.language === "p" ? 2 : FEATURED.has(b.id) ? 1 : 0;
    return bp - ap || voiceName(a).localeCompare(voiceName(b), "pt-BR");
  });
}

function voiceCardHTML(voice) {
  const [v1, v2] = voiceColors(voice.id);
  const favorite = state.favorites.has(voice.id);
  const lang = LANGUAGES[voice.language];
  return `
    <article class="voice-card ${state.selectedVoiceId === voice.id ? "selected" : ""}" data-voice-card="${voice.id}" style="--v1:${v1};--v2:${v2}">
      <div class="voice-art">
        <span class="voice-monogram">${escapeHTML(voiceInitials(voice))}</span>
        <button class="voice-play" data-preview-voice="${voice.id}" aria-label="Ouvir prévia de ${escapeHTML(voiceName(voice))}">▶</button>
      </div>
      <div class="voice-meta">
        <div style="min-width:0">
          <div class="voice-name">${escapeHTML(voiceName(voice))}</div>
          <div class="voice-sub">${lang.flag} ${escapeHTML(lang.name)} · ${genderLabel(voice.gender)}</div>
        </div>
        <button class="favorite-btn ${favorite ? "on" : ""}" data-favorite-voice="${voice.id}" aria-label="Favoritar">${favorite ? "♥" : "♡"}</button>
      </div>
    </article>`;
}

function renderLanguageFilters() {
  const order = ["all", "p", "a", "b", "e", "f", "i", "j", "z", "h"];
  $("#languageFilters").innerHTML = order.map((code) => {
    const item = LANGUAGES[code];
    return `<button class="filter-chip ${state.language === code ? "active" : ""}" data-language="${code}">${item.flag} ${escapeHTML(item.name)}</button>`;
  }).join("");
}

function renderDiscovery() {
  const voices = sortedVoices().filter(voiceMatches);
  $("#voiceGrid").innerHTML = voices.length ? voices.map(voiceCardHTML).join("") : `<div class="empty" style="grid-column:1/-1">Nenhuma voz encontrada com esses filtros.</div>`;
  $("#voiceCountText").textContent = `${voices.length} ${voices.length === 1 ? "voz" : "vozes"} exibidas`;
  renderLanguageFilters();
}

function renderFavorites() {
  const voices = sortedVoices().filter((voice) => state.favorites.has(voice.id) && voiceMatches(voice));
  $("#favoritesGrid").innerHTML = voices.length ? voices.map(voiceCardHTML).join("") : `<div class="empty" style="grid-column:1/-1">Você ainda não favoritou nenhuma voz.</div>`;
}

function renderSelectedVoice() {
  const voice = voiceById(state.selectedVoiceId);
  const [v1, v2] = voiceColors(voice.id);
  const lang = LANGUAGES[voice.language];
  $("#selectedVoicePanel").innerHTML = `
    <div class="selected-voice-art" style="--v1:${v1};--v2:${v2}"><strong>${escapeHTML(voiceInitials(voice))}</strong></div>
    <div class="selected-title">${escapeHTML(voiceName(voice))}</div>
    <div class="selected-sub">${lang.flag} ${escapeHTML(lang.name)} · ${genderLabel(voice.gender)} · ${escapeHTML(voice.id)}</div>
    <div class="stats-grid">
      <div class="stat"><strong>${lang.flag}</strong><span>idioma</span></div>
      <div class="stat"><strong>${voice.gender}</strong><span>perfil</span></div>
      <div class="stat"><strong>${state.favorites.has(voice.id) ? "♥" : "♡"}</strong><span>favorita</span></div>
    </div>
    <button class="secondary-btn" data-toggle-selected-favorite style="width:100%;margin-top:12px">${state.favorites.has(voice.id) ? "Remover das favoritas" : "Adicionar às favoritas"}</button>
  `;
  $("#aliasInput").value = state.aliases[voice.id] || "";
}

function renderStats() {
  $("#favStat").textContent = state.favorites.size;
  $("#historyStat").textContent = state.historyCount;
}

function selectVoice(id, goToStudio = false) {
  if (!VOICES.some((voice) => voice.id === id)) return;
  state.selectedVoiceId = id;
  localStorage.setItem("kpnc:selectedVoice", id);
  renderDiscovery();
  renderFavorites();
  renderSelectedVoice();
  if (goToStudio) navigateTo("studio");
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  saveJSON("kpnc:favorites", [...state.favorites]);
  renderDiscovery();
  renderFavorites();
  renderSelectedVoice();
  renderStats();
}

function navigateTo(view) {
  state.view = view;
  $$(".view").forEach((node) => node.classList.toggle("active", node.id === `view-${view}`));
  $$("[data-view-target]").forEach((button) => button.classList.toggle("active", button.dataset.viewTarget === view));
  $("#sidebar").classList.remove("open");
  if (view === "history") renderHistory();
  if (view === "favorites") renderFavorites();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

let toastTimer = null;
function toast(message, kind = "normal") {
  const node = $("#toast");
  node.textContent = message;
  node.classList.toggle("error", kind === "error");
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 3300);
}

function updateEngineUI(status, message) {
  const pill = $("#enginePill");
  if (status === "ready") {
    pill.textContent = `● ${state.modelEngine}`;
    pill.className = "engine-pill ready";
    $("#settingsEngine").textContent = state.modelEngine || "Pronta";
  } else if (status === "busy") {
    pill.textContent = message || "Carregando IA…";
    pill.className = "engine-pill busy";
  } else {
    pill.textContent = message || "IA não carregada";
    pill.className = "engine-pill";
  }
}

function updateProgress(progress, label) {
  const track = $("#progressTrack");
  const bar = $("#progressBar");
  if (progress == null) {
    track.classList.remove("visible");
    bar.style.width = "0%";
  } else {
    track.classList.add("visible");
    bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }
  if (label) $("#generationStatus").textContent = label;
}

function getWorker() {
  if (state.worker) return state.worker;
  const worker = new Worker("./tts-worker.js", { type: "module" });
  state.worker = worker;

  worker.addEventListener("message", (event) => {
    const data = event.data ?? {};
    if (data.type === "loading") {
      updateEngineUI("busy", data.message || "Carregando IA…");
      $("#generationStatus").textContent = data.message || "Carregando IA…";
      return;
    }
    if (data.type === "load-progress") {
      const label = data.file ? `Baixando ${data.file}${data.progress != null ? ` · ${data.progress}%` : ""}` : "Baixando modelo…";
      updateProgress(data.progress, label);
      return;
    }
    if (data.type === "fallback") {
      updateEngineUI("busy", "Modo compatível…");
      $("#generationStatus").textContent = data.message || "Tentando modo compatível…";
      return;
    }
    if (data.type === "ready") {
      state.modelReady = true;
      state.modelEngine = data.engine || "Kokoro";
      updateEngineUI("ready");
      updateProgress(null, "IA carregada. Pronto para gerar.");
      const waiters = state.loadWaiters.splice(0);
      waiters.forEach(({ resolve }) => resolve(state.modelEngine));
      return;
    }
    if (data.type === "generating") {
      $("#generationStatus").textContent = "Gerando áudio…";
      updateEngineUI("busy", "Gerando…");
      return;
    }
    if (data.type === "result") {
      const request = state.pending.get(data.requestId);
      if (request) {
        state.pending.delete(data.requestId);
        request.resolve(data.blob);
      }
      state.busy = false;
      setBusyUI(false);
      updateEngineUI("ready");
      $("#generationStatus").textContent = "Áudio gerado com sucesso.";
      return;
    }
    if (data.type === "error") {
      const message = friendlyError(data.message || "Erro desconhecido ao gerar áudio.");
      if (data.requestId && state.pending.has(data.requestId)) {
        const request = state.pending.get(data.requestId);
        state.pending.delete(data.requestId);
        request.reject(new Error(message));
      } else {
        const waiters = state.loadWaiters.splice(0);
        waiters.forEach(({ reject }) => reject(new Error(message)));
      }
      state.busy = false;
      setBusyUI(false);
      updateProgress(null, message);
      updateEngineUI(state.modelReady ? "ready" : "idle", state.modelReady ? undefined : "Falha ao carregar");
    }
  });

  worker.addEventListener("error", (event) => {
    const message = friendlyError(event.message || "Falha no Web Worker de voz.");
    state.busy = false;
    setBusyUI(false);
    toast(message, "error");
  });

  return worker;
}

function friendlyError(message) {
  const text = String(message || "");
  if (/memory|allocation|out of memory/i.test(text)) return "O navegador ficou sem memória para carregar o modelo. Feche abas pesadas e tente novamente.";
  if (/fetch|network|failed to load|cdn|connection/i.test(text)) return "Não foi possível baixar o modelo. Verifique a internet e tente novamente no Chrome ou Edge.";
  if (/webgpu/i.test(text)) return "WebGPU não funcionou neste navegador. O app tentou o modo compatível automaticamente.";
  return text;
}

function ensureModelLoaded() {
  if (state.modelReady) return Promise.resolve(state.modelEngine);
  const worker = getWorker();
  return new Promise((resolve, reject) => {
    state.loadWaiters.push({ resolve, reject });
    if (state.loadWaiters.length === 1) worker.postMessage({ type: "load" });
  });
}

function requestGeneration(text, voice, speed = 1) {
  if (state.busy) return Promise.reject(new Error("Já existe uma geração em andamento."));
  state.busy = true;
  setBusyUI(true);
  const requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const worker = getWorker();
  return new Promise((resolve, reject) => {
    state.pending.set(requestId, { resolve, reject });
    worker.postMessage({ type: "generate", requestId, text, voice, speed });
  });
}

function setBusyUI(busy) {
  $("#generateBtn").disabled = busy;
  $("#previewSelectedBtn").disabled = busy;
  $$("[data-preview-voice]").forEach((button) => { button.disabled = busy; });
}

async function previewVoice(id) {
  if (state.busy) return;
  const voice = voiceById(id);
  const button = $(`[data-preview-voice="${CSS.escape(id)}"]`);
  const previous = button?.textContent;
  if (button) button.textContent = "…";
  try {
    const blob = await requestGeneration(PREVIEW_TEXT[voice.language], voice.id, 1);
    const url = URL.createObjectURL(blob);
    const player = new Audio(url);
    player.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
    player.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
    await player.play();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    if (button) button.textContent = previous || "▶";
  }
}

async function generateMain() {
  const voice = voiceById(state.selectedVoiceId);
  const text = $("#speechText").value.trim();
  const speed = Number($("#speedRange").value);
  if (!text) {
    toast("Digite algum texto antes de gerar.", "error");
    $("#speechText").focus();
    return;
  }
  try {
    const blob = await requestGeneration(text, voice.id, speed);
    showCurrentResult(blob);
    await addHistory({
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      createdAt: Date.now(),
      voiceId: voice.id,
      text,
      speed,
      blob,
    });
    toast("Áudio gerado e salvo no histórico.");
  } catch (error) {
    toast(error.message, "error");
  }
}

function showCurrentResult(blob) {
  if (state.currentUrl) URL.revokeObjectURL(state.currentUrl);
  state.currentBlob = blob;
  state.currentUrl = URL.createObjectURL(blob);
  $("#resultAudio").src = state.currentUrl;
  $("#resultCard").classList.add("visible");
}

function sanitizeFilename(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "voz";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const DB_NAME = "kpnc-voice-studio-db";
const STORE = "generations";
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function getHistory() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
}

async function addHistory(item) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  const items = await getHistory();
  if (items.length > 30) {
    const excess = items.slice(30);
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    excess.forEach((entry) => store.delete(entry.id));
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  state.historyCount = Math.min(items.length, 30);
  renderStats();
}

async function deleteHistoryItem(id) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  await renderHistory();
}

async function clearHistory() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).clear();
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  state.historyCount = 0;
  renderStats();
  await renderHistory();
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp));
}

async function renderHistory() {
  const list = $("#historyList");
  list.innerHTML = `<div class="empty">Carregando histórico…</div>`;
  try {
    const items = await getHistory();
    state.historyCount = items.length;
    renderStats();
    if (!items.length) {
      list.innerHTML = `<div class="empty">Nenhum áudio gerado ainda.</div>`;
      return;
    }
    list.innerHTML = items.map((item) => {
      const voice = voiceById(item.voiceId);
      return `
        <article class="history-item">
          <div>
            <div class="history-voice">${escapeHTML(voiceName(voice))}</div>
            <div class="history-date">${escapeHTML(formatDate(item.createdAt))} · ${Number(item.speed || 1).toFixed(2)}×</div>
          </div>
          <div class="history-text" title="${escapeHTML(item.text)}">${escapeHTML(item.text)}</div>
          <div class="history-actions">
            <button class="icon-btn" data-history-play="${escapeHTML(item.id)}" aria-label="Reproduzir">▶</button>
            <button class="icon-btn" data-history-download="${escapeHTML(item.id)}" aria-label="Baixar">↓</button>
            <button class="icon-btn" data-history-delete="${escapeHTML(item.id)}" aria-label="Excluir">×</button>
          </div>
        </article>`;
    }).join("");
    list._historyItems = items;
  } catch (error) {
    list.innerHTML = `<div class="empty">Não foi possível abrir o histórico local.</div>`;
  }
}

function getHistoryItemFromRendered(id) {
  return $("#historyList")._historyItems?.find((item) => item.id === id);
}

function setupEvents() {
  $$("[data-view-target]").forEach((button) => button.addEventListener("click", () => navigateTo(button.dataset.viewTarget)));
  $("#heroStudio").addEventListener("click", () => navigateTo("studio"));
  $("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

  $("#globalSearch").addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    renderDiscovery();
    renderFavorites();
    if (state.view !== "discovery" && state.view !== "favorites" && state.search) navigateTo("discovery");
  });

  $("#languageFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-language]");
    if (!button) return;
    state.language = button.dataset.language;
    renderDiscovery();
  });

  const gridHandler = (event) => {
    const favorite = event.target.closest("[data-favorite-voice]");
    if (favorite) {
      event.stopPropagation();
      toggleFavorite(favorite.dataset.favoriteVoice);
      return;
    }
    const preview = event.target.closest("[data-preview-voice]");
    if (preview) {
      event.stopPropagation();
      previewVoice(preview.dataset.previewVoice);
      return;
    }
    const card = event.target.closest("[data-voice-card]");
    if (card) selectVoice(card.dataset.voiceCard, true);
  };
  $("#voiceGrid").addEventListener("click", gridHandler);
  $("#favoritesGrid").addEventListener("click", gridHandler);

  $("#selectedVoicePanel").addEventListener("click", (event) => {
    if (event.target.closest("[data-toggle-selected-favorite]")) toggleFavorite(state.selectedVoiceId);
  });

  $("#speechText").addEventListener("input", (event) => { $("#charCount").textContent = event.target.value.length; });
  $("#speedRange").addEventListener("input", (event) => { $("#speedValue").textContent = `${Number(event.target.value).toFixed(2)}×`; });
  $("#generateBtn").addEventListener("click", generateMain);
  $("#previewSelectedBtn").addEventListener("click", () => previewVoice(state.selectedVoiceId));

  $("#downloadCurrentBtn").addEventListener("click", () => {
    if (!state.currentBlob) return;
    const voice = voiceById(state.selectedVoiceId);
    downloadBlob(state.currentBlob, `${sanitizeFilename(voiceName(voice))}-${Date.now()}.wav`);
  });

  const loadClick = async () => {
    if (state.modelReady) {
      toast(`IA já carregada em ${state.modelEngine}.`);
      return;
    }
    try {
      await ensureModelLoaded();
      toast(`IA carregada: ${state.modelEngine}.`);
    } catch (error) {
      toast(error.message, "error");
    }
  };
  $("#loadModelBtn").addEventListener("click", loadClick);
  $("#settingsLoadBtn").addEventListener("click", loadClick);

  $("#saveAliasBtn").addEventListener("click", () => {
    const value = $("#aliasInput").value.trim();
    if (value) state.aliases[state.selectedVoiceId] = value;
    else delete state.aliases[state.selectedVoiceId];
    saveJSON("kpnc:aliases", state.aliases);
    renderDiscovery();
    renderFavorites();
    renderSelectedVoice();
    toast("Apelido salvo.");
  });

  $("#resetAliasBtn").addEventListener("click", () => {
    delete state.aliases[state.selectedVoiceId];
    saveJSON("kpnc:aliases", state.aliases);
    renderDiscovery();
    renderFavorites();
    renderSelectedVoice();
    toast("Nome original restaurado.");
  });

  $("#clearHistoryBtn").addEventListener("click", async () => {
    if (!confirm("Apagar todo o histórico local de áudios?")) return;
    try {
      await clearHistory();
      toast("Histórico apagado.");
    } catch (error) {
      toast("Não foi possível limpar o histórico.", "error");
    }
  });

  $("#historyList").addEventListener("click", async (event) => {
    const play = event.target.closest("[data-history-play]");
    const download = event.target.closest("[data-history-download]");
    const del = event.target.closest("[data-history-delete]");
    const id = play?.dataset.historyPlay || download?.dataset.historyDownload || del?.dataset.historyDelete;
    if (!id) return;
    const item = getHistoryItemFromRendered(id);
    if (!item) return;

    if (play) {
      const url = URL.createObjectURL(item.blob);
      const audio = new Audio(url);
      audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
      audio.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
      audio.play().catch(() => toast("O navegador bloqueou a reprodução.", "error"));
    } else if (download) {
      const voice = voiceById(item.voiceId);
      downloadBlob(item.blob, `${sanitizeFilename(voiceName(voice))}-${item.createdAt}.wav`);
    } else if (del) {
      await deleteHistoryItem(id);
      toast("Item removido do histórico.");
    }
  });
}

async function init() {
  renderDiscovery();
  renderFavorites();
  renderSelectedVoice();
  renderStats();
  setupEvents();
  try {
    const items = await getHistory();
    state.historyCount = items.length;
    renderStats();
  } catch {
    // IndexedDB can be unavailable in strict private modes; the rest of the app still works.
  }
}

init();
