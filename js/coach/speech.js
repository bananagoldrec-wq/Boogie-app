/* Coach — voz: reconhecimento (fala → texto) e síntese (texto → fala).

   Usa só o que já existe no navegador (Web Speech API), então não há chave
   de API nem áudio saindo do aparelho pra transcrever. Quando o navegador
   não suporta reconhecimento (Firefox, por exemplo), o app cai no teclado —
   `recognitionSupported` avisa a interface. */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

export const recognitionSupported = !!SR;
export const synthesisSupported = "speechSynthesis" in window;

/* ------------------------------------------------------------------ escuta */

export class Listener {
  constructor({ lang = "en-US", onPartial, onFinal, onError, onState } = {}) {
    this.lang = lang;
    this.onPartial = onPartial || (() => {});
    this.onFinal = onFinal || (() => {});
    this.onError = onError || (() => {});
    this.onState = onState || (() => {});
    this.active = false;      // o usuário quer estar escutando
    this.running = false;     // o objeto nativo está rodando agora
    this.rec = null;
    this.muteUntil = 0;       // ignora resultados logo após falar (eco)
    this.guardText = "";      // o que o professor está falando agora
  }

  _build() {
    const rec = new SR();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.running = true;
      this.onState("listening");
    };

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = (result[0] && result[0].transcript) || "";
        if (result.isFinal) {
          const clean = text.trim();
          if (clean && !this._isEcho(clean)) this.onFinal(clean);
        } else {
          interim += text;
        }
      }
      const partial = interim.trim();
      if (partial && !this._isEcho(partial)) this.onPartial(partial);
    };

    rec.onerror = (event) => {
      /* `no-speech` e `aborted` são normais numa conversa: só reinicia. */
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.active = false;
        this.onError("mic-denied");
        return;
      }
      this.onError(event.error || "unknown");
    };

    rec.onend = () => {
      this.running = false;
      this.onState("idle");
      /* O navegador encerra sozinho depois de um tempo de silêncio. */
      if (this.active) setTimeout(() => this._spin(), 220);
    };

    return rec;
  }

  _spin() {
    if (!this.active || this.running) return;
    try {
      this.rec = this.rec || this._build();
      this.rec.start();
    } catch {
      /* start() enquanto já rodando lança: ignorar. */
    }
  }

  /* Descarta o que veio do próprio alto-falante (quem usa sem fone). */
  _isEcho(text) {
    if (Date.now() < this.muteUntil) return true;
    if (!this.guardText) return false;
    const words = text.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
    if (!words.length) return false;
    const guard = " " + this.guardText.toLowerCase().replace(/[^a-z' ]/g, " ") + " ";
    const inside = words.filter((w) => guard.includes(" " + w + " ")).length;
    return inside / words.length > 0.7;
  }

  setLang(lang) {
    this.lang = lang;
    if (this.rec) this.rec.lang = lang;
  }

  start() {
    if (!SR) {
      this.onError("unsupported");
      return false;
    }
    this.active = true;
    this._spin();
    return true;
  }

  stop() {
    this.active = false;
    this.guardText = "";
    if (this.rec && this.running) {
      try { this.rec.stop(); } catch { /* já parado */ }
    }
  }

  /** Silencia por um instante (usado logo depois que o professor fala). */
  mute(ms) {
    this.muteUntil = Date.now() + ms;
  }
}

/* -------------------------------------------------------------------- fala */

let voicesCache = [];

function loadVoices() {
  if (!synthesisSupported) return [];
  voicesCache = window.speechSynthesis.getVoices() || [];
  return voicesCache;
}

if (synthesisSupported) {
  loadVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}

/** Melhor voz disponível pra uma variedade de inglês. */
export function pickVoice(lang) {
  const voices = voicesCache.length ? voicesCache : loadVoices();
  const en = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("en"));
  if (!en.length) return null;
  const want = lang.toLowerCase();
  const exact = en.filter((v) => v.lang.toLowerCase().replace("_", "-") === want);
  const pool = exact.length ? exact : en;
  /* Vozes "premium"/neurais costumam ter esses nomes nos sistemas atuais. */
  const nice = pool.find((v) => /natural|neural|premium|enhanced|siri|google/i.test(v.name));
  return nice || pool[0];
}

export class Speaker {
  constructor({ lang = "en-US", rate = 1 } = {}) {
    this.lang = lang;
    this.rate = rate;
    this.speaking = false;
    this.current = null;
    this.onStart = () => {};
    this.onEnd = () => {};
  }

  setVoice(lang, rate) {
    this.lang = lang || this.lang;
    if (rate) this.rate = rate;
  }

  /** Fala o texto e resolve quando termina (ou quando é interrompido). */
  speak(text) {
    if (!synthesisSupported || !text) return Promise.resolve("skipped");
    this.cancel();
    return new Promise((resolve) => {
      const utter = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(this.lang);
      if (voice) utter.voice = voice;
      utter.lang = this.lang;
      utter.rate = this.rate;
      utter.pitch = 1;
      let done = false;
      const finish = (why) => {
        if (done) return;
        done = true;
        this.speaking = false;
        this.current = null;
        this.onEnd(why);
        resolve(why);
      };
      utter.onstart = () => {
        this.speaking = true;
        this.onStart(text);
      };
      utter.onend = () => finish("ended");
      utter.onerror = () => finish("error");
      this.current = utter;
      /* Chrome trava a fila quando fica pausado; garantir que está solta. */
      try { window.speechSynthesis.resume(); } catch { /* noop */ }
      window.speechSynthesis.speak(utter);
      /* Salvaguarda: se o navegador nunca disparar onend, libera a conversa. */
      const guard = Math.max(4000, text.length * 90);
      setTimeout(() => { if (!done && !window.speechSynthesis.speaking) finish("timeout"); }, guard);
    });
  }

  cancel() {
    if (!synthesisSupported) return;
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    this.speaking = false;
    this.current = null;
  }

  pause() {
    if (synthesisSupported && this.speaking) {
      try { window.speechSynthesis.pause(); } catch { /* noop */ }
    }
  }

  resume() {
    if (synthesisSupported) {
      try { window.speechSynthesis.resume(); } catch { /* noop */ }
    }
  }
}

/* ------------------------------------------------- medidor de volume do micro */

/* Só pra animação da bolha. Se o navegador negar, a interface usa a
   animação sintética e nada quebra. */
export class Meter {
  constructor() {
    this.level = 0;
    this.stream = null;
    this.ctx = null;
    this.raf = 0;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      const src = this.ctx.createMediaStreamSource(this.stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        this.level = this.level * 0.7 + Math.min(1, rms * 4) * 0.3;
        this.raf = requestAnimationFrame(tick);
      };
      tick();
      return true;
    } catch {
      return false;
    }
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.level = 0;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
