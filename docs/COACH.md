# 🎙️ coach · conversa em inglês com IA

App mobile-first pra **conversar em inglês por voz** com um professor de IA.
A ideia não é estudar meia hora: é conversar. As correções vêm depois, e só as
que valem a pena. Abre em `coach.html`.

> Conversation first. Correction second. Learning happens naturally.

## Como funciona

1. **Onboarding** (uma vez): nome, nível e qual inglês você quer ouvir.
2. **Talk** → escolhe a situação (ou "Surprise me"), toca no microfone e fala.
3. O professor responde **por voz**, com o sotaque escolhido, e mantém a
   conversa andando — sem interromper pra corrigir cada erro.
4. **End** encerra e abre o balanço: nota da conversa, *Words & Expressions You
   Discovered* e *A Few Things to Improve*.
5. As palavras entram no seu vocabulário e **voltam sozinhas** dias depois, na
   aba Learn → Review e nas próximas conversas.

### As cinco abas

| Aba | O que tem |
| --- | --- |
| **Home** | Today's English (palavra do dia + desafio), botão de começar, ofensiva, palavras recentes, resumo |
| **Talk** | Microfone grande, tema, nível, variedade de inglês e duração |
| **Learn** | Vocabulário salvo, gírias por país, palavras dos últimos dias, revisão espaçada |
| **Progress** | Conversas, tempo falando, expressões, tendências de fluência/gramática/confiança e histórico |
| **Profile** | Nome, nível, sotaque, voz e transcrição, servidor de IA, apagar dados |

### Durante a conversa

- **Interromper**: fale por cima — ele para de falar e escuta. Ou toque na bolha.
- **Pause / Mic**: pausa a conversa ou desliga o microfone sem encerrar.
- **Type**: teclado, pra quando não dá pra falar (ou o navegador não reconhece voz).
- **Text**: mostra ou esconde a transcrição ao vivo.

## Os dois professores

O app funciona **sem configurar nada** — e fica muito melhor com a API da
Anthropic ligada:

| | Sem servidor (padrão) | Com servidor (Claude) |
| --- | --- | --- |
| Conversa | roteiros por tema, escada de perguntas, reações ao que você diz | conversa aberta de verdade, no seu nível |
| Correções | ~25 regras de erro clássico de quem fala português/espanhol | qualquer erro, incluindo "está certo mas soa estranho" |
| Vocabulário | banco curado por tema | escolhido pelo que você tentou dizer |
| Notas e progresso | iguais nos dois casos (calculadas no aparelho) | idem |
| Precisa de chave | não | sim, no servidor |

A troca é automática: se a rede cair no meio da conversa, o professor local
assume e você nem percebe. O selo no topo mostra qual está no ar.

## Ligar o Claude

A chave **nunca** fica no navegador. Ela vive no servidor em `server/`.

```bash
cd server
npm install
export ANTHROPIC_API_KEY="sk-ant-..."      # a sua chave
npm start                                   # http://localhost:8787/coach.html
```

Isso já sobe o app inteiro (front + API) em `localhost:8787`. Como front e API
ficam na mesma origem, o app se conecta sozinho.

Publicando separado — front no GitHub Pages, API em outro lugar:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export COACH_ORIGIN="https://seu-usuario.github.io"   # libera só o seu site
export COACH_STATIC=0                                  # só a API
npm start
```

Depois, no app: **Profile → AI coach → Server address** → endereço do servidor →
**Connect**.

### Variáveis do servidor

| Variável | Padrão | Pra que serve |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | Chave da Anthropic. Sem ela a API responde 503 e o app usa o professor local |
| `COACH_MODEL` | `claude-opus-5` | Modelo usado nas três rotas |
| `PORT` | `8787` | Porta |
| `COACH_ORIGIN` | `*` | Origem liberada no CORS |
| `COACH_STATIC` | `1` | `0` serve só `/api/*` |
| `COACH_RATE_LIMIT` | `40` | Requisições por minuto por IP |

### Rotas

| Rota | Entrada | Saída |
| --- | --- | --- |
| `GET /api/health` | — | `{ ok, hasKey, model }` |
| `POST /api/open` | tema, nível, variedade, nome | primeira fala |
| `POST /api/reply` | + transcrição e a fala do aluno | resposta do professor |
| `POST /api/debrief` | conversa inteira | `{ summary, corrections[], vocabulary[] }` |

`/api/debrief` usa *structured outputs* (`output_config.format`), então a
resposta já chega no formato que a tela espera. As notas continuam sendo
calculadas no aparelho, pras conversas online e offline serem comparáveis.

## Voz

Reconhecimento e síntese são os do próprio navegador (Web Speech API): **nenhum
áudio sai do aparelho** e não há custo de STT/TTS.

| Navegador | Falar | Ouvir |
| --- | --- | --- |
| Chrome / Edge (desktop e Android) | ✅ | ✅ |
| Safari iOS 14.5+ e macOS | ✅ | ✅ |
| Firefox | ❌ (cai no teclado) | ✅ |

Dica: com fone de ouvido a interrupção fica perfeita. No alto-falante o app já
descarta o que o microfone captura da própria voz sintética.

## Arquivos

```
coach.html              → casca do app (abas, tela de voz, folha, onboarding)
css/coach.css           → tema claro/escuro, tipografia, animações
js/coach/content.js     → níveis, variedades, 20 temas, vocabulário, gírias, palavras do dia
js/coach/store.js       → estado no localStorage: perfil, conversas, vocabulário, revisão
js/coach/speech.js      → microfone (STT), voz (TTS) e medidor de volume
js/coach/engine.js      → professor offline: diálogo, correções, vocabulário, notas
js/coach/ai.js          → cliente do servidor, com queda automática pro engine
js/coach/session.js     → a conversa ao vivo (máquina de estados)
js/coach/views.js       → as telas
js/coach/ui.js          → helpers de interface (folha, aviso, gráfico, medidor)
js/coach/app.js         → rotas, onboarding e tela de voz
server/coach.mjs        → prompts e chamadas ao Claude (roda só no servidor)
server/index.mjs        → HTTP: /api/*, CORS, limite por IP e estáticos
sw-coach.js             → service worker (rede primeiro, cache como reserva)
manifest-coach.json     → instalar como app
tools/make_coach_icons.py → gera os ícones em PNG puro
```

O servidor importa `js/coach/content.js` — a mesma lista de níveis e temas do
app, pra não existirem duas verdades. Se for publicar só a pasta `server/`,
leve `js/coach/content.js` junto.

## Privacidade

Conversas, vocabulário e progresso ficam **só no aparelho** (`localStorage`).
Nada de conta, nada de nuvem. Com o servidor ligado, o texto da conversa vai
pra API da Anthropic pra gerar a resposta e o balanço — o áudio, nunca.
**Profile → Erase everything** apaga tudo.

## O que ainda não está no MVP

Login e assinatura, sincronização na nuvem, pronúncia avaliada de verdade
(precisa de áudio no servidor), voz neural própria e mais variedades de inglês
com pacote completo de gírias. A arquitetura já separa cliente, estado e
servidor pra isso entrar sem reescrever o app.
