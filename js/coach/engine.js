/* Coach — professor offline.

   O app foi feito pra conversar com o Claude (veja `ai.js` e `server/`), mas
   ele precisa funcionar assim que abre, sem chave nenhuma. Este módulo é o
   professor de reserva: mantém a conversa de pé, encontra os erros mais
   úteis, escolhe o vocabulário novo e monta a pontuação da conversa.

   As mesmas regras servem de rede de segurança quando a API falha no meio
   de uma conversa. */

import { topicById, levelById, levelIndex, LEVELS } from "./content.js";

/* ------------------------------------------------------------------ palavras */

const STOP = new Set(
  ("a an the and or but so because if then than that this these those there here " +
   "i you he she it we they me him her us them my your his its our their mine " +
   "am is are was were be been being do does did done have has had having " +
   "will would can could shall should may might must to of in on at for with " +
   "from by about into over after before as up down out off not no yes very " +
   "just really quite too also very much many some any all more most one two " +
   "what when where who whom which why how uh um like well okay ok yeah yep " +
   "nope hmm mmm ah oh sorry please thanks thank").split(" ")
);

const FILLERS = ["uh", "um", "erm", "hmm", "eh", "ahn", "mmm"];

const words = (text) =>
  text.toLowerCase().replace(/[^a-z' ]+/g, " ").split(/\s+/).filter(Boolean);

const contentWords = (text) => words(text).filter((w) => w.length > 3 && !STOP.has(w));

const pick = (list, seed) =>
  list[(seed === undefined ? Math.floor(Math.random() * list.length) : seed) % list.length];

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* ------------------------------------------------------------------ conversa */

/* O professor local não tem modelo nenhum atrás dele, então tudo o que ele
   pode fazer é ouvir com atenção: pegar o que o aluno acabou de dizer e
   responder àquilo, em vez de recitar a próxima pergunta da lista.

   São três passos — ler a fala (`read`), escolher o que fazer com ela
   (`chooseQuestion` e companhia) e montar a resposta (`reply`) — e uma regra
   que vale pra tudo: nada que ele já disse nesta conversa aparece de novo. */

const POSITIVE = /\b(love|loved|like|liked|great|good|nice|amazing|awesome|beautiful|happy|fun|funny|best|favourite|favorite|enjoy|enjoyed|perfect|wonderful|excited|glad)\b/i;
const NEGATIVE = /\b(hate|hated|bad|awful|terrible|worst|boring|bored|sad|angry|tired|exhausted|stress|stressed|difficult|hard|problem|worried|annoying|horrible|scared|afraid)\b/i;
const NO_IDEA = /^(i don'?t know|no idea|not sure|dunno|nothing|not really)\b/i;
const LAUGH = /\b(haha+|hehe|lol)\b/i;

/* Perguntas que pegam carona no que o aluno acabou de falar. Não dependem do
   tema: é o que faz o professor parecer que estava mesmo escutando. */
const HOOKS = [
  { re: /\b(food|eat\w*|ate|dinner|lunch|breakfast|restaurant\w*|cook\w*|dish\w*|meal\w*)\b/i,
    asks: ["What did you eat?", "Are you into cooking, or more of an eating-out person?", "What's the one dish you'd never get tired of?"] },
  { re: /\b(friend\w*|mate|mates|colleague\w*)\b/i,
    asks: ["How long have you known them?", "What do you usually do together?", "Are you the one who organises things, or do you just show up?"] },
  { re: /\b(family|families|mother|father|mum|mom|dad|parents?|brother\w*|sister\w*|son|daughter\w*|wife|husband|partner|kids?|child|children)\b/i,
    asks: ["Are you close?", "Do they live nearby?", "What's your family like when everyone's together?"] },
  { re: /\b(boss|office|meeting\w*|client\w*|colleague\w*|deadline\w*|overtime)\b/i,
    asks: ["Is it busy at the moment?", "What's a normal day like for you?", "Do you get on with the people you work with?"] },
  { re: /\b(money|expensive|cheap|price\w*|cost\w*|pay|paid|paying|salary|budget)\b/i,
    asks: ["Is that stressful to deal with?", "Are you careful with money, or more relaxed about it?", "Was it worth it, in the end?"] },
  { re: /\b(tired|exhaust\w*|stress\w*|busy|struggl\w*|pressure|worried|worry\w*)\b/i,
    asks: ["What helps when it gets like that?", "Has it been like this for a while?", "How do you switch off after a day like that?"] },
  { re: /\b(music|song\w*|band|bands|concert\w*|album\w*|playlist\w*|guitar|piano|sing\w*)\b/i,
    asks: ["What have you been listening to lately?", "Have you seen them live?", "Does music help you focus, or distract you?"] },
  { re: /\b(film\w*|movie\w*|series|netflix|episode\w*|watch\w*|cinema)\b/i,
    asks: ["What did you watch?", "Would you recommend it?", "Do you watch in English, with or without subtitles?"] },
  { re: /\b(travel\w*|trip\w*|flight\w*|holiday\w*|vacation\w*|beach\w*|abroad|visit\w*|airport)\b/i,
    asks: ["What was the best part of it?", "Would you go back?", "Do you plan your trips, or improvise?"] },
  { re: /\b(weather|rain\w*|hot|cold|snow\w*|sun|sunny|winter|summer)\b/i,
    asks: ["Does the weather change your mood?", "Would you rather have it too hot or too cold?"] },
  { re: /\b(english|language\w*|learn\w*|study|studying|studied|school|universit\w*|course\w*|classes|lesson\w*)\b/i,
    asks: ["What made you start?", "What's the hardest part for you?", "Where do you use your English most?"] },
  { re: /\b(morning\w*|night\w*|sleep\w*|slept|wake|woke|weekend\w*)\b/i,
    asks: ["Are you getting enough sleep these days?", "What does a good weekend look like for you?"] },
  { re: /\b(dog\w*|cat|cats|pet|pets|puppy)\b/i,
    asks: ["What's their name?", "Are you more of a dog person or a cat person?"] },
  { re: /\b(sport\w*|football|soccer|gym|running|jogging|training|match|matches|tournament\w*)\b/i,
    asks: ["Do you play, or mostly watch?", "How often do you get to do that?"] },
  { re: /\b(phone\w*|app|apps|computer\w*|internet|online|technology)\b/i,
    asks: ["Could you go a week without it?", "Has that changed how you spend your day?"] },
  { re: /\b(house|home|flat|apartment|room\w*|neighbou?rhood|neighbou?r\w*|move|moved|moving)\b/i,
    asks: ["What's the area like?", "Have you been there long?", "Would you move somewhere else if you could?"] },
];

/* Reações curtas, separadas por como o aluno soou. */
const REACT = {
  positive: ["Nice.", "Oh, that's great.", "Love that.", "That sounds good.", "Good for you.", "I like that."],
  negative: ["Ah, that's rough.", "Sorry to hear that.", "That sounds hard.", "Yeah, I get that.", "Hmm, not fun."],
  neutral: ["Right.", "Okay.", "Mm-hm.", "I see.", "Fair enough.", "Got it."],
  laugh: ["Ha, fair.", "Right, I can picture it.", "That's funny."],
};

/* Uma frase que mostra que ele entendeu — não é pergunta. */
const MIRROR = [
  (w) => cap(w) + " — okay.",
  (w) => "Ah, " + w + ".",
  (w) => cap(w) + ", interesting.",
  (w) => "So it's about " + w + ", then.",
];

/* De vez em quando ele fala de si: é o que separa conversa de questionário. */
const SELF = [
  "I'm the same, honestly.",
  "Funny, I'd have said the opposite.",
  "That happens to me too.",
  "I've heard that a lot lately.",
  "Yeah, I know exactly what you mean.",
  "That's not the answer I usually get, actually.",
];

/* Quando o aluno trava ou responde com uma palavra só. */
const OPEN_UP = [
  "Tell me a bit more.",
  "Go on — why is that?",
  "Say a little more, I'm curious.",
  "What's the story behind that?",
  "Give me an example.",
  "How come?",
];

const NO_WORRIES = [
  "No worries — let me ask it another way.",
  "That's fine. Different question, then.",
  "Okay, let's try an easier one.",
];

/* Perguntas genéricas pra quando a escada do tema acabou. */
const DEEPEN = [
  "And how did that make you feel?",
  "Has it always been like that?",
  "What would you change about it, if you could?",
  "Would your friends say the same about you?",
  "What's the best thing that came out of that?",
  "Do you think that'll be different in a few years?",
];

const BOUNCE = [
  "Me? I'd probably say the same, honestly.",
  "Good question — I'd have to think about it.",
  "For me it changes with the day, to be honest.",
  "Honestly, I'm more curious about your answer.",
];

const isQuestion = (text) => {
  const t = text.trim().toLowerCase();
  return t.endsWith("?") || /^(what|where|when|why|how|who|which|do|does|did|are|is|can|could|would|will|have|has)\b/.test(t);
};

const shuffle = (list) =>
  list.map((v) => ({ v, k: Math.random() })).sort((a, b) => a.k - b.k).map((x) => x.v);

/* Advérbio e vago não dizem nada de volta: "Ah, mostly." não é escutar. */
const WEAK = /ly$|^(thing|things|stuff|people|time|times|lot|lots|kind|sort|really|maybe|thanks)$/;
const NOT_A_NAME = /^(yeah|yes|okay|well|maybe|sorry|actually|today|tomorrow|yesterday|because|but|and|the|then|when|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;

const strongest = (list) =>
  list.filter((w) => !WEAK.test(w)).sort((a, b) => b.length - a.length)[0] || "";

/** Lê a fala do aluno e resume o que dá pra usar dela. */
function read(text) {
  const all = words(text);
  const content = contentWords(text);
  /* nome próprio dito pelo aluno vale mais que qualquer palavra comum —
     mas maiúscula de início de frase não é nome próprio */
  const proper = [...text.matchAll(/(^|[.!?]\s+|\s)([A-Z][a-z]{2,})\b/g)]
    .filter((m) => m[1] !== "" && m[1].trim() === "")
    .map((m) => m[2])
    .filter((w) => !NOT_A_NAME.test(w));
  return {
    raw: text,
    length: all.length,
    short: all.length <= 3,
    question: isQuestion(text),
    /* travado é dizer que não sabe. "To go" é resposta curta, não impasse */
    stuck: NO_IDEA.test(text.trim()) && all.length <= 6,
    mood: LAUGH.test(text) ? "laugh"
      : NEGATIVE.test(text) ? "negative"
        : POSITIVE.test(text) ? "positive" : "neutral",
    keyword: proper[0] || "",
    focus: proper[0] || strongest(content) || "",
    content,
  };
}

/** Tudo o que o professor já disse, pra nunca repetir uma frase. */
const alreadySaid = (transcript) =>
  transcript.filter((t) => t.role === "assistant").map((t) => t.text).join("  ");

/** Escolhe da lista o que ainda não foi dito; se tudo já foi, sorteia. */
function fresh(list, said, arg) {
  const made = list.map((item) => (typeof item === "function" ? item(arg) : item));
  const unused = made.filter((line) => !said.includes(line));
  return pick(unused.length ? unused : made);
}

/** A pergunta da vez: primeiro o que o aluno acabou de dizer, depois o tema. */
function chooseQuestion(sense, topic, said, turn) {
  /* o tema dá o chão da conversa no começo — mas se ele já contou uma
     história inteira, seguir o que ele disse vale mais que a lista */
  if (!sense.stuck && (turn >= 2 || sense.length >= 8)) {
    /* o gancho mais forte é o assunto que ele mais tocou na frase, e dentro
       dele a pergunta mais direta — sortear aqui é o que soava aleatório */
    const hits = HOOKS
      .map((h) => {
        const all = [...sense.raw.matchAll(new RegExp(h.re.source, "gi"))];
        return { h, n: all.length, last: all.length ? all[all.length - 1].index : -1 };
      })
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || b.last - a.last);
    for (const { h } of hits) {
      const unused = h.asks.filter((q) => !said.includes(q));
      if (unused.length) return unused[0];
    }
  }
  const beats = topic.beats.filter((q) => !said.includes(q));
  if (beats.length) return beats[0];
  const deep = DEEPEN.filter((q) => !said.includes(q));
  return deep.length ? pick(deep) : pick(DEEPEN);
}

/** Uma expressão do tema que combina com o que o aluno acabou de dizer. */
function teachable(topic, sense, said, known) {
  if (!sense.content.length) return null;
  const knownSet = new Set(known.map((k) => k.toLowerCase()));
  return topic.vocab.find((v) => {
    if (knownSet.has(v.term.toLowerCase()) || said.includes(v.term)) return false;
    const hint = words(v.def + " " + v.term).filter((w) => w.length > 3 && !STOP.has(w));
    return hint.some((w) => sense.content.includes(w));
  }) || null;
}

/**
 * Próxima fala do professor, offline.
 * @param {object} p
 * @param {string} p.topicId
 * @param {string} p.levelId
 * @param {Array} p.transcript  turnos { role, text }
 * @param {string} p.userText   o que o aluno acabou de dizer
 * @param {string[]} p.known    termos que o aluno já aprendeu
 */
export function reply({ topicId, levelId, transcript = [], userText = "", known = [] }) {
  const topic = topicById(topicId);
  const level = levelById(levelId);
  const rank = levelIndex(levelId);
  const said = alreadySaid(transcript);
  const turn = transcript.filter((t) => t.role === "user").length;
  const sense = read(userText);
  const parts = [];

  /* 1. reagir — mas não a toda fala, senão vira tique */
  const reactChance = sense.short ? 0.9 : rank === 0 ? 0.8 : 0.55;
  /* quando ele travou, o "no worries" já faz as vezes de reação */
  if (!sense.stuck && !sense.question && Math.random() < reactChance) {
    parts.push(fresh(REACT[sense.mood], said));
  }

  /* 2. o miolo: devolver algo do que ele disse, ou falar de si */
  if (sense.question && turn > 0) {
    parts.push(fresh(BOUNCE, said));
  } else if (sense.stuck) {
    parts.push(fresh(NO_WORRIES, said));
  } else if (rank >= 1 && !sense.short && sense.keyword && Math.random() < 0.6) {
    parts.push(fresh(MIRROR, said, sense.keyword));
  } else if (rank >= 2 && !sense.short && sense.mood !== "negative" && Math.random() < 0.3) {
    /* falar de si em cima de uma queixa soa surdo — só quando cabe */
    parts.push(fresh(SELF, said));
  }

  /* 3. ensinar uma expressão de vez em quando, sem virar aula */
  /* ensinar em cima de um "não sei" não ensina nada: só quando ele falou */
  const canTeach = !sense.stuck && !sense.short;
  const teach = canTeach && turn > 1 && turn % 4 === 0 ? teachable(topic, sense, said, known) : null;
  if (teach) {
    parts.push('There\'s a phrase for that — "' + teach.term + '". You could say: ' + teach.ex);
  } else if (canTeach && known.length && turn > 3 && turn % 6 === 0) {
    /* reaproveita algo que ele já aprendeu aqui, como quem comenta */
    const unused = known.filter((t) => !said.includes(t));
    const term = pick(unused.length ? unused : known);
    parts.push(pick([
      'That\'s what we\'d call "' + term + '", by the way.',
      'Sounds like "' + term + '" to me.',
      'You could use "' + term + '" for that one.',
    ]));
  }

  /* 4. e a pergunta que mantém a conversa de pé */
  const yesNo = /^(yes|no|yeah|nope|sure|maybe|i think so)\.?$/i.test(userText.trim());
  const lastSaid = [...transcript].reverse().find((t) => t.role === "assistant");
  const pushedLately = OPEN_UP.some((line) => (lastSaid ? lastSaid.text : "").includes(line));
  if (sense.short && !sense.stuck && !yesNo && !sense.question && rank >= 1 && turn > 0 && !pushedLately && Math.random() < 0.5) {
    parts.push(fresh(OPEN_UP, said));
  } else if (!teach) {
    parts.push(chooseQuestion(sense, topic, said, turn));
  }

  /* nível baixo ouve menos coisa de uma vez */
  const text = parts.filter(Boolean).slice(0, Math.max(2, level.replySentences)).join(" ");
  return { text: text || pick(DEEPEN), source: "offline" };
}

/** Primeira fala da conversa. */
export function opening({ topicId, levelId, name }) {
  const topic = topicById(topicId);
  const line = pick(topic.openers);
  /* várias aberturas já começam com um "Hey" — dois cumprimentos soam falsos */
  const greets = /^(hey|hi|hello|good morning|good evening|morning|welcome|alright)\b/i.test(line);
  const hello = name
    ? (greets ? name + ", " : pick(["Hey " + name + "! ", name + ", hi! ", "Good to see you, " + name + ". "]))
    : (greets ? "" : pick(["Hey! ", "Hi there. ", ""]));
  return {
    text: greets && name ? hello + line[0].toLowerCase() + line.slice(1) : hello + line,
    source: "offline",
  };
}

/* ------------------------------------------------------------------ correções */

const IRREGULAR = {
  go: "went", eat: "ate", see: "saw", make: "made", take: "took", come: "came",
  do: "did", have: "had", say: "said", get: "got", buy: "bought", think: "thought",
  drink: "drank", write: "wrote", meet: "met", leave: "left", feel: "felt",
  find: "found", give: "gave", know: "knew", run: "ran", sleep: "slept",
  speak: "spoke", spend: "spent", teach: "taught", tell: "told", wake: "woke",
  wear: "wore", win: "won", begin: "began", bring: "brought", break: "broke",
  choose: "chose", drive: "drove", fall: "fell", forget: "forgot", hear: "heard",
  keep: "kept", lose: "lost", pay: "paid", ride: "rode", sell: "sold",
  send: "sent", sing: "sang", sit: "sat", stand: "stood", swim: "swam",
  understand: "understood", is: "was", are: "were", am: "was",
};

const pastOf = (verb) => {
  const v = verb.toLowerCase();
  if (IRREGULAR[v]) return IRREGULAR[v];
  if (/e$/.test(v)) return v + "d";
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + "ied";
  return v + "ed";
};

const THIRD = { have: "has", do: "does", go: "goes", watch: "watches", finish: "finishes", teach: "teaches" };
const thirdOf = (verb) => THIRD[verb.toLowerCase()] || verb.toLowerCase() + "s";

/* Cada regra devolve `null` ou { better, type, why }.
   `type`: grammar | natural | vocabulary | word-choice | pronunciation */
const RULES = [
  {
    id: "past-marker",
    test: /\b(yesterday|last night|last week|last month|last year|ago|when i was)\b/i,
    run(s) {
      const verbs = "go|eat|see|make|take|come|do|have|say|get|buy|think|drink|write|meet|leave|feel|find|give|know|run|sleep|speak|spend|teach|tell|wake|wear|win|begin|bring|break|choose|drive|fall|forget|hear|keep|lose|pay|ride|sell|send|sing|sit|stand|swim|understand|work|play|watch|talk|walk|study|visit|travel|call|start|finish|like|want|need|live|stay|arrive|happen";
      const re = new RegExp(`\\b(i|we|you|they|he|she|it)\\s+(${verbs})\\b`, "i");
      const m = s.match(re);
      if (!m) return null;
      const better = s.replace(re, (all, subj, verb) => `${subj} ${pastOf(verb)}`);
      if (better === s) return null;
      return {
        better,
        type: "grammar",
        why: `With a past time expression, the verb goes in the past: "${m[2]}" → "${pastOf(m[2])}".`,
      };
    },
  },
  {
    id: "didnt-past",
    test: /\b(didn't|did not)\s+(\w+ed|went|saw|ate|made|took|came|had|said|got)\b/i,
    run(s) {
      const m = s.match(/\b(didn't|did not)\s+(\w+)\b/i);
      if (!m) return null;
      const base = Object.entries(IRREGULAR).find(([, past]) => past === m[2].toLowerCase());
      const inf = base ? base[0] : m[2].replace(/ied$/, "y").replace(/ed$/, "");
      return {
        better: s.replace(m[0], `${m[1]} ${inf}`),
        type: "grammar",
        why: `After "didn't" the verb stays in its base form: "didn't ${inf}".`,
      };
    },
  },
  {
    id: "age",
    test: /\bi\s+(have|has)\s+(\d+|\w+)\s+years?\b/i,
    run(s) {
      const m = s.match(/\bi\s+(have|has)\s+(\d+|\w+)\s+years?(\s+old)?\b/i);
      return {
        better: s.replace(m[0], `I'm ${m[2]} years old`),
        type: "grammar",
        why: 'In English you *are* an age, you don\'t *have* it: "I\'m 30 years old".',
      };
    },
  },
  {
    id: "people-is",
    test: /\bpeople\s+(is|was)\b/i,
    run(s) {
      const m = s.match(/\bpeople\s+(is|was)\b/i);
      return {
        better: s.replace(m[0], `people ${m[1].toLowerCase() === "is" ? "are" : "were"}`),
        type: "grammar",
        why: '"People" is already plural, so it takes "are" / "were".',
      };
    },
  },
  {
    id: "uncountable",
    test: /\b(informations|advices|furnitures|equipments|knowledges|softwares|homeworks|researches|moneys)\b/i,
    run(s) {
      const m = s.match(/\b(informations|advices|furnitures|equipments|knowledges|softwares|homeworks|researches|moneys)\b/i);
      const singular = m[1].toLowerCase().replace(/es$|s$/, (x) => (x === "es" ? "" : ""));
      return {
        better: s.replace(m[0], singular),
        type: "grammar",
        why: `"${singular}" is uncountable in English — it has no plural "s".`,
      };
    },
  },
  {
    id: "double-comparative",
    test: /\bmore\s+(better|easier|bigger|worse|faster|older|younger|cheaper|nicer)\b/i,
    run(s) {
      const m = s.match(/\bmore\s+(\w+er)\b/i);
      return {
        better: s.replace(m[0], m[1]),
        type: "grammar",
        why: 'Short adjectives already carry the comparison: "better", not "more better".',
      };
    },
  },
  {
    id: "i-am-agree",
    test: /\bi\s+(am|'m)\s+agree\b/i,
    run(s) {
      return {
        better: s.replace(/\bi\s+(am|'m)\s+agree\b/i, "I agree"),
        type: "grammar",
        why: '"Agree" is a verb in English: "I agree", not "I am agree".',
      };
    },
  },
  {
    id: "explain-me",
    test: /\b(explain|say|suggest|mention)\s+me\b/i,
    run(s) {
      const m = s.match(/\b(explain|say|suggest|mention)\s+me\b/i);
      return {
        better: s.replace(m[0], `${m[1]} to me`),
        type: "grammar",
        why: `These verbs need "to": "${m[1]} to me".`,
      };
    },
  },
  {
    id: "present-perfect-duration",
    test: /\b(i|we|you|they)\s+(am|are|'m|'re)\s+\w+ing\b[\s\S]*\b(since|for)\s+(\d+|a|two|three|four|five|many)\s+(years?|months?|weeks?|days?|hours?)\b/i,
    run(s) {
      const m = s.match(/\b(i|we|you|they)\s+(am|are|'m|'re)\s+(\w+ing)\b/i);
      if (!m) return null;
      return {
        better: s.replace(m[0], `${m[1]} have been ${m[3]}`),
        type: "grammar",
        why: 'For something that started in the past and still continues, English uses the present perfect: "I\'ve been living here for three years".',
      };
    },
  },
  {
    id: "since-duration",
    test: /\bsince\s+(\d+|a|two|three|four|five|many)\s+(years?|months?|weeks?|days?|hours?)\b/i,
    run(s) {
      const m = s.match(/\bsince\s+((\d+|a|two|three|four|five|many)\s+(years?|months?|weeks?|days?|hours?))\b/i);
      return {
        better: s.replace(m[0], `for ${m[1]}`),
        type: "grammar",
        why: '"For" + a length of time, "since" + a starting point: "for two years" / "since 2020".',
      };
    },
  },
  {
    id: "dont-third",
    test: /\b(he|she|it)\s+(don't|do not)\b/i,
    run(s) {
      const m = s.match(/\b(he|she|it)\s+(don't|do not)\b/i);
      return {
        better: s.replace(m[0], `${m[1]} doesn't`),
        type: "grammar",
        why: 'With he / she / it, "do not" becomes "doesn\'t".',
      };
    },
  },
  {
    id: "third-person-s",
    test: /\b(he|she|it)\s+(go|want|like|need|make|take|have|do|say|think|work|live|play|watch|speak|come|look|feel|seem)\b/i,
    run(s) {
      const m = s.match(/\b(he|she|it)\s+(go|want|like|need|make|take|have|do|say|think|work|live|play|watch|speak|come|look|feel|seem)\b/i);
      return {
        better: s.replace(m[0], `${m[1]} ${thirdOf(m[2])}`),
        type: "grammar",
        why: `He / she / it adds -s in the present: "${m[1].toLowerCase()} ${thirdOf(m[2])}".`,
      };
    },
  },
  {
    id: "go-to-home",
    test: /\b(go|going|went|come|came)\s+to\s+home\b/i,
    run(s) {
      const m = s.match(/\b(go|going|went|come|came)\s+to\s+home\b/i);
      return {
        better: s.replace(m[0], `${m[1]} home`),
        type: "grammar",
        why: '"Home" doesn\'t take "to": "go home", "get home".',
      };
    },
  },
  {
    id: "every-days",
    test: /\bevery\s+(days|weeks|months|years|mornings|nights)\b/i,
    run(s) {
      const m = s.match(/\bevery\s+(days|weeks|months|years|mornings|nights)\b/i);
      return {
        better: s.replace(m[0], `every ${m[1].slice(0, -1)}`),
        type: "grammar",
        why: 'After "every" the noun is singular: "every day".',
      };
    },
  },
  {
    id: "depend-of",
    test: /\bdepends?\s+of\b/i,
    run(s) {
      return {
        better: s.replace(/\bdepends?\s+of\b/i, (x) => x.replace(/of/i, "on")),
        type: "word-choice",
        why: 'The fixed pair is "depend on".',
      };
    },
  },
  {
    id: "married-with",
    test: /\bmarried\s+with\b/i,
    run(s) {
      return {
        better: s.replace(/\bmarried\s+with\b/i, "married to"),
        type: "word-choice",
        why: 'You are "married to" someone (married with = you have children with them).',
      };
    },
  },
  {
    id: "good-in",
    test: /\b(good|bad|great|terrible)\s+in\s+(\w+ing|maths|math|english|sports)\b/i,
    run(s) {
      const m = s.match(/\b(good|bad|great|terrible)\s+in\b/i);
      return {
        better: s.replace(m[0], `${m[1]} at`),
        type: "word-choice",
        why: 'We\'re "good at" something, not "good in".',
      };
    },
  },
  {
    id: "listen-music",
    test: /\blisten\s+(music|the radio|a podcast|songs)\b/i,
    run(s) {
      const m = s.match(/\blisten\s+(music|the radio|a podcast|songs)\b/i);
      return {
        better: s.replace(m[0], `listen to ${m[1]}`),
        type: "grammar",
        why: '"Listen" needs "to" before what you hear.',
      };
    },
  },
  {
    id: "discuss-about",
    test: /\bdiscuss\s+about\b/i,
    run(s) {
      return {
        better: s.replace(/\bdiscuss\s+about\b/i, "discuss"),
        type: "word-choice",
        why: '"Discuss" already includes "about": "discuss the plan".',
      };
    },
  },
  {
    id: "take-decision",
    test: /\btake\s+(a\s+)?decision\b/i,
    run(s) {
      return {
        better: s.replace(/\btake\s+(a\s+)?decision\b/i, "make a decision"),
        type: "word-choice",
        why: 'In English you "make" a decision, not "take" one.',
      };
    },
  },
  {
    id: "want-that",
    test: /\b(want|need|would like)\s+that\s+(you|he|she|they|we)\b/i,
    run(s) {
      const m = s.match(/\b(want|need|would like)\s+that\s+(you|he|she|they|we)\b/i);
      return {
        better: s.replace(m[0], `${m[1]} ${m[2]} to`),
        type: "grammar",
        why: 'The pattern is "want someone to do something": "I want you to come".',
      };
    },
  },
  {
    id: "very-much-adj",
    test: /\bvery\s+much\s+(good|nice|big|tired|happy|difficult|easy|important)\b/i,
    run(s) {
      const m = s.match(/\bvery\s+much\s+(\w+)\b/i);
      return {
        better: s.replace(m[0], `very ${m[1]}`),
        type: "natural",
        why: '"Very much" doesn\'t go before adjectives — just "very tired", "really tired".',
      };
    },
  },
  {
    id: "how-is-called",
    test: /\bhow\s+(is|do you)\s+call(ed)?\b/i,
    run(s) {
      const m = s.match(/\bhow\s+(is|do you)\s+call(ed)?\b/i);
      return {
        better: s.replace(m[0], m[1].toLowerCase() === "is" ? "what is it called" : "what do you call"),
        type: "natural",
        why: 'English asks "What is it called?", not "How is it called?".',
      };
    },
  },
  {
    id: "how-are-you",
    test: /^\s*(how are you( doing)?\??)\s*$/i,
    run(s) {
      return {
        better: "How's it going?",
        type: "natural",
        why: '"How are you?" is perfect. "How\'s it going?" just sounds more casual and everyday.',
      };
    },
  },
  {
    id: "i-am-fine-thank-you",
    test: /\bi\s*('m|am)\s+fine,?\s+thank\s+you\b/i,
    run(s) {
      return {
        better: s.replace(/\bi\s*('m|am)\s+fine,?\s+thank\s+you\b/i, "I'm good, thanks"),
        type: "natural",
        why: 'Correct, but textbook. Native speakers usually say "I\'m good, thanks" or "Not bad, you?".',
      };
    },
  },
  {
    id: "no-contraction",
    test: /\b(i am|do not|does not|did not|it is|that is|i will|cannot|can not)\b/i,
    run(s) {
      const map = {
        "i am": "I'm", "do not": "don't", "does not": "doesn't", "did not": "didn't",
        "it is": "it's", "that is": "that's", "i will": "I'll", cannot: "can't", "can not": "can't",
      };
      const m = s.match(/\b(i am|do not|does not|did not|it is|that is|i will|cannot|can not)\b/i);
      return {
        better: s.replace(m[0], map[m[1].toLowerCase()]),
        type: "natural",
        why: `In speech, English contracts almost everything: "${map[m[1].toLowerCase()]}" instead of "${m[1].toLowerCase()}".`,
      };
    },
  },
];

/** Aplica todas as regras que casarem com a frase, uma sobre a outra. */
function correctSentence(sentence) {
  let current = sentence.trim();
  const notes = [];
  for (const rule of RULES) {
    if (!rule.test.test(current)) continue;
    try {
      const out = rule.run(current);
      if (!out || !out.better) continue;
      if (out.better.trim().toLowerCase() === current.toLowerCase()) continue;
      current = out.better.trim();
      notes.push({ id: rule.id, type: out.type, why: out.why });
      if (notes.length === 2) break; // duas explicações por frase já é bastante
    } catch {
      /* regra que não casou como esperado: segue pra próxima */
    }
  }
  if (!notes.length) return null;
  return {
    original: sentence.trim(),
    better: cap(current),
    type: notes[0].type,
    types: notes.map((n) => n.type),
    why: notes.map((n) => n.why).join(" "),
    ids: notes.map((n) => n.id),
  };
}

const splitSentences = (text) =>
  text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+|\s*,\s+(?=(?:and then|but then)\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.split(" ").length > 2);

/** Correções de uma transcrição inteira, priorizando variedade e utilidade. */
export function findCorrections(transcript, limit = 4) {
  const found = [];
  const seenRules = new Set();
  for (const turn of transcript.filter((t) => t.role === "user")) {
    for (const sentence of splitSentences(turn.text)) {
      const hit = correctSentence(sentence);
      if (!hit) continue;
      /* uma correção por tipo de erro: ninguém aprende com dez repetidas */
      if (hit.ids.every((id) => seenRules.has(id))) continue;
      hit.ids.forEach((id) => seenRules.add(id));
      found.push(hit);
    }
  }
  /* gramática primeiro, depois naturalidade — é a ordem que ajuda mais */
  const order = { grammar: 0, "word-choice": 1, vocabulary: 2, natural: 3, pronunciation: 4 };
  found.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));
  return found.slice(0, limit);
}

/* ---------------------------------------------------------------- vocabulário */

/** Escolhe 3–6 expressões úteis do tema que o aluno ainda não usou. */
export function pickVocabulary({ topicId, levelId, transcript, known = [], limit = 5 }) {
  const topic = topicById(topicId);
  const spoken = new Set(
    transcript.filter((t) => t.role === "user").flatMap((t) => words(t.text))
  );
  const knownSet = new Set(known.map((k) => k.toLowerCase()));
  const maxLevel = levelIndex(levelId) + 1;

  const candidates = topic.vocab.filter((v) => {
    if (knownSet.has(v.term.toLowerCase())) return false;
    if (levelIndex(v.level) > maxLevel) return false;
    const head = words(v.term).filter((w) => !STOP.has(w));
    /* se o aluno já usou o termo inteiro, não é descoberta */
    return !(head.length && head.every((w) => spoken.has(w)));
  });

  const userTurns = transcript.filter((t) => t.role === "user").length;
  const target = Math.max(3, Math.min(limit, Math.round(userTurns / 2) + 2));
  /* embaralha pra duas conversas seguidas no mesmo tema não repetirem a lista */
  const shuffled = candidates
    .map((v) => ({ v, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.v);
  return shuffled.slice(0, target).map((v) => ({ ...v, topic: topic.id }));
}

/* ------------------------------------------------------------------ pontuação */

const clamp = (n, lo = 60, hi = 97) => Math.max(lo, Math.min(hi, Math.round(n)));

const METRIC_LABELS = {
  fluency: "Fluency",
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  naturalness: "Naturalness",
  confidence: "Confidence",
};

const FOCUS_TIPS = {
  fluency: "Try to keep going for two or three sentences before you stop.",
  vocabulary: "Reach for one new expression from today's list in your next chat.",
  grammar: "Watch the past tense — it's the one that slips most often.",
  naturalness: "Use contractions out loud: \"I'm\", \"don't\", \"it's\".",
  confidence: "Answer first, fix later. Fluency beats perfection in a conversation.",
};

/** Nota da conversa a partir de sinais objetivos da transcrição. */
export function scoreConversation({ transcript, corrections = [], levelId = "intermediate", seconds = 0 }) {
  const userTurns = transcript.filter((t) => t.role === "user");
  const allWords = userTurns.flatMap((t) => words(t.text));
  const total = allWords.length;
  const turns = userTurns.length;
  const avg = turns ? total / turns : 0;
  const unique = new Set(allWords.filter((w) => !STOP.has(w))).size;
  const uniqueRatio = total ? unique / total : 0;
  const longWords = allWords.filter((w) => w.length >= 7).length;
  const fillerCount = allWords.filter((w) => FILLERS.includes(w)).length;
  const oneWord = userTurns.filter((t) => words(t.text).length <= 2).length;
  const contractions = userTurns.filter((t) => /'(m|s|t|re|ve|ll|d)\b/i.test(t.text)).length;
  const errorRate = turns ? corrections.length / turns : 0;
  const levelBonus = levelIndex(levelId) * 1.5;

  const scores = {
    fluency: clamp(52 + Math.min(26, avg * 2.1) + Math.min(10, turns) - fillerCount * 1.4 + levelBonus),
    vocabulary: clamp(50 + uniqueRatio * 55 + Math.min(14, (longWords / Math.max(1, total)) * 90) + levelBonus),
    grammar: clamp(93 - errorRate * 26 - corrections.filter((c) => c.type === "grammar").length * 2 + levelBonus / 2),
    naturalness: clamp(58 + contractions * 4 - corrections.filter((c) => c.type === "natural").length * 5 + Math.min(12, avg) + levelBonus / 2),
    confidence: clamp(56 + Math.min(20, turns * 2.2) + Math.min(14, avg * 1.2) - oneWord * 3.5 + Math.min(8, seconds / 60)),
  };

  const entries = Object.entries(scores);
  const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const worst = entries.reduce((a, b) => (b[1] < a[1] ? b : a));

  return {
    scores,
    strongest: { metric: best[0], label: METRIC_LABELS[best[0]], value: best[1] },
    focus: { metric: worst[0], label: METRIC_LABELS[worst[0]], value: worst[1], tip: FOCUS_TIPS[worst[0]] },
    stats: { turns, words: total, avgWords: Math.round(avg * 10) / 10, unique },
  };
}

/* ------------------------------------------------------------------- resumo */

function summarise({ topicId, stats, strongest, vocabulary }) {
  const topic = topicById(topicId);
  const bits = [
    `You talked about ${topic.label.toLowerCase()} for ${stats.turns} turns`,
    stats.words ? ` and said around ${stats.words} words` : "",
    `. ${strongest.label.toLowerCase() === "grammar" ? "Your grammar" : "Your " + strongest.label.toLowerCase()} carried the conversation today`,
    vocabulary.length ? `, and you picked up ${vocabulary.length} new expression${vocabulary.length > 1 ? "s" : ""}.` : ".",
  ];
  return bits.join("");
}

/** Fecha a conversa: correções + vocabulário + notas, tudo de uma vez. */
export function debrief({ topicId, levelId, transcript, known = [], seconds = 0 }) {
  const corrections = findCorrections(transcript);
  const vocabulary = pickVocabulary({ topicId, levelId, transcript, known });
  const scored = scoreConversation({ transcript, corrections, levelId, seconds });
  return {
    corrections,
    vocabulary,
    ...scored,
    summary: summarise({ topicId, stats: scored.stats, strongest: scored.strongest, vocabulary }),
    source: "offline",
  };
}

export { METRIC_LABELS, LEVELS };
