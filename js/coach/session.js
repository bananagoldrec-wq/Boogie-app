/* Coach — a conversa ao vivo.

   Junta microfone, voz e professor numa máquina de estados pequena:

     opening → listening → (aluno fala) → thinking → speaking → listening …

   A regra de ouro é nunca deixar o aluno falando sozinho: qualquer falha
   (rede, permissão, navegador sem reconhecimento) volta pro estado de
   escuta ou abre o teclado, em vez de travar a tela. */

import { Listener, Speaker, Meter, recognitionSupported } from "./speech.js";
import * as ai from "./ai.js";
import { levelById, varietyById, topicById } from "./content.js";

const SILENCE_MS = 1000;   // silêncio que fecha o turno do aluno

export class Session {
  constructor(config, handlers = {}) {
    this.config = config;                 // { topicId, levelId, varietyId, minutes, name, known }
    this.on = handlers;                   // { onChange, onTranscript, onError }
    this.transcript = [];
    this.state = "idle";
    this.partial = "";
    this.buffer = [];
    this.startedAt = 0;
    this.seconds = 0;
    this.muted = false;
    this.wrapped = false;
    this.ticker = 0;
    this.silenceTimer = 0;

    const level = levelById(config.levelId);
    const variety = varietyById(config.varietyId);

    this.speaker = new Speaker({ lang: variety.voiceLang, rate: level.rate });
    this.meter = new Meter();
    this.listener = new Listener({
      lang: variety.voiceLang,
      onPartial: (text) => this._onPartial(text),
      onFinal: (text) => this._onFinal(text),
      onError: (code) => this._onError(code),
    });
  }

  /* ------------------------------------------------------------- ciclo de vida */

  async start() {
    this.startedAt = Date.now();
    this.ticker = setInterval(() => {
      this.seconds = Math.round((Date.now() - this.startedAt) / 1000);
      this._emit();
      this._maybeWrap();
    }, 1000);

    this.meter.start().catch(() => {});

    this._set("thinking");
    const open = await ai.opening({
      topicId: this.config.topicId,
      levelId: this.config.levelId,
      varietyId: this.config.varietyId,
      name: this.config.name,
    });
    await this._say(open.text, open.source);
    this._listen();
  }

  /** Encerra e devolve o material da conversa. */
  async end() {
    clearInterval(this.ticker);
    clearTimeout(this.silenceTimer);
    this.listener.stop();
    this.speaker.cancel();
    this.meter.stop();
    this._set("ended");
    this.seconds = Math.round((Date.now() - this.startedAt) / 1000);
    return {
      transcript: this.transcript,
      seconds: this.seconds,
    };
  }

  pause() {
    if (this.state === "ended") return;
    clearTimeout(this.silenceTimer);
    this.listener.stop();
    this.speaker.cancel();
    this._set("paused");
  }

  resume() {
    if (this.state !== "paused") return;
    this._listen();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.listener.stop();
      this._set("muted");
    } else {
      this._listen();
    }
    return this.muted;
  }

  /** O aluno tocou na bolha enquanto o professor falava: cortar e ouvir. */
  interrupt() {
    if (this.speaker.speaking) {
      this.speaker.cancel();
      this._listen();
      return true;
    }
    return false;
  }

  /* --------------------------------------------------------------- entrada */

  _onPartial(text) {
    if (this.state === "ended" || this.muted) return;
    this.partial = text;
    /* fala por cima do professor: ele cala e escuta (interrupção natural) */
    if (this.speaker.speaking && text.split(/\s+/).length >= 2) {
      this.speaker.cancel();
      this._set("listening");
    }
    this._emit();
    this._armSilence();
  }

  _onFinal(text) {
    if (this.state === "ended" || this.muted) return;
    this.buffer.push(text);
    this.partial = "";
    this._emit();
    this._armSilence();
  }

  _armSilence() {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this._commit(), SILENCE_MS);
  }

  /** Fecha o turno do aluno e pede a resposta do professor. */
  async _commit() {
    const text = [...this.buffer, this.partial].join(" ").replace(/\s+/g, " ").trim();
    this.buffer = [];
    this.partial = "";
    if (text.split(/\s+/).filter(Boolean).length < 1) return;
    await this.send(text);
  }

  /** Turno do aluno vindo da voz ou do teclado. */
  async send(text) {
    if (!text || this.state === "ended") return;
    clearTimeout(this.silenceTimer);
    this._push("user", text);
    this._set("thinking");

    const out = await ai.reply({
      topicId: this.config.topicId,
      levelId: this.config.levelId,
      varietyId: this.config.varietyId,
      transcript: this.transcript.slice(0, -1),
      userText: text,
      known: this.config.known || [],
    });

    if (this.state === "ended") return;
    await this._say(out.text, out.source);
    if (this.state !== "ended" && this.state !== "paused" && !this.muted) this._listen();
  }

  /* ---------------------------------------------------------------- saída */

  async _say(text, source) {
    this._push("assistant", text, source);
    this._set("speaking");
    this.listener.guardText = text;
    if (this.config.speak === false) {
      this.listener.guardText = "";
      return;
    }
    await this.speaker.speak(text);
    this.listener.guardText = "";
    this.listener.mute(240);
  }

  _listen() {
    if (this.state === "ended") return;
    this._set("listening");
    if (recognitionSupported) this.listener.start();
  }

  _onError(code) {
    if (code === "mic-denied") {
      this._set("blocked");
      this.on.onError?.("mic-denied");
    } else if (code === "unsupported") {
      this._set("typing");
      this.on.onError?.("unsupported");
    }
  }

  /** Perto do tempo escolhido, o professor puxa o encerramento uma vez só. */
  _maybeWrap() {
    const limit = (this.config.minutes || 0) * 60;
    if (!limit || this.wrapped || this.seconds < limit) return;
    this.wrapped = true;
    this.on.onWrap?.();
  }

  /* ----------------------------------------------------------------- estado */

  _push(role, text, source) {
    this.transcript.push({ role, text, source, at: Date.now() });
    this.on.onTranscript?.(this.transcript);
  }

  _set(state) {
    this.state = state;
    this._emit();
  }

  _emit() {
    this.on.onChange?.({
      state: this.state,
      partial: this.partial,
      seconds: this.seconds,
      level: this.meter.level,
      muted: this.muted,
      speaking: this.speaker.speaking,
    });
  }

  get topic() {
    return topicById(this.config.topicId);
  }
}
