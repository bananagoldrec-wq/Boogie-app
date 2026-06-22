/**
 * prune-no-preview.mjs — remove faixas SEM prévia tocável (CONSERVADOR).
 *
 * Mantém a faixa se:
 *   - tiver youtube_id próprio, OU
 *   - iTunes OU Deezer tiver prévia (match por artista+título), OU
 *   - houver QUALQUER incerteza (erro/limite de API numa das fontes).
 * Só remove quando AMBAS as fontes responderam OK e NENHUMA encontrou prévia.
 * (Evita o desastre de tratar rate-limit como "sem prévia".)
 */
import { readFileSync, writeFileSync } from "node:fs";

const SEEDS = "data/seeds.json";
const MIN_INTERVAL = 3000; // ms — folga grande p/ o limite do iTunes (~20/min)

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
// Retorna { ok, data }: ok=false em qualquer erro/HTTP não-200 (incerteza).
async function fetchProvider(url) {
  return throttle(async () => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12000);
    try {
      const r = await fetch(url, { headers: { "User-Agent": "DiscoBoogieGlobe/1.0", Accept: "application/json" }, signal: c.signal });
      if (!r.ok) return { ok: false, data: null };
      return { ok: true, data: await r.json() };
    } catch (e) { return { ok: false, data: null }; }
    finally { clearTimeout(t); }
  });
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const toks = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 2));
const overlap = (a, b) => { for (const x of a) if (b.has(x)) return true; return false; };
function matched(arr, track, gp, gt, ga) {
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

// "keep" | "remove"
async function decide(track) {
  if (track.youtube_id) return "keep";
  const term = encodeURIComponent(`${track.artist} ${track.title}`);
  const it = await fetchProvider(`https://itunes.apple.com/search?term=${term}&entity=song&media=music&limit=12`);
  if (it.ok && matched(it.data && it.data.results, track, (r) => r.previewUrl, (r) => r.trackName, (r) => r.artistName)) return "keep";
  const dz = await fetchProvider(`https://api.deezer.com/search?q=${term}&limit=12`);
  if (dz.ok && matched(dz.data && dz.data.data, track, (r) => r.preview, (r) => r.title, (r) => r.artist && r.artist.name)) return "keep";
  // Só remove se AMBAS responderam OK e nenhuma achou. Erro em qualquer uma => mantém.
  if (it.ok && dz.ok) return "remove";
  return "keep";
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
      if ((await decide(t)) === "keep") { out.push(t); kept++; }
      else { removed++; removedList.push(`[${code}] ${t.artist} - ${t.title}`); }
    }
    e.tracks = out;
  }
  // Trava de segurança: nunca remover mais de 35% do acervo numa rodada.
  if (removed > (kept + removed) * 0.35) {
    console.error(`ABORT: remoção alta demais (${removed}/${kept + removed}). Possível erro de API — nada será salvo.`);
    process.exit(1);
  }
  if (removed > 0) writeFileSync(SEEDS, JSON.stringify(data, null, 2) + "\n");
  console.log(`Mantidas: ${kept} | Removidas: ${removed}`);
  removedList.forEach((x) => console.log("  - " + x));
}
main().catch((e) => { console.error(e); process.exit(1); });
