/**
 * app.js
 * Orquestra tudo: carrega JSON local, mapa, algoritmo de descoberta,
 * playlists (UI) e prévia inline.
 */
(function () {
  "use strict";

  let SEEDS = {};
  let mapInstance = null;
  let currentTracks = []; // faixas do país atual (antes de filtrar ocultas)
  const els = {};

  // ---------- Dados ----------
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

  // ---------- Painel de resultados ----------
  // O mapa redimensiona quando o painel abre/fecha, então avisamos o Leaflet.
  function invalidateMap() {
    if (!mapInstance) return;
    setTimeout(() => mapInstance.invalidateSize(), 60);
  }

  function closePanel() {
    window.Player.closePreview();
    els.panel.hidden = true;
    document.body.classList.remove("panel-open");
    invalidateMap();
  }

  function openPanel() {
    els.panel.hidden = false;
    document.body.classList.add("panel-open");
    invalidateMap();
  }

  function tagCountry(tracks, country) {
    return tracks.map((t) => ({ ...t, country: t.country || country.name }));
  }

  function renderTracks(tracks) {
    els.list.innerHTML = "";
    tracks.forEach((track, i) => {
      const li = document.createElement("li");
      li.className = "track";
      li.style.animationDelay = `${i * 40}ms`;

      const top = document.createElement("div");
      top.className = "track-top";

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
        track.origin && track.origin !== "seeds"
          ? `<span class="track-badge">${track.origin}</span>`
          : "";
      const label = track.label ? ` <span class="track-label">${esc(track.label)}</span>` : "";
      info.innerHTML =
        `<div class="track-title">${esc(track.title)}${badge}</div>` +
        `<div class="track-meta">${esc(track.artist)}${label}</div>`;

      const year = document.createElement("span");
      year.className = "track-year";
      year.textContent = track.year || "";

      const like = document.createElement("button");
      like.type = "button";
      like.className = "track-like" + (window.Liked.has(track) ? " on" : "");
      like.innerHTML = window.Liked.has(track) ? window.Icon.heartFilled : window.Icon.heart;
      like.title = "Curti";
      like.setAttribute("aria-label", "Curtir faixa");
      like.addEventListener("click", (e) => {
        e.stopPropagation();
        const on = window.Liked.toggle(track);
        like.classList.toggle("on", on);
        like.innerHTML = on ? window.Icon.heartFilled : window.Icon.heart;
        toast(on ? `Curtiu: ${track.title}` : "Removido das curtidas");
      });

      const hide = document.createElement("button");
      hide.type = "button";
      hide.className = "track-hide";
      hide.innerHTML = window.Icon.x;
      hide.title = "Não curti — ocultar do app";
      hide.setAttribute("aria-label", "Ocultar faixa");
      hide.addEventListener("click", (e) => { e.stopPropagation(); hideTrack(track); });

      top.append(cover, info, year, like, hide);

      const actions = document.createElement("div");
      actions.className = "track-actions";

      const previewBtn = document.createElement("button");
      previewBtn.type = "button";
      previewBtn.className = "act-btn preview";
      previewBtn.innerHTML = window.Icon.play + " Prévia";
      previewBtn.addEventListener("click", () => window.Player.preview(track, li));

      const plBtn = document.createElement("button");
      plBtn.type = "button";
      plBtn.className = "act-btn add";
      plBtn.innerHTML = window.Icon.plus + " Playlist";
      plBtn.addEventListener("click", () => choosePlaylistDialog(track));

      const fullBtn = document.createElement("button");
      fullBtn.type = "button";
      fullBtn.className = "act-btn full";
      fullBtn.innerHTML = window.Icon.note + " Completo";
      fullBtn.addEventListener("click", () => window.Player.open(track));

      const buyBtn = document.createElement("button");
      buyBtn.type = "button";
      buyBtn.className = "act-btn buy";
      buyBtn.innerHTML = window.Icon.disc + " Comprar";
      buyBtn.title = "Comprar o disco no Discogs";
      buyBtn.addEventListener("click", () => window.open(discogsUrl(track), "_blank", "noopener"));

      actions.append(previewBtn, plBtn, fullBtn, buyBtn);
      li.append(top, actions);
      els.list.appendChild(li);
    });
  }

  function onSelectCountry(country) {
    window.Player.closePreview();
    openPanel();

    els.title.textContent = `${country.flag} ${country.name}`;
    els.count.textContent = "";
    els.list.innerHTML = "";
    els.sources.textContent = "";

    const entry = SEEDS[country.code];

    // País marcado como sem produção do gênero.
    if (entry && entry.available === false) {
      els.unavailable.hidden = false;
      els.count.textContent = "—";
      return;
    }
    els.unavailable.hidden = true;

    // Seleção curada e verificada (sem enriquecimento ao vivo, que trazia
    // faixas de outros países pelo país-de-lançamento pouco confiável).
    const local = (entry && entry.tracks) || [];
    currentTracks = tagCountry(window.DiscoAlgorithm.merge(local), country);
    renderVisible();
    els.sources.textContent =
      "Seleção curada e verificada. Toque numa faixa para ouvir, curtir ou ocultar.";
  }

  // Renderiza o país atual escondendo as faixas marcadas como "não curti".
  function renderVisible() {
    const vis = currentTracks.filter((t) => !window.Hidden.has(t));
    renderTracks(vis);
    els.count.textContent = `${vis.length} faixas`;
  }

  function hideTrack(track) {
    window.Hidden.add(track);
    window.Player.closePreview();
    renderVisible();
    toast(`Oculta: ${track.title}`);
  }

  // ---------- Rádio (toca o acervo inteiro, aleatório) ----------
  function startRadio() {
    const all = [];
    for (const code of Object.keys(SEEDS)) {
      const entry = SEEDS[code];
      if (!entry || entry.available === false || !Array.isArray(entry.tracks)) continue;
      const country = ((window.COUNTRIES || []).find((c) => c.code === code) || {}).name || code;
      entry.tracks.forEach((t) => { const x = { ...t, country }; if (!window.Hidden.has(x)) all.push(x); });
    }
    if (all.length) window.Player.radio(weightedOrder(all), true);
  }

  // Ordena a rádio dando mais peso ao que você curtiu (artista/país/selo/década).
  function weightedOrder(tracks) {
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    const liked = window.Liked.list();
    const t = { artist: {}, country: {}, label: {}, decade: {} };
    const likedKeys = new Set();
    liked.forEach((l) => {
      likedKeys.add(norm(l.artist) + "::" + norm(l.title));
      if (l.artist) t.artist[norm(l.artist)] = 1;
      if (l.country) t.country[l.country] = 1;
      if (l.label) t.label[l.label] = 1;
      if (l.year) t.decade[Math.floor(l.year / 10) * 10] = 1;
    });
    const weight = (x) => {
      let w = 1;
      if (likedKeys.has(norm(x.artist) + "::" + norm(x.title))) w += 8;
      if (x.artist && t.artist[norm(x.artist)]) w += 2.5;
      if (x.country && t.country[x.country]) w += 1.5;
      if (x.label && t.label[x.label]) w += 1.2;
      if (x.year && t.decade[Math.floor(x.year / 10) * 10]) w += 0.8;
      return w;
    };
    // Permutação aleatória ponderada (chave exponencial): peso maior tende a vir antes.
    return tracks
      .map((x) => ({ x, k: -Math.log(Math.random() || 1e-9) / weight(x) }))
      .sort((a, b) => a.k - b.k)
      .map((o) => o.x);
  }

  // ---------- Dialog genérico ----------
  function openDialog(title, buildBody) {
    const dlg = document.getElementById("dialog");
    document.getElementById("dialog-title").textContent = title;
    const body = document.getElementById("dialog-body");
    body.innerHTML = "";
    buildBody(body);
    dlg.hidden = false;
  }
  function closeDialog() {
    document.getElementById("dialog").hidden = true;
    document.getElementById("dialog-body").innerHTML = "";
  }

  // ---------- Escolher / criar playlist ----------
  function choosePlaylistDialog(track) {
    openDialog("Adicionar a qual playlist?", (body) => {
      const lists = window.Playlists.all();
      if (lists.length) {
        const wrap = document.createElement("div");
        wrap.className = "dialog-list";
        lists.forEach((pl) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "dialog-item";
          b.innerHTML = `<span>${esc(pl.name)}</span><small>${pl.tracks.length} faixas</small>`;
          b.addEventListener("click", () => {
            const r = window.Playlists.addTrack(pl.id, track);
            closeDialog();
            toast(r.ok ? `Adicionada a "${pl.name}"` : r.reason === "duplicate" ? "Já está nessa playlist" : "Erro ao adicionar");
            refreshPlaylistsPanel();
          });
          wrap.appendChild(b);
        });
        body.appendChild(wrap);
      } else {
        const p = document.createElement("p");
        p.className = "dialog-empty";
        p.textContent = "Você ainda não tem playlists.";
        body.appendChild(p);
      }

      const newBtn = document.createElement("button");
      newBtn.type = "button";
      newBtn.className = "btn-link new-pl";
      newBtn.innerHTML = window.Icon.plus + " Nova playlist";
      newBtn.addEventListener("click", () => newPlaylistDialog(track));
      body.appendChild(newBtn);
    });
  }

  function newPlaylistDialog(trackToAdd) {
    openDialog("Nova playlist", (body) => {
      const form = document.createElement("form");
      form.className = "dialog-form";
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Nome da playlist (ex.: Boogie de Sábado)";
      input.maxLength = 60;
      input.required = true;
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.className = "btn-link";
      submit.textContent = "Criar";
      form.append(input, submit);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = input.value.trim();
        if (!name) return;
        const pl = window.Playlists.create(name);
        if (trackToAdd) window.Playlists.addTrack(pl.id, trackToAdd);
        closeDialog();
        toast(trackToAdd ? `Criada "${pl.name}" e faixa adicionada` : `Playlist "${pl.name}" criada`);
        refreshPlaylistsPanel();
      });
      body.appendChild(form);
      setTimeout(() => input.focus(), 50);
    });
  }

  // ---------- Painel de playlists ----------
  function openPlaylistsPanel() {
    document.getElementById("playlists-panel").hidden = false;
    refreshPlaylistsPanel();
  }
  function closePlaylistsPanel() {
    document.getElementById("playlists-panel").hidden = true;
    document.getElementById("playlist-detail").hidden = true;
  }

  function refreshPlaylistsPanel() {
    const list = document.getElementById("playlists-list");
    const detail = document.getElementById("playlist-detail");
    detail.hidden = true;
    list.hidden = false;
    list.innerHTML = "";

    const lists = window.Playlists.all();
    if (!lists.length) {
      const p = document.createElement("p");
      p.className = "dialog-empty";
      p.textContent = "Nenhuma playlist ainda. Crie uma acima ou pelo botão Playlist nas faixas.";
      list.appendChild(p);
    }

    lists.forEach((pl) => {
      const row = document.createElement("div");
      row.className = "pl-row";
      const open = document.createElement("button");
      open.type = "button";
      open.className = "pl-open";
      open.innerHTML = `<span class="pl-name">${esc(pl.name)}</span><small>${pl.tracks.length} faixas</small>`;
      open.addEventListener("click", () => openPlaylistDetail(pl.id));

      const play = document.createElement("button");
      play.type = "button"; play.className = "icon-btn"; play.title = "Reproduzir"; play.innerHTML = window.Icon.play;
      play.disabled = !pl.tracks.length;
      play.addEventListener("click", () => window.Player.playQueue(pl.tracks, 0));

      const del = document.createElement("button");
      del.type = "button"; del.className = "icon-btn danger"; del.title = "Deletar"; del.innerHTML = window.Icon.trash;
      del.addEventListener("click", () => {
        if (confirm(`Deletar a playlist "${pl.name}"?`)) {
          window.Playlists.remove(pl.id);
          refreshPlaylistsPanel();
          toast("Playlist deletada");
        }
      });

      row.append(open, play, del);
      list.appendChild(row);
    });

    renderHiddenSummary(list);
  }

  // Resumo das faixas ocultas (com gestão/restauração).
  function renderHiddenSummary(list) {
    const hidden = window.Hidden.list();
    const row = document.createElement("div");
    row.className = "pl-row hidden-row";
    const open = document.createElement("button");
    open.type = "button"; open.className = "pl-open";
    open.innerHTML = `<span class="pl-name">${window.Icon.ban} Faixas ocultas</span><small>${hidden.length} oculta(s)</small>`;
    open.addEventListener("click", openHiddenDetail);
    row.appendChild(open);
    list.appendChild(row);
  }

  function openHiddenDetail() {
    const list = document.getElementById("playlists-list");
    const detail = document.getElementById("playlist-detail");
    list.hidden = true;
    detail.hidden = false;
    detail.innerHTML = "";

    const head = document.createElement("div");
    head.className = "detail-head";
    const back = document.createElement("button");
    back.type = "button"; back.className = "back-btn"; back.textContent = "‹";
    back.addEventListener("click", refreshPlaylistsPanel);
    const h = document.createElement("h3");
    h.innerHTML = window.Icon.ban + " Faixas ocultas";
    head.append(back, h);
    detail.appendChild(head);

    const hidden = window.Hidden.list();
    if (!hidden.length) {
      const p = document.createElement("p");
      p.className = "dialog-empty";
      p.textContent = "Nada oculto. Use o botão de ocultar numa faixa para tirá-la do app.";
      detail.appendChild(p);
      return;
    }

    const tools = document.createElement("div");
    tools.className = "detail-tools";
    const clearAll = document.createElement("button");
    clearAll.type = "button"; clearAll.className = "btn-link ghost"; clearAll.textContent = "Restaurar todas";
    clearAll.addEventListener("click", () => {
      if (confirm("Restaurar todas as faixas ocultas?")) {
        window.Hidden.clear();
        openHiddenDetail();
        if (currentTracks.length) renderVisible();
        toast("Faixas restauradas");
      }
    });
    tools.appendChild(clearAll);
    detail.appendChild(tools);

    const ul = document.createElement("ul");
    ul.className = "detail-tracks";
    hidden.forEach((t) => {
      const li = document.createElement("li");
      li.className = "detail-track";
      const info = document.createElement("div");
      info.className = "detail-info";
      info.innerHTML =
        `<span class="dt-title">${esc(t.title)}</span>` +
        `<span class="dt-meta">${esc(t.artist)}${t.country ? " · " + esc(t.country) : ""}</span>`;
      const restore = document.createElement("button");
      restore.type = "button"; restore.className = "mini-btn"; restore.innerHTML = window.Icon.restore;
      restore.title = "Restaurar";
      restore.addEventListener("click", () => {
        window.Hidden.remove(t);
        openHiddenDetail();
        if (currentTracks.length) renderVisible();
      });
      li.append(info, restore);
      ul.appendChild(li);
    });
    detail.appendChild(ul);
  }

  function openPlaylistDetail(id) {
    const pl = window.Playlists.get(id);
    if (!pl) return refreshPlaylistsPanel();

    const list = document.getElementById("playlists-list");
    const detail = document.getElementById("playlist-detail");
    list.hidden = true;
    detail.hidden = false;
    detail.innerHTML = "";

    const head = document.createElement("div");
    head.className = "detail-head";
    const back = document.createElement("button");
    back.type = "button"; back.className = "back-btn"; back.textContent = "‹";
    back.addEventListener("click", refreshPlaylistsPanel);
    const h = document.createElement("h3");
    h.textContent = pl.name;
    head.append(back, h);
    detail.appendChild(head);

    const tools = document.createElement("div");
    tools.className = "detail-tools";
    const playAll = document.createElement("button");
    playAll.type = "button"; playAll.className = "btn-link"; playAll.innerHTML = window.Icon.play + " Reproduzir";
    playAll.disabled = !pl.tracks.length;
    playAll.addEventListener("click", () => window.Player.playQueue(pl.tracks, 0));
    const ren = document.createElement("button");
    ren.type = "button"; ren.className = "btn-link ghost"; ren.textContent = "Renomear";
    ren.addEventListener("click", () => renamePlaylistDialog(pl.id));
    tools.append(playAll, ren);
    detail.appendChild(tools);

    if (!pl.tracks.length) {
      const p = document.createElement("p");
      p.className = "dialog-empty";
      p.textContent = "Playlist vazia. Adicione faixas pelo botão Playlist.";
      detail.appendChild(p);
      return;
    }

    const ul = document.createElement("ul");
    ul.className = "detail-tracks";
    pl.tracks.forEach((t, idx) => {
      const li = document.createElement("li");
      li.className = "detail-track";

      const info = document.createElement("button");
      info.type = "button";
      info.className = "detail-info";
      info.innerHTML =
        `<span class="dt-title">${esc(t.title)}</span>` +
        `<span class="dt-meta">${esc(t.artist)}${t.year ? " · " + t.year : ""}</span>`;
      info.addEventListener("click", () => window.Player.playQueue(pl.tracks, idx));

      const ctrl = document.createElement("div");
      ctrl.className = "dt-ctrl";
      const up = mini("↑", idx === 0, () => { window.Playlists.moveTrack(pl.id, idx, idx - 1); openPlaylistDetail(pl.id); });
      const down = mini("↓", idx === pl.tracks.length - 1, () => { window.Playlists.moveTrack(pl.id, idx, idx + 1); openPlaylistDetail(pl.id); });
      const rm = mini(window.Icon.x, false, () => { window.Playlists.removeTrack(pl.id, idx); openPlaylistDetail(pl.id); });
      rm.classList.add("danger");
      ctrl.append(up, down, rm);

      li.append(info, ctrl);
      ul.appendChild(li);
    });
    detail.appendChild(ul);
  }

  function mini(label, disabled, onClick) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "mini-btn"; b.textContent = label;
    b.disabled = !!disabled;
    if (!disabled) b.addEventListener("click", onClick);
    return b;
  }

  function renamePlaylistDialog(id) {
    const pl = window.Playlists.get(id);
    if (!pl) return;
    openDialog("Renomear playlist", (body) => {
      const form = document.createElement("form");
      form.className = "dialog-form";
      const input = document.createElement("input");
      input.type = "text"; input.value = pl.name; input.maxLength = 60; input.required = true;
      const submit = document.createElement("button");
      submit.type = "submit"; submit.className = "btn-link"; submit.textContent = "Salvar";
      form.append(input, submit);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        window.Playlists.rename(id, input.value);
        closeDialog();
        openPlaylistDetail(id);
        toast("Playlist renomeada");
      });
      body.appendChild(form);
      setTimeout(() => { input.focus(); input.select(); }, 50);
    });
  }

  // ---------- Utilidades ----------
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => (el.hidden = true), 300);
    }, 2200);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function discogsUrl(track) {
    const q = encodeURIComponent(`${track.artist} ${track.title}`);
    return `https://www.discogs.com/sell/list?q=${q}&format=Vinyl`;
  }

  function cacheEls() {
    els.panel = document.getElementById("panel");
    els.title = document.getElementById("country-title");
    els.count = document.getElementById("country-count");
    els.list = document.getElementById("track-list");
    els.sources = document.getElementById("sources-note");
    els.unavailable = document.getElementById("unavailable");
  }

  async function main() {
    cacheEls();
    window.Player.init();

    document.getElementById("back-btn").addEventListener("click", closePanel);
    document.getElementById("open-playlists").addEventListener("click", openPlaylistsPanel);
    document.getElementById("radio-btn").addEventListener("click", startRadio);
    document.getElementById("new-playlist-btn").addEventListener("click", () => newPlaylistDialog(null));

    document.getElementById("playlists-panel").addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-close-playlists")) closePlaylistsPanel();
    });
    document.getElementById("dialog").addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-dialog-close")) closeDialog();
    });

    await loadSeeds();
    seedPresetLikes();
    mapInstance = window.DiscoMap.init(onSelectCountry);
  }

  // Marca como ❤️ (uma vez por aparelho) as faixas da playlist "Beno disco".
  function seedPresetLikes() {
    if (!window.PRESET_LIKES) return;
    try { if (localStorage.getItem("disco_boogie_seeded_beno")) return; } catch (e) { return; }
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD")
      .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const idx = {};
    for (const code of Object.keys(SEEDS)) {
      const e = SEEDS[code];
      if (!e || !Array.isArray(e.tracks)) continue;
      const cn = ((window.COUNTRIES || []).find((c) => c.code === code) || {}).name || code;
      e.tracks.forEach((t) => { idx[norm(t.artist) + "::" + norm(t.title)] = { ...t, country: cn }; });
    }
    let n = 0;
    window.PRESET_LIKES.forEach(([a, ti]) => {
      const tr = idx[norm(a) + "::" + norm(ti)];
      if (tr && !window.Hidden.has(tr)) { window.Liked.add(tr); n++; }
    });
    try { localStorage.setItem("disco_boogie_seeded_beno", "1"); } catch (e) { /* ignore */ }
    console.log(`[preset] ${n} faixas da playlist marcadas como curtidas.`);
  }

  document.addEventListener("DOMContentLoaded", main);
})();
