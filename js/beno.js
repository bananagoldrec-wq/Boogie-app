/* beno · negociação de shows — pipeline de curadores, agenda e WhatsApp.
   Mesma arquitetura da agenda do Frisson: sincroniza via Firebase quando dá,
   e cai pro armazenamento local do aparelho quando o Firebase não responde,
   pra que o app nunca fique travado numa tela vazia. */

(() => {
  "use strict";

  /* ── Firebase (opcional) ────────────────────────────────
     Mesma conta da agenda do Frisson, porém em coleções separadas
     (beno_*), pra não misturar os dados dos dois apps. Se as regras
     do Firestore não liberarem essas coleções, o app segue rodando
     100% local — veja o README. */
  const firebaseConfig = {
    apiKey: "AIzaSyBq_x9Mfyv0aT-wblKcbWScUGn1htCg_3g",
    authDomain: "frisson-agenda.firebaseapp.com",
    projectId: "frisson-agenda",
    storageBucket: "frisson-agenda.firebasestorage.app",
    messagingSenderId: "28732138318",
    appId: "1:28732138318:web:67e28575aa1040770f741f",
  };

  let db, dealsCol, contactsCol, configDocRef;
  let doc, setDoc, deleteDoc, onSnapshot;
  let connected = false;

  /* Trava de acesso simples: senha única embutida no app, checada
     localmente. Segura visitante casual, mas não é segurança de verdade —
     quem ler o código do app acha a senha. Troque aqui quando quiser. */
  const APP_PASSWORD = "231019";
  /* o sufixo acompanha a senha: trocar a senha desconecta os aparelhos
     que já estavam destravados, em vez de deixá-los entrando pela antiga */
  const UNLOCK_KEY = "beno_negocia_unlocked_v2";
  const LOCAL_KEY = "beno_negocia_data_v1";

  const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  /* ── Etapas do funil ────────────────────────────────────
     followupDays = em quantos dias cobrar de novo depois de mexer
     na negociação. 0 = etapa final, não gera cobrança. */
  const STAGES = [
    { key: "a_contatar", label: "A contatar", followupDays: 1 },
    { key: "contatado", label: "Contatado", followupDays: 3 },
    { key: "conversando", label: "Conversando", followupDays: 4 },
    { key: "proposta", label: "Proposta enviada", followupDays: 2 },
    { key: "fechado", label: "Fechado", followupDays: 0 },
    { key: "tocou", label: "Já tocou", followupDays: 0 },
    { key: "recusado", label: "Recusado", followupDays: 0 },
  ];

  const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));
  const TERMINAL_STAGES = ["fechado", "tocou", "recusado"];

  /* Etapa sugerida ao mandar mensagem: quem ainda não foi contatado
     passa a "contatado" sozinho assim que a mensagem é aberta. */
  const STAGE_AFTER_MESSAGE = { a_contatar: "contatado" };

  /* Press kit hospedado junto do app — link fixo, sempre no ar, que o
     Beno manda pros curadores. Absoluto porque vai viajar pro WhatsApp. */
  const PRESSKIT_BASE = "https://bananagoldrec-wq.github.io/Boogie-app/press";
  const PRESSKIT_URL = `${PRESSKIT_BASE}/beno-presskit-pt.pdf`;
  const PRESSKIT_EN_URL = `${PRESSKIT_BASE}/beno-presskit-en.pdf`;

  const DEFAULT_CONFIG = {
    dj: "Beno",
    estiloPadrao: "Disco/Boogie/House",
    linkSet: "",
    linkInsta: "",
    googleClientId: "",
    googleCalendarId: "",
    templates: {
      primeiroContato: "Oi {curador}, tudo bem? Aqui é o {dj}, DJ do Rio 🎧 Acompanho o trabalho de vocês no {casa} e queria muito tocar aí. Meu set é de {estilo}. Posso te mandar meu material?",
      apresentacao: "{curador}, segue meu press kit: {presskit} — Instagram {linkInsta}. Set de {estilo}, tocando bastante aqui no Rio. Se abrir alguma data no {casa} me chama que eu me viro pra encaixar 🙌",
      apresentacaoEn: "Hi {curador}, this is {dj}, DJ from Rio 🎧 Here's my press kit: {presskitEn} — Instagram {linkInsta}. I play {estilo} and I'd love to play at {casa}. Any date coming up?",
      proposta: "Oi {curador}! Sobre a data {data} ({diaSemana}) no {casa}: fecho por {cache}. Levo set de {estilo}, no tempo que vocês precisarem. Topa?",
      followup: "Opa {curador}, tudo certo? Passando pra não perder o fio — conseguiu ver a possibilidade de data no {casa}? Qualquer coisa me chama 🙏",
      confirmacao: "Fechadíssimo, {curador}! Confirmado então: {data} ({diaSemana}) no {casa}. Chego com antecedência e já te mando os dados pra nota. Valeu demais 🎶",
      agradecimento: "{curador}, foi ótimo tocar no {casa} dia {data}! Obrigado pela confiança 🙏 Fico à disposição pra próxima.",
      reativacao: "Oi {curador}! Faz um tempo que a gente não se fala. Tô com set novo de {estilo} e queria voltar a tocar no {casa}. Tem alguma data aí pra frente?",
    },
  };

  const TEMPLATE_LABELS = {
    primeiroContato: "1º contato",
    apresentacao: "Apresentação",
    apresentacaoEn: "Apresentação (EN)",
    proposta: "Proposta",
    followup: "Follow-up",
    confirmacao: "Confirmação",
    agradecimento: "Agradecimento",
    reativacao: "Reativar",
  };

  /* ── Shows já marcados, lançados a partir da agenda do Beno ──
     Entram uma vez só por aparelho (SEED_KEY marca que já rodou, pra
     não ressuscitarem depois de apagados). O id é fixo por data, então
     ligar a sincronização depois não duplica nada. */
  const SEED_KEY = "beno_seed_agenda_v1";
  const SEED_SHOWS = [
    { data: "2026-09-13", casa: "Quinta m…", cortado: true },
    { data: "2026-09-15", casa: "Baz" },
    { data: "2026-09-17", casa: "Vienna" },
    { data: "2026-09-18", casa: "Slovakia" },
    { data: "2026-09-23", casa: "Amor reco…", cortado: true },
    { data: "2026-09-25", casa: "Alvine" },
    { data: "2026-09-26", casa: "Lux" },
    { data: "2026-10-09", casa: "Zurich" },
    { data: "2026-10-10", casa: "Zurich" },
  ];

  /* Curadores passados pelo Beno. Cada um entra como contato e já abre
     uma negociação em "A contatar", pronta pro primeiro contato.
     Cada lote tem sua própria chave, pra que um lote novo entre sem
     ressuscitar quem foi apagado de um lote anterior. */
  const SEED_CURADOR_LOTES = [
    {
      key: "beno_seed_curadores_v1",
      curadores: [
        { nome: "Bernardo Campos", whatsapp: "+55 21 99130-4661" },
        { nome: "Gui Varella", whatsapp: "+55 21 99890-9024" },
        { nome: "Mexicano", whatsapp: "+55 11 98755-8876" },
        { nome: "Douglas Reis", whatsapp: "+55 11 91315-3913", email: "douglas@asapdigital.agency" },
        { nome: "André", whatsapp: "+55 19 3656-5999" },
      ],
    },
    {
      key: "beno_seed_curadores_v2",
      curadores: [
        { nome: "Maz", whatsapp: "+351 910 469 507" },
        { nome: "HUGO_FRASA", whatsapp: "+55 11 93474-2620" },
        { nome: "Thiago Guiselini", whatsapp: "+351 964 535 586" },
        { nome: "Nuno Leote (princesa)", whatsapp: "+351 966 703 329", notas: 'Status do WhatsApp: "Punji Stick" — confirmar se é a festa/casa dele.' },
        { nome: "Facchinetti", whatsapp: "+55 21 96929-5800", email: "fatchiapizza@gmail.com", notas: 'Status do WhatsApp: "Sobre Fatchia somente fatchiapizza@gmail.com".' },
        { nome: "Marco Antonio", whatsapp: "+55 21 99985-8313", notas: 'Conta comercial no WhatsApp, categoria "Arts & entertainment". Atende 09:00–18:00.' },
        { nome: "Caio Bucker", whatsapp: "+55 21 99942-3957" },
        {
          nome: "Mikolaï",
          casa: "Picture Perfect Agency",
          funcao: "booker",
          whatsapp: "+33 6 72 60 34 93",
          email: "mikolai@pictureperfect-agency.com",
          notas: "Talent agent. Site: https://www.pictureperfect-agency.com — atende sexta só com hora marcada.",
        },
        { nome: "Marie Bouret", whatsapp: "+55 21 98425-2021" },
      ],
    },
  ];

  /* ── Estado ─────────────────────────────────────────────── */
  const today = new Date();
  const TODAY_KEY = keyFromDate(today);

  let deals = {};
  let contacts = {};
  let config = deepClone(DEFAULT_CONFIG);

  let currentView = "pipeline";
  let view = { year: today.getFullYear(), month: today.getMonth() + 1 };
  let dealFilter = "";
  let contactFilter = "";
  let onlyLate = false;
  let activeDealId = null;
  let activeContactId = null;
  let activeTemplateKey = "primeiroContato";
  let importCandidates = [];

  /* ── Helpers gerais ─────────────────────────────────────── */
  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function newId() {
    if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function dateKey(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }
  function keyFromDate(d) { return dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function firstWeekday(y, m) { return new Date(y, m - 1, 1).getDay(); }

  function addDays(dateObj, delta) {
    const d = new Date(dateObj);
    d.setDate(d.getDate() + delta);
    return d;
  }

  function addDaysKey(key, delta) {
    const [y, m, d] = key.split("-").map(Number);
    return keyFromDate(addDays(new Date(y, m - 1, d), delta));
  }

  function formatBrDate(key) {
    if (!key) return "";
    const [y, m, d] = key.split("-");
    return `${d}/${m}/${y}`;
  }

  function formatShortDate(key) {
    if (!key) return "";
    const [, m, d] = key.split("-");
    return `${d}/${m}`;
  }

  function weekdayNameFromKey(key) {
    if (!key) return "";
    const [y, m, d] = key.split("-").map(Number);
    return WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()];
  }

  function formatMoney(value) {
    const n = Number(value);
    if (!n) return "";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  }

  function normalizePhone(raw) {
    const str = (raw || "").trim();
    const digits = str.replace(/\D/g, "");
    if (!digits) return "";
    /* Escrito com "+", o código do país já está ali — não mexer. Sem o "+",
       um celular francês (+33, 11 dígitos) viraria um número brasileiro. */
    if (str.startsWith("+")) return digits;
    if (digits.length <= 11) return "55" + digits; // sem DDI, assume Brasil
    return digits;
  }

  function prettyPhone(raw) {
    const str = (raw || "").trim();
    // fora do Brasil, mantém como o Beno escreveu — o formato (DD) é daqui
    if (str.startsWith("+") && !str.startsWith("+55")) return str;
    const digits = str.replace(/\D/g, "").replace(/^55/, "");
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return raw || "";
  }

  function normalizeName(str) {
    return (str || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  /* ── Feriados (nacionais + Rio de Janeiro) ──────────────── */
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

  const holidayCache = {};
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
    map[dateKey(year, 10, 12)] = "N. Sra. Aparecida";
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
    return holidaysForYear(Number(key.slice(0, 4)))[key];
  }

  /* ── Armazenamento ──────────────────────────────────────
     localStorage é sempre gravado (funciona offline e sem Firebase).
     Quando o Firebase conecta, ele vira a fonte da verdade e o
     localStorage segue como espelho pra leitura offline. */

  function saveLocal() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ deals, contacts, config }));
    } catch (err) {
      console.error("Não deu pra salvar localmente:", err);
    }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      deals = parsed.deals || {};
      contacts = parsed.contacts || {};
      config = { ...DEFAULT_CONFIG, ...(parsed.config || {}), templates: { ...DEFAULT_CONFIG.templates, ...((parsed.config || {}).templates || {}) } };
    } catch (err) {
      console.error("Não deu pra ler os dados locais:", err);
    }
  }

  async function persistDeal(deal) {
    deals[deal.id] = deal;
    saveLocal();
    if (connected) {
      try { await setDoc(doc(dealsCol, deal.id), deal); } catch (err) { console.error(err); }
    }
  }

  async function persistContact(contact) {
    contacts[contact.id] = contact;
    saveLocal();
    if (connected) {
      try { await setDoc(doc(contactsCol, contact.id), contact); } catch (err) { console.error(err); }
    }
  }

  async function persistConfig() {
    saveLocal();
    if (connected) {
      try { await setDoc(configDocRef, config); } catch (err) { console.error(err); }
    }
  }

  async function removeDeal(id) {
    delete deals[id];
    saveLocal();
    if (connected) {
      try { await deleteDoc(doc(dealsCol, id)); } catch (err) { console.error(err); }
    }
  }

  async function removeContact(id) {
    delete contacts[id];
    saveLocal();
    if (connected) {
      try { await deleteDoc(doc(contactsCol, id)); } catch (err) { console.error(err); }
    }
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
      deleteDoc = fsMod.deleteDoc;
      onSnapshot = fsMod.onSnapshot;

      const fbApp = appMod.initializeApp(firebaseConfig);
      const auth = authMod.getAuth(fbApp);
      db = fsMod.getFirestore(fbApp);
      dealsCol = fsMod.collection(db, "beno_negociacoes");
      contactsCol = fsMod.collection(db, "beno_contatos");
      configDocRef = doc(db, "beno_config", "app");

      authMod.signInAnonymously(auth).catch((err) => console.error(err));

      authMod.onAuthStateChanged(auth, (user) => {
        if (!user || connected) return;
        connected = true;
        startSync();
      });
    } catch (err) {
      console.error("Firebase indisponível, seguindo em modo local:", err);
    }
  }

  let firstDealsSnapshot = true;

  function startSync() {
    onSnapshot(dealsCol, (snap) => {
      const next = {};
      snap.forEach((d) => { next[d.id] = d.data(); });
      if (firstDealsSnapshot) {
        firstDealsSnapshot = false;
        // Primeira sincronização: sobe o que já existia neste aparelho.
        const localOnly = Object.values(deals).filter((d) => !next[d.id]);
        localOnly.forEach((d) => { next[d.id] = d; setDoc(doc(dealsCol, d.id), d).catch(console.error); });
      }
      deals = next;
      saveLocal();
      renderAll();
    }, (err) => {
      console.error(err);
      connected = false;
      showToast("Sem sincronização na nuvem — salvando só neste aparelho.");
    });

    onSnapshot(contactsCol, (snap) => {
      const next = {};
      snap.forEach((d) => { next[d.id] = d.data(); });
      Object.values(contacts).forEach((c) => {
        if (!next[c.id]) { next[c.id] = c; setDoc(doc(contactsCol, c.id), c).catch(console.error); }
      });
      contacts = next;
      saveLocal();
      renderAll();
    }, (err) => { console.error(err); connected = false; });

    onSnapshot(configDocRef, (snap) => {
      if (!snap.exists()) return;
      const remote = snap.data();
      config = { ...DEFAULT_CONFIG, ...remote, templates: { ...DEFAULT_CONFIG.templates, ...(remote.templates || {}) } };
      saveLocal();
    }, (err) => console.error(err));
  }

  /* ── Modelo: negociações ────────────────────────────────── */

  function makeDeal(overrides) {
    return {
      id: newId(),
      contato: "",
      contatoId: "",
      casa: "",
      bairro: "",
      whatsapp: "",
      etapa: "a_contatar",
      dataAlvo: "",
      cachePedido: "",
      cacheFechado: "",
      estilo: "",
      notas: "",
      ultimoContato: "",
      proximoFollowup: "",
      googleUid: "", // id do evento no Google Agenda, quando veio de lá
      historico: [],
      criadoEm: TODAY_KEY,
      ...overrides,
    };
  }

  function isLate(deal) {
    if (!deal.proximoFollowup) return false;
    if (TERMINAL_STAGES.includes(deal.etapa)) return false;
    return deal.proximoFollowup <= TODAY_KEY;
  }

  function lateDeals() {
    return Object.values(deals).filter(isLate);
  }

  /* Marca que houve contato agora e agenda a próxima cobrança
     conforme a etapa em que a negociação está. */
  function touchDeal(deal, options) {
    const opts = options || {};
    deal.ultimoContato = TODAY_KEY;
    if (opts.advanceFromMessage && STAGE_AFTER_MESSAGE[deal.etapa]) {
      deal.etapa = STAGE_AFTER_MESSAGE[deal.etapa];
    }
    const stage = STAGE_BY_KEY[deal.etapa];
    deal.proximoFollowup = stage && stage.followupDays > 0 ? addDaysKey(TODAY_KEY, stage.followupDays) : "";
    return deal;
  }

  function addHistory(deal, texto) {
    if (!texto) return;
    if (!Array.isArray(deal.historico)) deal.historico = [];
    deal.historico.unshift({ data: TODAY_KEY, texto });
    deal.historico = deal.historico.slice(0, 40);
  }

  function matchesDealFilter(deal) {
    if (onlyLate && !isLate(deal)) return false;
    if (!dealFilter) return true;
    const hay = normalizeName([deal.casa, deal.contato, deal.bairro, deal.estilo, deal.notas].join(" "));
    return hay.includes(normalizeName(dealFilter));
  }

  function seedId(dataAlvo, casa) {
    const slug = normalizeName(casa).replace(/[^a-z0-9]+/g, "") || "show";
    return `seed-${dataAlvo}-${slug}`;
  }

  async function seedAgendaOnce() {
    try {
      if (localStorage.getItem(SEED_KEY)) return;
      localStorage.setItem(SEED_KEY, "1");
    } catch (err) {
      return; // sem localStorage não dá pra saber se já rodou — não semeia
    }
    for (const show of SEED_SHOWS) {
      await persistDeal(makeDeal({
        id: seedId(show.data, show.casa),
        casa: show.casa,
        dataAlvo: show.data,
        etapa: "fechado",
        notas: show.cortado ? "Nome veio cortado no print do Google Agenda — conferir." : "",
      }));
    }
    renderAll();
  }

  async function seedCuradoresOnce() {
    let semeou = false;

    for (const lote of SEED_CURADOR_LOTES) {
      try {
        if (localStorage.getItem(lote.key)) continue;
        localStorage.setItem(lote.key, "1");
      } catch (err) {
        return; // sem localStorage não dá pra saber se já rodou — não semeia
      }

      for (const cur of lote.curadores) {
        const slug = normalizeName(cur.nome).replace(/[^a-z0-9]+/g, "") || "curador";
        const contact = makeContact({
          id: `seed-cur-${slug}`,
          nome: cur.nome,
          casa: cur.casa || "",
          funcao: cur.funcao || "curador",
          whatsapp: cur.whatsapp,
          email: cur.email || "",
          notas: cur.notas || "",
        });
        await persistContact(contact);
        await persistDeal(makeDeal({
          id: `seed-neg-${slug}`,
          contato: cur.nome,
          contatoId: contact.id,
          casa: cur.casa || "",
          whatsapp: cur.whatsapp,
          etapa: "a_contatar",
          estilo: config.estiloPadrao,
        }));
        semeou = true;
      }
    }

    if (semeou) renderAll();
  }

  /* ── Modelo: contatos ───────────────────────────────────── */

  function makeContact(overrides) {
    return {
      id: newId(),
      nome: "",
      casa: "",
      bairro: "",
      funcao: "curador",
      whatsapp: "",
      instagram: "",
      email: "",
      estilo: "",
      cacheRef: "",
      melhorDia: "",
      notas: "",
      criadoEm: TODAY_KEY,
      ...overrides,
    };
  }

  function findContactByName(name) {
    const target = normalizeName(name);
    if (!target) return null;
    return Object.values(contacts).find((c) => normalizeName(c.nome) === target) || null;
  }

  /* Mantém o contato em dia com o que foi digitado na negociação —
     assim o cadastro cresce sozinho conforme ele negocia. */
  async function syncContactFromDeal(deal) {
    if (!deal.contato) return;
    let contact = deal.contatoId ? contacts[deal.contatoId] : findContactByName(deal.contato);
    if (!contact) {
      contact = makeContact({ nome: deal.contato });
    } else {
      contact = { ...contact };
    }
    contact.nome = deal.contato;
    if (deal.casa) contact.casa = deal.casa;
    if (deal.bairro) contact.bairro = deal.bairro;
    if (deal.whatsapp) contact.whatsapp = deal.whatsapp;
    if (deal.estilo && !contact.estilo) contact.estilo = deal.estilo;
    deal.contatoId = contact.id;
    await persistContact(contact);
  }

  /* ── Mensagens ──────────────────────────────────────────── */

  function buildMessage(templateKey, deal) {
    let tpl = (config.templates && config.templates[templateKey]) || "";
    const dataKey = deal.dataAlvo;
    /* Sem casa cadastrada, some com o trecho "no {casa}" inteiro — senão
       sai "tocar no sua casa", que entrega que a mensagem é automática. */
    if (!deal.casa) tpl = tpl.replace(/\s+n[oa]\s+\{casa\}/g, "");
    // idem pro Instagram: sem o perfil, sai "— Instagram." sozinho
    if (!config.linkInsta) tpl = tpl.replace(/\s*[—–-]?\s*Instagram\s+\{linkInsta\}/gi, "");
    return tpl
      .replaceAll("{curador}", deal.contato || "tudo bem")
      .replaceAll("{casa}", deal.casa || "")
      .replaceAll("{bairro}", deal.bairro || "")
      .replaceAll("{data}", dataKey ? formatBrDate(dataKey) : "a combinar")
      .replaceAll("{diaSemana}", dataKey ? weekdayNameFromKey(dataKey) : "dia a combinar")
      .replaceAll("{estilo}", deal.estilo || config.estiloPadrao || "")
      .replaceAll("{cache}", formatMoney(deal.cachePedido) || "combinar")
      .replaceAll("{dj}", config.dj || "Beno")
      .replaceAll("{linkSet}", config.linkSet || "")
      .replaceAll("{linkInsta}", config.linkInsta || "")
      .replaceAll("{presskit}", PRESSKIT_URL)
      .replaceAll("{presskitEn}", PRESSKIT_EN_URL)
      // sobra de espaço deixada por variável vazia
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([.,!?])/g, "$1")
      .trim();
  }

  /* Avisa antes de mandar uma mensagem que depende de um link que o
     Beno ainda não cadastrou — evita enviar um texto capenga ao curador. */
  function missingLinkFor(templateKey) {
    const tpl = (config.templates && config.templates[templateKey]) || "";
    if (tpl.includes("{linkSet}") && !config.linkSet) return "o link do seu set";
    if (tpl.includes("{linkInsta}") && !config.linkInsta) return "seu Instagram";
    return "";
  }

  /* ── Arrastar e soltar (mouse + toque) ──────────────────── */

  let dragPayload = null;
  let touchDrag = null;
  let suppressNextClick = false;

  function makeDragSource(el, payload) {
    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
      dragPayload = payload;
      e.dataTransfer.setData("text/plain", payload);
      e.dataTransfer.effectAllowed = "move";
      el.classList.add("drag-source");
    });
    el.addEventListener("dragend", () => {
      dragPayload = null;
      el.classList.remove("drag-source");
      document.querySelectorAll(".drag-over").forEach((n) => n.classList.remove("drag-over"));
    });

    el.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const timer = setTimeout(() => startTouchDrag(el, payload, t.clientX, t.clientY), 380);
      const cancel = () => { clearTimeout(timer); el.removeEventListener("touchend", cancel); el.removeEventListener("touchmove", onMove); };
      const onMove = (ev) => {
        if (touchDrag) return;
        const m = ev.touches[0];
        if (Math.abs(m.clientX - t.clientX) > 10 || Math.abs(m.clientY - t.clientY) > 10) cancel();
      };
      el.addEventListener("touchend", cancel);
      el.addEventListener("touchmove", onMove);
    }, { passive: true });
  }

  function makeDropTarget(el, onDrop) {
    el.__onDrop = onDrop;
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drag-over"); });
    el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("drag-over");
      const payload = e.dataTransfer.getData("text/plain") || dragPayload;
      if (payload) onDrop(payload);
    });
  }

  function startTouchDrag(el, payload, x, y) {
    const ghost = el.cloneNode(true);
    ghost.classList.add("drag-ghost");
    const rect = el.getBoundingClientRect();
    ghost.style.width = `${rect.width}px`;
    document.body.appendChild(ghost);
    el.classList.add("drag-source");
    touchDrag = { el, payload, ghost, target: null };
    positionGhost(ghost, x, y);
    if (navigator.vibrate) navigator.vibrate(12);

    document.addEventListener("touchmove", onTouchDragMove, { passive: false });
    document.addEventListener("touchend", onTouchDragEnd);
    document.addEventListener("touchcancel", onTouchDragEnd);
  }

  function positionGhost(ghost, x, y) {
    ghost.style.left = `${x - ghost.offsetWidth / 2}px`;
    ghost.style.top = `${y - 28}px`;
  }

  function onTouchDragMove(e) {
    if (!touchDrag) return;
    e.preventDefault();
    const t = e.touches[0];
    positionGhost(touchDrag.ghost, t.clientX, t.clientY);
    touchDrag.ghost.style.display = "none";
    const under = document.elementFromPoint(t.clientX, t.clientY);
    touchDrag.ghost.style.display = "";
    const target = under && under.closest("[data-drop]");
    if (touchDrag.target && touchDrag.target !== target) touchDrag.target.classList.remove("drag-over");
    touchDrag.target = target;
    if (target) target.classList.add("drag-over");
  }

  function onTouchDragEnd() {
    if (!touchDrag) return;
    const { ghost, el, target, payload } = touchDrag;
    ghost.remove();
    el.classList.remove("drag-source");
    if (target) {
      target.classList.remove("drag-over");
      if (typeof target.__onDrop === "function") target.__onDrop(payload);
    }
    touchDrag = null;
    suppressNextClick = true;
    setTimeout(() => (suppressNextClick = false), 350);
    document.removeEventListener("touchmove", onTouchDragMove);
    document.removeEventListener("touchend", onTouchDragEnd);
    document.removeEventListener("touchcancel", onTouchDragEnd);
  }

  /* ── Render: funil ──────────────────────────────────────── */

  const board = document.getElementById("board");
  const statsRow = document.getElementById("stats-row");

  function renderStats() {
    const all = Object.values(deals);
    const abertas = all.filter((d) => !TERMINAL_STAGES.includes(d.etapa)).length;
    const fechados = all.filter((d) => d.etapa === "fechado");
    const tocou = all.filter((d) => d.etapa === "tocou");
    const receita = [...fechados, ...tocou].reduce((sum, d) => sum + (Number(d.cacheFechado) || 0), 0);
    const atrasadas = lateDeals().length;

    const cards = [
      { value: abertas, label: "Em aberto" },
      { value: fechados.length, label: "Fechados" },
      { value: atrasadas, label: "Pra cobrar" },
      { value: formatMoney(receita) || "R$ 0", label: "Fechado em R$" },
    ];

    statsRow.innerHTML = "";
    cards.forEach((c) => {
      const el = document.createElement("div");
      el.className = "stat";
      const v = document.createElement("div");
      v.className = "stat-value";
      v.textContent = c.value;
      const l = document.createElement("div");
      l.className = "stat-label";
      l.textContent = c.label;
      el.appendChild(v);
      el.appendChild(l);
      statsRow.appendChild(el);
    });
  }

  function renderBoard() {
    board.innerHTML = "";
    const visible = Object.values(deals).filter(matchesDealFilter);

    if (!Object.keys(deals).length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Nenhuma negociação ainda. Toque em “+ Negociação” ou importe sua lista de curadores pelo ícone ⤓ lá em cima.";
      board.appendChild(empty);
      return;
    }

    STAGES.forEach((stage) => {
      const col = document.createElement("div");
      col.className = "column";
      col.dataset.drop = "stage";
      col.dataset.stage = stage.key;

      const head = document.createElement("div");
      head.className = "column-head";
      const dot = document.createElement("span");
      dot.className = "column-dot";
      dot.style.background = `var(--st-${stage.key})`;
      const title = document.createElement("span");
      title.className = "column-title";
      title.textContent = stage.label;
      const count = document.createElement("span");
      count.className = "column-count";
      head.appendChild(dot);
      head.appendChild(title);
      head.appendChild(count);
      col.appendChild(head);

      const items = visible
        .filter((d) => d.etapa === stage.key)
        .sort((a, b) => (a.proximoFollowup || "9999").localeCompare(b.proximoFollowup || "9999"));

      count.textContent = items.length;
      items.forEach((deal) => col.appendChild(buildDealCard(deal)));

      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "column-empty";
        empty.textContent = "—";
        col.appendChild(empty);
      }

      makeDropTarget(col, (dealId) => moveDealToStage(dealId, stage.key));
      board.appendChild(col);
    });
  }

  function buildDealCard(deal) {
    const card = document.createElement("div");
    card.className = "deal-card" + (isLate(deal) ? " is-late" : "");
    card.style.borderLeftColor = `var(--st-${deal.etapa})`;

    const casa = document.createElement("div");
    casa.className = "deal-casa";
    casa.textContent = deal.casa || "(sem casa)";
    card.appendChild(casa);

    if (deal.contato || deal.bairro) {
      const sub = document.createElement("div");
      sub.className = "deal-sub";
      sub.textContent = [deal.contato, deal.bairro].filter(Boolean).join(" · ");
      card.appendChild(sub);
    }

    const meta = document.createElement("div");
    meta.className = "deal-meta";

    if (deal.dataAlvo) {
      const p = document.createElement("span");
      p.className = "pill pill-date";
      p.textContent = formatShortDate(deal.dataAlvo);
      meta.appendChild(p);
    }

    const valor = deal.cacheFechado || deal.cachePedido;
    if (valor) {
      const p = document.createElement("span");
      p.className = "pill pill-cache";
      p.textContent = formatMoney(valor);
      meta.appendChild(p);
    }

    if (deal.proximoFollowup && !TERMINAL_STAGES.includes(deal.etapa)) {
      const p = document.createElement("span");
      const late = isLate(deal);
      p.className = "pill " + (late ? "pill-late" : "pill-soon");
      p.textContent = late ? `cobrar ${formatShortDate(deal.proximoFollowup)}` : `↻ ${formatShortDate(deal.proximoFollowup)}`;
      meta.appendChild(p);
    }

    if (meta.children.length) card.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "deal-actions";

    const waBtn = document.createElement("button");
    waBtn.type = "button";
    waBtn.className = "mini-btn mini-wa";
    waBtn.textContent = "WhatsApp";
    waBtn.addEventListener("click", (e) => { e.stopPropagation(); quickWhatsApp(deal.id); });
    actions.appendChild(waBtn);

    const stageIdx = STAGES.findIndex((s) => s.key === deal.etapa);
    if (stageIdx >= 0 && stageIdx < STAGES.length - 3) {
      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "mini-btn";
      nextBtn.textContent = "Avançar";
      nextBtn.title = `Mover pra "${STAGES[stageIdx + 1].label}"`;
      nextBtn.addEventListener("click", (e) => { e.stopPropagation(); moveDealToStage(deal.id, STAGES[stageIdx + 1].key); });
      actions.appendChild(nextBtn);
    }

    card.appendChild(actions);

    card.addEventListener("click", () => {
      if (suppressNextClick) return;
      openDealPanel(deal.id);
    });

    makeDragSource(card, deal.id);
    return card;
  }

  async function moveDealToStage(dealId, stageKey) {
    const deal = deals[dealId];
    if (!deal || deal.etapa === stageKey) return;
    const updated = { ...deal, etapa: stageKey };
    touchDeal(updated);
    addHistory(updated, `Etapa → ${STAGE_BY_KEY[stageKey].label}`);
    await persistDeal(updated);
    renderAll();
    const stage = STAGE_BY_KEY[stageKey];
    showToast(stage.followupDays
      ? `${stage.label} · cobrar de novo em ${stage.followupDays} dia(s).`
      : stage.label);
  }

  /* ── Render: contatos ───────────────────────────────────── */

  const contactList = document.getElementById("contact-list");

  function renderContacts() {
    contactList.innerHTML = "";
    const filter = normalizeName(contactFilter);
    const items = Object.values(contacts)
      .filter((c) => !filter || normalizeName([c.nome, c.casa, c.bairro, c.estilo, c.notas].join(" ")).includes(filter))
      .sort((a, b) => (a.casa || a.nome || "").localeCompare(b.casa || b.nome || "", "pt-BR"));

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = Object.keys(contacts).length
        ? "Nenhum contato bate com essa busca."
        : "Nenhum contato ainda. Use “+ Contato” ou importe sua lista pelo ícone ⤓ lá em cima.";
      contactList.appendChild(empty);
      return;
    }

    items.forEach((c) => {
      const card = document.createElement("div");
      card.className = "contact-card";

      const name = document.createElement("div");
      name.className = "contact-name";
      name.textContent = c.casa || c.nome || "(sem nome)";
      card.appendChild(name);

      // o título já mostra a casa (ou o nome, quando não há casa) —
      // não repetir o nome embaixo quando ele é o próprio título
      const subParts = [c.casa ? c.nome : "", c.bairro].filter(Boolean);
      if (subParts.length) {
        const sub = document.createElement("div");
        sub.className = "contact-sub";
        sub.textContent = subParts.join(" · ");
        card.appendChild(sub);
      }

      if (c.whatsapp) {
        const phone = document.createElement("div");
        phone.className = "contact-sub";
        phone.textContent = prettyPhone(c.whatsapp);
        card.appendChild(phone);
      }

      const tags = document.createElement("div");
      tags.className = "contact-tags";
      [c.funcao, c.estilo, c.melhorDia, formatMoney(c.cacheRef)].filter(Boolean).forEach((t) => {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = t;
        tags.appendChild(pill);
      });
      if (tags.children.length) card.appendChild(tags);

      card.addEventListener("click", () => openContactPanel(c.id));
      contactList.appendChild(card);
    });
  }

  /* ── Render: agenda ─────────────────────────────────────── */

  const calGrid = document.getElementById("cal-grid");
  const monthLabel = document.getElementById("month-label");
  const monthSummary = document.getElementById("month-summary");

  function dealsByDate() {
    const map = {};
    Object.values(deals).forEach((d) => {
      if (!d.dataAlvo) return;
      if (!map[d.dataAlvo]) map[d.dataAlvo] = [];
      map[d.dataAlvo].push(d);
    });
    return map;
  }

  /* Quanto o mês exibido está rendendo. Show fechado usa o cachê
     fechado e, quando ele está em branco, cai pro pedido — que é o
     que costuma estar preenchido quando só um dos dois foi digitado. */
  function renderMonthSummary() {
    const prefixo = `${view.year}-${pad2(view.month)}`;
    const doMes = Object.values(deals).filter((d) => (d.dataAlvo || "").startsWith(prefixo));

    const fechados = doMes.filter((d) => d.etapa === "fechado" || d.etapa === "tocou");
    const emAberto = doMes.filter((d) => !TERMINAL_STAGES.includes(d.etapa));

    const soma = (lista, campos) => lista.reduce((total, d) => {
      for (const campo of campos) if (Number(d[campo])) return total + Number(d[campo]);
      return total;
    }, 0);

    const confirmado = soma(fechados, ["cacheFechado", "cachePedido"]);
    const previsto = soma(emAberto, ["cachePedido", "cacheFechado"]);
    const semValor = fechados.filter((d) => !Number(d.cacheFechado) && !Number(d.cachePedido)).length;

    const cards = [
      { value: fechados.length, label: "Shows no mês" },
      { value: formatMoney(confirmado) || "R$ 0", label: "Fechado", destaque: true },
      { value: formatMoney(previsto) || "R$ 0", label: "Em negociação" },
    ];
    if (semValor) cards.push({ value: semValor, label: "Sem cachê preenchido", alerta: true });

    monthSummary.innerHTML = "";
    cards.forEach((c) => {
      const el = document.createElement("div");
      el.className = "stat" + (c.destaque ? " stat-destaque" : "") + (c.alerta ? " stat-alerta" : "");
      const v = document.createElement("div");
      v.className = "stat-value";
      v.textContent = c.value;
      const l = document.createElement("div");
      l.className = "stat-label";
      l.textContent = c.label;
      el.appendChild(v);
      el.appendChild(l);
      monthSummary.appendChild(el);
    });
  }

  function renderCalendar() {
    monthLabel.textContent = `${MONTH_NAMES[view.month - 1]} ${view.year}`;
    renderMonthSummary();
    calGrid.innerHTML = "";

    const byDate = dealsByDate();
    const leading = firstWeekday(view.year, view.month);
    for (let i = 0; i < leading; i++) {
      const blank = document.createElement("div");
      blank.className = "day-cell is-blank";
      calGrid.appendChild(blank);
    }

    const total = daysInMonth(view.year, view.month);
    for (let day = 1; day <= total; day++) {
      const key = dateKey(view.year, view.month, day);
      calGrid.appendChild(buildDayCell(key, day, byDate[key] || []));
    }
  }

  function buildDayCell(key, day, dayDeals) {
    const holidayName = getHoliday(key);
    const [y, m, d] = key.split("-").map(Number);
    const weekday = new Date(y, m - 1, d).getDay();

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day-cell"
      + (key === TODAY_KEY ? " is-today" : "")
      + ([5, 6].includes(weekday) ? " is-weekend" : "")
      + (holidayName ? " is-holiday" : "");
    cell.dataset.drop = "day";
    cell.dataset.dateKey = key;
    cell.setAttribute("aria-label", `${day} de ${MONTH_NAMES[m - 1]}${holidayName ? ` — ${holidayName}` : ""}`);

    const meta = document.createElement("div");
    meta.className = "day-meta";
    const num = document.createElement("span");
    num.className = "day-num";
    num.textContent = day;
    const wd = document.createElement("span");
    wd.className = "day-weekday";
    wd.textContent = WEEKDAY_NAMES[weekday].slice(0, 3);
    meta.appendChild(num);
    meta.appendChild(wd);
    cell.appendChild(meta);

    if (dayDeals.length || holidayName) {
      const content = document.createElement("div");
      content.className = "day-content";

      if (holidayName) {
        const feriado = document.createElement("span");
        feriado.className = "day-chip day-chip-feriado";
        feriado.textContent = holidayName;
        feriado.title = holidayName;
        content.appendChild(feriado);
      }

      /* Tarjinha por show, colorida pela etapa — o mesmo jeito do
         Google Agenda, pra caber o mês inteiro na tela do celular. */
      dayDeals.slice(0, 3).forEach((deal) => {
        const chip = document.createElement("span");
        chip.className = "day-chip";
        chip.style.background = `var(--st-${deal.etapa})`;
        chip.textContent = deal.casa || deal.contato || "(sem casa)";
        const valor = formatMoney(deal.cacheFechado || deal.cachePedido);
        chip.title = [deal.casa || deal.contato, deal.contato && deal.casa ? deal.contato : "",
          STAGE_BY_KEY[deal.etapa].label, valor].filter(Boolean).join(" · ");
        content.appendChild(chip);
      });

      if (dayDeals.length > 3) {
        const more = document.createElement("span");
        more.className = "day-more";
        more.textContent = `+${dayDeals.length - 3}`;
        content.appendChild(more);
      }

      cell.appendChild(content);
    }

    if (dayDeals.length) makeDragSource(cell, dayDeals[0].id);

    cell.addEventListener("click", () => {
      if (suppressNextClick) return;
      if (dayDeals.length) openDealPanel(dayDeals[0].id);
      else createDeal({ dataAlvo: key });
    });

    makeDropTarget(cell, (dealId) => moveDealToDate(dealId, key));
    return cell;
  }

  async function moveDealToDate(dealId, dateKeyTarget) {
    const deal = deals[dealId];
    if (!deal || deal.dataAlvo === dateKeyTarget) return;
    const updated = { ...deal, dataAlvo: dateKeyTarget };
    addHistory(updated, `Data → ${formatBrDate(dateKeyTarget)}`);
    await persistDeal(updated);
    renderAll();
    showToast(`Data movida pra ${formatBrDate(dateKeyTarget)}.`);
  }

  /* ── Faixa de follow-up ─────────────────────────────────── */

  const followupBar = document.getElementById("followup-bar");
  const followupText = document.getElementById("followup-text");

  const followupAction = document.getElementById("followup-action");

  function renderFollowupBar() {
    const late = lateDeals();

    if (onlyLate) {
      followupBar.hidden = false;
      followupText.textContent = "Mostrando só quem está esperando cobrança.";
      followupAction.textContent = "Ver todas";
      return;
    }

    if (!late.length) {
      followupBar.hidden = true;
      return;
    }

    followupBar.hidden = false;
    followupAction.textContent = "Ver agora";
    followupText.textContent = late.length === 1
      ? "1 negociação esperando você cobrar."
      : `${late.length} negociações esperando você cobrar.`;
  }

  followupAction.addEventListener("click", () => {
    onlyLate = !onlyLate;
    switchView("pipeline");
    renderAll();
  });

  /* ── Painel: negociação ─────────────────────────────────── */

  const backdrop = document.getElementById("backdrop");
  const dealPanel = document.getElementById("deal-panel");
  const contactPanel = document.getElementById("contact-panel");
  const templatesPanel = document.getElementById("templates-panel");
  const importPanel = document.getElementById("import-panel");

  const dContato = document.getElementById("d-contato");
  const dCasa = document.getElementById("d-casa");
  const dBairro = document.getElementById("d-bairro");
  const dEtapa = document.getElementById("d-etapa");
  const dData = document.getElementById("d-data");
  const dFollowup = document.getElementById("d-followup");
  const dCachePedido = document.getElementById("d-cache-pedido");
  const dCacheFechado = document.getElementById("d-cache-fechado");
  const dWhatsapp = document.getElementById("d-whatsapp");
  const dEstilo = document.getElementById("d-estilo");
  const dNotas = document.getElementById("d-notas");
  const waPreview = document.getElementById("wa-preview");
  const waWarning = document.getElementById("wa-warning");
  const waLinksWarning = document.getElementById("wa-links-warning");
  const histList = document.getElementById("hist-list");
  const suggestionsBox = document.getElementById("contact-suggestions");

  STAGES.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.key;
    opt.textContent = s.label;
    dEtapa.appendChild(opt);
  });

  function closeAllPanels() {
    dealPanel.hidden = true;
    contactPanel.hidden = true;
    templatesPanel.hidden = true;
    importPanel.hidden = true;
    backdrop.hidden = true;
    activeDealId = null;
    activeContactId = null;
    hideSuggestions();
  }

  function openDealPanel(id) {
    const deal = deals[id];
    if (!deal) return;
    activeDealId = id;

    dContato.value = deal.contato || "";
    dCasa.value = deal.casa || "";
    dBairro.value = deal.bairro || "";
    dEtapa.value = deal.etapa || "a_contatar";
    dData.value = deal.dataAlvo || "";
    dFollowup.value = deal.proximoFollowup || "";
    dCachePedido.value = deal.cachePedido || "";
    dCacheFechado.value = deal.cacheFechado || "";
    dWhatsapp.value = deal.whatsapp || "";
    dEstilo.value = deal.estilo || "";
    dNotas.value = deal.notas || "";

    document.getElementById("deal-panel-sub").textContent = deal.ultimoContato
      ? `último contato em ${formatBrDate(deal.ultimoContato)}`
      : "ainda sem contato registrado";

    activeTemplateKey = suggestTemplate(deal);
    renderTemplateChips();
    updateWaPreview();
    renderHistory(deal);

    closeAllPanelsExcept(dealPanel);
    backdrop.hidden = false;
    dealPanel.hidden = false;
  }

  function closeAllPanelsExcept(keep) {
    [dealPanel, contactPanel, templatesPanel, importPanel].forEach((p) => {
      if (p !== keep) p.hidden = true;
    });
  }

  /* Sugere a mensagem que faz sentido pro momento da negociação. */
  function suggestTemplate(deal) {
    switch (deal.etapa) {
      case "a_contatar": return "primeiroContato";
      case "contatado": return "apresentacao";
      case "conversando": return "proposta";
      case "proposta": return "followup";
      case "fechado": return "confirmacao";
      case "tocou": return "agradecimento";
      case "recusado": return "reativacao";
      default: return "primeiroContato";
    }
  }

  function readDealForm() {
    const base = deals[activeDealId] || makeDeal({});
    return {
      ...base,
      contato: dContato.value.trim(),
      casa: dCasa.value.trim(),
      bairro: dBairro.value.trim(),
      etapa: dEtapa.value,
      dataAlvo: dData.value,
      proximoFollowup: dFollowup.value,
      cachePedido: dCachePedido.value,
      cacheFechado: dCacheFechado.value,
      whatsapp: dWhatsapp.value.trim(),
      estilo: dEstilo.value.trim(),
      notas: dNotas.value.trim(),
    };
  }

  function renderHistory(deal) {
    histList.innerHTML = "";
    (deal.historico || []).forEach((h) => {
      const item = document.createElement("div");
      item.className = "hist-item";
      const when = document.createElement("span");
      when.className = "hist-when";
      when.textContent = formatBrDate(h.data);
      item.appendChild(when);
      item.appendChild(document.createTextNode(h.texto));
      histList.appendChild(item);
    });
  }

  function renderTemplateChips() {
    const box = document.getElementById("wa-templates");
    box.innerHTML = "";
    Object.keys(TEMPLATE_LABELS).forEach((key) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "wa-chip" + (key === activeTemplateKey ? " active" : "");
      chip.textContent = TEMPLATE_LABELS[key];
      chip.addEventListener("click", () => {
        activeTemplateKey = key;
        renderTemplateChips();
        updateWaPreview();
      });
      box.appendChild(chip);
    });
  }

  function updateWaPreview() {
    waPreview.value = buildMessage(activeTemplateKey, readDealForm());
    waWarning.hidden = Boolean(dWhatsapp.value.trim());

    const faltando = missingLinkFor(activeTemplateKey);
    waLinksWarning.hidden = !faltando;
    if (faltando) waLinksWarning.textContent = `Essa mensagem usa ${faltando}, que ainda não está cadastrado — preencha em Mensagens padrão (ícone 💬).`;
  }

  [dContato, dCasa, dBairro, dData, dEstilo, dCachePedido].forEach((el) =>
    el.addEventListener("input", updateWaPreview)
  );
  dEtapa.addEventListener("change", () => {
    activeTemplateKey = suggestTemplate(readDealForm());
    renderTemplateChips();
    updateWaPreview();
  });
  dWhatsapp.addEventListener("input", () => { waWarning.hidden = Boolean(dWhatsapp.value.trim()); });

  /* Sugestões de contato já cadastrado enquanto digita o nome */
  function hideSuggestions() { suggestionsBox.hidden = true; suggestionsBox.innerHTML = ""; }

  dContato.addEventListener("input", () => {
    const term = normalizeName(dContato.value);
    if (!term) return hideSuggestions();
    const matches = Object.values(contacts)
      .filter((c) => normalizeName(`${c.nome} ${c.casa}`).includes(term))
      .slice(0, 6);
    if (!matches.length) return hideSuggestions();

    suggestionsBox.innerHTML = "";
    matches.forEach((c) => {
      const item = document.createElement("div");
      item.className = "suggestion-item";
      item.textContent = c.nome || "(sem nome)";
      const sub = document.createElement("span");
      sub.className = "suggestion-sub";
      sub.textContent = [c.casa, c.bairro].filter(Boolean).join(" · ");
      item.appendChild(sub);
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        applyContact(c);
        hideSuggestions();
      });
      suggestionsBox.appendChild(item);
    });
    suggestionsBox.hidden = false;
  });

  dContato.addEventListener("blur", () => setTimeout(hideSuggestions, 150));

  function applyContact(c) {
    dContato.value = c.nome || "";
    if (c.casa) dCasa.value = c.casa;
    if (c.bairro) dBairro.value = c.bairro;
    if (c.whatsapp) dWhatsapp.value = c.whatsapp;
    if (c.estilo && !dEstilo.value) dEstilo.value = c.estilo;
    if (c.cacheRef && !dCachePedido.value) dCachePedido.value = c.cacheRef;
    if (deals[activeDealId]) deals[activeDealId].contatoId = c.id;
    updateWaPreview();
  }

  /* Criar sempre leva pro funil, pra ele ver onde a negociação caiu
     — inclusive quando parte de um contato ou de um dia da agenda. */
  async function createDeal(overrides) {
    const deal = makeDeal({ estilo: config.estiloPadrao, ...overrides });
    await persistDeal(deal);
    onlyLate = false;
    switchView("pipeline");
    renderAll();
    openDealPanel(deal.id);
  }

  document.getElementById("new-deal").addEventListener("click", () => createDeal({}));

  document.getElementById("save-deal").addEventListener("click", async () => {
    if (!activeDealId) return;
    const deal = readDealForm();
    if (!deal.casa && !deal.contato) return showToast("Preencha ao menos a casa ou o curador.");
    await syncContactFromDeal(deal);
    await persistDeal(deal);
    renderAll();
    closeAllPanels();
    showToast("Negociação salva.");
  });

  document.getElementById("delete-deal").addEventListener("click", async () => {
    if (!activeDealId) return;
    if (!confirm("Excluir essa negociação? O contato continua no cadastro.")) return;
    await removeDeal(activeDealId);
    renderAll();
    closeAllPanels();
    showToast("Negociação excluída.");
  });

  document.getElementById("add-hist").addEventListener("click", async () => {
    if (!activeDealId) return;
    const input = document.getElementById("d-hist-input");
    const texto = input.value.trim();
    if (!texto) return showToast("Escreva o que rolou primeiro.");
    const deal = readDealForm();
    addHistory(deal, texto);
    touchDeal(deal);
    await persistDeal(deal);
    input.value = "";
    dFollowup.value = deal.proximoFollowup || "";
    renderHistory(deal);
    renderAll();
    showToast("Contato registrado.");
  });

  /* Abrir no WhatsApp: registra o contato, avança a etapa quando fizer
     sentido e já agenda a próxima cobrança — é a automação principal. */
  async function sendWhatsApp(deal, message, templateKey) {
    const phone = normalizePhone(deal.whatsapp);
    if (!phone) {
      showToast("Cadastre o WhatsApp do curador primeiro.");
      waWarning.hidden = false;
      return;
    }
    const updated = { ...deal };
    touchDeal(updated, { advanceFromMessage: true });
    addHistory(updated, `Mensagem enviada (${TEMPLATE_LABELS[templateKey] || "WhatsApp"})`);
    await syncContactFromDeal(updated);
    await persistDeal(updated);
    renderAll();
    if (activeDealId === updated.id) {
      dEtapa.value = updated.etapa;
      dFollowup.value = updated.proximoFollowup || "";
      renderHistory(updated);
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  }

  document.getElementById("send-whatsapp").addEventListener("click", () => {
    if (!activeDealId) return;
    sendWhatsApp(readDealForm(), waPreview.value, activeTemplateKey);
  });

  /* Anexa o link do press kit ao fim da mensagem que está sendo escrita,
     sem repetir caso ele já esteja lá. */
  document.querySelectorAll("[data-presskit]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const url = btn.dataset.presskit === "en" ? PRESSKIT_EN_URL : PRESSKIT_URL;
      if (waPreview.value.includes(url)) return showToast("Esse link já está na mensagem.");
      waPreview.value = `${waPreview.value.trim()}\n\n${url}`.trim();
      showToast(btn.dataset.presskit === "en" ? "Press kit (EN) anexado." : "Press kit anexado.");
    })
  );

  document.querySelectorAll("[data-copy-presskit]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const url = btn.dataset.copyPresskit === "en" ? PRESSKIT_EN_URL : PRESSKIT_URL;
      try {
        await navigator.clipboard.writeText(url);
        showToast("Link copiado.");
      } catch (err) {
        showToast(url);
      }
    })
  );

  document.getElementById("copy-whatsapp").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(waPreview.value);
      showToast("Mensagem copiada.");
    } catch (err) {
      showToast("Não deu pra copiar — selecione e copie na mão.");
    }
  });

  /* Botão WhatsApp direto do card, sem abrir o painel: usa a mensagem
     que faz sentido pra etapa em que a negociação está. */
  function quickWhatsApp(dealId) {
    const deal = deals[dealId];
    if (!deal) return;
    const templateKey = suggestTemplate(deal);
    sendWhatsApp(deal, buildMessage(templateKey, deal), templateKey);
  }

  /* ── Painel: contato ────────────────────────────────────── */

  const cNome = document.getElementById("c-nome");
  const cCasa = document.getElementById("c-casa");
  const cBairro = document.getElementById("c-bairro");
  const cFuncao = document.getElementById("c-funcao");
  const cMelhorDia = document.getElementById("c-melhor-dia");
  const cWhatsapp = document.getElementById("c-whatsapp");
  const cInstagram = document.getElementById("c-instagram");
  const cEmail = document.getElementById("c-email");
  const cEstilo = document.getElementById("c-estilo");
  const cCache = document.getElementById("c-cache");
  const cNotas = document.getElementById("c-notas");

  function openContactPanel(id) {
    const contact = contacts[id];
    if (!contact) return;
    activeContactId = id;

    cNome.value = contact.nome || "";
    cCasa.value = contact.casa || "";
    cBairro.value = contact.bairro || "";
    cFuncao.value = contact.funcao || "curador";
    cMelhorDia.value = contact.melhorDia || "";
    cWhatsapp.value = contact.whatsapp || "";
    cInstagram.value = contact.instagram || "";
    cEmail.value = contact.email || "";
    cEstilo.value = contact.estilo || "";
    cCache.value = contact.cacheRef || "";
    cNotas.value = contact.notas || "";

    const linked = Object.values(deals).filter((d) => d.contatoId === id).length;
    document.getElementById("contact-panel-sub").textContent = linked
      ? `${linked} negociação(ões) ligada(s)`
      : "sem negociação aberta";

    closeAllPanelsExcept(contactPanel);
    backdrop.hidden = false;
    contactPanel.hidden = false;
  }

  document.getElementById("new-contact").addEventListener("click", async () => {
    const contact = makeContact({});
    await persistContact(contact);
    renderContacts();
    openContactPanel(contact.id);
  });

  document.getElementById("save-contact").addEventListener("click", async () => {
    if (!activeContactId) return;
    const base = contacts[activeContactId];
    const contact = {
      ...base,
      nome: cNome.value.trim(),
      casa: cCasa.value.trim(),
      bairro: cBairro.value.trim(),
      funcao: cFuncao.value,
      melhorDia: cMelhorDia.value.trim(),
      whatsapp: cWhatsapp.value.trim(),
      instagram: cInstagram.value.trim(),
      email: cEmail.value.trim(),
      estilo: cEstilo.value.trim(),
      cacheRef: cCache.value,
      notas: cNotas.value.trim(),
    };
    if (!contact.nome && !contact.casa) return showToast("Preencha ao menos o nome ou a casa.");
    await persistContact(contact);
    renderAll();
    closeAllPanels();
    showToast("Contato salvo.");
  });

  document.getElementById("delete-contact").addEventListener("click", async () => {
    if (!activeContactId) return;
    if (!confirm("Excluir esse contato? As negociações dele continuam.")) return;
    await removeContact(activeContactId);
    renderAll();
    closeAllPanels();
    showToast("Contato excluído.");
  });

  document.getElementById("deal-from-contact").addEventListener("click", async () => {
    const contact = contacts[activeContactId];
    if (!contact) return;
    await createDeal({
      contato: contact.nome,
      contatoId: contact.id,
      casa: contact.casa,
      bairro: contact.bairro,
      whatsapp: contact.whatsapp,
      estilo: contact.estilo || config.estiloPadrao,
      cachePedido: contact.cacheRef || "",
    });
  });

  /* ── Painel: mensagens padrão ───────────────────────────── */

  const tplFieldsBox = document.getElementById("tpl-fields");
  const tplInputs = {};

  Object.keys(TEMPLATE_LABELS).forEach((key) => {
    const field = document.createElement("div");
    field.className = "field tpl-field";
    const label = document.createElement("label");
    label.textContent = TEMPLATE_LABELS[key];
    label.setAttribute("for", `tpl-${key}`);
    const ta = document.createElement("textarea");
    ta.id = `tpl-${key}`;
    ta.rows = 4;
    field.appendChild(label);
    field.appendChild(ta);
    tplFieldsBox.appendChild(field);
    tplInputs[key] = ta;
  });

  const cfgDj = document.getElementById("cfg-dj");
  const cfgEstilo = document.getElementById("cfg-estilo");
  const cfgLinkSet = document.getElementById("cfg-link-set");
  const cfgLinkInsta = document.getElementById("cfg-link-insta");

  function openTemplatesPanel() {
    cfgDj.value = config.dj || "";
    cfgEstilo.value = config.estiloPadrao || "";
    cfgLinkSet.value = config.linkSet || "";
    cfgLinkInsta.value = config.linkInsta || "";
    Object.keys(tplInputs).forEach((k) => { tplInputs[k].value = (config.templates || {})[k] || ""; });
    closeAllPanelsExcept(templatesPanel);
    backdrop.hidden = false;
    templatesPanel.hidden = false;
  }

  document.getElementById("open-templates").addEventListener("click", openTemplatesPanel);

  document.getElementById("save-templates").addEventListener("click", async () => {
    config.dj = cfgDj.value.trim();
    config.estiloPadrao = cfgEstilo.value.trim();
    config.linkSet = cfgLinkSet.value.trim();
    config.linkInsta = cfgLinkInsta.value.trim();
    config.templates = {};
    Object.keys(tplInputs).forEach((k) => { config.templates[k] = tplInputs[k].value; });
    await persistConfig();
    closeAllPanels();
    showToast("Mensagens salvas.");
  });

  /* Restaura só os textos das mensagens — nome, estilo e links seguem. */
  document.getElementById("reset-templates").addEventListener("click", async () => {
    config.templates = deepClone(DEFAULT_CONFIG.templates);
    await persistConfig();
    openTemplatesPanel();
    showToast("Mensagens restauradas.");
  });

  /* ── Painel: importar contatos em massa ─────────────────── */

  const importText = document.getElementById("import-text");
  const importPreview = document.getElementById("import-preview");
  const importConfirm = document.getElementById("import-confirm");

  let importMode = "contatos";
  let icsRawText = "";

  const importSelectAll = document.getElementById("import-select-all");
  const importTextLabel = document.getElementById("import-text-label");
  const importFile = document.getElementById("import-file");
  const importCalName = document.getElementById("import-calname");

  function resetImportPreview() {
    importPreview.hidden = true;
    importPreview.innerHTML = "";
    importConfirm.hidden = true;
    importSelectAll.hidden = true;
    importCalName.hidden = true;
    importCandidates = [];
  }

  function setImportMode(mode) {
    importMode = mode;
    document.querySelectorAll("#import-mode .wa-chip").forEach((chip) =>
      chip.classList.toggle("active", chip.dataset.mode === mode)
    );
    document.querySelectorAll("[data-mode-hint]").forEach((el) => {
      el.hidden = el.dataset.modeHint !== mode;
    });
    importConfirm.textContent = mode === "contatos" ? "Cadastrar contatos" : "Lançar na agenda";
    importTextLabel.textContent = mode === "ics" ? "Ou cole aqui o conteúdo do .ics" : "Lista";

    /* Os blocos da conexão com o Google não têm data-mode-hint porque
       aparecem/somem também conforme o estado da conexão. */
    if (mode === "ics") {
      if (googleCalendars.length && tokenValido()) mostrarConectado(); else mostrarDesconectado();
    } else {
      googleAccountBox.hidden = true;
      googleCalField.hidden = true;
      googleFetchActions.hidden = true;
    }

    /* Limpar o campo de arquivo é o que permite reimportar o MESMO .ics
       depois de atualizar a agenda no Google — sem isso, escolher o
       arquivo de novo não dispara evento nenhum e nada acontece. */
    importFile.value = "";
    icsRawText = "";
    resetImportPreview();
  }

  /* Lê o .ics escolhido e já mostra a pré-visualização. */
  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    try {
      icsRawText = await file.text();
    } catch (err) {
      console.error(err);
      return showToast("Não consegui ler esse arquivo.");
    }
    if (!/BEGIN:VCALENDAR/i.test(icsRawText)) {
      icsRawText = "";
      return showToast("Esse arquivo não parece um .ics de agenda.");
    }
    showToast(`Arquivo lido: ${file.name}`);
    buildImportPreview();
  });

  /* ── Botões da conexão com o Google ─────────────────────── */

  const cfgGoogleClient = document.getElementById("cfg-google-client");
  const googleConnectBtn = document.getElementById("google-connect");
  const googleDisconnectBtn = document.getElementById("google-disconnect");
  const googleAccountBox = document.getElementById("google-account");
  const googleCalField = document.getElementById("google-cal-field");
  const googleCalSelect = document.getElementById("google-cal");
  const googleFetchActions = document.getElementById("google-fetch-actions");

  function mostrarDesconectado() {
    googleAccountBox.hidden = true;
    googleCalField.hidden = true;
    googleFetchActions.hidden = true;
    googleDisconnectBtn.hidden = true;
    googleConnectBtn.textContent = "Conectar com o Google";
  }

  function mostrarConectado() {
    const principal = googleCalendars.find((c) => c.primary) || googleCalendars[0];
    const conta = (principal && (principal.id || principal.summary)) || "conta conectada";

    googleAccountBox.hidden = false;
    googleAccountBox.textContent = `Conectado como ${conta} · somente leitura`;

    googleCalSelect.innerHTML = "";
    googleCalendars.forEach((cal) => {
      const opt = document.createElement("option");
      opt.value = cal.id;
      opt.textContent = cal.summary + (cal.primary ? " (principal)" : "");
      googleCalSelect.appendChild(opt);
    });
    if (config.googleCalendarId && googleCalendars.some((c) => c.id === config.googleCalendarId)) {
      googleCalSelect.value = config.googleCalendarId;
    }

    googleCalField.hidden = false;
    googleFetchActions.hidden = false;
    googleDisconnectBtn.hidden = false;
    googleConnectBtn.textContent = "Trocar de conta";
  }

  async function conectarGoogle() {
    const clientId = cfgGoogleClient.value.trim();
    if (!clientId) return showToast("Cole o Client ID do Google primeiro.");
    if (clientId !== config.googleClientId) {
      config.googleClientId = clientId;
      await persistConfig();
    }

    googleToken = "";
    const data = await googleGet(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=250",
      true
    );
    if (!data) return;

    googleCalendars = (data.items || []).filter((c) => !c.deleted);
    if (!googleCalendars.length) {
      mostrarDesconectado();
      return showToast("Essa conta não tem agenda nenhuma acessível.");
    }
    mostrarConectado();
    showToast(`${googleCalendars.length} agenda(s) encontradas. Escolha e toque em Buscar shows.`);
  }

  googleConnectBtn.addEventListener("click", conectarGoogle);

  googleDisconnectBtn.addEventListener("click", () => {
    googleToken = "";
    googleTokenExpira = 0;
    googleCalendars = [];
    mostrarDesconectado();
    resetImportPreview();
    showToast("Desconectado. O app não guarda seu acesso ao Google.");
  });

  googleCalSelect.addEventListener("change", async () => {
    config.googleCalendarId = googleCalSelect.value;
    await persistConfig();
  });

  document.getElementById("google-fetch").addEventListener("click", async () => {
    const calId = googleCalSelect.value;
    if (!calId) return showToast("Escolha uma agenda primeiro.");
    showToast("Buscando na sua agenda...");
    const shows = await buscarEventosGoogle(calId);
    if (!shows) return;
    if (!shows.length) {
      resetImportPreview();
      return showToast("Nenhum compromisso futuro nessa agenda.");
    }
    const escolhida = googleCalendars.find((c) => c.id === calId);
    mostrarPreviewShows(shows, escolhida ? escolhida.summary : calId);
  });

  function checkboxes() {
    return Array.from(importPreview.querySelectorAll(".import-check"));
  }

  document.getElementById("check-all").addEventListener("click", () =>
    checkboxes().forEach((c) => (c.checked = true)));
  document.getElementById("uncheck-all").addEventListener("click", () =>
    checkboxes().forEach((c) => (c.checked = false)));

  function selectedCandidates() {
    const marcados = new Set(checkboxes().filter((c) => c.checked).map((c) => Number(c.dataset.index)));
    return importCandidates.filter((_, i) => marcados.has(i));
  }

  document.querySelectorAll("#import-mode .wa-chip").forEach((chip) =>
    chip.addEventListener("click", () => setImportMode(chip.dataset.mode))
  );

  document.getElementById("open-import").addEventListener("click", () => {
    importText.value = "";
    cfgGoogleClient.value = config.googleClientId || "";
    if (googleCalendars.length && tokenValido()) mostrarConectado(); else mostrarDesconectado();
    setImportMode("contatos");
    closeAllPanelsExcept(importPanel);
    backdrop.hidden = false;
    importPanel.hidden = false;
  });

  /* Lê uma linha solta e tenta separar telefone, nome, casa e bairro.
     O telefone é achado em qualquer posição; o resto vem na ordem em
     que estiver, separado por - / | , ; ou tabulação. */
  function parseImportLine(line) {
    const raw = line.trim();
    if (!raw) return null;

    const phoneMatch = raw.match(/(?:\+?55\s*)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/);
    const phone = phoneMatch ? phoneMatch[0] : "";
    const rest = phone ? raw.replace(phone, " ") : raw;

    const parts = rest
      .split(/\s*[–—\-/|,;\t]\s*/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (!parts.length && !phone) return null;

    return {
      nome: parts[0] || "",
      casa: parts[1] || "",
      bairro: parts[2] || "",
      whatsapp: phone.trim(),
      linhaOriginal: raw,
    };
  }

  /* Lê "15/09 – Baz" ou "2026-10-09 Zurich". Sem o ano, assume o
     próximo — e a pré-visualização mostra a data cheia pra conferir. */
  function parseShowLine(line) {
    const raw = line.trim();
    if (!raw) return null;

    let y = null, m, d, rest;
    const iso = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    const br = raw.match(/(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?/);

    if (iso) {
      y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]);
      rest = raw.replace(iso[0], " ");
    } else if (br) {
      d = Number(br[1]); m = Number(br[2]);
      if (br[3]) y = Number(br[3]) < 100 ? 2000 + Number(br[3]) : Number(br[3]);
      rest = raw.replace(br[0], " ");
    } else {
      return null;
    }

    if (!m || m > 12 || !d || d > 31) return null;
    if (!y) {
      y = today.getFullYear();
      // data que já passou há mais de um mês provavelmente é do ano que vem
      if (dateKey(y, m, d) < addDaysKey(TODAY_KEY, -30)) y += 1;
    }

    const dataAlvo = dateKey(y, m, d);
    // rejeita data inexistente (31/02 e afins)
    if (new Date(y, m - 1, d).getDate() !== d) return null;

    const parts = rest.split(/\s*[–—\-/|,;\t]\s*/).map((p) => p.trim()).filter(Boolean);
    return { dataAlvo, casa: parts[0] || "", contato: parts[1] || "", bairro: parts[2] || "", linhaOriginal: raw };
  }

  /* ── Leitura do .ics exportado do Google Agenda ──────────
     Só precisa entender o suficiente pra virar show: quando é, como
     se chama e onde. Segue o RFC 5545 no que importa — linha dobrada,
     texto escapado e as três formas de data que o Google escreve. */

  function unfoldIcs(text) {
    // linha longa é quebrada e continuada com espaço/tab na seguinte
    return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  }

  function icsUnescape(value) {
    return value
      .replace(/\\n/gi, " ")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\")
      .trim();
  }

  function icsDateToKey(value) {
    const m = (value || "").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!m) return "";
    const [, y, mo, d, hh, mm, ss, zulu] = m;
    if (!hh) return `${y}-${mo}-${d}`; // dia inteiro
    if (zulu) {
      // veio em UTC — converte pro fuso do aparelho antes de virar data
      return keyFromDate(new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss || 0)));
    }
    return `${y}-${mo}-${d}`; // hora local (com ou sem TZID)
  }

  function parseIcs(text) {
    const events = [];
    let cur = null;
    for (const line of unfoldIcs(text).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === "BEGIN:VEVENT") { cur = {}; continue; }
      if (trimmed === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
      if (!cur) continue;

      const sep = line.indexOf(":");
      if (sep < 0) continue;
      const name = line.slice(0, sep).split(";")[0].trim().toUpperCase();
      const value = line.slice(sep + 1);

      if (name === "UID") cur.uid = value.trim();
      else if (name === "SUMMARY") cur.summary = icsUnescape(value);
      else if (name === "LOCATION") cur.location = icsUnescape(value);
      else if (name === "STATUS") cur.status = value.trim().toUpperCase();
      else if (name === "DTSTART") cur.dtstart = value.trim();
      else if (name === "RRULE") cur.rrule = value.trim();
    }
    return events;
  }

  /* Vira lista de shows, já descartando o que não interessa.
     X-WR-CALNAME é o nome da agenda dentro do arquivo — na agenda
     principal costuma ser o próprio e-mail da conta, o que deixa o
     Beno conferir se exportou da conta certa. */
  function icsToShows(text) {
    const corte = addDaysKey(TODAY_KEY, -60);
    const calMatch = unfoldIcs(text).match(/^X-WR-CALNAME:(.*)$/im);
    const calName = calMatch ? icsUnescape(calMatch[1]) : "";
    const shows = [];
    let ignorados = 0;

    parseIcs(text).forEach((ev) => {
      const dataAlvo = icsDateToKey(ev.dtstart);
      if (!dataAlvo || ev.status === "CANCELLED" || dataAlvo < corte) { ignorados++; return; }
      shows.push({
        dataAlvo,
        casa: (ev.summary || "").trim() || "(sem título)",
        contato: "",
        bairro: "",
        googleUid: ev.uid || "",
        local: ev.location || "",
        repete: Boolean(ev.rrule),
      });
    });

    shows.sort((a, b) => a.dataAlvo.localeCompare(b.dataAlvo));
    return { shows, ignorados, calName };
  }

  /* ── Google Agenda pela API (opcional) ───────────────────
     Só leitura: o escopo pedido é calendar.readonly, então o app
     consegue listar as agendas e os compromissos, e não tem como
     escrever nem apagar nada na conta do Beno. O token vale ~1h e
     fica só na memória — nunca é gravado no aparelho. */

  const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

  let gisPronto = false;
  let googleToken = "";
  let googleTokenExpira = 0;
  let googleCalendars = [];

  function carregarGis() {
    if (gisPronto || (window.google && window.google.accounts && window.google.accounts.oauth2)) {
      gisPronto = true;
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      /* Rede bloqueada costuma pendurar o script sem disparar erro —
         sem esse prazo, o botão Conectar não daria retorno nenhum. */
      const prazo = setTimeout(() => resolve(false), 12000);
      const fim = (ok) => { clearTimeout(prazo); resolve(ok); };

      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => { gisPronto = true; fim(true); };
      s.onerror = () => fim(false);
      document.head.appendChild(s);
    });
  }

  function tokenValido() { return googleToken && Date.now() < googleTokenExpira - 60000; }

  /* interativo = true mostra o seletor de conta; false tenta renovar calado */
  async function pedirTokenGoogle(interativo) {
    if (tokenValido()) return googleToken;

    const clientId = (config.googleClientId || "").trim();
    if (!clientId) {
      showToast("Cole o Client ID do Google primeiro.");
      return "";
    }
    if (!(await carregarGis())) {
      showToast("Não consegui carregar o login do Google. Verifique a conexão.");
      return "";
    }

    return new Promise((resolve) => {
      let respondido = false;
      const done = (v) => { if (!respondido) { respondido = true; resolve(v); } };

      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_SCOPE,
        callback: (resp) => {
          if (!resp || resp.error || !resp.access_token) {
            if (interativo) showToast(`O Google recusou: ${(resp && resp.error) || "sem token"}.`);
            return done("");
          }
          googleToken = resp.access_token;
          googleTokenExpira = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
          done(googleToken);
        },
        error_callback: (err) => {
          if (interativo) showToast(`Login do Google não concluído (${(err && err.type) || "erro"}).`);
          done("");
        },
      });

      client.requestAccessToken({ prompt: interativo ? "select_account" : "" });
    });
  }

  async function googleGet(url, interativo) {
    const token = await pedirTokenGoogle(interativo);
    if (!token) return null;
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      showToast("Não consegui falar com o Google. Verifique a conexão.");
      return null;
    }
    if (res.status === 401 || res.status === 403) {
      googleToken = "";
      showToast("O acesso ao Google expirou. Toque em Conectar de novo.");
      return null;
    }
    if (!res.ok) {
      showToast(`O Google respondeu ${res.status}.`);
      return null;
    }
    return res.json();
  }

  /* Traz os compromissos já com recorrência expandida (singleEvents),
     o que resolve melhor que o .ics, onde só dá pra pegar a 1ª data. */
  async function buscarEventosGoogle(calendarId) {
    const eventos = [];
    let pageToken = "";
    do {
      const params = new URLSearchParams({
        timeMin: new Date(Date.now() - 60 * 86400000).toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const data = await googleGet(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        false
      );
      if (!data) return null;
      eventos.push(...(data.items || []));
      pageToken = data.nextPageToken || "";
    } while (pageToken && eventos.length < 1000);

    return eventos
      .filter((ev) => ev.status !== "cancelled")
      .map((ev) => {
        const inicio = ev.start || {};
        const dataAlvo = inicio.date
          ? inicio.date
          : inicio.dateTime ? keyFromDate(new Date(inicio.dateTime)) : "";
        return dataAlvo ? {
          dataAlvo,
          casa: (ev.summary || "").trim() || "(sem título)",
          contato: "",
          bairro: "",
          googleUid: ev.iCalUID || ev.id || "",
          local: (ev.location || "").trim(),
          repete: false,
        } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.dataAlvo.localeCompare(b.dataAlvo));
  }

  /* ── Pré-visualização (com caixinha pra escolher o que entra) ── */

  function buildPreviewRow(index, isBad, fill) {
    const row = document.createElement("label");
    row.className = "import-row" + (isBad ? " is-bad" : "");

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "import-check";
    check.checked = true;
    check.dataset.index = String(index);
    row.appendChild(check);

    const body = document.createElement("span");
    body.className = "import-body";
    fill(body);
    row.appendChild(body);
    return row;
  }

  function renderContactPreview(c, index) {
    const incompleto = !c.nome && !c.casa;
    return buildPreviewRow(index, incompleto, (body) => {
      const title = document.createElement("b");
      title.textContent = c.nome || c.casa || "(sem nome)";
      body.appendChild(title);

      const details = [c.casa && c.nome ? c.casa : "", c.bairro, prettyPhone(c.whatsapp)].filter(Boolean);
      if (details.length) {
        const sub = document.createElement("span");
        sub.textContent = ` — ${details.join(" · ")}`;
        body.appendChild(sub);
      }
      if (incompleto) {
        const warn = document.createElement("span");
        warn.textContent = " — sem nome, revise depois";
        body.appendChild(warn);
      }
    });
  }

  function renderShowPreview(s, index) {
    return buildPreviewRow(index, !s.casa, (body) => {
      const title = document.createElement("b");
      title.textContent = s.casa || "(sem nome)";
      body.appendChild(title);

      const extras = [s.contato, s.local, s.repete ? "evento que se repete — entra só nesta data" : ""].filter(Boolean);
      const sub = document.createElement("span");
      sub.textContent = ` — ${formatBrDate(s.dataAlvo)} (${weekdayNameFromKey(s.dataAlvo)})`
        + (extras.length ? ` · ${extras.join(" · ")}` : "");
      body.appendChild(sub);
    });
  }

  function buildImportPreview() {
    let ignorados = 0;
    let calName = "";

    if (importMode === "ics") {
      const raw = icsRawText || importText.value;
      if (!raw.trim()) {
        resetImportPreview();
        return showToast("Escolha o arquivo .ics ou cole o conteúdo dele.");
      }
      const lido = icsToShows(raw);
      importCandidates = lido.shows;
      ignorados = lido.ignorados;
      calName = lido.calName;
    } else {
      const parser = importMode === "shows" ? parseShowLine : parseImportLine;
      importCandidates = importText.value.split("\n").map(parser).filter(Boolean);
    }

    importPreview.innerHTML = "";
    if (!importCandidates.length) {
      resetImportPreview();
      if (importMode === "ics") {
        return showToast(ignorados
          ? `Nenhum compromisso futuro nesse arquivo (${ignorados} antigos ou cancelados).`
          : "Não achei compromisso nenhum nesse arquivo.");
      }
      return showToast(importMode === "shows"
        ? "Não achei nenhuma data nesse texto. Cada linha precisa começar com a data."
        : "Não encontrei nenhum contato nesse texto.");
    }

    pintarPreview(calName ? `Agenda do arquivo: ${calName}` : "");

    if (importMode === "ics") {
      showToast(`${importCandidates.length} compromisso(s) encontrados`
        + (ignorados ? ` · ${ignorados} antigos/cancelados ignorados` : "")
        + ". Desmarque o que não for show.");
    } else {
      showToast(importMode === "shows"
        ? `${importCandidates.length} show(s) prontos pra lançar.`
        : `${importCandidates.length} contato(s) prontos pra cadastrar.`);
    }
  }

  /* Desenha a lista a partir de importCandidates, com a etiqueta da
     origem fora da área que rola pra não sumir de vista. */
  function pintarPreview(etiqueta) {
    importCalName.hidden = !etiqueta;
    if (etiqueta) importCalName.textContent = etiqueta;

    const render = importMode === "contatos" ? renderContactPreview : renderShowPreview;
    importPreview.innerHTML = "";
    importCandidates.forEach((c, i) => importPreview.appendChild(render(c, i)));

    importPreview.hidden = false;
    importConfirm.hidden = false;
    importSelectAll.hidden = importCandidates.length < 2;
  }

  /* Usada pela busca via API, que já entrega os shows prontos. */
  function mostrarPreviewShows(shows, nomeAgenda) {
    importCandidates = shows;
    pintarPreview(`Agenda: ${nomeAgenda}`);
    showToast(`${shows.length} compromisso(s) na agenda. Desmarque o que não for show.`);
  }

  document.getElementById("import-preview-btn").addEventListener("click", buildImportPreview);

  async function confirmShowImport(escolhidos) {
    let novos = 0;
    let atualizados = 0;

    for (const s of escolhidos) {
      /* Mesmo evento do Google (pelo UID) ou mesma data + mesma casa:
         atualiza em vez de duplicar. Assim, reimportar o .ics depois
         de remarcar um show no Google move a data aqui também. */
      const existing = Object.values(deals).find((d) =>
        (s.googleUid && d.googleUid === s.googleUid) ||
        (d.dataAlvo === s.dataAlvo && normalizeName(d.casa) === normalizeName(s.casa)));

      if (existing) {
        await persistDeal({
          ...existing,
          dataAlvo: s.dataAlvo || existing.dataAlvo,
          casa: s.casa || existing.casa,
          contato: s.contato || existing.contato,
          bairro: s.bairro || existing.bairro,
          googleUid: s.googleUid || existing.googleUid || "",
        });
        atualizados++;
      } else {
        await persistDeal(makeDeal({
          casa: s.casa, contato: s.contato, bairro: s.bairro,
          dataAlvo: s.dataAlvo, etapa: "fechado", estilo: config.estiloPadrao,
          googleUid: s.googleUid || "",
          notas: s.local ? `Local no Google Agenda: ${s.local}` : "",
        }));
        novos++;
      }
    }

    onlyLate = false;
    switchView("agenda");
    view = { year: Number(escolhidos[0].dataAlvo.slice(0, 4)), month: Number(escolhidos[0].dataAlvo.slice(5, 7)) };
    renderAll();
    closeAllPanels();
    showToast(`${novos} show(s) lançado(s), ${atualizados} atualizado(s).`);
  }

  importConfirm.addEventListener("click", async () => {
    const escolhidos = selectedCandidates();
    if (!escolhidos.length) return showToast("Marque ao menos um item pra importar.");
    if (importMode !== "contatos") return confirmShowImport(escolhidos);

    let novos = 0;
    let atualizados = 0;

    for (const c of escolhidos) {
      const existing = findContactByName(c.nome);
      if (existing) {
        await persistContact({
          ...existing,
          casa: c.casa || existing.casa,
          bairro: c.bairro || existing.bairro,
          whatsapp: c.whatsapp || existing.whatsapp,
        });
        atualizados++;
      } else {
        await persistContact(makeContact({ nome: c.nome, casa: c.casa, bairro: c.bairro, whatsapp: c.whatsapp }));
        novos++;
      }
    }

    renderAll();
    closeAllPanels();
    showToast(`${novos} novo(s), ${atualizados} atualizado(s).`);
  });

  /* ── Exportar CSV ───────────────────────────────────────── */

  function csvEscape(value) {
    const str = String(value == null ? "" : value);
    return /[",\n;]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
  }

  function downloadCsv(fileName, rows) {
    const csv = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.getElementById("export-csv").addEventListener("click", () => {
    const dealRows = [["Casa", "Curador", "Bairro", "Etapa", "Data", "Cachê pedido", "Cachê fechado", "WhatsApp", "Estilo", "Último contato", "Próximo follow-up", "Notas"]];
    Object.values(deals).forEach((d) => dealRows.push([
      d.casa, d.contato, d.bairro, (STAGE_BY_KEY[d.etapa] || {}).label || d.etapa,
      formatBrDate(d.dataAlvo), d.cachePedido, d.cacheFechado, prettyPhone(d.whatsapp),
      d.estilo, formatBrDate(d.ultimoContato), formatBrDate(d.proximoFollowup), d.notas,
    ]));

    const contactRows = [["Nome", "Casa", "Bairro", "Função", "WhatsApp", "Instagram", "E-mail", "Estilo", "Cachê ref.", "Melhor dia", "Notas"]];
    Object.values(contacts).forEach((c) => contactRows.push([
      c.nome, c.casa, c.bairro, c.funcao, prettyPhone(c.whatsapp), c.instagram,
      c.email, c.estilo, c.cacheRef, c.melhorDia, c.notas,
    ]));

    downloadCsv("beno-negociacoes.csv", dealRows);
    setTimeout(() => downloadCsv("beno-contatos.csv", contactRows), 400);
    showToast("Exportando negociações e contatos.");
  });

  /* ── Abas e navegação ───────────────────────────────────── */

  const monthNav = document.getElementById("month-nav");

  function switchView(name) {
    currentView = name;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.view === name));
    document.getElementById("view-pipeline").hidden = name !== "pipeline";
    document.getElementById("view-agenda").hidden = name !== "agenda";
    document.getElementById("view-contatos").hidden = name !== "contatos";
    monthNav.hidden = name !== "agenda";
  }

  document.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", () => switchView(tab.dataset.view))
  );

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

  document.getElementById("deal-search").addEventListener("input", (e) => {
    dealFilter = e.target.value;
    if (dealFilter) onlyLate = false;
    renderBoard();
    renderFollowupBar();
  });

  document.getElementById("contact-search").addEventListener("input", (e) => {
    contactFilter = e.target.value;
    renderContacts();
  });

  backdrop.addEventListener("click", closeAllPanels);
  document.querySelectorAll("[data-close-panel], [data-close-contact], [data-close-templates], [data-close-import]")
    .forEach((btn) => btn.addEventListener("click", closeAllPanels));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllPanels();
  });

  /* ── Trava de senha ─────────────────────────────────────── */

  const loginGate = document.getElementById("login-gate");

  function isUnlocked() {
    try { return localStorage.getItem(UNLOCK_KEY) === "1"; } catch (err) { return false; }
  }

  function unlockApp() {
    try { localStorage.setItem(UNLOCK_KEY, "1"); } catch (err) {}
    loginGate.hidden = true;
    connectFirebase();
  }

  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("login-password");
    if (input.value === APP_PASSWORD) {
      document.getElementById("login-error").hidden = true;
      input.value = "";
      unlockApp();
    } else {
      document.getElementById("login-error").hidden = false;
    }
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    try { localStorage.removeItem(UNLOCK_KEY); } catch (err) {}
    loginGate.hidden = false;
  });

  /* ── Toast ──────────────────────────────────────────────── */

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2800);
  }

  /* ── Render geral ───────────────────────────────────────── */

  function renderAll() {
    renderStats();
    renderBoard();
    renderContacts();
    renderCalendar();
    renderFollowupBar();
  }

  /* ── Início ─────────────────────────────────────────────── */

  loadLocal();
  switchView("agenda"); // a agenda é a tela do dia a dia
  renderAll();
  seedAgendaOnce().then(seedCuradoresOnce);

  if (isUnlocked()) {
    loginGate.hidden = true;
    connectFirebase();
  } else {
    loginGate.hidden = false;
  }
})();
