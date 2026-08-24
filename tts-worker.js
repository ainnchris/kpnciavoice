import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
let tts = null;
let loadingPromise = null;
const engine = "WASM · Q8";

function send(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

function normalizeProgress(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (value <= 1) return Math.round(value * 100);
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function createTTS() {
  if (tts) return tts;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    send("loading", {
      message: "Carregando Kokoro (modo compatível WASM)…",
      engine,
    });

    const instance = await KokoroTTS.from_pretrained(MODEL_ID, {
      device: "wasm",
      dtype: "q8",
      progress_callback: (info) => {
        const progress = normalizeProgress(info?.progress);
        send("load-progress", {
          status: info?.status ?? "progress",
          file: typeof info?.file === "string" ? info.file.split("/").pop() : null,
          progress,
        });
      },
    });

    tts = instance;
    send("ready", { engine });
    return tts;
  })();

  try {
    return await loadingPromise;
  } catch (error) {
    loadingPromise = null;
    throw error;
  }
}

self.addEventListener("message", async (event) => {
  const data = event.data ?? {};

  if (data.type === "load") {
    try {
      await createTTS();
    } catch (error) {
      send("error", {
        requestId: data.requestId ?? null,
        message: `Falha ao carregar o motor WASM: ${error?.message || String(error)}`,
      });
    }
    return;
  }

  if (data.type !== "generate") return;

  const requestId = data.requestId;

  try {
    const model = await createTTS();
    const text = String(data.text ?? "").trim();
    const voice = String(data.voice ?? "af_heart");
    const speed = Number.isFinite(Number(data.speed))
      ? Math.min(2, Math.max(0.5, Number(data.speed)))
      : 1;

    if (!text) throw new Error("Digite algum texto antes de gerar.");
    if (text.length > 1200) {
      throw new Error("Nesta versão, cada geração aceita até 1.200 caracteres.");
    }

    send("generating", { requestId, voice });

    const audio = await model.generate(text, { voice, speed });
    const blob = audio.toBlob();

    send("result", {
      requestId,
      blob,
      engine,
      voice,
      speed,
    });
  } catch (error) {
    send("error", {
      requestId,
      message: error?.message || String(error),
    });
  }
});
