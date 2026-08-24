# KPNC Voice Studio

Aplicação web de TTS e conversão de voz. O site fica no GitHub Pages e o visitante **não precisa instalar Python, modelos ou aplicativo local**.

## Arquitetura atual

### Vozes prontas

- 31 vozes compatíveis.
- 3 vozes em Português Brasileiro: `pf_dora`, `pm_alex`, `pm_santa`.
- 28 vozes em inglês.
- TTS executado no próprio navegador com Kokoro/Vozz.
- Favoritos, apelidos e histórico locais.

### Vozes personalizadas

- A pessoa adiciona um áudio de referência e, opcionalmente, uma imagem.
- A referência fica salva no **IndexedDB do navegador**.
- O site cria uma fala-base em PT-BR no navegador.
- Durante a geração, a fala-base e a referência são enviadas para um Hugging Face Space com Seed-VC.
- O WAV convertido volta ao navegador.
- Nada precisa ser instalado no computador do visitante.

O Space padrão nesta build é:

```text
Plachta/Seed-VC
```

Ele pode ser trocado na própria aba **Personalizadas** para outro Space Gradio compatível.

## Importante sobre o modo gratuito

O backend padrão usa Hugging Face **ZeroGPU**. É gratuito para uso público, porém possui fila e cotas diárias. Isso significa que o recurso pode ficar temporariamente ocupado ou indisponível quando a cota gratuita de GPU acabar.

Para um serviço público sem fila/cotas seria necessário usar GPU paga ou hospedar infraestrutura própria.

## Privacidade

- Vozes prontas: o texto é processado no navegador.
- Favoritos e configurações: `localStorage`.
- Histórico TTS: IndexedDB.
- Referências personalizadas: IndexedDB no navegador.
- A referência personalizada é enviada ao Hugging Face Space somente quando o usuário pede uma conversão.
- Não apresente áudio sintético como se fosse uma gravação autêntica da pessoa usada como referência.

## Publicação

O site é estático e pode continuar no GitHub Pages:

1. `Settings > Pages`
2. `Deploy from a branch`
3. Branch `main`
4. Pasta `/(root)`

O deploy acontece automaticamente após alterações na `main`.

## Estrutura principal

```text
kpnciavoice/
├── index.html
├── styles.css
├── app.js
├── tts-worker.js
├── custom-voices.js
├── custom-voices.css
├── .github/workflows/validate.yml
└── engine/                 # legado/fallback local; não exigido pelo site
```

## Dependências web

- `kokoro-js`
- `@pedrobef/vozz`
- `@gradio/client@2.5.0`
- Seed-VC executado remotamente no Hugging Face Space configurado.

## Créditos

- Kokoro-82M e ecossistema Kokoro.
- Vozz para PT-BR.
- Seed-VC para conversão zero-shot.
- Gradio Client para comunicação com o Hugging Face Space.

Consulte as licenças dos modelos e bibliotecas antes de redistribuir ou usar comercialmente.