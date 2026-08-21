/* Coach — montagem do app: rotas, onboarding e a tela de conversa.

   Fluxo principal: escolher tema → falar → o professor responde → encerrar →
   ver as correções e as palavras novas. Tudo o mais é apoio a isso. */

import * as store from "./store.js";
import * as ai from "./ai.js";
import { Session } from "./session.js";
import { Speaker, recognitionSupported, synthesisSupported } from "./speech.js";
import { el, $, toast, closeSheet, clock } from "./ui.js";
import {
  viewHome, viewTalk, viewLearn, viewProgress, viewProfile, viewDebrief,
  conversationSheet, bubble,
} from "./views.js";
import { LEVELS, VARIETIES, topicById, surpriseTopic, levelById, varietyById } from "./content.js";

/* --------------------------------------------------------------- estado da UI */

let current = "home";
let session = null;
let lastDebrief = null;
const speaker = new Speaker();

const screen = () => $("#screen");

/* ----------------------------------------------------------------- ações */

const actions = {
  go(tab) {
    current = tab;
    render();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  },
  rerender: () => render(),
  closeSheet,
  speak(text) {
    const p = store.get().profile;
    const v = varietyById(p.variety);
    speaker.setVoice(v.voiceLang, levelById(p.level).rate);
    speaker.speak(text);
  },
  openConversation(id) {
    const conv = store.conversationById(id);
    if (conv) conversationSheet(conv, actions);
  },
  async connectServer(url) {
    const res = await ai.connect(url);
    store.update((s) => {
      s.server.url = url.trim();
      s.server.status = res.ok ? "ok" : "off";
    });
    paintServerBadge();
    return res;
  },
  startConversation: () => startConversation(),
};

/* ------------------------------------------------------------------- render */

function render() {
  const host = screen();
  if (!host) return;
  let view;
  if (current === "home") view = viewHome(actions);
  else if (current === "talk") view = viewTalk(actions);
  else if (current === "learn") view = viewLearn(actions);
  else if (current === "progress") view = viewProgress(actions);
  else if (current === "profile") view = viewProfile(actions);
  else if (current === "debrief" && lastDebrief) view = viewDebrief(lastDebrief, actions);
  else view = viewHome(actions);

  host.replaceChildren(view);
  for (const btn of document.querySelectorAll(".tabbar button")) {
    btn.classList.toggle("is-on", btn.dataset.tab === current);
    btn.setAttribute("aria-current", btn.dataset.tab === current ? "page" : "false");
  }
  document.querySelector(".tabbar").hidden = false;
}

function paintServerBadge() {
  const badge = $("#server-badge");
  if (!badge) return;
  const on = ai.isOnline();
  badge.textContent = on ? "Claude" : "Built-in coach";
  badge.className = `server-badge${on ? " is-on" : ""}`;
}

/* --------------------------------------------------------------- onboarding */

function onboarding() {
  const host = $("#onboarding");
  host.hidden = false;
  let step = 0;
  const draft = { name: "", level: "intermediate", variety: "us" };

  const draw = () => {
    const body = $("#onboarding-body");
    if (step === 0) {
      const input = el("input", { class: "field field-big", type: "text", placeholder: "Your name", value: draft.name });
      body.replaceChildren(
        el("p", { class: "ob-kicker", text: "Welcome" }),
        el("h1", { class: "ob-title", text: "Let’s have a conversation." }),
        el("p", { class: "ob-text", text: "This isn’t a grammar course. You talk, I follow — and afterwards I tell you the few things worth knowing." }),
        input,
        el("button", {
          class: "btn btn-primary btn-block",
          type: "button",
          onclick: () => { draft.name = input.value.trim(); step = 1; draw(); },
        }, "Continue"),
      );
      setTimeout(() => input.focus(), 120);
    } else if (step === 1) {
      body.replaceChildren(
        el("p", { class: "ob-kicker", text: "Step 2 of 3" }),
        el("h1", { class: "ob-title", text: "How’s your English today?" }),
        el("p", { class: "ob-text", text: "Pick whatever feels honest. I’ll adjust as we talk." }),
        el("div", { class: "chip-row" }, LEVELS.map((l) =>
          el("button", {
            class: `pick${draft.level === l.id ? " is-on" : ""}`,
            type: "button",
            onclick: () => { draft.level = l.id; step = 2; draw(); },
          }, [el("b", { text: l.label }), el("small", { text: l.blurb })]))),
      );
    } else {
      body.replaceChildren(
        el("p", { class: "ob-kicker", text: "Step 3 of 3" }),
        el("h1", { class: "ob-title", text: "Which English do you want?" }),
        el("p", { class: "ob-text", text: "It changes the accent you hear and the slang I teach." }),
        el("div", { class: "chip-row" }, VARIETIES.map((v) =>
          el("button", {
            class: `pick${draft.variety === v.id ? " is-on" : ""}`,
            type: "button",
            onclick: (e) => {
              draft.variety = v.id;
              [...e.currentTarget.parentElement.children].forEach((b) => b.classList.remove("is-on"));
              e.currentTarget.classList.add("is-on");
            },
          }, [el("b", { text: `${v.flag} ${v.label}` }), el("small", { text: v.note })]))),
        el("button", {
          class: "btn btn-primary btn-block",
          type: "button",
          onclick: () => {
            store.update((s) => {
              Object.assign(s.profile, draft);
              s.onboarded = true;
            });
            host.hidden = true;
            render();
            actions.go("talk");
          },
        }, "Start talking"),
      );
    }
  };

  draw();
}

/* ------------------------------------------------------------ tela de conversa */

const STATUS_TEXT = {
  thinking: "Thinking…",
  speaking: "Speaking",
  listening: "Listening…",
  paused: "Paused",
  muted: "Mic off",
  blocked: "Microphone blocked",
  typing: "Type your answer",
  idle: "",
  ended: "",
};

function voiceUI() {
  return {
    host: $("#voice"),
    orb: $("#orb"),
    status: $("#voice-status"),
    timer: $("#voice-timer"),
    topic: $("#voice-topic"),
    live: $("#voice-live"),
    transcript: $("#voice-transcript"),
    partial: $("#voice-partial"),
  };
}

async function startConversation() {
  const profile = store.get().profile;
  const topicId = profile.topic === "surprise" || !profile.topic
    ? surpriseTopic(store.get().conversations.slice(0, 4).map((c) => c.topic)).id
    : profile.topic;

  const ui = voiceUI();
  ui.host.hidden = false;
  requestAnimationFrame(() => ui.host.classList.add("is-on"));
  ui.topic.textContent = topicById(topicId).label;
  ui.transcript.replaceChildren();
  ui.partial.textContent = "";
  ui.live.hidden = !profile.showTranscript;
  $("#voice-shell").classList.remove("is-ending");

  session = new Session({
    topicId,
    levelId: profile.level,
    varietyId: profile.variety,
    minutes: profile.duration,
    name: profile.name,
    known: store.knownTerms(),
    speak: profile.autoSpeak && synthesisSupported,
  }, {
    onChange: paintVoice,
    onTranscript: paintTranscript,
    onWrap: () => toast("Time’s up whenever you are — finish the thought and hit End."),
    onError: (code) => {
      if (code === "mic-denied") {
        toast("I can’t hear you — allow the microphone, or type instead.");
        openKeyboard(true);
      } else if (code === "unsupported") {
        openKeyboard(true);
      }
    },
  });

  if (!recognitionSupported) openKeyboard(true);
  await session.start();
}

function paintVoice(s) {
  const ui = voiceUI();
  if (!ui.host || ui.host.hidden) return;
  ui.status.textContent = STATUS_TEXT[s.state] ?? "";
  ui.timer.textContent = clock(s.seconds);
  ui.partial.textContent = s.partial;
  ui.host.dataset.state = s.state;
  const scale = 1 + (s.state === "speaking" ? 0.05 : 0) + Math.min(0.34, s.level * 0.5);
  ui.orb.style.setProperty("--orb-scale", scale.toFixed(3));
  $("#btn-mute").classList.toggle("is-off", s.muted);
  $("#btn-pause").textContent = s.state === "paused" ? "Resume" : "Pause";
}

function paintTranscript(list) {
  const ui = voiceUI();
  if (!ui.transcript) return;
  ui.transcript.replaceChildren(...list.slice(-8).map(bubble));
  ui.transcript.scrollTop = ui.transcript.scrollHeight;
}

function openKeyboard(force) {
  const box = $("#voice-keyboard");
  /* sem reconhecimento de voz o teclado é a única entrada: nunca esconder */
  box.hidden = force || !recognitionSupported ? false : !box.hidden;
  if (!box.hidden) setTimeout(() => $("#voice-input").focus(), 80);
}

async function endConversation() {
  if (!session) return;
  const shell = $("#voice-shell");
  shell.classList.add("is-ending");
  $("#voice-status").textContent = "Putting your notes together…";

  const { transcript, seconds } = await session.end();
  const config = session.config;
  session = null;

  const userTurns = transcript.filter((t) => t.role === "user");
  if (!userTurns.length) {
    closeVoice();
    toast("No worries — nothing to review this time.");
    actions.go("home");
    return;
  }

  const review = await ai.debrief({
    topicId: config.topicId,
    levelId: config.levelId,
    varietyId: config.varietyId,
    transcript,
    known: store.knownTerms(),
    seconds,
  });

  const conv = {
    id: `c${Date.now().toString(36)}`,
    startedAt: new Date(Date.now() - seconds * 1000).toISOString(),
    topic: config.topicId,
    level: config.levelId,
    variety: config.varietyId,
    seconds,
    turns: userTurns.length,
    transcript,
    review,
  };

  store.saveConversation(conv);
  store.learnWords(review.vocabulary || [], "conversation");
  store.touchStreak();

  lastDebrief = conv;
  closeVoice();
  actions.go("debrief");
}

function closeVoice() {
  const ui = voiceUI();
  ui.host.classList.remove("is-on");
  setTimeout(() => { ui.host.hidden = true; }, 260);
  $("#voice-keyboard").hidden = true;
}

/* ------------------------------------------------------------------ arranque */

function wire() {
  for (const btn of document.querySelectorAll(".tabbar button")) {
    btn.addEventListener("click", () => actions.go(btn.dataset.tab));
  }

  $("#sheet-close").addEventListener("click", closeSheet);
  $("#sheet-backdrop").addEventListener("click", closeSheet);

  $("#btn-end").addEventListener("click", endConversation);
  $("#btn-pause").addEventListener("click", () => {
    if (!session) return;
    if (session.state === "paused") session.resume();
    else session.pause();
  });
  $("#btn-mute").addEventListener("click", () => session?.toggleMute());
  $("#btn-keyboard").addEventListener("click", () => openKeyboard(false));
  $("#btn-transcript").addEventListener("click", () => {
    const live = $("#voice-live");
    live.hidden = !live.hidden;
  });
  $("#orb").addEventListener("click", () => {
    if (session?.interrupt()) toast("Go ahead — I’m listening.");
  });

  $("#voice-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#voice-input");
    const text = input.value.trim();
    if (!text || !session) return;
    input.value = "";
    session.send(text);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("#sheet").hidden) closeSheet();
      else if (!$("#voice").hidden) endConversation();
    }
  });
}

async function boot() {
  store.load();
  wire();

  const saved = store.get().server.url;
  if (saved) {
    const res = await ai.connect(saved);
    store.update((s) => { s.server.status = res.ok ? "ok" : "off"; });
  } else {
    await ai.autodetect();
    if (ai.isOnline()) {
      store.update((s) => { s.server.url = ai.baseUrl(); s.server.status = "ok"; });
    }
  }
  paintServerBadge();

  render();
  if (!store.get().onboarded) onboarding();
}

boot();
