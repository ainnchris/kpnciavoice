import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
let tts = null;
let loadingPromise = null;
let engine = null;

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
    const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;
    const attempts = hasWebGPU
      ? [
          { device: "webgpu", dtype: "q8", label: "WebGPU · Q8" },
          { device: "wasm", dtype: "q8", label: "WASM · Q8" },
        ]
      : [{ device: "wasm", dtype: "q8", label: "WASM · Q8" }];

    let lastError = null;

    for (const attempt of attempts) {
      try {
        send("loading", {
          message: `Carregando Kokoro (${attempt.label})…`,
          engine: attempt.label,
        });

        const instance = await KokoroTTS.from_pretrained(MODEL_ID, {
          device: attempt.device,
          dtype: attempt.dtype,
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
        engine = attempt.label;
        send("ready", { engine });
        return tts;
      } catch (error) {
        lastError = error;
        send("fallback", {
          message: `${attempt.label} falhou; tentando modo compatível…`,
        });
      }
    }

    throw lastError ?? new Error("Não foi possível carregar o modelo de voz.");
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
        message: error?.message || String(error),
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
