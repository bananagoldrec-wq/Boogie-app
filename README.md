# 🎧 beno · negociação de shows

App pra **negociar shows no Rio de Janeiro**: cadastro de curadores e casas,
funil de negociação, agenda e mensagens prontas no WhatsApp. Mesmo jeitão da
agenda do Frisson — abre em `beno.html`.

## Como funciona

**Três abas:**

- **Negociações** — funil em colunas (A contatar → Contatado → Conversando →
  Proposta enviada → Fechado → Já tocou → Recusado). Arraste o card entre
  colunas (ou use *Avançar →*). No celular vira uma lista por etapa.
- **Agenda** — calendário mensal com as datas pretendidas, feriados nacionais e
  do Rio destacados. Clique num dia vazio pra abrir uma negociação já com a
  data; arraste um dia pro outro pra remarcar.
- **Contatos** — cadastro de curadores/casas com WhatsApp, Instagram, bairro,
  linha musical, cachê de referência e melhor dia.

**O que ele automatiza:**

1. **Follow-up sozinho.** Cada etapa tem um prazo de cobrança (contatado = 3
   dias, proposta = 2 dias, e assim por diante). Sempre que você mexe na
   negociação — muda de etapa, manda mensagem ou registra um contato — o app
   já agenda a próxima cobrança. A faixa amarela no topo mostra quem está
   esperando resposta, e o botão filtra só esses.
2. **Mensagem certa pra cada momento.** O app sugere o texto conforme a etapa
   (1º contato, apresentação, proposta, follow-up, confirmação, agradecimento,
   reativação) e abre pronto no WhatsApp. Ao abrir, a etapa avança e o
   follow-up é reagendado sozinho.
3. **Cadastro em massa.** No ícone ⤓ você cola sua lista de curadores — um por
   linha, em quase qualquer formato — e o app separa nome, casa, bairro e
   telefone. Dá pra revisar antes de confirmar.
4. **Cadastro que cresce sozinho.** O que você digita numa negociação atualiza
   a ficha do contato, e digitar um nome já cadastrado preenche o resto.

**Mensagens padrão** ficam no ícone 💬, com as variáveis `{curador}` `{casa}`
`{bairro}` `{data}` `{diaSemana}` `{estilo}` `{cache}` `{dj}` `{linkSet}`
`{linkInsta}`. É lá também que você põe seu nome artístico, estilo padrão e os
links do set e do Instagram. O ícone 📄 exporta tudo em CSV.

## Onde os dados ficam

Grava sempre no **próprio aparelho** (`localStorage`), então funciona offline e
sem configuração nenhuma. Em paralelo tenta sincronizar no **Firestore**, nas
coleções `beno_negociacoes`, `beno_contatos` e `beno_config` — separadas das da
agenda do Frisson. Se o Firebase não responder ou as regras não liberarem essas
coleções, o app segue rodando normalmente só no aparelho.

Pra ligar a sincronização entre celular e computador, libere as coleções nas
regras do Firestore:

```
match /beno_negociacoes/{doc} { allow read, write: if request.auth != null; }
match /beno_contatos/{doc}    { allow read, write: if request.auth != null; }
match /beno_config/{doc}      { allow read, write: if request.auth != null; }
```

> 🔁 **Ao mexer em `js/beno.js` ou `css/beno.css`, suba o `?v=` do
> `beno.html`.** O GitHub Pages manda `max-age=600` nos arquivos e o
> `index.html` registra um service worker no site inteiro, então sem trocar a
> URL o navegador continua rodando a versão antiga — foi assim que uma troca
> de senha não pegou nos aparelhos que já tinham aberto o app.

> ⚠️ A senha de acesso (`APP_PASSWORD` no topo de `js/beno.js`) trava a tela
> contra visitante casual, mas **não é segurança de verdade**: quem abrir o
> código do app encontra a senha, e o banco fica acessível a qualquer sessão
> anônima por trás dela. Como aqui trafegam contatos e cachês, vale trocar a
> senha e, se quiser isolamento real, criar um projeto Firebase só pra esse app.

---

# 🪩 Disco & Boogie Globe

Descoberta de música **disco e boogie dos anos 70 e 80** através de um mapa-múndi
interativo. Clique num país e mergulhe no groove. **Sem chave de API, sem
cadastro, sem backend** — apenas arquivos estáticos prontos para o GitHub Pages.

## ✨ Recursos

- 🗺️ Mapa 2D interativo com **Leaflet.js** e marcadores em **26 países** de
  todos os continentes (24 com faixas curadas + países marcados como sem
  produção do gênero)
- 🎨 Visual retrô anos 70/80 (laranja, dourado, marrom, bege, fontes *Lobster* +
  *Playfair Display*, estética de capa de vinil) com animações suaves
- 📱 Layout responsivo para mobile
- 🎵 Players embutidos públicos do **YouTube** e do **Spotify** (prévia sem login)
- ▶️ **Prévia de 30s** inline em cada faixa (só uma toca por vez) + botão
  *Ouvir completo*
- 🎚️ **Playlists** com nome, salvas no `localStorage`: criar, renomear, deletar,
  reordenar/remover faixas e **reproduzir em sequência** — tudo offline
- 🔎 Enriquecimento ao vivo via **MusicBrainz** (rate limit de 1 req/seg) e
  **Discogs**, sempre com *fallback* para a base curada local

## 🧱 Estrutura

```
/index.html
/css/style.css
/js/app.js          → orquestra tudo
/js/map.js          → mapa Leaflet + países
/js/musicbrainz.js  → API MusicBrainz (sem chave, rate-limited)
/js/discogs.js      → API Discogs (sem chave, best-effort)
/js/player.js       → modal com YouTube + Spotify
/js/algorithm.js    → mescla, deduplica e ordena
/data/seeds.json    → base curada (8 faixas por país)
```

## 🌍 Países

Brasil · Estados Unidos · França · Reino Unido · Alemanha · Nigéria · Jamaica ·
Itália · Argentina.

## 🚀 Publicar no GitHub Pages

1. Faça push deste repositório para o GitHub.
2. Em **Settings → Pages**, selecione a branch (ex.: `main` ou a branch do app)
   e a pasta `/ (root)`.
3. Acesse `https://SEU-USUARIO.github.io/SEU-REPO/`.

Para rodar localmente (necessário um servidor por causa do `fetch` do JSON):

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## 🔌 Como os dados funcionam

1. Ao clicar num país, as faixas **curadas** aparecem instantaneamente.
2. Em paralelo, o app consulta **MusicBrainz** e **Discogs**.
3. Os resultados são mesclados, deduplicados e ordenados por ano (até 12 faixas).
4. Qualquer falha de rede/CORS é tratada com `try/catch` — o app sempre cai de
   volta para a base local.

### Sobre os IDs de mídia

A base `data/seeds.json` traz artista, título e ano **curados** de faixas reais,
com IDs de YouTube preenchidos para as faixas mais icônicas. O player **sempre**
oferece botões de busca no YouTube e no Spotify como *fallback*, então a
reprodução funciona mesmo quando um ID específico não está presente ou ficou
desatualizado. Sinta-se à vontade para completar mais `youtube_id` /
`spotify_embed` no JSON.
