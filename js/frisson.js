/* frisson · agenda de djs — lógica do app (sincronizada via Firebase) */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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

  const fbApp = initializeApp(firebaseConfig);
  const auth = getAuth(fbApp);
  const db = getFirestore(fbApp);
  const bookingsCol = collection(db, "bookings");
  const templatesDocRef = doc(db, "settings", "templates");

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
    "2026-08-06": { artista: "Rafael Capetini", tipo: "DJ", estilo: "Disco/House/Funk", status: "confirmado" },
    "2026-08-07": { artista: "Facchineti", evento: "After Doce Mara", tipo: "DJ", estilo: "Disco/House/Funk", status: "confirmado" },
    "2026-08-08": { artista: "Mangodjs", evento: "After Doce Mara", tipo: "DJ", estilo: "Disco/House/Funk", status: "confirmado" },
    "2026-08-12": { artista: "Frisson", tipo: "RADIO", estilo: "Disco/House", status: "confirmado" },
    "2026-08-13": { artista: "Gigios", tipo: "DJ", estilo: "Disco/House", status: "confirmado" },
    "2026-08-14": { artista: "Chance", tipo: "DJ", estilo: "Hip-Hop", status: "confirmado" },
    "2026-08-15": { artista: "Man from Rio", tipo: "DJ", estilo: "Disco/House/Funk", status: "confirmado" },
    "2026-08-19": { artista: "Enrico Sarneri", tipo: "RADIO", estilo: "Música Br", status: "confirmado" },
    "2026-08-20": { artista: "So Lyma", tipo: "DJ", estilo: "Disco/House", status: "confirmado" },
    "2026-08-21": { artista: "Nepal", tipo: "DJ", estilo: "Open Format", status: "confirmado" },
    "2026-08-22": { artista: "Elisa Amaral", tipo: "DJ", estilo: "House", status: "confirmado" },
    "2026-08-26": { artista: "Frisson", tipo: "RADIO", estilo: "Open Format", status: "confirmado" },
    "2026-08-27": { artista: "Marecia", tipo: "DJ", estilo: "Disco/House", status: "confirmado" },
    "2026-08-28": { artista: "Marcelinho da Lua", tipo: "DJ", estilo: "Disco/House", status: "confirmado" },
    "2026-08-29": { artista: "Pluma Bea", tipo: "DJ", estilo: "Disco/House/Trip Hop", status: "confirmado" },
    "2026-09-03": { artista: "Thales", tipo: "DJ", estilo: "", status: "confirmado" },
    "2026-09-04": { artista: "Lets Gabz", tipo: "DJ", estilo: "", status: "confirmado" },
    "2026-09-10": { artista: "Thales", tipo: "DJ", estilo: "", status: "confirmado" },
    "2026-09-11": { artista: "David Talipba", tipo: "DJ", estilo: "", status: "confirmado" },
    "2026-09-17": { artista: "Yas", tipo: "DJ", estilo: "", status: "confirmado" },
    "2026-09-18": { artista: "Leo Janeiro", tipo: "DJ", estilo: "", status: "confirmado" },
    "2026-09-24": { artista: "Lets Gabz", tipo: "DJ", estilo: "", status: "confirmado" },
  };

  /* ── state ─────────────────────────────────────────────── */
  const today = new Date();
  let view = { year: today.getFullYear(), month: today.getMonth() + 1 }; // month 1-12
  let data = {};
  let templates = { ...DEFAULT_TEMPLATES };
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

  signInAnonymously(auth).catch((err) => {
    console.error(err);
    showToast("Erro ao conectar. Recarregue a página.");
  });

  onAuthStateChanged(auth, (user) => {
    if (user) startSync();
  });

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

  /* ── render: calendar ──────────────────────────────────── */
  const calGrid = document.getElementById("cal-grid");
  const monthLabel = document.getElementById("month-label");

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
    for (let day = 1; day <= total; day++) {
      const key = dateKey(view.year, view.month, day);
      const entry = data[key];
      calGrid.appendChild(buildDayCell(key, day, entry));
    }
  }

  function buildDayCell(key, day, entry) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day-cell" + (isTodayKey(key) ? " is-today" : "");
    cell.setAttribute("aria-label", `${day} — abrir escala do dia`);

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

    if (entry && entry.artista) {
      const content = document.createElement("div");
      content.className = "day-content";

      const artist = document.createElement("div");
      artist.className = "day-artist";
      artist.textContent = entry.artista;
      content.appendChild(artist);

      if (entry.tipo === "RADIO") {
        const tags = document.createElement("div");
        tags.className = "day-tags";
        const t = document.createElement("span");
        t.className = "tag tag-radio";
        t.textContent = "Rádio";
        tags.appendChild(t);
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

    cell.addEventListener("click", () => openDayPanel(key));
    return cell;
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
    try {
      await setDoc(doc(bookingsCol, activeDateKey), entry);
      showToast("Escala salva.");
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar. Tenta de novo.");
    }
  });

  document.getElementById("delete-day").addEventListener("click", async () => {
    if (!activeDateKey) return;
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
    try {
      await setDoc(templatesDocRef, templates);
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

  function buildShareCanvas(rows) {
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

    const monthTitle = `${MONTH_NAMES[view.month - 1]} ${view.year}`;
    ctx.textAlign = "right";
    ctx.fillStyle = "#a7e3ea";
    ctx.font = "600 21px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
    ctx.fillText(monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1), W - padX, badgeCY + 5);
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

  document.getElementById("share-agenda").addEventListener("click", () => {
    const rows = monthBookings();
    if (!rows.length) {
      showToast("Nenhuma escala cadastrada nesse mês ainda.");
      return;
    }
    const canvas = buildShareCanvas(rows);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const fileName = `frisson-agenda-${view.year}-${pad2(view.month)}.png`;
      const monthTitle = `${MONTH_NAMES[view.month - 1]} ${view.year}`;

      if (navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: `Agenda Frisson — ${monthTitle}` });
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
      showToast("Imagem da agenda salva.");
    }, "image/png");
  });

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

  /* ── init ──────────────────────────────────────────────── */
  renderCalendar();
})();
