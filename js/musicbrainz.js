/**
 * musicbrainz.js
 * Busca releases de disco/boogie por país na MusicBrainz API (sem chave).
 * - Respeita rate limit de 1 req/segundo (fila global).
 * - CORS é aberto na MusicBrainz; ainda assim tudo roda em try/catch.
 * - Capas vêm da Cover Art Archive (com fallback no <img onerror>).
 *
 * Exposto como: window.MusicBrainz.searchByCountry(mbCountryCode)
 */
(function () {
  "use strict";

  const BASE = "https://musicbrainz.org/ws/2";
  const COVER_ART = "https://coverartarchive.org/release";
  const MIN_INTERVAL_MS = 1100; // > 1s para folga no rate limit
  const TIMEOUT_MS = 8000;

  // --- Fila simples para garantir 1 req/seg, mesmo entre cliques rápidos ---
  let lastRequest = 0;
  let chain = Promise.resolve();

  function throttle(fn) {
    chain = chain.then(async () => {
      const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequest));
      if (wait > 0) await sleep(wait);
      lastRequest = Date.now();
      return fn();
    });
    return chain;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function fetchJSON(url) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("MusicBrainz HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Busca releases marcados como disco/boogie no país e janela 1970-1989.
   * @param {string} countryCode ISO 3166-1 alpha-2 (ex.: "BR")
   * @returns {Promise<Array>} lista de faixas normalizadas
   */
  async function searchByCountry(countryCode) {
    const query =
      `tag:(disco OR boogie OR funk) AND country:${countryCode} ` +
      `AND date:[1970 TO 1989]`;
    const url =
      `${BASE}/release?query=${encodeURIComponent(query)}` +
      `&fmt=json&limit=20`;

    try {
      const data = await throttle(() => fetchJSON(url));
      const releases = (data && data.releases) || [];
      return releases.map(normalizeRelease).filter(Boolean);
    } catch (err) {
      console.warn("[MusicBrainz] falhou, usando apenas dados locais:", err.message);
      return [];
    }
  }

  function normalizeRelease(rel) {
    if (!rel || !rel.title) return null;
    const credit = rel["artist-credit"] && rel["artist-credit"][0];
    const artist = credit && (credit.name || (credit.artist && credit.artist.name));
    const year = rel.date ? parseInt(String(rel.date).slice(0, 4), 10) : null;
    return {
      title: rel.title,
      artist: artist || "Artista desconhecido",
      year: Number.isFinite(year) ? year : null,
      cover: rel.id ? `${COVER_ART}/${rel.id}/front-250` : null,
      spotify_embed: null,
      youtube_id: null,
      source: "musicbrainz",
    };
  }

  window.MusicBrainz = { searchByCountry };
})();
