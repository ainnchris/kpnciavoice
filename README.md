# KPNC Voice Studio

Aplicação web de TTS com dois modos:

- **Local:** 31 vozes Kokoro/Vozz executadas no navegador.
- **Fish Voices:** biblioteca pública da Fish Audio, TTS por `reference_id` e criação persistente de clones através de um Cloudflare Worker que mantém a chave da API fora do navegador.

## Arquitetura

```text
GitHub Pages
   |
   | HTTPS
   v
Cloudflare Worker
   |
   | Authorization: Bearer FISH_API_KEY
   v
Fish Audio API
   |- GET /model
   |- POST /model
   `- POST /v1/tts
```

A chave `FISH_API_KEY` **nunca** deve ser colocada em `app.js`, `custom-voices.js` ou qualquer arquivo servido pelo GitHub Pages.

## Fish Voices

### Biblioteca pública

O frontend consulta o Worker em `/api/voices`. O Worker consulta `GET https://api.fish.audio/model` e permite:

- pesquisa por título;
- idioma;
- ordenação por relevância, uso ou data;
- filtro **Somente licenciadas pela Fish**;
- seleção de modelos públicos da comunidade.

### Geração

O frontend envia somente:

```json
{
  "text": "Texto a ser falado",
  "reference_id": "id-da-voz",
  "format": "mp3",
  "speed": 1
}
```

O Worker adiciona a credencial e encaminha para `POST /v1/tts`.

### Clonagem persistente

O formulário **Criar voz persistente** envia uma referência de áudio ao Worker. O Worker encaminha para `POST /model` usando:

- `type=tts`;
- `train_mode=fast`;
- arquivo de referência em `voices`;
- visibilidade `unlist`, `private` ou `public`;
- transcrição opcional em `texts`;
- capa obrigatória para modelo público.

A resposta contém o ID da voz. Esse ID pode ser reutilizado em TTS sem reenviar o áudio de referência em cada geração.

## Responsabilidade por vozes de pessoas reais

A infraestrutura aceita perfis de voz de pessoas reais, inclusive figuras públicas, mas quem cria ou utiliza uma voz é responsável por possuir os direitos, permissões e consentimentos aplicáveis e por fazer as divulgações exigidas para conteúdo sintético. O site não deve apresentar áudio de IA como uma gravação autêntica da pessoa.

## Configurar Fish Audio + Cloudflare

### 1. Fish Audio

Crie uma chave em sua conta Fish Audio e guarde o valor como segredo. Não faça commit da chave.

O Worker usa por padrão:

```text
FISH_MODEL=s2.1-pro-free
```

Essa variável fica em `worker/wrangler.toml` e pode ser alterada posteriormente sem mexer no frontend.

> Em agosto de 2026, a Fish informa que o acesso gratuito ao `s2.1-pro-free` está estendido até **31 de agosto de 2026**, sujeito à política de uso justo. Depois disso, confirme a disponibilidade/preço atual e troque `FISH_MODEL` se necessário.

### 2. Secrets no GitHub

No repositório:

```text
Settings
> Secrets and variables
> Actions
> New repository secret
```

Crie:

```text
FISH_API_KEY
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

O token Cloudflare precisa de permissão para editar/deployar Workers.

### 3. Deploy do Worker

Abra:

```text
Actions
> Deploy Fish API Worker
> Run workflow
```

O workflow:

1. instala o Wrangler;
2. publica `worker/`;
3. salva `FISH_API_KEY` como Worker Secret;
4. imprime a URL `workers.dev` nos logs.

### 4. Conectar o GitHub Pages

Abra `fish-config.js` e substitua:

```js
window.KPNC_FISH_API_BASE = "";
```

por:

```js
window.KPNC_FISH_API_BASE = "https://kpnc-voice-api.SEUSUBDOMINIO.workers.dev";
```

Depois do deploy do GitHub Pages, todos os visitantes usarão o mesmo backend sem ver a chave da Fish.

Antes de alterar `fish-config.js`, o proprietário também pode colar a URL do Worker no aviso mostrado na aba **Fish Voices** para testar somente naquele navegador.

## Endpoints do Worker

```text
GET  /health
GET  /api/voices
GET  /api/voices/:id
POST /api/tts
POST /api/voices/clone
```

O Worker aceita requisições do GitHub Pages `https://ainnchris.github.io` e das origens locais configuradas em `worker/wrangler.toml`.

## Limites desta build

- TTS Fish: até 5.000 caracteres por solicitação no frontend/proxy.
- Referência para clone: até 20 MB.
- Capa: até 5 MB.
- A disponibilidade, limites, moderação e preços finais da geração são definidos pela Fish Audio.
- O Worker impede que a chave Fish seja exposta, mas uma API pública ainda pode sofrer abuso; para tráfego maior, adicione Cloudflare Turnstile/rate limiting.

## Arquivos principais

```text
kpnciavoice/
├── index.html
├── styles.css
├── custom-voices.css
├── app.js
├── custom-voices.js
├── fish-config.js
├── tts-worker.js
├── worker/
│   ├── package.json
│   ├── wrangler.toml
│   └── src/index.js
└── .github/workflows/
    ├── validate.yml
    └── deploy-fish-worker.yml
```

## Desenvolvimento local

Para o site:

```bash
python -m http.server 8000
```

Para o Worker:

```bash
cd worker
npm install
npx wrangler dev
```

No desenvolvimento local, configure `FISH_API_KEY` como segredo/variável do Wrangler em vez de escrevê-la no código.

## Créditos

- Fish Audio / S2.1 Pro
- Kokoro-82M
- Vozz/Kokoro PT-BR
- Cloudflare Workers
- KPNC Voice Studio
