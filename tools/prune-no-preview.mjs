/**
 * prune-no-preview.mjs — remove faixas SEM prévia tocável.
 *
 * Regra (rigorosa, igual ao que o app usa para tocar a prévia):
 *   mantém a faixa só se:
 *     - tiver youtube_id próprio (toca via YouTube), OU
 *     - existir prévia de 30s no iTunes OU no Deezer (match por artista+título).
 * Caso contrário, remove (faixa "morta" que enganava o usuário).
 *
 * Roda no GitHub Actions (a rede alcança iTunes/Deezer lá).
 */
import { readFileSync, writeFileSync } from "node:fs";

const SEEDS = "data/seeds.json";
const MIN_INTERVAL = 1200; // ms entre requisições (folga p/ iTunes)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0, chain = Promise.resolve();
function throttle(fn) {
  chain = chain.then(async () => {
    const w = Math.max(0, MIN_INTERVAL - (Date.now() - last));
    if (w > 0) await sleep(w);
    last = Date.now();
    return fn();
  });
  return chain;
}
async function getJSON(url) {
  return throttle(async () => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 9000);
    try {
      const r = await fetch(url, { headers: { "User-Agent": "DiscoBoogieGlobe/1.0", Accept: "application/json" }, signal: c.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  });
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const toks = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 2));
function overlap(a, b) { for (const x of a) if (b.has(x)) return true; return false; }

function matchHasPreview(arr, track, getPrev, getTitle, getArtist) {
  if (!Array.isArray(arr)) return false;
  const wantT = norm(track.title), wantA = toks(track.artist);
  for (const r of arr) {
    if (!getPrev(r)) continue;
    const rt = norm(getTitle(r));
    const titleOk = rt === wantT || rt.includes(wantT) || wantT.includes(rt);
    const artistOk = wantA.size === 0 || overlap(toks(getArtist(r) || ""), wantA);
    if (titleOk && artistOk) return true;
  }
  return false;
}

async function hasPreview(track) {
  if (track.youtube_id) return true; // toca via YouTube
  const term = encodeURIComponent(`${track.artist} ${track.title}`);
  try {
    const d = await getJSON(`https://itunes.apple.com/search?term=${term}&entity=song&media=music&limit=12`);
    if (matchHasPreview(d.results, track, (r) => r.previewUrl, (r) => r.trackName, (r) => r.artistName)) return true;
  } catch (e) { /* tenta Deezer */ }
  try {
    const d = await getJSON(`https://api.deezer.com/search?q=${term}&limit=12`);
    if (matchHasPreview(d.data, track, (r) => r.preview, (r) => r.title, (r) => r.artist && r.artist.name)) return true;
  } catch (e) { /* sem prévia */ }
  return false;
}

async function main() {
  const data = JSON.parse(readFileSync(SEEDS, "utf8"));
  let kept = 0, removed = 0;
  const removedList = [];
  for (const code of Object.keys(data)) {
    const e = data[code];
    if (!e || !Array.isArray(e.tracks)) continue;
    const out = [];
    for (const t of e.tracks) {
      if (await hasPreview(t)) { out.push(t); kept++; }
      else { removed++; removedList.push(`[${code}] ${t.artist} - ${t.title}`); }
    }
    e.tracks = out;
  }
  if (removed > 0) {
    writeFileSync(SEEDS, JSON.stringify(data, null, 2) + "\n");
  }
  console.log(`Mantidas: ${kept} | Removidas (sem prévia): ${removed}`);
  removedList.forEach((x) => console.log("  - " + x));
}
main().catch((e) => { console.error(e); process.exit(1); });
