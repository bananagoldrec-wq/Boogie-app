/**
 * discogs.js
 * Busca releases de disco/boogie por país na Discogs API.
 * Endpoint: https://api.discogs.com/database/search
 *
 * NOTA: a busca da Discogs normalmente exige token. Sem credenciais ela
 * costuma responder 401/CORS — por isso tudo roda em try/catch e qualquer
 * falha simplesmente retorna [] (o app cai para o JSON local + MusicBrainz).
 *
 * Exposto como: window.Discogs.searchByCountry(discogsCountryName)
 */
(function () {
  "use strict";

  const BASE = "https://api.discogs.com/database/search";
  const TIMEOUT_MS = 8000;

  async function fetchJSON(url) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Discogs HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * @param {string} countryName nome do país como a Discogs espera (ex.: "Brazil")
   * @returns {Promise<Array>} lista de faixas normalizadas
   */
  async function searchByCountry(countryName) {
    const params = new URLSearchParams({
      style: "Disco",
      country: countryName,
      year: "", // preenchido abaixo por intervalo textual
      type: "release",
      per_page: "20",
    });
    // A Discogs aceita "1970-1989"? Não oficialmente — usamos decade-ish via year vazio
    params.delete("year");
    const url = `${BASE}?${params.toString()}`;

    try {
      const data = await fetchJSON(url);
      const results = (data && data.results) || [];
      return results
        .map(normalizeResult)
        .filter(Boolean)
        // mantém apenas a janela 70/80 quando o ano estiver disponível
        .filter((t) => t.year == null || (t.year >= 1970 && t.year <= 1989));
    } catch (err) {
      console.warn("[Discogs] indisponível sem token, ignorando:", err.message);
      return [];
    }
  }

  function normalizeResult(r) {
    if (!r || !r.title) return null;
    // Discogs traz "Artista - Título" no campo title
    let artist = "Artista desconhecido";
    let title = r.title;
    const dash = r.title.indexOf(" - ");
    if (dash !== -1) {
      artist = r.title.slice(0, dash).trim();
      title = r.title.slice(dash + 3).trim();
    }
    const year = r.year ? parseInt(String(r.year).slice(0, 4), 10) : null;
    return {
      title,
      artist,
      year: Number.isFinite(year) ? year : null,
      cover: r.cover_image || r.thumb || null,
      spotify_embed: null,
      youtube_id: null,
      source: "discogs",
    };
  }

  window.Discogs = { searchByCountry };
})();
