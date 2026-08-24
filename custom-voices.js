const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const DEFAULT_API_BASE = String(window.KPNC_FISH_API_BASE || "").trim().replace(/\/+$/, "");
const MY_VOICES_KEY = "kpnc:fishMyVoices";
const SELECTED_KEY = "kpnc:fishSelectedVoice";
const API_OVERRIDE_KEY = "kpnc:fishApiOverride";

const state = {
  apiBase: (localStorage.getItem(API_OVERRIDE_KEY) || DEFAULT_API_BASE).replace(/\/+$/, ""),
  connected: false,
  model: "Fish Audio",
  voices: [],
  myVoices: readJSON(MY_VOICES_KEY, []),
  selectedId: localStorage.getItem(SELECTED_KEY) || null,
  currentBlob: null,
  currentUrl: null,
  busy: false,
  searchTimer: null,
};

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeFilename(value) {
  return String(value || "voz")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "voz";
}

let toastTimer;
function toast(message, error = false) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("error", error);
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 4500);
}

function endpoint(path) {
  if (!state.apiBase) throw new Error("Backend Fish não configurado.");
  return `${state.apiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

async function apiFetch(path, options = {}, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint(path), {
      ...options,
      cache: "no-store",
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function readError(response) {
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const data = await response.json().catch(() => null);
    return data?.detail || data?.message || data?.error || `HTTP ${response.status}`;
  }
  const text = await response.text().catch(() => "");
  return text.slice(0, 700) || `HTTP ${response.status}`;
}

function setApiState(online, note = "") {
  state.connected = online;
  const badge = $("#fishApiState");
  if (badge) {
    badge.className = `custom-engine-state ${online ? "online" : "offline"}`;
    badge.textContent = online ? `● ${state.model}` : "● Fish API desconectada";
  }
  if (note && $("#fishBackendNote")) $("#fishBackendNote").textContent = note;
  const setup = $("#fishApiSetup");
  if (setup) setup.hidden = Boolean(state.apiBase);
  const setting = $("#fishModelSetting");
  if (setting && state.model) setting.textContent = state.model;
}

function patchFishCopy() {
  const hero = $("#view-discovery .hero p");
  if (hero) hero.textContent = "31 vozes locais no navegador e uma biblioteca avançada integrada à Fish Audio para busca, clonagem persistente e geração de alta qualidade por reference_id.";
}

function normalizeVoice(raw, own = false) {
  if (!raw) return null;
  const id = raw.id || raw._id;
  if (!id) return null;
  const samples = Array.isArray(raw.samples) ? raw.samples : [];
  const sample = samples.find(x => x?.audio) || samples[0] || null;
  return {
    id,
    title: raw.title || raw.name || "Voz sem nome",
    description: raw.description || "",
    cover_image: raw.cover_image || raw.coverImage || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    languages: Array.isArray(raw.languages) ? raw.languages : [],
    licensed: Boolean(raw.licensed),
    author: raw.author || null,
    task_count: Number(raw.task_count || 0),
    default_text: raw.default_text || "",
    sample_url: raw.sample_url || sample?.audio || "",
    visibility: raw.visibility || (own ? "unlist" : "public"),
    state: raw.state || "created",
    own,
  };
}

function allVoices() {
  const byId = new Map();
  for (const raw of state.myVoices) {
    const v = normalizeVoice(raw, true);
    if (v) byId.set(v.id, v);
  }
  for (const raw of state.voices) {
    const v = normalizeVoice(raw, false);
    if (v && !byId.has(v.id)) byId.set(v.id, v);
  }
  return [...byId.values()];
}

function selectedVoice() {
  return allVoices().find(v => v.id === state.selectedId) || null;
}

function languageLabel(voice) {
  const langs = voice.languages?.filter(Boolean) || [];
  if (!langs.length) return "Idioma não informado";
  return langs.slice(0, 2).join(", ").toUpperCase();
}

function initials(name) {
  const parts = String(name || "Voz").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "V") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase();
}

function voiceCard(voice) {
  const selected = voice.id === state.selectedId;
  const image = voice.cover_image
    ? `<img src="${escapeHTML(voice.cover_image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : `<span class="voice-monogram">${escapeHTML(initials(voice.title))}</span>`;
  const badge = voice.own ? "Minha voz" : voice.licensed ? "✓ Licenciada" : "Comunidade";
  const author = voice.author?.nickname ? ` · ${voice.author.nickname}` : "";
  const playLabel = voice.sample_url ? "Ouvir amostra" : "Gerar prévia";
  return `<article class="voice-card custom-voice-card ${selected ? "custom-card-selected" : ""}" data-fish-card="${escapeHTML(voice.id)}" style="--v1:#3166ff;--v2:#7d4ce8">
    <div class="voice-art">${image}<button class="voice-play" data-fish-preview="${escapeHTML(voice.id)}" aria-label="${playLabel}">▶</button></div>
    <div class="voice-meta">
      <div style="min-width:0">
        <div class="voice-name">${escapeHTML(voice.title)}</div>
        <div class="voice-sub">${escapeHTML(badge)} · ${escapeHTML(languageLabel(voice))}${escapeHTML(author)}</div>
      </div>
      <span class="fish-use-count" title="Gerações">${voice.task_count ? `${voice.task_count.toLocaleString("pt-BR")}×` : ""}</span>
    </div>
  </article>`;
}

function renderVoices() {
  const grid = $("#fishVoiceGrid");
  if (!grid) return;
  const voices = allVoices();
  grid.innerHTML = voices.length
    ? voices.map(voiceCard).join("")
    : `<div class="empty" style="grid-column:1/-1">Nenhuma voz encontrada com esses filtros.</div>`;
  $("#fishVoiceCount").textContent = `${voices.length} ${voices.length === 1 ? "voz" : "vozes"}`;
  renderSelected();
}

function renderSelected() {
  const box = $("#fishSelectedVoice");
  if (!box) return;
  const voice = selectedVoice();
  if (!voice) {
    box.innerHTML = `<div class="custom-selected-icon">◎</div><div><strong>Nenhuma voz selecionada</strong><span>Escolha uma voz da biblioteca acima ou crie uma nova.</span></div>`;
    $("#fishGenerationStatus").textContent = "Selecione uma voz.";
    return;
  }
  const badge = voice.licensed ? "Licenciada pela Fish" : voice.own ? "Criada por você" : "Modelo público da comunidade";
  box.innerHTML = `<div class="custom-selected-icon">${escapeHTML(initials(voice.title))}</div><div><strong>${escapeHTML(voice.title)}</strong><span>${escapeHTML(badge)} · ${escapeHTML(languageLabel(voice))} · ${escapeHTML(voice.id)}</span></div>`;
  $("#fishGenerationStatus").textContent = "Pronto para gerar.";
}

function selectVoice(id) {
  state.selectedId = id;
  localStorage.setItem(SELECTED_KEY, id);
  renderVoices();
  $("#fishSpeechText")?.focus();
}

async function connectApi(showToast = false) {
  if (!state.apiBase) {
    setApiState(false, "Configure o Cloudflare Worker para ativar a integração Fish.");
    if ($("#fishApiInput")) $("#fishApiInput").value = "";
    return false;
  }
  try {
    const response = await apiFetch("/health", {}, 8000);
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    state.model = data.model || "Fish Audio";
    setApiState(Boolean(data.configured), data.configured ? "Backend seguro conectado. A chave da Fish não é enviada ao navegador." : "Worker conectado, mas FISH_API_KEY ainda não foi configurada.");
    if (!data.configured) throw new Error("O Worker está online, mas falta configurar FISH_API_KEY como segredo.");
    if (showToast) toast("Fish Audio conectada.");
    return true;
  } catch (error) {
    setApiState(false, "Não foi possível conectar ao backend Fish.");
    if (showToast) toast(error.message || String(error), true);
    return false;
  }
}

function currentQuery() {
  const params = new URLSearchParams({
    page_size: "48",
    page_number: "1",
    sort_by: $("#fishSort")?.value || "task_count",
  });
  const title = $("#fishVoiceSearch")?.value.trim();
  const language = $("#fishLanguage")?.value;
  if (title) params.set("title", title);
  if (language) params.set("language", language);
  if ($("#fishLicensedOnly")?.checked) params.set("licensed", "true");
  return params.toString();
}

async function loadVoices(showToast = false) {
  if (!state.connected && !(await connectApi(false))) {
    renderVoices();
    return;
  }
  const grid = $("#fishVoiceGrid");
  if (grid) grid.innerHTML = `<div class="empty" style="grid-column:1/-1">Buscando biblioteca Fish…</div>`;
  try {
    const response = await apiFetch(`/api/voices?${currentQuery()}`, {}, 20000);
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    state.voices = Array.isArray(data.items) ? data.items : [];
    if (!state.selectedId && state.voices[0]) {
      state.selectedId = state.voices[0].id || state.voices[0]._id;
      if (state.selectedId) localStorage.setItem(SELECTED_KEY, state.selectedId);
    }
    renderVoices();
    $("#fishBackendNote").textContent = `${data.total ?? state.voices.length} modelos encontrados na Fish. Esta página mostra até 48 por busca.`;
    if (showToast) toast("Biblioteca atualizada.");
  } catch (error) {
    state.voices = [];
    renderVoices();
    $("#fishBackendNote").textContent = error.message || "Falha ao carregar a biblioteca Fish.";
    if (showToast) toast(error.message || String(error), true);
  }
}

async function generatePreview(id) {
  const voice = allVoices().find(v => v.id === id);
  if (!voice || state.busy) return;
  if (voice.sample_url) {
    const audio = new Audio(voice.sample_url);
    audio.play().catch(() => toast("O navegador não conseguiu tocar a amostra desta voz.", true));
    return;
  }
  const text = voice.default_text || "Olá. Esta é uma breve demonstração desta voz.";
  try {
    const blob = await requestTTS(text, id, "mp3", 1);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
    audio.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
    await audio.play();
  } catch (error) {
    toast(error.message || String(error), true);
  }
}

async function requestTTS(text, referenceId, format, speed) {
  if (!state.connected && !(await connectApi(false))) throw new Error("Fish API não está conectada.");
  const response = await apiFetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      reference_id: referenceId,
      format,
      speed,
      latency: "normal",
      chunk_length: 250,
      normalize: true,
    }),
  }, 180000);
  if (!response.ok) throw new Error(await readError(response));
  return response.blob();
}

function setFishBusy(busy, label = "") {
  state.busy = busy;
  const generate = $("#fishGenerateBtn");
  const clone = $("#cloneBtn");
  if (generate) generate.disabled = busy;
  if (clone) clone.disabled = busy;
  $$('[data-fish-preview]').forEach(x => x.disabled = busy);
  if (label && $("#fishGenerationStatus")) $("#fishGenerationStatus").textContent = label;
}

function showResult(blob, format) {
  if (state.currentUrl) URL.revokeObjectURL(state.currentUrl);
  state.currentBlob = blob;
  state.currentUrl = URL.createObjectURL(blob);
  $("#fishResultAudio").src = state.currentUrl;
  $("#fishResultCard").classList.add("visible");
  $("#fishResultCard").dataset.format = format;
}

async function generateFish() {
  if (state.busy) return;
  const voice = selectedVoice();
  const text = $("#fishSpeechText")?.value.trim();
  const format = $("#fishFormat")?.value || "mp3";
  const speed = Number($("#fishSpeed")?.value || 1);
  if (!voice) return toast("Selecione uma voz Fish primeiro.", true);
  if (!text) return toast("Digite o texto que deve ser falado.", true);
  setFishBusy(true, `Gerando com ${voice.title}…`);
  try {
    const blob = await requestTTS(text, voice.id, format, speed);
    showResult(blob, format);
    $("#fishGenerationStatus").textContent = "Áudio gerado com sucesso.";
    toast("Áudio Fish gerado.");
  } catch (error) {
    $("#fishGenerationStatus").textContent = "Falha na geração.";
    toast(error.message || String(error), true);
  } finally {
    setFishBusy(false);
  }
}

async function createClone() {
  if (state.busy) return;
  const name = $("#cloneName")?.value.trim();
  const reference = $("#cloneReference")?.files?.[0];
  const transcript = $("#cloneTranscript")?.value.trim();
  const cover = $("#cloneCover")?.files?.[0];
  const visibility = $("#cloneVisibility")?.value || "unlist";
  const tags = $("#cloneTags")?.value.trim();
  const consent = $("#cloneConsent")?.checked;
  if (!name) return toast("Informe um nome para a voz.", true);
  if (!reference) return toast("Selecione um áudio de referência.", true);
  if (!consent) return toast("Confirme a declaração de direitos e consentimento.", true);
  if (reference.size > 20 * 1024 * 1024) return toast("A referência deve ter no máximo 20 MB nesta build.", true);
  if (cover && cover.size > 5 * 1024 * 1024) return toast("A capa deve ter no máximo 5 MB.", true);
  if (visibility === "public" && !cover) return toast("A Fish exige uma capa para modelos públicos.", true);
  if (!state.connected && !(await connectApi(false))) return toast("Backend Fish indisponível.", true);

  const form = new FormData();
  form.append("name", name);
  form.append("reference", reference, reference.name || "reference.wav");
  form.append("visibility", visibility);
  form.append("rights_confirmed", "true");
  if (transcript) form.append("transcript", transcript);
  if (tags) form.append("tags", tags);
  if (cover) form.append("cover", cover, cover.name || "cover.webp");

  state.busy = true;
  const button = $("#cloneBtn");
  if (button) { button.disabled = true; button.textContent = "Criando voz…"; }
  $("#cloneStatus").textContent = "Enviando referência para a Fish e criando reference_id…";
  try {
    const response = await apiFetch("/api/voices/clone", { method: "POST", body: form }, 180000);
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    const voice = normalizeVoice(data.voice || data, true);
    if (!voice) throw new Error("A Fish criou o modelo, mas não retornou um ID reconhecível.");
    state.myVoices = [voice, ...state.myVoices.filter(v => (v.id || v._id) !== voice.id)].slice(0, 100);
    saveJSON(MY_VOICES_KEY, state.myVoices);
    state.selectedId = voice.id;
    localStorage.setItem(SELECTED_KEY, voice.id);
    renderVoices();
    $("#cloneName").value = "";
    $("#cloneReference").value = "";
    $("#cloneTranscript").value = "";
    $("#cloneCover").value = "";
    $("#cloneTags").value = "";
    $("#cloneConsent").checked = false;
    $("#cloneStatus").textContent = `Voz criada. reference_id: ${voice.id}`;
    toast("Voz criada na Fish e selecionada.");
  } catch (error) {
    $("#cloneStatus").textContent = error.message || "Falha ao criar a voz.";
    toast(error.message || String(error), true);
  } finally {
    state.busy = false;
    if (button) { button.disabled = false; button.textContent = "+ Criar voz na Fish"; }
  }
}

function downloadCurrent() {
  if (!state.currentBlob) return;
  const voice = selectedVoice();
  const format = $("#fishResultCard")?.dataset.format || "mp3";
  const url = URL.createObjectURL(state.currentBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(voice?.title || "fish-voice")}-${Date.now()}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function saveApiOverride() {
  const value = $("#fishApiInput")?.value.trim().replace(/\/+$/, "") || "";
  if (!/^https:\/\//i.test(value)) return toast("Use a URL HTTPS do Cloudflare Worker.", true);
  state.apiBase = value;
  localStorage.setItem(API_OVERRIDE_KEY, value);
  connectApi(true).then(ok => { if (ok) loadVoices(); });
}

function setupEvents() {
  $("#fishRefreshBtn")?.addEventListener("click", () => loadVoices(true));
  $("#fishSaveApiBtn")?.addEventListener("click", saveApiOverride);
  $("#fishVoiceSearch")?.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => loadVoices(), 450);
  });
  $("#fishLanguage")?.addEventListener("change", () => loadVoices());
  $("#fishSort")?.addEventListener("change", () => loadVoices());
  $("#fishLicensedOnly")?.addEventListener("change", () => loadVoices());
  $("#fishVoiceGrid")?.addEventListener("click", e => {
    const preview = e.target.closest("[data-fish-preview]");
    if (preview) { e.stopPropagation(); generatePreview(preview.dataset.fishPreview); return; }
    const card = e.target.closest("[data-fish-card]");
    if (card) selectVoice(card.dataset.fishCard);
  });
  $("#fishSpeechText")?.addEventListener("input", e => $("#fishCharCount").textContent = e.target.value.length);
  $("#fishSpeed")?.addEventListener("input", e => $("#fishSpeedValue").textContent = `${Number(e.target.value).toFixed(2)}×`);
  $("#fishGenerateBtn")?.addEventListener("click", generateFish);
  $("#fishDownloadBtn")?.addEventListener("click", downloadCurrent);
  $("#cloneBtn")?.addEventListener("click", createClone);
}

async function init() {
  patchFishCopy();
  setupEvents();
  if ($("#fishApiInput")) $("#fishApiInput").value = state.apiBase;
  renderVoices();
  const ok = await connectApi(false);
  if (ok) await loadVoices();
}

init();
