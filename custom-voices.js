import { Client, handle_file } from "https://cdn.jsdelivr.net/npm/@gradio/client@2.5.0/+esm";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const DEFAULT_SPACE = "ResembleAI/Chatterbox-Multilingual-TTS";
const CATALOG_URL = "./curated-voices.json";
const DB_NAME = "kpnc-custom-voices-db";
const STORE = "voices";

const state = {
  space: localStorage.getItem("kpnc:chatterboxSpace") || DEFAULT_SPACE,
  client: null,
  endpoint: null,
  connected: false,
  connecting: null,
  voices: [],
  curated: [],
  local: [],
  selectedId: localStorage.getItem("kpnc:customVoiceId") || null,
  busy: false,
  currentBlob: null,
  currentUrl: null,
  imageUrls: [],
};

let toastTimer;
function toast(message, error = false) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", error);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4500);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(name) {
  const p = String(name || "Voz").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "V") + (p[1]?.[0] || p[0]?.[1] || "")).toUpperCase();
}

function sanitizeFilename(value) {
  return String(value || "voz")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 60) || "voz";
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getLocalVoices() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result || []).map(v => ({ ...v, source: "local" })));
    req.onerror = () => reject(req.error);
  });
}

async function putLocalVoice(voice) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(voice);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

async function removeLocalVoice(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

async function loadCuratedCatalog() {
  try {
    const response = await fetch(`${CATALOG_URL}?v=3`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return (Array.isArray(data.voices) ? data.voices : []).map(v => ({ ...v, source: "curated" }));
  } catch (error) {
    console.warn("Falha ao carregar catálogo curado:", error);
    return [];
  }
}

function selectedVoice() {
  return state.voices.find(v => v.id === state.selectedId) || null;
}

function revokeImageUrls() {
  state.imageUrls.forEach(url => URL.revokeObjectURL(url));
  state.imageUrls = [];
}

function imageForVoice(voice) {
  if (voice.imageUrl) return voice.imageUrl;
  if (voice.image instanceof Blob) {
    const url = URL.createObjectURL(voice.image);
    state.imageUrls.push(url);
    return url;
  }
  return null;
}

function voiceCard(voice) {
  const selected = voice.id === state.selectedId;
  const image = imageForVoice(voice);
  const badge = voice.source === "curated" ? (voice.badge || "Catálogo") : "Minha voz";
  const art = image
    ? `<img src="${escapeHTML(image)}" alt="" loading="lazy" />`
    : `<span class="voice-monogram">${escapeHTML(initials(voice.name))}</span>`;
  const remove = voice.source === "local"
    ? `<button class="custom-mini-btn danger" data-custom-delete="${escapeHTML(voice.id)}" aria-label="Excluir voz">×</button>`
    : "";
  return `<article class="voice-card custom-voice-card ${selected ? "custom-card-selected" : ""}" data-custom-card="${escapeHTML(voice.id)}" style="--v1:#4558ff;--v2:#8958d8">
    <div class="voice-art">${art}<button class="voice-play" data-custom-preview="${escapeHTML(voice.id)}" aria-label="Ouvir referência">▶</button></div>
    <div class="voice-meta">
      <div style="min-width:0"><div class="voice-name">${escapeHTML(voice.name)}</div><div class="voice-sub">${escapeHTML(badge)} · ${escapeHTML((voice.language || "pt").toUpperCase())}${voice.category ? ` · ${escapeHTML(voice.category)}` : ""}</div></div>
      <div class="custom-card-actions">${remove}</div>
    </div>
  </article>`;
}

function renderSelected() {
  const voice = selectedVoice();
  const box = $("#customSelectedVoice");
  if (!box) return;
  if (!voice) {
    box.innerHTML = `<div class="custom-selected-icon">◎</div><div><strong>Nenhuma voz selecionada</strong><span>Escolha uma voz do catálogo abaixo.</span></div>`;
    return;
  }
  box.innerHTML = `<div class="custom-selected-icon">${escapeHTML(initials(voice.name))}</div><div><strong>${escapeHTML(voice.name)}</strong><span>${voice.source === "curated" ? "Catálogo público" : "Minha biblioteca"} · Chatterbox Multilingual</span></div>`;
  const language = $("#customBaseVoice");
  if (language && voice.language) language.value = voice.language;
}

function renderVoices() {
  revokeImageUrls();
  const grid = $("#customVoiceGrid");
  if (!grid) return;
  const curated = state.voices.filter(v => v.source === "curated");
  const local = state.voices.filter(v => v.source === "local");
  let html = "";
  if (curated.length) {
    html += `<div class="custom-library-label" style="grid-column:1/-1"><strong>Catálogo público</strong><span>Perfis prontos: escolha, escreva e gere.</span></div>`;
    html += curated.map(voiceCard).join("");
  }
  if (local.length) {
    html += `<div class="custom-library-label" style="grid-column:1/-1;margin-top:8px"><strong>Minhas vozes</strong><span>Referências salvas apenas neste navegador.</span></div>`;
    html += local.map(voiceCard).join("");
  }
  if (!html) html = `<div class="empty custom-empty-note" style="grid-column:1/-1">Nenhuma voz disponível.</div>`;
  grid.innerHTML = html;
  const count = $("#customVoiceCount");
  if (count) count.textContent = `${state.voices.length} ${state.voices.length === 1 ? "voz disponível" : "vozes disponíveis"}`;
  renderSelected();
}

async function refreshVoices() {
  const [curated, local] = await Promise.all([loadCuratedCatalog(), getLocalVoices().catch(() => [])]);
  state.curated = curated;
  state.local = local;
  state.voices = [...curated, ...local];
  if (!state.voices.some(v => v.id === state.selectedId)) {
    state.selectedId = state.voices[0]?.id || null;
    if (state.selectedId) localStorage.setItem("kpnc:customVoiceId", state.selectedId);
    else localStorage.removeItem("kpnc:customVoiceId");
  }
  renderVoices();
}

function setRemoteState(online, detail = "") {
  state.connected = online;
  const badge = $("#customEngineState");
  if (badge) {
    badge.className = `custom-engine-state ${online ? "online" : "offline"}`;
    badge.textContent = online ? "● Chatterbox remoto conectado" : "● Chatterbox remoto desconectado";
  }
  const info = $("#customEngineDetails");
  if (info) info.textContent = detail || (online ? `Space: ${state.space}` : "Conexão remota indisponível.");
  const status = $("#customGenerationStatus");
  if (status && !state.busy) status.textContent = online ? "Pronto para gerar." : "Conectando ao motor remoto…";
}

function findTtsEndpoint(api) {
  const groups = [api?.named_endpoints, api?.unnamed_endpoints, api?.endpoints].filter(Boolean);
  const candidates = [];
  for (const group of groups) {
    if (Array.isArray(group)) {
      for (const item of group) candidates.push([item?.api_name || item?.name || item?.path, item]);
    } else if (typeof group === "object") {
      for (const [name, item] of Object.entries(group)) candidates.push([name, item]);
    }
  }
  const score = ([name, item]) => {
    const text = `${name || ""} ${item?.description || ""} ${item?.parameters?.map?.(p => `${p?.parameter_name || ""} ${p?.label || ""} ${p?.type?.type || p?.type || ""}`).join(" ") || ""}`.toLowerCase();
    let s = 0;
    if (text.includes("generate_tts_audio")) s += 20;
    if (text.includes("text")) s += 3;
    if (text.includes("language")) s += 3;
    if (text.includes("audio")) s += 3;
    if ((item?.parameters?.length || 0) >= 7) s += 5;
    return s;
  };
  candidates.sort((a, b) => score(b) - score(a));
  const best = candidates[0];
  if (!best || score(best) < 8) return "/predict";
  const name = String(best[0] || "/predict");
  return name.startsWith("/") ? name : `/${name}`;
}

async function connectRemote(showToast = false) {
  if (state.connected && state.client) return state.client;
  if (state.connecting) return state.connecting;
  const field = $("#customEngineUrl");
  const space = String(field?.value || state.space || DEFAULT_SPACE).trim();
  if (!space) throw new Error("Informe um Hugging Face Space.");
  state.space = space;
  localStorage.setItem("kpnc:chatterboxSpace", space);
  if (field) field.value = space;
  setRemoteState(false, `Conectando a ${space}…`);
  state.connecting = (async () => {
    const client = await Client.connect(space);
    const api = await client.view_api();
    state.endpoint = findTtsEndpoint(api);
    state.client = client;
    setRemoteState(true, `Chatterbox Multilingual · ${space} · endpoint ${state.endpoint}`);
    if (showToast) toast("Chatterbox remoto conectado.");
    return client;
  })();
  try { return await state.connecting; }
  catch (error) {
    state.client = null;
    state.endpoint = null;
    setRemoteState(false, `Falha ao acessar ${space}. O Space pode estar dormindo, em fila ou indisponível.`);
    if (showToast) toast(error?.message || String(error), true);
    throw error;
  } finally { state.connecting = null; }
}

async function addLocalVoice() {
  if (state.busy) return;
  const name = $("#customVoiceName")?.value.trim();
  const reference = $("#customReferenceFile")?.files?.[0];
  const image = $("#customImageFile")?.files?.[0];
  const acknowledged = $("#customRightsCheck")?.checked;
  if (!name) return toast("Dê um nome para a voz.", true);
  if (!reference) return toast("Escolha um áudio de referência.", true);
  if (!acknowledged) return toast("Confirme que a saída será tratada como áudio sintético.", true);
  if (reference.size > 30 * 1024 * 1024) return toast("A referência deve ter no máximo 30 MB.", true);
  if (image && image.size > 5 * 1024 * 1024) return toast("A imagem deve ter no máximo 5 MB.", true);
  const id = `local-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  const item = {
    id,
    name,
    source: "local",
    language: "pt",
    category: "Minha voz",
    reference,
    image: image || null,
    createdAt: Date.now(),
  };
  try {
    await putLocalVoice(item);
    state.selectedId = id;
    localStorage.setItem("kpnc:customVoiceId", id);
    $("#customVoiceName").value = "";
    $("#customReferenceFile").value = "";
    $("#customImageFile").value = "";
    $("#customRightsCheck").checked = false;
    await refreshVoices();
    toast("Voz salva neste navegador.");
  } catch (error) { toast(error?.message || String(error), true); }
}

async function deleteVoice(id) {
  const voice = state.voices.find(v => v.id === id);
  if (!voice || voice.source !== "local") return;
  if (!confirm(`Excluir “${voice.name}” deste navegador?`)) return;
  await removeLocalVoice(id);
  if (state.selectedId === id) state.selectedId = null;
  await refreshVoices();
  toast("Voz removida.");
}

async function referenceForVoice(voice) {
  if (voice.referenceUrl) return voice.referenceUrl;
  if (voice.reference instanceof Blob) return voice.reference;
  throw new Error("Esta voz não possui uma referência de áudio válida.");
}

async function previewReference(id) {
  const voice = state.voices.find(v => v.id === id);
  if (!voice) return;
  try {
    const ref = await referenceForVoice(voice);
    const url = typeof ref === "string" ? ref : URL.createObjectURL(ref);
    const audio = new Audio(url);
    if (typeof ref !== "string") {
      audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
      audio.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
    }
    await audio.play();
  } catch (error) { toast(error?.message || String(error), true); }
}

function audioUrlFromResult(result) {
  const data = result?.data;
  const first = Array.isArray(data) ? data[0] : data;
  if (!first) return null;
  if (typeof first === "string") return first;
  if (first.url) return first.url;
  if (first.path && /^https?:\/\//i.test(first.path)) return first.path;
  if (Array.isArray(first) && typeof first[1] === "string") return first[1];
  return null;
}

function setBusy(busy, text) {
  state.busy = busy;
  const generate = $("#customGenerateBtn");
  const add = $("#customAddVoiceBtn");
  if (generate) generate.disabled = busy;
  if (add) add.disabled = busy;
  if (text && $("#customGenerationStatus")) $("#customGenerationStatus").textContent = text;
}

async function generateVoice() {
  if (state.busy) return;
  const voice = selectedVoice();
  const text = $("#customSpeechText")?.value.trim();
  const language = $("#customBaseVoice")?.value || voice?.language || "pt";
  const exaggeration = Number($("#customQuality")?.value || 0.5);
  if (!voice) return toast("Escolha uma voz.", true);
  if (!text) return toast("Digite o texto que a voz deve falar.", true);
  if (text.length > 300) return toast("O Chatterbox remoto aceita até 300 caracteres por geração nesta build.", true);
  setBusy(true, `Preparando ${voice.name}…`);
  try {
    const client = await connectRemote(false);
    const reference = await referenceForVoice(voice);
    const prompt = handle_file(reference);
    setBusy(true, `Gerando ${voice.name} no Chatterbox…`);
    const result = await client.predict(state.endpoint || "/predict", [
      text,
      language,
      prompt,
      exaggeration,
      0.8,
      0,
      0.5,
    ]);
    const remoteUrl = audioUrlFromResult(result);
    if (!remoteUrl) throw new Error("O Chatterbox respondeu, mas não retornou um áudio reconhecível.");
    const response = await fetch(remoteUrl);
    if (!response.ok) throw new Error(`Falha ao baixar o áudio gerado (${response.status}).`);
    const blob = await response.blob();
    if (state.currentUrl) URL.revokeObjectURL(state.currentUrl);
    state.currentBlob = blob;
    state.currentUrl = URL.createObjectURL(blob);
    $("#customResultAudio").src = state.currentUrl;
    $("#customResultCard").classList.add("visible");
    $("#customGenerationStatus").textContent = "Áudio gerado com sucesso.";
    toast("Voz gerada pelo Chatterbox.");
  } catch (error) {
    const message = error?.message || String(error);
    $("#customGenerationStatus").textContent = "Falha na geração.";
    toast(/quota|gpu|queue|space/i.test(message) ? `O serviço remoto está em fila/cota: ${message}` : message, true);
  } finally { setBusy(false); }
}

function downloadCurrent() {
  if (!state.currentBlob) return;
  const voice = selectedVoice();
  const url = URL.createObjectURL(state.currentBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(voice?.name || "voz")}-${Date.now()}.wav`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function patchUI() {
  const nav = $("[data-view-target='custom']");
  if (nav) nav.innerHTML = `<span class="nav-icon">◎</span> Vozes especiais`;
  const head = $("#view-custom .section-head h2");
  if (head) head.textContent = "Vozes especiais";
  const headP = $("#view-custom .section-head p");
  if (headP) headP.textContent = "Perfis prontos com timbre de referência: escolha a voz, escreva o texto e gere diretamente com Chatterbox Multilingual.";
  const callout = $("#view-custom .custom-callout");
  if (callout) callout.innerHTML = `<strong>Modo Fish-like</strong><span>Texto → perfil de voz já cadastrado → Chatterbox Multilingual → WAV. Sem Seed-VC e sem fala-base intermediária.</span>`;

  const engineTitle = $("#view-custom .custom-panel:first-of-type h2");
  if (engineTitle) engineTitle.textContent = "Motor remoto";
  const engineSub = $("#view-custom .custom-panel:first-of-type .panel-sub");
  if (engineSub) engineSub.textContent = "O site usa um Hugging Face Space do Chatterbox Multilingual. O visitante não instala nada.";
  const engineLabel = $("label[for='customEngineUrl']");
  if (engineLabel) engineLabel.textContent = "Hugging Face Space";
  const engineInput = $("#customEngineUrl");
  if (engineInput) { engineInput.value = state.space; engineInput.placeholder = DEFAULT_SPACE; }
  const details = $("#customEngineDetails");
  if (details) details.textContent = "Conectando ao Chatterbox Multilingual…";

  const addTitle = [...$$("#view-custom .custom-panel:first-of-type h3")].find(Boolean);
  if (addTitle) addTitle.textContent = "Criar minha voz";
  const refHint = $("#customReferenceFile")?.nextElementSibling;
  if (refHint) refHint.textContent = "Use de 5 a 30 segundos de voz limpa. Essa referência fica salva só neste navegador.";
  const addButton = $("#customAddVoiceBtn");
  if (addButton) addButton.textContent = "+ Salvar minha voz";

  const generateTitle = $("#view-custom .custom-panel:nth-of-type(2) h2");
  if (generateTitle) generateTitle.textContent = "Gerar diretamente na voz";
  const generateSub = $("#view-custom .custom-panel:nth-of-type(2) .panel-sub");
  if (generateSub) generateSub.textContent = "Nenhuma fala-base intermediária: o Chatterbox recebe texto + referência e sintetiza diretamente o timbre selecionado.";
  const text = $("#customSpeechText");
  if (text) { text.maxLength = 300; text.placeholder = "Digite o que a voz selecionada deve falar…"; }
  const counterLabel = $("#customSpeechText")?.previousElementSibling?.querySelector("small");
  if (counterLabel) counterLabel.innerHTML = `<span id="customCharCount">0</span>/300`;

  const baseLabel = $("label[for='customBaseVoice']");
  if (baseLabel) baseLabel.textContent = "Idioma";
  const base = $("#customBaseVoice");
  if (base) base.innerHTML = `
    <option value="pt">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option><option value="fr">Francês</option><option value="it">Italiano</option><option value="de">Alemão</option><option value="ja">Japonês</option><option value="ko">Coreano</option><option value="zh">Mandarim</option>`;
  const qualityLabel = $("label[for='customQuality']");
  if (qualityLabel) qualityLabel.textContent = "Expressividade";
  const quality = $("#customQuality");
  if (quality) quality.innerHTML = `<option value="0.35">Contida</option><option value="0.5" selected>Natural</option><option value="0.75">Expressiva</option><option value="1.0">Intensa</option>`;
  const genBtn = $("#customGenerateBtn");
  if (genBtn) genBtn.textContent = "✦ Gerar nesta voz";

  const libraryTitle = $("#view-custom .custom-library-head h2");
  if (libraryTitle) libraryTitle.textContent = "Catálogo de vozes";

  const settingsCards = $$("#view-settings .settings-card");
  const cloningCard = settingsCards.find(card => /Engine de clonagem/i.test(card.querySelector("h3")?.textContent || ""));
  if (cloningCard) {
    cloningCard.querySelector("h3").textContent = "Motor de vozes especiais";
    const p = cloningCard.querySelector("p");
    if (p) p.textContent = "Chatterbox Multilingual faz TTS zero-shot diretamente a partir do perfil de voz cadastrado.";
    const rows = cloningCard.querySelectorAll(".info-row");
    if (rows[0]) rows[0].innerHTML = `<span>Motor</span><strong>Chatterbox Multilingual</strong>`;
    if (rows[1]) rows[1].innerHTML = `<span>Fluxo</span><strong>Texto → voz direta</strong>`;
    if (rows[2]) rows[2].innerHTML = `<span>Referência</span><strong>5–30 s</strong>`;
    if (rows[3]) rows[3].innerHTML = `<span>Instalação</span><strong>Nenhuma</strong>`;
  }
}

function setupEvents() {
  $("#customConnectBtn")?.addEventListener("click", () => connectRemote(true).catch(() => {}));
  $("#customAddVoiceBtn")?.addEventListener("click", addLocalVoice);
  $("#customGenerateBtn")?.addEventListener("click", generateVoice);
  $("#customDownloadBtn")?.addEventListener("click", downloadCurrent);
  $("#customRefreshBtn")?.addEventListener("click", refreshVoices);
  $("#customSpeechText")?.addEventListener("input", event => {
    const counter = $("#customCharCount");
    if (counter) counter.textContent = event.target.value.length;
  });
  $("#customVoiceGrid")?.addEventListener("click", event => {
    const preview = event.target.closest("[data-custom-preview]");
    if (preview) { event.stopPropagation(); previewReference(preview.dataset.customPreview); return; }
    const del = event.target.closest("[data-custom-delete]");
    if (del) { event.stopPropagation(); deleteVoice(del.dataset.customDelete); return; }
    const card = event.target.closest("[data-custom-card]");
    if (card) {
      state.selectedId = card.dataset.customCard;
      localStorage.setItem("kpnc:customVoiceId", state.selectedId);
      renderVoices();
    }
  });
}

async function init() {
  patchUI();
  setupEvents();
  await refreshVoices();
  connectRemote(false).catch(() => {});
}

init();
