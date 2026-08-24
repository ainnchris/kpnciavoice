const VOICES = [
  ["pf_dora", "p", "F"], ["pm_alex", "p", "M"], ["pm_santa", "p", "M"],
  ["af_alloy", "a", "F"], ["af_aoede", "a", "F"], ["af_bella", "a", "F"], ["af_heart", "a", "F"], ["af_jessica", "a", "F"], ["af_kore", "a", "F"], ["af_nicole", "a", "F"], ["af_nova", "a", "F"], ["af_river", "a", "F"], ["af_sarah", "a", "F"], ["af_sky", "a", "F"],
  ["am_adam", "a", "M"], ["am_echo", "a", "M"], ["am_eric", "a", "M"], ["am_fenrir", "a", "M"], ["am_liam", "a", "M"], ["am_michael", "a", "M"], ["am_onyx", "a", "M"], ["am_puck", "a", "M"], ["am_santa", "a", "M"],
  ["bf_alice", "b", "F"], ["bf_emma", "b", "F"], ["bf_isabella", "b", "F"], ["bf_lily", "b", "F"],
  ["bm_daniel", "b", "M"], ["bm_fable", "b", "M"], ["bm_george", "b", "M"], ["bm_lewis", "b", "M"],
].map(([id, language, gender]) => ({ id, language, gender }));

const LANGUAGES = {
  all: { name: "Todos", flag: "◉" },
  p: { name: "Português BR", flag: "🇧🇷" },
  a: { name: "Inglês EUA", flag: "🇺🇸" },
  b: { name: "Inglês UK", flag: "🇬🇧" },
};

const PREVIEW_TEXT = {
  p: "Olá. Esta é uma prévia da minha voz em português brasileiro.",
  a: "Hello. This is a short preview of my voice.",
  b: "Hello. This is a short preview of my British voice.",
};

const FEATURED = new Set(["pm_alex", "pf_dora", "pm_santa", "af_heart", "af_bella", "am_onyx", "bf_emma", "bm_george"]);
const COLOR_PAIRS = [
  ["#5167ff", "#8f5cff"], ["#1768a9", "#4f8dff"], ["#6941c6", "#b45cff"],
  ["#1c6b63", "#3b9f8f"], ["#8b3e5c", "#d76084"], ["#6d5526", "#c48a33"],
  ["#395273", "#738db2"], ["#663d7b", "#9d65b8"], ["#405b43", "#78a26c"],
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const isPortuguese = (id) => /^p[fm]_/.test(id);

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function escapeHTML(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function titleCase(value) { return value.split("_").map(p => p ? p[0].toUpperCase() + p.slice(1) : p).join(" "); }
function baseVoiceName(v) { return titleCase(v.id.split("_").slice(1).join("_")); }
function genderLabel(g) { return g === "F" ? "Feminina" : "Masculina"; }

const savedVoice = localStorage.getItem("kpnc:selectedVoice");
const initialVoice = VOICES.some(v => v.id === savedVoice) ? savedVoice : "pm_alex";
const state = {
  view: "discovery",
  selectedVoiceId: initialVoice,
  language: "all",
  search: "",
  favorites: new Set(readJSON("kpnc:favorites", []).filter(id => VOICES.some(v => v.id === id))),
  aliases: readJSON("kpnc:aliases", {}),
  busy: false,
  worker: null,
  pending: new Map(),
  englishReady: false,
  portugueseReady: false,
  modelEngine: null,
  vozz: null,
  vozzLoading: null,
  currentBlob: null,
  currentUrl: null,
  historyCount: 0,
};

function voiceById(id) { return VOICES.find(v => v.id === id) || VOICES[0]; }
function voiceName(v) { return state.aliases[v.id]?.trim() || baseVoiceName(v); }
function voiceColors(id) {
  let hash = 0; for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return COLOR_PAIRS[hash % COLOR_PAIRS.length];
}
function voiceInitials(v) {
  const p = voiceName(v).split(/\s+/).filter(Boolean);
  return (p[0]?.[0] || "V") + (p[1]?.[0] || p[0]?.[1] || "");
}
function voiceMatches(v) {
  if (state.language !== "all" && v.language !== state.language) return false;
  if (!state.search) return true;
  const hay = `${voiceName(v)} ${baseVoiceName(v)} ${v.id} ${LANGUAGES[v.language].name} ${genderLabel(v.gender)}`.toLowerCase();
  return hay.includes(state.search.toLowerCase());
}
function sortedVoices() {
  return [...VOICES].sort((a,b) => {
    const ap = a.language === "p" ? 3 : FEATURED.has(a.id) ? 1 : 0;
    const bp = b.language === "p" ? 3 : FEATURED.has(b.id) ? 1 : 0;
    return bp - ap || voiceName(a).localeCompare(voiceName(b), "pt-BR");
  });
}

function voiceCardHTML(v) {
  const [v1,v2] = voiceColors(v.id), fav = state.favorites.has(v.id), lang = LANGUAGES[v.language];
  return `<article class="voice-card ${state.selectedVoiceId === v.id ? "selected" : ""}" data-voice-card="${v.id}" style="--v1:${v1};--v2:${v2}">
    <div class="voice-art"><span class="voice-monogram">${escapeHTML(voiceInitials(v))}</span><button class="voice-play" data-preview-voice="${v.id}" aria-label="Ouvir prévia de ${escapeHTML(voiceName(v))}">▶</button></div>
    <div class="voice-meta"><div style="min-width:0"><div class="voice-name">${escapeHTML(voiceName(v))}</div><div class="voice-sub">${lang.flag} ${escapeHTML(lang.name)} · ${genderLabel(v.gender)}</div></div><button class="favorite-btn ${fav ? "on" : ""}" data-favorite-voice="${v.id}" aria-label="Favoritar">${fav ? "♥" : "♡"}</button></div>
  </article>`;
}
function renderLanguageFilters() {
  $("#languageFilters").innerHTML = ["all","p","a","b"].map(code => `<button class="filter-chip ${state.language === code ? "active" : ""}" data-language="${code}">${LANGUAGES[code].flag} ${LANGUAGES[code].name}</button>`).join("");
}
function renderDiscovery() {
  const voices = sortedVoices().filter(voiceMatches);
  $("#voiceGrid").innerHTML = voices.length ? voices.map(voiceCardHTML).join("") : `<div class="empty" style="grid-column:1/-1">Nenhuma voz encontrada.</div>`;
  $("#voiceCountText").textContent = `${voices.length} ${voices.length === 1 ? "voz" : "vozes"} exibidas`;
  renderLanguageFilters();
}
function renderFavorites() {
  const voices = sortedVoices().filter(v => state.favorites.has(v.id) && voiceMatches(v));
  $("#favoritesGrid").innerHTML = voices.length ? voices.map(voiceCardHTML).join("") : `<div class="empty" style="grid-column:1/-1">Você ainda não favoritou nenhuma voz.</div>`;
}
function renderSelectedVoice() {
  const v = voiceById(state.selectedVoiceId), [v1,v2] = voiceColors(v.id), lang = LANGUAGES[v.language];
  $("#selectedVoicePanel").innerHTML = `<div class="selected-voice-art" style="--v1:${v1};--v2:${v2}"><strong>${escapeHTML(voiceInitials(v))}</strong></div><div class="selected-title">${escapeHTML(voiceName(v))}</div><div class="selected-sub">${lang.flag} ${lang.name} · ${genderLabel(v.gender)} · ${v.id}</div><div class="stats-grid"><div class="stat"><strong>${lang.flag}</strong><span>idioma</span></div><div class="stat"><strong>${v.gender}</strong><span>perfil</span></div><div class="stat"><strong>${state.favorites.has(v.id) ? "♥" : "♡"}</strong><span>favorita</span></div></div><button class="secondary-btn" data-toggle-selected-favorite style="width:100%;margin-top:12px">${state.favorites.has(v.id) ? "Remover das favoritas" : "Adicionar às favoritas"}</button>`;
  $("#aliasInput").value = state.aliases[v.id] || "";
}
function renderStats() { $("#favStat").textContent = state.favorites.size; $("#historyStat").textContent = state.historyCount; }
function selectVoice(id, goStudio=false) {
  if (!VOICES.some(v => v.id === id)) return;
  state.selectedVoiceId = id; localStorage.setItem("kpnc:selectedVoice", id);
  renderDiscovery(); renderFavorites(); renderSelectedVoice(); if (goStudio) navigateTo("studio");
}
function toggleFavorite(id) {
  state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
  saveJSON("kpnc:favorites", [...state.favorites]); renderDiscovery(); renderFavorites(); renderSelectedVoice(); renderStats();
}
function navigateTo(view) {
  state.view = view; $$(".view").forEach(n => n.classList.toggle("active", n.id === `view-${view}`));
  $$("[data-view-target]").forEach(b => b.classList.toggle("active", b.dataset.viewTarget === view));
  $("#sidebar").classList.remove("open"); if (view === "history") renderHistory(); if (view === "favorites") renderFavorites(); window.scrollTo({top:0,behavior:"smooth"});
}

let toastTimer;
function toast(message, kind="normal") { const n=$("#toast"); n.textContent=message; n.classList.toggle("error",kind==="error"); n.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>n.classList.remove("show"),4200); }
function updateEngineUI(status, message) {
  const pill=$("#enginePill");
  if(status==="ready"){ pill.textContent=`● ${message || state.modelEngine || "IA pronta"}`; pill.className="engine-pill ready"; $("#settingsEngine").textContent=message || state.modelEngine || "Pronta"; }
  else if(status==="busy"){ pill.textContent=message || "Carregando IA…"; pill.className="engine-pill busy"; }
  else { pill.textContent=message || "IA não carregada"; pill.className="engine-pill"; }
}
function updateProgress(progress,label){ const t=$("#progressTrack"),b=$("#progressBar"); if(progress==null){t.classList.remove("visible");b.style.width="0%";}else{t.classList.add("visible");b.style.width=`${Math.max(0,Math.min(100,progress))}%`;} if(label) $("#generationStatus").textContent=label; }
function setBusyUI(b){ state.busy=b; $("#generateBtn").disabled=b; $("#previewSelectedBtn").disabled=b; $$("[data-preview-voice]").forEach(x=>x.disabled=b); }

function getWorker(){
  if(state.worker) return state.worker;
  const w=new Worker("./tts-worker.js?v=6",{type:"module"}); state.worker=w;
  w.addEventListener("message",e=>{
    const d=e.data||{};
    if(d.type==="loading"){ updateEngineUI("busy",d.message); updateProgress(null,d.message); }
    if(d.type==="load-progress"){ updateProgress(d.progress,d.file?`Baixando ${d.file}${d.progress!=null?` · ${d.progress}%`:""}`:"Baixando modelo…"); }
    if(d.type==="ready"){ state.englishReady=true; state.modelEngine=d.engine||"Kokoro · WASM"; updateEngineUI("ready",state.modelEngine); updateProgress(null,"IA carregada. Pronto para gerar."); }
    if(d.type==="generating"){ updateEngineUI("busy","Gerando…"); $("#generationStatus").textContent="Gerando áudio…"; }
    if(d.type==="result"){ const req=state.pending.get(d.requestId); if(req){state.pending.delete(d.requestId);req.resolve(d.blob);} setBusyUI(false); updateEngineUI("ready",d.engine||"Kokoro · WASM"); $("#generationStatus").textContent="Áudio gerado com sucesso."; }
    if(d.type==="error"){ const req=state.pending.get(d.requestId); if(req){state.pending.delete(d.requestId);req.reject(new Error(d.message));} setBusyUI(false); updateEngineUI("idle","Falha ao carregar"); updateProgress(null,d.message); }
  });
  w.addEventListener("error",e=>{ setBusyUI(false); toast(e.message||"Falha no motor de voz.","error"); });
  return w;
}

async function ensurePortugueseEngine(){
  if(state.vozz) return state.vozz;
  if(state.vozzLoading) return state.vozzLoading;
  state.vozzLoading=(async()=>{
    updateEngineUI("busy","Carregando motor PT-BR…"); updateProgress(2,"Preparando português brasileiro…");
    const mod=await import("https://cdn.jsdelivr.net/npm/@pedrobef/vozz@0.2.7/+esm");
    const Vozz=mod.Vozz || mod.default;
    const instance=await Vozz.carregar({
      dispositivo:"wasm", precisao:"q8",
      aoProgredir:(p)=>{ const raw=p?.progresso; const pct=typeof raw==="number"?Math.round(raw*100):null; updateProgress(pct,p?.arquivo?`Baixando ${p.arquivo}${pct!=null?` · ${pct}%`:""}`:"Carregando modelo PT-BR…"); }
    });
    state.vozz=instance; state.portugueseReady=true; state.modelEngine="Vozz/Kokoro · PT-BR"; updateEngineUI("ready",state.modelEngine); updateProgress(null,"Motor PT-BR carregado."); return instance;
  })();
  try{return await state.vozzLoading;}finally{state.vozzLoading=null;}
}

async function requestEnglish(text,voice,speed){
  setBusyUI(true); const id=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`; const w=getWorker();
  return new Promise((resolve,reject)=>{state.pending.set(id,{resolve,reject});w.postMessage({type:"generate",requestId:id,text,voice,speed});});
}
async function requestPortuguese(text,voice,speed){
  setBusyUI(true);
  try{
    const engine=await ensurePortugueseEngine(); updateEngineUI("busy","Gerando PT-BR…"); $("#generationStatus").textContent="Gerando áudio em português…";
    const audio=await engine.falar(text,{voz:voice,velocidade:speed});
    const blob=audio.paraBlob ? audio.paraBlob() : new Blob([audio.paraWav()],{type:"audio/wav"});
    state.modelEngine="Vozz/Kokoro · PT-BR"; updateEngineUI("ready",state.modelEngine); $("#generationStatus").textContent="Áudio gerado com sucesso."; return blob;
  } finally { setBusyUI(false); }
}
async function requestGeneration(text,voice,speed=1){
  const clean=String(text||"").trim(); if(!clean) throw new Error("Digite algum texto antes de gerar."); if(clean.length>1200) throw new Error("Nesta versão, cada geração aceita até 1.200 caracteres.");
  return isPortuguese(voice)?requestPortuguese(clean,voice,speed):requestEnglish(clean,voice,speed);
}

async function previewVoice(id){ if(state.busy)return; const v=voiceById(id),button=$(`[data-preview-voice="${CSS.escape(id)}"]`),old=button?.textContent; if(button)button.textContent="…"; try{const blob=await requestGeneration(PREVIEW_TEXT[v.language],v.id,1);const url=URL.createObjectURL(blob),a=new Audio(url);a.addEventListener("ended",()=>URL.revokeObjectURL(url),{once:true});a.addEventListener("error",()=>URL.revokeObjectURL(url),{once:true});await a.play();}catch(e){toast(e.message||String(e),"error");}finally{if(button)button.textContent=old||"▶";}}
async function generateMain(){ const v=voiceById(state.selectedVoiceId),text=$("#speechText").value.trim(),speed=Number($("#speedRange").value); if(!text){toast("Digite algum texto antes de gerar.","error");$("#speechText").focus();return;} try{const blob=await requestGeneration(text,v.id,speed);showCurrentResult(blob);await addHistory({id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,createdAt:Date.now(),voiceId:v.id,text,speed,blob});toast("Áudio gerado e salvo no histórico.");}catch(e){setBusyUI(false);toast(e.message||String(e),"error");}}
function showCurrentResult(blob){ if(state.currentUrl)URL.revokeObjectURL(state.currentUrl);state.currentBlob=blob;state.currentUrl=URL.createObjectURL(blob);$("#resultAudio").src=state.currentUrl;$("#resultCard").classList.add("visible"); }
function sanitizeFilename(v){return String(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9-_]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"voz";}
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

const DB_NAME="kpnc-voice-studio-db",STORE="generations";let dbPromise;
function openDB(){if(dbPromise)return dbPromise;dbPromise=new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:"id"});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});return dbPromise;}
async function getHistory(){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(STORE,"readonly").objectStore(STORE).getAll();r.onsuccess=()=>res((r.result||[]).sort((a,b)=>b.createdAt-a.createdAt));r.onerror=()=>rej(r.error);});}
async function addHistory(item){const db=await openDB();await new Promise((res,rej)=>{const r=db.transaction(STORE,"readwrite").objectStore(STORE).put(item);r.onsuccess=res;r.onerror=()=>rej(r.error);});const items=await getHistory();if(items.length>30){const tx=db.transaction(STORE,"readwrite"),s=tx.objectStore(STORE);items.slice(30).forEach(i=>s.delete(i.id));await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}state.historyCount=Math.min(items.length,30);renderStats();}
async function deleteHistoryItem(id){const db=await openDB();await new Promise((res,rej)=>{const r=db.transaction(STORE,"readwrite").objectStore(STORE).delete(id);r.onsuccess=res;r.onerror=()=>rej(r.error);});await renderHistory();}
async function clearHistory(){const db=await openDB();await new Promise((res,rej)=>{const r=db.transaction(STORE,"readwrite").objectStore(STORE).clear();r.onsuccess=res;r.onerror=()=>rej(r.error);});state.historyCount=0;renderStats();await renderHistory();}
function formatDate(ts){return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(ts));}
async function renderHistory(){const list=$("#historyList");list.innerHTML=`<div class="empty">Carregando histórico…</div>`;try{const items=await getHistory();state.historyCount=items.length;renderStats();if(!items.length){list.innerHTML=`<div class="empty">Nenhum áudio gerado ainda.</div>`;return;}list.innerHTML=items.map(i=>{const v=voiceById(i.voiceId);return `<article class="history-item"><div><div class="history-voice">${escapeHTML(voiceName(v))}</div><div class="history-date">${escapeHTML(formatDate(i.createdAt))} · ${Number(i.speed||1).toFixed(2)}×</div></div><div class="history-text" title="${escapeHTML(i.text)}">${escapeHTML(i.text)}</div><div class="history-actions"><button class="icon-btn" data-history-play="${escapeHTML(i.id)}">▶</button><button class="icon-btn" data-history-download="${escapeHTML(i.id)}">↓</button><button class="icon-btn" data-history-delete="${escapeHTML(i.id)}">×</button></div></article>`;}).join("");list._historyItems=items;}catch{list.innerHTML=`<div class="empty">Não foi possível abrir o histórico local.</div>`;}}
function getHistoryItemFromRendered(id){return $("#historyList")._historyItems?.find(i=>i.id===id);}

async function loadSelectedEngine(){const v=voiceById(state.selectedVoiceId);if(isPortuguese(v.id)){if(state.portugueseReady){toast("Motor PT-BR já está carregado.");return;}try{await ensurePortugueseEngine();toast("Motor PT-BR carregado.");}catch(e){toast(e.message||String(e),"error");}}else{if(state.englishReady){toast("Motor inglês já está carregado.");return;}getWorker().postMessage({type:"load"});toast("Carregando motor inglês…");}}

function patchStaticCopy(){
  const hero=$("#view-discovery .hero p");if(hero)hero.textContent="31 vozes realmente compatíveis nesta build: 3 em português brasileiro e 28 em inglês. Tudo roda no navegador, sem servidor de IA e sem créditos por geração.";
  const note=$("#view-settings .settings-card:first-child p");if(note)note.textContent="Dois motores locais: Vozz/Kokoro para PT-BR e Kokoro.js para inglês, ambos executados no navegador.";
  const rows=$$("#view-settings .settings-card:first-child .info-row strong");if(rows[1])rows[1].textContent="31";if(rows[2])rows[2].textContent="3 vozes";
  const lim=$("#view-settings .settings-card:last-child p");if(lim)lim.textContent="Esta build estática oferece 3 vozes Kokoro em pt-BR e 28 vozes Kokoro em inglês. Clonagem por áudio ainda não está habilitada.";
}

function setupEvents(){
  $$("[data-view-target]").forEach(b=>b.addEventListener("click",()=>navigateTo(b.dataset.viewTarget)));$("#heroStudio").addEventListener("click",()=>navigateTo("studio"));$("#mobileMenu").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
  $("#globalSearch").addEventListener("input",e=>{state.search=e.target.value.trim();renderDiscovery();renderFavorites();if(!["discovery","favorites"].includes(state.view)&&state.search)navigateTo("discovery");});
  $("#languageFilters").addEventListener("click",e=>{const b=e.target.closest("[data-language]");if(!b)return;state.language=b.dataset.language;renderDiscovery();});
  const grid=e=>{const f=e.target.closest("[data-favorite-voice]");if(f){e.stopPropagation();toggleFavorite(f.dataset.favoriteVoice);return;}const p=e.target.closest("[data-preview-voice]");if(p){e.stopPropagation();previewVoice(p.dataset.previewVoice);return;}const c=e.target.closest("[data-voice-card]");if(c)selectVoice(c.dataset.voiceCard,true);};$("#voiceGrid").addEventListener("click",grid);$("#favoritesGrid").addEventListener("click",grid);
  $("#selectedVoicePanel").addEventListener("click",e=>{if(e.target.closest("[data-toggle-selected-favorite]"))toggleFavorite(state.selectedVoiceId);});
  $("#speechText").addEventListener("input",e=>$("#charCount").textContent=e.target.value.length);$("#speedRange").addEventListener("input",e=>$("#speedValue").textContent=`${Number(e.target.value).toFixed(2)}×`);$("#generateBtn").addEventListener("click",generateMain);$("#previewSelectedBtn").addEventListener("click",()=>previewVoice(state.selectedVoiceId));
  $("#downloadCurrentBtn").addEventListener("click",()=>{if(!state.currentBlob)return;const v=voiceById(state.selectedVoiceId);downloadBlob(state.currentBlob,`${sanitizeFilename(voiceName(v))}-${Date.now()}.wav`);});
  $("#loadModelBtn").addEventListener("click",loadSelectedEngine);$("#settingsLoadBtn").addEventListener("click",loadSelectedEngine);
  $("#saveAliasBtn").addEventListener("click",()=>{const x=$("#aliasInput").value.trim();x?state.aliases[state.selectedVoiceId]=x:delete state.aliases[state.selectedVoiceId];saveJSON("kpnc:aliases",state.aliases);renderDiscovery();renderFavorites();renderSelectedVoice();toast("Apelido salvo.");});
  $("#resetAliasBtn").addEventListener("click",()=>{delete state.aliases[state.selectedVoiceId];saveJSON("kpnc:aliases",state.aliases);renderDiscovery();renderFavorites();renderSelectedVoice();toast("Nome original restaurado.");});
  $("#clearHistoryBtn").addEventListener("click",async()=>{if(!confirm("Apagar todo o histórico local de áudios?"))return;try{await clearHistory();toast("Histórico apagado.");}catch{toast("Não foi possível limpar o histórico.","error");}});
  $("#historyList").addEventListener("click",async e=>{const play=e.target.closest("[data-history-play]"),down=e.target.closest("[data-history-download]"),del=e.target.closest("[data-history-delete]");const id=play?.dataset.historyPlay||down?.dataset.historyDownload||del?.dataset.historyDelete;if(!id)return;const item=getHistoryItemFromRendered(id);if(!item)return;if(play){const url=URL.createObjectURL(item.blob),a=new Audio(url);a.addEventListener("ended",()=>URL.revokeObjectURL(url),{once:true});a.play().catch(()=>toast("O navegador bloqueou a reprodução.","error"));}else if(down){const v=voiceById(item.voiceId);downloadBlob(item.blob,`${sanitizeFilename(voiceName(v))}-${item.createdAt}.wav`);}else if(del){await deleteHistoryItem(id);toast("Item removido do histórico.");}});
}

async function init(){patchStaticCopy();renderDiscovery();renderFavorites();renderSelectedVoice();renderStats();setupEvents();try{const items=await getHistory();state.historyCount=items.length;renderStats();}catch{} }
init();
