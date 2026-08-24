import { Client, handle_file } from "https://cdn.jsdelivr.net/npm/@gradio/client@2.5.0/+esm";

const $c = (s, root = document) => root.querySelector(s);
const $$c = (s, root = document) => [...root.querySelectorAll(s)];

const DEFAULT_SPACE = "Plachta/Seed-VC";
const DB_NAME = "kpnc-custom-voices-db";
const STORE = "voices";
let dbPromise = null;

const customState = {
  space: localStorage.getItem("kpnc:remoteSpace") || DEFAULT_SPACE,
  client: null,
  connected: false,
  connecting: null,
  voices: [],
  selectedId: localStorage.getItem("kpnc:customVoiceId") || null,
  baseEngine: null,
  baseLoading: null,
  busy: false,
  currentBlob: null,
  currentUrl: null,
  imageUrls: new Map(),
};

function customToast(message, kind = "normal") {
  const node = $c("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("error", kind === "error");
  node.classList.add("show");
  clearTimeout(customToast._timer);
  customToast._timer = setTimeout(() => node.classList.remove("show"), 5000);
}

function openVoiceDB() {
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

async function listSavedVoices() {
  const db = await openVoiceDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")));
    req.onerror = () => reject(req.error);
  });
}

async function saveVoiceRecord(record) {
  const db = await openVoiceDB();
  await new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(record);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

async function deleteVoiceRecord(id) {
  const db = await openVoiceDB();
  await new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

function setEngineState(online, details = "") {
  customState.connected = online;
  const badge = $c("#customEngineState");
  if (badge) {
    badge.className = `custom-engine-state ${online ? "online" : "offline"}`;
    badge.textContent = online ? "● ZeroGPU conectado" : "● Serviço remoto indisponível";
  }
  const info = $c("#customEngineDetails");
  if (info && details) info.textContent = details;
  const status = $c("#customGenerationStatus");
  if (status && !customState.busy) status.textContent = online ? "Pronto para gerar." : "Aguardando serviço remoto.";
}

function friendlyRemoteError(error) {
  const text = String(error?.message || error || "");
  if (/quota|gpu quota|exceeded/i.test(text)) return "A cota gratuita do ZeroGPU foi atingida. Tente novamente mais tarde ou troque o Space nas configurações.";
  if (/queue|capacity|busy/i.test(text)) return "O ZeroGPU está ocupado. Aguarde um pouco e tente novamente.";
  if (/not found|404/i.test(text)) return "O Space configurado não foi encontrado.";
  if (/failed to fetch|network|load failed/i.test(text)) return "Não foi possível acessar o serviço remoto do Hugging Face.";
  return text || "Falha ao acessar o serviço remoto.";
}

async function connectEngine(showFeedback = true) {
  const field = $c("#customEngineUrl");
  const value = String(field?.value || customState.space || DEFAULT_SPACE).trim();
  if (!value || !value.includes("/")) {
    if (showFeedback) customToast("Use um Space no formato usuario/nome-do-space.", "error");
    return false;
  }

  customState.space = value;
  localStorage.setItem("kpnc:remoteSpace", value);
  if (field) field.value = value;

  if (customState.connected && customState.client && customState._connectedSpace === value) return true;
  if (customState.connecting) return customState.connecting;

  customState.connecting = (async () => {
    try {
      setEngineState(false, `Conectando a ${value}…`);
      const client = await Client.connect(value, { events: ["data", "status"] });
      await client.view_api();
      customState.client = client;
      customState._connectedSpace = value;
      setEngineState(true, `${value} · Hugging Face ZeroGPU. Referências são enviadas somente durante a geração.`);
      if (showFeedback) customToast("Serviço remoto conectado.");
      return true;
    } catch (error) {
      customState.client = null;
      customState._connectedSpace = null;
      setEngineState(false, friendlyRemoteError(error));
      if (showFeedback) customToast(friendlyRemoteError(error), "error");
      return false;
    } finally {
      customState.connecting = null;
    }
  })();

  return customState.connecting;
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

function revokeImageUrls() {
  for (const url of customState.imageUrls.values()) URL.revokeObjectURL(url);
  customState.imageUrls.clear();
}

function renderSelectedCustom() {
  const voice = selectedCustomVoice();
  const box = $c("#customSelectedVoice");
  if (!box) return;
  if (!voice) {
    box.innerHTML = `<div class="custom-selected-icon">◎</div><div><strong>Nenhuma voz selecionada</strong><span>Cadastre ou escolha uma voz abaixo.</span></div>`;
    return;
  }
  box.innerHTML = `<div class="custom-selected-icon">${escapeCustom(initials(voice.name))}</div><div><strong>${escapeCustom(voice.name)}</strong><span>Salva neste navegador · ${escapeCustom(formatCustomDate(voice.created_at))}</span></div>`;
}

function customVoiceCard(voice) {
  const selected = voice.id === customState.selectedId;
  let art = `<span class="voice-monogram">${escapeCustom(initials(voice.name))}</span>`;
  if (voice.image instanceof Blob) {
    const url = URL.createObjectURL(voice.image);
    customState.imageUrls.set(voice.id, url);
    art = `<img src="${url}" alt="" loading="lazy" />`;
  }
  return `<article class="voice-card custom-voice-card ${selected ? "custom-card-selected" : ""}" data-custom-card="${escapeCustom(voice.id)}" style="--v1:#4558ff;--v2:#8958d8">
    <div class="voice-art">${art}<button class="voice-play" data-custom-preview="${escapeCustom(voice.id)}" aria-label="Ouvir referência">▶</button></div>
    <div class="voice-meta">
      <div style="min-width:0"><div class="voice-name">${escapeCustom(voice.name)}</div><div class="voice-sub">◎ Referência personalizada · navegador</div></div>
      <div class="custom-card-actions"><button class="custom-mini-btn danger" data-custom-delete="${escapeCustom(voice.id)}" aria-label="Excluir voz">×</button></div>
    </div>
  </article>`;
}

function renderCustomVoices() {
  const grid = $c("#customVoiceGrid");
  if (!grid) return;
  revokeImageUrls();
  if (!customState.voices.length) {
    grid.innerHTML = `<div class="empty custom-empty-note">Nenhuma voz personalizada cadastrada. Adicione um áudio de referência acima.</div>`;
  } else {
    grid.innerHTML = customState.voices.map(customVoiceCard).join("");
  }
  const count = $c("#customVoiceCount");
  if (count) count.textContent = `${customState.voices.length} ${customState.voices.length === 1 ? "voz personalizada" : "vozes personalizadas"}`;
  renderSelectedCustom();
}

async function loadCustomVoices() {
  customState.voices = await listSavedVoices();
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

  customState.busy = true;
  const button = $c("#customAddVoiceBtn");
  if (button) { button.disabled = true; button.textContent = "Salvando…"; }
  try {
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      name,
      reference: new Blob([reference], { type: reference.type || "audio/wav" }),
      reference_name: reference.name || "reference.wav",
      image: image ? new Blob([image], { type: image.type || "image/webp" }) : null,
      created_at: now,
      updated_at: now,
    };
    await saveVoiceRecord(record);
    customState.selectedId = record.id;
    localStorage.setItem("kpnc:customVoiceId", record.id);
    $c("#customVoiceName").value = "";
    $c("#customReferenceFile").value = "";
    $c("#customImageFile").value = "";
    $c("#customRightsCheck").checked = false;
    await loadCustomVoices();
    customToast("Voz salva neste navegador. Nada foi enviado ao servidor ainda.");
  } catch (error) {
    customToast(error.message || "Não foi possível salvar a voz neste navegador.", "error");
  } finally {
    customState.busy = false;
    if (button) { button.disabled = false; button.textContent = "+ Adicionar voz personalizada"; }
  }
}

async function deleteCustomVoice(id) {
  const voice = customState.voices.find(v => v.id === id);
  if (!voice || !confirm(`Excluir a voz “${voice.name}” deste navegador?`)) return;
  try {
    await deleteVoiceRecord(id);
    if (customState.selectedId === id) customState.selectedId = null;
    await loadCustomVoices();
    customToast("Voz removida.");
  } catch (error) {
    customToast(error.message || "Não foi possível excluir a voz.", "error");
  }
}

async function previewReference(id) {
  const voice = customState.voices.find(v => v.id === id);
  if (!voice?.reference) return;
  const url = URL.createObjectURL(voice.reference);
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
  audio.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
  await audio.play().catch(() => customToast("O navegador bloqueou a reprodução.", "error"));
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

function collectFileUrls(value, urls = []) {
  if (!value) return urls;
  if (typeof value === "string" && /^https?:\/\//i.test(value)) urls.push(value);
  else if (Array.isArray(value)) value.forEach(v => collectFileUrls(v, urls));
  else if (typeof value === "object") {
    if (typeof value.url === "string") urls.push(value.url);
    if (typeof value.path === "string" && /^https?:\/\//i.test(value.path)) urls.push(value.path);
    Object.values(value).forEach(v => collectFileUrls(v, urls));
  }
  return [...new Set(urls)];
}

async function convertRemote(sourceBlob, referenceBlob, steps) {
  if (!customState.connected || !customState.client) {
    const ok = await connectEngine(false);
    if (!ok) throw new Error("Não foi possível conectar ao serviço remoto.");
  }

  const submission = customState.client.submit("/predict", [
    handle_file(sourceBlob),
    handle_file(referenceBlob),
    steps,
    1.0,
    0.7,
    false,
    true,
    0,
  ]);

  let latestUrls = [];
  for await (const msg of submission) {
    if (msg.type === "status") {
      const status = msg.stage || msg.status?.stage;
      const position = msg.position ?? msg.status?.position;
      const eta = msg.eta ?? msg.status?.eta;
      if (status === "pending") {
        setCustomBusy(true, `Na fila ZeroGPU${Number.isFinite(position) ? ` · posição ${position + 1}` : ""}${Number.isFinite(eta) ? ` · ~${Math.ceil(eta)}s` : ""}…`);
      } else if (status === "generating") {
        setCustomBusy(true, "ZeroGPU processando a conversão…");
      } else if (status === "error") {
        throw new Error(msg.message || "O ZeroGPU encerrou a geração com erro.");
      }
    }
    if (msg.type === "data") {
      const urls = collectFileUrls(msg.data);
      if (urls.length) latestUrls = urls;
    }
  }

  const preferred = [...latestUrls].reverse().find(url => /\.wav(?:\?|$)/i.test(url)) || latestUrls.at(-1);
  if (!preferred) throw new Error("O serviço terminou sem retornar o áudio final.");
  const response = await fetch(preferred);
  if (!response.ok) throw new Error(`Não foi possível baixar o resultado (${response.status}).`);
  return response.blob();
}

async function generateCustomVoice() {
  if (customState.busy) return;
  const voice = selectedCustomVoice();
  const text = $c("#customSpeechText")?.value.trim();
  const baseVoice = $c("#customBaseVoice")?.value || "pm_alex";
  const steps = Number($c("#customQuality")?.value || 10);
  if (!voice) return customToast("Selecione uma voz personalizada.", "error");
  if (!text) return customToast("Digite o texto que deve ser falado.", "error");
  if (!voice.reference) return customToast("A referência desta voz não está disponível.", "error");

  setCustomBusy(true, "1/2 · Gerando fala-base no navegador…");
  try {
    const sourceBlob = await buildBaseSpeech(text, baseVoice);
    setCustomBusy(true, `2/2 · Enviando para ${customState.space}…`);
    const resultBlob = await convertRemote(sourceBlob, voice.reference, steps);

    if (customState.currentUrl) URL.revokeObjectURL(customState.currentUrl);
    customState.currentBlob = resultBlob;
    customState.currentUrl = URL.createObjectURL(resultBlob);
    $c("#customResultAudio").src = customState.currentUrl;
    $c("#customResultCard").classList.add("visible");
    setCustomBusy(false, "Voz personalizada gerada com sucesso.");
    customToast("Conversão concluída.");
  } catch (error) {
    setCustomBusy(false, "Falha na geração.");
    customToast(friendlyRemoteError(error), "error");
  }
}

function sanitizeFilename(value) {
  return String(value || "voz")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 60) || "voz";
}

function downloadCurrentCustom() {
  if (!customState.currentBlob) return;
  const voice = selectedCustomVoice();
  const url = URL.createObjectURL(customState.currentBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(voice?.name)}-${Date.now()}.wav`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function patchRemoteCopy() {
  const heading = $c("#view-custom .section-head p");
  if (heading) heading.textContent = "Cadastre uma referência no navegador e converta o TTS usando Seed-VC em um Hugging Face Space. Ninguém precisa instalar nada.";

  const callout = $c("#view-custom .custom-callout span");
  if (callout) callout.textContent = "Texto → TTS base no navegador → referência + fala-base vão ao ZeroGPU → WAV final volta para o navegador.";

  const panelTitle = $c("#view-custom .custom-panel h2");
  if (panelTitle) panelTitle.textContent = "Serviço remoto ZeroGPU";

  const panelSub = $c("#view-custom .custom-panel .panel-sub");
  if (panelSub) panelSub.textContent = "Usamos um Hugging Face Space público. O serviço tem fila e cota gratuita, mas não exige instalação.";

  const engineLabel = $c('label[for="customEngineUrl"]');
  if (engineLabel) engineLabel.textContent = "Hugging Face Space";

  const field = $c("#customEngineUrl");
  if (field) {
    field.value = customState.space;
    field.placeholder = "usuario/nome-do-space";
  }
  const button = $c("#customConnectBtn");
  if (button) button.textContent = "Conectar";

  const hint = $c("#customEngineDetails");
  if (hint) hint.textContent = "Padrão: Plachta/Seed-VC. Você pode trocar para outro Space compatível quando quiser.";

  const refHint = $c('label[for="customReferenceFile"] + input + .custom-hint');
  if (refHint) refHint.textContent = "Use de 5 a 25 segundos, uma pessoa falando sozinha, sem música. A referência fica no seu navegador e só é enviada durante a geração.";

  const settingsCards = $$c("#view-settings .settings-card");
  const cloneCard = settingsCards.find(card => /Engine de clonagem/i.test(card.querySelector("h3")?.textContent || ""));
  if (cloneCard) {
    const p = cloneCard.querySelector("p");
    if (p) p.textContent = "Seed-VC roda remotamente em Hugging Face ZeroGPU. Visitantes usam pelo navegador, sem Python, .bat ou aplicativo local.";
    const rows = [...cloneCard.querySelectorAll(".info-row")];
    if (rows[0]) rows[0].innerHTML = '<span>Motor</span><strong>Seed-VC · ZeroGPU</strong>';
    if (rows[1]) rows[1].innerHTML = '<span>Instalação do visitante</span><strong>Nenhuma</strong>';
    if (rows[2]) rows[2].innerHTML = '<span>Referência</span><strong>5–25 s</strong>';
    if (rows[3]) rows[3].innerHTML = '<span>Custo do visitante</span><strong>Grátis, com cota</strong>';
  }

  const note = document.querySelector(".sidebar-note");
  if (note) note.innerHTML = '<strong>Sem instalação</strong> TTS comum roda no navegador. Vozes personalizadas usam ZeroGPU remoto e podem entrar em fila.';
}

function setupCustomEvents() {
  $c("#customConnectBtn")?.addEventListener("click", () => connectEngine(true));
  $c("#customRefreshBtn")?.addEventListener("click", () => loadCustomVoices().catch(e => customToast(e.message, "error")));
  $c("#customAddVoiceBtn")?.addEventListener("click", addCustomVoice);
  $c("#customGenerateBtn")?.addEventListener("click", generateCustomVoice);
  $c("#customDownloadBtn")?.addEventListener("click", downloadCurrentCustom);
  $c("#customSpeechText")?.addEventListener("input", e => {
    const count = $c("#customCharCount");
    if (count) count.textContent = e.target.value.length;
  });
  $c("#customEngineUrl")?.addEventListener("change", () => {
    customState.connected = false;
    customState.client = null;
    connectEngine(true);
  });
  $c("#customVoiceGrid")?.addEventListener("click", event => {
    const preview = event.target.closest("[data-custom-preview]");
    if (preview) { event.stopPropagation(); previewReference(preview.dataset.customPreview); return; }
    const del = event.target.closest("[data-custom-delete]");
    if (del) { event.stopPropagation(); deleteCustomVoice(del.dataset.customDelete); return; }
    const card = event.target.closest("[data-custom-card]");
    if (card) {
      customState.selectedId = card.dataset.customCard;
      localStorage.setItem("kpnc:customVoiceId", customState.selectedId);
      renderCustomVoices();
    }
  });
}

async function initCustomVoices() {
  patchRemoteCopy();
  setupCustomEvents();
  try { await loadCustomVoices(); }
  catch { renderCustomVoices(); }
  connectEngine(false);
}

window.addEventListener("beforeunload", () => {
  revokeImageUrls();
  if (customState.currentUrl) URL.revokeObjectURL(customState.currentUrl);
});

initCustomVoices();
