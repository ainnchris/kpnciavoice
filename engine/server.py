from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
VOICES_DIR = DATA_DIR / "voices"
INDEX_FILE = DATA_DIR / "voices.json"
SEED_VC_DIR = Path(os.environ.get("SEED_VC_DIR", ROOT / "seed-vc")).resolve()
MAX_REFERENCE_BYTES = 30 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_SOURCE_BYTES = 30 * 1024 * 1024
AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac", ".m4a", ".ogg", ".webm"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

DATA_DIR.mkdir(parents=True, exist_ok=True)
VOICES_DIR.mkdir(parents=True, exist_ok=True)
if not INDEX_FILE.exists():
    INDEX_FILE.write_text("[]", encoding="utf-8")

index_lock = Lock()
convert_lock = asyncio.Lock()

app = FastAPI(title="KPNC Voice Engine", version="0.2.0")

allowed_origins = [
    "https://ainnchris.github.io",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
]
extra_origins = [x.strip() for x in os.environ.get("KPNC_ALLOWED_ORIGINS", "").split(",") if x.strip()]
allowed_origins.extend(extra_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-KPNC-Engine"],
)


@app.middleware("http")
async def allow_private_network(request: Request, call_next):
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network", "").lower() == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["X-KPNC-Engine"] = "0.2.0"
    return response


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_index() -> list[dict]:
    with index_lock:
        try:
            data = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except Exception:
            return []


def save_index(items: list[dict]) -> None:
    with index_lock:
        temp = INDEX_FILE.with_suffix(".tmp")
        temp.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(INDEX_FILE)


def public_voice(item: dict) -> dict:
    return {
        "id": item["id"],
        "name": item["name"],
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at") or item.get("created_at"),
        "has_image": bool(item.get("image")),
    }


def find_voice(voice_id: str) -> dict:
    for item in load_index():
        if item.get("id") == voice_id:
            return item
    raise HTTPException(status_code=404, detail="Voz personalizada não encontrada.")


def clean_name(value: str) -> str:
    value = re.sub(r"\s+", " ", str(value or "").strip())
    if not value:
        raise HTTPException(status_code=400, detail="Informe um nome para a voz.")
    return value[:60]


def safe_extension(filename: Optional[str], allowed: set[str], fallback: str) -> str:
    ext = Path(filename or "").suffix.lower()
    return ext if ext in allowed else fallback


async def save_upload(upload: UploadFile, destination: Path, max_bytes: int) -> int:
    total = 0
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with destination.open("wb") as handle:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(status_code=413, detail="Arquivo maior que o limite permitido.")
                handle.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()
    if total == 0:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    return total


def seed_status() -> tuple[bool, str, str]:
    inference = SEED_VC_DIR / "inference.py"
    if not inference.exists():
        return False, "Seed-VC não encontrado", "desconhecido"
    try:
        import torch
        import librosa  # noqa: F401
        import torchaudio  # noqa: F401

        device = "CUDA / GPU" if torch.cuda.is_available() else "CPU"
        return True, "Seed-VC pronto", device
    except Exception as exc:
        return False, f"Dependências incompletas: {type(exc).__name__}", "desconhecido"


@app.get("/health")
def health():
    ready, detail, device = seed_status()
    return {
        "ok": True,
        "engine": "KPNC Voice Engine",
        "version": "0.2.0",
        "seed_vc_ready": ready,
        "detail": detail,
        "device": device,
        "seed_vc_dir": str(SEED_VC_DIR),
    }


@app.get("/voices")
def list_voices():
    items = sorted(load_index(), key=lambda x: x.get("created_at", ""), reverse=True)
    return {"voices": [public_voice(item) for item in items]}


@app.post("/voices")
async def create_voice(
    name: str = Form(...),
    reference: UploadFile = File(...),
    image: Optional[UploadFile] = File(None),
):
    voice_id = uuid.uuid4().hex
    voice_dir = VOICES_DIR / voice_id
    voice_dir.mkdir(parents=True, exist_ok=True)

    ref_ext = safe_extension(reference.filename, AUDIO_EXTENSIONS, ".wav")
    ref_path = voice_dir / f"reference{ref_ext}"
    image_rel = None

    try:
        await save_upload(reference, ref_path, MAX_REFERENCE_BYTES)
        if image is not None and image.filename:
            image_ext = safe_extension(image.filename, IMAGE_EXTENSIONS, ".webp")
            image_path = voice_dir / f"cover{image_ext}"
            await save_upload(image, image_path, MAX_IMAGE_BYTES)
            image_rel = image_path.name

        now = utc_now()
        item = {
            "id": voice_id,
            "name": clean_name(name),
            "reference": ref_path.name,
            "image": image_rel,
            "created_at": now,
            "updated_at": now,
        }
        items = load_index()
        items.append(item)
        save_index(items)
        return {"voice": public_voice(item)}
    except Exception:
        shutil.rmtree(voice_dir, ignore_errors=True)
        raise


@app.delete("/voices/{voice_id}")
def delete_voice(voice_id: str):
    items = load_index()
    found = next((x for x in items if x.get("id") == voice_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="Voz não encontrada.")
    save_index([x for x in items if x.get("id") != voice_id])
    shutil.rmtree(VOICES_DIR / voice_id, ignore_errors=True)
    return {"ok": True}


@app.get("/voices/{voice_id}/reference")
def voice_reference(voice_id: str):
    item = find_voice(voice_id)
    path = VOICES_DIR / voice_id / item["reference"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Referência não encontrada.")
    return FileResponse(path)


@app.get("/voices/{voice_id}/image")
def voice_image(voice_id: str):
    item = find_voice(voice_id)
    if not item.get("image"):
        raise HTTPException(status_code=404, detail="Esta voz não possui imagem.")
    path = VOICES_DIR / voice_id / item["image"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    return FileResponse(path)


def run_seed_vc(source: Path, target: Path, output_dir: Path, diffusion_steps: int) -> Path:
    ready, detail, device = seed_status()
    if not ready:
        raise RuntimeError(detail)

    fp16 = "True" if device.startswith("CUDA") else "False"
    command = [
        sys.executable,
        str(SEED_VC_DIR / "inference.py"),
        "--source", str(source),
        "--target", str(target),
        "--output", str(output_dir),
        "--diffusion-steps", str(diffusion_steps),
        "--length-adjust", "1.0",
        "--inference-cfg-rate", "0.7",
        "--f0-condition", "False",
        "--auto-f0-adjust", "False",
        "--semi-tone-shift", "0",
        "--fp16", fp16,
    ]

    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    process = subprocess.run(
        command,
        cwd=str(SEED_VC_DIR),
        env=env,
        capture_output=True,
        text=True,
        timeout=15 * 60,
    )
    if process.returncode != 0:
        error = (process.stderr or process.stdout or "Seed-VC encerrou com erro.").strip()
        error = error[-5000:]
        raise RuntimeError(error)

    outputs = sorted(output_dir.glob("*.wav"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not outputs:
        raise RuntimeError("Seed-VC terminou sem criar o arquivo WAV.")
    return outputs[0]


@app.post("/convert")
async def convert_voice(
    voice_id: str = Form(...),
    diffusion_steps: int = Form(10),
    source: UploadFile = File(...),
):
    item = find_voice(voice_id)
    diffusion_steps = max(4, min(50, int(diffusion_steps)))
    voice_dir = VOICES_DIR / voice_id
    reference = voice_dir / item["reference"]
    if not reference.exists():
        raise HTTPException(status_code=404, detail="Arquivo de referência não encontrado.")

    job_dir = Path(tempfile.mkdtemp(prefix="kpnc-vc-", dir=str(DATA_DIR)))
    source_path = job_dir / "source.wav"
    output_dir = job_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        await save_upload(source, source_path, MAX_SOURCE_BYTES)
        async with convert_lock:
            try:
                result = await asyncio.to_thread(run_seed_vc, source_path, reference, output_dir, diffusion_steps)
            except subprocess.TimeoutExpired:
                raise HTTPException(status_code=504, detail="A conversão excedeu 15 minutos.")
            except Exception as exc:
                raise HTTPException(status_code=500, detail=f"Seed-VC falhou: {exc}")

        final_path = job_dir / "kpnc-result.wav"
        shutil.copy2(result, final_path)
        return FileResponse(
            final_path,
            media_type="audio/wav",
            filename="kpnc-personalizada.wav",
            background=BackgroundTask(lambda: shutil.rmtree(job_dir, ignore_errors=True)),
        )
    except Exception:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=7865, reload=False)
