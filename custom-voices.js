const $c = (s, root = document) => root.querySelector(s);

const customState = {
  apiUrl: localStorage.getItem("kpnc:customEngineUrl") || "http://127.0.0.1:7865",
  connected: false,
  voices: [],
  selectedId: localStorage.getItem("kpnc:customVoiceId") || null,
  baseEngine: null,
  baseLoading: null,
  busy: false,
  currentBlob: null,
  currentUrl: null,
};

function customToast(message, kind = "normal") {
  const node = $c("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("error", kind === "error");
  node.classList.add("show");
  clearTimeout(customToast._timer);
  customToast._timer = setTimeout(() => node.classList.remove("show"), 4500);
}

function apiBase() {
  return customState.apiUrl.replace(/\/+$/, "");
}

function endpoint(path) {
  return `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
}

async function engineFetch(path, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(endpoint(path), {
      ...options,
      mode: "cors",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function setEngineState(online, details = "") {
  customState.connected = online;
  const badge = $c("#customEngineState");
  if (badge) {
    badge.className = `custom-engine-state ${online ? "online" : "offline"}`;
    badge.textContent = online ? "● Engine local conectado" : "● Engine local desconectado";
  }
  const info = $c("#customEngineDetails");
  if (info && details) info.textContent = details;
  const status = $c("#customGenerationStatus");
  if (status && !customState.busy) status.textContent = online ? "Pronto para gerar." : "Aguardando engine local.";
}

function friendlyEngineError(error) {
  const text = String(error?.message || error || "");
  if (/abort/i.test(text)) return "O engine local demorou para responder.";
  if (/failed to fetch|networkerror|load failed/i.test(text)) return "Não consegui acessar o KPNC Voice Engine. Confirme que o start_windows.bat está aberto e que o endereço é http://127.0.0.1:7865.";
  return text || "Falha ao acessar o engine local.";
}

async function connectEngine(showFeedback = true) {
  const field = $c("#customEngineUrl");
  const value = String(field?.value || customState.apiUrl).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) {
    if (showFeedback) customToast("Use um endereço como http://127.0.0.1:7865.", "error");
    return false;
  }
  customState.apiUrl = value;
  localStorage.setItem("kpnc:customEngineUrl", value);
  if (field) field.value = value;
  try {
    const response = await engineFetch("/health", {}, 4000);
    if (!response.ok) throw new Error(`Engine respondeu HTTP ${response.status}.`);
    const data = await response.json();
    const device = data.device ? ` · ${data.device}` : "";
    const seed = data.seed_vc_ready ? "Seed-VC pronto" : "Seed-VC não instalado";
    setEngineState(Boolean(data.seed_vc_ready), `${seed}${device}`);
    if (!data.seed_vc_ready) {
      if (showFeedback) customToast("O servidor abriu, mas o Seed-VC ainda não está instalado. Rode setup_windows.ps1 na pasta engine.", "error");
      return false;
    }
    await loadCustomVoices();
    if (showFeedback) customToast("KPNC Voice Engine conectado.");
    return true;
  } catch (error) {
    setEngineState(false, "Engine local indisponível. Inicie a pasta engine do projeto.");
    if (showFeedback) customToast(friendlyEngineError(error), "error");
    return false;
  }
}

function selectedCustomVoice() {
  return customState.voices.find(v => v.id === customState.selectedId) || null;
}

function escapeCustom(value) {
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

function formatCustomDate(value) {
  try { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value)); }
  catch { return ""; }
}

function renderSelectedCustom() {
  const voice = selectedCustomVoice();
  const box = $c("#customSelectedVoice");
  if (!box) return;
  if (!voice) {
    box.innerHTML = `<div class="custom-selected-icon">◎</div><div><strong>Nenhuma voz selecionada</strong><span>Cadastre ou escolha uma voz abaixo.</span></div>`;
    return;
  }
  box.innerHTML = `<div class="custom-selected-icon">${escapeCustom(initials(voice.name))}</div><div><strong>${escapeCustom(voice.name)}</strong><span>Referência local · ${escapeCustom(formatCustomDate(voice.created_at))}</span></div>`;
}

function customVoiceCard(voice) {
  const selected = voice.id === customState.selectedId;
  const art = voice.has_image
    ? `<img src="${endpoint(`/voices/${encodeURIComponent(voice.id)}/image`)}?v=${encodeURIComponent(voice.updated_at || voice.created_at || "1")}" alt="" loading="lazy" />`
    : `<span class="voice-monogram">${escapeCustom(initials(voice.name))}</span>`;
  return `<article class="voice-card custom-voice-card ${selected ? "custom-card-selected" : ""}" data-custom-card="${escapeCustom(voice.id)}" style="--v1:#4558ff;--v2:#8958d8">
    <div class="voice-art">${art}<button class="voice-play" data-custom-preview="${escapeCustom(voice.id)}" aria-label="Ouvir referência">▶</button></div>
    <div class="voice-meta">
      <div style="min-width:0"><div class="voice-name">${escapeCustom(voice.name)}</div><div class="voice-sub">◎ Seed-VC · referência local</div></div>
      <div class="custom-card-actions"><button class="custom-mini-btn danger" data-custom-delete="${escapeCustom(voice.id)}" aria-label="Excluir voz">×</button></div>
    </div>
  </article>`;
}

function renderCustomVoices() {
  const grid = $c("#customVoiceGrid");
  if (!grid) return;
  if (!customState.connected) {
    grid.innerHTML = `<div class="empty custom-empty-note">Conecte o KPNC Voice Engine para carregar suas vozes.</div>`;
  } else if (!customState.voices.length) {
    grid.innerHTML = `<div class="empty custom-empty-note">Nenhuma voz personalizada cadastrada. Adicione um áudio de referência acima.</div>`;
  } else {
    grid.innerHTML = customState.voices.map(customVoiceCard).join("");
  }
  const count = $c("#customVoiceCount");
  if (count) count.textContent = `${customState.voices.length} ${customState.voices.length === 1 ? "voz personalizada" : "vozes personalizadas"}`;
  renderSelectedCustom();
}

async function loadCustomVoices() {
  if (!customState.connected) return;
  const response = await engineFetch("/voices", {}, 7000);
  if (!response.ok) throw new Error(`Não foi possível carregar as vozes (${response.status}).`);
  const data = await response.json();
  customState.voices = Array.isArray(data.voices) ? data.voices : [];
  if (!customState.voices.some(v => v.id === customState.selectedId)) {
    customState.selectedId = customState.voices[0]?.id || null;
    if (customState.selectedId) localStorage.setItem("kpnc:customVoiceId", customState.selectedId);
    else localStorage.removeItem("kpnc:customVoiceId");
  }
  renderCustomVoices();
}

async function addCustomVoice() {
  if (customState.busy) return;
  const name = $c("#customVoiceName")?.value.trim();
  const reference = $c("#customReferenceFile")?.files?.[0];
  const image = $c("#customImageFile")?.files?.[0];
  const acknowledged = $c("#customRightsCheck")?.checked;
  if (!name) return customToast("Dê um nome para a voz.", "error");
  if (!reference) return customToast("Escolha um áudio de referência.", "error");
  if (!acknowledged) return customToast("Marque a confirmação sobre uso de áudio sintético.", "error");
  if (reference.size > 30 * 1024 * 1024) return customToast("O áudio de referência deve ter no máximo 30 MB.", "error");
  if (image && image.size > 5 * 1024 * 1024) return customToast("A imagem deve ter no máximo 5 MB.", "error");
  if (!customState.connected && !(await connectEngine(false))) return customToast("Inicie o KPNC Voice Engine antes de adicionar a voz.", "error");

  const form = new FormData();
  form.append("name", name);
  form.append("reference", reference, reference.name || "reference.wav");
  if (image) form.append("image", image, image.name || "cover.webp");

  customState.busy = true;
  const button = $c("#customAddVoiceBtn");
  if (button) { button.disabled = true; button.textContent = "Enviando referência…"; }
  try {
    const response = await engineFetch("/voices", { method: "POST", body: form }, 120000);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `Falha ao adicionar voz (${response.status}).`);
    customState.selectedId = data.voice?.id || customState.selectedId;
    if (customState.selectedId) localStorage.setItem("kpnc:customVoiceId", customState.selectedId);
    $c("#customVoiceName").value = "";
    $c("#customReferenceFile").value = "";
    $c("#customImageFile").value = "";
    $c("#customRightsCheck").checked = false;
    await loadCustomVoices();
    customToast("Voz personalizada cadastrada.");
  } catch (error) {
    customToast(friendlyEngineError(error), "error");
  } finally {
    customState.busy = false;
    if (button) { button.disabled = false; button.textContent = "+ Adicionar voz personalizada"; }
  }
}

async function deleteCustomVoice(id) {
  const voice = customState.voices.find(v => v.id === id);
  if (!voice || !confirm(`Excluir a voz “${voice.name}” e a referência salva no seu PC?`)) return;
  try {
    const response = await engineFetch(`/voices/${encodeURIComponent(id)}`, { method: "DELETE" }, 10000);
    if (!response.ok) throw new Error(`Falha ao excluir (${response.status}).`);
    if (customState.selectedId === id) customState.selectedId = null;
    await loadCustomVoices();
    customToast("Voz removida.");
  } catch (error) {
    customToast(friendlyEngineError(error), "error");
  }
}

async function previewReference(id) {
  if (!customState.connected) return customToast("Conecte o engine primeiro.", "error");
  try {
    const response = await engineFetch(`/voices/${encodeURIComponent(id)}/reference`, {}, 30000);
    if (!response.ok) throw new Error("Não foi possível abrir a referência.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
    audio.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
    await audio.play();
  } catch (error) {
    customToast(error.message || String(error), "error");
  }
}

async function ensureCustomBaseEngine() {
  if (customState.baseEngine) return customState.baseEngine;
  if (customState.baseLoading) return customState.baseLoading;
  customState.baseLoading = (async () => {
    const status = $c("#customGenerationStatus");
    if (status) status.textContent = "Carregando TTS base PT-BR…";
    const mod = await import("https://cdn.jsdelivr.net/npm/@pedrobef/vozz@0.2.7/+esm");
    const Vozz = mod.Vozz || mod.default;
    const engine = await Vozz.carregar({
      dispositivo: "wasm",
      precisao: "q8",
      aoProgredir: p => {
        const progress = typeof p?.progresso === "number" ? Math.round(p.progresso * 100) : null;
        if (status) status.textContent = p?.arquivo ? `Baixando ${p.arquivo}${progress != null ? ` · ${progress}%` : ""}` : "Preparando TTS base…";
      },
    });
    customState.baseEngine = engine;
    return engine;
  })();
  try { return await customState.baseLoading; }
  finally { customState.baseLoading = null; }
}

async function buildBaseSpeech(text, voiceId) {
  const engine = await ensureCustomBaseEngine();
  const audio = await engine.falar(text, { voz: voiceId, velocidade: 1 });
  return audio.paraBlob ? audio.paraBlob() : new Blob([audio.paraWav()], { type: "audio/wav" });
}

function setCustomBusy(busy, label) {
  customState.busy = busy;
  const button = $c("#customGenerateBtn");
  if (button) button.disabled = busy;
  const add = $c("#customAddVoiceBtn");
  if (add) add.disabled = busy;
  if (label && $c("#customGenerationStatus")) $c("#customGenerationStatus").textContent = label;
}

async function generateCustomVoice() {
  if (customState.busy) return;
  const voice = selectedCustomVoice();
  const text = $c("#customSpeechText")?.value.trim();
  const baseVoice = $c("#customBaseVoice")?.value || "pm_alex";
  const steps = Number($c("#customQuality")?.value || 10);
  if (!voice) return customToast("Selecione uma voz personalizada.", "error");
  if (!text) return customToast("Digite o texto que deve ser falado.", "error");
  if (!customState.connected && !(await connectEngine(false))) return customToast("O KPNC Voice Engine está desligado.", "error");

  setCustomBusy(true, "1/2 · Gerando fala-base no navegador…");
  try {
    const sourceBlob = await buildBaseSpeech(text, baseVoice);
    setCustomBusy(true, `2/2 · Convertendo para ${voice.name} no Seed-VC…`);
    const form = new FormData();
    form.append("voice_id", voice.id);
    form.append("diffusion_steps", String([4, 10, 25].includes(steps) ? steps : 10));
    form.append("source", sourceBlob, "kpnc-source.wav");
    const response = await engineFetch("/convert", { method: "POST", body: form }, 20 * 60 * 1000);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || `Seed-VC retornou HTTP ${response.status}.`);
    }
    const blob = await response.blob();
    if (customState.currentUrl) URL.revokeObjectURL(customState.currentUrl);
    customState.currentBlob = blob;
    customState.currentUrl = URL.createObjectURL(blob);
    $c("#customResultAudio").src = customState.currentUrl;
    $c("#customResultCard").classList.add("visible");
    $c("#customGenerationStatus").textContent = "Voz personalizada gerada com sucesso.";
    customToast("Conversão concluída.");
  } catch (error) {
    $c("#customGenerationStatus").textContent = "Falha na conversão.";
    customToast(friendlyEngineError(error), "error");
  } finally {
    setCustomBusy(false);
  }
}

function downloadCustomResult() {
  if (!customState.currentBlob) return;
  const voice = selectedCustomVoice();
  const safe = String(voice?.name || "voz-personalizada").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const url = URL.createObjectURL(customState.currentBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe || "voz-personalizada"}-${Date.now()}.wav`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setupCustomEvents() {
  $c("#customEngineUrl").value = customState.apiUrl;
  $c("#customConnectBtn")?.addEventListener("click", () => connectEngine(true));
  $c("#customRefreshBtn")?.addEventListener("click", async () => {
    if (!customState.connected && !(await connectEngine(false))) return customToast("Engine local desconectado.", "error");
    try { await loadCustomVoices(); customToast("Biblioteca atualizada."); } catch (e) { customToast(friendlyEngineError(e), "error"); }
  });
  $c("#customAddVoiceBtn")?.addEventListener("click", addCustomVoice);
  $c("#customGenerateBtn")?.addEventListener("click", generateCustomVoice);
  $c("#customDownloadBtn")?.addEventListener("click", downloadCustomResult);
  $c("#customSpeechText")?.addEventListener("input", e => { const n = $c("#customCharCount"); if (n) n.textContent = e.target.value.length; });
  $c("#customVoiceGrid")?.addEventListener("click", event => {
    const del = event.target.closest("[data-custom-delete]");
    if (del) { event.stopPropagation(); deleteCustomVoice(del.dataset.customDelete); return; }
    const preview = event.target.closest("[data-custom-preview]");
    if (preview) { event.stopPropagation(); previewReference(preview.dataset.customPreview); return; }
    const card = event.target.closest("[data-custom-card]");
    if (card) {
      customState.selectedId = card.dataset.customCard;
      localStorage.setItem("kpnc:customVoiceId", customState.selectedId);
      renderCustomVoices();
    }
  });
  $c('[data-view-target="custom"]')?.addEventListener("click", () => { if (!customState.connected) connectEngine(false); });
}

setupCustomEvents();
renderCustomVoices();
connectEngine(false);
