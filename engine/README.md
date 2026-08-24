# KPNC Voice Engine

Engine local opcional para a área **Personalizadas** do KPNC Voice Studio.

Ele usa **Seed-VC** para conversão zero-shot: você fornece um áudio curto de referência e não precisa treinar um modelo separado para cada voz.

## Windows

### 1. Instalar uma única vez

Requisitos:

- Windows 10/11 64-bit
- Python **3.10** 64-bit
- Internet para a instalação e para o primeiro download dos checkpoints
- Espaço livre em disco para Python, PyTorch e checkpoints

Abra:

```text
setup_windows.bat
```

O instalador cria `.venv`, baixa `lsgzt/seed-vc` e instala as dependências.

Se houver uma GPU NVIDIA compatível, o instalador tenta usar PyTorch CUDA. Sem NVIDIA ele instala PyTorch CPU; a conversão continua disponível, mas pode ficar bastante lenta.

### 2. Iniciar quando quiser usar clonagem

Abra:

```text
start_windows.bat
```

Deixe a janela aberta. O servidor ficará em:

```text
http://127.0.0.1:7865
```

Depois abra o site, entre em **Personalizadas** e clique em **Conectar**.

## Referência de voz

Para melhores resultados:

- 5 a 30 segundos de fala limpa
- uma pessoa por arquivo
- sem música de fundo
- pouco eco e pouco ruído
- WAV ou FLAC são os formatos mais previsíveis

O Seed-VC suporta referência curta sem treinamento. O arquivo fica em `engine/data/voices/` no seu próprio computador.

## Fluxo do KPNC Voice Studio

```text
Texto
  ↓
Vozz/Kokoro PT-BR no navegador
  ↓ WAV base
KPNC Voice Engine em localhost
  ↓
Seed-VC + referência escolhida
  ↓
WAV convertido
```

O GitHub Pages não executa Seed-VC. Ele serve somente a interface; a inferência pesada acontece no computador local.

## Qualidade

Na interface existem três presets:

- **4 passos**: teste rápido
- **10 passos**: equilíbrio entre velocidade e qualidade
- **25 passos**: qualidade maior, mais demorado

A primeira conversão pode demorar bastante porque o Seed-VC baixa checkpoints automaticamente.

## Privacidade e uso responsável

Referências cadastradas ficam no computador que está executando o engine. Não apresente áudio sintético como gravação autêntica de outra pessoa e respeite direitos de voz, imagem e conteúdo aplicáveis ao uso que você fizer.

## API local

- `GET /health`
- `GET /voices`
- `POST /voices`
- `DELETE /voices/{id}`
- `GET /voices/{id}/reference`
- `GET /voices/{id}/image`
- `POST /convert`

O servidor aceita por padrão o site publicado em `https://ainnchris.github.io` e origens locais de desenvolvimento.
