/**
 * auto-update.mjs — robô diário (sem chave), FOCADO EM SELOS LOCAIS de disco.
 *
 * Estratégia rigorosa:
 *  - Para cada país abaixo da meta (GOAL), pega os SELOS já catalogados nas
 *    faixas daquele país (campo `label`), ignora majors internacionais, e
 *    busca na MusicBrainz lançamentos REAIS de 1970–1989 daqueles selos.
 *  - Para cada candidato, confirma a ORIGEM DO ARTISTA (country na MusicBrainz):
 *    só adiciona se for do país-alvo (ou se a origem for desconhecida — aí o
 *    selo local já é um forte indício). Evita encher país errado.
 *  - Sem "Various Artists", sem duplicatas, rate-limit respeitado.
 *  - Fallback: se um país não tiver selos catalogados, usa busca por tag.
 *
 * Roda via .github/workflows/daily-update.yml (todo dia 03:00 UTC).
 */
import { readFileSync, writeFileSync } from "node:fs";

const SEEDS = "data/seeds.json";
const WS = "https://musicbrainz.org/ws/2";
const UA = "DiscoBoogieGlobe/1.0 ( https://github.com/bananagoldrec-wq/Boogie-app )";
const GOAL = 70;
const MAX_NEW_PER_COUNTRY = 3;
const MAX_LABELS_PER_COUNTRY = 8;
const LOOKUP_CAP = 30;       // candidatos checados por país (limita tempo)
const MIN_INTERVAL = 1100;   // ms entre QUALQUER requisição (rate limit MB)

// Majors internacionais — não são "selos locais de disco": ignorar.
const MAJORS = new Set([
  "atlantic", "columbia", "epic", "rca", "rca victor", "cbs", "philips",
  "polydor", "polygram", "warner bros.", "warner", "warner bros", "emi",
  "capitol", "mercury", "decca", "virgin", "island", "ariola", "wea", "mca",
  "a&m", "hmv", "his master's voice", "sony", "cbs greece", "his master's voice (emi india)",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastReq = 0, chain = Promise.resolve();
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
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const key = (t) => norm(t.artist) + "::" + norm(t.title);

const artistCountryCache = new Map();
async function artistCountry(mbid) {
  if (!mbid) return null;
  if (artistCountryCache.has(mbid)) return artistCountryCache.get(mbid);
  let c = null;
  try {
    const a = await getJSON(`${WS}/artist/${mbid}?fmt=json`);
    c = a.country || (a.area && a.area["iso-3166-1-codes"] && a.area["iso-3166-1-codes"][0]) || null;
  } catch (e) { c = null; }
  artistCountryCache.set(mbid, c);
  return c;
}

// Só adiciona faixa que tenha prévia tocável (iTunes/Deezer) — não suja o app.
const toks = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 2));
function overlap(a, b) { for (const x of a) if (b.has(x)) return true; return false; }
function matchPrev(arr, track, gp, gt, ga) {
  if (!Array.isArray(arr)) return false;
  const wantT = norm(track.title), wantA = toks(track.artist);
  for (const r of arr) {
    if (!gp(r)) continue;
    const rt = norm(gt(r));
    const titleOk = rt === wantT || rt.includes(wantT) || wantT.includes(rt);
    const artistOk = wantA.size === 0 || overlap(toks(ga(r) || ""), wantA);
    if (titleOk && artistOk) return true;
  }
  return false;
}
async function hasPreview(track) {
  const term = encodeURIComponent(`${track.artist} ${track.title}`);
  try {
    const d = await getJSON(`https://itunes.apple.com/search?term=${term}&entity=song&media=music&limit=10`);
    if (matchPrev(d.results, track, (r) => r.previewUrl, (r) => r.trackName, (r) => r.artistName)) return true;
  } catch (e) { /* tenta Deezer */ }
  try {
    const d = await getJSON(`https://api.deezer.com/search?q=${term}&limit=10`);
    if (matchPrev(d.data, track, (r) => r.preview, (r) => r.title, (r) => r.artist && r.artist.name)) return true;
  } catch (e) { /* sem prévia */ }
  return false;
}

async function searchByLabel(label) {
  const q = `label:"${label}" AND date:[1970 TO 1989]`;
  const data = await getJSON(`${WS}/release?query=${encodeURIComponent(q)}&fmt=json&limit=25`);
  return data.releases || [];
}
async function searchByTag(code) {
  const q = `tag:(disco OR funk OR boogie OR soul OR "afro-funk") AND country:${code} AND date:[1970 TO 1989]`;
  const data = await getJSON(`${WS}/release?query=${encodeURIComponent(q)}&fmt=json&limit=25`);
  return data.releases || [];
}

function candidate(rel, fallbackLabel) {
  if (!rel || !rel.title) return null;
  const credit = rel["artist-credit"] && rel["artist-credit"][0];
  const artist = credit && (credit.name || (credit.artist && credit.artist.name));
  const mbid = credit && credit.artist && credit.artist.id;
  const year = rel.date ? parseInt(String(rel.date).slice(0, 4), 10) : null;
  if (!artist || !mbid || !Number.isFinite(year) || year < 1970 || year > 1989) return null;
  if (/various/i.test(artist)) return null;
  let label = fallbackLabel || null;
  const li = rel["label-info"] && rel["label-info"][0];
  if (li && li.label && li.label.name) label = li.label.name;
  return {
    mbid,
    track: {
      title: String(rel.title).trim(), artist: String(artist).trim(), year,
      spotify_embed: null, youtube_id: null,
      source: `MusicBrainz (selo: ${label || "—"})`, label: label || undefined,
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

    const seen = new Set(entry.tracks.map(key));
    const labels = [...new Set(entry.tracks.map((t) => t.label).filter(Boolean))]
      .filter((l) => !MAJORS.has(l.toLowerCase()))
      .slice(0, MAX_LABELS_PER_COUNTRY);

    let countryAdded = 0, checked = 0;

    const tryRelease = async (rel, fallbackLabel) => {
      if (countryAdded >= MAX_NEW_PER_COUNTRY || checked >= LOOKUP_CAP) return;
      const cand = candidate(rel, fallbackLabel);
      if (!cand) return;
      const k = key(cand.track);
      if (seen.has(k)) return;
      checked++;
      const origin = await artistCountry(cand.mbid);
      if (origin && origin !== code) return; // origem conhecida e diferente: pula
      if (!(await hasPreview(cand.track))) return; // sem prévia tocável: não adiciona
      seen.add(k);
      entry.tracks.push(cand.track);
      countryAdded++; added++;
      console.log(`+ [${code}] ${cand.track.artist} - ${cand.track.title} (${cand.track.year}) · ${cand.track.label || ""}`);
    };

    // 1) Por selos locais.
    for (const label of labels) {
      if (countryAdded >= MAX_NEW_PER_COUNTRY || checked >= LOOKUP_CAP) break;
      let releases = [];
      try { releases = await searchByLabel(label); }
      catch (e) { console.warn(`[${code}] selo "${label}" falhou: ${e.message}`); continue; }
      for (const rel of releases) {
        if (countryAdded >= MAX_NEW_PER_COUNTRY || checked >= LOOKUP_CAP) break;
        await tryRelease(rel, label);
      }
    }

    // 2) Fallback por tag (se nada veio dos selos).
    if (countryAdded === 0) {
      try {
        const releases = await searchByTag(code);
        for (const rel of releases) {
          if (countryAdded >= MAX_NEW_PER_COUNTRY || checked >= LOOKUP_CAP) break;
          await tryRelease(rel, null);
        }
      } catch (e) { console.warn(`[${code}] tag falhou: ${e.message}`); }
    }
  }

  if (added > 0) {
    writeFileSync(SEEDS, JSON.stringify(data, null, 2) + "\n");
    console.log(`\nAdicionadas ${added} faixas (selos locais, origem confirmada).`);
  } else {
    console.log("Nenhuma faixa nova confirmada hoje.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
