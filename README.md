# KPNC Voice Studio

Aplicação web de TTS com catálogo de vozes e perfis de voz especiais. O site continua hospedado no GitHub Pages e o visitante não precisa instalar Python, modelos ou aplicativo local.

## Arquitetura atual

### Vozes prontas

- 31 vozes compatíveis.
- 3 vozes em Português Brasileiro: `pf_dora`, `pm_alex`, `pm_santa`.
- 28 vozes em inglês.
- TTS executado no navegador com Kokoro/Vozz.
- Favoritos, apelidos e histórico locais.

### Vozes especiais

O fluxo principal agora é direto, no estilo de bibliotecas como Fish Audio:

```text
Texto → perfil de voz já cadastrado → Chatterbox Multilingual → WAV
```

Não existe mais fala-base Kokoro seguida de Seed-VC no caminho principal.

- O catálogo público fica em `curated-voices.json`.
- Cada perfil público pode apontar para uma referência de áudio autorizada/licenciada por URL.
- O usuário escolhe uma voz, digita o texto e gera.
- Chatterbox Multilingual recebe texto + idioma + referência e faz TTS zero-shot diretamente naquele timbre.
- O Space remoto padrão é `ResembleAI/Chatterbox-Multilingual-TTS`.
- O site detecta o endpoint Gradio automaticamente com `view_api()`.
- O visitante não instala nada.

A build inclui alguns perfis de demonstração oficiais do próprio Chatterbox para testar a experiência imediatamente. Eles não representam pessoas famosas.

### Minhas vozes

O usuário ainda pode cadastrar uma referência própria:

- 5–30 segundos de voz limpa são recomendados.
- A referência fica em IndexedDB no navegador.
- Ela só é enviada ao Space quando o usuário pede uma geração.
- Pode ser removida a qualquer momento pelo próprio navegador.

## Catálogo público

`curated-voices.json` usa este formato:

```json
{
  "voices": [
    {
      "id": "voice-id",
      "name": "Nome exibido",
      "badge": "Licenciada",
      "category": "Cinema",
      "language": "pt",
      "referenceUrl": "https://.../reference.wav",
      "imageUrl": "https://.../cover.webp"
    }
  ]
}
```

Para perfis de pessoas reais, use apenas referências cujo uso e publicação estejam autorizados/licenciados e deixe claro que a saída é sintética.

## Motor remoto

Chatterbox Multilingual suporta TTS condicionado por áudio de referência e múltiplos idiomas. O site usa `@gradio/client` diretamente no navegador.

O backend remoto pode ter fila, dormir ou atingir cota de GPU. Para produção com tráfego alto, troque o Space configurado por infraestrutura própria ou dedicada.

## Privacidade

- TTS comum: processado no navegador.
- Favoritos e configurações: `localStorage`.
- Histórico: IndexedDB.
- Minhas vozes: IndexedDB.
- Perfis do catálogo: metadados públicos no repositório e referências por URL.
- A referência usada na geração é enviada ao Space do Chatterbox durante a inferência.

## Publicação

GitHub Pages:

1. `Settings > Pages`
2. `Deploy from a branch`
3. branch `main`
4. pasta `/(root)`

## Estrutura principal

```text
kpnciavoice/
├── index.html
├── styles.css
├── app.js
├── tts-worker.js
├── custom-voices.js
├── custom-voices.css
├── curated-voices.json
├── .github/workflows/validate.yml
└── engine/                 # legado/fallback local; não é necessário para visitantes
```

## Dependências web

- `kokoro-js`
- `@pedrobef/vozz`
- `@gradio/client@2.5.0`
- Chatterbox Multilingual em um Hugging Face Space Gradio

## Segurança e transparência

O produto deve identificar as saídas como áudio sintético. Não use perfis de voz para fraude, autenticação, personificação enganosa ou para apresentar uma geração como gravação autêntica de outra pessoa.
