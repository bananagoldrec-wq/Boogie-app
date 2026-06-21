/**
 * youtube.js
 * Resolve um videoId do YouTube a partir de artista + título, SEM chave de API,
 * usando front-ends públicos (Piped / Invidious). Usado pela Rádio para tocar
 * a música completa. Tudo em try/catch; se nada resolver, retorna null.
 *
 * Exposto como: window.YouTubeResolve.find(track) -> Promise<videoId|null>
 */
(function () {
  "use strict";

  const PIPED = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://pipedapi.leptons.xyz",
    "https://api.piped.yt",
  ];
  const INVIDIOUS = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://yewtu.be",
    "https://invidious.jing.rocks",
  ];
  const TIMEOUT = 7000;
  const cache = new Map();

  function key(t) {
    return `${(t.artist || "").toLowerCase()}|${(t.title || "").toLowerCase()}`;
  }

  async function getJSON(url) {
    const c = new AbortController();
    const id = setTimeout(() => c.abort(), TIMEOUT);
    try {
      const r = await fetch(url, { signal: c.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally {
      clearTimeout(id);
    }
  }

  function extractId(u) {
    const m = String(u || "").match(/[?&]v=([\w-]{11})/) || String(u || "").match(/\/([\w-]{11})$/);
    return m ? m[1] : null;
  }

  async function viaPiped(q) {
    for (const base of PIPED) {
      try {
        const d = await getJSON(`${base}/search?q=${encodeURIComponent(q)}&filter=videos`);
        const items = d.items || d || [];
        for (const it of items) {
          if (it.videoId) return it.videoId;
          const id = extractId(it.url);
          if (id) return id;
        }
      } catch (e) { /* tenta a próxima instância */ }
    }
    return null;
  }

  async function viaInvidious(q) {
    for (const base of INVIDIOUS) {
      try {
        const d = await getJSON(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video`);
        for (const it of d || []) {
          if (it.videoId) return it.videoId;
        }
      } catch (e) { /* tenta a próxima instância */ }
    }
    return null;
  }

  async function find(track) {
    const k = key(track);
    if (cache.has(k)) return cache.get(k);
    if (track.youtube_id) { cache.set(k, track.youtube_id); return track.youtube_id; }

    const q = `${track.artist} ${track.title}`.trim();
    let id = null;
    try { id = (await viaPiped(q)) || (await viaInvidious(q)); } catch (e) { id = null; }
    cache.set(k, id);
    return id;
  }

  window.YouTubeResolve = { find };
})();
