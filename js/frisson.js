/* frisson · agenda de djs — lógica do app (sem backend, localStorage) */

(() => {
  "use strict";

  const STORAGE_KEY = "frisson_agenda_data_v1";
  const TEMPLATES_KEY = "frisson_agenda_templates_v1";
  const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  const DEFAULT_TEMPLATES = {
    convite: "Oi {artista}! Aqui é do Frisson 🎶 Queria te chamar pra tocar no dia {data} ({diaSemana}), set de {estilo}. Topa?",
    confirmacao: "Fechado, {artista}! Confirmando sua data no Frisson: {data} ({diaSemana}), set {tipo} ({estilo}). Chega uns 30 min antes. Qualquer coisa me chama por aqui 🙌",
    lembrete: "Oi {artista}, passando pra lembrar do seu set aqui no Frisson dia {data} ({diaSemana})! Nos vemos lá 🎧",
    agradecimento: "Foi ótimo ter você no Frisson dia {data}, {artista}! Obrigado pelo set 🙏 Já quero marcar a próxima.",
  };

  const TEMPLATE_LABELS = {
    convite: "Convite",
    confirmacao: "Confirmação",
    lembrete: "Lembrete",
    agradecimento: "Agradecimento",
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
  let data = loadData();
  let templates = loadTemplates();
  let activeDateKey = null;
  let activeTemplateKey = "convite";

  /* ── storage ───────────────────────────────────────────── */
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
    return { ...SEED_DATA };
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function loadTemplates() {
    try {
      const raw = localStorage.getItem(TEMPLATES_KEY);
      if (raw) return { ...DEFAULT_TEMPLATES, ...JSON.parse(raw) };
    } catch (e) {}
    return { ...DEFAULT_TEMPLATES };
  }

  function saveTemplates() {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
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

    const num = document.createElement("div");
    num.className = "day-num";
    num.textContent = day;
    cell.appendChild(num);

    if (entry && entry.artista) {
      const artist = document.createElement("div");
      artist.className = "day-artist";
      artist.textContent = entry.artista;
      cell.appendChild(artist);

      const tags = document.createElement("div");
      tags.className = "day-tags";

      if (entry.tipo === "RADIO") {
        const t = document.createElement("span");
        t.className = "tag tag-radio";
        t.textContent = "Rádio";
        tags.appendChild(t);
      }

      if (entry.status) {
        const s = document.createElement("span");
        s.className = `tag status-${entry.status}`;
        s.textContent = entry.status.charAt(0).toUpperCase() + entry.status.slice(1);
        tags.appendChild(s);
      }

      cell.appendChild(tags);
    }

    cell.addEventListener("click", () => openDayPanel(key));
    return cell;
  }

  /* ── month navigation ──────────────────────────────────── */
  document.getElementById("prev-month").addEventListener("click", () => {
    view.month--;
    if (view.month < 1) { view.month = 12; view.year--; }
    renderCalendar();
  });

  document.getElementById("next-month").addEventListener("click", () => {
    view.month++;
    if (view.month > 12) { view.month = 1; view.year++; }
    renderCalendar();
  });

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

  document.getElementById("save-day").addEventListener("click", () => {
    if (!activeDateKey) return;
    const entry = readDayForm();
    if (!entry.artista) {
      showToast("Digite o nome do artista antes de salvar.");
      return;
    }
    data[activeDateKey] = entry;
    saveData();
    renderCalendar();
    updateWaPreview();
    showToast("Escala salva.");
  });

  document.getElementById("delete-day").addEventListener("click", () => {
    if (!activeDateKey) return;
    delete data[activeDateKey];
    saveData();
    renderCalendar();
    closeDayPanel();
    showToast("Dia limpo.");
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
      .replaceAll("{bar}", "Frisson");
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

  document.getElementById("save-templates").addEventListener("click", () => {
    Object.keys(tplFields).forEach((k) => (templates[k] = tplFields[k].value));
    saveTemplates();
    showToast("Mensagens padrão salvas.");
  });

  document.getElementById("reset-templates").addEventListener("click", () => {
    templates = { ...DEFAULT_TEMPLATES };
    saveTemplates();
    Object.keys(tplFields).forEach((k) => (tplFields[k].value = templates[k]));
    showToast("Mensagens restauradas ao padrão.");
  });

  backdrop.addEventListener("click", () => {
    closeDayPanel();
    closeTemplatesPanel();
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
