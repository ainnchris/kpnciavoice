const FISH_API = "https://api.fish.audio";
const DEFAULT_MODEL = "s2.1-pro-free";
const MAX_TTS_TEXT = 5000;
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      return json({ error: error?.message || "Erro interno no KPNC Fish proxy." }, 500, request, env);
    }
  },
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin") || "";

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin, env) });

  if (url.pathname === "/health" && request.method === "GET") {
    return json({
      ok: true,
      provider: "Fish Audio",
      model: env.FISH_MODEL || DEFAULT_MODEL,
      configured: Boolean(env.FISH_API_KEY),
    }, 200, request, env);
  }

  assertOriginAllowed(origin, env);
  assertConfigured(env);

  if (url.pathname === "/api/voices" && request.method === "GET") {
    return listVoices(request, env);
  }

  if (url.pathname.startsWith("/api/voices/") && request.method === "GET") {
    const id = safeId(url.pathname.slice("/api/voices/".length));
    return getVoice(id, request, env);
  }

  if (url.pathname === "/api/voices/clone" && request.method === "POST") {
    return createVoice(request, env);
  }

  if (url.pathname === "/api/tts" && request.method === "POST") {
    return textToSpeech(request, env);
  }

  return json({ error: "Rota não encontrada." }, 404, request, env);
}

function configuredOrigins(env) {
  const raw = env.ALLOWED_ORIGINS || "https://ainnchris.github.io,http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:8000,http://localhost:8000";
  return raw.split(",").map(x => x.trim()).filter(Boolean);
}

function assertOriginAllowed(origin, env) {
  if (!origin || !configuredOrigins(env).includes(origin)) {
    throw httpError(403, "Origem não autorizada.");
  }
}

function assertConfigured(env) {
  if (!env.FISH_API_KEY) throw httpError(503, "FISH_API_KEY ainda não foi configurada no Worker.");
}

function corsHeaders(origin, env) {
  const allowed = configuredOrigins(env);
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request.headers.get("Origin") || "", env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(data, status, request, env) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  if (request) for (const [key, value] of Object.entries(corsHeaders(request.headers.get("Origin") || "", env || {}))) headers.set(key, value);
  return new Response(JSON.stringify(data), { status, headers });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function safeId(value) {
  const id = decodeURIComponent(String(value || "")).trim();
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(id)) throw httpError(400, "ID de voz inválido.");
  return id;
}

function fishHeaders(env, extra = {}) {
  return {
    Authorization: `Bearer ${env.FISH_API_KEY}`,
    ...extra,
  };
}

async function fishError(upstream) {
  const type = upstream.headers.get("content-type") || "";
  let message = `Fish Audio respondeu HTTP ${upstream.status}.`;
  try {
    if (type.includes("application/json")) {
      const data = await upstream.json();
      message = data?.detail || data?.message || data?.error || message;
    } else {
      const text = await upstream.text();
      if (text) message = text.slice(0, 1000);
    }
  } catch {}
  return { error: message, provider_status: upstream.status };
}

function normalizeVoice(raw) {
  const samples = Array.isArray(raw?.samples) ? raw.samples : [];
  const sample = samples.find(x => x?.audio) || samples[0] || null;
  return {
    id: raw?._id || raw?.id || "",
    title: raw?.title || "Voz sem nome",
    description: raw?.description || "",
    cover_image: raw?.cover_image || "",
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    languages: Array.isArray(raw?.languages) ? raw.languages : [],
    visibility: raw?.visibility || "public",
    state: raw?.state || "created",
    licensed: Boolean(raw?.licensed),
    task_count: Number(raw?.task_count || 0),
    default_text: raw?.default_text || "",
    sample_url: sample?.audio || "",
    author: raw?.author ? { nickname: raw.author.nickname || "", id: raw.author._id || raw.author.id || "" } : null,
  };
}

async function listVoices(request, env) {
  const input = new URL(request.url);
  const params = new URLSearchParams();
  const pageSize = clampInt(input.searchParams.get("page_size"), 1, 100, 48);
  const pageNumber = clampInt(input.searchParams.get("page_number"), 1, 100000, 1);
  params.set("page_size", String(pageSize));
  params.set("page_number", String(pageNumber));

  const title = cleanShort(input.searchParams.get("title"), 100);
  const language = cleanShort(input.searchParams.get("language"), 20);
  const sortBy = ["score", "task_count", "created_at"].includes(input.searchParams.get("sort_by")) ? input.searchParams.get("sort_by") : "task_count";
  if (title) params.set("title", title);
  if (language) params.set("language", language);
  if (input.searchParams.get("licensed") === "true") params.set("licensed", "true");
  params.set("sort_by", sortBy);

  const upstream = await fetch(`${FISH_API}/model?${params}`, { headers: fishHeaders(env) });
  if (!upstream.ok) return json(await fishError(upstream), upstream.status, request, env);
  const data = await upstream.json();
  const items = (Array.isArray(data.items) ? data.items : [])
    .filter(item => item?.type === "tts" && item?.state !== "failed")
    .map(normalizeVoice);
  return json({
    total: Number(data.total || items.length),
    items,
    has_more: Boolean(data.has_more),
    page_number: pageNumber,
    page_size: pageSize,
  }, 200, request, env);
}

async function getVoice(id, request, env) {
  const upstream = await fetch(`${FISH_API}/model/${encodeURIComponent(id)}`, { headers: fishHeaders(env) });
  if (!upstream.ok) return json(await fishError(upstream), upstream.status, request, env);
  return json({ voice: normalizeVoice(await upstream.json()) }, 200, request, env);
}

async function textToSpeech(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "JSON inválido." }, 400, request, env); }
  const text = String(body?.text || "").trim();
  if (!text) return json({ error: "Texto vazio." }, 400, request, env);
  if (text.length > MAX_TTS_TEXT) return json({ error: `Texto acima do limite desta build (${MAX_TTS_TEXT} caracteres).` }, 413, request, env);
  const referenceId = safeId(body?.reference_id);
  const format = ["mp3", "wav", "opus"].includes(body?.format) ? body.format : "mp3";
  const speed = clampNumber(body?.speed, 0.5, 2, 1);
  const latency = body?.latency === "balanced" ? "balanced" : "normal";
  const chunkLength = clampInt(body?.chunk_length, 100, 300, 250);

  const payload = {
    text,
    reference_id: referenceId,
    format,
    normalize: body?.normalize !== false,
    chunk_length: chunkLength,
    latency,
    temperature: clampNumber(body?.temperature, 0, 1, 0.7),
    top_p: clampNumber(body?.top_p, 0, 1, 0.7),
    repetition_penalty: clampNumber(body?.repetition_penalty, 0.5, 2, 1.2),
    prosody: {
      speed,
      volume: clampNumber(body?.volume, -20, 20, 0),
      normalize_loudness: true,
    },
  };

  const upstream = await fetch(`${FISH_API}/v1/tts`, {
    method: "POST",
    headers: fishHeaders(env, {
      "Content-Type": "application/json",
      model: env.FISH_MODEL || DEFAULT_MODEL,
    }),
    body: JSON.stringify(payload),
  });
  if (!upstream.ok) return json(await fishError(upstream), upstream.status, request, env);

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") || contentTypeFor(format),
    "Cache-Control": "no-store",
    "Content-Disposition": `inline; filename="fish-output.${format}"`,
  });
  for (const [key, value] of Object.entries(corsHeaders(request.headers.get("Origin") || "", env))) headers.set(key, value);
  return new Response(upstream.body, { status: 200, headers });
}

async function createVoice(request, env) {
  let form;
  try { form = await request.formData(); } catch { return json({ error: "Formulário multipart inválido." }, 400, request, env); }
  if (String(form.get("rights_confirmed") || "") !== "true") return json({ error: "É obrigatório confirmar direitos e consentimentos." }, 400, request, env);

  const name = cleanShort(form.get("name"), 80);
  const transcript = cleanShort(form.get("transcript"), 1500);
  const visibility = ["public", "unlist", "private"].includes(form.get("visibility")) ? form.get("visibility") : "unlist";
  const reference = form.get("reference");
  const cover = form.get("cover");
  if (!name) return json({ error: "Nome da voz é obrigatório." }, 400, request, env);
  if (!(reference instanceof File) || reference.size === 0) return json({ error: "Áudio de referência é obrigatório." }, 400, request, env);
  if (reference.size > MAX_REFERENCE_BYTES) return json({ error: "Áudio de referência acima de 20 MB." }, 413, request, env);
  if (cover instanceof File && cover.size > MAX_COVER_BYTES) return json({ error: "Capa acima de 5 MB." }, 413, request, env);
  if (visibility === "public" && (!(cover instanceof File) || cover.size === 0)) return json({ error: "A Fish exige capa para modelo público." }, 400, request, env);

  const outgoing = new FormData();
  outgoing.append("type", "tts");
  outgoing.append("title", name);
  outgoing.append("train_mode", "fast");
  outgoing.append("visibility", visibility);
  outgoing.append("voices", reference, reference.name || "reference.wav");
  outgoing.append("enhance_audio_quality", "true");
  outgoing.append("generate_sample", "true");
  outgoing.append("description", "Voz sintética criada via KPNC Voice Studio. O usuário confirmou possuir direitos, permissões e consentimentos necessários e assume responsabilidade pelas divulgações aplicáveis.");
  if (transcript) outgoing.append("texts", transcript);
  if (cover instanceof File && cover.size) outgoing.append("cover_image", cover, cover.name || "cover.webp");

  const tags = cleanShort(form.get("tags"), 160)
    .split(",")
    .map(x => x.trim())
    .filter(Boolean)
    .slice(0, 12);
  for (const tag of ["kpnc", "synthetic", ...tags]) outgoing.append("tags", tag.slice(0, 40));

  const upstream = await fetch(`${FISH_API}/model`, {
    method: "POST",
    headers: fishHeaders(env),
    body: outgoing,
  });
  if (!upstream.ok) return json(await fishError(upstream), upstream.status, request, env);
  const voice = normalizeVoice(await upstream.json());
  return json({ voice }, 201, request, env);
}

function cleanShort(value, max) {
  return String(value || "").trim().slice(0, max);
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function contentTypeFor(format) {
  if (format === "wav") return "audio/wav";
  if (format === "opus") return "audio/ogg";
  return "audio/mpeg";
}
