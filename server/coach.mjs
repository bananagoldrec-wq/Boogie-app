/* Coach — o professor de verdade: monta os prompts e chama o Claude.

   Este arquivo roda SEMPRE no servidor. A chave da API vive aqui, em
   `ANTHROPIC_API_KEY`, e nunca é enviada ao navegador. O app só conhece as
   três funções abaixo, através de `index.mjs`. */

import Anthropic from "@anthropic-ai/sdk";
/* mesma lista que o app usa no navegador — sem cópia paralela pra desencontrar */
import { LEVELS, TOPICS, VARIETIES } from "../js/coach/content.js";

export const MODEL = process.env.COACH_MODEL || "claude-opus-5";

const client = new Anthropic();   // lê ANTHROPIC_API_KEY do ambiente

const byId = (list, id, fallback) => list.find((x) => x.id === id) || fallback;

/* --------------------------------------------------------------- personagem */

/* A parte estável do prompt vem primeiro e é cacheada: só o fim (nível, tema,
   variedade) muda entre conversas. */
const PERSONA = `You are a warm, experienced English conversation teacher having a spoken conversation with a learner. Your student is talking to you out loud through their phone, and your words are read back to them by a speech synthesiser.

How you talk:
- Conversation first, correction second. Keep the conversation flowing.
- Reply in one to three short spoken sentences, then ask ONE question.
- Speak like a person, not a textbook: contractions, natural rhythm, some humour.
- Never use markdown, bullet points, emoji, stage directions or asterisks. Plain spoken sentences only, because everything you write is spoken aloud.
- The transcript you receive comes from speech recognition, so it has no punctuation, wrong words and half-finished sentences. Work out what the student meant and respond to that. Never comment on transcription noise.
- If you truly cannot understand, ask a simple clarifying question and move on.

How you handle mistakes:
- Do NOT correct small mistakes during the conversation. Understanding matters more.
- Only recast a mistake mid-conversation if it makes the meaning genuinely unclear, and even then do it naturally, by using the right form in your own reply.
- At most once every few turns, when it fits, offer a more natural alternative in one short sentence, for example "you could also say ..." or "that works, and this sounds a bit more casual". Never more than one per reply, and never two turns in a row.
- Sound encouraging without gushing. No exclamation marks in every sentence, no "Amazing!!!" energy.

Who you are not:
- Not a formal teacher running a lesson.
- Not a chatbot that lists options or offers to help with tasks.
- Not a therapist. If the student brings up something heavy, respond like a kind person and let them lead.

You are comfortable with imperfect English, accents, pauses and hesitation.`;

function context({ levelId, topicId, varietyId, name, known = [] }) {
  const level = byId(LEVELS, levelId, LEVELS[2]);
  const topic = byId(TOPICS, topicId, TOPICS[0]);
  const variety = byId(VARIETIES, varietyId, VARIETIES[0]);

  const lines = [
    `Student level: ${level.label} (${level.short}). ${level.guidance}`,
    `English variety: ${variety.label}. Use its everyday vocabulary, spelling and idiom.`,
    `Situation: ${topic.label} — ${topic.blurb}`,
  ];
  if (topic.id === "free") lines.push("No fixed topic: follow whatever the student wants to talk about.");
  if (name) lines.push(`The student's name is ${name}. Use it occasionally, not every turn.`);
  if (known.length) {
    lines.push(
      `Expressions this student has already learned here: ${known.slice(-24).join(", ")}. ` +
      "Slip one or two of them into the conversation naturally when they fit — it is how the words stick."
    );
  }
  return lines.join("\n");
}

function history(transcript = []) {
  return transcript
    .filter((t) => t && t.text)
    .slice(-24)
    .map((t) => ({
      role: t.role === "user" ? "user" : "assistant",
      content: String(t.text).slice(0, 2000),
    }));
}

const textOf = (message) => {
  const block = (message.content || []).find((b) => b.type === "text");
  return block ? block.text.trim() : "";
};

/* -------------------------------------------------------------- 1. abertura */

export async function opening(params) {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    output_config: { effort: "low" },
    system: [
      { type: "text", text: PERSONA, cache_control: { type: "ephemeral" } },
      { type: "text", text: context(params) },
    ],
    messages: [{
      role: "user",
      content:
        "Start the conversation. Greet the student in one short sentence and ask an opening " +
        "question that fits the situation. Keep it under 30 words.",
    }],
  });
  return { text: textOf(message) };
}

/* --------------------------------------------------------------- 2. resposta */

export async function reply(params) {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    output_config: { effort: "low" },
    system: [
      { type: "text", text: PERSONA, cache_control: { type: "ephemeral" } },
      { type: "text", text: context(params) },
    ],
    messages: [
      ...history(params.transcript),
      { role: "user", content: String(params.userText || "").slice(0, 2000) },
    ],
  });
  return { text: textOf(message) };
}

/* --------------------------------------------------------- 3. fim da conversa */

const DEBRIEF_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Two encouraging sentences about how the conversation went. Speak to the student as 'you'.",
    },
    corrections: {
      type: "array",
      description: "Between 0 and 5 corrections, the most useful ones only.",
      items: {
        type: "object",
        properties: {
          original: { type: "string", description: "What the student actually said, cleaned of transcription noise." },
          better: { type: "string", description: "The improved version." },
          type: {
            type: "string",
            enum: ["grammar", "natural", "vocabulary", "word-choice", "pronunciation"],
            description: "'natural' means it was correct but a native speaker would phrase it differently.",
          },
          why: { type: "string", description: "One or two short sentences explaining why, in simple English." },
        },
        required: ["original", "better", "type", "why"],
        additionalProperties: false,
      },
    },
    vocabulary: {
      type: "array",
      description: "Between 3 and 7 useful expressions the student did not use but would have needed here.",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          def: { type: "string", description: "A simple definition, under 12 words." },
          ex: { type: "string", description: "One natural example sentence." },
          ipa: { type: "string", description: "Rough IPA pronunciation, e.g. /ˈɔːkwərd/." },
          level: { type: "string", enum: ["beginner", "elementary", "intermediate", "upper", "advanced"] },
          register: { type: "string", enum: ["formal", "neutral", "casual", "slang"] },
          region: { type: "string", enum: ["US", "UK", "both"] },
        },
        required: ["term", "def", "ex", "ipa", "level", "register", "region"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "corrections", "vocabulary"],
  additionalProperties: false,
};

const DEBRIEF_RULES = `You are reviewing a spoken English conversation you just had with your student. Produce the notes they will read afterwards.

Rules for corrections:
- Pick at most five, and only the ones worth remembering. If the student spoke well, return fewer, or none.
- Never list the same kind of mistake twice.
- The transcript comes from speech recognition. Ignore anything that is clearly a transcription error rather than a real mistake — missing punctuation, homophones, cut-off words.
- Mark something as "natural" when it was technically correct but a native speaker would say it differently, and say so kindly.
- Keep every explanation short and free of grammar jargon the student's level would not know.

Rules for vocabulary:
- Choose three to seven expressions that fit what the student was actually trying to say, and that they did NOT already use.
- Prefer things people really say over textbook vocabulary.
- Do not repeat expressions the student has already learned.
- Match the difficulty to their level: one or two can stretch them, the rest should be usable tomorrow.`;

export async function debrief(params) {
  const transcript = history(params.transcript)
    .map((t) => `${t.role === "user" ? "Student" : "You"}: ${t.content}`)
    .join("\n");

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: DEBRIEF_SCHEMA },
    },
    system: [
      { type: "text", text: PERSONA, cache_control: { type: "ephemeral" } },
      { type: "text", text: DEBRIEF_RULES },
      { type: "text", text: context(params) },
    ],
    messages: [{
      role: "user",
      content: `Here is the conversation:\n\n${transcript}\n\nWrite the student's notes.`,
    }],
  });

  const raw = textOf(message);
  try {
    const data = JSON.parse(raw);
    return {
      summary: String(data.summary || ""),
      corrections: Array.isArray(data.corrections) ? data.corrections.slice(0, 5) : [],
      vocabulary: Array.isArray(data.vocabulary) ? data.vocabulary.slice(0, 7) : [],
    };
  } catch {
    /* sem JSON válido o app usa o professor local — melhor que uma tela vazia */
    return { summary: "", corrections: [], vocabulary: [] };
  }
}
