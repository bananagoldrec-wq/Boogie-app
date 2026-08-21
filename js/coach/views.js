/* Coach — as telas. Cada função devolve um nó pronto; quem troca de aba e
   guarda estado é o `app.js`. Nada aqui fala com a rede. */

import { el, sheet, meter, sparkline, fmtDuration, fmtDate, clock, toast } from "./ui.js";
import * as store from "./store.js";
import {
  TOPICS, LEVELS, VARIETIES, DURATIONS, SLANG, CASUAL_LABELS,
  topicById, levelById, varietyById, dailyWordFor, DAILY_WORDS,
} from "./content.js";

/* ------------------------------------------------------------------ pedaços */

const chip = (text, cls = "") => el("span", { class: `chip ${cls}`.trim(), text });

const registerChip = (reg) =>
  reg ? chip(reg === "slang" ? "slang" : reg, `chip-${reg}`) : null;

const regionChip = (word) => {
  if (word.region === "US") return chip("🇺🇸 US");
  if (word.region === "UK") return chip("🇬🇧 UK");
  return null;
};

function section(title, subtitle, children, extra) {
  return el("section", { class: "block" }, [
    el("div", { class: "block-head" }, [
      el("h2", { text: title }),
      subtitle ? el("p", { class: "block-sub", text: subtitle }) : null,
      extra || null,
    ]),
    ...[].concat(children),
  ]);
}

function empty(text, hint) {
  return el("div", { class: "empty" }, [
    el("p", { text }),
    hint ? el("p", { class: "empty-hint", text: hint }) : null,
  ]);
}

/** Cartão de palavra — usado no debrief, na aba Learn e no histórico. */
export function wordCard(word, actions, { compact = false } = {}) {
  return el("button", {
    class: `word-card${compact ? " is-compact" : ""}`,
    type: "button",
    onclick: () => openWord(word, actions),
  }, [
    el("div", { class: "word-top" }, [
      el("strong", { class: "word-term", text: word.term }),
      word.ipa ? el("span", { class: "word-ipa", text: word.ipa }) : null,
    ]),
    el("p", { class: "word-def", text: word.def || word.meaning || "" }),
    compact ? null : el("div", { class: "chips" }, [
      registerChip(word.register),
      regionChip(word),
      word.level ? chip(levelById(word.level).label) : null,
    ]),
  ]);
}

export function openWord(word, actions) {
  sheet(word.term, [
    el("div", { class: "sheet-word" }, [
      word.ipa ? el("p", { class: "word-ipa big", text: word.ipa }) : null,
      el("p", { class: "sheet-def", text: word.def || word.meaning || "" }),
      word.ex ? el("p", { class: "sheet-ex", text: `“${word.ex}”` }) : null,
      el("div", { class: "chips" }, [
        registerChip(word.register),
        regionChip(word),
        word.level ? chip(levelById(word.level).label) : null,
        word.ukAlt ? chip(word.ukAlt) : null,
      ]),
      el("button", {
        class: "btn btn-soft",
        type: "button",
        onclick: () => actions.speak(word.ex || word.term),
      }, [el("i", { class: "btn-ico", html: soundSvg() }), "Hear it"]),
    ]),
  ]);
}

/* ------------------------------------------------------------------- 1. HOME */

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

export function viewHome(actions) {
  const s = store.get();
  const today = store.todayISO();
  const daily = dailyWordFor(today);
  const done = s.dailyDone[today];
  const recent = s.vocabulary.slice(-8).reverse();

  return el("div", { class: "view view-home" }, [
    el("header", { class: "hero" }, [
      el("p", { class: "hero-hi", text: greeting(s.profile.name) }),
      el("h1", { class: "hero-title", text: "Let’s have a conversation." }),
      el("div", { class: "hero-row" }, [
        s.streak.count
          ? el("span", { class: "streak" }, [
            el("b", { text: String(s.streak.count) }),
            el("span", { text: s.streak.count === 1 ? " day in a row" : " days in a row" }),
          ])
          : el("span", { class: "streak", text: "Day one" }),
        el("span", { class: "dot-sep", text: "·" }),
        el("span", { class: "hero-meta", text: `${levelById(s.profile.level).label} · ${varietyById(s.profile.variety).flag} ${varietyById(s.profile.variety).label}` }),
      ]),
    ]),

    el("button", {
      class: "cta",
      type: "button",
      onclick: () => actions.go("talk"),
    }, [
      el("span", { class: "cta-icon", html: micSvg() }),
      el("span", { class: "cta-text" }, [
        el("strong", { text: "Start a conversation" }),
        el("small", { text: s.conversations.length ? "Pick up where you left off" : "Just talk — I’ll follow you" }),
      ]),
    ]),

    section("Today’s English", null, [
      el("article", { class: "daily-card" }, [
        el("div", { class: "daily-top" }, [
          el("h3", { class: "daily-term", text: daily.term }),
          el("button", {
            class: "icon-round",
            type: "button",
            "aria-label": "Hear it",
            html: soundSvg(),
            onclick: () => actions.speak(daily.ex),
          }),
        ]),
        el("p", { class: "word-ipa", text: daily.ipa }),
        el("p", { class: "daily-meaning", text: daily.meaning }),
        el("p", { class: "sheet-ex", text: `“${daily.ex}”` }),
        el("div", { class: "chips" }, [
          registerChip(daily.register),
          daily.region !== "both" ? chip(daily.region === "US" ? "🇺🇸 US" : "🇬🇧 UK") : null,
        ]),
        done
          ? el("div", { class: "daily-done" }, [
            el("p", { class: "daily-done-label", text: "Your sentence" }),
            el("p", { class: "daily-done-text", text: `“${done.answer}”` }),
          ])
          : el("button", {
            class: "btn btn-soft",
            type: "button",
            onclick: () => challengeSheet(daily, actions),
          }, "Try the challenge"),
      ]),
    ]),

    recent.length
      ? section("Recently learned", null, [
        el("div", { class: "word-scroll" }, recent.map((w) => wordCard(w, actions, { compact: true }))),
      ])
      : null,

    section("Your progress", null, [
      el("div", { class: "stat-row" }, [
        statTile(String(s.totals.conversations), "conversations"),
        statTile(fmtDuration(s.totals.seconds), "speaking"),
        statTile(String(s.vocabulary.length), "expressions"),
      ]),
    ]),
  ]);
}

function statTile(value, label) {
  return el("div", { class: "stat-tile" }, [
    el("b", { text: value }),
    el("span", { text: label }),
  ]);
}

function challengeSheet(daily, actions) {
  const input = el("textarea", {
    class: "field",
    rows: "3",
    placeholder: "Write your sentence…",
    "aria-label": "Your sentence",
  });
  sheet("Today’s challenge", [
    el("p", { class: "sheet-def", text: daily.challenge }),
    el("p", { class: "sheet-ex", text: `“${daily.ex}”` }),
    input,
    el("button", {
      class: "btn btn-primary",
      type: "button",
      onclick: () => {
        const answer = input.value.trim();
        if (answer.split(/\s+/).filter(Boolean).length < 3) {
          toast("Give it a full sentence 🙂");
          return;
        }
        store.update((s) => { s.dailyDone[store.todayISO()] = { term: daily.term, answer }; });
        store.learnWords([{
          term: daily.term, def: daily.meaning, ex: daily.ex, ipa: daily.ipa,
          level: "intermediate", register: daily.register, region: daily.region,
        }], "daily");
        store.touchStreak();
        toast("Nice — that’s today’s done.");
        actions.closeSheet();
        actions.rerender();
      },
    }, "Save my sentence"),
  ]);
}

/* ------------------------------------------------------------------- 2. TALK */

export function viewTalk(actions) {
  const draft = { ...store.get().profile };

  const summary = el("p", { class: "mic-start-sub" });
  const paintSummary = () => {
    const t = draft.topic === "surprise" ? "Surprise me" : topicById(draft.topic).label;
    const d = DURATIONS.find((x) => x.id === draft.duration);
    summary.textContent = `${t} · ${levelById(draft.level).label} · ${varietyById(draft.variety).flag} · ${d ? d.label : "10 min"}`;
  };

  /* trocar de escolha não redesenha a tela: só move o destaque */
  const save = (patch, target) => {
    Object.assign(draft, patch);
    store.update((st) => Object.assign(st.profile, patch));
    if (target) markOne(target);
    paintSummary();
  };

  const topicGrid = el("div", { class: "topic-grid" }, [
    ...TOPICS.map((t) =>
      el("button", {
        class: `topic-card${draft.topic === t.id ? " is-on" : ""}`,
        type: "button",
        onclick: (e) => save({ topic: t.id }, e.currentTarget),
      }, [
        el("span", { class: "topic-icon", text: t.icon }),
        el("span", { class: "topic-label", text: t.label }),
        el("span", { class: "topic-blurb", text: t.blurb }),
      ])),
    el("button", {
      class: `topic-card topic-surprise${draft.topic === "surprise" ? " is-on" : ""}`,
      type: "button",
      onclick: (e) => save({ topic: "surprise" }, e.currentTarget),
    }, [
      el("span", { class: "topic-icon", text: "🎲" }),
      el("span", { class: "topic-label", text: "Surprise me" }),
      el("span", { class: "topic-blurb", text: "I’ll pick something for you." }),
    ]),
  ]);

  paintSummary();

  return el("div", { class: "view view-talk" }, [
    el("header", { class: "view-head" }, [
      el("h1", { text: "Talk" }),
      el("p", { class: "view-sub", text: "Tap the microphone and start. Change anything below." }),
    ]),

    el("button", {
      class: "mic-start",
      type: "button",
      onclick: () => actions.startConversation(),
    }, [
      el("span", { class: "mic-ring", html: micSvg() }),
      el("span", { class: "mic-start-label", text: "Start talking" }),
      summary,
    ]),

    section("Topic", null, [topicGrid]),

    section("Your English level", null, [
      el("div", { class: "chip-row" }, LEVELS.map((l) =>
        el("button", {
          class: `pick${draft.level === l.id ? " is-on" : ""}`,
          type: "button",
          onclick: (e) => save({ level: l.id }, e.currentTarget),
        }, [
          el("b", { text: l.label }),
          el("small", { text: l.blurb }),
        ]))),
    ]),

    section("Which English", null, [
      el("div", { class: "chip-row chip-row-tight" }, VARIETIES.map((v) =>
        el("button", {
          class: `pick pick-inline${draft.variety === v.id ? " is-on" : ""}`,
          type: "button",
          onclick: (e) => save({ variety: v.id }, e.currentTarget),
        }, `${v.flag} ${v.label}`))),
    ]),

    section("How long", null, [
      el("div", { class: "chip-row chip-row-tight" }, DURATIONS.map((d) =>
        el("button", {
          class: `pick pick-inline${draft.duration === d.id ? " is-on" : ""}`,
          type: "button",
          onclick: (e) => save({ duration: d.id }, e.currentTarget),
        }, d.label))),
    ]),
  ]);
}

/* ------------------------------------------------------------------ 3. LEARN */

const LEARN_TABS = [
  { id: "words", label: "Words" },
  { id: "slang", label: "Slang" },
  { id: "daily", label: "Daily" },
  { id: "review", label: "Review" },
];

export function viewLearn(actions, sub = "words", slangVariety = "us") {
  const s = store.get();
  const body = el("div", { class: "learn-body" });

  const render = () => {
    if (sub === "words") body.replaceChildren(learnWords(actions, s));
    else if (sub === "slang") body.replaceChildren(learnSlang(actions, slangVariety, (v) => {
      slangVariety = v;
      render();
    }));
    else if (sub === "daily") body.replaceChildren(learnDaily(actions, s));
    else body.replaceChildren(learnReview(actions));
  };

  const tabs = el("div", { class: "seg" }, LEARN_TABS.map((t) =>
    el("button", {
      class: `seg-btn${sub === t.id ? " is-on" : ""}`,
      type: "button",
      onclick: (e) => {
        sub = t.id;
        [...e.currentTarget.parentElement.children].forEach((b) => b.classList.remove("is-on"));
        e.currentTarget.classList.add("is-on");
        render();
      },
    }, t.label)));

  render();

  return el("div", { class: "view view-learn" }, [
    el("header", { class: "view-head" }, [
      el("h1", { text: "Learn" }),
      el("p", { class: "view-sub", text: "Everything you picked up, in one place." }),
    ]),
    tabs,
    body,
  ]);
}

function learnWords(actions, s) {
  if (!s.vocabulary.length) {
    return empty("No expressions yet.", "Have a conversation — I’ll collect the useful ones for you.");
  }
  const search = el("input", { class: "field", type: "search", placeholder: "Search your words…" });
  const list = el("div", { class: "word-list" });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const items = s.vocabulary
      .slice()
      .reverse()
      .filter((w) => !q || w.term.toLowerCase().includes(q) || (w.def || "").toLowerCase().includes(q));
    list.replaceChildren(
      ...(items.length ? items.map((w) => wordCard(w, actions)) : [empty("Nothing matched.")])
    );
  };
  search.addEventListener("input", draw);
  draw();
  return el("div", {}, [search, list]);
}

function learnSlang(actions, variety, onVariety) {
  const packs = [
    { id: "us", label: "🇺🇸 American" },
    { id: "uk", label: "🇬🇧 British" },
    { id: "au", label: "🇦🇺 Australian" },
    { id: "ca", label: "🇨🇦 Canadian" },
    { id: "ie", label: "🇮🇪 Irish" },
  ];
  const list = SLANG[variety] || [];
  return el("div", {}, [
    el("div", { class: "chip-row chip-row-tight" }, packs.map((p) =>
      el("button", {
        class: `pick pick-inline${variety === p.id ? " is-on" : ""}`,
        type: "button",
        onclick: () => onVariety(p.id),
      }, p.label))),
    el("div", { class: "slang-list" }, list.map((item) =>
      el("article", { class: "slang-card" }, [
        el("div", { class: "slang-top" }, [
          el("h3", { text: item.term }),
          el("button", {
            class: "icon-round",
            type: "button",
            "aria-label": "Hear the example",
            html: soundSvg(),
            onclick: () => actions.speak(item.example.join(" ")),
          }),
        ]),
        el("p", { class: "slang-meaning", text: item.meaning }),
        el("p", { class: "slang-where", text: item.where }),
        el("div", { class: "chips" }, [
          chip(CASUAL_LABELS[item.casual] || "Casual"),
          chip(item.work ? "Fine at work" : "Not for work", item.work ? "chip-ok" : "chip-warn"),
        ]),
        el("div", { class: "dialogue" }, item.example.map((line, i) =>
          el("p", { class: `dialogue-line ${i % 2 ? "is-b" : "is-a"}`, text: line }))),
      ]))),
  ]);
}

function learnDaily(actions, s) {
  const days = [...Array(7)].map((_, i) => store.addDays(store.todayISO(), -i));
  return el("div", { class: "daily-list" }, days.map((day, i) => {
    const w = dailyWordFor(day);
    const done = s.dailyDone[day];
    return el("article", { class: `daily-row${i === 0 ? " is-today" : ""}` }, [
      el("div", { class: "daily-row-head" }, [
        el("b", { text: w.term }),
        el("span", { class: "daily-date", text: i === 0 ? "Today" : fmtDate(day + "T12:00:00").split(",")[0] }),
      ]),
      el("p", { class: "word-def", text: w.meaning }),
      el("p", { class: "sheet-ex", text: `“${w.ex}”` }),
      el("div", { class: "daily-row-foot" }, [
        el("button", {
          class: "btn btn-ghost",
          type: "button",
          onclick: () => actions.speak(w.ex),
        }, [el("i", { class: "btn-ico", html: soundSvg() }), "Hear it"]),
        done ? el("span", { class: "chip chip-ok", text: "done" }) : null,
      ]),
    ]);
  }));
}

function learnReview(actions) {
  const due = store.dueWords(8);
  if (!due.length) {
    return empty("Nothing to review right now.", "Words come back on their own a few days after you learn them.");
  }
  const host = el("div", { class: "review" });
  let i = 0;

  const draw = () => {
    if (i >= due.length) {
      host.replaceChildren(empty("That’s the review done.", "See you in a couple of days."));
      return;
    }
    const w = due[i];
    const answer = el("div", { class: "review-answer", hidden: true }, [
      el("p", { class: "sheet-def", text: w.def || "" }),
      el("p", { class: "sheet-ex", text: w.ex ? `“${w.ex}”` : "" }),
    ]);
    host.replaceChildren(el("article", { class: "review-card" }, [
      el("span", { class: "review-step", text: `${i + 1} of ${due.length}` }),
      el("h3", { class: "review-term", text: w.term }),
      el("p", { class: "review-ask", text: "Do you remember what this means?" }),
      answer,
      el("div", { class: "review-actions" }, [
        el("button", {
          class: "btn btn-soft",
          type: "button",
          onclick: (e) => {
            answer.hidden = false;
            e.currentTarget.hidden = true;
          },
        }, "Show me"),
        el("button", {
          class: "btn btn-ghost",
          type: "button",
          onclick: () => { store.reviewWord(w.term, false); i++; draw(); },
        }, "Not yet"),
        el("button", {
          class: "btn btn-primary",
          type: "button",
          onclick: () => { store.reviewWord(w.term, true); i++; draw(); },
        }, "Got it"),
      ]),
    ]));
  };

  draw();
  return host;
}

/* --------------------------------------------------------------- 4. PROGRESS */

const TREND_METRICS = [
  { id: "fluency", label: "Fluency" },
  { id: "grammar", label: "Grammar" },
  { id: "confidence", label: "Confidence" },
];

export function viewProgress(actions) {
  const s = store.get();
  const hasData = s.conversations.length > 0;

  const trends = el("div", { class: "trend-list" }, TREND_METRICS.map((m) => {
    const values = store.scoreTrend(m.id, 12);
    return el("article", { class: "trend" }, [
      el("div", { class: "trend-top" }, [
        el("span", { text: m.label }),
        el("b", { text: values.length ? `${values[values.length - 1]}%` : "—" }),
      ]),
      values.length > 1 ? sparkline(values) : el("p", { class: "trend-empty", text: "Two conversations and this starts moving." }),
    ]);
  }));

  return el("div", { class: "view view-progress" }, [
    el("header", { class: "view-head" }, [
      el("h1", { text: "Progress" }),
      el("p", { class: "view-sub", text: "Slow and steady beats cramming." }),
    ]),

    el("div", { class: "stat-row stat-row-4" }, [
      statTile(String(s.totals.conversations), "conversations"),
      statTile(fmtDuration(s.totals.seconds), "speaking"),
      statTile(String(s.vocabulary.length), "expressions"),
      statTile(String(s.streak.count), "day streak"),
    ]),

    hasData ? section("Trends", null, [trends]) : null,

    section("Conversations", null, [
      s.conversations.length
        ? el("div", { class: "history" }, s.conversations.slice(0, 30).map((c) =>
          el("button", {
            class: "history-row",
            type: "button",
            onclick: () => actions.openConversation(c.id),
          }, [
            el("span", { class: "history-icon", text: topicById(c.topic).icon }),
            el("span", { class: "history-main" }, [
              el("b", { text: topicById(c.topic).label }),
              el("small", { text: `${fmtDate(c.startedAt)} · ${fmtDuration(c.seconds)}` }),
            ]),
            el("span", { class: "history-meta" }, [
              el("b", { text: c.review?.scores ? `${c.review.scores.naturalness}%` : "—" }),
              el("small", { text: `${(c.review?.vocabulary || []).length} words` }),
            ]),
          ])))
        : empty("No conversations yet.", "The first one takes about five minutes."),
    ]),
  ]);
}

/** Detalhe de uma conversa antiga. */
export function conversationSheet(conv, actions) {
  const review = conv.review || {};
  sheet(topicById(conv.topic).label, [
    el("p", { class: "sheet-def", text: `${fmtDate(conv.startedAt)} · ${fmtDuration(conv.seconds)} · ${levelById(conv.level).label}` }),
    review.summary ? el("p", { class: "sheet-ex", text: review.summary }) : null,
    review.scores ? el("div", { class: "meters" }, Object.entries(review.scores).map(([k, v]) =>
      meter(k[0].toUpperCase() + k.slice(1), v))) : null,
    (review.vocabulary || []).length
      ? el("div", {}, [
        el("h3", { class: "sheet-h3", text: "Words you discovered" }),
        el("div", { class: "word-list" }, review.vocabulary.map((w) => wordCard(w, actions))),
      ]) : null,
    (review.corrections || []).length
      ? el("div", {}, [
        el("h3", { class: "sheet-h3", text: "Things to improve" }),
        el("div", { class: "fix-list" }, review.corrections.map(correctionCard)),
      ]) : null,
    el("h3", { class: "sheet-h3", text: "Transcript" }),
    el("div", { class: "transcript transcript-static" }, conv.transcript.map(bubble)),
  ]);
}

/* -------------------------------------------------------------- 5. PROFILE */

export function viewProfile(actions) {
  const s = store.get();

  const nameField = el("input", {
    class: "field", type: "text", value: s.profile.name, placeholder: "Your name",
    oninput: (e) => store.update((st) => { st.profile.name = e.target.value.trim(); }),
  });

  const serverField = el("input", {
    class: "field", type: "url", value: s.server.url, placeholder: "https://your-coach-server.com",
    spellcheck: "false", autocapitalize: "off",
  });

  const status = el("p", {
    class: `server-status is-${s.server.status}`,
    text: serverStatusText(s.server.status),
  });

  return el("div", { class: "view view-profile" }, [
    el("header", { class: "view-head" }, [
      el("h1", { text: "Profile" }),
      el("p", { class: "view-sub", text: "How the coach talks to you." }),
    ]),

    section("You", null, [
      el("label", { class: "field-label", text: "Name" }),
      nameField,
      el("label", { class: "field-label", text: "Level" }),
      el("div", { class: "chip-row chip-row-tight" }, LEVELS.map((l) =>
        el("button", {
          class: `pick pick-inline${s.profile.level === l.id ? " is-on" : ""}`,
          type: "button",
          onclick: (e) => {
            store.update((st) => { st.profile.level = l.id; });
            markOne(e.currentTarget);
          },
        }, l.label))),
      el("label", { class: "field-label", text: "English" }),
      el("div", { class: "chip-row chip-row-tight" }, VARIETIES.map((v) =>
        el("button", {
          class: `pick pick-inline${s.profile.variety === v.id ? " is-on" : ""}`,
          type: "button",
          onclick: (e) => {
            store.update((st) => { st.profile.variety = v.id; });
            markOne(e.currentTarget);
          },
        }, `${v.flag} ${v.label}`))),
    ]),

    section("Conversation", null, [
      toggle("Speak the answers out loud", s.profile.autoSpeak, (on) =>
        store.update((st) => { st.profile.autoSpeak = on; })),
      toggle("Show the live transcript", s.profile.showTranscript, (on) =>
        store.update((st) => { st.profile.showTranscript = on; })),
    ]),

    section("AI coach", "Without a server the app uses its built-in coach. Point it at your own server to talk to Claude — the API key stays there, never in this app.", [
      el("label", { class: "field-label", text: "Server address" }),
      serverField,
      status,
      el("div", { class: "row-gap" }, [
        el("button", {
          class: "btn btn-primary",
          type: "button",
          onclick: async () => {
            status.textContent = "Checking…";
            status.className = "server-status is-checking";
            const res = await actions.connectServer(serverField.value);
            status.textContent = res.ok
              ? `Connected — ${res.model || "Claude"}`
              : `Not connected (${res.reason || "no answer"}) — using the built-in coach.`;
            status.className = `server-status is-${res.ok ? "ok" : "off"}`;
          },
        }, "Connect"),
        el("button", {
          class: "btn btn-ghost",
          type: "button",
          onclick: () => {
            serverField.value = "";
            actions.connectServer("");
            status.textContent = serverStatusText("off");
            status.className = "server-status is-off";
          },
        }, "Use built-in coach"),
      ]),
    ]),

    section("Data", "Everything is stored on this device only.", [
      el("button", {
        class: "btn btn-danger",
        type: "button",
        onclick: () => {
          if (!confirm("Erase your conversations, words and progress?")) return;
          store.reset();
          location.reload();
        },
      }, "Erase everything"),
    ]),

    el("p", { class: "about", text: "Coach · conversation first, correction second." }),
  ]);
}

function markOne(node) {
  [...node.parentElement.children].forEach((b) => b.classList.remove("is-on"));
  node.classList.add("is-on");
}

function serverStatusText(state) {
  if (state === "ok") return "Connected to your server.";
  if (state === "checking") return "Checking…";
  return "Using the built-in coach (works offline).";
}

function toggle(label, on, onChange) {
  const input = el("input", { type: "checkbox", checked: on ? true : null });
  input.addEventListener("change", () => onChange(input.checked));
  return el("label", { class: "toggle" }, [
    el("span", { text: label }),
    input,
    el("i", { class: "toggle-track" }),
  ]);
}

/* --------------------------------------------------------------- 6. DEBRIEF */

const TYPE_LABEL = {
  grammar: "Grammar",
  natural: "More natural",
  vocabulary: "Vocabulary",
  "word-choice": "Word choice",
  pronunciation: "Pronunciation",
};

export function correctionCard(fix) {
  return el("article", { class: "fix" }, [
    el("span", { class: `fix-type fix-${fix.type}`, text: TYPE_LABEL[fix.type] || "Tip" }),
    el("p", { class: "fix-before", text: fix.original }),
    el("p", { class: "fix-after", text: fix.better }),
    el("p", { class: "fix-why", text: fix.why }),
  ]);
}

export function viewDebrief(conv, actions) {
  const review = conv.review;
  const topic = topicById(conv.topic);

  return el("div", { class: "view view-debrief" }, [
    el("header", { class: "debrief-head" }, [
      el("p", { class: "debrief-kicker", text: "Conversation finished" }),
      el("h1", { text: "Nice one." }),
      el("p", { class: "view-sub", text: `${topic.label} · ${fmtDuration(conv.seconds)} · ${review.stats.turns} turns` }),
      review.summary ? el("p", { class: "debrief-summary", text: review.summary }) : null,
    ]),

    section("Conversation score", null, [
      el("div", { class: "meters" }, Object.entries(review.scores).map(([k, v]) =>
        meter(k[0].toUpperCase() + k.slice(1), v))),
      el("div", { class: "verdict" }, [
        el("p", {}, [
          el("b", { text: "Your strongest skill today: " }),
          el("span", { text: `${review.strongest.label} (${review.strongest.value}%)` }),
        ]),
        el("p", {}, [
          el("b", { text: "One thing for next time: " }),
          el("span", { text: review.focus.tip }),
        ]),
      ]),
    ]),

    review.vocabulary.length
      ? section("Words & expressions you discovered", "Saved to your vocabulary — they’ll come back later.", [
        el("div", { class: "word-list" }, review.vocabulary.map((w) => wordCard(w, actions))),
      ])
      : null,

    review.corrections.length
      ? section("A few things to improve", "Only the ones worth remembering.", [
        el("div", { class: "fix-list" }, review.corrections.map(correctionCard)),
      ])
      : section("A few things to improve", null, [
        empty("Nothing worth correcting this time.", "That’s a good sign — try a harder topic next."),
      ]),

    section("Transcript", null, [
      el("details", { class: "transcript-toggle" }, [
        el("summary", { text: `${conv.transcript.length} turns` }),
        el("div", { class: "transcript transcript-static" }, conv.transcript.map(bubble)),
      ]),
    ]),

    el("div", { class: "debrief-actions" }, [
      el("button", { class: "btn btn-primary", type: "button", onclick: () => actions.go("home") }, "Done"),
      el("button", { class: "btn btn-soft", type: "button", onclick: () => actions.startConversation() }, "Talk again"),
    ]),
  ]);
}

export function bubble(turn) {
  return el("div", { class: `bubble bubble-${turn.role}` }, [
    el("p", { text: turn.text }),
  ]);
}

/* --------------------------------------------------------------------- ícones */

export function soundSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 9.5h3.2L12 5.5v13L7.2 14.5H4z"/><path d="M16 9.2a4 4 0 0 1 0 5.6"/>
    <path d="M18.4 6.6a7.5 7.5 0 0 1 0 10.8"/></svg>`;
}

/* --------------------------------------------------------------------- ícone */

export function micSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="9" y="2.5" width="6" height="11" rx="3"/>
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/><path d="M8.5 21h7"/>
  </svg>`;
}
