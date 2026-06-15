/**
 * player.js
 * Modal com players embutidos do YouTube e do Spotify (ambos públicos,
 * sem login). Sempre oferece links de busca como fallback caso um ID
 * esteja ausente ou inválido.
 *
 * Exposto como: window.Player.open(track)
 */
(function () {
  "use strict";

  const modal = () => document.getElementById("player-modal");

  function searchUrlYouTube(track) {
    const q = encodeURIComponent(`${track.artist} ${track.title}`);
    return `https://www.youtube.com/results?search_query=${q}`;
  }
  function searchUrlSpotify(track) {
    const q = encodeURIComponent(`${track.artist} ${track.title}`);
    return `https://open.spotify.com/search/${q}`;
  }

  function spotifyEmbedSrc(track) {
    if (!track.spotify_embed) return null;
    // Aceita tanto a URL completa de embed quanto apenas o ID da faixa.
    if (/^https?:\/\//i.test(track.spotify_embed)) return track.spotify_embed;
    return `https://open.spotify.com/embed/track/${track.spotify_embed}`;
  }

  function buildYouTubeBlock(track) {
    const block = document.createElement("div");
    block.className = "player-block";
    block.innerHTML = "<h4>▶ YouTube</h4>";

    if (track.youtube_id) {
      const iframe = document.createElement("iframe");
      iframe.height = 220;
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      iframe.loading = "lazy";
      iframe.src = `https://www.youtube.com/embed/${track.youtube_id}`;
      iframe.title = `${track.title} — ${track.artist} (YouTube)`;
      block.appendChild(iframe);
    }

    const links = document.createElement("div");
    links.className = "fallback-links";
    const yt = document.createElement("a");
    yt.className = "btn-link";
    yt.target = "_blank";
    yt.rel = "noopener";
    yt.href = searchUrlYouTube(track);
    yt.textContent = track.youtube_id ? "Buscar mais no YouTube" : "Buscar no YouTube";
    links.appendChild(yt);
    block.appendChild(links);
    return block;
  }

  function buildSpotifyBlock(track) {
    const block = document.createElement("div");
    block.className = "player-block";
    block.innerHTML = "<h4>♫ Spotify</h4>";

    const src = spotifyEmbedSrc(track);
    if (src) {
      const iframe = document.createElement("iframe");
      iframe.height = 152;
      iframe.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
      iframe.loading = "lazy";
      iframe.src = src;
      iframe.title = `${track.title} — ${track.artist} (Spotify)`;
      block.appendChild(iframe);
    }

    const links = document.createElement("div");
    links.className = "fallback-links";
    const sp = document.createElement("a");
    sp.className = "btn-link spotify";
    sp.target = "_blank";
    sp.rel = "noopener";
    sp.href = searchUrlSpotify(track);
    sp.textContent = src ? "Abrir no Spotify" : "Buscar no Spotify";
    links.appendChild(sp);
    block.appendChild(links);
    return block;
  }

  function open(track) {
    const m = modal();
    document.getElementById("modal-title").textContent = track.title;
    const yr = track.year ? ` · ${track.year}` : "";
    document.getElementById("modal-sub").textContent = `${track.artist}${yr}`;

    const body = document.getElementById("player-body");
    body.innerHTML = "";
    body.appendChild(buildYouTubeBlock(track));
    body.appendChild(buildSpotifyBlock(track));

    m.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function close() {
    const m = modal();
    m.hidden = true;
    // Para a reprodução removendo os iframes.
    document.getElementById("player-body").innerHTML = "";
    document.body.style.overflow = "";
  }

  function init() {
    const m = modal();
    m.addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-close")) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !m.hidden) close();
    });
  }

  window.Player = { open, close, init };
})();
