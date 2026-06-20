/**
 * auto-update.mjs
 * Robô diário (sem chave) que amplia data/seeds.json com lançamentos
 * disco/funk/soul/boogie por país na MusicBrainz — com RIGOR de curadoria.
 *
 * Importante: o campo `country` de um release na MusicBrainz é o país da
 * PRENSAGEM, não a origem do artista. Por isso, para cada faixa candidata,
 * verificamos a ORIGEM DO ARTISTA (campo `country` do artista na MusicBrainz)
 * e só adicionamos se ela bater com o país-alvo. Isso evita encher, por ex.,
 * a França com disco americano que só foi lançado lá.
 *
 * - Respeita o rate limit (todas as chamadas espaçadas) e envia User-Agent.
 * - Só mexe em países abaixo da meta (GOAL); remove duplicatas; ignora
 *   "Various Artists" e artistas sem país confirmado.
 *
 * Rodado por .github/workflows/daily-update.yml
 */
import { readFileSync, writeFileSync } from "node:fs";

const SEEDS = "data/seeds.json";
const WS = "https://musicbrainz.org/ws/2";
const UA = "DiscoBoogieGlobe/1.0 ( https://github.com/bananagoldrec-wq/Boogie-app )";
const GOAL = 70;
const MAX_NEW_PER_COUNTRY = 2;
const LOOKUP_CAP = 20;     // no máx. candidatos checados por país (limita tempo)
const MIN_INTERVAL = 1100; // ms entre QUALQUER requisição (rate limit MB)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fila global: garante 1 req por vez, espaçadas por MIN_INTERVAL
let lastReq = 0;
let chain = Promise.resolve();
function throttle(fn) {
  chain = chain.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL - (Date.now() - lastReq));
    if (wait > 0) await sleep(wait);
    lastReq = Date.now();
    return fn();
  });
  return chain;
}

async function getJSON(url) {
  return throttle(async () => {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const key = (t) => norm(t.artist) + "::" + norm(t.title);

const artistCountryCache = new Map();
async function artistCountry(mbid) {
  if (!mbid) return null;
  if (artistCountryCache.has(mbid)) return artistCountryCache.get(mbid);
  let country = null;
  try {
    const a = await getJSON(`${WS}/artist/${mbid}?fmt=json`);
    country = a.country || (a.area && a.area["iso-3166-1-codes"] && a.area["iso-3166-1-codes"][0]) || null;
  } catch (err) {
    country = null;
  }
  artistCountryCache.set(mbid, country);
  return country;
}

async function searchReleases(code) {
  const q =
    `tag:(disco OR funk OR boogie OR soul OR "jazz funk" OR "afro-funk" OR "city pop") ` +
    `AND country:${code} AND date:[1970 TO 1989]`;
  const data = await getJSON(`${WS}/release?query=${encodeURIComponent(q)}&fmt=json&limit=40`);
  return data.releases || [];
}

function candidate(rel) {
  if (!rel || !rel.title) return null;
  const credit = rel["artist-credit"] && rel["artist-credit"][0];
  const artist = credit && (credit.name || (credit.artist && credit.artist.name));
  const mbid = credit && credit.artist && credit.artist.id;
  const year = rel.date ? parseInt(String(rel.date).slice(0, 4), 10) : null;
  if (!artist || !mbid || !Number.isFinite(year) || year < 1970 || year > 1989) return null;
  if (/various/i.test(artist)) return null;
  return {
    mbid,
    track: {
      title: String(rel.title).trim(),
      artist: String(artist).trim(),
      year,
      spotify_embed: null,
      youtube_id: null,
      source: "MusicBrainz (auto)",
    },
  };
}

async function main() {
  const data = JSON.parse(readFileSync(SEEDS, "utf8"));
  let added = 0;

  for (const code of Object.keys(data)) {
    const entry = data[code];
    if (!entry || entry.available === false || !Array.isArray(entry.tracks)) continue;
    if (entry.tracks.length >= GOAL) continue;

    let releases = [];
    try {
      releases = await searchReleases(code);
    } catch (err) {
      console.warn(`[${code}] busca falhou: ${err.message}`);
      continue;
    }

    const seen = new Set(entry.tracks.map(key));
    let countryAdded = 0;
    let checked = 0;
    for (const rel of releases) {
      if (countryAdded >= MAX_NEW_PER_COUNTRY || checked >= LOOKUP_CAP) break;
      const cand = candidate(rel);
      if (!cand) continue;
      const k = key(cand.track);
      if (seen.has(k)) continue;
      checked++;
      const origin = await artistCountry(cand.mbid);
      if (origin !== code) continue; // RIGOR: só artistas realmente do país
      seen.add(k);
      entry.tracks.push(cand.track);
      countryAdded++;
      added++;
      console.log(`+ [${code}] ${cand.track.artist} - ${cand.track.title} (${cand.track.year})`);
    }
  }

  if (added > 0) {
    writeFileSync(SEEDS, JSON.stringify(data, null, 2) + "\n");
    console.log(`\nAdicionadas ${added} faixas novas (origem do artista confirmada).`);
  } else {
    console.log("Nenhuma faixa nova confirmada hoje.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
