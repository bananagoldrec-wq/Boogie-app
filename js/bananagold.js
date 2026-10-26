/* banana gold records · séries e lançamentos — lógica do app.
   Mesma base das agendas do Frisson e do Pato: grava no aparelho e
   sincroniza pelo Firestore quando dá. Duas coleções:
   - bg_releases: cada volume de cada série institucional;
   - bg_events:   tarefas da equipe no calendário (master, arte...).
   O catálogo levantado no Bandcamp vem embutido (SEED_RELEASES) e o que
   a equipe edita por cima vira um doc com o mesmo id. Apagar um volume
   grava { deleted: true }, pra ele não voltar da base embutida. */

(() => {
  "use strict";

  /* Mesmo projeto Firebase do Frisson, em coleções separadas (bg_*) —
     veja o README pras regras. */
  const firebaseConfig = {
    apiKey: "AIzaSyBq_x9Mfyv0aT-wblKcbWScUGn1htCg_3g",
    authDomain: "frisson-agenda.firebaseapp.com",
    projectId: "frisson-agenda",
    storageBucket: "frisson-agenda.firebasestorage.app",
    messagingSenderId: "28732138318",
    appId: "1:28732138318:web:67e28575aa1040770f741f",
  };

  // Trava de acesso simples: segura visitante casual, mas não é
  // segurança de verdade — quem ler o código encontra a senha.
  const APP_PASSWORD = "bananagold";
  const UNLOCK_KEY = "bg_unlocked_v1";
  const LOCAL_KEY = "bg_local_v1";
  const TAB_KEY = "bg_tab_v1";

  const BANDCAMP = "https://bananagoldrecords.bandcamp.com";
  const SOUNDCLOUD = "https://soundcloud.com/bananagoldrecords";

  const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  /* ── séries institucionais ─────────────────────────────── */
  const SERIES = [
    { id: "groovy", nome: "Groovy Tools", sigla: "GRV", cor: "#ff8a3d" },
    { id: "carna", nome: "Carna Tools", sigla: "CRN", cor: "#ff4fa3" },
    { id: "jacuzzi", nome: "Jacuzzi Edits", sigla: "JCZ", cor: "#3fc6ff" },
    { id: "gangue", nome: "Gangue do Sorriso", sigla: "GDS", cor: "#ffd400" },
    { id: "baile", nome: "Baile Tools", sigla: "BLT", cor: "#b07cff" },
    { id: "selector", nome: "Selector Tools", sigla: "SLT", cor: "#ffffff" },
    { id: "tributos", nome: "Tributos", sigla: "TRB", cor: "#ff5a36" },
  ];
  const SERIES_BY_ID = Object.fromEntries(SERIES.map((s) => [s.id, s]));

  const STATUS = [
    { id: "planejado", nome: "Planejado" },
    { id: "producao", nome: "Em produção" },
    { id: "agendado", nome: "Agendado" },
    { id: "lancado", nome: "Lançado" },
  ];
  const STATUS_NAME = Object.fromEntries(STATUS.map((s) => [s.id, s.nome]));

  const CHECKLIST = [
    { id: "master", nome: "Master final" },
    { id: "arte", nome: "Capa / arte" },
    { id: "metadados", nome: "Metadados, ISRC e créditos" },
    { id: "bandcamp", nome: "Upload no Bandcamp" },
    { id: "distribuicao", nome: "Distribuidora (Spotify, Beatport...)" },
    { id: "press", nome: "Press release" },
    { id: "divulgacao", nome: "Posts e teaser" },
  ];

  const TASK_TYPES = [
    { id: "master", nome: "Master" },
    { id: "arte", nome: "Arte" },
    { id: "metadados", nome: "Metadados" },
    { id: "upload", nome: "Upload / distribuição" },
    { id: "divulgacao", nome: "Divulgação" },
    { id: "reuniao", nome: "Reunião" },
    { id: "outro", nome: "Outro" },
  ];
  const TASK_TYPE_NAME = Object.fromEntries(TASK_TYPES.map((t) => [t.id, t.nome]));

  /* "Gerar cronograma": tarefas contando pra trás da data de lançamento.
     O id é fixo por lançamento + etapa, então gerar de novo atualiza as
     datas em vez de duplicar (e mantém o que já foi marcado como feito). */
  const PLAN_STEPS = [
    { id: "master", dias: -28, tipo: "master", titulo: "Entregar master" },
    { id: "arte", dias: -21, tipo: "arte", titulo: "Fechar capa / arte" },
    { id: "metadados", dias: -18, tipo: "metadados", titulo: "Metadados, ISRC e créditos" },
    { id: "upload", dias: -14, tipo: "upload", titulo: "Subir no Bandcamp e na distribuidora" },
    { id: "press", dias: -10, tipo: "divulgacao", titulo: "Press release pronto" },
    { id: "teaser", dias: -7, tipo: "divulgacao", titulo: "Teaser nas redes" },
    { id: "posts", dias: 0, tipo: "divulgacao", titulo: "Posts do lançamento" },
  ];

  /* ── catálogo levantado no Bandcamp (out/2026) ─────────────
     Data com dia = confirmada na página do lançamento. dataMes = o
     Bandcamp só mostrou mês/ano na discografia; a equipe confere o dia.
     Volumes sem data = previstos na série, ainda não achados no Bandcamp. */
  function seed(serie, vol, extra) {
    return {
      serie, vol,
      titulo: "", artistas: "", status: "planejado", formato: "EP",
      data: "", dataMes: false, responsavel: "",
      bandcamp: "", soundcloud: "", faixas: "", obs: "",
      checklist: {}, fonte: "",
      ...extra,
    };
  }
  const ALL_DONE = Object.fromEntries(CHECKLIST.map((c) => [c.id, true]));
  const SEED_LIST = [
    seed("groovy", 1, {
      titulo: "Groovy Tools Vol. 01", status: "lancado", data: "2026-01-01", dataMes: true,
      soundcloud: `${SOUNDCLOUD}/sets/groovy-tools-vol-01`, checklist: ALL_DONE,
      fonte: "Bandcamp: discografia do selo lista \"Jan 2026\" (sem dia).",
    }),
    seed("groovy", 2), seed("groovy", 3), seed("groovy", 4),

    seed("carna", 1, {
      titulo: "Carnatools Vol. 01", artistas: "Gaspar Muniz & BENO", status: "lancado",
      data: "2026-02-01", dataMes: true, soundcloud: `${SOUNDCLOUD}/sets/carnatools-vol-1`, checklist: ALL_DONE,
      obs: "4 edits pro calor do Carnaval, entre house e disco.",
      fonte: "Bandcamp: discografia do selo lista \"Feb 2026\" (sem dia).",
    }),
    seed("carna", 2), seed("carna", 3), seed("carna", 4),

    seed("jacuzzi", 1, {
      titulo: "Jacuzzi Edits (EP)", status: "lancado", data: "2025-05-09",
      bandcamp: `${BANDCAMP}/album/jacuzzi-edits-ep`, soundcloud: `${SOUNDCLOUD}/sets/jacuzzi-edits`, checklist: ALL_DONE,
      fonte: "Bandcamp: released May 9, 2025.",
    }),
    seed("jacuzzi", 2),

    seed("gangue", 1, {
      titulo: "Gangue do Sorriso", formato: "Compilação", status: "lancado", data: "2023-03-24",
      artistas: "Bernardo Pinheiro, Lipelis, Tom Noble, Golden Kong, Gaspar Muniz e outros",
      bandcamp: `${BANDCAMP}/album/gangue-do-sorriso`, checklist: ALL_DONE,
      obs: "Primeiro lançamento do selo. 10 faixas: Miami bass, electro, house, italo e baile funk.",
      fonte: "Bandcamp: released March 24, 2023.",
    }),
    seed("gangue", 2, {
      titulo: "Gangue do Sorriso Vol. 02", formato: "Compilação", status: "lancado",
      data: "2025-06-01", dataMes: true, checklist: ALL_DONE,
      fonte: "Bandcamp: discografia do selo lista \"Jun 2025\" (sem dia).",
    }),
    seed("gangue", 3), seed("gangue", 4),

    seed("baile", 1, {
      titulo: "BAILE TOOLS [001]", artistas: "Gaspar Muniz & BENO", status: "lancado", data: "2024-02-10",
      bandcamp: `${BANDCAMP}/album/baile-tools-001`, checklist: ALL_DONE,
      faixas: "Rhythm of the Baile (Banana Gold Edit)\nDeixa os Garoto Brink (Banana Gold Edit)\nPump Up the Bass (Banana Gold Edit)\nCowboy Re-Volt (Banana Gold Edit)",
      fonte: "Bandcamp: released February 10, 2024.",
    }),
    seed("baile", 2, {
      titulo: "BAILE TOOLS [002]", artistas: "Gaspar Muniz & BENO", status: "lancado", data: "2025-02-28",
      bandcamp: `${BANDCAMP}/album/baile-tools-002`, checklist: ALL_DONE,
      faixas: "O Baile Ready (Banana Gold Edit)\nPlanet Baile (Banana Gold Edit)\nShort D. (Banana Gold Edit)\nEverybody Dance Now (Banana Gold Edit)",
      fonte: "Bandcamp: released February 28, 2025.",
    }),
    seed("baile", 3, {
      titulo: "BAILE TOOLS [003]", status: "lancado", data: "2026-03-10",
      bandcamp: `${BANDCAMP}/album/baile-tools-003`, soundcloud: `${SOUNDCLOUD}/sets/baile-tools-003`, checklist: ALL_DONE,
      faixas: "Parado no Bailão (Banana Gold Mix)\nRoof On Faya! (Banana Gold ft. PEBO Mix)\nVolt das Arábia (Banana Gold ft. PEBO Mix)\nDance On The Chão (Banana Gold Mix)",
      fonte: "Bandcamp: released March 10, 2026.",
    }),
    seed("baile", 4),

    seed("selector", 1), seed("selector", 2), seed("selector", 3),

    seed("tributos", 1, {
      titulo: "Roy Ayers Tribute", artistas: "Banana Gold & Coco Discos", status: "lancado", data: "2025-04-18",
      bandcamp: `${BANDCAMP}/album/roy-ayers-tribute`, soundcloud: `${SOUNDCLOUD}/sets/roy-ayers-tribute`, checklist: ALL_DONE,
      faixas: "Hey Uh What You Say Come On (Disco House Mix) — Coco Discos & Banana Gold\nLove Will Bring Us Back Together (Banana Gold House Mix)",
      obs: "Pequeno tributo à lenda do jazz-funk e do neo-soul.",
      fonte: "Bandcamp: released April 18, 2025.",
    }),
  ];
  const SEED_RELEASES = Object.fromEntries(SEED_LIST.map((r) => [seedId(r.serie, r.vol), r]));

  function seedId(serie, vol) { return `${serie}-${pad2(vol)}`; }

  /* ── state ─────────────────────────────────────────────── */
  const today = new Date();
  const todayKey = keyFromDate(today);
  let view = { year: today.getFullYear(), month: today.getMonth() + 1 };
  let stored = { releases: {}, events: {} };   // o que está na nuvem/aparelho
  let pending = { releases: {}, events: {} };  // gravado sem nuvem, a subir
  let releases = {};                           // efetivo = base + stored
  let activeReleaseId = null;
  let activeDayKey = null;
  let activeTaskId = null;

  function rebuildReleases() {
    const next = {};
    Object.entries(SEED_RELEASES).forEach(([id, r]) => { next[id] = { ...r }; });
    Object.entries(stored.releases).forEach(([id, r]) => {
      if (!r || r.deleted) delete next[id];
      else next[id] = { ...(next[id] || {}), ...r };
    });
    releases = next;
  }

  /* ── armazenamento: nuvem com reserva no aparelho ───────── */
  let db, cols = {}, doc, onSnapshot, writeBatch;
  let cloudReady = false;
  let warnedLocal = false;

  function loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
      if (!raw) return;
      stored = { releases: {}, events: {}, ...(raw.stored || {}) };
      pending = { releases: {}, events: {}, ...(raw.pending || {}) };
    } catch (err) {}
  }

  function saveLocal() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ stored, pending }));
    } catch (err) {}
  }

  function hasPending() {
    return Object.keys(pending.releases).length || Object.keys(pending.events).length;
  }

  /* changes: { releases?: {id: doc|null}, events?: {id: doc|null} } —
     null apaga. Na nuvem vai num writeBatch só. */
  async function write(changes) {
    if (cloudReady) {
      const batch = writeBatch(db);
      Object.entries(changes).forEach(([col, items]) => {
        Object.entries(items).forEach(([id, entry]) => {
          if (entry) batch.set(doc(cols[col], id), entry);
          else batch.delete(doc(cols[col], id));
        });
      });
      await batch.commit();
      return "cloud";
    }
    Object.entries(changes).forEach(([col, items]) => {
      Object.entries(items).forEach(([id, entry]) => {
        if (entry) stored[col][id] = entry;
        else delete stored[col][id];
        pending[col][id] = entry;
      });
    });
    saveLocal();
    renderAll();
    if (!warnedLocal) {
      warnedLocal = true;
      showToast("Salvo neste aparelho — sobe pra nuvem quando a conexão voltar.");
      return "local-warned";
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
      const n = Object.keys(pending.releases).length + Object.keys(pending.events).length;
      pending = { releases: {}, events: {} };
      saveLocal();
      showToast(`${n} alteração(ões) feitas offline enviadas pra nuvem.`);
    } catch (err) {
      console.error(err);
    }
  }

  function goLocal(reason) {
    cloudReady = false;
    if (reason) console.warn("Banana Gold em modo local:", reason);
    if (!warnedLocal) {
      warnedLocal = true;
      showToast("Sem nuvem agora — tudo segue salvo neste aparelho.");
    }
  }

  function startSync() {
    let firstSnaps = 0;
    ["releases", "events"].forEach((col) => {
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
          if (++firstSnaps === 2) {
            cloudReady = true;
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

      const fbApp = appMod.initializeApp(firebaseConfig);
      const auth = authMod.getAuth(fbApp);
      db = fsMod.getFirestore(fbApp);
      cols = {
        releases: fsMod.collection(db, "bg_releases"),
        events: fsMod.collection(db, "bg_events"),
      };

      authMod.signInAnonymously(auth).catch((err) => goLocal(err && err.code));
      let started = false;
      authMod.onAuthStateChanged(auth, (user) => {
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
  function addDaysKey(key, delta) {
    const dt = dateFromKey(key);
    dt.setDate(dt.getDate() + delta);
    return keyFromDate(dt);
  }
  function daysBetween(fromKey, toKey) {
    return Math.round((dateFromKey(toKey) - dateFromKey(fromKey)) / 86400000);
  }
  function formatBr(key) {
    const [y, m, d] = key.split("-");
    return `${d}/${m}/${y}`;
  }
  function formatRelease(r) {
    if (!r.data) return "sem data";
    const [y, m] = r.data.split("-").map(Number);
    if (r.dataMes) return `${MONTH_NAMES[m - 1].slice(0, 3)}/${y} · dia a confirmar`;
    return `${formatBr(r.data)} (${WEEKDAY_NAMES[dateFromKey(r.data).getDay()]})`;
  }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function releaseLabel(r) {
    const s = SERIES_BY_ID[r.serie];
    return `${s ? s.nome : r.serie} Vol. ${pad2(r.vol)}`;
  }
  function newId(prefix) {
    return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }
  function checklistDone(r) {
    return CHECKLIST.filter((c) => r.checklist && r.checklist[c.id]).length;
  }
  function seriesColor(serie) {
    return (SERIES_BY_ID[serie] || {}).cor || "#ffffff";
  }

  /* ── feriados nacionais + Rio ──────────────────────────── */
  function easterSunday(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return dateKey(year, month, day);
  }
  const holidayCache = {};
  function holidaysForYear(year) {
    if (holidayCache[year]) return holidayCache[year];
    const easter = easterSunday(year);
    const map = {
      [dateKey(year, 1, 1)]: "Ano Novo",
      [dateKey(year, 1, 20)]: "São Sebastião",
      [dateKey(year, 4, 21)]: "Tiradentes",
      [dateKey(year, 4, 23)]: "São Jorge",
      [dateKey(year, 5, 1)]: "Dia do Trabalho",
      [dateKey(year, 9, 7)]: "Independência",
      [dateKey(year, 10, 12)]: "Nossa Sra. Aparecida",
      [dateKey(year, 11, 2)]: "Finados",
      [dateKey(year, 11, 15)]: "República",
      [dateKey(year, 11, 20)]: "Consciência Negra",
      [dateKey(year, 12, 25)]: "Natal",
      [addDaysKey(easter, -48)]: "Carnaval",
      [addDaysKey(easter, -47)]: "Carnaval",
      [addDaysKey(easter, -2)]: "Sexta-feira Santa",
      [addDaysKey(easter, 60)]: "Corpus Christi",
    };
    holidayCache[year] = map;
    return map;
  }
  function getHoliday(key) { return holidaysForYear(Number(key.slice(0, 4)))[key]; }

  /* ── consultas ─────────────────────────────────────────── */
  function releasesOnDay(key) {
    return Object.entries(releases).filter(([, r]) => r.data === key && !r.dataMes);
  }
  function releasesLooseInMonth(y, m) {
    const prefix = `${y}-${pad2(m)}`;
    return Object.entries(releases).filter(([, r]) => r.dataMes && r.data && r.data.startsWith(prefix));
  }
  function eventsOnDay(key) {
    return Object.entries(stored.events).filter(([, e]) => e && e.data === key);
  }
  function seriesReleases(serie) {
    return Object.entries(releases).filter(([, r]) => r.serie === serie).sort((a, b) => a[1].vol - b[1].vol);
  }
  function people() {
    const set = new Set();
    Object.values(releases).forEach((r) => r.responsavel && set.add(r.responsavel.trim()));
    Object.values(stored.events).forEach((e) => e && e.responsavel && set.add(e.responsavel.trim()));
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  /* ── render: séries ────────────────────────────────────── */
  const seriesListEl = document.getElementById("series-list");
  const statsEl = document.getElementById("stats");

  function renderStats() {
    const all = Object.values(releases);
    const count = (st) => all.filter((r) => r.status === st).length;
    const upcoming = Object.entries(releases)
      .filter(([, r]) => r.data && r.data >= todayKey && r.status !== "lancado")
      .sort((a, b) => a[1].data.localeCompare(b[1].data))[0];
    statsEl.innerHTML = `
      <div class="stat"><b>${count("lancado")}</b><span>lançados</span></div>
      <div class="stat"><b>${count("agendado")}</b><span>agendados</span></div>
      <div class="stat"><b>${count("producao")}</b><span>em produção</span></div>
      <div class="stat"><b>${count("planejado")}</b><span>planejados</span></div>
      <div class="stat stat-wide">${upcoming
        ? `<span>próximo</span><b class="stat-next">${esc(releaseLabel(upcoming[1]))}</b><span>${esc(formatRelease(upcoming[1]))}</span>`
        : `<span>próximo</span><b class="stat-next">nada agendado</b><span>marca uma data num volume</span>`}</div>`;
  }

  function renderSeries() {
    seriesListEl.innerHTML = SERIES.map((s) => {
      const list = seriesReleases(s.id);
      const lancados = list.filter(([, r]) => r.status === "lancado").length;
      return `
      <section class="series" style="--serie:${s.cor}">
        <header class="series-head">
          <h2>${esc(s.nome)}</h2>
          <span class="series-count">${lancados}/${list.length} lançados</span>
          <button class="btn btn-small btn-dark" type="button" data-add-vol="${s.id}">+ Vol.</button>
        </header>
        <div class="vol-row">
          ${list.map(([id, r]) => volCard(id, r)).join("") || `<p class="empty">Nenhum volume ainda.</p>`}
        </div>
      </section>`;
    }).join("");
  }

  function volCard(id, r) {
    const done = checklistDone(r);
    return `
      <button class="vol-card status-${r.status}" type="button" data-release="${esc(id)}">
        <span class="vol-num">VOL. ${pad2(r.vol)}</span>
        <span class="vol-title">${esc(r.titulo || "título a definir")}</span>
        <span class="vol-date${r.dataMes ? " is-approx" : ""}">${esc(formatRelease(r))}</span>
        <span class="vol-foot">
          <span class="chip chip-${r.status}">${STATUS_NAME[r.status] || r.status}</span>
          ${r.bandcamp ? `<span class="mini" title="Tem link do Bandcamp">bc</span>` : ""}
        </span>
        <span class="progress" title="Checklist ${done}/${CHECKLIST.length}"><i style="width:${(done / CHECKLIST.length) * 100}%"></i></span>
      </button>`;
  }

  seriesListEl.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-vol]");
    if (add) return openNewRelease(add.dataset.addVol);
    const card = e.target.closest("[data-release]");
    if (card) openRelease(card.dataset.release);
  });

  /* ── render: calendário ────────────────────────────────── */
  const calGrid = document.getElementById("cal-grid");
  const monthLabel = document.getElementById("month-label");
  const monthLoose = document.getElementById("month-loose");

  function renderCalendar() {
    const { year, month } = view;
    monthLabel.textContent = `${MONTH_NAMES[month - 1]} ${year}`;

    const loose = releasesLooseInMonth(year, month);
    monthLoose.hidden = !loose.length;
    monthLoose.innerHTML = loose.length
      ? `<span class="loose-label">Neste mês, dia a confirmar:</span>` +
        loose.map(([id, r]) => `<button class="pill" type="button" data-release="${esc(id)}" style="--serie:${seriesColor(r.serie)}">${esc(releaseLabel(r))}</button>`).join("")
      : "";

    const first = new Date(year, month - 1, 1).getDay();
    const days = new Date(year, month, 0).getDate();
    let html = "";
    for (let i = 0; i < first; i++) html += `<div class="cal-cell is-blank"></div>`;
    for (let d = 1; d <= days; d++) {
      const key = dateKey(year, month, d);
      const wd = (first + d - 1) % 7;
      const holiday = getHoliday(key);
      const rel = releasesOnDay(key);
      const evs = eventsOnDay(key).sort((a, b) => (a[1].feito ? 1 : 0) - (b[1].feito ? 1 : 0));
      const cls = ["cal-cell"];
      if (wd === 5) cls.push("is-friday");
      if (holiday) cls.push("is-holiday");
      if (key === todayKey) cls.push("is-today");
      if (rel.length) cls.push("has-release");
      const items = [
        ...rel.map(([, r]) => `<span class="ev ev-release" style="--serie:${seriesColor(r.serie)}">${esc(SERIES_BY_ID[r.serie] ? SERIES_BY_ID[r.serie].sigla : "")} ${pad2(r.vol)}</span>`),
        ...evs.slice(0, 3).map(([, e]) => `<span class="ev ev-task${e.feito ? " is-done" : ""}">${esc(e.titulo)}</span>`),
      ];
      if (evs.length > 3) items.push(`<span class="ev ev-more">+${evs.length - 3}</span>`);
      html += `
        <button class="${cls.join(" ")}" type="button" data-day="${key}">
          <span class="cal-num">${d}</span>
          ${holiday ? `<span class="cal-holiday">${esc(holiday)}</span>` : ""}
          <span class="cal-items">${items.join("")}</span>
        </button>`;
    }
    calGrid.innerHTML = html;
  }

  calGrid.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-day]");
    if (cell) openDay(cell.dataset.day);
  });
  monthLoose.addEventListener("click", (e) => {
    const pill = e.target.closest("[data-release]");
    if (pill) openRelease(pill.dataset.release);
  });

  function shiftMonth(delta) {
    let { year, month } = view;
    month += delta;
    if (month < 1) { month = 12; year--; }
    if (month > 12) { month = 1; year++; }
    view = { year, month };
    renderCalendar();
  }
  document.getElementById("prev-month").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("next-month").addEventListener("click", () => shiftMonth(1));
  document.getElementById("today-btn").addEventListener("click", () => {
    view = { year: today.getFullYear(), month: today.getMonth() + 1 };
    renderCalendar();
  });

  let touchX = 0, touchY = 0;
  calGrid.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
  calGrid.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftMonth(dx < 0 ? 1 : -1);
  }, { passive: true });

  /* ── render: próximos ──────────────────────────────────── */
  const nextReleasesEl = document.getElementById("next-releases");
  const nextTasksEl = document.getElementById("next-tasks");
  const onlyOpen = document.getElementById("only-open");
  const filterOwner = document.getElementById("filter-owner");

  function countdown(key) {
    const n = daysBetween(todayKey, key);
    if (n === 0) return "hoje";
    if (n === 1) return "amanhã";
    if (n > 0) return `em ${n} dias`;
    return `${-n} dias atrás`;
  }

  function renderUpcoming() {
    const list = Object.entries(releases)
      .filter(([, r]) => r.status !== "lancado" || (r.data && r.data >= todayKey))
      .sort((a, b) => {
        const da = a[1].data || "9999", dbb = b[1].data || "9999";
        return da.localeCompare(dbb) || a[1].serie.localeCompare(b[1].serie) || a[1].vol - b[1].vol;
      });
    nextReleasesEl.innerHTML = list.map(([id, r]) => {
      const done = checklistDone(r);
      const late = r.data && !r.dataMes && r.data < todayKey && r.status !== "lancado";
      return `
        <button class="row" type="button" data-release="${esc(id)}" style="--serie:${seriesColor(r.serie)}">
          <span class="row-bar"></span>
          <span class="row-main">
            <b>${esc(releaseLabel(r))}</b>
            <span>${esc(r.titulo || "título a definir")}${r.responsavel ? ` · ${esc(r.responsavel)}` : ""}</span>
          </span>
          <span class="row-side">
            <span class="chip chip-${r.status}">${STATUS_NAME[r.status]}</span>
            <span class="${late ? "late" : ""}">${r.data ? esc(r.dataMes ? formatRelease(r) : `${formatBr(r.data)} · ${countdown(r.data)}`) : "sem data"}</span>
            <span class="muted">checklist ${done}/${CHECKLIST.length}</span>
          </span>
        </button>`;
    }).join("") || `<p class="empty">Nada pela frente. Abre uma série e marca a data do próximo volume.</p>`;

    const owners = people();
    const current = filterOwner.value;
    filterOwner.innerHTML = `<option value="">Todo mundo</option>` + owners.map((p) => `<option${p === current ? " selected" : ""}>${esc(p)}</option>`).join("");
    document.getElementById("people").innerHTML = owners.map((p) => `<option value="${esc(p)}"></option>`).join("");

    const tasks = Object.entries(stored.events)
      .filter(([, e]) => e && (!onlyOpen.checked || !e.feito) && (!filterOwner.value || (e.responsavel || "").trim() === filterOwner.value))
      .sort((a, b) => (a[1].data || "").localeCompare(b[1].data || ""));
    nextTasksEl.innerHTML = tasks.map(([id, e]) => taskRow(id, e)).join("") ||
      `<p class="empty">Nenhuma tarefa${onlyOpen.checked ? " em aberto" : ""}. Toque num dia do calendário pra marcar uma.</p>`;
  }

  function taskRow(id, e) {
    const r = e.releaseId && releases[e.releaseId];
    const late = !e.feito && e.data && e.data < todayKey;
    return `
      <div class="row task-row${e.feito ? " is-done" : ""}" style="--serie:${r ? seriesColor(r.serie) : "#000"}">
        <input type="checkbox" class="task-check" data-toggle-task="${esc(id)}" ${e.feito ? "checked" : ""} aria-label="Feito" />
        <button class="row-main" type="button" data-task="${esc(id)}">
          <b>${esc(e.titulo)}</b>
          <span>${esc(TASK_TYPE_NAME[e.tipo] || "Outro")}${r ? ` · ${esc(releaseLabel(r))}` : ""}${e.responsavel ? ` · ${esc(e.responsavel)}` : ""}</span>
        </button>
        <span class="row-side"><span class="${late ? "late" : ""}">${e.data ? `${formatBr(e.data)} · ${countdown(e.data)}` : ""}</span></span>
      </div>`;
  }

  onlyOpen.addEventListener("change", renderUpcoming);
  filterOwner.addEventListener("change", renderUpcoming);

  async function toggleTask(id, feito) {
    const e = stored.events[id];
    if (!e) return;
    try {
      await write({ events: { [id]: { ...e, feito } } });
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar. Tenta de novo.");
    }
  }

  function onListClick(e) {
    const rel = e.target.closest("[data-release]");
    if (rel) return openRelease(rel.dataset.release);
    const task = e.target.closest("[data-task]");
    if (task) {
      const ev = stored.events[task.dataset.task];
      if (ev) openDay(ev.data || todayKey, task.dataset.task);
    }
  }
  function onListChange(e) {
    const box = e.target.closest("[data-toggle-task]");
    if (box) toggleTask(box.dataset.toggleTask, box.checked);
  }
  [nextReleasesEl, nextTasksEl, document.getElementById("day-items")].forEach((el) => {
    el.addEventListener("click", onListClick);
    el.addEventListener("change", onListChange);
  });

  function renderAll() {
    rebuildReleases();
    renderStats();
    renderSeries();
    renderCalendar();
    renderUpcoming();
    if (!dayPanel.hidden && activeDayKey) renderDayItems();
  }

  /* ── abas ──────────────────────────────────────────────── */
  const tabs = document.querySelectorAll(".tab");
  function setTab(name) {
    tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
    ["catalogo", "calendario", "proximos"].forEach((v) => {
      document.getElementById(`view-${v}`).hidden = v !== name;
    });
    try { localStorage.setItem(TAB_KEY, name); } catch (err) {}
  }
  tabs.forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));

  /* ── painéis ───────────────────────────────────────────── */
  const backdrop = document.getElementById("backdrop");
  const releasePanel = document.getElementById("release-panel");
  const dayPanel = document.getElementById("day-panel");

  function openPanel(panel) {
    [releasePanel, dayPanel].forEach((p) => { p.hidden = p !== panel; });
    backdrop.hidden = false;
    panel.querySelector(".panel-body").scrollTop = 0;
  }
  function closePanels() {
    releasePanel.hidden = true;
    dayPanel.hidden = true;
    backdrop.hidden = true;
    activeReleaseId = null;
    activeDayKey = null;
    activeTaskId = null;
  }
  backdrop.addEventListener("click", closePanels);
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closePanels));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanels(); });

  /* ── editor de lançamento ──────────────────────────────── */
  const rSerie = document.getElementById("r-serie");
  const rVol = document.getElementById("r-vol");
  const rTitulo = document.getElementById("r-titulo");
  const rArtistas = document.getElementById("r-artistas");
  const rStatus = document.getElementById("r-status");
  const rFormato = document.getElementById("r-formato");
  const rData = document.getElementById("r-data");
  const rMes = document.getElementById("r-mes");
  const rResp = document.getElementById("r-resp");
  const rBandcamp = document.getElementById("r-bandcamp");
  const rSoundcloud = document.getElementById("r-soundcloud");
  const rFaixas = document.getElementById("r-faixas");
  const rObs = document.getElementById("r-obs");
  const rChecklist = document.getElementById("r-checklist");
  const rSource = document.getElementById("r-source");
  const rDelete = document.getElementById("r-delete");

  rSerie.innerHTML = SERIES.map((s) => `<option value="${s.id}">${esc(s.nome)}</option>`).join("");
  rStatus.innerHTML = STATUS.map((s) => `<option value="${s.id}">${s.nome}</option>`).join("");
  rChecklist.innerHTML = CHECKLIST.map((c) => `<label class="check"><input type="checkbox" data-check="${c.id}" /> ${esc(c.nome)}</label>`).join("");

  function fillRelease(r) {
    rSerie.value = r.serie;
    rVol.value = r.vol;
    rTitulo.value = r.titulo || "";
    rArtistas.value = r.artistas || "";
    rStatus.value = r.status || "planejado";
    rFormato.value = r.formato || "EP";
    rData.value = r.data || "";
    rMes.checked = !!r.dataMes;
    rResp.value = r.responsavel || "";
    rBandcamp.value = r.bandcamp || "";
    rSoundcloud.value = r.soundcloud || "";
    rFaixas.value = r.faixas || "";
    rObs.value = r.obs || "";
    rChecklist.querySelectorAll("[data-check]").forEach((box) => { box.checked = !!(r.checklist && r.checklist[box.dataset.check]); });
    const links = [r.bandcamp && `<a href="${esc(r.bandcamp)}" target="_blank" rel="noopener">abrir no Bandcamp ↗</a>`, r.soundcloud && `<a href="${esc(r.soundcloud)}" target="_blank" rel="noopener">abrir no SoundCloud ↗</a>`].filter(Boolean).join(" · ");
    rSource.innerHTML = [r.fonte && esc(r.fonte), links].filter(Boolean).join("<br>");
    document.getElementById("release-title").textContent = releaseLabel(r);
    document.getElementById("release-sub").textContent = formatRelease(r);
  }

  function openRelease(id) {
    const r = releases[id];
    if (!r) return;
    activeReleaseId = id;
    fillRelease(r);
    rDelete.hidden = false;
    openPanel(releasePanel);
  }

  function openNewRelease(serie, dataKey) {
    const vols = seriesReleases(serie).map(([, r]) => r.vol);
    const vol = vols.length ? Math.max(...vols) + 1 : 1;
    activeReleaseId = null;
    fillRelease(seed(serie, vol, { data: dataKey || "", status: dataKey ? "agendado" : "planejado" }));
    rDelete.hidden = true;
    openPanel(releasePanel);
    rTitulo.focus();
  }

  function readRelease() {
    const checklist = {};
    rChecklist.querySelectorAll("[data-check]").forEach((box) => { if (box.checked) checklist[box.dataset.check] = true; });
    const base = activeReleaseId ? releases[activeReleaseId] : {};
    return {
      ...base,
      serie: rSerie.value,
      vol: Math.max(1, parseInt(rVol.value, 10) || 1),
      titulo: rTitulo.value.trim(),
      artistas: rArtistas.value.trim(),
      status: rStatus.value,
      formato: rFormato.value,
      data: rData.value,
      dataMes: rMes.checked && !!rData.value,
      responsavel: rResp.value.trim(),
      bandcamp: rBandcamp.value.trim(),
      soundcloud: rSoundcloud.value.trim(),
      faixas: rFaixas.value.trim(),
      obs: rObs.value.trim(),
      checklist,
      fonte: base.fonte || "",
    };
  }

  function idForNew(r) {
    const id = seedId(r.serie, r.vol);
    return releases[id] || stored.releases[id] ? newId(r.serie) : id;
  }

  async function saveRelease() {
    const r = readRelease();
    const clash = Object.entries(releases).find(([id, o]) => id !== activeReleaseId && o.serie === r.serie && o.vol === r.vol);
    if (clash && !confirm(`Já existe ${releaseLabel(r)}. Salvar mesmo assim?`)) return null;
    const id = activeReleaseId || idForNew(r);
    try {
      const mode = await write({ releases: { [id]: r } });
      activeReleaseId = id;
      rDelete.hidden = false;
      if (mode !== "local-warned") showToast(`${releaseLabel(r)} salvo.`);
      return id;
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar. Tenta de novo.");
      return null;
    }
  }

  document.getElementById("r-save").addEventListener("click", async () => {
    if (await saveRelease()) closePanels();
  });

  rDelete.addEventListener("click", async () => {
    if (!activeReleaseId) return;
    const r = releases[activeReleaseId];
    if (!confirm(`Apagar ${releaseLabel(r)}? As tarefas ligadas a ele ficam no calendário.`)) return;
    const id = activeReleaseId;
    try {
      await write({ releases: { [id]: SEED_RELEASES[id] ? { deleted: true } : null } });
      showToast("Volume apagado.");
      closePanels();
    } catch (err) {
      console.error(err);
      showToast("Não deu pra apagar. Tenta de novo.");
    }
  });

  document.getElementById("r-plan").addEventListener("click", async () => {
    const r = readRelease();
    if (!r.data || r.dataMes) {
      showToast("Põe o dia exato do lançamento antes de gerar o cronograma.");
      return;
    }
    const id = await saveRelease();
    if (!id) return;
    const events = {};
    PLAN_STEPS.forEach((step) => {
      const evId = `${id}__${step.id}`;
      const prev = stored.events[evId];
      events[evId] = {
        titulo: `${step.titulo} — ${releaseLabel(r)}`,
        tipo: step.tipo,
        data: addDaysKey(r.data, step.dias),
        responsavel: (prev && prev.responsavel) || r.responsavel,
        releaseId: id,
        feito: !!(prev && prev.feito),
        obs: (prev && prev.obs) || "",
      };
    });
    try {
      await write({ events });
      showToast(`Cronograma criado: ${PLAN_STEPS.length} tarefas no calendário.`);
    } catch (err) {
      console.error(err);
      showToast("Não deu pra criar o cronograma. Tenta de novo.");
    }
  });

  /* ── painel do dia + tarefas ───────────────────────────── */
  const dayItems = document.getElementById("day-items");
  const tTitulo = document.getElementById("t-titulo");
  const tTipo = document.getElementById("t-tipo");
  const tData = document.getElementById("t-data");
  const tResp = document.getElementById("t-resp");
  const tRelease = document.getElementById("t-release");
  const tObs = document.getElementById("t-obs");
  const tFeito = document.getElementById("t-feito");
  const tDelete = document.getElementById("t-delete");

  tTipo.innerHTML = TASK_TYPES.map((t) => `<option value="${t.id}">${t.nome}</option>`).join("");

  function fillReleaseOptions(selected) {
    const opts = Object.entries(releases).sort((a, b) =>
      a[1].serie.localeCompare(b[1].serie) || a[1].vol - b[1].vol);
    tRelease.innerHTML = `<option value="">— nenhum —</option>` +
      opts.map(([id, r]) => `<option value="${esc(id)}"${id === selected ? " selected" : ""}>${esc(releaseLabel(r))}</option>`).join("");
  }

  function renderDayItems() {
    const rel = releasesOnDay(activeDayKey);
    const evs = eventsOnDay(activeDayKey);
    dayItems.innerHTML =
      rel.map(([id, r]) => `
        <button class="row" type="button" data-release="${esc(id)}" style="--serie:${seriesColor(r.serie)}">
          <span class="row-bar"></span>
          <span class="row-main"><b>Lançamento · ${esc(releaseLabel(r))}</b><span>${esc(r.titulo || "")}</span></span>
          <span class="row-side"><span class="chip chip-${r.status}">${STATUS_NAME[r.status]}</span></span>
        </button>`).join("") +
      evs.map(([id, e]) => taskRow(id, e)).join("") ||
      `<p class="empty">Nada marcado nesse dia.</p>`;
  }

  function openDay(key, taskId) {
    activeDayKey = key;
    const dt = dateFromKey(key);
    document.getElementById("day-title").textContent = `${WEEKDAY_NAMES[dt.getDay()]}, ${formatBr(key)}`;
    const holiday = getHoliday(key);
    document.getElementById("day-sub").textContent = [holiday, dt.getDay() === 5 ? "sexta: dia bom pra lançar" : ""].filter(Boolean).join(" · ");
    renderDayItems();
    editTask(taskId || null);
    openPanel(dayPanel);
  }

  function editTask(id) {
    activeTaskId = id;
    const e = id ? stored.events[id] : null;
    document.getElementById("task-form-title").textContent = e ? "Editar tarefa" : "Nova tarefa";
    tTitulo.value = e ? e.titulo : "";
    tTipo.value = e ? e.tipo : "outro";
    tData.value = e ? e.data : activeDayKey;
    tResp.value = e ? e.responsavel || "" : "";
    fillReleaseOptions(e ? e.releaseId : "");
    tObs.value = e ? e.obs || "" : "";
    tFeito.checked = !!(e && e.feito);
    tDelete.hidden = !e;
  }

  dayItems.addEventListener("click", (e) => {
    const task = e.target.closest("[data-task]");
    if (task) {
      e.stopPropagation();
      editTask(task.dataset.task);
      tTitulo.focus();
    }
  }, true);

  document.getElementById("t-save").addEventListener("click", async () => {
    const titulo = tTitulo.value.trim();
    if (!titulo) {
      showToast("Escreve o nome da tarefa.");
      tTitulo.focus();
      return;
    }
    const id = activeTaskId || newId("t");
    const entry = {
      titulo,
      tipo: tTipo.value,
      data: tData.value || activeDayKey,
      responsavel: tResp.value.trim(),
      releaseId: tRelease.value,
      feito: tFeito.checked,
      obs: tObs.value.trim(),
    };
    try {
      const mode = await write({ events: { [id]: entry } });
      if (mode !== "local-warned") showToast("Tarefa salva.");
      if (entry.data !== activeDayKey) activeDayKey = entry.data;
      renderDayItems();
      editTask(null);
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar. Tenta de novo.");
    }
  });

  tDelete.addEventListener("click", async () => {
    if (!activeTaskId || !confirm("Apagar essa tarefa?")) return;
    try {
      await write({ events: { [activeTaskId]: null } });
      showToast("Tarefa apagada.");
      renderDayItems();
      editTask(null);
    } catch (err) {
      console.error(err);
      showToast("Não deu pra apagar. Tenta de novo.");
    }
  });

  document.getElementById("t-new-release").addEventListener("click", () => {
    openNewRelease(SERIES[0].id, activeDayKey);
  });

  /* ── exportar ──────────────────────────────────────────── */
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  document.getElementById("export-csv").addEventListener("click", () => {
    const head = ["Série", "Volume", "Título", "Artistas", "Formato", "Status", "Data", "Dia confirmado", "Responsável", "Checklist", "Bandcamp", "SoundCloud", "Observações"];
    const rows = SERIES.flatMap((s) => seriesReleases(s.id).map(([, r]) => [
      s.nome, r.vol, r.titulo, r.artistas, r.formato, STATUS_NAME[r.status], r.data ? formatBr(r.data) : "",
      r.data ? (r.dataMes ? "não" : "sim") : "", r.responsavel, `${checklistDone(r)}/${CHECKLIST.length}`, r.bandcamp, r.soundcloud, r.obs,
    ]));
    const csv = "\ufeff" + [head, ...rows].map((r) => r.map(csvEscape).join(";")).join("\n");
    download("banana-gold-catalogo.csv", csv, "text/csv;charset=utf-8");
  });

  function icsText(s) {
    return String(s ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
  }

  document.getElementById("export-ics").addEventListener("click", () => {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Banana Gold Records//Lancamentos//PT", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Banana Gold · lançamentos"];
    const event = (uid, key, summary, desc) => {
      lines.push("BEGIN:VEVENT", `UID:${uid}@bananagold`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${key.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDaysKey(key, 1).replace(/-/g, "")}`,
        `SUMMARY:${icsText(summary)}`, `DESCRIPTION:${icsText(desc)}`, "END:VEVENT");
    };
    Object.entries(releases).forEach(([id, r]) => {
      if (r.data && !r.dataMes) event(`rel-${id}`, r.data, `🍌 ${releaseLabel(r)}${r.titulo ? ` — ${r.titulo}` : ""}`, [STATUS_NAME[r.status], r.bandcamp].filter(Boolean).join("\n"));
    });
    Object.entries(stored.events).forEach(([id, e]) => {
      if (e && e.data) event(`task-${id}`, e.data, `${e.feito ? "✓ " : ""}${e.titulo}`, [e.responsavel && `Responsável: ${e.responsavel}`, e.obs].filter(Boolean).join("\n"));
    });
    lines.push("END:VCALENDAR");
    download("banana-gold-lancamentos.ics", lines.join("\r\n"), "text/calendar;charset=utf-8");
    showToast("Calendário exportado — abre o arquivo pra importar no Google Agenda.");
  });

  /* ── trava de senha ────────────────────────────────────── */
  const loginGate = document.getElementById("login-gate");
  const loginForm = document.getElementById("login-form");
  const loginPassword = document.getElementById("login-password");
  const loginError = document.getElementById("login-error");

  function isUnlocked() {
    try { return localStorage.getItem(UNLOCK_KEY) === "1"; } catch (err) { return false; }
  }

  function startApp() {
    loadLocal();
    renderAll();
    connectFirebase();
    setTimeout(() => { if (!cloudReady) goLocal("timeout"); }, 15000);
  }

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (loginPassword.value.trim().toLowerCase() === APP_PASSWORD) {
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
    toastTimer = setTimeout(() => (el.hidden = true), 2800);
  }

  /* ── service worker (habilita instalar como app) ──────── */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw-bananagold.js").catch(() => {});
    });
  }

  /* ── init ──────────────────────────────────────────────── */
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved) setTab(saved);
  } catch (err) {}
  rebuildReleases();
  renderCalendar();
  if (isUnlocked()) startApp();
  else {
    loginGate.hidden = false;
    loginPassword.focus();
  }
})();
