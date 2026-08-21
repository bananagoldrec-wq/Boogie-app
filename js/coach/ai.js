/* Coach — ponte com o professor de verdade (Claude), via servidor próprio.

   O navegador nunca vê a chave da API: ele fala com `server/` (veja
   `docs/COACH.md`), que guarda a credencial e chama a Anthropic. Se não
   houver servidor configurado, ou se a rede falhar no meio da conversa, o
   motor offline (`engine.js`) assume — o aluno não fica sem resposta. */

import * as engine from "./engine.js";

const TIMEOUT_MS = 20000;

let base = "";            // ex.: https://meu-servidor.com
let online = false;       // último health check deu certo?

export const isOnline = () => online;
export const baseUrl = () => base;

function normalise(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

async function call(path, body, ms = TIMEOUT_MS) {
  if (!base) throw new Error("no-server");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error("http-" + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Aponta o app pra um servidor e confere se ele responde. */
export async function connect(url) {
  base = normalise(url);
  if (!base) {
    online = false;
    return { ok: false, reason: "empty" };
  }
  try {
    const info = await call("/api/health", null, 8000);
    online = !!info.ok && !!info.hasKey;
    return { ok: online, ...info };
  } catch (err) {
    online = false;
    return { ok: false, reason: String(err.message || err) };
  }
}

/** Procura um servidor na mesma origem (deploy único front + API). */
export async function autodetect() {
  if (/github\.io$/i.test(location.hostname) || location.protocol === "file:") return false;
  const res = await connect(location.origin);
  return res.ok;
}

export function disconnect() {
  base = "";
  online = false;
}

/* ------------------------------------------------------------------ conversa */

/** Abertura da conversa. */
export async function opening(params) {
  if (online) {
    try {
      const out = await call("/api/open", params);
      if (out && out.text) return { text: out.text, source: "claude" };
    } catch { /* cai pro offline */ }
  }
  return engine.opening(params);
}

/** Resposta do professor a uma fala do aluno. */
export async function reply(params) {
  if (online) {
    try {
      const out = await call("/api/reply", params);
      if (out && out.text) return { text: out.text, source: "claude" };
    } catch { /* cai pro offline */ }
  }
  return engine.reply(params);
}

/**
 * Fecha a conversa: correções, vocabulário e notas.
 * A API devolve só a parte "de professor" (correções e vocabulário); as
 * notas continuam vindo do cálculo local, pra serem consistentes entre
 * conversas online e offline.
 */
export async function debrief(params) {
  const local = engine.debrief(params);
  if (!online) return local;
  try {
    const out = await call("/api/debrief", params, 45000);
    if (!out || (!out.corrections && !out.vocabulary)) return local;
    const corrections = Array.isArray(out.corrections) && out.corrections.length
      ? out.corrections.slice(0, 5)
      : local.corrections;
    const vocabulary = Array.isArray(out.vocabulary) && out.vocabulary.length
      ? out.vocabulary.slice(0, 7)
      : local.vocabulary;
    /* recalcula as notas com as correções que o Claude achou */
    const scored = engine.scoreConversation({
      transcript: params.transcript,
      corrections,
      levelId: params.levelId,
      seconds: params.seconds,
    });
    return {
      ...local,
      ...scored,
      corrections,
      vocabulary,
      summary: out.summary || local.summary,
      source: "claude",
    };
  } catch {
    return local;
  }
}
