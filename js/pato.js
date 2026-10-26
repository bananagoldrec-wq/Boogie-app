/* pato com laranja · agenda de música — lógica do app.
   Mesma base da agenda do Frisson, com uma diferença central: a franquia
   tem várias unidades, então cada escala pertence a uma data E a uma
   unidade. Sincroniza via Firebase quando dá; se a nuvem não responder
   (ou as regras do Firestore ainda não liberarem as coleções pato_*),
   segue funcionando no aparelho e sobe o que ficou pendente assim que
   a nuvem voltar. */

(() => {
  "use strict";

  /* Mesmo projeto Firebase do Frisson, em coleções separadas (pato_*),
     pra não misturar as agendas — veja o README pras regras. */
  const firebaseConfig = {
    apiKey: "AIzaSyBq_x9Mfyv0aT-wblKcbWScUGn1htCg_3g",
    authDomain: "frisson-agenda.firebaseapp.com",
    projectId: "frisson-agenda",
    storageBucket: "frisson-agenda.firebasestorage.app",
    messagingSenderId: "28732138318",
    appId: "1:28732138318:web:67e28575aa1040770f741f",
  };

  // Carregado sob demanda (import dinâmico) pra nunca travar o resto do
  // app se o CDN do Firebase estiver bloqueado/indisponível.
  let db, bookingsCol, templatesDocRef, artistsCol;
  let doc, setDoc, onSnapshot, writeBatch;

  // Trava de acesso simples: senha única embutida no app, checada
  // localmente. Segura visitante casual, mas não é segurança de verdade —
  // quem souber ler o código do app encontra a senha.
  const APP_PASSWORD = "231019";
  const UNLOCK_KEY = "pato_agenda_unlocked_v1";
  const LOCAL_KEY = "pato_agenda_local_v1";
  const UNIT_PREF_KEY = "pato_agenda_unidade_v1";

  const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  /* ── unidades da franquia ──────────────────────────────────
     sigla = selo curto no calendário "Todas"; cor = bolinha da unidade. */
  const UNITS = [
    { id: "sao-conrado", nome: "São Conrado", sigla: "SC", endereco: "São Conrado — Rio de Janeiro", cidade: "RJ", cor: "#f9a028" },
    { id: "leblon-praia", nome: "Leblon Praia", sigla: "LP", endereco: "Praia do Leblon · Posto 11", cidade: "RJ", cor: "#ec6a2c" },
    { id: "leblon-dias-ferreira", nome: "Leblon Dias Ferreira", sigla: "DF", endereco: "R. Dias Ferreira 410 — Leblon", cidade: "RJ", cor: "#f6d58e" },
    { id: "barra-praia", nome: "Barra Praia", sigla: "BP", endereco: "Praia da Barra da Tijuca · Posto 02", cidade: "RJ", cor: "#7fc8d6" },
    { id: "barra-pepe", nome: "Barra Pepê", sigla: "BA", endereco: "Av. do Pepê 780 — Barra da Tijuca", cidade: "RJ", cor: "#b8e07a" },
    { id: "sao-paulo", nome: "São Paulo", sigla: "SP", endereco: "Parque Villa Lobos, Portão 5", cidade: "SP", cor: "#e7a0c2" },
  ];
  const UNIT_BY_ID = Object.fromEntries(UNITS.map((u) => [u.id, u]));

  const CARTA_URL = "https://bananagoldrec-wq.github.io/Boogie-app/pato-carta-dj.pdf?v=3";

  const DEFAULT_TEMPLATES = {
    convite: "Oi {artista}! Aqui é do Pato com Laranja 🦆🍊 Queria te chamar pra tocar no Pato {unidade} dia {data} ({diaSemana}){horarioTxt}, set de {estilo}. Topa?",
    confirmacao: "Fechado, {artista}! Confirmando sua data no Pato {unidade}: {data} ({diaSemana}){horarioTxt}. Endereço: {endereco}. Chega uns 30 min antes. Qualquer coisa me chama por aqui 🙌",
    lembrete: "Oi {artista}, passando pra lembrar do seu set no Pato {unidade} dia {data} ({diaSemana}){horarioTxt}! Nos vemos lá 🎧",
    agradecimento: "Foi ótimo ter você no Pato {unidade} dia {data}, {artista}! Obrigado pelo som 🙏 Já quero marcar a próxima.",
    comoChegar: "Oi {artista}! Seu set é no Pato {unidade} — {endereco}. Mapa: {mapa}",
    cartaDj: "Oi {artista}! Segue a carta do DJ do Pato com Laranja, com a linha de som, o equipamento e as informações práticas: {cartaLink}",
    pedirPix: "Oi {artista}! Pra fechar o pagamento do dia {data} no Pato {unidade}, pode me mandar sua chave PIX (e o nome do titular, se for diferente do seu)?",
    pedirFoto: "Oi {artista}! Podia me mandar uma foto sua em boa qualidade? É pra divulgação do seu set no Pato {unidade} 📸",
  };

  const TEMPLATE_LABELS = {
    convite: "Convite",
    confirmacao: "Confirmação",
    lembrete: "Lembrete",
    agradecimento: "Agradecimento",
    comoChegar: "Como chegar",
    cartaDj: "Carta do DJ",
    pedirPix: "Pedir PIX",
    pedirFoto: "Pedir foto",
  };

  const TIPO_LABELS = { DJ: "DJ", AOVIVO: "Ao vivo" };

  /* ── state ─────────────────────────────────────────────── */
  const today = new Date();
  let view = { year: today.getFullYear(), month: today.getMonth() + 1 }; // month 1-12
  let data = {};        // id "AAAA-MM-DD_unidade" → escala
  let templates = { ...DEFAULT_TEMPLATES };
  let artists = {};
  let currentUnit = loadUnitPref();
  let activeDateKey = null;
  let activeTemplateKey = "convite";

  function bookingId(key, unitId) { return `${key}_${unitId}`; }
  function bookingFor(key, unitId) { return data[bookingId(key, unitId)]; }

  function loadUnitPref() {
    try {
      const saved = localStorage.getItem(UNIT_PREF_KEY);
      if (UNIT_BY_ID[saved]) return saved;
    } catch (err) {}
    return UNITS[0].id;
  }

  /* ── armazenamento: nuvem com reserva no aparelho ───────────
     `data`/`artists`/`templates` são sempre o estado efetivo e ficam
     espelhados no localStorage. O que for gravado sem nuvem entra em
     `pending` e sobe na próxima conexão — inclusive exclusões. */
  let cloudReady = false;
  let pending = { bookings: {}, artists: {}, templates: null };
  let warnedLocal = false;

  function loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
      if (!raw) return;
      data = raw.bookings || {};
      artists = raw.artists || {};
      templates = { ...DEFAULT_TEMPLATES, ...(raw.templates || {}) };
      pending = { bookings: {}, artists: {}, templates: null, ...(raw.pending || {}) };
    } catch (err) {}
  }

  function saveLocal() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ bookings: data, artists, templates, pending }));
    } catch (err) {
      // fotos em base64 podem estourar a cota — tenta sem elas
      try {
        const slim = Object.fromEntries(Object.entries(artists).map(([k, v]) => [k, { ...v, foto: "" }]));
        localStorage.setItem(LOCAL_KEY, JSON.stringify({ bookings: data, artists: slim, templates, pending }));
      } catch (err2) {}
    }
  }

  function hasPending() {
    return Object.keys(pending.bookings).length || Object.keys(pending.artists).length || pending.templates;
  }

  function noteLocalWrite() {
    saveLocal();
    if (!warnedLocal) {
      warnedLocal = true;
      showToast("Salvo neste aparelho — sobe pra nuvem quando a conexão voltar.");
      return true;
    }
    return false;
  }

  /* changes: { id: escala | null } — null apaga. Na nuvem vai num
     writeBatch só, pra uma troca de datas nunca ficar pela metade. */
  async function writeBookings(changes) {
    if (cloudReady) {
      const batch = writeBatch(db);
      Object.entries(changes).forEach(([id, entry]) => {
        if (entry) batch.set(doc(bookingsCol, id), entry);
        else batch.delete(doc(bookingsCol, id));
      });
      await batch.commit();
      return "cloud";
    }
    Object.entries(changes).forEach(([id, entry]) => {
      if (entry) data[id] = entry;
      else delete data[id];
      pending.bookings[id] = entry;
    });
    renderCalendar();
    refreshArtistNames();
    return noteLocalWrite() ? "local-warned" : "local";
  }

  async function writeArtist(name, patch) {
    if (cloudReady) {
      await setDoc(doc(artistsCol, name), patch, { merge: true });
      return "cloud";
    }
    artists[name] = { ...(artists[name] || {}), ...patch };
    pending.artists[name] = { ...(pending.artists[name] || {}), ...patch };
    refreshArtistNames();
    return noteLocalWrite() ? "local-warned" : "local";
  }

  async function writeTemplates(next) {
    templates = { ...next };
    if (cloudReady) {
      await setDoc(templatesDocRef, templates);
      return "cloud";
    }
    pending.templates = { ...templates };
    return noteLocalWrite() ? "local-warned" : "local";
  }

  /* Sobe o que foi gravado sem nuvem. Roda uma vez por conexão. */
  async function flushPending() {
    if (!hasPending()) return;
    const batch = writeBatch(db);
    Object.entries(pending.bookings).forEach(([id, entry]) => {
      if (entry) batch.set(doc(bookingsCol, id), entry);
      else batch.delete(doc(bookingsCol, id));
    });
    Object.entries(pending.artists).forEach(([name, patch]) => batch.set(doc(artistsCol, name), patch, { merge: true }));
    if (pending.templates) batch.set(templatesDocRef, pending.templates);
    try {
      await batch.commit();
      const n = Object.keys(pending.bookings).length;
      pending = { bookings: {}, artists: {}, templates: null };
      saveLocal();
      if (n) showToast(`${n} alteração(ões) feitas offline enviadas pra nuvem.`);
    } catch (err) {
      console.error(err);
    }
  }

  function goLocal(reason) {
    cloudReady = false;
    if (reason) console.warn("Pato agenda em modo local:", reason);
    if (!warnedLocal) {
      warnedLocal = true;
      showToast("Sem nuvem agora — a agenda segue salva neste aparelho.");
    }
  }

  function startSync() {
    let firstBookings = true;
    onSnapshot(bookingsCol, (snap) => {
      const next = {};
      snap.forEach((d) => { next[d.id] = d.data(); });
      if (firstBookings) {
        firstBookings = false;
        cloudReady = true;
        // as alterações offline ainda não estão no snapshot: mostra o
        // estado efetivo até o flush voltar como novo snapshot
        Object.entries(pending.bookings).forEach(([id, entry]) => {
          if (entry) next[id] = entry;
          else delete next[id];
        });
        flushPending();
      }
      data = next;
      saveLocal();
      renderCalendar();
      refreshArtistNames();
    }, (err) => {
      console.error(err);
      goLocal(err && err.code);
    });

    onSnapshot(templatesDocRef, (snap) => {
      if (pending.templates) return;
      templates = snap.exists() ? { ...DEFAULT_TEMPLATES, ...snap.data() } : { ...DEFAULT_TEMPLATES };
      saveLocal();
    }, (err) => console.error(err));

    onSnapshot(artistsCol, (snap) => {
      const next = {};
      snap.forEach((d) => { next[d.id] = d.data(); });
      Object.entries(pending.artists).forEach(([name, patch]) => { next[name] = { ...(next[name] || {}), ...patch }; });
      artists = next;
      saveLocal();
      refreshArtistNames();
    }, (err) => console.error(err));
  }

  async function connectFirebase() {
    try {
      const [appMod, authMod, fsMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js"),
      ]);

      doc = fsMod.doc;
      setDoc = fsMod.setDoc;
      onSnapshot = fsMod.onSnapshot;
      writeBatch = fsMod.writeBatch;

      const fbApp = appMod.initializeApp(firebaseConfig);
      const auth = authMod.getAuth(fbApp);
      db = fsMod.getFirestore(fbApp);
      bookingsCol = fsMod.collection(db, "pato_bookings");
      templatesDocRef = doc(db, "pato_settings", "templates");
      artistsCol = fsMod.collection(db, "pato_artists");

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

  /* Lista de nomes já usados (diretório de artistas + escalas), pro
     autocompletar do campo Artista. datalist nativo não é confiável no
     Safari do iPhone — a sugestão é desenhada à mão em vez disso. */
  let artistNamesSorted = [];

  function refreshArtistNames() {
    const names = new Set(Object.keys(artists));
    Object.values(data).forEach((e) => { if (e && e.artista) names.add(e.artista); });
    artistNamesSorted = [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  /* ── trava de senha ────────────────────────────────────── */
  function isUnlocked() {
    try {
      return localStorage.getItem(UNLOCK_KEY) === "1";
    } catch (err) {
      return false;
    }
  }

  function startApp() {
    loadLocal();
    refreshArtistNames();
    renderCalendar();
    connectFirebase();
    setTimeout(() => { if (!cloudReady) goLocal("timeout"); }, 15000);
  }

  function unlockApp() {
    try {
      localStorage.setItem(UNLOCK_KEY, "1");
    } catch (err) {}
    hideLoginGate();
    startApp();
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

  function weekdayIndex(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  }

  function weekdayNameFromKey(key) {
    return WEEKDAY_NAMES[weekdayIndex(key)];
  }

  /* ── feriados nacionais + municipais (Rio e São Paulo) ─── */
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

  const holidayCache = {};
  function holidaysForYear(year, cidade) {
    const cacheKey = `${year}-${cidade}`;
    if (holidayCache[cacheKey]) return holidayCache[cacheKey];
    const easter = easterSunday(year);
    const map = {};
    map[dateKey(year, 1, 1)] = "Ano Novo";
    map[dateKey(year, 4, 21)] = "Tiradentes";
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
    if (cidade === "SP") {
      map[dateKey(year, 1, 25)] = "Aniversário de SP";
      map[dateKey(year, 7, 9)] = "Rev. Constitucionalista";
    } else {
      map[dateKey(year, 1, 20)] = "São Sebastião";
      map[dateKey(year, 4, 23)] = "São Jorge";
    }
    holidayCache[cacheKey] = map;
    return map;
  }

  function getHoliday(key, unitId) {
    return holidaysForYear(Number(key.slice(0, 4)), UNIT_BY_ID[unitId].cidade)[key];
  }

  /* ── arrastar para mover/trocar a data (dentro da mesma unidade) ── */
  async function moveBooking(sourceKey, targetKey) {
    if (!sourceKey || !targetKey || sourceKey === targetKey) return;
    const sourceId = bookingId(sourceKey, currentUnit);
    const targetId = bookingId(targetKey, currentUnit);
    const sourceEntry = data[sourceId];
    if (!sourceEntry) return;
    const targetEntry = data[targetId];
    try {
      const mode = await writeBookings({
        [targetId]: { ...sourceEntry, data: targetKey },
        [sourceId]: targetEntry ? { ...targetEntry, data: sourceKey } : null,
      });
      if (mode !== "local-warned") showToast(targetEntry ? "Datas trocadas." : "Escala movida.");
    } catch (err) {
      console.error(err);
      showToast("Não deu pra mover. Tenta de novo.");
    }
  }

  /* ── unidade: um seletor só, no topo. Tudo (calendário, escala do
     dia, mensagens, arte, CSV) segue a unidade escolhida aqui. ── */
  const unitSelect = document.getElementById("unit-select");
  const brandSub = document.getElementById("brand-sub");

  UNITS.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = `Pato ${u.nome}`;
    unitSelect.appendChild(opt);
  });

  function renderUnit() {
    const u = UNIT_BY_ID[currentUnit];
    unitSelect.value = currentUnit;
    brandSub.textContent = u.endereco;
  }

  unitSelect.addEventListener("change", () => {
    currentUnit = unitSelect.value;
    try {
      localStorage.setItem(UNIT_PREF_KEY, currentUnit);
    } catch (err) {}
    renderUnit();
    renderCalendar();
    if (!yearPicker.hidden) renderYearPicker();
  });

  /* ── render: calendar ──────────────────────────────────── */
  const calGrid = document.getElementById("cal-grid");
  const monthLabel = document.getElementById("month-label");

  const WEEKEND_DAYS = [0, 5, 6]; // sexta a domingo: dias mais cheios na praia

  /* Calendário comum: grade dom–sáb, com os dias do mês anterior/seguinte
     como espaço vazio pra semana sempre começar no domingo. */
  function renderCalendar() {
    monthLabel.textContent = `${MONTH_NAMES[view.month - 1]} ${view.year}`;
    calGrid.innerHTML = "";

    const leading = firstWeekday(view.year, view.month);
    const total = daysInMonth(view.year, view.month);
    for (let i = 0; i < leading; i++) calGrid.appendChild(blankCell());
    for (let day = 1; day <= total; day++) {
      const key = dateKey(view.year, view.month, day);
      calGrid.appendChild(buildDayCell(key, day, bookingFor(key, currentUnit)));
    }
    const trailing = (7 - ((leading + total) % 7)) % 7;
    for (let i = 0; i < trailing; i++) calGrid.appendChild(blankCell());
  }

  function blankCell() {
    const el = document.createElement("div");
    el.className = "day-cell is-blank";
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  function baseCell(key, day, holidayName) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day-cell"
      + (isTodayKey(key) ? " is-today" : "")
      + (WEEKEND_DAYS.includes(weekdayIndex(key)) ? " day-weekend" : "")
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
    return cell;
  }

  function holidayTag(holidayName) {
    const t = document.createElement("span");
    t.className = "tag tag-holiday";
    t.textContent = holidayName;
    return t;
  }

  function buildDayCell(key, day, entry) {
    const holidayName = getHoliday(key, currentUnit);
    const cell = baseCell(key, day, holidayName);

    if ((entry && entry.artista) || holidayName) {
      const content = document.createElement("div");
      content.className = "day-content";

      if (entry && entry.artista) {
        const artist = document.createElement("div");
        artist.className = "day-artist";
        artist.textContent = entry.artista;
        content.appendChild(artist);
      }

      const tags = document.createElement("div");
      tags.className = "day-tags";
      if (entry && entry.horario) {
        const t = document.createElement("span");
        t.className = "tag";
        t.textContent = entry.horario;
        tags.appendChild(t);
      }
      if (entry && entry.tipo === "AOVIVO") {
        const t = document.createElement("span");
        t.className = "tag tag-live";
        t.textContent = "Ao vivo";
        tags.appendChild(t);
      }
      if (holidayName) tags.appendChild(holidayTag(holidayName));
      if (tags.childNodes.length) content.appendChild(tags);

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

  /* ── os 12 meses do ano: toca no nome do mês pra pular direto ── */
  const yearPicker = document.getElementById("year-picker");
  const yearLabel = document.getElementById("year-label");
  const yearGrid = document.getElementById("year-grid");
  let pickerYear = view.year;

  function countMonth(year, month) {
    let n = 0;
    for (let day = 1; day <= daysInMonth(year, month); day++) {
      const e = bookingFor(dateKey(year, month, day), currentUnit);
      if (e && e.artista) n++;
    }
    return n;
  }

  function renderYearPicker() {
    yearLabel.textContent = `${pickerYear} · Pato ${UNIT_BY_ID[currentUnit].nome}`;
    yearGrid.innerHTML = "";
    MONTH_NAMES.forEach((name, i) => {
      const month = i + 1;
      const n = countMonth(pickerYear, month);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "year-month"
        + (pickerYear === view.year && month === view.month ? " active" : "")
        + (pickerYear === today.getFullYear() && month === today.getMonth() + 1 ? " is-now" : "");
      btn.innerHTML = `<span class="ym-name"></span><span class="ym-count">${n ? `${n} escala${n > 1 ? "s" : ""}` : "—"}</span>`;
      btn.querySelector(".ym-name").textContent = name;
      btn.addEventListener("click", () => {
        view = { year: pickerYear, month };
        yearPicker.hidden = true;
        renderCalendar();
      });
      yearGrid.appendChild(btn);
    });
  }

  monthLabel.addEventListener("click", () => {
    pickerYear = view.year;
    renderYearPicker();
    yearPicker.hidden = false;
  });
  document.getElementById("prev-year").addEventListener("click", () => { pickerYear--; renderYearPicker(); });
  document.getElementById("next-year").addEventListener("click", () => { pickerYear++; renderYearPicker(); });
  document.getElementById("close-year").addEventListener("click", () => { yearPicker.hidden = true; });
  yearPicker.addEventListener("click", (e) => { if (e.target === yearPicker) yearPicker.hidden = true; });

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
    if (touchDrag) return;
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

  /* ── day panel ─────────────────────────────────────────── */
  const backdrop = document.getElementById("backdrop");
  const dayPanel = document.getElementById("day-panel");
  const templatesPanel = document.getElementById("templates-panel");
  const panelDate = document.getElementById("panel-date");

  const fArtista = document.getElementById("f-artista");
  const fTipo = document.getElementById("f-tipo");
  const fStatus = document.getElementById("f-status");
  const fHorario = document.getElementById("f-horario");
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

  /* Busca o registro do artista ignorando acento e maiúscula/minúscula —
     "Antonio dal Bo" e "Antonio Dal Bó" apontam pro mesmo cadastro. */
  function normalizeArtistKey(name) {
    return (name || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase();
  }

  function findArtistRecord(name) {
    if (artists[name]) return artists[name];
    const target = normalizeArtistKey(name);
    if (!target) return null;
    const match = Object.keys(artists).find((k) => normalizeArtistKey(k) === target);
    return match ? artists[match] : null;
  }

  function populateBankFields(artistName) {
    const rec = findArtistRecord(artistName) || {};
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
     tamanho/qualidade até caber. */
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
    try {
      const dataUri = await resizeImageFile(file, 900000);
      renderPhotoPreview(dataUri);
      const mode = await writeArtist(name, { foto: dataUri });
      if (mode !== "local-warned") showToast("Foto salva.");
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar a foto. Tenta uma imagem menor.");
    }
  });

  removePhotoBtn.addEventListener("click", async () => {
    const name = fArtista.value.trim();
    if (!name) return;
    try {
      await writeArtist(name, { foto: "" });
      renderPhotoPreview("");
      showToast("Foto removida.");
    } catch (err) {
      console.error(err);
      showToast("Não deu pra remover. Tenta de novo.");
    }
  });

  sharePhotoBtn.addEventListener("click", async () => {
    const name = fArtista.value.trim();
    const foto = (findArtistRecord(name) || {}).foto;
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

  function fillDayForm() {
    const entry = bookingFor(activeDateKey, currentUnit) || {};
    fArtista.value = entry.artista || "";
    fTipo.value = entry.tipo || "DJ";
    fStatus.value = entry.status || "pendente";
    fHorario.value = entry.horario || "";
    fEvento.value = entry.evento || "";
    fEstilo.value = entry.estilo || "";
    fTelefone.value = entry.telefone || "";
    fEmail.value = entry.email || "";
    fObs.value = entry.obs || "";
    populateBankFields(entry.artista || "");
    updateWaPreview();
  }

  function openDayPanel(key) {
    activeDateKey = key;
    panelDate.textContent = `Pato ${UNIT_BY_ID[currentUnit].nome} · ${formatBrDate(key)} — ${weekdayNameFromKey(key)}`;
    activeTemplateKey = "convite";
    renderWaTemplateChips();
    fillDayForm();

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
      data: activeDateKey,
      unidade: currentUnit,
      artista: fArtista.value.trim(),
      tipo: fTipo.value,
      status: fStatus.value,
      horario: fHorario.value.trim(),
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
    try {
      const mode = await writeBookings({ [bookingId(activeDateKey, currentUnit)]: entry });
      if (mode !== "local-warned") showToast(`Escala salva — Pato ${UNIT_BY_ID[currentUnit].nome}.`);
      const contactPatch = {};
      if (entry.telefone) contactPatch.telefone = entry.telefone;
      if (entry.email) contactPatch.email = entry.email;
      if (Object.keys(contactPatch).length) {
        writeArtist(entry.artista, contactPatch).catch((err) => console.error(err));
      }
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar. Tenta de novo.");
    }
  });

  document.getElementById("delete-day").addEventListener("click", async () => {
    if (!activeDateKey) return;
    try {
      await writeBookings({ [bookingId(activeDateKey, currentUnit)]: null });
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
        openWhatsApp(waPreview.value);
      });
      waTemplatesEl.appendChild(chip);
    });
  }

  function mapsUrl(unit) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Pato com Laranja ${unit.endereco}`)}`;
  }

  function buildMessage(templateKey, entry, key, unitId) {
    const unit = UNIT_BY_ID[unitId] || UNITS[0];
    const template = templates[templateKey] || "";
    return template
      .replaceAll("{artista}", entry.artista || "")
      .replaceAll("{data}", key ? formatBrDate(key) : "")
      .replaceAll("{diaSemana}", key ? weekdayNameFromKey(key) : "")
      .replaceAll("{horarioTxt}", entry.horario ? `, das ${entry.horario}` : "")
      .replaceAll("{horario}", entry.horario || "")
      .replaceAll("{evento}", entry.evento || "")
      .replaceAll("{estilo}", entry.estilo || "")
      .replaceAll("{tipo}", entry.tipo === "AOVIVO" ? "ao vivo" : "de DJ")
      .replaceAll("{unidade}", unit.nome)
      .replaceAll("{endereco}", unit.endereco)
      .replaceAll("{mapa}", mapsUrl(unit))
      .replaceAll("{cartaLink}", CARTA_URL);
  }

  function updateWaPreview() {
    if (!activeDateKey) return;
    const entry = readDayForm();
    waPreview.value = buildMessage(activeTemplateKey, entry, activeDateKey, currentUnit);
    waWarning.hidden = !!normalizePhone(entry.telefone);
  }

  [fArtista, fEvento, fEstilo, fHorario].forEach((el) =>
    el.addEventListener("input", updateWaPreview)
  );
  fTipo.addEventListener("change", updateWaPreview);
  fTelefone.addEventListener("input", updateWaPreview);

  // Ao escolher/confirmar um artista já conhecido, preenche contato e
  // dados bancários salvos dele — evita redigitar a cada nova data.
  function applyArtistMatch(name) {
    const rec = findArtistRecord(name);
    if (rec) {
      if (!fTelefone.value && rec.telefone) fTelefone.value = rec.telefone;
      if (!fEmail.value && rec.email) fEmail.value = rec.email;
    }
    populateBankFields(name);
    updateWaPreview();
  }

  fArtista.addEventListener("change", () => applyArtistMatch(fArtista.value.trim()));

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
    openWhatsApp(waPreview.value);
  });

  /* Abre o menu de compartilhar do aparelho com o texto da mensagem —
     no WhatsApp isso deixa escolher vários contatos de uma vez. */
  document.getElementById("share-wa-message").addEventListener("click", async () => {
    const text = waPreview.value.trim();
    if (!text) return;
    if (await shareText(text)) return;
    showToast("Mensagem copiada — cole no WhatsApp.");
  });

  async function shareText(text) {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return true;
      } catch (err) {
        if (err && err.name === "AbortError") return true;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error(err);
      showToast("Não deu pra compartilhar. Copia o texto manualmente.");
      return true;
    }
    return false;
  }

  function openWhatsApp(text) {
    const phone = normalizePhone(fTelefone.value);
    if (!phone) {
      showToast("Cadastre o WhatsApp do artista primeiro.");
      waWarning.hidden = false;
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  /* ── templates settings panel ──────────────────────────── */
  const tplFields = {
    convite: document.getElementById("tpl-convite"),
    confirmacao: document.getElementById("tpl-confirmacao"),
    lembrete: document.getElementById("tpl-lembrete"),
    agradecimento: document.getElementById("tpl-agradecimento"),
    comoChegar: document.getElementById("tpl-como-chegar"),
    cartaDj: document.getElementById("tpl-carta-dj"),
    pedirPix: document.getElementById("tpl-pedir-pix"),
    pedirFoto: document.getElementById("tpl-pedir-foto"),
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
    const next = { ...templates };
    Object.keys(tplFields).forEach((k) => (next[k] = tplFields[k].value));
    try {
      const mode = await writeTemplates(next);
      if (mode !== "local-warned") showToast("Mensagens padrão salvas.");
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar. Tenta de novo.");
    }
  });

  document.getElementById("reset-templates").addEventListener("click", async () => {
    try {
      await writeTemplates({ ...DEFAULT_TEMPLATES });
    } catch (err) {
      console.error(err);
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
    const patch = {
      titular: fBankTitular.value.trim(),
      documento: fBankDoc.value.trim(),
      pix: fBankPix.value.trim(),
      outros: fBankOutros.value.trim(),
    };
    try {
      const mode = await writeArtist(name, patch);
      if (mode !== "local-warned") showToast("Dados bancários salvos.");
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
    if (activeDateKey) lines.push(`Data: ${formatBrDate(activeDateKey)} — Pato ${UNIT_BY_ID[currentUnit].nome}`);
    if (fBankTitular.value.trim()) lines.push(`Titular: ${fBankTitular.value.trim()}`);
    if (fBankDoc.value.trim()) lines.push(`CPF/CNPJ: ${fBankDoc.value.trim()}`);
    if (fBankPix.value.trim()) lines.push(`PIX: ${fBankPix.value.trim()}`);
    if (fBankOutros.value.trim()) lines.push(`Banco: ${fBankOutros.value.trim()}`);
    if (lines.length <= 2) {
      showToast("Nenhum dado bancário preenchido ainda.");
      return;
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      showToast("Dados copiados — cole pra enviar ao financeiro.");
    } catch (err) {
      console.error(err);
      showToast("Não deu pra copiar. Copia manualmente.");
    }
  });

  /* ── compartilhar agenda como imagem (identidade do Pato) ──
     Segue os posts do @patocomlaranja: fundo preto granulado, "AGENDA"
     espaçado em branco, laranja em itálico, brilho laranja no rodapé. */
  const BRAND = {
    bg: "#1b1b1b",
    orange: "#f2a541",
    white: "#f3f1ec",
    grey: "#a9a59d",
    faint: "#6f6b65",
  };
  const FONT_WIDE = "'Lexend', 'Helvetica Neue', Arial, sans-serif";
  const FONT_SLANT = "'Montserrat', 'Helvetica Neue', Arial, sans-serif";

  let logoImgPromise = null;
  function loadLogo() {
    if (!logoImgPromise) {
      logoImgPromise = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = "icons/pato-logo.png";
      });
    }
    return logoImgPromise;
  }

  async function ensureShareFonts() {
    if (!document.fonts || !document.fonts.load) return;
    try {
      await Promise.all([
        document.fonts.load(`400 40px Lexend`),
        document.fonts.load(`300 20px Lexend`),
        document.fonts.load(`italic 600 40px Montserrat`),
        document.fonts.load(`italic 700 40px Montserrat`),
      ]);
    } catch (err) {}
  }

  function spacedText(ctx, text, x, y, spacing, align) {
    // letterSpacing no canvas ainda não é universal (Safari antigo)
    const chars = [...text];
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    const prev = ctx.textAlign;
    ctx.textAlign = "left";
    chars.forEach((c, i) => {
      ctx.fillText(c, cx, y);
      cx += widths[i] + spacing;
    });
    ctx.textAlign = prev;
    return total;
  }

  function fitFont(ctx, text, weightStyle, size, family, maxWidth, spacing = 0) {
    let s = size;
    for (; s > 10; s -= 1) {
      ctx.font = `${weightStyle} ${s}px ${family}`;
      const w = ctx.measureText(text).width + spacing * Math.max(0, [...text].length - 1);
      if (w <= maxWidth) break;
    }
    return s;
  }

  function drawGrain(ctx, W, H) {
    const tile = document.createElement("canvas");
    tile.width = 160;
    tile.height = 160;
    const tctx = tile.getContext("2d");
    const img = tctx.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 10;
    }
    tctx.putImageData(img, 0, 0);
    ctx.fillStyle = ctx.createPattern(tile, "repeat");
    ctx.fillRect(0, 0, W, H);
  }

  function drawRings(ctx, cx, cy) {
    ctx.save();
    ctx.strokeStyle = "rgba(243,241,236,0.75)";
    ctx.lineWidth = 2;
    [-9, 9].forEach((dy) => {
      ctx.beginPath();
      ctx.ellipse(cx, cy + dy, 82, 22, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawSparkle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  }

  function canvasBase(W, H) {
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = BRAND.bg;
    ctx.fillRect(0, 0, W, H);
    // brilho laranja no rodapé, como nos stories
    const glow = ctx.createRadialGradient(W / 2, H + 260, 60, W / 2, H + 260, 620);
    glow.addColorStop(0, "rgba(242,165,65,0.42)");
    glow.addColorStop(0.55, "rgba(242,165,65,0.12)");
    glow.addColorStop(1, "rgba(242,165,65,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    drawGrain(ctx, W, H);
    return { canvas, ctx };
  }

  function drawFooterMark(ctx, W, y) {
    ctx.fillStyle = BRAND.white;
    ctx.font = `400 15px ${FONT_WIDE}`;
    ctx.textBaseline = "middle";
    spacedText(ctx, "PATO COM LARANJA", W / 2, y, 4.5, "center");
    drawSparkle(ctx, W / 2 - 168, y, 9);
    drawSparkle(ctx, W / 2 + 168, y, 9);
  }

  /* rows: [{ key, unit, e }] já filtradas e ordenadas */
  async function buildShareCanvas(rows, subtitle, rangeLabel) {
    await ensureShareFonts();
    const logo = await loadLogo();

    const W = 1080;
    const padX = 84;
    const showUnit = false;
    const units = [...new Set(rows.map((r) => r.unit.id))].map((id) => UNIT_BY_ID[id]);

    // agrupa por dia: data à esquerda, um ou mais nomes à direita
    const days = [];
    rows.forEach((r) => {
      const last = days[days.length - 1];
      if (last && last.key === r.key) last.items.push(r);
      else days.push({ key: r.key, items: [r] });
    });
    const itemH = showUnit ? 78 : 70;
    const dayGap = 34;
    const listH = days.reduce((acc, d) => acc + d.items.length * itemH, 0) + Math.max(0, days.length - 1) * dayGap;

    const headerH = 520;
    const addrH = showUnit ? 120 + units.length * 44 : 150;
    const footerH = 150;
    const H = Math.max(1350, headerH + listH + 70 + addrH + footerH);

    const { canvas, ctx } = canvasBase(W, H);
    ctx.textBaseline = "middle";

    if (logo) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, 112, 56, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logo, W / 2 - 56, 56, 112, 112);
      ctx.restore();
    }

    drawRings(ctx, 150, 285);
    drawRings(ctx, W - 150, 285);

    ctx.fillStyle = BRAND.white;
    ctx.font = `400 84px ${FONT_WIDE}`;
    spacedText(ctx, "AGENDA", W / 2, 285, 14, "center");

    ctx.fillStyle = BRAND.orange;
    const subSize = fitFont(ctx, subtitle, "italic 600", 56, FONT_SLANT, W - 2 * padX);
    ctx.font = `italic 600 ${subSize}px ${FONT_SLANT}`;
    ctx.textAlign = "center";
    ctx.fillText(subtitle, W / 2, 372);

    ctx.font = `italic 600 50px ${FONT_SLANT}`;
    ctx.fillText(rangeLabel, W / 2, 452);
    ctx.textAlign = "left";

    let y = headerH + 20;
    const dateColW = 170;
    days.forEach((d, i) => {
      if (i > 0) {
        ctx.strokeStyle = "rgba(242,165,65,0.16)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padX, y + dayGap / 2 - 4);
        ctx.lineTo(W - padX, y + dayGap / 2 - 4);
        ctx.stroke();
        y += dayGap;
      }
      const blockTop = y;
      ctx.fillStyle = BRAND.orange;
      ctx.font = `italic 700 40px ${FONT_SLANT}`;
      ctx.fillText(formatBrDate(d.key).slice(0, 5), padX, blockTop + 24);
      ctx.fillStyle = BRAND.grey;
      ctx.font = `400 15px ${FONT_WIDE}`;
      spacedText(ctx, weekdayNameFromKey(d.key).slice(0, 3).toUpperCase(), padX + 2, blockTop + 58, 3);

      d.items.forEach(({ unit, e }) => {
        const nameX = padX + dateColW;
        const maxW = W - padX - nameX;
        const name = e.artista.toUpperCase();
        ctx.fillStyle = BRAND.white;
        const nSize = fitFont(ctx, name, "400", 30, FONT_WIDE, maxW, 3);
        ctx.font = `400 ${nSize}px ${FONT_WIDE}`;
        spacedText(ctx, name, nameX, y + 22, 3);

        const sub = [showUnit ? unit.nome.toUpperCase() : null, e.horario, e.tipo === "AOVIVO" ? "AO VIVO" : null, e.estilo]
          .filter(Boolean).join("  ·  ");
        if (sub) {
          ctx.fillStyle = showUnit ? BRAND.orange : BRAND.grey;
          const sSize = fitFont(ctx, sub, "300", 16, FONT_WIDE, maxW, 2);
          ctx.font = `300 ${sSize}px ${FONT_WIDE}`;
          spacedText(ctx, sub, nameX, y + 54, 2);
        }
        y += itemH;
      });
      y = Math.max(y, blockTop + 76);
    });

    // endereços das unidades que aparecem na arte — o "VEM PRO PATO!"
    y += 70;
    ctx.fillStyle = BRAND.orange;
    ctx.font = `italic 600 44px ${FONT_SLANT}`;
    ctx.textAlign = "center";
    ctx.fillText("VEM PRO PATO!", W / 2, y);
    ctx.textAlign = "left";
    y += 62;
    ctx.fillStyle = BRAND.white;
    units.forEach((u) => {
      const line = `${u.nome.toUpperCase()}  |  ${u.endereco.toUpperCase()}`;
      const s = fitFont(ctx, line, "300", 18, FONT_WIDE, W - 2 * padX, 3.2);
      ctx.font = `300 ${s}px ${FONT_WIDE}`;
      spacedText(ctx, line, W / 2, y, 3.2, "center");
      y += 44;
    });

    drawFooterMark(ctx, W, H - 70);
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

  /* Escalas pra arte: tira as canceladas (é material de divulgação). */
  function bookingsInRange(startDay, endDay) {
    const rows = [];
    const units = [UNIT_BY_ID[currentUnit]];
    for (let day = startDay; day <= endDay; day++) {
      const key = dateKey(view.year, view.month, day);
      units.forEach((unit) => {
        const e = bookingFor(key, unit.id);
        if (e && e.artista && e.status !== "cancelado") rows.push({ key, unit, e });
      });
    }
    return rows;
  }

  function shareSubtitle() {
    return `PATO ${UNIT_BY_ID[currentUnit].nome.toUpperCase()}`;
  }

  function slug() {
    return currentUnit;
  }

  async function shareRange(rows, fileSuffix) {
    const first = rows[0].key;
    const last = rows[rows.length - 1].key;
    const label = first === last ? formatBrDate(first).slice(0, 5) : `${formatBrDate(first).slice(0, 5)} - ${formatBrDate(last).slice(0, 5)}`;
    const canvas = await buildShareCanvas(rows, shareSubtitle(), label);
    shareOrDownloadCanvas(canvas, `pato-agenda-${slug()}-${fileSuffix}.png`, `Agenda Pato — ${label}`);
  }

  document.getElementById("share-agenda").addEventListener("click", () => {
    const rows = bookingsInRange(1, daysInMonth(view.year, view.month));
    if (!rows.length) {
      showToast("Nenhuma escala cadastrada nesse mês ainda.");
      return;
    }
    shareRange(rows, `${view.year}-${pad2(view.month)}`);
  });

  /* ── carta do DJ (PDF): mesmo esquema do guia técnico do Frisson —
     manda o arquivo pelo menu de compartilhar, com o link de reserva. ── */
  document.getElementById("carta-dj").addEventListener("click", async () => {
    try {
      const blob = await (await fetch(CARTA_URL)).blob();
      const file = new File([blob], "pato-carta-dj.pdf", { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Carta do DJ — Pato com Laranja" });
        return;
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
      console.error(err);
    }
    if (navigator.share) {
      try {
        await navigator.share({ url: CARTA_URL, title: "Carta do DJ — Pato com Laranja" });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(CARTA_URL);
      showToast("Link da carta copiado — cole no WhatsApp.");
    } catch (err) {
      window.open(CARTA_URL, "_blank", "noopener");
    }
  });

  /* ── csv export ────────────────────────────────────────── */
  document.getElementById("export-csv").addEventListener("click", () => {
    const total = daysInMonth(view.year, view.month);
    const units = [UNIT_BY_ID[currentUnit]];
    const rows = [["Data", "Dia da Semana", "Unidade", "Horário", "Artista", "Evento", "Email", "Telefone", "Programação", "Estilo Musical", "Status"]];
    for (let day = 1; day <= total; day++) {
      const key = dateKey(view.year, view.month, day);
      units.forEach((u) => {
        const e = bookingFor(key, u.id);
        if (!e || !e.artista) return;
        rows.push([
          formatBrDate(key),
          weekdayNameFromKey(key),
          u.nome,
          e.horario || "",
          e.artista || "",
          e.evento || "",
          e.email || "",
          e.telefone || "",
          TIPO_LABELS[e.tipo] || e.tipo || "",
          e.estilo || "",
          e.status || "",
        ]);
      });
    }
    if (rows.length === 1) {
      showToast("Nenhuma escala nesse mês pra exportar.");
      return;
    }
    const csv = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pato-agenda-${slug()}-${view.year}-${pad2(view.month)}.csv`;
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
    toastTimer = setTimeout(() => (el.hidden = true), 2800);
  }

  /* ── service worker (habilita instalar como app) ──────── */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw-pato.js").catch(() => {});
    });
  }

  /* ── init ──────────────────────────────────────────────── */
  renderUnit();
  renderCalendar();
  if (isUnlocked()) startApp();
  else showLoginGate();
})();
