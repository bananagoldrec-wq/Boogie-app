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

  // ---- Estado da Rádio (reprodução aleatória contínua) ----
  let radio = null; // { list:[], i:0 }

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
    stopRadio();
    queue = null;
    renderQueueBar();
    renderTrack(track);
    showModal();
  }

  function playQueue(tracks, startIndex) {
    if (!tracks || !tracks.length) return;
    stopRadio();
    queue = tracks.slice();
    queueIndex = Math.min(Math.max(startIndex || 0, 0), queue.length - 1);
    renderQueueBar();
    renderTrack(queue[queueIndex]);
    showModal();
  }

  // ---------- Rádio (aleatória, música completa via YouTube) ----------
  let ytPlayer = null;
  let radioMode = null; // "yt" | "audio"

  function whenYTReady() {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) return resolve(true);
      let waited = 0;
      const iv = setInterval(() => {
        if (window.YT && window.YT.Player) { clearInterval(iv); resolve(true); }
        else if ((waited += 150) > 9000) { clearInterval(iv); resolve(false); }
      }, 150);
    });
  }

  function destroyYT() {
    try { if (ytPlayer && ytPlayer.destroy) ytPlayer.destroy(); } catch (e) { /* ignore */ }
    ytPlayer = null;
  }

  function stopRadio() {
    radio = null;
    radioMode = null;
    destroyYT();
  }

  function startRadio(tracks, preordered) {
    if (!tracks || !tracks.length) return;
    const list = tracks.slice();
    if (!preordered) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }
    radio = { list, i: 0 };
    queue = null;
    showModal();
    radioPlay();
  }

  function radioStep(delta) {
    if (!radio) return;
    radio.i = (radio.i + delta + radio.list.length) % radio.list.length;
    radioPlay();
  }

  function renderRadioBar() {
    const bar = document.getElementById("player-queue");
    bar.hidden = false;
    bar.innerHTML = "";
    const prev = document.createElement("button");
    prev.type = "button"; prev.className = "queue-btn"; prev.textContent = "‹ Anterior";
    prev.addEventListener("click", () => radioStep(-1));
    const status = document.createElement("span");
    status.className = "queue-status"; status.textContent = "🔀 no ar";
    const next = document.createElement("button");
    next.type = "button"; next.className = "queue-btn"; next.textContent = "Próxima ›";
    next.addEventListener("click", () => radioStep(1));
    bar.append(prev, status, next);
  }

  function ensureRadioStage() {
    const body = document.getElementById("player-body");
    if (document.getElementById("yt-player")) return;
    body.innerHTML = "";
    const card = document.createElement("div");
    card.className = "radio-now";
    const head = document.createElement("div");
    head.id = "radio-head"; head.className = "preview-head";
    const stage = document.createElement("div");
    stage.id = "radio-stage";
    const yt = document.createElement("div"); yt.id = "yt-player";
    const fb = document.createElement("div"); fb.id = "radio-fallback";
    stage.append(yt, fb);
    const act = document.createElement("div");
    act.id = "radio-actions"; act.className = "preview-actions";
    card.append(head, stage, act);
    body.appendChild(card);
  }

  function setRadioHeadActions(track) {
    const head = document.getElementById("radio-head");
    const yr = track.year ? ` · ${track.year}` : "";
    head.innerHTML =
      `<div class="preview-now"><strong>${esc(track.title)}</strong>` +
      `<span>${esc(track.artist)}${yr}</span>` +
      (track.country ? `<span>${esc(track.country)}</span>` : "") + `</div>`;
    const act = document.getElementById("radio-actions");
    act.innerHTML = "";

    const like = document.createElement("button");
    like.type = "button";
    const liked0 = window.Liked.has(track);
    like.className = "btn-link like-btn" + (liked0 ? " on" : "");
    like.textContent = liked0 ? "♥ Curtido" : "♡ Curti";
    like.addEventListener("click", () => {
      const on = window.Liked.toggle(track);
      like.classList.toggle("on", on);
      like.textContent = on ? "♥ Curtido" : "♡ Curti";
    });

    const hide = document.createElement("button");
    hide.type = "button"; hide.className = "btn-link ghost";
    hide.textContent = "✕ Não curti";
    hide.title = "Ocultar do app e pular";
    hide.addEventListener("click", () => radioHide(track));

    const full = document.createElement("button");
    full.type = "button"; full.className = "btn-link full-btn"; full.textContent = "♪ Ver faixa";
    full.addEventListener("click", () => open(track));

    act.append(like, hide, full, linkBtn(buyLinks(track).discogs, "💿 Comprar", "discogs"));
  }

  // Oculta a faixa atual da rádio e segue pra próxima.
  function radioHide(track) {
    window.Hidden.add(track);
    if (!radio) return;
    const n = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    const k = n(track.artist) + "::" + n(track.title);
    radio.list = radio.list.filter((t) => n(t.artist) + "::" + n(t.title) !== k);
    if (!radio.list.length) { close(); return; }
    if (radio.i >= radio.list.length) radio.i = 0;
    radioPlay(); // toca a que assumiu a posição atual (a próxima)
  }

  async function radioPlay() {
    if (!radio) return;
    const myToken = ++renderToken;
    const track = radio.list[radio.i];

    document.getElementById("modal-title").textContent = "📻 Rádio Disco & Boogie";
    document.getElementById("modal-sub").textContent =
      `${radio.i + 1} / ${radio.list.length} · embaralhado`;
    renderRadioBar();
    ensureRadioStage();
    setRadioHeadActions(track);

    const fb = document.getElementById("radio-fallback");
    fb.innerHTML = '<div class="preview-loading"><span class="spinner-sm"></span> Procurando a música completa…</div>';

    // 1) Tenta tocar a MÚSICA COMPLETA via YouTube.
    let vid = null;
    try { vid = await window.YouTubeResolve.find(track); } catch (e) { vid = null; }
    if (myToken !== renderToken) return;

    const ytOk = vid ? await whenYTReady() : false;
    if (myToken !== renderToken) return;

    if (vid && ytOk && window.YT && window.YT.Player) {
      radioMode = "yt";
      fb.innerHTML = "";
      document.getElementById("yt-player").style.display = "";
      if (!ytPlayer) {
        ytPlayer = new YT.Player("yt-player", {
          width: "100%", height: "230", videoId: vid,
          playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
          events: {
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.ENDED && radioMode === "yt") radioStep(1);
            },
          },
        });
      } else {
        ytPlayer.loadVideoById(vid);
      }
      return;
    }

    // 2) Fallback: prévia de 30s (iTunes/Deezer), seguindo sozinho.
    radioMode = "audio";
    if (ytPlayer) { try { ytPlayer.stopVideo(); } catch (e) { /* ignore */ } }
    const ytDiv = document.getElementById("yt-player");
    if (ytDiv) ytDiv.style.display = "none";
    const hit = await findPreview(track);
    if (myToken !== renderToken) return;
    fb.innerHTML = "";
    if (hit && hit.previewUrl) {
      const audio = document.createElement("audio");
      audio.className = "preview-audio";
      audio.controls = true; audio.autoplay = true; audio.src = hit.previewUrl;
      audio.addEventListener("ended", () => {
        if (myToken === renderToken && radioMode === "audio") radioStep(1);
      });
      fb.appendChild(audio);
      audio.play().catch(() => {});
      const note = document.createElement("p");
      note.className = "preview-msg";
      note.textContent = "(prévia de 30s — música completa indisponível agora)";
      fb.appendChild(note);
    } else {
      fb.innerHTML = '<p class="preview-msg">Sem áudio para esta faixa — pulando…</p>';
      setTimeout(() => { if (myToken === renderToken) radioStep(1); }, 2500);
    }
  }

  function close() {
    renderToken++; // cancela qualquer append assíncrono pendente
    modal().hidden = true;
    stopRadio();
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

  window.Player = { init, open, preview, closePreview, playQueue, radio: startRadio };
})();
