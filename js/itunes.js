/**
 * itunes.js
 * Resolve uma prévia de áudio de 30s (e capa) para uma faixa usando a
 * iTunes Search API — keyless, com CORS aberto, sem login.
 *
 * Doc: https://performance-partners.apple.com/search-api
 * Retorna { previewUrl, artwork, trackName, artistName } ou null.
 *
 * Exposto como: window.ITunes.find(track)
 */
(function () {
  "use strict";

  const BASE = "https://itunes.apple.com/search";
  const TIMEOUT_MS = 8000;
  const cache = new Map(); // key -> resultado (ou null)

  function key(track) {
    return `${(track.artist || "").toLowerCase()}|${(track.title || "").toLowerCase()}`;
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\(.*?\)|\[.*?\]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  async function fetchJSON(url) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error("iTunes HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  function pickBest(results, track) {
    if (!results || !results.length) return null;
    const wantTitle = norm(track.title);
    const wantArtist = norm(track.artist);
    let best = null;
    let bestScore = -1;
    for (const r of results) {
      if (!r.previewUrl) continue;
      const rt = norm(r.trackName);
      const ra = norm(r.artistName);
      let score = 0;
      if (rt === wantTitle) score += 3;
      else if (rt.includes(wantTitle) || wantTitle.includes(rt)) score += 1;
      if (ra === wantArtist) score += 3;
      else if (ra.includes(wantArtist) || wantArtist.includes(ra)) score += 1;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    // se nada casou minimamente, ainda assim usa o 1º com previewUrl
    if (!best) best = results.find((r) => r.previewUrl) || null;
    return best;
  }

  async function find(track) {
    const k = key(track);
    if (cache.has(k)) return cache.get(k);

    const term = encodeURIComponent(`${track.artist} ${track.title}`);
    const url = `${BASE}?term=${term}&entity=song&media=music&limit=8`;

    let result = null;
    try {
      const data = await fetchJSON(url);
      const best = pickBest(data && data.results, track);
      if (best && best.previewUrl) {
        result = {
          previewUrl: best.previewUrl,
          artwork: best.artworkUrl100
            ? best.artworkUrl100.replace("100x100", "300x300")
            : null,
          trackName: best.trackName,
          artistName: best.artistName,
        };
      }
    } catch (err) {
      console.warn("[iTunes] prévia indisponível:", err.message);
    }

    cache.set(k, result);
    return result;
  }

  window.ITunes = { find };
})();
