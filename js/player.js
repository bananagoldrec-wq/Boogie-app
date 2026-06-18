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
  let renderToken = 0; // invalida appends assíncronos ao trocar de faixa

  // ---- Estado da prévia inline (somente uma por vez) ----
  let activePreview = null; // elemento DOM da prévia aberta

  // ---------- Helpers de URL ----------
  function ytSearch(t) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(t.artist + " " + t.title)}`;
  }
  function spSearch(t) {
    return `https://open.spotify.com/search/${encodeURIComponent(t.artist + " " + t.title)}`;
  }
  // Links de compra do vinil (busca por artista + título)
  function buyLinks(t) {
    const q = `${t.artist} ${t.title}`.trim();
    const enc = encodeURIComponent(q);
    const slug = q
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return {
      discogs: `https://www.discogs.com/sell/list?q=${enc}&format=Vinyl`,
      ebay: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q + " vinyl")}`,
      mercado: `https://lista.mercadolivre.com.br/${slug}-vinil`,
    };
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

  /**
   * Resolve uma prévia de 30s tocável (áudio) tentando iTunes e depois Deezer.
   * Ambos são keyless e entregam um arquivo de áudio direto (sem CORS p/ <audio>).
   */
  async function findPreview(track) {
    let hit = null;
    try { hit = await window.ITunes.find(track); } catch (e) { /* tenta Deezer */ }
    if (hit && hit.previewUrl) return hit;
    try { hit = await window.Deezer.find(track); } catch (e) { /* sem prévia */ }
    if (hit && hit.previewUrl) return hit;
    return null;
  }

  async function preview(track, anchorEl) {
    const key = anchorKey(track);
    // Toggle: se a prévia aberta é a deste anchor, fecha.
    if (activePreview && activePreview.dataset.for === key) {
      closePreview();
      return;
    }
    closePreview(); // pausa qualquer outra prévia

    const box = document.createElement("div");
    box.className = "preview-box";
    box.dataset.for = key;
    box.innerHTML =
      '<div class="preview-loading"><span class="spinner-sm"></span> Carregando prévia de 30s…</div>';
    anchorEl.insertAdjacentElement("afterend", box);
    activePreview = box;

    const hit = await findPreview(track);
    if (activePreview !== box) return; // usuário trocou de prévia/país

    box.innerHTML = "";

    if (hit && hit.previewUrl) {
      const head = document.createElement("div");
      head.className = "preview-head";
      if (hit.artwork) {
        const img = document.createElement("img");
        img.className = "preview-cover";
        img.src = hit.artwork;
        img.alt = "";
        head.appendChild(img);
      }
      const meta = document.createElement("div");
      meta.className = "preview-now";
      meta.innerHTML =
        `<strong>${esc(track.title)}</strong>` +
        `<span>${esc(track.artist)} · prévia 30s (${hit.source || "áudio"})</span>`;
      head.appendChild(meta);
      box.appendChild(head);

      const audio = document.createElement("audio");
      audio.className = "preview-audio";
      audio.controls = true;
      audio.autoplay = true;
      audio.preload = "auto";
      audio.src = hit.previewUrl;
      box.appendChild(audio);
      audio.play().catch(() => {}); // gesto do usuário já permite tocar
    } else {
      // Sem prévia em iTunes nem Deezer: tenta embed do YouTube curado.
      const yt = ytEmbedSrc(track, true);
      if (yt) {
        box.appendChild(makeIframe(yt, 80, "Prévia YouTube"));
      } else {
        const msg = document.createElement("p");
        msg.className = "preview-msg";
        msg.textContent = "Não encontramos uma prévia de áudio para esta faixa.";
        box.appendChild(msg);
      }
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
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

  async function appendPreviewBlock(track, myToken) {
    const hit = await findPreview(track);
    if (myToken !== renderToken || !hit || !hit.previewUrl) return;
    const body = document.getElementById("player-body");
    if (!body) return;
    const block = document.createElement("div");
    block.className = "player-block";
    const h = document.createElement("h4");
    h.textContent = `🎧 Prévia 30s (toca direto · ${hit.source || "áudio"})`;
    const audio = document.createElement("audio");
    audio.className = "preview-audio";
    audio.controls = true;
    audio.preload = "none";
    audio.src = hit.previewUrl;
    block.append(h, audio);
    body.insertBefore(block, body.firstChild); // garantido tocável, no topo
  }

  function renderTrack(track) {
    const myToken = ++renderToken;
    document.getElementById("modal-title").textContent = track.title;
    const yr = track.year ? ` · ${track.year}` : "";
    const lbl = track.label ? ` · ${track.label}` : "";
    document.getElementById("modal-sub").textContent = `${track.artist}${yr}${lbl}`;

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

    // Comprar o disco (busca por artista + título nos marketplaces)
    const buy = buyLinks(track);
    body.appendChild(
      buildBlock("💿 Comprar o disco", null, [
        linkBtn(buy.discogs, "Discogs", "discogs"),
        linkBtn(buy.ebay, "eBay", "ebay"),
        linkBtn(buy.mercado, "Mercado Livre", "mercado"),
      ])
    );

    // Bloco de áudio garantido (30s via iTunes/Deezer), no topo quando resolver.
    appendPreviewBlock(track, myToken);
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
    renderToken++; // cancela qualquer append assíncrono pendente
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
