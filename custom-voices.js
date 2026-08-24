import { Client, handle_file } from "https://cdn.jsdelivr.net/npm/@gradio/client@2.5.0/+esm";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const DEFAULT_SPACE = "Plachta/Seed-VC";
const state = {
  space: localStorage.getItem("kpnc:remoteSpace") || DEFAULT_SPACE,
  client: null,
  endpoint: null,
  connected: false,
  connecting: null,
  voices: [],
  selectedId: localStorage.getItem("kpnc:customVoiceId") || null,
  base: null,
  baseLoading: null,
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
  toastTimer = setTimeout(() => el.classList.remove("show"), 5000);
}

const DB = "kpnc-custom-voices-db", STORE = "voices";
let dbPromise;
function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
}
async function dbAll() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE, "readonly").objectStore(STORE).getAll();
    r.onsuccess = () => resolve((r.result || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
    r.onerror = () => reject(r.error);
  });
}
async function dbPut(v) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE, "readwrite").objectStore(STORE).put(v);
    r.onsuccess = resolve; r.onerror = () => reject(r.error);
  });
}
async function dbDelete(id) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    r.onsuccess = resolve; r.onerror = () => reject(r.error);
  });
}

function esc(v) {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function initials(name) {
  const p = String(name || "Voz").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "V") + (p[1]?.[0] || p[0]?.[1] || "")).toUpperCase();
}
function selected() { return state.voices.find(v => v.id === state.selectedId) || null; }
function setRemote(online, detail = "") {
  state.connected = online;
  const badge = $("#customEngineState");
  if (badge) {
    badge.className = `custom-engine-state ${online ? "online" : "offline"}`;
    badge.textContent = online ? "● ZeroGPU conectado" : "● Serviço remoto indisponível";
  }
  if ($("#customEngineDetails") && detail) $("#customEngineDetails").textContent = detail;
  if ($("#customGenerationStatus") && !state.busy) $("#customGenerationStatus").textContent = online ? "Pronto para gerar." : "Aguardando serviço remoto.";
}
function friendly(err) {
  const t = String(err?.message || err || "");
  if (/quota|exceeded/i.test(t)) return "A cota gratuita do ZeroGPU acabou. Tente novamente mais tarde.";
  if (/queue|capacity|busy/i.test(t)) return "O ZeroGPU está ocupado. Aguarde um pouco e tente novamente.";
  if (/404|not found/i.test(t)) return "O Hugging Face Space configurado não foi encontrado.";
  if (/failed to fetch|network|load failed/i.test(t)) return "Não foi possível acessar o Hugging Face agora.";
  return t || "Falha no serviço remoto.";
}
function findV1Endpoint(info) {
  const named = info?.named_endpoints || {};
  const entries = Object.entries(named);
  const labels = params => params.map(p => `${p.label || ""} ${p.parameter_name || p.name || ""}`).join(" ").toLowerCase();
  const exact = entries.find(([, e]) => (e.parameters || []).length === 8 && /pitch|f0|diffusion/.test(labels(e.parameters || [])));
  if (exact) return exact[0];
  const eight = entries.find(([, e]) => (e.parameters || []).length === 8);
  if (eight) return eight[0];
  if (named["/predict_1"]) return "/predict_1";
  return entries.map(([k]) => k).find(k => /predict_1|v1/i.test(k)) || "/predict_1";
}
async function connect(showToast = true) {
  const field = $("#customEngineUrl");
  const space = String(field?.value || state.space || DEFAULT_SPACE).trim();
  if (!space.includes("/")) { if (showToast) toast("Use usuario/nome-do-space.", true); return false; }
  state.space = space; localStorage.setItem("kpnc:remoteSpace", space); if (field) field.value = space;
  if (state.connected && state.client && state._space === space) return true;
  if (state.connecting) return state.connecting;
  state.connecting = (async () => {
    try {
      setRemote(false, `Conectando a ${space}…`);
      const client = await Client.connect(space, { events: ["data", "status"] });
      const info = await client.view_api();
      state.client = client; state.endpoint = findV1Endpoint(info); state._space = space;
      setRemote(true, `${space} · endpoint ${state.endpoint} · ZeroGPU público`);
      if (showToast) toast("Serviço remoto conectado.");
      return true;
    } catch (e) {
      state.client = null; state.endpoint = null; state._space = null;
      setRemote(false, friendly(e)); if (showToast) toast(friendly(e), true); return false;
    } finally { state.connecting = null; }
  })();
  return state.connecting;
}

function clearImageUrls() { state.imageUrls.forEach(URL.revokeObjectURL); state.imageUrls = []; }
function voiceCard(v) {
  let art = `<span class="voice-monogram">${esc(initials(v.name))}</span>`;
  if (v.image instanceof Blob) { const u = URL.createObjectURL(v.image); state.imageUrls.push(u); art = `<img src="${u}" alt="" loading="lazy">`; }
  return `<article class="voice-card custom-voice-card ${v.id === state.selectedId ? "custom-card-selected" : ""}" data-custom-card="${esc(v.id)}" style="--v1:#4558ff;--v2:#8958d8">
    <div class="voice-art">${art}<button class="voice-play" data-custom-preview="${esc(v.id)}">▶</button></div>
    <div class="voice-meta"><div><div class="voice-name">${esc(v.name)}</div><div class="voice-sub">◎ Referência salva no navegador</div></div><button class="custom-mini-btn danger" data-custom-delete="${esc(v.id)}">×</button></div>
  </article>`;
}
function render() {
  clearImageUrls();
  const grid = $("#customVoiceGrid");
  if (grid) grid.innerHTML = state.voices.length ? state.voices.map(voiceCard).join("") : `<div class="empty custom-empty-note">Nenhuma voz personalizada. Adicione uma referência acima.</div>`;
  if ($("#customVoiceCount")) $("#customVoiceCount").textContent = `${state.voices.length} ${state.voices.length === 1 ? "voz personalizada" : "vozes personalizadas"}`;
  const box = $("#customSelectedVoice"), v = selected();
  if (box) box.innerHTML = v ? `<div class="custom-selected-icon">${esc(initials(v.name))}</div><div><strong>${esc(v.name)}</strong><span>Referência local no navegador</span></div>` : `<div class="custom-selected-icon">◎</div><div><strong>Nenhuma voz selecionada</strong><span>Cadastre ou escolha uma voz abaixo.</span></div>`;
}
async function loadVoices() {
  state.voices = await dbAll();
  if (!state.voices.some(v => v.id === state.selectedId)) state.selectedId = state.voices[0]?.id || null;
  state.selectedId ? localStorage.setItem("kpnc:customVoiceId", state.selectedId) : localStorage.removeItem("kpnc:customVoiceId");
  render();
}
async function addVoice() {
  const name = $("#customVoiceName")?.value.trim(), ref = $("#customReferenceFile")?.files?.[0], img = $("#customImageFile")?.files?.[0];
  if (!name) return toast("Dê um nome para a voz.", true);
  if (!ref) return toast("Escolha um áudio de referência.", true);
  if (!$("#customRightsCheck")?.checked) return toast("Marque a confirmação sobre áudio sintético.", true);
  if (ref.size > 30 * 1024 * 1024) return toast("A referência deve ter no máximo 30 MB.", true);
  if (img && img.size > 5 * 1024 * 1024) return toast("A imagem deve ter no máximo 5 MB.", true);
  const now = new Date().toISOString(), id = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  await dbPut({ id, name, reference: new Blob([ref], { type: ref.type || "audio/wav" }), image: img ? new Blob([img], { type: img.type || "image/webp" }) : null, created_at: now });
  state.selectedId = id; localStorage.setItem("kpnc:customVoiceId", id);
  $("#customVoiceName").value = ""; $("#customReferenceFile").value = ""; $("#customImageFile").value = ""; $("#customRightsCheck").checked = false;
  await loadVoices(); toast("Voz salva no navegador. Ela só será enviada durante a geração.");
}
async function removeVoice(id) {
  const v = state.voices.find(x => x.id === id); if (!v || !confirm(`Excluir “${v.name}” deste navegador?`)) return;
  await dbDelete(id); if (state.selectedId === id) state.selectedId = null; await loadVoices(); toast("Voz removida.");
}
function preview(id) {
  const b = state.voices.find(v => v.id === id)?.reference; if (!b) return;
  const u = URL.createObjectURL(b), a = new Audio(u); a.onended = a.onerror = () => URL.revokeObjectURL(u); a.play().catch(() => toast("O navegador bloqueou a reprodução.", true));
}

async function baseEngine() {
  if (state.base) return state.base; if (state.baseLoading) return state.baseLoading;
  state.baseLoading = (async () => {
    if ($("#customGenerationStatus")) $("#customGenerationStatus").textContent = "Carregando TTS base PT-BR…";
    const mod = await import("https://cdn.jsdelivr.net/npm/@pedrobef/vozz@0.2.7/+esm"), Vozz = mod.Vozz || mod.default;
    state.base = await Vozz.carregar({ dispositivo: "wasm", precisao: "q8" }); return state.base;
  })();
  try { return await state.baseLoading; } finally { state.baseLoading = null; }
}
async function makeBase(text, voice) {
  const e = await baseEngine(), audio = await e.falar(text, { voz: voice, velocidade: 1 });
  return audio.paraBlob ? audio.paraBlob() : new Blob([audio.paraWav()], { type: "audio/wav" });
}
function busy(on, label) {
  state.busy = on; if ($("#customGenerateBtn")) $("#customGenerateBtn").disabled = on; if ($("#customAddVoiceBtn")) $("#customAddVoiceBtn").disabled = on; if (label && $("#customGenerationStatus")) $("#customGenerationStatus").textContent = label;
}
function urlsFrom(value, out = []) {
  if (!value) return out;
  if (typeof value === "string" && /^https?:\/\//.test(value)) out.push(value);
  else if (Array.isArray(value)) value.forEach(x => urlsFrom(x, out));
  else if (typeof value === "object") { if (typeof value.url === "string") out.push(value.url); Object.values(value).forEach(x => urlsFrom(x, out)); }
  return [...new Set(out)];
}
async function remoteConvert(source, reference, steps) {
  if (!state.connected && !(await connect(false))) throw new Error("Serviço remoto indisponível.");
  const job = state.client.submit(state.endpoint || "/predict_1", [handle_file(source), handle_file(reference), steps, 1.0, 0.7, false, true, 0]);
  let urls = [];
  for await (const m of job) {
    if (m.type === "status") {
      const stage = m.stage || m.status?.stage, pos = m.position ?? m.status?.position, eta = m.eta ?? m.status?.eta;
      if (stage === "pending") busy(true, `Na fila ZeroGPU${Number.isFinite(pos) ? ` · posição ${pos + 1}` : ""}${Number.isFinite(eta) ? ` · ~${Math.ceil(eta)}s` : ""}…`);
      if (stage === "generating") busy(true, "ZeroGPU convertendo a voz…");
      if (stage === "error") throw new Error(m.message || "Erro no ZeroGPU.");
    }
    if (m.type === "data") { const found = urlsFrom(m.data); if (found.length) urls = found; }
  }
  const url = [...urls].reverse().find(u => /\.wav(?:\?|$)/i.test(u)) || urls.at(-1); if (!url) throw new Error("O Space não retornou o WAV final.");
  const r = await fetch(url); if (!r.ok) throw new Error(`Falha ao baixar resultado (${r.status}).`); return r.blob();
}
async function generate() {
  if (state.busy) return;
  const v = selected(), text = $("#customSpeechText")?.value.trim(), baseVoice = $("#customBaseVoice")?.value || "pm_alex", steps = Number($("#customQuality")?.value || 10);
  if (!v) return toast("Selecione uma voz personalizada.", true); if (!text) return toast("Digite o texto.", true);
  try {
    busy(true, "1/2 · Gerando fala-base no navegador…"); const source = await makeBase(text, baseVoice);
    busy(true, `2/2 · Enviando para ${state.space}…`); const blob = await remoteConvert(source, v.reference, steps);
    if (state.currentUrl) URL.revokeObjectURL(state.currentUrl); state.currentBlob = blob; state.currentUrl = URL.createObjectURL(blob);
    $("#customResultAudio").src = state.currentUrl; $("#customResultCard").classList.add("visible"); busy(false, "Voz personalizada gerada com sucesso."); toast("Conversão concluída.");
  } catch (e) { busy(false, "Falha na geração."); toast(friendly(e), true); }
}
function download() {
  if (!state.currentBlob) return; const u = URL.createObjectURL(state.currentBlob), a = document.createElement("a"), name = selected()?.name || "voz";
  a.href = u; a.download = `${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-")}-${Date.now()}.wav`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
}

function patchCopy() {
  const p = $("#view-custom .section-head p"); if (p) p.textContent = "Cadastre uma referência e use Seed-VC remoto. O visitante não precisa instalar absolutamente nada.";
  const call = $("#view-custom .custom-callout span"); if (call) call.textContent = "Texto → fala-base no navegador → Seed-VC ZeroGPU → WAV final. A referência só é enviada durante a geração.";
  const h = $("#view-custom .custom-panel h2"); if (h) h.textContent = "Serviço remoto ZeroGPU";
  const sub = $("#view-custom .custom-panel .panel-sub"); if (sub) sub.textContent = "Backend público do Hugging Face. Pode haver fila e limite gratuito diário.";
  const lab = $('label[for="customEngineUrl"]'); if (lab) lab.textContent = "Hugging Face Space";
  const field = $("#customEngineUrl"); if (field) { field.value = state.space; field.placeholder = "usuario/nome-do-space"; }
  if ($("#customEngineDetails")) $("#customEngineDetails").textContent = "Padrão: Plachta/Seed-VC. O endpoint correto é detectado automaticamente.";
  const refHint = $('label[for="customReferenceFile"] + input + .custom-hint'); if (refHint) refHint.textContent = "Use 5–25 segundos, uma pessoa falando, sem música. A referência fica salva neste navegador.";
  const card = $$("#view-settings .settings-card").find(x => /Engine de clonagem/i.test(x.querySelector("h3")?.textContent || ""));
  if (card) {
    card.querySelector("p").textContent = "Seed-VC roda em Hugging Face ZeroGPU. Visitantes usam direto pelo site, sem Python, .bat ou aplicativo local.";
    const rows = [...card.querySelectorAll(".info-row")];
    if (rows[0]) rows[0].innerHTML = '<span>Motor</span><strong>Seed-VC · ZeroGPU</strong>'; if (rows[1]) rows[1].innerHTML = '<span>Instalação</span><strong>Nenhuma</strong>'; if (rows[2]) rows[2].innerHTML = '<span>Referência</span><strong>5–25 s</strong>'; if (rows[3]) rows[3].innerHTML = '<span>Uso</span><strong>Grátis, com cota/fila</strong>';
  }
  const dataCard = $$("#view-settings .settings-card").find(x => /Dados locais/i.test(x.querySelector("h3")?.textContent || "")); if (dataCard?.querySelector("p")) dataCard.querySelector("p").textContent = "Favoritos, histórico e referências personalizadas ficam no navegador. A referência é enviada ao Space apenas ao gerar.";
  const note = document.querySelector(".sidebar-note"); if (note) note.innerHTML = '<strong>Sem instalação</strong> Vozes prontas rodam no navegador. Personalizadas usam ZeroGPU remoto e podem entrar em fila.';
}

function events() {
  $("#customConnectBtn")?.addEventListener("click", () => connect(true));
  $("#customRefreshBtn")?.addEventListener("click", () => loadVoices());
  $("#customAddVoiceBtn")?.addEventListener("click", () => addVoice().catch(e => toast(e.message, true)));
  $("#customGenerateBtn")?.addEventListener("click", generate); $("#customDownloadBtn")?.addEventListener("click", download);
  $("#customSpeechText")?.addEventListener("input", e => { if ($("#customCharCount")) $("#customCharCount").textContent = e.target.value.length; });
  $("#customEngineUrl")?.addEventListener("change", () => { state.connected = false; state.client = null; state.endpoint = null; connect(true); });
  $("#customVoiceGrid")?.addEventListener("click", e => {
    const p = e.target.closest("[data-custom-preview]"); if (p) { e.stopPropagation(); return preview(p.dataset.customPreview); }
    const d = e.target.closest("[data-custom-delete]"); if (d) { e.stopPropagation(); return removeVoice(d.dataset.customDelete); }
    const c = e.target.closest("[data-custom-card]"); if (c) { state.selectedId = c.dataset.customCard; localStorage.setItem("kpnc:customVoiceId", state.selectedId); render(); }
  });
}

patchCopy(); events(); loadVoices().catch(() => render()); connect(false);
window.addEventListener("beforeunload", () => { clearImageUrls(); if (state.currentUrl) URL.revokeObjectURL(state.currentUrl); });
