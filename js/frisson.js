/* frisson · agenda de djs — lógica do app (sincronizada via Firebase) */

(() => {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyBq_x9Mfyv0aT-wblKcbWScUGn1htCg_3g",
    authDomain: "frisson-agenda.firebaseapp.com",
    projectId: "frisson-agenda",
    storageBucket: "frisson-agenda.firebasestorage.app",
    messagingSenderId: "28732138318",
    appId: "1:28732138318:web:67e28575aa1040770f741f",
  };

  // Carregado sob demanda (import dinâmico) pra nunca travar o resto do
  // app se o CDN do Firebase estiver bloqueado/indisponível na rede do
  // usuário — o calendário sempre desenha, mesmo sem essas variáveis.
  let auth, db, bookingsCol, templatesDocRef, artistsCol;
  let doc, setDoc, deleteDoc, onSnapshot, writeBatch;
  let signInAnonymously, onAuthStateChanged;

  // Trava de acesso simples: uma senha única embutida no app, checada
  // localmente antes de sequer conectar no Firebase. Protege a tela contra
  // visitantes casuais, mas não é segurança de verdade — quem souber ler o
  // código do app encontra a senha, e o banco de dados segue acessível a
  // qualquer sessão anônima autenticada por trás dela.
  const APP_PASSWORD = "231019";
  const UNLOCK_KEY = "frisson_agenda_unlocked_v1";

  const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  const RIDER_URL = "https://bananagoldrec-wq.github.io/Boogie-app/frisson-informacoes-tecnicas.pdf";

  const DEFAULT_TEMPLATES = {
    convite: "Oi {artista}! Aqui é do Frisson 🎶 Queria te chamar pra tocar no dia {data} ({diaSemana}), set de {estilo}. Topa?",
    confirmacao: "Fechado, {artista}! Confirmando sua data no Frisson: {data} ({diaSemana}), set {tipo} ({estilo}). Chega uns 30 min antes. Qualquer coisa me chama por aqui 🙌",
    lembrete: "Oi {artista}, passando pra lembrar do seu set aqui no Frisson dia {data} ({diaSemana})! Nos vemos lá 🎧",
    agradecimento: "Foi ótimo ter você no Frisson dia {data}, {artista}! Obrigado pelo set 🙏 Já quero marcar a próxima.",
    riderTecnico: "Oi {artista}! Segue nosso guia rápido com as informações técnicas do Frisson (equipamento, linha musical, horários e mais): {riderLink}",
  };

  const TEMPLATE_LABELS = {
    convite: "Convite",
    confirmacao: "Confirmação",
    lembrete: "Lembrete",
    agradecimento: "Agradecimento",
    riderTecnico: "Rider técnico",
  };

  /* ── seed: dados reais já lançados na planilha (ago/set 2026) ── */
  const SEED_DATA = {
    "2026-08-05": { artista: "Martha Pinel", tipo: "RADIO", estilo: "Open Format", status: "confirmado" },
    "2026-08-06": { artista: "Rafael Capetini", tipo: "DJ", estilo: "Disco/House/Funk/BR", status: "confirmado" },
    "2026-08-07": { artista: "Facchineti", evento: "After Doce Mara", tipo: "DJ", estilo: "Disco/House/Funk/BR", status: "confirmado" },
    "2026-08-08": { artista: "Mangodjs", evento: "After Doce Mara", tipo: "DJ", estilo: "Disco/House/Funk/BR", status: "confirmado" },
    "2026-08-12": { artista: "Frisson", tipo: "RADIO", estilo: "Disco/House", status: "confirmado" },
    "2026-08-13": { artista: "Gigios", tipo: "DJ", estilo: "Disco/House", status: "confirmado" },
    "2026-08-14": { artista: "Chance", tipo: "DJ", estilo: "Hip-Hop", status: "confirmado" },
    "2026-08-15": { artista: "Man from Rio", tipo: "DJ", estilo: "Disco/House/Funk/BR", status: "confirmado" },
    "2026-08-19": { artista: "Enrico Sarneri", tipo: "RADIO", estilo: "Música Br", status: "confirmado" },
    "2026-08-20": { artista: "So Lyma", tipo: "DJ", estilo: "Disco/House", status: "confirmado" },
    "2026-08-21": { artista: "Nepal", tipo: "DJ", estilo: "Open Format", status: "confirmado" },
    "2026-08-22": { artista: "Elisa Amaral", tipo: "DJ", estilo: "House", status: "confirmado" },
    "2026-08-26": { artista: "Frisson", tipo: "RADIO", estilo: "Open Format", status: "confirmado" },
    "2026-08-27": { artista: "Marecia", tipo: "DJ", estilo: "Disco/House", status: "confirmado" },
    "2026-08-28": { artista: "Marcelinho da Lua", tipo: "DJ", estilo: "Disco/House", status: "confirmado" },
    "2026-08-29": { artista: "Pluma Bea", tipo: "DJ", estilo: "Disco/House/Trip Hop/Groove", status: "confirmado" },
    "2026-09-03": { artista: "Thales", tipo: "DJ", estilo: "", status: "confirmado" },
    "2026-09-04": { artista: "Lets Gabz", tipo: "DJ", estilo: "", status: "confirmado" },
    "2026-09-10": { artista: "Thales", tipo: "DJ", estilo: "", status: "confirmado" },
    "2026-09-11": { artista: "David Talipba", tipo: "DJ", estilo: "", status: "confirmado" },
    "2026-09-17": { artista: "Yas", tipo: "DJ", estilo: "", status: "confirmado" },
    "2026-09-18": { artista: "Leo Janeiro", tipo: "DJ", estilo: "", status: "confirmado" },
    "2026-09-24": { artista: "Lets Gabs", tipo: "DJ", estilo: "", status: "confirmado" },
  };

  /* ── state ─────────────────────────────────────────────── */
  const today = new Date();
  let view = { year: today.getFullYear(), month: today.getMonth() + 1 }; // month 1-12
  let data = {};
  let templates = { ...DEFAULT_TEMPLATES };
  let artists = {};
  let activeDateKey = null;
  let activeTemplateKey = "convite";

  /* ── sync (Firestore) ──────────────────────────────────── */
  let firstBookingsSnapshot = true;
  const LEGACY_STORAGE_KEY = "frisson_agenda_data_v1";

  function startSync() {
    onSnapshot(bookingsCol, (snap) => {
      const next = {};
      snap.forEach((d) => { next[d.id] = d.data(); });
      data = next;
      renderCalendar();
      refreshArtistNames();
      if (firstBookingsSnapshot) {
        firstBookingsSnapshot = false;
        importLegacyLocalData(next).then((hadLegacy) => {
          if (snap.empty && !hadLegacy) seedInitialData();
        });
      }
    }, (err) => {
      console.error(err);
      showToast("Erro ao sincronizar. Verifique sua conexão.");
    });

    onSnapshot(templatesDocRef, (snap) => {
      templates = snap.exists() ? { ...DEFAULT_TEMPLATES, ...snap.data() } : { ...DEFAULT_TEMPLATES };
    }, (err) => console.error(err));

    onSnapshot(artistsCol, (snap) => {
      const next = {};
      snap.forEach((d) => { next[d.id] = d.data(); });
      artists = next;
      refreshArtistNames();
    }, (err) => console.error(err));
  }

  async function seedInitialData() {
    const batch = writeBatch(db);
    Object.entries(SEED_DATA).forEach(([key, entry]) => batch.set(doc(bookingsCol, key), entry));
    try {
      await batch.commit();
    } catch (err) {
      console.error(err);
    }
  }

  /* Recupera escalas salvas neste aparelho de antes da sincronização em
     nuvem (localStorage), sem sobrescrever nada que já esteja na nuvem. */
  async function importLegacyLocalData(existing) {
    let legacy;
    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return false;
      legacy = JSON.parse(raw);
    } catch (err) {
      return false;
    }
    if (!legacy || typeof legacy !== "object") return false;

    const entries = Object.entries(legacy);
    if (!entries.length) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return false;
    }

    const missing = entries.filter(([key]) => !existing[key]);
    if (missing.length) {
      const batch = writeBatch(db);
      missing.forEach(([key, entry]) => batch.set(doc(bookingsCol, key), entry));
      try {
        await batch.commit();
        showToast(`${missing.length} dia(s) da agenda antiga importado(s).`);
      } catch (err) {
        console.error(err);
      }
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return true;
  }

  /* Se a nuvem falhar ou demorar, mostra a agenda conhecida localmente em
     vez de deixar a tela em branco. Edições nesse modo não sincronizam. */
  let connected = false;

  function useOfflineFallback() {
    if (connected || Object.keys(data).length) return;
    data = { ...SEED_DATA };
    renderCalendar();
    refreshArtistNames();
    showToast("Sem conexão com a nuvem — mostrando agenda salva.");
  }

  /* Lista de nomes já usados (diretório de artistas + escalas), pro
     autocompletar do campo Artista. datalist nativo não é confiável no
     Safari do iPhone — a sugestão é desenhada à mão em vez disso. */
  let artistNamesSorted = [];

  function refreshArtistNames() {
    const names = new Set(Object.keys(artists));
    Object.values(data).forEach((e) => { if (e && e.artista) names.add(e.artista); });
    artistNamesSorted = [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  async function connectFirebase() {
    try {
      const [appMod, authMod, fsMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js"),
      ]);

      signInAnonymously = authMod.signInAnonymously;
      onAuthStateChanged = authMod.onAuthStateChanged;
      doc = fsMod.doc;
      setDoc = fsMod.setDoc;
      deleteDoc = fsMod.deleteDoc;
      onSnapshot = fsMod.onSnapshot;
      writeBatch = fsMod.writeBatch;

      const fbApp = appMod.initializeApp(firebaseConfig);
      auth = authMod.getAuth(fbApp);
      db = fsMod.getFirestore(fbApp);
      bookingsCol = fsMod.collection(db, "bookings");
      templatesDocRef = doc(db, "settings", "templates");
      artistsCol = fsMod.collection(db, "artists");

      signInAnonymously(auth).catch((err) => {
        console.error(err);
        useOfflineFallback();
      });

      onAuthStateChanged(auth, (user) => {
        if (user) {
          connected = true;
          startSync();
        }
      });
    } catch (err) {
      console.error("Firebase indisponível:", err);
      useOfflineFallback();
    }
  }

  /* ── trava de senha (local, antes de conectar no Firebase) ──────── */
  function isUnlocked() {
    try {
      return localStorage.getItem(UNLOCK_KEY) === "1";
    } catch (err) {
      return false;
    }
  }

  function unlockApp() {
    try {
      localStorage.setItem(UNLOCK_KEY, "1");
    } catch (err) {}
    hideLoginGate();
    connectFirebase();
    setTimeout(useOfflineFallback, 6000);
  }

  /* ── date helpers ──────────────────────────────────────── */
  function pad2(n) { return String(n).padStart(2, "0"); }
  function dateKey(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function firstWeekday(y, m) { return new Date(y, m - 1, 1).getDay(); }
  function isTodayKey(key) { return key === dateKey(today.getFullYear(), today.getMonth() + 1, today.getDate()); }

  function formatBrDate(key) {
    const [y, m, d] = key.split("-").map(Number);
    return `${pad2(d)}/${pad2(m)}/${y}`;
  }

  function weekdayNameFromKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()];
  }

  /* ── feriados nacionais e do Rio de Janeiro ────────────── */
  function easterSunday(year) {
    // algoritmo de Meeus/Jones/Butcher
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function addDays(dateObj, delta) {
    const d = new Date(dateObj);
    d.setDate(d.getDate() + delta);
    return d;
  }

  function keyFromDate(dateObj) {
    return dateKey(dateObj.getFullYear(), dateObj.getMonth() + 1, dateObj.getDate());
  }

  let holidayCache = {};
  function holidaysForYear(year) {
    if (holidayCache[year]) return holidayCache[year];
    const easter = easterSunday(year);
    const map = {};
    map[dateKey(year, 1, 1)] = "Ano Novo";
    map[dateKey(year, 1, 20)] = "São Sebastião";
    map[dateKey(year, 4, 21)] = "Tiradentes";
    map[dateKey(year, 4, 23)] = "São Jorge";
    map[dateKey(year, 5, 1)] = "Dia do Trabalho";
    map[dateKey(year, 9, 7)] = "Independência";
    map[dateKey(year, 10, 12)] = "Nossa Sra. Aparecida";
    map[dateKey(year, 11, 2)] = "Finados";
    map[dateKey(year, 11, 15)] = "República";
    map[dateKey(year, 11, 20)] = "Consciência Negra";
    map[dateKey(year, 12, 25)] = "Natal";
    map[keyFromDate(addDays(easter, -48))] = "Carnaval";
    map[keyFromDate(addDays(easter, -47))] = "Carnaval";
    map[keyFromDate(addDays(easter, -2))] = "Sexta-feira Santa";
    map[keyFromDate(addDays(easter, 60))] = "Corpus Christi";
    holidayCache[year] = map;
    return map;
  }

  function getHoliday(key) {
    const year = Number(key.slice(0, 4));
    return holidaysForYear(year)[key];
  }

  /* ── arrastar para mover/trocar a data de uma escala ────── */
  async function moveBooking(sourceKey, targetKey) {
    if (!sourceKey || !targetKey || sourceKey === targetKey) return;
    if (!bookingsCol) {
      showToast("Sem conexão com a nuvem. Tenta de novo em instantes.");
      return;
    }
    const sourceEntry = data[sourceKey];
    if (!sourceEntry) return;
    const targetEntry = data[targetKey];
    try {
      if (targetEntry) {
        await Promise.all([
          setDoc(doc(bookingsCol, targetKey), sourceEntry),
          setDoc(doc(bookingsCol, sourceKey), targetEntry),
        ]);
        showToast("Datas trocadas.");
      } else {
        await setDoc(doc(bookingsCol, targetKey), sourceEntry);
        await deleteDoc(doc(bookingsCol, sourceKey));
        showToast("Escala movida.");
      }
    } catch (err) {
      console.error(err);
      showToast("Não deu pra mover. Tenta de novo.");
    }
  }

  /* ── render: calendar ──────────────────────────────────── */
  const calGrid = document.getElementById("cal-grid");
  const monthLabel = document.getElementById("month-label");

  const OPEN_WEEKDAYS = [3, 4, 5, 6]; // quarta a sábado

  function isOperatingDay(key) {
    const [y, m, d] = key.split("-").map(Number);
    return OPEN_WEEKDAYS.includes(new Date(y, m - 1, d).getDay());
  }

  /* Semanas de calendário (dom–sáb) dentro do mês em exibição, pra
     agrupar visualmente e permitir compartilhar semana a semana. */
  function weekRangesForMonth(year, month) {
    const total = daysInMonth(year, month);
    const leading = firstWeekday(year, month);
    const ranges = [];
    for (let day = 1; day <= total; day++) {
      const w = Math.floor((day - 1 + leading) / 7);
      if (!ranges[w]) ranges[w] = { week: w + 1, startDay: day, endDay: day };
      else ranges[w].endDay = day;
    }
    return ranges;
  }

  function buildWeekHeader(range) {
    const header = document.createElement("div");
    header.className = "week-header";

    const label = document.createElement("span");
    label.textContent = `Semana ${range.week}`;
    header.appendChild(label);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "week-share-btn";
    btn.setAttribute("aria-label", `Compartilhar semana ${range.week}`);
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="M8.3 10.5l7.4-4.1M8.3 13.5l7.4 4.1"/></svg>';
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      shareWeek(range);
    });
    header.appendChild(btn);

    return header;
  }

  function renderCalendar() {
    monthLabel.textContent = `${MONTH_NAMES[view.month - 1]} ${view.year}`;
    calGrid.innerHTML = "";

    const leading = firstWeekday(view.year, view.month);
    for (let i = 0; i < leading; i++) {
      const blank = document.createElement("div");
      blank.className = "day-cell is-blank";
      calGrid.appendChild(blank);
    }

    const total = daysInMonth(view.year, view.month);
    const ranges = weekRangesForMonth(view.year, view.month);
    let rangeIdx = 0;

    for (let day = 1; day <= total; day++) {
      if (ranges[rangeIdx] && ranges[rangeIdx].startDay === day) {
        calGrid.appendChild(buildWeekHeader(ranges[rangeIdx]));
        rangeIdx++;
      }
      const key = dateKey(view.year, view.month, day);
      const entry = data[key];
      calGrid.appendChild(buildDayCell(key, day, entry));
    }
  }

  function buildDayCell(key, day, entry) {
    const holidayName = getHoliday(key);

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day-cell"
      + (isTodayKey(key) ? " is-today" : "")
      + (isOperatingDay(key) ? " day-open" : " day-closed")
      + (holidayName ? " is-holiday" : "");
    cell.setAttribute("aria-label", `${day} — abrir escala do dia${holidayName ? ` (${holidayName})` : ""}`);
    if (holidayName) cell.title = holidayName;
    cell.dataset.dateKey = key;

    const meta = document.createElement("div");
    meta.className = "day-meta";
    const num = document.createElement("span");
    num.className = "day-num";
    num.textContent = day;
    const wd = document.createElement("span");
    wd.className = "day-weekday";
    wd.textContent = weekdayNameFromKey(key).slice(0, 3);
    meta.appendChild(num);
    meta.appendChild(wd);
    cell.appendChild(meta);

    if ((entry && entry.artista) || holidayName) {
      const content = document.createElement("div");
      content.className = "day-content";

      if (entry && entry.artista) {
        const artist = document.createElement("div");
        artist.className = "day-artist";
        artist.textContent = entry.artista;
        content.appendChild(artist);
      }

      if ((entry && entry.tipo === "RADIO") || holidayName) {
        const tags = document.createElement("div");
        tags.className = "day-tags";
        if (entry && entry.tipo === "RADIO") {
          const t = document.createElement("span");
          t.className = "tag tag-radio";
          t.textContent = "Rádio";
          tags.appendChild(t);
        }
        if (holidayName) {
          const t = document.createElement("span");
          t.className = "tag tag-holiday";
          t.textContent = holidayName;
          tags.appendChild(t);
        }
        content.appendChild(tags);
      }

      cell.appendChild(content);
    }

    if (entry && entry.status) {
      const dot = document.createElement("span");
      dot.className = `status-dot status-${entry.status}`;
      dot.title = entry.status.charAt(0).toUpperCase() + entry.status.slice(1);
      cell.appendChild(dot);
    }

    cell.addEventListener("click", () => {
      if (suppressNextClick) { suppressNextClick = false; return; }
      openDayPanel(key);
    });

    attachDropTarget(cell, key);
    if (entry && entry.artista) attachDragSource(cell, key);

    return cell;
  }

  /* Trocar de dia: segurar e arrastar um dia com escala pra cima de outro
     — solta em um dia vazio pra mover, ou em um dia ocupado pra trocar
     as duas escalas de lugar. Mouse usa a API nativa de drag; toque usa
     um "long press" próprio, já que iOS/Android não suportam a API nativa. */
  let suppressNextClick = false;
  let touchDrag = null;

  function attachDragSource(cell, key) {
    cell.draggable = true;
    cell.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", key);
      e.dataTransfer.effectAllowed = "move";
      cell.classList.add("drag-source");
    });
    cell.addEventListener("dragend", () => cell.classList.remove("drag-source"));

    cell.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      const startX = e.touches[0].clientX;
      const startY = e.touches[0].clientY;
      let longPressFired = false;

      const timer = setTimeout(() => {
        longPressFired = true;
        startTouchDrag(key, cell, startX, startY);
      }, 380);

      const onMove = (ev) => {
        if (touchDrag) {
          ev.preventDefault();
          ev.stopPropagation();
          updateTouchDrag(ev.touches[0].clientX, ev.touches[0].clientY);
          return;
        }
        const dx = ev.touches[0].clientX - startX;
        const dy = ev.touches[0].clientY - startY;
        if (Math.hypot(dx, dy) > 12) clearTimeout(timer);
      };
      const onEnd = (ev) => {
        clearTimeout(timer);
        cell.removeEventListener("touchmove", onMove);
        cell.removeEventListener("touchend", onEnd);
        cell.removeEventListener("touchcancel", onEnd);
        if (longPressFired) {
          ev.stopPropagation();
          suppressNextClick = true;
          endTouchDrag();
        }
      };
      cell.addEventListener("touchmove", onMove, { passive: false });
      cell.addEventListener("touchend", onEnd);
      cell.addEventListener("touchcancel", onEnd);
    }, { passive: true });
  }

  function attachDropTarget(cell, key) {
    cell.addEventListener("dragover", (e) => {
      e.preventDefault();
      cell.classList.add("drag-over");
    });
    cell.addEventListener("dragleave", () => cell.classList.remove("drag-over"));
    cell.addEventListener("drop", (e) => {
      e.preventDefault();
      cell.classList.remove("drag-over");
      const sourceKey = e.dataTransfer.getData("text/plain");
      if (sourceKey) moveBooking(sourceKey, key);
    });
  }

  function startTouchDrag(key, cell, x, y) {
    const ghost = cell.cloneNode(true);
    ghost.className = "day-cell drag-ghost";
    ghost.style.width = `${cell.offsetWidth}px`;
    ghost.style.height = `${cell.offsetHeight}px`;
    document.body.appendChild(ghost);
    positionGhost(ghost, x, y);
    cell.classList.add("drag-source");
    touchDrag = { key, ghost, sourceCell: cell, currentTarget: null };
  }

  function positionGhost(ghost, x, y) {
    ghost.style.left = `${x - ghost.offsetWidth / 2}px`;
    ghost.style.top = `${y - ghost.offsetHeight / 2}px`;
  }

  function updateTouchDrag(x, y) {
    if (!touchDrag) return;
    positionGhost(touchDrag.ghost, x, y);
    touchDrag.ghost.hidden = true;
    const el = document.elementFromPoint(x, y);
    touchDrag.ghost.hidden = false;
    const targetCell = el && el.closest ? el.closest(".day-cell:not(.is-blank)") : null;
    if (touchDrag.currentTarget && touchDrag.currentTarget !== targetCell) {
      touchDrag.currentTarget.classList.remove("drag-over");
    }
    if (targetCell && targetCell !== touchDrag.sourceCell) {
      targetCell.classList.add("drag-over");
      touchDrag.currentTarget = targetCell;
    } else {
      touchDrag.currentTarget = null;
    }
  }

  function endTouchDrag() {
    if (!touchDrag) return;
    const { key, ghost, sourceCell, currentTarget } = touchDrag;
    ghost.remove();
    sourceCell.classList.remove("drag-source");
    if (currentTarget) {
      currentTarget.classList.remove("drag-over");
      const targetKey = currentTarget.dataset.dateKey;
      if (targetKey) moveBooking(key, targetKey);
    }
    touchDrag = null;
  }

  /* ── month navigation ──────────────────────────────────── */
  function goToPrevMonth() {
    view.month--;
    if (view.month < 1) { view.month = 12; view.year--; }
    renderCalendar();
  }

  function goToNextMonth() {
    view.month++;
    if (view.month > 12) { view.month = 1; view.year++; }
    renderCalendar();
  }

  document.getElementById("prev-month").addEventListener("click", goToPrevMonth);
  document.getElementById("next-month").addEventListener("click", goToNextMonth);

  /* ── swipe to change month (mobile) ─────────────────────── */
  let touchStartX = 0;
  let touchStartY = 0;

  calGrid.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  calGrid.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goToNextMonth();
      else goToPrevMonth();
    }
  }, { passive: true });

  /* ── trava de senha (interface) ─────────────────────────── */
  const loginGate = document.getElementById("login-gate");
  const loginForm = document.getElementById("login-form");
  const loginPassword = document.getElementById("login-password");
  const loginError = document.getElementById("login-error");

  function showLoginGate() {
    loginGate.hidden = false;
    loginPassword.focus();
  }

  function hideLoginGate() {
    loginGate.hidden = true;
    loginError.hidden = true;
    loginPassword.value = "";
  }

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (loginPassword.value === APP_PASSWORD) {
      unlockApp();
    } else {
      loginError.hidden = false;
      loginPassword.value = "";
      loginPassword.focus();
    }
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    try {
      localStorage.removeItem(UNLOCK_KEY);
    } catch (err) {}
    location.reload();
  });

  if (isUnlocked()) {
    connectFirebase();
    setTimeout(useOfflineFallback, 6000);
  } else {
    showLoginGate();
  }

  /* ── day panel ─────────────────────────────────────────── */
  const backdrop = document.getElementById("backdrop");
  const dayPanel = document.getElementById("day-panel");
  const templatesPanel = document.getElementById("templates-panel");
  const panelDate = document.getElementById("panel-date");

  const fArtista = document.getElementById("f-artista");
  const fTipo = document.getElementById("f-tipo");
  const fStatus = document.getElementById("f-status");
  const fEvento = document.getElementById("f-evento");
  const fEstilo = document.getElementById("f-estilo");
  const fTelefone = document.getElementById("f-telefone");
  const fEmail = document.getElementById("f-email");
  const fObs = document.getElementById("f-obs");

  const fBankTitular = document.getElementById("f-bank-titular");
  const fBankDoc = document.getElementById("f-bank-doc");
  const fBankPix = document.getElementById("f-bank-pix");
  const fBankOutros = document.getElementById("f-bank-outros");

  const photoInput = document.getElementById("f-photo-input");
  const photoPreview = document.getElementById("artist-photo-preview");
  const pickPhotoBtn = document.getElementById("pick-photo");
  const sharePhotoBtn = document.getElementById("share-photo");
  const removePhotoBtn = document.getElementById("remove-photo");

  function populateBankFields(artistName) {
    const rec = artists[artistName] || {};
    fBankTitular.value = rec.titular || "";
    fBankDoc.value = rec.documento || "";
    fBankPix.value = rec.pix || "";
    fBankOutros.value = rec.outros || "";
    renderPhotoPreview(rec.foto || "");
  }

  function renderPhotoPreview(dataUri) {
    photoPreview.innerHTML = "";
    if (dataUri) {
      const img = document.createElement("img");
      img.src = dataUri;
      img.alt = "";
      photoPreview.appendChild(img);
      sharePhotoBtn.hidden = false;
      removePhotoBtn.hidden = false;
    } else {
      photoPreview.textContent = "Sem foto";
      sharePhotoBtn.hidden = true;
      removePhotoBtn.hidden = true;
    }
  }

  function fitDimensions(width, height, maxSize) {
    if (width <= maxSize && height <= maxSize) return { width, height };
    if (width > height) return { width: maxSize, height: Math.round(height * (maxSize / width)) };
    return { width: Math.round(width * (maxSize / height)), height: maxSize };
  }

  /* Tenta a maior qualidade possível dentro do limite de tamanho do
     Firestore (~1MB por documento): começa grande/nítido e só reduz
     tamanho/qualidade até caber, em vez de sempre cortar forte. */
  function resizeImageFile(file, maxBytes) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const sizeSteps = [1600, 1200, 960, 720, 640];
        const qualitySteps = [0.9, 0.8, 0.7, 0.6, 0.5];
        let best = null;
        for (const maxSize of sizeSteps) {
          const { width, height } = fitDimensions(img.width, img.height, maxSize);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          for (const q of qualitySteps) {
            best = canvas.toDataURL("image/jpeg", q);
            if (best.length <= maxBytes) break;
          }
          if (best.length <= maxBytes) break;
        }
        resolve(best);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Não foi possível ler a imagem."));
      };
      img.src = url;
    });
  }

  pickPhotoBtn.addEventListener("click", () => photoInput.click());

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files[0];
    photoInput.value = "";
    if (!file) return;
    const name = fArtista.value.trim();
    if (!name) {
      showToast("Digite o nome do artista antes de adicionar a foto.");
      return;
    }
    if (!artistsCol) {
      showToast("Sem conexão com a nuvem. Tenta de novo em instantes.");
      return;
    }
    try {
      const dataUri = await resizeImageFile(file, 900000);
      renderPhotoPreview(dataUri);
      await setDoc(doc(artistsCol, name), { foto: dataUri }, { merge: true });
      showToast("Foto salva.");
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar a foto. Tenta uma imagem menor.");
    }
  });

  removePhotoBtn.addEventListener("click", async () => {
    const name = fArtista.value.trim();
    if (!name || !artistsCol) return;
    try {
      await setDoc(doc(artistsCol, name), { foto: "" }, { merge: true });
      renderPhotoPreview("");
      showToast("Foto removida.");
    } catch (err) {
      console.error(err);
      showToast("Não deu pra remover. Tenta de novo.");
    }
  });

  sharePhotoBtn.addEventListener("click", async () => {
    const name = fArtista.value.trim();
    const foto = (artists[name] || {}).foto;
    if (!foto) return;
    try {
      const blob = await (await fetch(foto)).blob();
      const file = new File([blob], `${name}.jpg`, { type: blob.type || "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return;
      }
    } catch (err) {
      console.error(err);
    }
    const a = document.createElement("a");
    a.href = foto;
    a.download = `${name}.jpg`;
    a.click();
  });

  function openDayPanel(key) {
    activeDateKey = key;
    const entry = data[key] || {};

    panelDate.textContent = `${formatBrDate(key)} — ${weekdayNameFromKey(key)}`;
    fArtista.value = entry.artista || "";
    fTipo.value = entry.tipo || "DJ";
    fStatus.value = entry.status || "pendente";
    fEvento.value = entry.evento || "";
    fEstilo.value = entry.estilo || "";
    fTelefone.value = entry.telefone || "";
    fEmail.value = entry.email || "";
    fObs.value = entry.obs || "";
    populateBankFields(entry.artista || "");

    activeTemplateKey = "convite";
    renderWaTemplateChips();
    updateWaPreview();

    closeTemplatesPanel();
    backdrop.hidden = false;
    dayPanel.hidden = false;
  }

  function closeDayPanel() {
    dayPanel.hidden = true;
    if (templatesPanel.hidden) backdrop.hidden = true;
    activeDateKey = null;
  }

  function readDayForm() {
    return {
      artista: fArtista.value.trim(),
      tipo: fTipo.value,
      status: fStatus.value,
      evento: fEvento.value.trim(),
      estilo: fEstilo.value.trim(),
      telefone: fTelefone.value.trim(),
      email: fEmail.value.trim(),
      obs: fObs.value.trim(),
    };
  }

  document.getElementById("save-day").addEventListener("click", async () => {
    if (!activeDateKey) return;
    const entry = readDayForm();
    if (!entry.artista) {
      showToast("Digite o nome do artista antes de salvar.");
      return;
    }
    if (!bookingsCol) {
      showToast("Sem conexão com a nuvem. Tenta de novo em instantes.");
      return;
    }
    try {
      await setDoc(doc(bookingsCol, activeDateKey), entry);
      showToast("Escala salva.");
      const contactPatch = {};
      if (entry.telefone) contactPatch.telefone = entry.telefone;
      if (entry.email) contactPatch.email = entry.email;
      if (Object.keys(contactPatch).length && artistsCol) {
        setDoc(doc(artistsCol, entry.artista), contactPatch, { merge: true }).catch((err) => console.error(err));
      }
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar. Tenta de novo.");
    }
  });

  document.getElementById("delete-day").addEventListener("click", async () => {
    if (!activeDateKey) return;
    if (!bookingsCol) {
      showToast("Sem conexão com a nuvem. Tenta de novo em instantes.");
      return;
    }
    try {
      await deleteDoc(doc(bookingsCol, activeDateKey));
      closeDayPanel();
      showToast("Dia limpo.");
    } catch (err) {
      console.error(err);
      showToast("Não deu pra limpar. Tenta de novo.");
    }
  });

  document.querySelectorAll("[data-close-panel]").forEach((btn) =>
    btn.addEventListener("click", closeDayPanel)
  );

  /* ── whatsapp message building ─────────────────────────── */
  const waTemplatesEl = document.getElementById("wa-templates");
  const waPreview = document.getElementById("wa-preview");
  const waWarning = document.getElementById("wa-warning");

  function renderWaTemplateChips() {
    waTemplatesEl.innerHTML = "";
    Object.keys(TEMPLATE_LABELS).forEach((key) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "wa-chip" + (key === activeTemplateKey ? " active" : "");
      chip.textContent = TEMPLATE_LABELS[key];
      chip.addEventListener("click", () => {
        activeTemplateKey = key;
        renderWaTemplateChips();
        updateWaPreview();
      });
      waTemplatesEl.appendChild(chip);
    });
  }

  function buildMessage(templateKey, entry, key) {
    const template = templates[templateKey] || "";
    return template
      .replaceAll("{artista}", entry.artista || "")
      .replaceAll("{data}", key ? formatBrDate(key) : "")
      .replaceAll("{diaSemana}", key ? weekdayNameFromKey(key) : "")
      .replaceAll("{evento}", entry.evento || "")
      .replaceAll("{estilo}", entry.estilo || "")
      .replaceAll("{tipo}", entry.tipo === "RADIO" ? "de rádio" : "de DJ")
      .replaceAll("{bar}", "Frisson")
      .replaceAll("{riderLink}", RIDER_URL);
  }

  function updateWaPreview() {
    if (!activeDateKey) return;
    const entry = readDayForm();
    waPreview.value = buildMessage(activeTemplateKey, entry, activeDateKey);
    waWarning.hidden = !!normalizePhone(entry.telefone);
  }

  [fArtista, fEvento, fEstilo, fTipo].forEach((el) =>
    el.addEventListener("input", updateWaPreview)
  );
  fTipo.addEventListener("change", updateWaPreview);
  fTelefone.addEventListener("input", updateWaPreview);

  // Ao escolher/confirmar um artista já conhecido, preenche contato e
  // dados bancários salvos dele — evita redigitar a cada nova data.
  function applyArtistMatch(name) {
    const rec = artists[name];
    if (rec) {
      if (!fTelefone.value && rec.telefone) fTelefone.value = rec.telefone;
      if (!fEmail.value && rec.email) fEmail.value = rec.email;
    }
    populateBankFields(name);
    updateWaPreview();
  }

  fArtista.addEventListener("change", () => applyArtistMatch(fArtista.value.trim()));

  /* Sugestões de nome desenhadas à mão (datalist nativo não aparece de
     forma confiável no Safari do iPhone). */
  const artistSuggestions = document.getElementById("artist-suggestions");

  function showArtistSuggestions() {
    const q = fArtista.value.trim().toLowerCase();
    const matches = (q
      ? artistNamesSorted.filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q)
      : artistNamesSorted
    ).slice(0, 8);
    if (!matches.length) {
      hideArtistSuggestions();
      return;
    }
    artistSuggestions.innerHTML = "";
    matches.forEach((name) => {
      const item = document.createElement("div");
      item.className = "suggestion-item";
      item.textContent = name;
      item.addEventListener("mousedown", (e) => e.preventDefault()); // não deixa o input perder foco antes do click
      item.addEventListener("click", () => {
        fArtista.value = name;
        applyArtistMatch(name);
        hideArtistSuggestions();
      });
      artistSuggestions.appendChild(item);
    });
    artistSuggestions.hidden = false;
  }

  function hideArtistSuggestions() {
    artistSuggestions.hidden = true;
  }

  fArtista.addEventListener("focus", showArtistSuggestions);
  fArtista.addEventListener("input", showArtistSuggestions);
  fArtista.addEventListener("blur", () => setTimeout(hideArtistSuggestions, 150));

  function normalizePhone(raw) {
    let digits = (raw || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length <= 11) digits = "55" + digits; // assume Brasil quando sem DDI
    return digits;
  }

  document.getElementById("send-whatsapp").addEventListener("click", () => {
    const phone = normalizePhone(fTelefone.value);
    if (!phone) {
      showToast("Cadastre o WhatsApp do artista primeiro.");
      waWarning.hidden = false;
      return;
    }
    const text = encodeURIComponent(waPreview.value);
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank", "noopener");
  });

  /* ── templates settings panel ──────────────────────────── */
  const tplFields = {
    convite: document.getElementById("tpl-convite"),
    confirmacao: document.getElementById("tpl-confirmacao"),
    lembrete: document.getElementById("tpl-lembrete"),
    agradecimento: document.getElementById("tpl-agradecimento"),
    riderTecnico: document.getElementById("tpl-rider-tecnico"),
  };

  function openTemplatesPanel() {
    Object.keys(tplFields).forEach((k) => (tplFields[k].value = templates[k]));
    closeDayPanel();
    backdrop.hidden = false;
    templatesPanel.hidden = false;
  }

  function closeTemplatesPanel() {
    templatesPanel.hidden = true;
    if (dayPanel.hidden) backdrop.hidden = true;
  }

  document.getElementById("open-templates").addEventListener("click", openTemplatesPanel);
  document.querySelectorAll("[data-close-templates]").forEach((btn) =>
    btn.addEventListener("click", closeTemplatesPanel)
  );

  document.getElementById("save-templates").addEventListener("click", async () => {
    Object.keys(tplFields).forEach((k) => (templates[k] = tplFields[k].value));
    if (!templatesDocRef) {
      showToast("Sem conexão com a nuvem. Tenta de novo em instantes.");
      return;
    }
    try {
      await setDoc(templatesDocRef, templates);
      showToast("Mensagens padrão salvas.");
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar. Tenta de novo.");
    }
  });

  document.getElementById("reset-templates").addEventListener("click", async () => {
    templates = { ...DEFAULT_TEMPLATES };
    if (templatesDocRef) {
      try {
        await setDoc(templatesDocRef, templates);
      } catch (err) {
        console.error(err);
      }
    }
    Object.keys(tplFields).forEach((k) => (tplFields[k].value = templates[k]));
    showToast("Mensagens restauradas ao padrão.");
  });

  backdrop.addEventListener("click", () => {
    closeDayPanel();
    closeTemplatesPanel();
  });

  /* ── dados bancários do artista (por nome, reaproveitado entre datas) ── */
  document.getElementById("save-bank").addEventListener("click", async () => {
    const name = fArtista.value.trim();
    if (!name) {
      showToast("Digite o nome do artista antes de salvar.");
      return;
    }
    if (!artistsCol) {
      showToast("Sem conexão com a nuvem. Tenta de novo em instantes.");
      return;
    }
    const patch = {
      titular: fBankTitular.value.trim(),
      documento: fBankDoc.value.trim(),
      pix: fBankPix.value.trim(),
      outros: fBankOutros.value.trim(),
    };
    try {
      await setDoc(doc(artistsCol, name), patch, { merge: true });
      showToast("Dados bancários salvos.");
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar. Tenta de novo.");
    }
  });

  document.getElementById("copy-bank").addEventListener("click", async () => {
    const name = fArtista.value.trim();
    if (!name) {
      showToast("Digite o nome do artista antes de copiar.");
      return;
    }
    const lines = [`Artista: ${name}`];
    if (fBankTitular.value.trim()) lines.push(`Titular: ${fBankTitular.value.trim()}`);
    if (fBankDoc.value.trim()) lines.push(`CPF/CNPJ: ${fBankDoc.value.trim()}`);
    if (fBankPix.value.trim()) lines.push(`PIX: ${fBankPix.value.trim()}`);
    if (fBankOutros.value.trim()) lines.push(`Banco: ${fBankOutros.value.trim()}`);
    if (lines.length === 1) {
      showToast("Nenhum dado bancário preenchido ainda.");
      return;
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      showToast("Dados copiados — cole pra enviar aos sócios.");
    } catch (err) {
      console.error(err);
      showToast("Não deu pra copiar. Copia manualmente.");
    }
  });

  /* ── compartilhar agenda como imagem (identidade frisson) ── */
  function monthBookings() {
    const total = daysInMonth(view.year, view.month);
    const rows = [];
    for (let day = 1; day <= total; day++) {
      const key = dateKey(view.year, view.month, day);
      const e = data[key];
      if (e && e.artista) rows.push({ key, day, e });
    }
    return rows;
  }

  function weekBookings(range) {
    const rows = [];
    for (let day = range.startDay; day <= range.endDay; day++) {
      const key = dateKey(view.year, view.month, day);
      const e = data[key];
      if (e && e.artista) rows.push({ key, day, e });
    }
    return rows;
  }

  function buildShareCanvas(rows, title) {
    const W = 960;
    const padX = 56;
    const headerH = 132;
    const rowH = 68;
    const footerH = 52;
    const H = headerH + rows.length * rowH + footerH;
    const scale = 2;

    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#180f0d");
    bg.addColorStop(1, "#0c0807");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const badgeR = 27;
    const badgeCX = padX + badgeR;
    const badgeCY = 58;
    ctx.beginPath();
    ctx.arc(badgeCX, badgeCY, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = "#a7e3ea";
    ctx.fill();
    ctx.fillStyle = "#0c0908";
    ctx.font = "700 13px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("frisson", badgeCX, badgeCY + 1);

    ctx.textAlign = "left";
    ctx.fillStyle = "#f4ece6";
    ctx.font = "700 25px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
    ctx.fillText("agenda", badgeCX + badgeR + 18, badgeCY - 9);
    ctx.fillStyle = "#c9b6ae";
    ctx.font = "400 14px -apple-system, system-ui, sans-serif";
    ctx.fillText("bar & discos — Botafogo", badgeCX + badgeR + 18, badgeCY + 14);

    ctx.textAlign = "right";
    ctx.fillStyle = "#a7e3ea";
    ctx.font = "600 21px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
    ctx.fillText(title, W - padX, badgeCY + 5);
    ctx.textAlign = "left";

    ctx.strokeStyle = "rgba(167,227,234,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, headerH - 18);
    ctx.lineTo(W - padX, headerH - 18);
    ctx.stroke();

    let y = headerH;
    rows.forEach(({ key, e }) => {
      const cy = y + rowH / 2;

      ctx.textBaseline = "middle";
      ctx.fillStyle = "#a7e3ea";
      ctx.font = "700 19px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
      ctx.fillText(formatBrDate(key).slice(0, 5), padX, cy - 9);
      ctx.fillStyle = "#8a746c";
      ctx.font = "600 10px -apple-system, system-ui, sans-serif";
      ctx.fillText(weekdayNameFromKey(key).slice(0, 3).toUpperCase(), padX, cy + 10);

      const hasSub = e.estilo || e.tipo === "RADIO";
      ctx.fillStyle = "#f4ece6";
      ctx.font = "700 19px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
      ctx.fillText(e.artista, padX + 80, hasSub ? cy - 9 : cy);

      if (hasSub) {
        const sub = [e.tipo === "RADIO" ? "Rádio" : "DJ", e.estilo].filter(Boolean).join(" · ");
        ctx.fillStyle = "#c9b6ae";
        ctx.font = "400 13px -apple-system, system-ui, sans-serif";
        ctx.fillText(sub, padX + 80, cy + 12);
      }

      const dotColor = e.status === "confirmado" ? "#7fdc9a" : e.status === "cancelado" ? "#e2685a" : "#e8c766";
      ctx.beginPath();
      ctx.arc(W - padX - 6, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();

      if (y + rowH < headerH + rows.length * rowH) {
        ctx.strokeStyle = "rgba(167,227,234,0.08)";
        ctx.beginPath();
        ctx.moveTo(padX, y + rowH);
        ctx.lineTo(W - padX, y + rowH);
        ctx.stroke();
      }
      y += rowH;
    });

    ctx.fillStyle = "#8a746c";
    ctx.font = "italic 13px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("gerado pela agenda frisson", W / 2, H - footerH / 2);

    return canvas;
  }

  function shareOrDownloadCanvas(canvas, fileName, shareTitle) {
    canvas.toBlob(async (blob) => {
      if (!blob) return;

      if (navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: shareTitle });
            return;
          } catch (err) {
            if (err && err.name === "AbortError") return;
          }
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Imagem salva.");
    }, "image/png");
  }

  document.getElementById("rider-pdf-link").addEventListener("click", async () => {
    try {
      const blob = await (await fetch(RIDER_URL)).blob();
      const file = new File([blob], "frisson-informacoes-tecnicas.pdf", { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Guia técnico Frisson" });
        return;
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
      console.error(err);
    }
    if (navigator.share) {
      try {
        await navigator.share({ url: RIDER_URL, title: "Guia técnico Frisson" });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(RIDER_URL);
      showToast("Link do guia copiado — cole no WhatsApp.");
    } catch (err) {
      window.open(RIDER_URL, "_blank", "noopener");
    }
  });

  document.getElementById("share-agenda").addEventListener("click", () => {
    const rows = monthBookings();
    if (!rows.length) {
      showToast("Nenhuma escala cadastrada nesse mês ainda.");
      return;
    }
    const monthName = MONTH_NAMES[view.month - 1];
    const title = monthName.charAt(0).toUpperCase() + monthName.slice(1) + " " + view.year;
    const canvas = buildShareCanvas(rows, title);
    shareOrDownloadCanvas(canvas, `frisson-agenda-${view.year}-${pad2(view.month)}.png`, `Agenda Frisson — ${title}`);
  });

  function shareWeek(range) {
    const rows = weekBookings(range);
    if (!rows.length) {
      showToast("Nenhuma escala nessa semana ainda.");
      return;
    }
    const title = `Semana ${range.week}`;
    const canvas = buildShareCanvas(rows, title);
    shareOrDownloadCanvas(canvas, `frisson-agenda-semana-${range.week}-${view.year}-${pad2(view.month)}.png`, `Agenda Frisson — ${title}`);
  }

  /* ── csv export ────────────────────────────────────────── */
  document.getElementById("export-csv").addEventListener("click", () => {
    const total = daysInMonth(view.year, view.month);
    const rows = [["Data", "Dia da Semana", "Artista", "Evento", "Email", "Telefone", "Programação", "Estilo Musical", "Status"]];
    for (let day = 1; day <= total; day++) {
      const key = dateKey(view.year, view.month, day);
      const e = data[key];
      if (!e || !e.artista) continue;
      rows.push([
        formatBrDate(key),
        weekdayNameFromKey(key),
        e.artista || "",
        e.evento || "",
        e.email || "",
        e.telefone || "",
        e.tipo || "",
        e.estilo || "",
        e.status || "",
      ]);
    }
    const csv = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `frisson-agenda-${view.year}-${pad2(view.month)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  function csvEscape(value) {
    const v = String(value ?? "");
    return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }

  /* ── toast ─────────────────────────────────────────────── */
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2600);
  }

  /* ── service worker (habilita instalar como app) ──────── */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw-frisson.js").catch(() => {});
    });
  }

  /* ── init ──────────────────────────────────────────────── */
  renderCalendar();
})();
