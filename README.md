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
