/**
 * player.js
 * Players embutidos públicos (YouTube + Spotify), sem login:
 *   - open(track)            -> modal completo "Ouvir completo"
 *   - preview(track, anchor) -> mini-player inline de prévia (30s)
 *   - playQueue(tracks, i)   -> reprodução de playlist em sequência
 *
 * Sempre há links de busca como fallback caso falte um ID.
 */
(function () {
  "use strict";

  const modal = () => document.getElementById("player-modal");

  // ---- Estado da fila (reprodução de playlist) ----
  let queue = null;
  let queueIndex = 0;

  // ---- Estado da prévia inline (somente uma por vez) ----
  let activePreview = null; // elemento DOM da prévia aberta

  // ---------- Helpers de URL ----------
  function ytSearch(t) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(t.artist + " " + t.title)}`;
  }
  function spSearch(t) {
    return `https://open.spotify.com/search/${encodeURIComponent(t.artist + " " + t.title)}`;
  }
  function spotifyEmbedSrc(t) {
    if (!t.spotify_embed) return null;
    if (/^https?:\/\//i.test(t.spotify_embed)) return t.spotify_embed;
    return `https://open.spotify.com/embed/track/${t.spotify_embed}`;
  }
  function ytEmbedSrc(t, autoplay) {
    if (!t.youtube_id) return null;
    const ap = autoplay ? "?autoplay=1" : "";
    return `https://www.youtube.com/embed/${t.youtube_id}${ap}`;
  }

  function makeIframe(src, height, title) {
    const f = document.createElement("iframe");
    f.height = height;
    f.loading = "lazy";
    f.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    f.allowFullscreen = true;
    f.src = src;
    f.title = title;
    return f;
  }

  function linkBtn(href, text, extraClass) {
    const a = document.createElement("a");
    a.className = "btn-link" + (extraClass ? " " + extraClass : "");
    a.target = "_blank";
    a.rel = "noopener";
    a.href = href;
    a.textContent = text;
    return a;
  }

  // ---------- Prévia inline ----------
  function closePreview() {
    if (activePreview) {
      activePreview.remove(); // remover o iframe interrompe a reprodução
      activePreview = null;
    }
  }

  function preview(track, anchorEl) {
    // Toggle: se a prévia aberta é a deste anchor, fecha.
    if (activePreview && activePreview.dataset.for === anchorKey(track)) {
      closePreview();
      return;
    }
    closePreview(); // pausa qualquer outra prévia

    const box = document.createElement("div");
    box.className = "preview-box";
    box.dataset.for = anchorKey(track);

    const sp = spotifyEmbedSrc(track);
    if (sp) {
      box.appendChild(makeIframe(sp, 80, "Prévia Spotify"));
    } else {
      const yt = ytEmbedSrc(track, true);
      if (yt) {
        box.appendChild(makeIframe(yt, 80, "Prévia YouTube"));
      } else {
        const msg = document.createElement("p");
        msg.className = "preview-msg";
        msg.textContent = "Sem embed direto — abra a busca:";
        box.appendChild(msg);
      }
    }

    const actions = document.createElement("div");
    actions.className = "preview-actions";
    actions.appendChild(linkBtn(ytSearch(track), "YouTube", ""));
    actions.appendChild(linkBtn(spSearch(track), "Spotify", "spotify"));
    const full = document.createElement("button");
    full.type = "button";
    full.className = "btn-link full-btn";
    full.textContent = "Ouvir completo ⤢";
    full.addEventListener("click", () => { closePreview(); open(track); });
    actions.appendChild(full);
    box.appendChild(actions);

    anchorEl.insertAdjacentElement("afterend", box);
    activePreview = box;
  }

  function anchorKey(t) {
    return `${(t.artist || "").toLowerCase()}|${(t.title || "").toLowerCase()}`;
  }

  // ---------- Modal completo ----------
  function buildBlock(title, iframe, links) {
    const block = document.createElement("div");
    block.className = "player-block";
    const h = document.createElement("h4");
    h.textContent = title;
    block.appendChild(h);
    if (iframe) block.appendChild(iframe);
    const wrap = document.createElement("div");
    wrap.className = "fallback-links";
    links.forEach((l) => wrap.appendChild(l));
    block.appendChild(wrap);
    return block;
  }

  function renderTrack(track) {
    document.getElementById("modal-title").textContent = track.title;
    const yr = track.year ? ` · ${track.year}` : "";
    document.getElementById("modal-sub").textContent = `${track.artist}${yr}`;

    const body = document.getElementById("player-body");
    body.innerHTML = "";

    const yt = ytEmbedSrc(track, false);
    body.appendChild(
      buildBlock(
        "▶ YouTube",
        yt ? makeIframe(yt, 220, `${track.title} (YouTube)`) : null,
        [linkBtn(ytSearch(track), yt ? "Buscar mais no YouTube" : "Buscar no YouTube", "")]
      )
    );

    const sp = spotifyEmbedSrc(track);
    body.appendChild(
      buildBlock(
        "♫ Spotify",
        sp ? makeIframe(sp, 152, `${track.title} (Spotify)`) : null,
        [linkBtn(spSearch(track), sp ? "Abrir no Spotify" : "Buscar no Spotify", "spotify")]
      )
    );
  }

  function renderQueueBar() {
    const bar = document.getElementById("player-queue");
    if (!queue) {
      bar.hidden = true;
      bar.innerHTML = "";
      return;
    }
    bar.hidden = false;
    bar.innerHTML = "";

    const prev = document.createElement("button");
    prev.type = "button"; prev.className = "queue-btn"; prev.textContent = "‹ Anterior";
    prev.disabled = queueIndex <= 0;
    prev.addEventListener("click", () => step(-1));

    const status = document.createElement("span");
    status.className = "queue-status";
    status.textContent = `${queueIndex + 1} / ${queue.length}`;

    const next = document.createElement("button");
    next.type = "button"; next.className = "queue-btn"; next.textContent = "Próxima ›";
    next.disabled = queueIndex >= queue.length - 1;
    next.addEventListener("click", () => step(1));

    bar.append(prev, status, next);
  }

  function step(delta) {
    if (!queue) return;
    const ni = queueIndex + delta;
    if (ni < 0 || ni >= queue.length) return;
    queueIndex = ni;
    renderTrack(queue[queueIndex]);
    renderQueueBar();
  }

  function showModal() {
    modal().hidden = false;
    document.body.style.overflow = "hidden";
  }

  function open(track) {
    queue = null;
    renderQueueBar();
    renderTrack(track);
    showModal();
  }

  function playQueue(tracks, startIndex) {
    if (!tracks || !tracks.length) return;
    queue = tracks.slice();
    queueIndex = Math.min(Math.max(startIndex || 0, 0), queue.length - 1);
    renderQueueBar();
    renderTrack(queue[queueIndex]);
    showModal();
  }

  function close() {
    modal().hidden = true;
    document.getElementById("player-body").innerHTML = ""; // para a reprodução
    document.getElementById("player-queue").innerHTML = "";
    queue = null;
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

  window.Player = { init, open, preview, closePreview, playQueue };
})();
