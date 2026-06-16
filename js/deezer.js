/**
 * deezer.js
 * Segunda fonte de prévia de 30s (áudio + capa), keyless, via JSONP.
 * Deezer API: https://api.deezer.com/search?q=...&output=jsonp&callback=...
 * O campo `preview` é um MP3 de 30s tocável direto em <audio> (sem CORS).
 *
 * Exposto como: window.Deezer.find(track)
 */
(function () {
  "use strict";

  const BASE = "https://api.deezer.com/search";
  const TIMEOUT_MS = 8000;
  const cache = new Map();

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

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = "__deezer_cb_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      let done = false;
      const cleanup = () => { delete window[cb]; script.remove(); clearTimeout(timer); };
      const timer = setTimeout(() => {
        if (!done) { done = true; cleanup(); reject(new Error("Deezer JSONP timeout")); }
      }, TIMEOUT_MS);
      window[cb] = (data) => { if (!done) { done = true; cleanup(); resolve(data); } };
      script.onerror = () => { if (!done) { done = true; cleanup(); reject(new Error("Deezer JSONP error")); } };
      script.src = url + (url.indexOf("?") === -1 ? "?" : "&") + "output=jsonp&callback=" + cb;
      document.head.appendChild(script);
    });
  }

  function pickBest(items, track) {
    if (!items || !items.length) return null;
    const wt = norm(track.title);
    const wa = norm(track.artist);
    let best = null, bestScore = -1;
    for (const it of items) {
      if (!it.preview) continue;
      const tt = norm(it.title);
      const ta = norm(it.artist && it.artist.name);
      let score = 0;
      if (tt === wt) score += 3; else if (tt.includes(wt) || wt.includes(tt)) score += 1;
      if (ta === wa) score += 3; else if (ta.includes(wa) || wa.includes(ta)) score += 1;
      if (score > bestScore) { bestScore = score; best = it; }
    }
    if (!best) best = items.find((it) => it.preview) || null;
    return best;
  }

  async function find(track) {
    const k = key(track);
    if (cache.has(k)) return cache.get(k);

    const q = encodeURIComponent(`${track.artist} ${track.title}`);
    const url = `${BASE}?q=${q}&limit=8`;

    let result = null;
    try {
      const data = await jsonp(url);
      const best = pickBest(data && data.data, track);
      if (best && best.preview) {
        const album = best.album || {};
        result = {
          previewUrl: best.preview,
          artwork: album.cover_medium || album.cover || null,
          trackName: best.title,
          artistName: best.artist && best.artist.name,
          source: "Deezer",
        };
      }
    } catch (err) {
      console.warn("[Deezer] prévia indisponível:", err.message);
    }

    cache.set(k, result);
    return result;
  }

  window.Deezer = { find };
})();
