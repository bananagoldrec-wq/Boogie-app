/**
 * app.js
 * Orquestra tudo: carrega o JSON local, inicializa o mapa, e ao clicar
 * num país executa o algoritmo de descoberta (local + MusicBrainz + Discogs).
 */
(function () {
  "use strict";

  let SEEDS = {};
  let currentToken = 0; // evita "race" entre cliques rápidos em países

  const els = {};

  async function loadSeeds() {
    try {
      const res = await fetch("data/seeds.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("seeds HTTP " + res.status);
      SEEDS = await res.json();
    } catch (err) {
      console.error("Não foi possível carregar seeds.json:", err);
      SEEDS = {};
    }
  }

  function showWelcome() {
    els.welcome.hidden = false;
    els.content.hidden = true;
  }

  function showCountryShell(country) {
    els.welcome.hidden = true;
    els.content.hidden = false;
    els.title.textContent = `${country.flag} ${country.name}`;
    els.count.textContent = "";
    els.list.innerHTML = "";
    els.sources.textContent = "";
    els.loading.hidden = false;
  }

  function renderTracks(tracks) {
    els.list.innerHTML = "";
    tracks.forEach((track, i) => {
      const li = document.createElement("li");
      li.className = "track";
      li.style.animationDelay = `${i * 45}ms`;
      li.tabIndex = 0;
      li.setAttribute("role", "button");

      const cover = document.createElement("img");
      cover.className = "track-cover";
      cover.alt = "";
      cover.loading = "lazy";
      if (track.cover) {
        cover.src = track.cover;
        cover.addEventListener("error", () => cover.removeAttribute("src"), { once: true });
      }

      const info = document.createElement("div");
      info.className = "track-info";
      const badge =
        track.source && track.source !== "seeds"
          ? `<span class="track-badge">${track.source}</span>`
          : "";
      info.innerHTML =
        `<div class="track-title">${escapeHtml(track.title)}${badge}</div>` +
        `<div class="track-meta">${escapeHtml(track.artist)}</div>`;

      const year = document.createElement("span");
      year.className = "track-year";
      year.textContent = track.year || "";

      li.append(cover, info, year);
      const activate = () => window.Player.open(track);
      li.addEventListener("click", activate);
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      });
      els.list.appendChild(li);
    });
  }

  async function onSelectCountry(country) {
    const token = ++currentToken;
    showCountryShell(country);

    // 1) Locais imediatamente.
    const local = SEEDS[country.code] || [];
    renderTracks(window.DiscoAlgorithm.merge(local));
    els.count.textContent = `${local.length} curadas`;

    // 2) APIs externas em paralelo (best-effort, com try/catch interno).
    const [mb, dg] = await Promise.all([
      window.MusicBrainz.searchByCountry(country.mb).catch(() => []),
      window.Discogs.searchByCountry(country.dg).catch(() => []),
    ]);

    // Se o usuário já clicou em outro país, aborta a renderização tardia.
    if (token !== currentToken) return;

    // 3-5) Mescla, deduplica, ordena, limita a 12.
    const merged = window.DiscoAlgorithm.merge(local, mb, dg);
    renderTracks(merged);
    els.loading.hidden = true;
    els.count.textContent = `${merged.length} faixas`;

    const found = [];
    if (mb.length) found.push(`MusicBrainz (+${mb.length})`);
    if (dg.length) found.push(`Discogs (+${dg.length})`);
    els.sources.textContent = found.length
      ? `Enriquecido com ${found.join(" e ")}. Clique numa faixa para ouvir.`
      : "APIs externas indisponíveis no momento — exibindo seleção curada. Clique numa faixa para ouvir.";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function cacheEls() {
    els.welcome = document.getElementById("panel-welcome");
    els.content = document.getElementById("panel-content");
    els.title = document.getElementById("country-title");
    els.count = document.getElementById("country-count");
    els.list = document.getElementById("track-list");
    els.loading = document.getElementById("loading");
    els.sources = document.getElementById("sources-note");
  }

  async function main() {
    cacheEls();
    window.Player.init();
    document.getElementById("back-btn").addEventListener("click", showWelcome);

    await loadSeeds();
    window.DiscoMap.init(onSelectCountry);
  }

  document.addEventListener("DOMContentLoaded", main);
})();
