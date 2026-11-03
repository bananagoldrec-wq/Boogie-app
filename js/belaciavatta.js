/* Bela Ciavatta · finalização do álbum — lógica do app.
   Mesma base do app da Banana Gold: grava no aparelho e sincroniza pelo
   Firestore quando dá. Três coleções:
   - bc_tracks:     as faixas do álbum (ordem, etapa, áudio, to-do, notas);
   - bc_events:     compromissos do calendário (estúdio, ensaio, entrega...);
   - bc_milestones: os marcos do road map.
   Os marcos padrão vêm embutidos (SEED_MILESTONES); o que a equipe edita
   por cima vira um doc com o mesmo id, e apagar grava { deleted: true }
   pra ele não voltar. */

(() => {
  "use strict";

  /* BUILD tem que ser igual ao data-build do belaciavatta.html: suba os
     dois juntos com o ?v=. Se o HTML velho carregar o JS novo (cache),
     recarrega uma vez em vez de travar. */
  const BUILD = "3";
  if (document.documentElement.dataset.build !== BUILD) {
    const tried = (() => { try { return sessionStorage.getItem("bc_build_reload") === BUILD; } catch (err) { return false; } })();
    if (!tried) {
      try { sessionStorage.setItem("bc_build_reload", BUILD); } catch (err) {}
      fetch(location.href, { cache: "reload" }).catch(() => {}).finally(() => location.reload());
      return;
    }
  }

  /* Mesmo projeto Firebase dos outros apps, em coleções separadas (bc_*)
     — veja o README pras regras. */
  const firebaseConfig = {
    apiKey: "AIzaSyBq_x9Mfyv0aT-wblKcbWScUGn1htCg_3g",
    authDomain: "frisson-agenda.firebaseapp.com",
    projectId: "frisson-agenda",
    storageBucket: "frisson-agenda.firebasestorage.app",
    messagingSenderId: "28732138318",
    appId: "1:28732138318:web:67e28575aa1040770f741f",
  };

  // Trava simples: segura visitante casual, não é segurança de verdade.
  const APP_PASSWORD = "belaciavatta";
  const UNLOCK_KEY = "bc_unlocked_v1";
  const LOCAL_KEY = "bc_local_v1";
  const OPEN_KEY = "bc_open_v1";
  const MAX_AUDIO = 300 * 1024 * 1024;

  const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  /* etapas de cada faixa, na ordem em que ela anda até ficar pronta */
  const STAGES = [
    { id: "demo", nome: "Demo" },
    { id: "arranjo", nome: "Arranjo" },
    { id: "gravacao", nome: "Gravação" },
    { id: "mix", nome: "Mix" },
    { id: "master", nome: "Master" },
    { id: "pronta", nome: "Pronta" },
  ];
  const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));
  const STAGE_NAME = Object.fromEntries(STAGES.map((s) => [s.id, s.nome]));
  const stageVar = (id) => `var(--st-${id in STAGE_INDEX ? id : "demo"})`;

  const EVENT_TYPES = [
    { id: "estudio", nome: "Estúdio / gravação" },
    { id: "ensaio", nome: "Ensaio" },
    { id: "mix", nome: "Mix" },
    { id: "master", nome: "Master" },
    { id: "reuniao", nome: "Reunião" },
    { id: "entrega", nome: "Entrega / prazo" },
    { id: "lancamento", nome: "Lançamento" },
    { id: "outro", nome: "Outro" },
  ];
  const EVENT_TYPE_NAME = Object.fromEntries(EVENT_TYPES.map((t) => [t.id, t.nome]));

  /* checklist que dá pra jogar numa faixa com um toque */
  const TODO_TEMPLATE = [
    "Fechar letra",
    "Fechar arranjo",
    "Gravar voz guia",
    "Gravar instrumentos",
    "Gravar voz final",
    "Edição e afinação",
    "Mix aprovada",
    "Master aprovada",
    "Ficha técnica / créditos",
    "ISRC e metadados",
  ];

  /* road map padrão de finalização de álbum (sem datas: a equipe põe) */
  const SEED_MILESTONES = {
    "ms-repertorio": { titulo: "Fechar repertório e ordem das faixas", ordem: 1 },
    "ms-preproducao": { titulo: "Pré-produção e arranjos", ordem: 2 },
    "ms-gravacao": { titulo: "Gravações", ordem: 3 },
    "ms-mix": { titulo: "Mixagem", ordem: 4 },
    "ms-master": { titulo: "Masterização", ordem: 5 },
    "ms-arte": { titulo: "Capa, arte e fotos", ordem: 6 },
    "ms-distribuicao": { titulo: "Distribuidora, ISRC e metadados", ordem: 7 },
    "ms-divulgacao": { titulo: "Plano de divulgação e single", ordem: 8 },
    "ms-lancamento": { titulo: "Lançamento do álbum", ordem: 9 },
  };
  Object.values(SEED_MILESTONES).forEach((m) => Object.assign(m, { data: "", status: "aberto", obs: "", ...m }));

  /* Faixas que já vêm no app: os bounces da pasta BOUNCES no Google Drive
     (https://drive.google.com/drive/folders/1LMmr416ktsMHmQD1AK-cDilvwiMybh6H).
     [id, título, id do arquivo no Drive, nome do arquivo, tamanho]. Pra
     tocar aqui, os arquivos precisam estar em "Qualquer pessoa com o link".
     O que a equipe edita vira um doc com o mesmo id por cima; apagar grava
     { deleted: true } pra faixa não voltar. */
  const SEED_TRACKS = Object.fromEntries([
    ["seed-moco", "Moço", "1LN0Jn5NlyoOeb8DqJMAao6jKLQL_FLBy", "MOCO BELLA CIAVATA - bg 175 .wav", 62454908],
    ["seed-ponto", "Ponto de Partida", "1c1mOBhzzvHTLDflIOx5XQCKE_QXsJTXg", "ponto de partida.wav", 60621722],
    ["seed-ponto-coro", "Ponto de Partida (coro)", "1qZp6a6LES3kZU_R5gsxrX1cuYxAxLGQU", "ponto de partida coro 122.wav", 60621722],
    ["seed-nada", "Nada (versão final sem voz)", "1Wpo1cNxWalSJn-FuiUaR_U5eI16aT3vT", "nada v2 VERSAO FINAL sem voz.wav", 55296080],
    ["seed-nada-v2", "Nada (versão final sem voz v2)", "1bYRGfdhrXJBzwRBAfh-6unr9F3-7744G", "nada v2 VERSAO FINAL sem voz v2.wav", 55296080],
    ["seed-romance", "Romance (sem vocal)", "1jEeFQNPjJBqr1O7aMsKtndPxNwk_3xKu", "Bela Ciavatta - romance  sem vocal.wav", 64021064],
  ].map(([id, titulo, fid, nome, tamanho], i) => [id, {
    titulo, ordem: i + 1, etapa: "demo", todos: [], notas: "",
    audio: {
      url: `https://drive.google.com/uc?export=download&id=${fid}`,
      link: `https://drive.google.com/file/d/${fid}/view`,
      nome, tamanho, origem: "drive",
    },
  }]));

  /* ── estado ────────────────────────────────────────────── */
  const today = new Date();
  const todayKey = keyFromDate(today);
  let view = { year: today.getFullYear(), month: today.getMonth() + 1 };
  const COLS = ["tracks", "events", "milestones"];
  const emptyCols = () => ({ tracks: {}, events: {}, milestones: {} });
  let stored = emptyCols();
  let pending = emptyCols();
  let tracks = {};
  let events = {};
  let milestones = {};
  let currentTab = "";
  let todoFilter = "abertos";
  let activeDayKey = null;
  let activeEventId = null;
  let activeMsId = null;
  let openGroups = new Set();
  try { openGroups = new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || "[]")); } catch (err) {}

  function rebuild() {
    const tr = {};
    Object.entries(SEED_TRACKS).forEach(([id, t]) => { tr[id] = { ...t }; });
    Object.entries(stored.tracks).forEach(([id, t]) => {
      if (!t || t.deleted) delete tr[id];
      else tr[id] = { ...(tr[id] || {}), ...t };
    });
    tracks = tr;
    events = {};
    Object.entries(stored.events).forEach(([id, e]) => { if (e && !e.deleted) events[id] = e; });
    const ms = {};
    Object.entries(SEED_MILESTONES).forEach(([id, m]) => { ms[id] = { ...m }; });
    Object.entries(stored.milestones).forEach(([id, m]) => {
      if (!m || m.deleted) delete ms[id];
      else ms[id] = { ...(ms[id] || {}), ...m };
    });
    milestones = ms;
  }

  /* ── armazenamento: nuvem com reserva no aparelho ───────── */
  let db, cols = {}, doc, onSnapshot, writeBatch;
  let fbApp = null, fbUser = null;
  let cloudReady = false;
  let warnedLocal = false;

  function loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
      if (!raw) return;
      stored = { ...emptyCols(), ...(raw.stored || {}) };
      pending = { ...emptyCols(), ...(raw.pending || {}) };
    } catch (err) {}
  }

  function saveLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ stored, pending })); } catch (err) {}
  }

  function hasPending() {
    return COLS.some((c) => Object.keys(pending[c]).length);
  }

  /* changes: { tracks?: {id: doc|null}, events?: ..., milestones?: ... } —
     null apaga. Grava na hora no aparelho (a tela responde sem esperar)
     e manda pra nuvem num writeBatch só. */
  async function write(changes) {
    Object.entries(changes).forEach(([col, items]) => {
      Object.entries(items).forEach(([id, entry]) => {
        if (entry) stored[col][id] = entry;
        else delete stored[col][id];
        if (!cloudReady) pending[col][id] = entry;
      });
    });
    saveLocal();
    renderAll(true);
    if (cloudReady) {
      try {
        const batch = writeBatch(db);
        Object.entries(changes).forEach(([col, items]) => {
          Object.entries(items).forEach(([id, entry]) => {
            if (entry) batch.set(doc(cols[col], id), entry);
            else batch.delete(doc(cols[col], id));
          });
        });
        await batch.commit();
        return "cloud";
      } catch (err) {
        console.error(err);
        Object.entries(changes).forEach(([col, items]) => {
          Object.entries(items).forEach(([id, entry]) => { pending[col][id] = entry; });
        });
        saveLocal();
        goLocal(err && err.code);
        return "local";
      }
    }
    if (!warnedLocal) {
      warnedLocal = true;
      showToast("Salvo neste aparelho — sobe pra nuvem quando a conexão voltar.");
    }
    return "local";
  }

  async function flushPending() {
    if (!hasPending()) return;
    const batch = writeBatch(db);
    Object.entries(pending).forEach(([col, items]) => {
      Object.entries(items).forEach(([id, entry]) => {
        if (entry) batch.set(doc(cols[col], id), entry);
        else batch.delete(doc(cols[col], id));
      });
    });
    try {
      await batch.commit();
      const n = COLS.reduce((sum, c) => sum + Object.keys(pending[c]).length, 0);
      pending = emptyCols();
      saveLocal();
      showToast(`${n} alteração(ões) feitas offline enviadas pra nuvem.`);
    } catch (err) {
      console.error(err);
    }
  }

  function goLocal(reason) {
    cloudReady = false;
    renderSync();
    if (reason) console.warn("Bela Ciavatta em modo local:", reason);
    if (!warnedLocal) {
      warnedLocal = true;
      showToast("Sem nuvem agora — tudo segue salvo neste aparelho.");
    }
  }

  function startSync() {
    let firstSnaps = 0;
    COLS.forEach((col) => {
      let first = true;
      onSnapshot(cols[col], (snap) => {
        const next = {};
        snap.forEach((d) => { next[d.id] = d.data(); });
        // as alterações offline ainda não estão no snapshot
        Object.entries(pending[col]).forEach(([id, entry]) => {
          if (entry) next[id] = entry;
          else delete next[id];
        });
        stored[col] = next;
        if (first) {
          first = false;
          if (++firstSnaps === COLS.length) {
            cloudReady = true;
            renderSync();
            flushPending();
          }
        }
        saveLocal();
        renderAll();
      }, (err) => {
        console.error(err);
        goLocal(err && err.code);
      });
    });
  }

  async function connectFirebase() {
    try {
      const [appMod, authMod, fsMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js"),
      ]);
      doc = fsMod.doc;
      onSnapshot = fsMod.onSnapshot;
      writeBatch = fsMod.writeBatch;

      fbApp = appMod.initializeApp(firebaseConfig, "belaciavatta");
      const auth = authMod.getAuth(fbApp);
      db = fsMod.getFirestore(fbApp);
      cols = {
        tracks: fsMod.collection(db, "bc_tracks"),
        events: fsMod.collection(db, "bc_events"),
        milestones: fsMod.collection(db, "bc_milestones"),
      };

      authMod.signInAnonymously(auth).catch((err) => goLocal(err && err.code));
      let started = false;
      authMod.onAuthStateChanged(auth, (user) => {
        fbUser = user;
        if (user && !started) {
          started = true;
          startSync();
        }
      });
    } catch (err) {
      goLocal("Firebase indisponível");
    }
  }

  /* ── helpers ───────────────────────────────────────────── */
  function pad2(n) { return String(n).padStart(2, "0"); }
  function dateKey(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }
  function keyFromDate(dt) { return dateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); }
  function dateFromKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function daysBetween(fromKey, toKey) {
    return Math.round((dateFromKey(toKey) - dateFromKey(fromKey)) / 86400000);
  }
  function formatBr(key) {
    const dt = dateFromKey(key);
    return `${WEEKDAY_NAMES[dt.getDay()]}, ${dt.getDate()} de ${MONTH_NAMES[dt.getMonth()]}`;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function newId(prefix) {
    return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }
  function fmtSize(n) {
    if (!n) return "";
    return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
  }
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${pad2(s)}`;
  }
  function fileTitle(name) {
    return name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").trim() || "Faixa nova";
  }
  function countdown(key) {
    const d = daysBetween(todayKey, key);
    if (d === 0) return "hoje";
    if (d === 1) return "amanhã";
    if (d === -1) return "ontem";
    return d > 0 ? `em ${d} dias` : `${-d} dias atrás`;
  }

  /* ── consultas ─────────────────────────────────────────── */
  function albumOrder() {
    return Object.entries(tracks).sort(([, a], [, b]) => (a.ordem || 0) - (b.ordem || 0) || String(a.titulo).localeCompare(String(b.titulo)));
  }
  function trackNum(id) {
    return albumOrder().findIndex(([tid]) => tid === id) + 1;
  }
  function todosOf(t) { return Array.isArray(t.todos) ? t.todos : []; }
  function nextOrdem() {
    return Object.values(tracks).reduce((mx, t) => Math.max(mx, t.ordem || 0), 0) + 1;
  }
  function msOrder() {
    return Object.entries(milestones).sort(([, a], [, b]) => (a.ordem || 0) - (b.ordem || 0));
  }
  function eventsOnDay(key) {
    return Object.entries(events).filter(([, e]) => e.data === key).sort(([, a], [, b]) => String(a.hora || "").localeCompare(String(b.hora || "")));
  }
  function milestonesOnDay(key) {
    return Object.entries(milestones).filter(([, m]) => m.data === key);
  }
  function trackDoc(id, patch) {
    return { ...tracks[id], ...patch, atualizado: Date.now() };
  }
  async function saveTrack(id, patch, okMsg) {
    if (!tracks[id]) return;
    await write({ tracks: { [id]: trackDoc(id, patch) } });
    if (okMsg) showToast(okMsg);
  }

  /* ── render ────────────────────────────────────────────── */
  /* Se alguém está digitando num campo, a tela só redesenha quando a
     pessoa sai dele — senão a sincronização roubaria o foco. */
  let renderDeferred = false;
  function typing() {
    const a = document.activeElement;
    return a && a.closest && a.closest(".view") && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== "checkbox" && a.type !== "file";
  }
  document.addEventListener("focusout", () => {
    setTimeout(() => { if (renderDeferred && !typing()) { renderDeferred = false; renderAll(); } }, 0);
  });

  function safe(name, fn) {
    try { fn(); } catch (err) { console.error(`render ${name}:`, err); }
  }

  function renderAll(force) {
    rebuild();
    if (!force && typing()) { renderDeferred = true; return; }
    safe("hero", renderHero);
    safe("demos", renderDemos);
    safe("calendar", renderCalendar);
    safe("upcoming", renderUpcoming);
    safe("roadmap", renderRoadmap);
    safe("todo", renderTodo);
    safe("day", () => { if (!dayPanel.hidden && activeDayKey) renderDayItems(); });
    safe("sync", renderSync);
    safe("player", syncPlayerBar);
  }

  function renderSync() {
    const el = document.getElementById("sync-dot");
    el.classList.toggle("is-cloud", cloudReady);
    el.classList.toggle("is-local", !cloudReady);
    el.title = cloudReady ? "Sincronizado na nuvem" : "Salvando neste aparelho";
  }

  function renderHero() {
    const list = Object.values(tracks);
    const el = document.getElementById("hero-progress");
    if (!list.length) { el.innerHTML = ""; return; }
    // progresso: média de quanto cada faixa já andou nas etapas
    const pct = Math.round((list.reduce((s, t) => s + (STAGE_INDEX[t.etapa] || 0), 0) / (list.length * (STAGES.length - 1))) * 100);
    const prontas = list.filter((t) => t.etapa === "pronta").length;
    const abertos = list.reduce((s, t) => s + todosOf(t).filter((x) => !x.feito).length, 0);
    el.innerHTML = `<div class="bar"><span style="width:${pct}%"></span></div>
      <div class="lbl">${pct}% do álbum · ${prontas}/${list.length} faixas prontas · ${abertos} pendência${abertos === 1 ? "" : "s"}</div>`;
  }

  /* ── abas ──────────────────────────────────────────────── */
  function setTab(name) {
    currentTab = name;
    document.body.classList.toggle("is-home", !name);
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === name));
    document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== `view-${name}`; });
    if (name) {
      try { history.replaceState(null, "", `#${name}`); } catch (err) {}
    } else {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (err) {}
    }
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  document.getElementById("back-btn").addEventListener("click", () => setTab(""));
  document.getElementById("home-btn").addEventListener("click", () => setTab(""));

  /* ══ DEMOS ═════════════════════════════════════════════ */
  const demoList = document.getElementById("demo-list");
  const uploads = {};          // id → % de upload em andamento
  const localUrls = new Map(); // id → blob: URL do áudio guardado no aparelho

  function audioBadge(id, t) {
    if (uploads[id] != null) return `<span data-prog="${esc(id)}">${uploads[id]}%</span>`;
    const a = t.audio;
    if (!a) return "sem áudio";
    const bits = [esc(a.nome || "áudio")];
    if (a.tamanho) bits.push(fmtSize(a.tamanho));
    if (a.local) bits.push("<b>só neste aparelho</b>");
    if (a.link) bits.push(a.origem === "dropbox" ? "Dropbox" : a.origem === "drive" ? "Drive" : "link");
    return bits.join(" · ");
  }

  function renderDemos() {
    const list = albumOrder();
    if (!list.length) {
      demoList.innerHTML = `<li class="empty">Nenhuma faixa ainda. Escreva o nome acima ou escolha os áudios (cada arquivo vira uma faixa).</li>`;
      return;
    }
    demoList.innerHTML = list.map(([id, t], i) => {
      if (t.audio && t.audio.local) preloadLocal(id);
      const can = !!(t.audio && (t.audio.url || localUrls.has(id)));
      const playing = player.id === id && !audio.paused;
      const todos = todosOf(t);
      const open = todos.filter((x) => !x.feito).length;
      return `<li class="demo${player.id === id ? " is-playing" : ""}" data-id="${esc(id)}">
        <span class="demo-num">${i + 1}</span>
        <button class="play-btn" type="button" data-act="play" ${can || (t.audio && t.audio.local) ? "" : "disabled"} aria-label="${playing ? "Pausar" : "Tocar"}">${playing ? "❚❚" : "▶"}</button>
        <div class="demo-main">
          <input class="demo-title" type="text" value="${esc(t.titulo)}" data-act="rename" aria-label="Nome da faixa" />
          <div class="demo-meta">
            <span class="stage" style="--st:${stageVar(t.etapa)}">${esc(STAGE_NAME[t.etapa] || "Demo")}</span>
            <span>${audioBadge(id, t)}</span>
            ${open ? `<span>· ${open} to-do</span>` : ""}
          </div>
        </div>
        <div class="demo-tools">
          <button class="mini" type="button" data-act="up" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
          <button class="mini" type="button" data-act="down" ${i === list.length - 1 ? "disabled" : ""} aria-label="Descer">↓</button>
          <button class="mini" type="button" data-act="upload" title="${t.audio ? "Trocar o áudio" : "Subir áudio"}">${t.audio ? "trocar" : "+ áudio"}</button>
          <button class="mini" type="button" data-act="link" title="Colar link do Google Drive ou Dropbox">🔗</button>
          ${t.audio && t.audio.link ? `<a class="mini" href="${esc(t.audio.link)}" target="_blank" rel="noopener" title="Abrir o original">↗</a>` : ""}
          <button class="mini" type="button" data-act="todo" title="Ver o to-do da faixa">✓</button>
          <button class="mini danger" type="button" data-act="delete" aria-label="Apagar faixa">×</button>
        </div>
      </li>`;
    }).join("");
  }

  async function addTracks(filesArg) {
    const input = document.getElementById("d-titulo");
    const fileInput = document.getElementById("d-file");
    const files = filesArg || Array.from(fileInput.files || []);
    const titulo = input.value.trim();
    if (!files.length && !titulo) { input.focus(); showToast("Escreva o nome da faixa ou escolha um áudio."); return; }
    let ordem = nextOrdem();
    const created = [];
    const changes = {};
    if (!files.length) {
      const id = newId("f");
      changes[id] = { titulo, ordem, etapa: "demo", todos: [], notas: "", criado: Date.now() };
      created.push([id, null]);
    } else {
      files.forEach((file, i) => {
        const id = newId("f");
        const nome = files.length === 1 && titulo ? titulo : fileTitle(file.name);
        changes[id] = { titulo: nome, ordem: ordem + i, etapa: "demo", todos: [], notas: "", criado: Date.now() };
        created.push([id, file]);
      });
    }
    input.value = "";
    fileInput.value = "";
    await write({ tracks: changes });
    showToast(created.length > 1 ? `${created.length} faixas adicionadas.` : "Faixa adicionada.");
    for (const [id, file] of created) if (file) await uploadAudio(id, file);
  }

  async function swapOrder(id, dir) {
    const list = albumOrder();
    const i = list.findIndex(([tid]) => tid === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    // renumera tudo pra não ficar ordem repetida
    const ids = list.map(([tid]) => tid);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const changes = {};
    ids.forEach((tid, k) => { if ((tracks[tid].ordem || 0) !== k + 1) changes[tid] = trackDoc(tid, { ordem: k + 1 }); });
    await write({ tracks: changes });
  }

  async function deleteTrack(id) {
    const t = tracks[id];
    if (!t) return;
    if (!window.confirm(`Apagar a faixa "${t.titulo}"? O áudio e o to-do dela somem também.`)) return;
    if (player.id === id) closePlayer();
    await write({ tracks: { [id]: SEED_TRACKS[id] ? { deleted: true } : null } });
    if (t.audio) removeAudioFile(id, t.audio);
    showToast("Faixa apagada.");
  }

  let uploadTarget = null;
  const audioInput = document.getElementById("audio-input");
  audioInput.addEventListener("change", () => {
    const file = audioInput.files && audioInput.files[0];
    audioInput.value = "";
    if (file && uploadTarget) uploadAudio(uploadTarget, file);
    uploadTarget = null;
  });

  demoList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    const row = e.target.closest("[data-id]");
    if (!btn || !row) return;
    const id = row.dataset.id;
    const act = btn.dataset.act;
    if (act === "play") togglePlay(id);
    else if (act === "up") swapOrder(id, -1);
    else if (act === "down") swapOrder(id, 1);
    else if (act === "upload") { uploadTarget = id; audioInput.click(); }
    else if (act === "link") linkAudio(id);
    else if (act === "delete") deleteTrack(id);
    else if (act === "todo") { openGroups.add(id); saveOpen(); setTab("todo"); renderTodo(); scrollToGroup(id); }
  });
  demoList.addEventListener("change", (e) => {
    if (e.target.dataset.act !== "rename") return;
    const id = e.target.closest("[data-id]").dataset.id;
    const v = e.target.value.trim();
    if (v && tracks[id] && v !== tracks[id].titulo) saveTrack(id, { titulo: v });
    else if (tracks[id]) e.target.value = tracks[id].titulo;
  });
  demoList.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.dataset.act === "rename") e.target.blur();
  });

  document.getElementById("d-save").addEventListener("click", () => addTracks());
  document.getElementById("d-titulo").addEventListener("keydown", (e) => { if (e.key === "Enter") addTracks(); });
  document.getElementById("d-file").addEventListener("change", (e) => { if (e.target.files.length) addTracks(); });

  // arrastar áudios pra aba (computador)
  const demosView = document.getElementById("view-demos");
  demosView.addEventListener("dragover", (e) => { e.preventDefault(); demosView.classList.add("drop-hover"); });
  demosView.addEventListener("dragleave", (e) => { if (!demosView.contains(e.relatedTarget)) demosView.classList.remove("drop-hover"); });
  demosView.addEventListener("drop", (e) => {
    e.preventDefault();
    demosView.classList.remove("drop-hover");
    const files = Array.from(e.dataTransfer.files || []).filter((f) => /^audio\//.test(f.type) || /\.(wav|mp3|aiff?|flac|m4a)$/i.test(f.name));
    if (files.length) addTracks(files);
  });

  /* ── áudio: Firebase Storage, com reserva no aparelho ───── */
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("bc_audio", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbDo(mode, fn) {
    const db2 = await idb();
    return new Promise((res, rej) => {
      const tx = db2.transaction("files", mode);
      const req = fn(tx.objectStore("files"));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
    });
  }

  let storageMod = null;
  async function storage() {
    if (!fbApp || !fbUser) throw new Error("sem nuvem");
    if (!storageMod) storageMod = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js");
    const st = storageMod.getStorage(fbApp);
    st.maxUploadRetryTime = 20000;
    st.maxOperationRetryTime = 20000;
    return { mod: storageMod, st };
  }

  function setProgress(id, pct) {
    uploads[id] = pct;
    const el = document.querySelector(`[data-prog="${CSS.escape(id)}"]`);
    if (el) el.textContent = `${pct}%`;
  }

  async function uploadAudio(id, file) {
    if (!tracks[id]) return;
    if (file.size > MAX_AUDIO) { showToast(`Arquivo grande demais (${fmtSize(file.size)}). Máximo 300 MB — use um link do Drive.`); return; }
    const old = tracks[id].audio;
    setProgress(id, 0);
    renderDemos();
    let a;
    try {
      const { mod, st } = await storage();
      const path = `bc_demos/${id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const task = mod.uploadBytesResumable(mod.ref(st, path), file, { contentType: file.type || "audio/wav" });
      await new Promise((res, rej) => {
        // se nada andar em 25 s, a nuvem não está aceitando: desiste
        let last = 0, stall = setTimeout(() => task.cancel(), 25000);
        task.on("state_changed", (snap) => {
          if (snap.bytesTransferred > last) {
            last = snap.bytesTransferred;
            clearTimeout(stall);
            stall = setTimeout(() => task.cancel(), 60000);
          }
          setProgress(id, Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }, (err) => { clearTimeout(stall); rej(err); }, () => { clearTimeout(stall); res(); });
      });
      a = { url: await mod.getDownloadURL(task.snapshot.ref), path, nome: file.name, tamanho: file.size };
    } catch (err) {
      const code = (err && (err.code || err.message)) || "";
      console.warn("Storage indisponível, guardando no aparelho:", code);
      const motivo = /unauthorized/.test(code) ? "as regras do Storage ainda não liberam"
        : /sem nuvem/.test(code) ? "sem conexão com a nuvem"
        : "o Storage da nuvem não respondeu";
      try {
        await idbDo("readwrite", (os) => os.put(file, id));
        a = { local: true, nome: file.name, tamanho: file.size };
        if (localUrls.has(id)) URL.revokeObjectURL(localUrls.get(id));
        localUrls.set(id, URL.createObjectURL(file));
        showToast(`Áudio guardado só neste aparelho — ${motivo}. Dá pra usar 🔗 com um link do Drive.`);
      } catch (err2) {
        console.error(err2);
        delete uploads[id];
        renderDemos();
        showToast("Não deu pra guardar o áudio. Tenta um arquivo menor ou um link do Drive.");
        return;
      }
    }
    delete uploads[id];
    if (!tracks[id]) return;
    await saveTrack(id, { audio: a }, a.local ? null : `Áudio salvo (${fmtSize(file.size)}).`);
    if (old && old.path !== a.path) removeAudioFile(id, old, a.local);
  }

  async function removeAudioFile(id, a, keepLocal) {
    try {
      if (a.path) {
        const { mod, st } = await storage();
        await mod.deleteObject(mod.ref(st, a.path));
      }
      if (a.local && !keepLocal) {
        await idbDo("readwrite", (os) => os.delete(id));
        if (localUrls.has(id)) { URL.revokeObjectURL(localUrls.get(id)); localUrls.delete(id); }
      }
    } catch (err) {
      console.warn("não deu pra apagar o áudio antigo", err);
    }
  }

  /* Áudio do aparelho vira blob: URL antes do toque — o Safari do iPhone
     só deixa tocar se o play acontece direto no toque. */
  const loadingLocal = new Set();
  function preloadLocal(id) {
    if (localUrls.has(id) || loadingLocal.has(id)) return;
    loadingLocal.add(id);
    idbDo("readonly", (os) => os.get(id)).then((blob) => {
      if (!blob) return;
      localUrls.set(id, URL.createObjectURL(blob));
      renderDemos();
    }).catch(() => {}).finally(() => loadingLocal.delete(id));
  }

  /* Link do Google Drive / Dropbox no lugar do upload. No Drive o arquivo
     precisa estar em "Qualquer pessoa com o link"; acima de ~100 MB o
     Drive mostra um aviso antes do download e não toca aqui. */
  function audioFromLink(raw) {
    const link = raw.trim();
    let u;
    try { u = new URL(link); } catch (err) { return null; }
    const host = u.hostname.replace(/^www\./, "");
    if (/(^|\.)drive\.google\.com$/.test(host) || host === "docs.google.com") {
      const m = u.pathname.match(/\/d\/([\w-]{10,})/) || [null, u.searchParams.get("id")];
      if (!m[1]) return null;
      return { url: `https://drive.google.com/uc?export=download&id=${m[1]}`, link, nome: "Google Drive", origem: "drive" };
    }
    if (/(^|\.)dropbox\.com$/.test(host)) {
      u.searchParams.delete("dl");
      u.searchParams.set("raw", "1");
      return { url: u.toString(), link, nome: decodeURIComponent(u.pathname.split("/").pop() || "Dropbox"), origem: "dropbox" };
    }
    if (/\.(wav|aiff?|mp3|flac|m4a|ogg)(\?|$)/i.test(u.pathname)) {
      return { url: link, link, nome: decodeURIComponent(u.pathname.split("/").pop()), origem: "link" };
    }
    return null;
  }

  async function linkAudio(id) {
    const t = tracks[id];
    if (!t) return;
    const raw = window.prompt(`Cole o link do áudio de "${t.titulo}" (Google Drive ou Dropbox).\nNo Drive, compartilhe como "Qualquer pessoa com o link".`, (t.audio && t.audio.link) || "");
    if (raw == null || !raw.trim()) return;
    const a = audioFromLink(raw);
    if (!a) { showToast("Não reconheci esse link. Use um link de compartilhamento do Google Drive ou do Dropbox."); return; }
    const old = t.audio;
    await saveTrack(id, { audio: a }, "Link salvo. Toque no ▶ pra ouvir.");
    if (old && (old.path || old.local)) removeAudioFile(id, old);
  }

  /* ── player ────────────────────────────────────────────── */
  const audio = new Audio();
  audio.preload = "metadata";
  const player = { id: null };
  const plBar = document.getElementById("player-bar");
  const plToggle = document.getElementById("pl-toggle");
  const plSeek = document.getElementById("pl-seek");
  let seeking = false;

  function srcOf(id) {
    const t = tracks[id];
    if (!t || !t.audio) return "";
    if (t.audio.local) return localUrls.get(id) || "";
    return t.audio.url || "";
  }
  function playable() {
    return albumOrder().filter(([id]) => srcOf(id)).map(([id]) => id);
  }

  function playTrack(id) {
    const src = srcOf(id);
    if (!src) {
      if (tracks[id] && tracks[id].audio && tracks[id].audio.local) showToast("Esse áudio está guardado em outro aparelho.");
      return;
    }
    player.id = id;
    audio.src = src;
    audio.play().catch((err) => {
      console.warn(err);
      showToast("Não deu pra tocar. Se for link do Drive, confira se está em \"Qualquer pessoa com o link\".");
    });
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: tracks[id].titulo, artist: "Bela Ciavatta", album: "álbum · demos" });
      } catch (err) {}
    }
    syncPlayerBar();
    renderDemos();
  }

  function togglePlay(id) {
    if (player.id === id && audio.src) {
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
      return;
    }
    playTrack(id);
  }

  function step(dir) {
    const list = playable();
    if (!list.length) return;
    const i = list.indexOf(player.id);
    const j = i < 0 ? 0 : i + dir;
    if (j < 0) { audio.currentTime = 0; return; }
    if (j >= list.length) { audio.pause(); return; }
    playTrack(list[j]);
  }

  function closePlayer() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    player.id = null;
    syncPlayerBar();
    renderDemos();
  }

  function syncPlayerBar() {
    const t = player.id && tracks[player.id];
    plBar.hidden = !t;
    document.body.classList.toggle("has-player", !!t);
    if (!t) return;
    document.getElementById("pl-title").textContent = `${trackNum(player.id)}. ${t.titulo}`;
    document.getElementById("pl-sub").textContent = `${STAGE_NAME[t.etapa] || "Demo"} · ${(t.audio && t.audio.nome) || ""}`;
    plToggle.textContent = audio.paused ? "▶" : "❚❚";
    plToggle.setAttribute("aria-label", audio.paused ? "Tocar" : "Pausar");
  }

  audio.addEventListener("play", () => { syncPlayerBar(); renderDemos(); });
  audio.addEventListener("pause", () => { syncPlayerBar(); renderDemos(); });
  audio.addEventListener("ended", () => step(1));
  audio.addEventListener("loadedmetadata", () => { document.getElementById("pl-dur").textContent = fmtTime(audio.duration); });
  audio.addEventListener("timeupdate", () => {
    document.getElementById("pl-cur").textContent = fmtTime(audio.currentTime);
    if (!seeking && audio.duration) plSeek.value = Math.round((audio.currentTime / audio.duration) * 1000);
  });
  audio.addEventListener("error", () => {
    if (player.id) showToast("Não deu pra carregar esse áudio.");
  });
  plSeek.addEventListener("input", () => { seeking = true; });
  plSeek.addEventListener("change", () => {
    if (audio.duration) audio.currentTime = (plSeek.value / 1000) * audio.duration;
    seeking = false;
  });
  plToggle.addEventListener("click", () => { if (player.id) togglePlay(player.id); });
  document.getElementById("pl-prev").addEventListener("click", () => {
    if (audio.currentTime > 3) audio.currentTime = 0;
    else step(-1);
  });
  document.getElementById("pl-next").addEventListener("click", () => step(1));
  document.getElementById("pl-close").addEventListener("click", closePlayer);
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
      navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
      navigator.mediaSession.setActionHandler("play", () => audio.play().catch(() => {}));
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    } catch (err) {}
  }

  /* ══ CALENDÁRIO ════════════════════════════════════════ */
  const calGrid = document.getElementById("cal-grid");

  function renderCalendar() {
    const { year, month } = view;
    document.getElementById("month-label").textContent = `${MONTH_NAMES[month - 1]} ${year}`;
    const first = new Date(year, month - 1, 1);
    const start = new Date(year, month - 1, 1 - first.getDay());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (i >= 35 && dt.getMonth() !== month - 1) break;
      const key = keyFromDate(dt);
      const chips = [
        ...milestonesOnDay(key).map(([, m]) => `<span class="cal-chip is-ms${m.status === "feito" ? " is-done" : ""}">◆ ${esc(m.titulo)}</span>`),
        ...eventsOnDay(key).map(([, e]) => `<span class="cal-chip${e.feito ? " is-done" : ""}">${e.hora ? esc(e.hora) + " " : ""}${esc(e.titulo)}</span>`),
      ];
      const more = chips.length > 3 ? `<span class="cal-chip">+${chips.length - 2}</span>` : "";
      cells.push(`<button type="button" class="cal-day${dt.getMonth() !== month - 1 ? " is-out" : ""}${key === todayKey ? " is-today" : ""}" data-day="${key}">
        <span class="cal-num">${dt.getDate()}</span>
        ${chips.length > 3 ? chips.slice(0, 2).join("") + more : chips.join("")}
      </button>`);
    }
    calGrid.innerHTML = cells.join("");
  }

  function shiftMonth(delta) {
    let m = view.month + delta, y = view.year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    view = { year: y, month: m };
    renderCalendar();
  }
  document.getElementById("prev-month").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("next-month").addEventListener("click", () => shiftMonth(1));
  document.getElementById("today-btn").addEventListener("click", () => {
    view = { year: today.getFullYear(), month: today.getMonth() + 1 };
    renderCalendar();
  });
  calGrid.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-day]");
    if (cell) openDay(cell.dataset.day);
  });

  function itemRow(kind, id, x) {
    const dt = dateFromKey(x.data);
    const done = kind === "ms" ? x.status === "feito" : !!x.feito;
    const late = !done && x.data < todayKey;
    const t = x.trackId && tracks[x.trackId];
    const sub = kind === "ms"
      ? `Marco do road map · ${countdown(x.data)}`
      : [EVENT_TYPE_NAME[x.tipo] || "Compromisso", x.hora, t ? `faixa ${trackNum(x.trackId)}. ${t.titulo}` : "", countdown(x.data)].filter(Boolean).join(" · ");
    return `<div class="item${done ? " is-done" : ""}" data-kind="${kind}" data-id="${esc(id)}">
      <div class="item-date">${dt.getDate()}<small>${MONTH_NAMES[dt.getMonth()].slice(0, 3)} · ${WEEKDAY_SHORT[dt.getDay()]}</small></div>
      <button type="button" class="item-main" data-act="open" style="text-align:left">
        <div class="item-title">${esc(x.titulo)}</div>
        <div class="item-sub">${esc(sub)}</div>
      </button>
      ${kind === "ms" ? `<span class="badge is-ms">marco</span>` : `<input type="checkbox" data-act="done" ${done ? "checked" : ""} aria-label="Feito" />`}
      ${late ? `<span class="badge is-late">atrasado</span>` : ""}
    </div>`;
  }

  function renderUpcoming() {
    const all = [
      ...Object.entries(events).filter(([, e]) => e.data).map(([id, e]) => ["ev", id, e, !!e.feito]),
      ...Object.entries(milestones).filter(([, m]) => m.data).map(([id, m]) => ["ms", id, m, m.status === "feito"]),
    ].filter(([, , x, done]) => !done && (x.data >= todayKey || daysBetween(x.data, todayKey) <= 30))
      .sort((a, b) => a[2].data.localeCompare(b[2].data) || String(a[2].hora || "").localeCompare(String(b[2].hora || "")))
      .slice(0, 15);
    const el = document.getElementById("upcoming");
    el.innerHTML = all.length
      ? all.map(([kind, id, x]) => itemRow(kind, id, x)).join("")
      : `<div class="empty">Nada marcado. Toque num dia do calendário pra marcar estúdio, ensaio, entrega...</div>`;
  }

  function onItemsClick(e) {
    const row = e.target.closest("[data-kind]");
    if (!row) return;
    const act = e.target.closest("[data-act]");
    if (!act || act.dataset.act !== "open") return;
    if (row.dataset.kind === "ms") openMilestone(row.dataset.id);
    else { const ev = events[row.dataset.id]; if (ev) openDay(ev.data, row.dataset.id); }
  }
  function onItemsChange(e) {
    if (e.target.dataset.act !== "done") return;
    const row = e.target.closest("[data-kind]");
    const id = row.dataset.id;
    if (!events[id]) return;
    write({ events: { [id]: { ...events[id], feito: e.target.checked } } });
  }
  ["upcoming", "day-items"].forEach((elId) => {
    const el = document.getElementById(elId);
    el.addEventListener("click", onItemsClick);
    el.addEventListener("change", onItemsChange);
  });

  /* ── painel do dia ─────────────────────────────────────── */
  const backdrop = document.getElementById("backdrop");
  const dayPanel = document.getElementById("day-panel");
  const msPanel = document.getElementById("ms-panel");

  function openPanel(panel) {
    [dayPanel, msPanel].forEach((p) => { p.hidden = p !== panel; });
    backdrop.hidden = false;
  }
  function closePanels() {
    dayPanel.hidden = true;
    msPanel.hidden = true;
    backdrop.hidden = true;
    activeDayKey = null;
    activeEventId = null;
    activeMsId = null;
  }
  backdrop.addEventListener("click", closePanels);
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closePanels));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanels(); });

  document.getElementById("e-tipo").innerHTML = EVENT_TYPES.map((t) => `<option value="${t.id}">${esc(t.nome)}</option>`).join("");

  function fillTrackOptions(sel, selected) {
    sel.innerHTML = `<option value="">— nenhuma —</option>` + albumOrder().map(([id, t], i) => `<option value="${esc(id)}">${i + 1}. ${esc(t.titulo)}</option>`).join("");
    sel.value = selected && tracks[selected] ? selected : "";
  }

  function renderDayItems() {
    const key = activeDayKey;
    const rows = [
      ...milestonesOnDay(key).map(([id, m]) => itemRow("ms", id, m)),
      ...eventsOnDay(key).map(([id, ev]) => itemRow("ev", id, ev)),
    ];
    document.getElementById("day-items").innerHTML = rows.join("") || `<div class="hint">Nada marcado nesse dia.</div>`;
  }

  function openDay(key, eventId) {
    activeDayKey = key;
    activeEventId = eventId && events[eventId] ? eventId : null;
    document.getElementById("day-title").textContent = formatBr(key);
    document.getElementById("day-sub").textContent = countdown(key);
    renderDayItems();
    const ev = activeEventId ? events[activeEventId] : null;
    document.getElementById("ev-form-title").textContent = ev ? "Editar compromisso" : "Novo compromisso";
    document.getElementById("e-titulo").value = ev ? ev.titulo : "";
    document.getElementById("e-tipo").value = ev ? ev.tipo || "outro" : "estudio";
    document.getElementById("e-data").value = ev ? ev.data : key;
    document.getElementById("e-hora").value = ev ? ev.hora || "" : "";
    document.getElementById("e-obs").value = ev ? ev.obs || "" : "";
    document.getElementById("e-feito").checked = ev ? !!ev.feito : false;
    fillTrackOptions(document.getElementById("e-track"), ev ? ev.trackId : "");
    document.getElementById("e-delete").hidden = !ev;
    openPanel(dayPanel);
    if (!ev) setTimeout(() => document.getElementById("e-titulo").focus(), 50);
  }

  document.getElementById("e-save").addEventListener("click", async () => {
    const titulo = document.getElementById("e-titulo").value.trim();
    const data = document.getElementById("e-data").value;
    if (!titulo) { showToast("Escreva o que é."); document.getElementById("e-titulo").focus(); return; }
    if (!data) { showToast("Escolha a data."); return; }
    const id = activeEventId || newId("e");
    const entry = {
      ...(events[id] || {}),
      titulo,
      data,
      tipo: document.getElementById("e-tipo").value,
      hora: document.getElementById("e-hora").value,
      trackId: document.getElementById("e-track").value,
      obs: document.getElementById("e-obs").value.trim(),
      feito: document.getElementById("e-feito").checked,
      atualizado: Date.now(),
    };
    await write({ events: { [id]: entry } });
    showToast(activeEventId ? "Compromisso atualizado." : "Compromisso marcado.");
    const [y, m] = data.split("-").map(Number);
    view = { year: y, month: m };
    renderCalendar();
    openDay(data);
  });
  document.getElementById("e-delete").addEventListener("click", async () => {
    if (!activeEventId || !window.confirm("Apagar esse compromisso?")) return;
    const key = activeDayKey;
    await write({ events: { [activeEventId]: null } });
    showToast("Apagado.");
    openDay(key);
  });

  /* ══ ROAD MAP ══════════════════════════════════════════ */
  function renderRoadmap() {
    const list = albumOrder();
    document.getElementById("rm-stages").innerHTML = STAGES.map((s) => {
      const n = list.filter(([, t]) => (t.etapa || "demo") === s.id).length;
      return `<div class="rm-stage" style="--st:var(--st-${s.id})"><b>${n}</b><span>${esc(s.nome)}</span></div>`;
    }).join("");
    document.getElementById("rm-matrix").innerHTML = list.length
      ? list.map(([id, t], i) => {
        const k = STAGE_INDEX[t.etapa] || 0;
        return `<div class="rm-row" title="${esc(STAGE_NAME[t.etapa] || "Demo")}">
          <span class="rm-row-name">${i + 1}. ${esc(t.titulo)}</span>
          <span class="rm-steps" style="--st:${stageVar(t.etapa)}">${STAGES.map((s, j) => `<i class="${j <= k ? "on" : ""}"></i>`).join("")}</span>
        </div>`;
      }).join("")
      : `<div class="empty">As faixas aparecem aqui quando entrarem na aba Demos.</div>`;

    const ms = msOrder();
    document.getElementById("rm-list").innerHTML = ms.map(([id, m], i) => {
      const late = m.data && m.status !== "feito" && m.data < todayKey;
      const sub = [
        m.status === "feito" ? "concluído" : m.status === "andamento" ? "em andamento" : "a fazer",
        m.data ? `${formatBr(m.data)} (${countdown(m.data)})` : "sem prazo",
      ].join(" · ");
      return `<li class="ms is-${esc(m.status || "aberto")}" data-id="${esc(id)}">
        <div class="item">
          <button type="button" class="item-main" data-act="open" style="text-align:left">
            <div class="item-title">${esc(m.titulo)}</div>
            <div class="item-sub">${esc(sub)}</div>
            ${m.obs ? `<div class="item-sub">${esc(m.obs).slice(0, 140)}</div>` : ""}
          </button>
          ${late ? `<span class="badge is-late">atrasado</span>` : ""}
          <span class="ms-move">
            <button class="mini" type="button" data-act="up" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
            <button class="mini" type="button" data-act="down" ${i === ms.length - 1 ? "disabled" : ""} aria-label="Descer">↓</button>
          </span>
        </div>
      </li>`;
    }).join("") || `<li class="empty">Nenhum marco. Adicione abaixo.</li>`;
  }

  async function moveMs(id, dir) {
    const ids = msOrder().map(([mid]) => mid);
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const changes = {};
    ids.forEach((mid, k) => { if ((milestones[mid].ordem || 0) !== k + 1) changes[mid] = { ...milestones[mid], ordem: k + 1 }; });
    await write({ milestones: changes });
  }

  document.getElementById("rm-list").addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]");
    const act = e.target.closest("[data-act]");
    if (!row || !act) return;
    if (act.dataset.act === "open") openMilestone(row.dataset.id);
    else if (act.dataset.act === "up") moveMs(row.dataset.id, -1);
    else if (act.dataset.act === "down") moveMs(row.dataset.id, 1);
  });

  async function addMilestone() {
    const nome = document.getElementById("m-titulo");
    const data = document.getElementById("m-data");
    if (!nome.value.trim()) { nome.focus(); showToast("Escreva o nome do marco."); return; }
    const ordem = Object.values(milestones).reduce((mx, m) => Math.max(mx, m.ordem || 0), 0) + 1;
    await write({ milestones: { [newId("ms")]: { titulo: nome.value.trim(), data: data.value, status: "aberto", obs: "", ordem } } });
    nome.value = "";
    data.value = "";
    showToast("Marco adicionado.");
  }
  document.getElementById("m-add").addEventListener("click", addMilestone);
  document.getElementById("m-titulo").addEventListener("keydown", (e) => { if (e.key === "Enter") addMilestone(); });

  function openMilestone(id) {
    const m = milestones[id];
    if (!m) return;
    activeMsId = id;
    document.getElementById("ms-title").textContent = m.titulo;
    document.getElementById("ms-sub").textContent = m.data ? `${formatBr(m.data)} · ${countdown(m.data)}` : "sem prazo";
    document.getElementById("ms-nome").value = m.titulo;
    document.getElementById("ms-data").value = m.data || "";
    document.getElementById("ms-status").value = m.status || "aberto";
    document.getElementById("ms-obs").value = m.obs || "";
    openPanel(msPanel);
  }
  document.getElementById("ms-save").addEventListener("click", async () => {
    const id = activeMsId;
    if (!id || !milestones[id]) return;
    const titulo = document.getElementById("ms-nome").value.trim() || milestones[id].titulo;
    await write({ milestones: { [id]: {
      ...milestones[id],
      titulo,
      data: document.getElementById("ms-data").value,
      status: document.getElementById("ms-status").value,
      obs: document.getElementById("ms-obs").value.trim(),
      atualizado: Date.now(),
    } } });
    showToast("Marco salvo.");
    closePanels();
  });
  document.getElementById("ms-delete").addEventListener("click", async () => {
    const id = activeMsId;
    if (!id || !window.confirm("Apagar esse marco do road map?")) return;
    // marcos da base precisam do { deleted: true } pra não voltarem
    await write({ milestones: { [id]: SEED_MILESTONES[id] ? { deleted: true } : null } });
    showToast("Marco apagado.");
    closePanels();
  });

  /* ══ TO-DO POR FAIXA ═══════════════════════════════════ */
  const todoList = document.getElementById("todo-list");

  function saveOpen() {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify([...openGroups])); } catch (err) {}
  }

  function renderTodo() {
    const list = albumOrder();
    if (!list.length) {
      todoList.innerHTML = `<div class="empty">Sem faixas ainda. Adicione na aba Demos e o to-do de cada uma aparece aqui.</div>`;
      return;
    }
    todoList.innerHTML = list.map(([id, t], i) => {
      const todos = todosOf(t);
      const done = todos.filter((x) => x.feito).length;
      const shown = todoFilter === "abertos" ? todos.filter((x) => !x.feito) : todos;
      const pct = todos.length ? Math.round((done / todos.length) * 100) : 0;
      const open = openGroups.has(id);
      return `<section class="tgroup${open ? " is-open" : ""}" data-id="${esc(id)}">
        <div class="tgroup-bar" data-act="toggle" role="button" tabindex="0" aria-expanded="${open}">
          <span class="chevron" aria-hidden="true">▾</span>
          <span class="tgroup-name">${i + 1}. ${esc(t.titulo)}</span>
          <span class="stage" style="--st:${stageVar(t.etapa)}">${esc(STAGE_NAME[t.etapa] || "Demo")}</span>
          <span class="tgroup-count">${done}/${todos.length}</span>
        </div>
        <div class="tgroup-progress"><span style="width:${pct}%"></span></div>
        <div class="tgroup-body">
          <div class="tgroup-head">
            <select class="stage-select" data-act="stage" style="--st:${stageVar(t.etapa)}" aria-label="Etapa">
              ${STAGES.map((s) => `<option value="${s.id}" ${s.id === (t.etapa || "demo") ? "selected" : ""}>${esc(s.nome)}</option>`).join("")}
            </select>
            ${srcOf(id) || (t.audio && t.audio.local) ? `<button class="mini" type="button" data-act="play">${player.id === id && !audio.paused ? "❚❚ pausar" : "▶ ouvir"}</button>` : ""}
          </div>
          ${shown.map((x) => `<div class="todo${x.feito ? " is-done" : ""}" data-todo="${esc(x.id)}">
            <input type="checkbox" data-act="check" ${x.feito ? "checked" : ""} aria-label="Feito" />
            <input class="todo-text" type="text" data-act="edit" value="${esc(x.t)}" aria-label="Tarefa" />
            <button class="mini danger" type="button" data-act="del" aria-label="Apagar tarefa">×</button>
          </div>`).join("")}
          ${!shown.length ? `<div class="hint">${todos.length ? "Tudo feito por aqui ✓" : "Nada no to-do dessa faixa."}</div>` : ""}
          <div class="todo-add">
            <input type="text" data-act="new" placeholder="Nova tarefa pra essa faixa" autocomplete="off" aria-label="Nova tarefa" />
            <button class="btn btn-primary btn-small" type="button" data-act="add">+</button>
          </div>
          <textarea class="notes-field" data-act="notes" rows="2" placeholder="Notas da faixa (tom, BPM, quem toca, referências...)">${esc(t.notas || "")}</textarea>
          <div class="tgroup-foot">
            ${todos.length ? "" : `<button class="link-btn" type="button" data-act="template">+ usar checklist padrão</button>`}
            ${todoFilter === "abertos" && done ? `<span class="hint" style="margin:0">${done} feita${done === 1 ? "" : "s"} escondida${done === 1 ? "" : "s"}</span>` : ""}
          </div>
        </div>
      </section>`;
    }).join("");
  }

  function scrollToGroup(id) {
    const el = todoList.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function addTodo(id, input) {
    const text = input.value.trim();
    if (!text || !tracks[id]) { input.focus(); return; }
    input.value = "";
    input.blur();
    saveTrack(id, { todos: [...todosOf(tracks[id]), { id: newId("t"), t: text, feito: false }] });
    setTimeout(() => {
      const again = todoList.querySelector(`[data-id="${CSS.escape(id)}"] [data-act="new"]`);
      if (again) again.focus();
    }, 30);
  }

  todoList.addEventListener("click", (e) => {
    const g = e.target.closest(".tgroup");
    const act = e.target.closest("[data-act]");
    if (!g || !act) return;
    const id = g.dataset.id;
    const a = act.dataset.act;
    if (a === "toggle") {
      if (openGroups.has(id)) openGroups.delete(id); else openGroups.add(id);
      saveOpen();
      g.classList.toggle("is-open");
      act.setAttribute("aria-expanded", g.classList.contains("is-open"));
    } else if (a === "add") addTodo(id, g.querySelector('[data-act="new"]'));
    else if (a === "del") {
      const tid = e.target.closest("[data-todo]").dataset.todo;
      saveTrack(id, { todos: todosOf(tracks[id]).filter((x) => x.id !== tid) });
    } else if (a === "template") {
      saveTrack(id, { todos: TODO_TEMPLATE.map((t) => ({ id: newId("t"), t, feito: false })) }, "Checklist padrão adicionado.");
    } else if (a === "play") togglePlay(id);
  });
  todoList.addEventListener("keydown", (e) => {
    const g = e.target.closest(".tgroup");
    if (!g) return;
    if (e.key === "Enter" && e.target.dataset.act === "new") addTodo(g.dataset.id, e.target);
    else if (e.key === "Enter" && e.target.dataset.act === "edit") e.target.blur();
    else if ((e.key === "Enter" || e.key === " ") && e.target.dataset.act === "toggle") { e.preventDefault(); e.target.click(); }
  });
  todoList.addEventListener("change", (e) => {
    const g = e.target.closest(".tgroup");
    if (!g || !tracks[g.dataset.id]) return;
    const id = g.dataset.id;
    const a = e.target.dataset.act;
    if (a === "check") {
      const tid = e.target.closest("[data-todo]").dataset.todo;
      saveTrack(id, { todos: todosOf(tracks[id]).map((x) => (x.id === tid ? { ...x, feito: e.target.checked } : x)) });
    } else if (a === "edit") {
      const tid = e.target.closest("[data-todo]").dataset.todo;
      const v = e.target.value.trim();
      if (!v) { e.target.value = (todosOf(tracks[id]).find((x) => x.id === tid) || {}).t || ""; return; }
      saveTrack(id, { todos: todosOf(tracks[id]).map((x) => (x.id === tid ? { ...x, t: v } : x)) });
    } else if (a === "stage") {
      saveTrack(id, { etapa: e.target.value }, `Etapa: ${STAGE_NAME[e.target.value]}.`);
    } else if (a === "notes") {
      saveTrack(id, { notas: e.target.value.trim() });
    }
  });

  document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    todoFilter = b.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((x) => x.classList.toggle("is-on", x === b));
    renderTodo();
  }));

  /* ── login ─────────────────────────────────────────────── */
  const loginGate = document.getElementById("login-gate");
  const loginForm = document.getElementById("login-form");
  const loginPassword = document.getElementById("login-password");
  const loginError = document.getElementById("login-error");

  function isUnlocked() {
    try { return localStorage.getItem(UNLOCK_KEY) === "1"; } catch (err) { return false; }
  }

  let started = false;
  function startApp() {
    if (started) return;
    started = true;
    loadLocal();
    renderAll();
    connectFirebase();
    setTimeout(() => { if (!cloudReady) goLocal("timeout"); }, 15000);
  }

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (loginPassword.value.toLowerCase().replace(/\s+/g, "") === APP_PASSWORD) {
      try { localStorage.setItem(UNLOCK_KEY, "1"); } catch (err) {}
      loginGate.hidden = true;
      startApp();
    } else {
      loginError.hidden = false;
      loginPassword.value = "";
      loginPassword.focus();
    }
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    try { localStorage.removeItem(UNLOCK_KEY); } catch (err) {}
    location.reload();
  });

  /* ── toast ─────────────────────────────────────────────── */
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3200);
  }

  /* ── início ────────────────────────────────────────────── */
  const hashTab = location.hash.replace("#", "");
  setTab(["demos", "calendario", "roadmap", "todo"].includes(hashTab) ? hashTab : "");
  if (isUnlocked()) startApp();
  else {
    loginGate.hidden = false;
    setTimeout(() => loginPassword.focus(), 50);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw-belaciavatta.js").catch(() => {}));
  }
})();
