# KPNC Voice Studio

Aplicação estática de text-to-speech que roda a inferência **no navegador**, usando Kokoro-82M v1.0 por meio de `kokoro-js`.

## O que esta versão faz

- Catálogo com 54 vozes e 9 variantes de idioma.
- 3 vozes nativas de Português Brasileiro: `pf_dora`, `pm_alex`, `pm_santa`.
- Pesquisa e filtros por idioma.
- Favoritos salvos em `localStorage`.
- Apelidos personalizados para cada voz.
- Geração TTS no navegador.
- WebGPU quando disponível, com fallback para WASM.
- Controle de velocidade de 0.50x a 2.00x.
- Prévia de voz.
- Download em WAV.
- Histórico local de até 30 gerações usando IndexedDB.
- Sem backend, banco remoto, conta, API key ou cobrança por geração.

## Importante

Na primeira geração, o navegador precisa baixar os arquivos do modelo Kokoro. O tamanho depende da variante carregada e o navegador pode armazená-los em cache para usos posteriores.

Esta build usa as vozes prontas do Kokoro. **Clonagem de voz a partir de um áudio não está incluída**. Para isso, uma versão futura pode integrar Fish Speech, Chatterbox, RVC ou outro backend/modelo compatível.

## Navegadores recomendados

Use uma versão recente de:

1. Google Chrome
2. Microsoft Edge

WebGPU é usado quando funciona. Caso contrário, o aplicativo tenta WASM automaticamente.

## Rodar no computador

O projeto não tem etapa de build.

### Opção A: Python

Na pasta do projeto:

```bash
python -m http.server 8080
```

Abra:

```text
http://localhost:8080
```

### Opção B: VS Code

Use uma extensão de servidor local, como Live Server, e abra `index.html` por HTTP.

> Não abra `index.html` diretamente com `file://`, porque Web Workers e módulos ES podem ser bloqueados pelo navegador.

## Hospedar grátis no GitHub Pages

O projeto já contém `.github/workflows/pages.yml`.

1. Crie um repositório **público** no GitHub.
2. Envie todos os arquivos desta pasta para a raiz do repositório.
3. Abra **Settings > Pages**.
4. Em **Build and deployment > Source**, selecione **GitHub Actions**.
5. Faça um push para a branch `main` se o workflow ainda não tiver executado.
6. Aguarde o workflow `Deploy KPNC Voice Studio to Pages` ficar verde.
7. O endereço publicado aparecerá em **Settings > Pages**.

Não existe servidor de IA no GitHub. O GitHub hospeda somente os arquivos estáticos e o navegador do usuário executa a voz.

## Hospedar grátis no Cloudflare Pages

Este projeto também inclui `_headers` para habilitar cabeçalhos úteis a WebAssembly/WebGPU quando o host oferecer suporte.

Configuração típica:

- Framework preset: `None`
- Build command: vazio
- Output directory: `/` ou a raiz do projeto

Como o site é inteiramente estático, não é necessário configurar Functions.

## Estrutura

```text
kpnc-voice-studio/
├── .github/
│   └── workflows/
│       └── pages.yml
├── docs/
│   └── ROADMAP.md
├── .nojekyll
├── _headers
├── app.js
├── index.html
├── LICENSE
├── README.md
├── styles.css
└── tts-worker.js
```

## Dependências em runtime

A única dependência JavaScript é importada pelo Web Worker com versão fixada:

```text
kokoro-js@1.2.1
```

Modelo:

```text
onnx-community/Kokoro-82M-v1.0-ONNX
```

## Privacidade

- O texto enviado ao TTS é processado pelo modelo no navegador.
- Os áudios do histórico são guardados em IndexedDB no dispositivo.
- Favoritos e apelidos usam localStorage.
- Na primeira utilização, o navegador acessa os CDNs necessários para obter o código da biblioteca e os arquivos públicos do modelo.

## Limitações conhecidas

- Até 1.200 caracteres por geração nesta versão, para reduzir travamentos em dispositivos mais modestos.
- A velocidade depende do computador e do navegador.
- WASM pode ser consideravelmente mais lento que WebGPU.
- Não há clonagem de voz nesta build.
- Não há conversão para MP3; a exportação é WAV para não adicionar outro encoder pesado ao navegador.

## Créditos

- Kokoro-82M: Hexgrad e contribuidores, licença Apache-2.0.
- `kokoro-js`: ecossistema Kokoro/Transformers.js, conforme a licença do projeto original.
- KPNC Voice Studio: interface e integração deste projeto.

Consulte as licenças dos modelos e bibliotecas antes de redistribuir ou usar comercialmente.
