# KPNC Voice Studio

KPNC Voice Studio combina TTS local no navegador com um engine opcional de conversão de voz no próprio computador.

Site publicado:

```text
https://ainnchris.github.io/kpnciavoice/
```

## Recursos atuais

### Vozes prontas

- 31 vozes realmente compatíveis nesta build.
- 3 vozes nativas de Português Brasileiro: `pf_dora`, `pm_alex`, `pm_santa`.
- 28 vozes em inglês pelo `kokoro-js`.
- Pesquisa e filtros.
- Favoritos e apelidos locais.
- Geração TTS no navegador.
- Controle de velocidade.
- Prévia e download WAV.
- Histórico local em IndexedDB.

O português usa `@pedrobef/vozz` + Kokoro; as vozes inglesas usam `kokoro-js`.

### Vozes personalizadas

A área **Personalizadas** integra o site ao **KPNC Voice Engine**, que roda em `localhost` e usa Seed-VC.

Fluxo:

```text
Texto
  ↓
Vozz/Kokoro gera fala-base PT-BR no navegador
  ↓
KPNC Voice Engine em http://127.0.0.1:7865
  ↓
Seed-VC converte usando um áudio de referência
  ↓
WAV final
```

Não é necessário treinar um modelo para cada nova referência. Para uma voz personalizada, basta cadastrar um trecho curto e limpo.

## Instalar o engine de vozes personalizadas no Windows

A instalação é feita uma vez.

1. Tenha **Python 3.10 64-bit** instalado.
2. Entre na pasta `engine`.
3. Abra `setup_windows.bat`.
4. Aguarde a instalação do ambiente Python, PyTorch e Seed-VC.
5. Depois, sempre que quiser usar vozes personalizadas, abra `start_windows.bat`.
6. Deixe a janela aberta enquanto estiver usando a área **Personalizadas** do site.

O servidor local será iniciado em:

```text
http://127.0.0.1:7865
```

Detalhes adicionais estão em `engine/README.md`.

### GPU

Uma GPU NVIDIA compatível melhora muito o tempo de conversão. Sem NVIDIA, o instalador usa PyTorch CPU; a funcionalidade continua disponível, mas pode ficar lenta.

## Áudio de referência

Recomendado:

- 5 a 30 segundos.
- Uma pessoa falando sozinha.
- Sem música.
- Pouco ruído e eco.
- Preferencialmente WAV ou FLAC.

As referências ficam no computador local em `engine/data/voices/` e essa pasta está ignorada pelo Git.

## Hospedagem

O site continua inteiramente estático e pode ser hospedado de graça no GitHub Pages. O GitHub não executa Seed-VC; ele hospeda somente HTML/CSS/JS.

A inferência pesada de vozes personalizadas acontece no computador onde `start_windows.bat` está rodando.

## Estrutura principal

```text
kpnciavoice/
├── app.js
├── custom-voices.js
├── custom-voices.css
├── index.html
├── styles.css
├── tts-worker.js
├── engine/
│   ├── server.py
│   ├── requirements.txt
│   ├── setup_windows.bat
│   ├── setup_windows.ps1
│   ├── start_windows.bat
│   └── README.md
└── README.md
```

Pastas locais criadas pelo engine e ignoradas pelo Git:

```text
engine/.venv/
engine/seed-vc/
engine/data/
```

## Privacidade

- TTS comum é processado no navegador.
- Favoritos e configurações ficam no navegador.
- Referências de vozes personalizadas ficam no computador que executa o KPNC Voice Engine.
- Durante a conversão, a fala-base viaja apenas da página para `127.0.0.1` no próprio computador.
- Modelos e checkpoints públicos são baixados de seus provedores na primeira utilização.

## Uso responsável

Áudio sintético não deve ser apresentado como gravação autêntica de outra pessoa. Respeite direitos de voz, imagem, propriedade intelectual e as regras das plataformas onde o resultado for utilizado.

## Créditos

- Kokoro-82M e ecossistema Kokoro.
- `kokoro-js`.
- `@pedrobef/vozz` para TTS pt-BR no navegador.
- Seed-VC para conversão zero-shot de voz.
- KPNC Voice Studio: interface e integração.
