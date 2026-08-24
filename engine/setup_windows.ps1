$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

Write-Host ""
Write-Host "KPNC Voice Engine - instalacao" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

try {
    & py -3.10 --version | Out-Host
} catch {
    Write-Host "Python 3.10 nao foi encontrado." -ForegroundColor Red
    Write-Host "Instale o Python 3.10 (64-bit), marque Add Python to PATH e rode este arquivo novamente."
    exit 1
}

$venv = Join-Path $here ".venv"
$python = Join-Path $venv "Scripts\python.exe"
$pip = @($python, "-m", "pip")

if (-not (Test-Path $python)) {
    Write-Host "Criando ambiente virtual..." -ForegroundColor Yellow
    & py -3.10 -m venv $venv
}

Write-Host "Atualizando pip/setuptools/wheel..." -ForegroundColor Yellow
& $python -m pip install --upgrade pip setuptools wheel
& $python -m pip install "numpy<2"

$seedDir = Join-Path $here "seed-vc"
if (-not (Test-Path (Join-Path $seedDir "inference.py"))) {
    Write-Host "Baixando Seed-VC..." -ForegroundColor Yellow
    $zip = Join-Path $env:TEMP "kpnc-seed-vc.zip"
    $extract = Join-Path $env:TEMP ("kpnc-seed-vc-" + [Guid]::NewGuid().ToString("N"))
    Invoke-WebRequest -Uri "https://github.com/lsgzt/seed-vc/archive/refs/heads/main.zip" -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    $downloaded = Join-Path $extract "seed-vc-main"
    if (-not (Test-Path $downloaded)) { throw "O ZIP do Seed-VC nao continha a pasta esperada." }
    if (Test-Path $seedDir) { Remove-Item $seedDir -Recurse -Force }
    Move-Item $downloaded $seedDir
    Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
}

Write-Host "Instalando PyTorch..." -ForegroundColor Yellow
$hasNvidia = $false
try {
    $null = Get-Command nvidia-smi -ErrorAction Stop
    & nvidia-smi | Out-Null
    $hasNvidia = $true
} catch {
    $hasNvidia = $false
}

if ($hasNvidia) {
    Write-Host "GPU NVIDIA detectada. Instalando PyTorch CUDA." -ForegroundColor Green
    & $python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
} else {
    Write-Host "GPU NVIDIA nao detectada. Instalando PyTorch CPU (funciona, mas a conversao sera mais lenta)." -ForegroundColor DarkYellow
    & $python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
}

Write-Host "Preparando dependencias do Seed-VC..." -ForegroundColor Yellow
$officialReq = Join-Path $seedDir "requirements.txt"
$filteredReq = Join-Path $seedDir "requirements-kpnc.txt"
Get-Content $officialReq | Where-Object {
    $_ -notmatch '^--extra-index-url' -and
    $_ -notmatch '^torch$' -and
    $_ -notmatch '^torchvision$' -and
    $_ -notmatch '^torchaudio$' -and
    $_ -notmatch '^git\+https://github.com/openai/whisper.git'
} | Set-Content $filteredReq -Encoding UTF8

& $python -m pip install -r $filteredReq
& $python -m pip install openai-whisper
& $python -m pip install -r (Join-Path $here "requirements.txt")

Write-Host ""
Write-Host "Verificando instalacao..." -ForegroundColor Yellow
& $python -c "import torch, torchaudio, librosa, fastapi; print('PyTorch:', torch.__version__); print('CUDA:', torch.cuda.is_available()); print('Dependencias: OK')"

Write-Host ""
Write-Host "INSTALACAO CONCLUIDA." -ForegroundColor Green
Write-Host "Agora abra start_windows.bat e deixe a janela aberta enquanto usar vozes personalizadas."
Write-Host "Na primeira conversao, o Seed-VC ainda baixara checkpoints automaticamente."
Write-Host ""
Read-Host "Pressione Enter para fechar"
