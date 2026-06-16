/**
 * algorithm.js
 * Algoritmo de descoberta: mescla JSON local + MusicBrainz + Discogs,
 * deduplica, ordena por ano e limita a 12 faixas.
 *
 * Exposto como: window.DiscoAlgorithm.merge(localList, ...extraLists)
 */
(function () {
  "use strict";

  const MAX_RESULTS = 24;

  function normalizeKey(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // remove acentos
      .replace(/\(.*?\)|\[.*?\]/g, "") // remove (remix), [feat...]
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function dedupeKey(track) {
    return normalizeKey(track.artist) + "::" + normalizeKey(track.title);
  }

  /**
   * @param {Array} localList faixas curadas (prioridade máxima)
   * @param {...Array} extraLists listas de APIs externas
   * @returns {Array} até 12 faixas mescladas, deduplicadas e ordenadas
   */
  function merge(localList, ...extraLists) {
    const seen = new Map();

    const add = (track) => {
      if (!track || !track.title || !track.artist) return;
      const key = dedupeKey(track);
      if (!key.trim()) return;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, track);
        return;
      }
      // Já existe: preserve dados ricos (capa/IDs) vindos de qualquer fonte.
      existing.cover = existing.cover || track.cover;
      existing.spotify_embed = existing.spotify_embed || track.spotify_embed;
      existing.youtube_id = existing.youtube_id || track.youtube_id;
      if (existing.year == null && track.year != null) existing.year = track.year;
    };

    // Locais primeiro para terem prioridade de fonte/curadoria.
    // `origin` controla o badge (curado vs. API); `source` (do JSON) é só
    // documentação de onde a faixa foi pesquisada.
    (localList || []).forEach((t) => add({ ...t, origin: "seeds" }));
    extraLists.forEach((list) => (list || []).forEach((t) => add({ ...t, origin: t.source || "api" })));

    const merged = Array.from(seen.values());

    merged.sort((a, b) => {
      // curados primeiro, depois por ano crescente, depois alfabético
      const as = a.origin === "seeds" ? 0 : 1;
      const bs = b.origin === "seeds" ? 0 : 1;
      if (as !== bs) return as - bs;
      const ay = a.year || 9999;
      const by = b.year || 9999;
      if (ay !== by) return ay - by;
      return a.title.localeCompare(b.title);
    });

    return merged.slice(0, MAX_RESULTS);
  }

  window.DiscoAlgorithm = { merge, MAX_RESULTS };
})();
