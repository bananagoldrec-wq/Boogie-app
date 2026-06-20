/**
 * auto-update.mjs
 * Robô diário (sem chave) que amplia data/seeds.json buscando lançamentos
 * disco/funk/soul/boogie por país na MusicBrainz API.
 *
 * - Respeita o rate limit da MusicBrainz (1 req/seg) e envia User-Agent.
 * - Só adiciona faixas em países abaixo da meta (GOAL) e remove duplicatas.
 * - Não inventa nada: usa apenas releases reais retornados pela MusicBrainz,
 *   dentro de 1970–1989, com artista e ano definidos (ignora "Various Artists").
 *
 * Rodado pelo workflow .github/workflows/daily-update.yml
 */
import { readFileSync, writeFileSync } from "node:fs";

const SEEDS = "data/seeds.json";
const BASE = "https://musicbrainz.org/ws/2/release";
const UA = "DiscoBoogieGlobe/1.0 ( https://github.com/bananagoldrec-wq/Boogie-app )";
const GOAL = 70;                 // meta de faixas por país
const MAX_NEW_PER_COUNTRY = 2;   // no máximo 2 novas por país por execução
const MIN_INTERVAL = 1200;       // ms entre requisições (>1s, folga no rate limit)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const key = (t) => norm(t.artist) + "::" + norm(t.title);

async function mbReleases(code) {
  const q =
    `tag:(disco OR funk OR boogie OR soul OR "jazz funk" OR "afro-funk" OR "city pop") ` +
    `AND country:${code} AND date:[1970 TO 1989]`;
  const url = `${BASE}?query=${encodeURIComponent(q)}&fmt=json&limit=40`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return data.releases || [];
}

function normalizeRelease(rel) {
  if (!rel || !rel.title) return null;
  const credit = rel["artist-credit"] && rel["artist-credit"][0];
  const artist = credit && (credit.name || (credit.artist && credit.artist.name));
  const year = rel.date ? parseInt(String(rel.date).slice(0, 4), 10) : null;
  if (!artist || !Number.isFinite(year) || year < 1970 || year > 1989) return null;
  if (/various/i.test(artist)) return null;
  return {
    title: String(rel.title).trim(),
    artist: String(artist).trim(),
    year,
    spotify_embed: null,
    youtube_id: null,
    source: "MusicBrainz (auto)",
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
      releases = await mbReleases(code);
    } catch (err) {
      console.warn(`[${code}] MusicBrainz falhou: ${err.message}`);
      await sleep(MIN_INTERVAL);
      continue;
    }

    const seen = new Set(entry.tracks.map(key));
    let countryAdded = 0;
    for (const rel of releases) {
      if (countryAdded >= MAX_NEW_PER_COUNTRY) break;
      const t = normalizeRelease(rel);
      if (!t) continue;
      const k = key(t);
      if (seen.has(k)) continue;
      seen.add(k);
      entry.tracks.push(t);
      countryAdded++;
      added++;
      console.log(`+ [${code}] ${t.artist} - ${t.title} (${t.year})`);
    }
    await sleep(MIN_INTERVAL);
  }

  if (added > 0) {
    writeFileSync(SEEDS, JSON.stringify(data, null, 2) + "\n");
    console.log(`\nAdicionadas ${added} faixas novas.`);
  } else {
    console.log("Nenhuma faixa nova hoje.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
