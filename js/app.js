/**
 * app.js
 * Orquestra tudo: carrega JSON local, mapa, algoritmo de descoberta,
 * playlists (UI) e prévia inline.
 */
(function () {
  "use strict";

  let SEEDS = {};
  let currentToken = 0; // evita "race" entre cliques rápidos
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
  function showWelcome() {
    window.Player.closePreview();
    els.welcome.hidden = false;
    els.content.hidden = true;
  }

  function showCountryShell(country) {
    window.Player.closePreview();
    els.welcome.hidden = true;
    els.content.hidden = false;
    els.title.textContent = `${country.flag} ${country.name}`;
    els.count.textContent = "";
    els.list.innerHTML = "";
    els.sources.textContent = "";
    els.unavailable.hidden = true;
    els.loading.hidden = true;
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
      info.innerHTML =
        `<div class="track-title">${esc(track.title)}${badge}</div>` +
        `<div class="track-meta">${esc(track.artist)}</div>`;

      const year = document.createElement("span");
      year.className = "track-year";
      year.textContent = track.year || "";

      top.append(cover, info, year);

      const actions = document.createElement("div");
      actions.className = "track-actions";

      const previewBtn = document.createElement("button");
      previewBtn.type = "button";
      previewBtn.className = "act-btn preview";
      previewBtn.innerHTML = "▶ Prévia";
      previewBtn.addEventListener("click", () => window.Player.preview(track, li));

      const plBtn = document.createElement("button");
      plBtn.type = "button";
      plBtn.className = "act-btn add";
      plBtn.innerHTML = "＋ Playlist";
      plBtn.addEventListener("click", () => choosePlaylistDialog(track));

      const fullBtn = document.createElement("button");
      fullBtn.type = "button";
      fullBtn.className = "act-btn full";
      fullBtn.innerHTML = "♪ Completo";
      fullBtn.addEventListener("click", () => window.Player.open(track));

      actions.append(previewBtn, plBtn, fullBtn);
      li.append(top, actions);
      els.list.appendChild(li);
    });
  }

  async function onSelectCountry(country) {
    const token = ++currentToken;
    showCountryShell(country);

    const entry = SEEDS[country.code];

    // País marcado como sem produção do gênero.
    if (entry && entry.available === false) {
      els.unavailable.hidden = false;
      els.count.textContent = "—";
      return;
    }

    const local = (entry && entry.tracks) || [];
    els.loading.hidden = false;

    // 1) Locais imediatamente.
    renderTracks(tagCountry(window.DiscoAlgorithm.merge(local), country));
    els.count.textContent = `${local.length} curadas`;

    // 2) APIs externas em paralelo (best-effort).
    const [mb, dg] = await Promise.all([
      window.MusicBrainz.searchByCountry(country.mb).catch(() => []),
      window.Discogs.searchByCountry(country.dg).catch(() => []),
    ]);
    if (token !== currentToken) return; // outro país foi clicado

    // 3-5) Mescla, deduplica, ordena, limita a 12.
    const merged = tagCountry(window.DiscoAlgorithm.merge(local, mb, dg), country);
    renderTracks(merged);
    els.loading.hidden = true;
    els.count.textContent = `${merged.length} faixas`;

    const found = [];
    if (mb.length) found.push(`MusicBrainz (+${mb.length})`);
    if (dg.length) found.push(`Discogs (+${dg.length})`);
    els.sources.textContent = found.length
      ? `Enriquecido com ${found.join(" e ")}.`
      : "APIs externas indisponíveis — exibindo seleção curada.";
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
      newBtn.textContent = "＋ Nova playlist";
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
      p.textContent = "Nenhuma playlist ainda. Crie uma acima ou pelo botão ＋ Playlist nas faixas.";
      list.appendChild(p);
      return;
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
      play.type = "button"; play.className = "icon-btn"; play.title = "Reproduzir"; play.textContent = "▶";
      play.disabled = !pl.tracks.length;
      play.addEventListener("click", () => window.Player.playQueue(pl.tracks, 0));

      const del = document.createElement("button");
      del.type = "button"; del.className = "icon-btn danger"; del.title = "Deletar"; del.textContent = "🗑";
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
    playAll.type = "button"; playAll.className = "btn-link"; playAll.textContent = "▶ Reproduzir";
    playAll.disabled = !pl.tracks.length;
    playAll.addEventListener("click", () => window.Player.playQueue(pl.tracks, 0));
    const ren = document.createElement("button");
    ren.type = "button"; ren.className = "btn-link ghost"; ren.textContent = "✎ Renomear";
    ren.addEventListener("click", () => renamePlaylistDialog(pl.id));
    tools.append(playAll, ren);
    detail.appendChild(tools);

    if (!pl.tracks.length) {
      const p = document.createElement("p");
      p.className = "dialog-empty";
      p.textContent = "Playlist vazia. Adicione faixas pelo botão ＋ Playlist.";
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
      const rm = mini("✕", false, () => { window.Playlists.removeTrack(pl.id, idx); openPlaylistDetail(pl.id); });
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

  function cacheEls() {
    els.welcome = document.getElementById("panel-welcome");
    els.content = document.getElementById("panel-content");
    els.title = document.getElementById("country-title");
    els.count = document.getElementById("country-count");
    els.list = document.getElementById("track-list");
    els.loading = document.getElementById("loading");
    els.sources = document.getElementById("sources-note");
    els.unavailable = document.getElementById("unavailable");
  }

  async function main() {
    cacheEls();
    window.Player.init();

    document.getElementById("back-btn").addEventListener("click", showWelcome);
    document.getElementById("open-playlists").addEventListener("click", openPlaylistsPanel);
    document.getElementById("new-playlist-btn").addEventListener("click", () => newPlaylistDialog(null));

    document.getElementById("playlists-panel").addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-close-playlists")) closePlaylistsPanel();
    });
    document.getElementById("dialog").addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-dialog-close")) closeDialog();
    });

    await loadSeeds();
    window.DiscoMap.init(onSelectCountry);
  }

  document.addEventListener("DOMContentLoaded", main);
})();
