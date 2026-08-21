/* Coach — estado do usuário no aparelho (localStorage).

   Um único objeto `state` é lido na inicialização e gravado a cada mudança.
   Nada aqui fala com a rede: o histórico, o vocabulário e o progresso são
   locais, prontos pra depois virarem sincronização com uma conta na nuvem.
   `schema` permite migrar sem perder dados. */

const KEY = "coach.state.v1";

const DEFAULTS = {
  schema: 1,
  onboarded: false,
  profile: {
    name: "",
    level: "intermediate",
    variety: "us",
    goal: "",
    duration: 10,
    autoSpeak: true,
    showTranscript: true,
  },
  server: { url: "", status: "unknown" },
  streak: { count: 0, lastDay: "" },
  conversations: [],   // { id, startedAt, topic, level, variety, seconds, turns, transcript, review }
  vocabulary: [],      // { term, def, ex, ipa, level, register, region, learnedAt, seen, box, dueOn, source }
  dailyDone: {},       // { "2026-08-21": { term, answer } }
  totals: { conversations: 0, seconds: 0, words: 0 },
};

/* ------------------------------------------------------------------ helpers */

export const todayISO = (d = new Date()) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export const addDays = (iso, n) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return todayISO(d);
};

const clone = (o) => JSON.parse(JSON.stringify(o));

function merge(base, saved) {
  const out = clone(base);
  if (!saved || typeof saved !== "object") return out;
  for (const [k, v] of Object.entries(saved)) {
    if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) {
      out[k] = { ...out[k], ...v };
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/* -------------------------------------------------------------------- estado */

let state = clone(DEFAULTS);
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = merge(DEFAULTS, raw ? JSON.parse(raw) : null);
  } catch {
    state = clone(DEFAULTS);
  }
  return state;
}

export function get() {
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* modo privado / cota cheia: o app continua funcionando na sessão */
  }
  for (const fn of listeners) fn(state);
}

export function update(fn) {
  fn(state);
  save();
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function reset() {
  state = clone(DEFAULTS);
  save();
}

/* ------------------------------------------------------------------- ofensiva */

/** Marca atividade de hoje e devolve a ofensiva atualizada. */
export function touchStreak() {
  const today = todayISO();
  const s = state.streak;
  if (s.lastDay === today) return s.count;
  s.count = s.lastDay === addDays(today, -1) ? s.count + 1 : 1;
  s.lastDay = today;
  save();
  return s.count;
}

/* ---------------------------------------------------------------- vocabulário */

/* Revisão espaçada simples: caixas 0..4 → 1, 3, 7, 16, 35 dias. */
const BOX_DAYS = [1, 3, 7, 16, 35];

export function learnWords(items, source) {
  const now = new Date().toISOString();
  const today = todayISO();
  for (const item of items) {
    const key = item.term.trim().toLowerCase();
    const existing = state.vocabulary.find((v) => v.term.trim().toLowerCase() === key);
    if (existing) {
      existing.seen = (existing.seen || 1) + 1;
      continue;
    }
    state.vocabulary.push({
      ...item,
      learnedAt: now,
      seen: 1,
      box: 0,
      dueOn: addDays(today, BOX_DAYS[0]),
      source: source || "conversation",
    });
  }
  save();
}

export function reviewWord(term, remembered) {
  const v = state.vocabulary.find((w) => w.term === term);
  if (!v) return;
  v.box = remembered ? Math.min(BOX_DAYS.length - 1, (v.box || 0) + 1) : 0;
  v.dueOn = addDays(todayISO(), BOX_DAYS[v.box]);
  v.seen = (v.seen || 1) + 1;
  save();
}

export function dueWords(limit = 5) {
  const today = todayISO();
  return state.vocabulary
    .filter((v) => (v.dueOn || today) <= today)
    .sort((a, b) => (a.dueOn || "").localeCompare(b.dueOn || ""))
    .slice(0, limit);
}

/** Termos que o app já ensinou — o professor pode reusá-los na conversa. */
export function knownTerms(limit = 40) {
  return state.vocabulary
    .slice(-limit)
    .map((v) => v.term);
}

/* -------------------------------------------------------------------- conversas */

export function saveConversation(conv) {
  state.conversations.unshift(conv);
  if (state.conversations.length > 200) state.conversations.length = 200;
  state.totals.conversations += 1;
  state.totals.seconds += conv.seconds || 0;
  state.totals.words += conv.transcript
    .filter((t) => t.role === "user")
    .reduce((n, t) => n + t.text.trim().split(/\s+/).filter(Boolean).length, 0);
  save();
  return conv;
}

export function conversationById(id) {
  return state.conversations.find((c) => c.id === id);
}

/** Série dos últimos N resultados de cada métrica, pra desenhar a tendência. */
export function scoreTrend(metric, n = 10) {
  return state.conversations
    .filter((c) => c.review && c.review.scores && typeof c.review.scores[metric] === "number")
    .slice(0, n)
    .reverse()
    .map((c) => c.review.scores[metric]);
}
