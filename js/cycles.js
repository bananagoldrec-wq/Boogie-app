/* Cycles Visual — transforma o MIDI (e opcionalmente o áudio) do Elektron
   Model:Cycles em imagens.

   Cada nota (trig) recebida vira uma forma:
   - trilha/máquina (KICK, SNARE, METAL, PERC, TONE, CHORD) → formato
   - velocity × nível/volume da trilha                     → tamanho e opacidade
   - frequência (nota + pitch, ou o pico real do áudio)      → cor e altura na tela
   - decay → quanto tempo dura; color/shape → detalhes do desenho;
     sweep → giro; contour → anéis; pan → posição horizontal;
     reverb → brilho; delay → ecos.
   A forma com mais energia no momento ganha um contorno ("mais alto agora").

   Sem dependências; Web MIDI funciona no Chrome/Edge (desktop e Android). */
(() => {
  "use strict";

  // ---------- constantes ----------
  // 0–5 são as máquinas do Cycles; 6 e 7 só aparecem com música (voz e efeitos)
  const MACHINES = ["KICK", "SNARE", "METAL", "PERC", "TONE", "CHORD", "VOZ", "FX", "BAIXO"];
  const TRACK_COLORS = ["--t1", "--t2", "--t3", "--t4", "--t5", "--t6"];
  // Mapeamento padrão de CCs do Model:Cycles. Confira no apêndice do manual;
  // dá pra corrigir no app com "Aprender".
  const DEFAULT_CC = {
    machine: 64, level: 95, volume: 7, pitch: 65, decay: 80,
    color: 16, shape: 17, sweep: 18, contour: 19, pan: 10, delay: 12, reverb: 13,
  };
  const PARAMS = [
    ["machine", "Máquina", "formato"],
    ["level", "Track level", "tamanho"],
    ["volume", "Volume + dist", "tamanho"],
    ["pitch", "Pitch / tune", "cor e altura"],
    ["decay", "Decay", "duração"],
    ["color", "Color", "detalhe / saturação"],
    ["shape", "Shape", "nº de pontas/lados"],
    ["sweep", "Sweep", "giro"],
    ["contour", "Contour", "anéis"],
    ["pan", "Pan", "posição horizontal"],
    ["delay", "Delay send", "ecos"],
    ["reverb", "Reverb send", "brilho"],
  ];
  const STORE_KEY = "cycles-visual-v1";

  // ---------- ajustes salvos ----------
  const settings = Object.assign(
    {
      channels: [1, 2, 3, 4, 5, 6],
      cc: { ...DEFAULT_CC },
      mode: "vivo",
      layout: "livre",
      palette: "espectro",
      inputId: "",
      clearOnPlay: false,
      onset: true,
      style: "abstrato",
      showPanel: false,
      ref: "tudo",
      refFid: "media",
    },
    load()
  );
  settings.cc = Object.assign({ ...DEFAULT_CC }, settings.cc);

  const store = {
    get(k) { try { return localStorage.getItem("cycles-" + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("cycles-" + k, v); } catch { /* sem storage */ } },
  };
  function applyPanel() { document.body.classList.toggle("clean", !settings.showPanel); }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* sem storage */ }
  }

  // ---------- estado das trilhas ----------
  const tracks = MACHINES.map((_, i) => ({
    machine: i, level: 100, volume: 90, pitch: 64, decay: 64, color: 64, shape: 64,
    sweep: 40, contour: 40, pan: 64, delay: 0, reverb: 20,
    lastVel: 0, lastNote: 60, energy: 0,
  }));
  Object.assign(tracks[6], { decay: 95, reverb: 75, sweep: 55, color: 50 }); // voz: longa e com véu
  Object.assign(tracks[7], { decay: 70, reverb: 45, color: 100 });
  Object.assign(tracks[8], { decay: 75, reverb: 25, sweep: 30, contour: 60 }); // baixo: massa lenta

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const stage = $("stage");
  const paint = $("paint");
  const live = $("live");
  const pctx = paint.getContext("2d");
  const lctx = live.getContext("2d");
  let W = 0, H = 0, DPR = 1;

  // ---------- paletas ----------
  const PALETTES = {
    espectro: {
      bg: "#07070a", dark: true,
      color(t, tr, sat) { return { h: (t * 285) % 360, s: 55 + sat * 40, l: 55 }; },
    },
    neon: {
      bg: "#050510", dark: true,
      color(t, tr, sat) {
        const base = [330, 190, 58, 140, 275, 20][tr.machine];
        return { h: base + (t - 0.5) * 50, s: 80 + sat * 20, l: 52 + t * 16 };
      },
    },
    boogie: {
      bg: "#1b0f0b", dark: true,
      color(t, tr, sat) {
        const hues = [8, 28, 335, 172, 45, 285];
        return { h: hues[Math.min(5, Math.floor(t * 6))] + (tr.machine - 2.5) * 4, s: 62 + sat * 30, l: 50 + t * 12 };
      },
    },
    papel: {
      bg: "#efe9dc", dark: false,
      color(t, tr, sat) {
        const ink = [[0, 0, 12], [8, 68, 42], [214, 52, 28], [152, 45, 30], [282, 32, 40], [40, 80, 40]][tr.machine];
        return { h: ink[0], s: ink[1] * (0.5 + sat * 0.5), l: ink[2] + t * 22 };
      },
    },
  };
  let show = false; // modo palco: tela preta, sem interface
  function pal() {
    const p = PALETTES[settings.palette] || PALETTES.espectro;
    return show && !p.dark ? PALETTES.espectro : p; // no palco o fundo é sempre preto
  }
  const hsla = (c, a, dl = 0) => `hsla(${c.h.toFixed(1)},${c.s.toFixed(1)}%,${Math.max(0, Math.min(100, c.l + dl)).toFixed(1)}%,${a.toFixed(3)})`;

  // ---------- utilidades ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const n01 = (v) => clamp(v / 127, 0, 1);
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  const noteHz = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const noteName = (n) => NOTE_NAMES[((Math.round(n) % 12) + 12) % 12] + (Math.floor(Math.round(n) / 12) - 1);
  // 30 Hz → 0, 8 kHz → 1 (escala logarítmica)
  const hzT = (hz) => clamp(Math.log(hz / 30) / Math.log(8000 / 30), 0, 1);
  const now = () => performance.now() / 1000;

  // ---------- áudio (opcional) ----------
  const audio = {
    on: false, ctx: null, an: null, td: null, fd: null,
    rms: 0, slow: 0, hz: 0, bands: [0, 0, 0], tonal: 0, lastOnset: 0,
  };

  // um só AudioContext + analisador; entram nele o microfone/linha e/ou uma música
  function ensureCtx() {
    if (!audio.ctx) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0.5;
      Object.assign(audio, { ctx, an, td: new Float32Array(an.fftSize), fd: new Float32Array(an.frequencyBinCount) });
    }
    if (audio.ctx.state === "suspended") audio.ctx.resume();
    return audio.ctx;
  }
  // destrava o áudio dentro de um toque/clique (exigência do Safari/Chrome):
  // retoma o contexto, toca um silêncio curtinho e, no iPhone, pede o modo
  // "reprodução" pra tocar mesmo com a chave de silencioso ligada
  function unlockAudio() {
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch { /* sem suporte */ }
    const ctx = ensureCtx();
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(ctx.destination); src.start(0);
    } catch { /* ok */ }
    return ctx.resume ? ctx.resume() : Promise.resolve();
  }
  function audioStatus() {
    audio.on = !!(audio.stream || (music.el && !music.el.paused));
    $("bands").hidden = !audio.on;
    if (music.analysing) setPill("st-audio", `♪ analisando ${Math.round(music.progress * 100)}%`, "warn");
    else if (music.el && !music.el.paused) setPill("st-audio", "♪ " + music.name, "on");
    else if (audio.stream) setPill("st-audio", "Áudio ligado", "on");
    else setPill("st-audio", music.name ? "♪ pausada" : "Áudio desligado", "");
    $("btn-audio").classList.toggle("on", !!audio.stream);
    $("btn-music").classList.toggle("on", !!(music.el && !music.el.paused));
    $("btn-music").textContent = !music.name ? "Música" : music.el.paused ? "▶ Música" : "❚❚ Música";
    $("btn-music-pick").hidden = !music.name;
  }

  async function toggleAudio() {
    if (audio.stream) {
      audio.stream.getTracks().forEach((t) => t.stop());
      audio.mic.disconnect();
      audio.stream = null;
      audioStatus();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ctx = ensureCtx();
      audio.mic = ctx.createMediaStreamSource(stream);
      audio.mic.connect(audio.an); // só analisa, não toca de volta (sem microfonia)
      audio.stream = stream;
      audioStatus();
      toast("Áudio ligado: ligue a saída do Cycles na entrada de linha (ou deixe o microfone ouvir).");
    } catch (err) {
      toast("Não deu pra abrir o áudio: " + (err.message || err));
    }
  }

  // ---------- música de teste (arquivo do aparelho) ----------
  const music = { el: null, src: null, url: "", name: "", timeline: null, idx: 0, lastT: 0, analysing: false, progress: 0, token: 0 };
  const VOICE_TRACK = { kick: 0, bass: 8, snare: 1, hat: 2, lead: 4, chord: 5, vocal: 6, fx: 7 };
  const VOICE_NAME = { kick: "kick", bass: "baixo", snare: "snare/clap", hat: "hi-hat", chord: "chords", lead: "lead", vocal: "vocal", fx: "efeitos" };

  // analisa a faixa inteira (em segundo plano) e troca a detecção ao vivo pela linha do tempo
  async function analyseFile(file) {
    const token = ++music.token;
    music.timeline = null;
    if (!window.CyclesAnalise) return;
    music.analysing = true; music.progress = 0; audioStatus();
    try {
      const res = await window.CyclesAnalise.analyse(await file.arrayBuffer(), (p) => {
        if (token === music.token) { music.progress = p; audioStatus(); }
      });
      if (token !== music.token) return;
      music.timeline = res.events;
      music.duration = res.duration;
      music.bpm = res.bpm;
      music.idx = 0;
      music.lastT = -1;
      const resumo = Object.keys(VOICE_NAME).filter((k) => res.count[k]).map((k) => `${VOICE_NAME[k]} ${res.count[k]}`).join(" · ");
      log(`análise de "${music.name}"${res.bpm ? ` (${Math.round(res.bpm)} BPM)` : ""}: ${resumo}`);
      if (!show) toast("Música analisada — agora cada instrumento vira um tipo de imagem.");
    } catch (e) {
      if (token === music.token) { log("análise falhou: " + (e && e.message)); toast("Não consegui analisar a música; seguindo com a detecção ao vivo."); }
    } finally {
      if (token === music.token) { music.analysing = false; audioStatus(); }
    }
  }
  // dispara os instrumentos da linha do tempo no tempo da música
  function tickMusic() {
    if (!music.timeline || !music.el || music.el.paused) return;
    const ct = music.el.currentTime;
    if (ct < music.lastT - 0.3) music.idx = 0; // deu a volta (loop) ou voltou
    const ev = music.timeline;
    while (music.idx < ev.length && ev[music.idx].t <= ct) {
      const e = ev[music.idx++];
      if (ct - e.t < 0.25) {
        spawn(VOICE_TRACK[e.v], e.note, e.vel, "musica", { kind: e.kind });
        // no drop (impacto depois de um riser) nasce uma imagem nova
        if (e.kind === "impacto" && usesArt()) newArtRef();
      }
    }
    music.lastT = ct;
  }
  function pickMusic() { unlockAudio(); $("inp-music").click(); }
  function loadMusic(file) {
    const ctx = ensureCtx();
    if (!music.el) {
      music.el = new Audio();
      music.el.loop = true;
      music.el.preload = "auto";
      music.src = ctx.createMediaElementSource(music.el);
      music.src.connect(audio.an);
      music.src.connect(ctx.destination); // e toca nas caixas
      ["play", "pause", "ended"].forEach((ev) => music.el.addEventListener(ev, audioStatus));
      music.el.addEventListener("error", () => toast("Esse arquivo não abriu aqui. Tente MP3, M4A ou WAV (arquivo baixado no aparelho, não só na nuvem)."));
    }
    if (music.url) URL.revokeObjectURL(music.url);
    music.url = URL.createObjectURL(file);
    music.name = file.name.replace(/\.[^.]+$/, "");
    music.el.src = music.url;
    analyseFile(file);
    if (demo.on) stopDemo();
    $("empty").hidden = true;
    startMusic();
    audioStatus();
  }
  // tenta tocar; se o navegador barrar, mostra um botão grande pra um toque só
  function startMusic() {
    const ctx = ensureCtx();
    ctx.resume().catch(() => {});
    music.el.play().then(() => {
      if (ctx.state !== "running") return askTap();
      $("tap-play").hidden = true;
      toast(`Tocando: ${music.name}. Espaço pausa.`);
    }).catch(askTap);
  }
  function askTap() {
    const b = $("tap-play");
    b.hidden = false;
    b.onclick = () => {
      unlockAudio().finally(() => {
        music.el.play().then(() => { b.hidden = true; audioStatus(); toast(`Tocando: ${music.name}`); })
          .catch((e) => toast("O navegador não deixou tocar: " + (e.message || e)));
      });
    };
  }
  function toggleMusic() {
    if (!music.name) return pickMusic();
    unlockAudio();
    if (music.el.paused) startMusic(); else music.el.pause();
    if (show) hint(music.el.paused ? "Música pausada" : "♪ " + music.name, 1200);
  }

  function analyseAudio() {
    if (!audio.on) return;
    const { an, td, fd } = audio;
    an.getFloatTimeDomainData(td);
    let sum = 0;
    for (let i = 0; i < td.length; i++) sum += td[i] * td[i];
    const rms = Math.sqrt(sum / td.length);
    audio.rms = rms;
    audio.slow = audio.slow * 0.97 + rms * 0.03;

    an.getFloatFrequencyData(fd);
    const binHz = audio.ctx.sampleRate / an.fftSize;
    let peak = 0, peakI = 0, total = 0;
    const b = [0, 0, 0], bp = [0, 0, 0], bpi = [1, 1, 1];
    for (let i = 1; i < fd.length; i++) {
      const hz = i * binHz;
      if (hz < 25 || hz > 12000) continue;
      const p = Math.pow(10, fd[i] / 10);
      total += p;
      if (p > peak) { peak = p; peakI = i; }
      const k = hz < 250 ? 0 : hz < 2000 ? 1 : 2;
      b[k] += p;
      if (p > bp[k]) { bp[k] = p; bpi[k] = i; }
    }
    audio.hz = peakI * binHz;
    audio.tonal = total ? peak / total : 0;
    const max = Math.max(b[0], b[1], b[2], 1e-12);
    audio.bands = b.map((v) => v / max);

    // batidas pelo áudio (quando não chega MIDI): cada faixa de frequência tem
    // seu próprio detector — grave vira KICK, médio vira SNARE/PERC/TONE, agudo vira METAL
    const t = now();
    const playing = music.el && !music.el.paused;
    if (!(settings.onset || playing) || (playing && music.timeline) || t - lastMidiNote < 3 || rms < 0.008) {
      audio.bandSlow = audio.bandSlow || [0, 0, 0];
      return;
    }
    const e = b.map(Math.sqrt);
    const slow = audio.bandSlow || (audio.bandSlow = e.slice());
    const last = audio.bandLast || (audio.bandLast = [0, 0, 0]);
    const TH = [1.35, 1.4, 1.5], REF = [0.2, 0.12, 0.09];
    const hit = [false, false, false];
    for (let i = 0; i < 3; i++) {
      const ratio = slow[i] > 0 ? e[i] / slow[i] : 0;
      if (ratio > TH[i] && t - last[i] > REF[i]) {
        hit[i] = true;
        last[i] = t;
        const vel = clamp(Math.round(35 + (ratio - 1) * 110 + rms * 160), 20, 127);
        const note = 69 + 12 * Math.log2(Math.max(20, bpi[i] * binHz) / 440);
        let tr = i === 0 ? 0 : i === 2 ? 2 : audio.tonal > 0.1 ? 4 : bpi[1] * binHz < 900 ? 3 : 1;
        spawn(tr, note, vel, "audio");
      }
      slow[i] = slow[i] * 0.94 + e[i] * 0.06;
    }
    // grave + médio juntos e com tom definido → um acorde (mancha de cor) de vez em quando
    if (hit[0] && hit[1] && audio.tonal > 0.05 && Math.random() < 0.5) {
      spawn(5, 69 + 12 * Math.log2(Math.max(40, audio.hz) / 440), 80, "audio");
    }
  }

  function drawBands() {
    if (!audio.on) return;
    const ids = ["b-low", "b-mid", "b-high"];
    ids.forEach((id, i) => {
      const el = $(id);
      el.style.setProperty("--v", Math.round(audio.bands[i] * clamp(audio.rms * 8, 0, 1) * 100) + "%");
      el.parentElement.classList.toggle("top", audio.rms > 0.005 && audio.bands[i] === 1);
    });
    $("b-hz").textContent = audio.rms > 0.005 ? Math.round(audio.hz) + " Hz" : "— Hz";
  }

  // ---------- formas ----------
  let shapes = [];
  let gridStep = [0, 0, 0, 0, 0, 0];
  let lastMidiNote = -99;

  function spawn(trIndex, note, vel, source = "midi", extra = {}) {
    const tr = tracks[trIndex];
    if (!tr) return;
    vel = clamp(Math.round(vel) || 64, 1, 127);
    const t = now();
    if (note == null) note = audio.on && audio.hz ? 69 + 12 * Math.log2(audio.hz / 440) : 60;
    if (!isFinite(note)) note = 60;
    tr.lastVel = vel;
    tr.lastNote = note;

    const effNote = note + (tr.pitch - 64) / 2.5;
    let hz = noteHz(effNote);
    if (source === "midi" && audio.on && audio.rms > 0.01 && audio.hz) hz = audio.hz; // o Cycles soando de verdade
    const ft = hzT(hz);

    const v = n01(vel);
    const lvl = n01(tr.level) * (0.55 + 0.45 * n01(tr.volume) * 1.25);
    const audioK = audio.on ? clamp(0.75 + audio.rms * 4, 0.75, 1.6) : 1;
    let r = (0.018 + 0.15 * Math.pow(v, 1.4)) * (0.35 + 0.65 * lvl) * audioK;
    if (trIndex === 0 || tr.machine === 0) r *= 1.15;

    const { x, y, cell } = place(trIndex, tr, ft);
    if (cell) r = Math.min(r, cell);

    shapes.push({
      tr: trIndex, m: tr.machine, x, y, r, hz, ft, vel, source,
      born: t, life: 0.18 + Math.pow(n01(tr.decay), 1.6) * 3.6,
      alpha: 0.35 + 0.65 * v,
      rot: Math.random() * Math.PI * 2,
      spin: (n01(tr.sweep) - 0.2) * 3 * (Math.random() < 0.5 ? -1 : 1),
      sat: n01(tr.color), shape: n01(tr.shape), contour: n01(tr.contour),
      delay: n01(tr.delay), reverb: n01(tr.reverb),
      color: pal().color(ft, tr, n01(tr.color)),
      ou: 0, ov: 0,
      seed: (Math.random() * 1e9) | 0,
      kind: extra.kind,
      stamped: false,
    });
    const sh = shapes[shapes.length - 1];
    if (refs.cur) {
      const j = fid().jitter;
      sh.ou = (Math.random() - 0.5) * j; sh.ov = (Math.random() - 0.5) * j;
      sh.color = refBaseColor(x, y, sh.ou, sh.ov, sh.color);
    }
    if (sh.m === 0) lineGo(punch.k, [[0.4 + 0.6 * n01(vel), 12], [0, 220]]); // soco do kick
    if (settings.style === "patch") patchHit(sh, tr);
    else if (settings.style === "datamosh") moshHit(sh, tr);
    if (settings.style !== "geometrico") {
      if (settings.style === "abstrato") abstractBurst(sh, tr);
      // delay send: o som "volta" em ecos mais fracos, em outro lugar da tela
      if (source !== "eco" && tr.delay > 10 && vel > 25) {
        const gap = clock.bpm ? (60 / clock.bpm) * 0.75 : 0.28;
        const n = 1 + Math.round(n01(tr.delay) * 2);
        for (let i = 1; i <= n; i++) echoQueue.push({ at: t + gap * i, tr: trIndex, note, vel: Math.round(vel * Math.pow(0.55, i)) });
      }
    }
    if (shapes.length > 600) shapes.splice(0, shapes.length - 600);
    flashPad(trIndex, vel);
    $("empty").hidden = true;
  }

  // posição normalizada (0..1) conforme a composição escolhida
  function place(i, tr, ft) {
    const aspect = W / H || 1;
    const NT = music.timeline ? 9 : 6;
    switch (settings.layout) {
      case "faixas":
        return { x: (i + 0.5) / NT + gauss() * 0.03, y: 0.92 - ft * 0.84 + gauss() * 0.06 };
      case "radial": {
        const ang = (i / NT) * Math.PI * 2 - Math.PI / 2 + gauss() * 0.3;
        const rad = 0.05 + ft * 0.4 + gauss() * 0.03;
        const sx = aspect > 1 ? 1 / aspect : 1, sy = aspect > 1 ? 1 : aspect;
        return { x: 0.5 + Math.cos(ang) * rad * sx, y: 0.5 + Math.sin(ang) * rad * sy };
      }
      case "grade": {
        const col = (clock.running ? clock.step : gridStep[i]++) % 16;
        const cellPx = Math.min(W / 16, H / NT) * 0.48;
        return { x: (col + 0.5) / 16, y: (i + 0.5) / NT, cell: cellPx / Math.min(W, H) };
      }
      default: // livre: pan define o x, a frequência define a altura
        return {
          x: clamp(0.5 + ((tr.pan - 64) / 64) * 0.3 + gauss() * 0.3, 0.04, 0.96),
          y: clamp(0.92 - ft * 0.84 + gauss() * 0.1, 0.05, 0.95),
        };
    }
  }

  function drawShape(ctx, s, k, opts = {}) {
    const md = Math.min(W, H);
    const age = now() - s.born;
    const grow = 0.82 + 0.18 * Math.min(1, age / 0.06);
    const R = s.r * md * grow * (opts.scale || 1);
    const x = s.x * W, y = s.y * H;
    const a = s.alpha * k * (opts.alpha || 1);
    if (a <= 0.002 || R < 0.5) return;
    const rot = s.rot + s.spin * age;
    const c = s.color;
    const rand = rng(s.seed);

    ctx.save();
    // reverb = halo de luz atrás da forma (degradê; a sombra borrada do canvas é lentíssima)
    if (pal().dark && s.reverb > 0.05 && !opts.echo) {
      const hr = R * (1.3 + s.reverb);
      const g = ctx.createRadialGradient(x, y, R * 0.3, x, y, hr);
      g.addColorStop(0, hsla(c, a * 0.35 * s.reverb, 10));
      g.addColorStop(1, hsla(c, 0, 10));
      ctx.fillStyle = g;
      ctx.fillRect(x - hr, y - hr, hr * 2, hr * 2);
    }
    ctx.translate(x, y);

    const fill = hsla(c, a);
    const strokeW = Math.max(1, R * 0.08);

    switch (s.m) {
      case 0: { // KICK: disco cheio + anéis que se abrem
        ctx.fillStyle = fill;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
        const rings = Math.round(s.contour * 4);
        ctx.lineWidth = strokeW * 0.6;
        for (let i = 1; i <= rings; i++) {
          ctx.strokeStyle = hsla(c, a * (1 - i / (rings + 1)) * 0.8, 12);
          ctx.beginPath(); ctx.arc(0, 0, R * (1 + i * 0.22 + (1 - k) * 0.35 * i), 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 1: { // SNARE: quadrado girado + grãos de ruído
        ctx.rotate(rot);
        ctx.fillStyle = fill;
        const q = R * 1.6;
        ctx.fillRect(-q / 2, -q / 2, q, q);
        const dots = 8 + Math.round(s.sat * 40);
        ctx.fillStyle = hsla(c, a * 0.9, pal().dark ? 25 : -20);
        for (let i = 0; i < dots; i++) {
          const dx = (rand() - 0.5) * q * 1.9, dy = (rand() - 0.5) * q * 1.9;
          const dr = R * (0.025 + rand() * 0.05);
          ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 2: { // METAL: estrela com pontas
        ctx.rotate(rot);
        const n = 5 + Math.round(s.shape * 9);
        const inner = 0.18 + s.sat * 0.5;
        ctx.beginPath();
        for (let i = 0; i < n * 2; i++) {
          const rr = i % 2 ? R * inner : R * 1.15;
          const ang = (i / (n * 2)) * Math.PI * 2;
          ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
        break;
      }
      case 3: { // PERC: polígono de 3 a 6 lados
        ctx.rotate(rot);
        const n = 3 + Math.round(s.shape * 3);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
          ctx.lineTo(Math.cos(ang) * R * 1.1, Math.sin(ang) * R * 1.1);
        }
        ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
        ctx.lineWidth = strokeW; ctx.strokeStyle = hsla(c, a, 18); ctx.stroke();
        break;
      }
      case 4: { // TONE: anel ondulado (onda senoidal em volta)
        ctx.rotate(rot * 0.3);
        const waves = 2 + Math.round(s.sat * 10);
        const amp = 0.06 + s.shape * 0.18;
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const ang = (i / 120) * Math.PI * 2;
          const rr = R * (1 + amp * Math.sin(ang * waves + age * 4));
          ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = hsla(c, a * 0.28); ctx.fill();
        ctx.lineWidth = Math.max(1.5, R * 0.12); ctx.strokeStyle = fill; ctx.stroke();
        break;
      }
      default: { // CHORD: três formas sobrepostas (as "notas" do acorde)
        ctx.rotate(rot * 0.5);
        const sides = 3 + Math.round(s.shape * 5);
        for (let j = 0; j < 3; j++) {
          const ang0 = (j / 3) * Math.PI * 2;
          const ox = Math.cos(ang0) * R * 0.42, oy = Math.sin(ang0) * R * 0.42;
          const cj = { h: c.h + j * 32, s: c.s, l: c.l };
          ctx.beginPath();
          for (let i = 0; i < sides; i++) {
            const ang = (i / sides) * Math.PI * 2 + j;
            ctx.lineTo(ox + Math.cos(ang) * R * 0.7, oy + Math.sin(ang) * R * 0.7);
          }
          ctx.closePath();
          ctx.fillStyle = hsla(cj, a * 0.7); ctx.fill();
        }
      }
    }
    ctx.restore();

    // DELAY: ecos menores deslocados
    if (!opts.echo && s.delay > 0.08) {
      const echoes = 1 + Math.round(s.delay * 2);
      for (let e = 1; e <= echoes; e++) {
        const ghost = { ...s, x: s.x + 0.035 * e, rot: s.rot + 0.3 * e };
        drawShape(ctx, ghost, k, { echo: true, scale: Math.pow(0.7, e), alpha: Math.pow(0.45, e) });
      }
    }
  }

  function drawAura(ctx, s, k) {
    const md = Math.min(W, H);
    const R = s.r * md * 1.45 + 6 * DPR;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = pal().dark ? `rgba(255,255,255,${0.55 * k + 0.2})` : `rgba(0,0,0,${0.5 * k + 0.2})`;
    ctx.lineWidth = 1.5 * DPR;
    ctx.setLineDash([5 * DPR, 5 * DPR]);
    ctx.lineDashOffset = -now() * 30 * DPR;
    ctx.beginPath(); ctx.arc(s.x * W, s.y * H, R, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ---------- banco de referências ----------
  // Pinturas (Van Gogh, Ismael Nery, acervo de fotos, e imagens que você
  // adiciona) viram "tinta": as pinceladas pegam a cor da obra no ponto da tela
  // por onde passam e seguem os contornos dela. A fidelidade decide o quanto a
  // obra aparece — na baixa, cada som pega um fragmento solto de outro lugar.
  const FID = {
    baixa: { mix: 0.55, jitter: 1, edge: 0.25 },
    media: { mix: 0.75, jitter: 0.18, edge: 0.45 },
    alta: { mix: 0.92, jitter: 0, edge: 0.7 },
  };
  const refs = { manifest: null, sets: {}, list: [], idx: 0, cur: null, loading: new Map() };

  async function loadManifest() {
    try {
      const r = await fetch("refs/refs.json", { cache: "no-cache" });
      refs.manifest = await r.json();
    } catch { refs.manifest = { sets: [] }; }
    refs.manifest.sets.push({ id: "minhas", name: "Minhas imagens", items: await userRefs() });
    renderRefOptions();
    await chooseRefSet(settings.ref, true);
  }

  function setItems(id) {
    const sets = refs.manifest ? refs.manifest.sets : [];
    if (id === "tudo") return sets.flatMap((s) => s.items.map((it) => ({ ...it, set: s.name })));
    const s = sets.find((x) => x.id === id);
    return s ? s.items.map((it) => ({ ...it, set: s.name })) : [];
  }

  async function chooseRefSet(id, quiet) {
    settings.ref = id; save();
    refs.list = id === "nenhuma" ? [] : shuffle(setItems(id));
    refs.idx = 0;
    refs.cur = null;
    if (refs.list.length) await showRef(0, quiet);
    renderRefGrid();
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // carrega a obra numa tela pequena e guarda os pixels pra consultar a cor
  function loadRef(item) {
    if (refs.loading.has(item.src)) return refs.loading.get(item.src);
    const p = new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const k = 220 / Math.max(img.width, img.height);
        const w = Math.max(2, Math.round(img.width * k)), h = Math.max(2, Math.round(img.height * k));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img, 0, 0, w, h);
        const data = x.getImageData(0, 0, w, h).data;
        // versão "acesa" pra projetar no preto: óleo escuro e terroso some na projeção,
        // então sobe saturação e luz guardando a relação entre as cores
        const lit = new Uint8ClampedArray(data.length);
        for (let i = 0; i < data.length; i += 4) {
          const c = rgbToHsl([data[i], data[i + 1], data[i + 2]]);
          c.s = Math.min(100, c.s * 1.5 + 12);
          c.l = clamp(c.l * 0.75 + 30, 30, 82);
          const o = hslToRgb(c);
          lit[i] = o[0]; lit[i + 1] = o[1]; lit[i + 2] = o[2]; lit[i + 3] = 255;
        }
        // versões pequenas pra desenhar (o datamosh usa os pixels grandes de propósito)
        const litC = document.createElement("canvas");
        litC.width = w; litC.height = h;
        litC.getContext("2d").putImageData(new ImageData(lit, w, h), 0, 0);
        res({ ...item, w, h, data, lit, small: c, smallLit: litC });
      };
      img.onerror = () => res(null);
      img.src = item.src;
    });
    refs.loading.set(item.src, p);
    return p;
  }

  async function showRef(i, quiet) {
    if (!refs.list.length) return;
    refs.idx = ((i % refs.list.length) + refs.list.length) % refs.list.length;
    const item = refs.list[refs.idx];
    const r = await loadRef(item);
    if (r && refs.list[refs.idx] === item) refs.cur = r;
    loadRef(refs.list[(refs.idx + 1) % refs.list.length]); // já deixa a próxima pronta
    if (!quiet) hintOrToast(`${item.title}${item.artist ? " — " + item.artist : ""}`);
    markRefGrid();
  }
  const nextRef = (quiet = true) => advanceRef(quiet);
  function hintOrToast(msg) { show ? hint(msg, 2200) : toast(msg); }

  // cor da obra num ponto da tela (0..1), com recorte tipo "cover"
  function refPixel(nx, ny) {
    const r = refs.cur;
    if (!r) return null;
    const A = W / H, B = r.w / r.h;
    let u = nx, v = ny;
    if (A > B) v = 0.5 + (ny - 0.5) * (B / A);
    else u = 0.5 + (nx - 0.5) * (A / B);
    u = u - Math.floor(u); v = v - Math.floor(v); // fragmentos dão a volta
    const px = Math.min(r.w - 1, (u * r.w) | 0), py = Math.min(r.h - 1, (v * r.h) | 0);
    return { r, px, py, i: (py * r.w + px) * 4 };
  }
  function refRGB(nx, ny) {
    const p = refPixel(nx, ny);
    if (!p) return null;
    const d = pal().dark ? p.r.lit : p.r.data;
    return [d[p.i], d[p.i + 1], d[p.i + 2]];
  }
  // direção do contorno da obra naquele ponto (perpendicular ao gradiente de luz)
  function refEdge(nx, ny) {
    const p = refPixel(nx, ny);
    if (!p) return null;
    const { r, px, py } = p, d = r.data;
    const L = (x, y) => {
      x = clamp(x, 0, r.w - 1); y = clamp(y, 0, r.h - 1);
      const j = (y * r.w + x) * 4;
      return d[j] * 0.3 + d[j + 1] * 0.59 + d[j + 2] * 0.11;
    };
    const gx = L(px + 1, py) - L(px - 1, py), gy = L(px, py + 1) - L(px, py - 1);
    const mag = Math.hypot(gx, gy);
    return mag < 6 ? null : { ang: Math.atan2(gy, gx) + Math.PI / 2, mag: Math.min(1, mag / 80) };
  }

  function hslToRgb({ h, s, l }) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    const f = (n) => {
      const k = (n + h * 12) % 12;
      return 255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    };
    return [f(0), f(8), f(4)];
  }
  function rgbToHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
  }
  function mixRGB(a, b, m) { return [a[0] * m + b[0] * (1 - m), a[1] * m + b[1] * (1 - m), a[2] * m + b[2] * (1 - m)]; }
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
  const fid = () => FID[settings.refFid] || FID.media;

  // cor de partida de um som: a obra naquele ponto, misturada com a cor do som
  function refBaseColor(x, y, ou, ov, soundColor) {
    const p = refRGB(x + ou, y + ov);
    if (!p) return soundColor;
    const c = rgbToHsl(mixRGB(p, hslToRgb(soundColor), fid().mix));
    if (pal().dark) c.l = Math.max(c.l, 38); // no fundo preto, nada some de tão escuro
    return c;
  }

  // ---- imagens suas (ficam só neste aparelho, no IndexedDB) ----
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("cycles-visual-refs", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("img", { keyPath: "id" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function userRefs() {
    try {
      const db = await idb();
      const all = await new Promise((res) => {
        const q = db.transaction("img").objectStore("img").getAll();
        q.onsuccess = () => res(q.result || []);
        q.onerror = () => res([]);
      });
      return all.map((x) => ({ id: x.id, src: URL.createObjectURL(x.blob), title: x.name, artist: "Minhas imagens" }));
    } catch { return []; }
  }
  async function addUserImages(files) {
    try {
      const db = await idb();
      for (const f of files) {
        const id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
        await new Promise((res, rej) => {
          const tx = db.transaction("img", "readwrite");
          tx.objectStore("img").put({ id, name: f.name.replace(/\.[^.]+$/, ""), blob: f });
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
      }
      const mine = refs.manifest.sets.find((s) => s.id === "minhas");
      mine.items = await userRefs();
      toast(`${files.length} imagem(ns) adicionada(s) em "Minhas imagens".`);
      await chooseRefSet(settings.ref === "nenhuma" ? "minhas" : settings.ref, true);
      $("sel-ref").value = settings.ref;
    } catch (e) { toast("Não deu pra guardar as imagens: " + (e.message || e)); }
  }

  function renderRefOptions() {
    const sel = $("sel-ref");
    const sets = refs.manifest.sets.filter((s) => s.items.length || s.id === "minhas");
    sel.innerHTML = `<option value="nenhuma">Sem referência</option>` +
      sets.map((s) => `<option value="${esc(s.id)}">${esc(s.name)} (${s.items.length})</option>`).join("") +
      `<option value="tudo">Tudo misturado</option>`;
    if (![...sel.options].some((o) => o.value === settings.ref)) settings.ref = "tudo";
    sel.value = settings.ref;
  }
  function renderRefGrid() {
    const g = $("ref-grid");
    if (!g) return;
    g.innerHTML = refs.list.length
      ? refs.list.map((it, i) => `<button type="button" data-i="${i}" title="${esc(it.title)}${it.artist ? " — " + esc(it.artist) : ""}"><img loading="lazy" src="${esc(it.src)}" alt="${esc(it.title)}" /></button>`).join("")
      : `<p class="muted">Sem referência: as cores vêm só do som.</p>`;
    g.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => showRef(+b.dataset.i)));
    markRefGrid();
  }
  function markRefGrid() {
    const g = $("ref-grid");
    if (!g) return;
    [...g.children].forEach((b, i) => b.classList && b.classList.toggle("on", i === refs.idx));
    const it = refs.list[refs.idx];
    $("ref-now").textContent = it ? `Agora: ${it.title}${it.artist ? " — " + it.artist : ""}` : "";
  }

  // ---------- arte aleatória ao vivo ----------
  // Porte do gerador em Python (tools/random-art.py): uma árvore aleatória de
  // x, y, cor, sin, cos, +, −, × e ÷ (com piso no divisor). A árvore vira código
  // JS (uma expressão por canal de cor), avaliado pixel a pixel.
  function randomArtCanvas(seed, size = 160) {
    for (let tries = 0; tries < 40; tries++) {
      const R = rng(seed + tries * 7919);
      let nodes = 0;
      const build = (depth) => {
        if (++nodes > 500) throw 0; // árvore grande demais: tenta outra
        const opts = [];
        if (depth >= 2) opts.push("c", "x", "y");
        if (depth < 10) opts.push("sin", "cos", "add", "sub", "mul", "div");
        const f = opts[(R() * opts.length) | 0];
        if (f === "c") { const c = [R(), R(), R()]; return (ch) => c[ch].toFixed(4); }
        if (f === "x" || f === "y") return () => f;
        if (f === "sin" || f === "cos") { const a = build(depth + 1); return (ch) => `Math.${f}(${a(ch)})`; }
        const a = build(depth + 1), b = build(depth + 1);
        if (f === "div") return (ch) => `(${a(ch)})/Math.max(${b(ch)},0.001)`;
        const op = { add: "+", sub: "-", mul: "*" }[f];
        return (ch) => `(${a(ch)}${op}${b(ch)})`;
      };
      let tree;
      try { tree = build(0); } catch { continue; }
      // eslint-disable-next-line no-new-func
      const fn = [0, 1, 2].map((ch) => new Function("x", "y", "return " + tree(ch)));
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const x2 = c.getContext("2d");
      const img = x2.createImageData(size, size);
      const d = img.data;
      let sum = 0, sum2 = 0, sat = 0;
      for (let py = 0; py < size; py++) {
        const y = py / (size - 1);
        for (let px = 0; px < size; px++) {
          const x = px / (size - 1), o = (py * size + px) * 4;
          let mx = 0, mn = 255;
          for (let ch = 0; ch < 3; ch++) {
            const v = fn[ch](x, y);
            const b = v > 0 ? (v < 1 ? Math.round(v * 255) : 255) : 0; // NaN e negativos viram 0, como o clip do numpy
            d[o + ch] = b; sum += b; sum2 += b * b;
            if (b > mx) mx = b; if (b < mn) mn = b;
          }
          d[o + 3] = 255;
          sat += mx - mn;
        }
      }
      const n = size * size * 3, mean = sum / n, std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
      if (std < 35 || sat / (size * size) / 255 < 0.22) continue; // chapada demais: tenta outra
      x2.putImageData(img, 0, 0);
      return c;
    }
    return null;
  }
  let artCount = 0;
  // cria uma imagem nova, põe como a próxima da fila e já usa
  async function newArtRef(quiet = true) {
    await new Promise((r) => setTimeout(r, 0));
    const c = randomArtCanvas((Math.random() * 1e9) | 0);
    if (!c) return;
    const item = { src: c.toDataURL("image/jpeg", 0.85), title: `Arte aleatória ao vivo ${++artCount}`, artist: "gerada agora" };
    if (!refs.list.length) { refs.list = [item]; refs.idx = -1; }
    else refs.list.splice(refs.idx + 1, 0, item);
    renderRefGrid();
    await showRef(refs.idx + 1, quiet);
  }
  const usesArt = () => settings.ref === "gerativas" || settings.ref === "tudo";
  // trocar de obra: no conjunto "Arte aleatória" sempre nasce uma nova; no "Tudo", de vez em quando
  function advanceRef(quiet = true) {
    if (settings.ref === "gerativas" || (settings.ref === "tudo" && Math.random() < 0.3)) return newArtRef(quiet);
    return showRef(refs.idx + 1, quiet);
  }

  // ---------- estilo abstrato ----------
  // Nada de contorno: cada som solta "agentes" (traços, grãos, fumaça, manchas)
  // que escorrem por um campo de fluxo e vão deixando rastro na tela.
  let agents = [];
  let echoQueue = [];
  const fx = { zoom: 0, glitch: 0 };

  function flowAngle(x, y, t, turb) {
    const f = 1.5 + turb * 7;
    return Math.sin(x * f + t * 0.35) * 2.4 + Math.cos(y * f * 1.3 - t * 0.27) * 2.4 + Math.sin((x - y) * f * 0.7 + t * 0.15) * 1.6;
  }

  function abstractBurst(s, tr) {
    const rand = rng(s.seed);
    const v = n01(s.vel);
    const md = Math.min(W, H);
    const X = s.x * W, Y = s.y * H, R = s.r * md * 1.7;
    const spread = 20 + s.sat * 100; // color → quanto as cores se espalham
    const life = s.life;
    const curl = (n01(tr.sweep) - 0.3) * 2.2;
    const tint = (dl = 0) => ({ h: s.color.h + (rand() - 0.5) * spread, s: s.color.s, l: clamp(s.color.l + dl + (rand() - 0.5) * 14, 5, 95) });
    const around = (k) => ({ x: X + (rand() - 0.5) * R * k, y: Y + (rand() - 0.5) * R * k });
    const push = (o) => agents.push(Object.assign({ age: 0, vx: 0, vy: 0, inertia: 0.9, curl, turb: s.shape, ou: s.ou, ov: s.ov }, o));
    const dir = (sp) => { const a = rand() * Math.PI * 2; return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp }; };

    switch (s.m) {
      case 0: { // KICK: um sopro de luz sem borda + fumaça; a tela inteira "puxa"
        push({ kind: "bloom", x: X, y: Y, r0: R * 0.2, r1: R * (2 + s.contour * 2.5), life: life * 0.7 + 0.35, a: 0.16 + 0.3 * v, c: tint(), drift: 0.02 });
        const n = 8 + Math.round(v * 26);
        for (let i = 0; i < n; i++) push({ kind: "line", ...around(0.5), ...dir(0.04 + rand() * 0.1), speed: 0.06 + rand() * 0.1, inertia: 0.9,
          w: 2 + rand() * 6 * (0.4 + s.contour), life: 0.8 + life * (0.6 + rand()), a: 0.05 + 0.1 * v, c: tint(-5) });
        fx.zoom = Math.min(0.05, fx.zoom + 0.014 * v);
        break;
      }
      case 1: { // SNARE: estouro de grãos + rasgos (glitch) na imagem
        const n = 70 + Math.round(v * 230);
        for (let i = 0; i < n; i++) push({ kind: "dot", ...around(0.4), ...dir(0.05 + rand() * 0.3), speed: 0.12, inertia: 0.9,
          w: 0.6 + rand() * 1.8, life: 0.2 + rand() * (0.3 + life * 0.6), a: 0.3 + 0.6 * v * rand(), c: tint(10) });
        fx.glitch = Math.max(fx.glitch, (0.3 + 0.7 * v) * (0.4 + s.sat * 0.8));
        break;
      }
      case 2: { // METAL: filamentos finíssimos e rápidos
        const n = 18 + Math.round(v * 50);
        for (let i = 0; i < n; i++) push({ kind: "line", ...around(0.6), speed: 0.4 + rand() * 0.7, inertia: 0.55, turb: 0.6 + s.shape * 0.4,
          w: 0.4 + rand() * 0.9, life: 0.12 + rand() * (0.25 + life * 0.4), a: 0.35 + 0.5 * v, c: tint(18) });
        break;
      }
      case 3: { // PERC: manchas de tinta irregulares
        const n = 3 + Math.round(v * 5);
        for (let i = 0; i < n; i++) push({ kind: "bloom", ...around(0.9), r0: R * 0.05, r1: R * (0.25 + rand() * 0.6), life: 0.3 + life * 0.6, a: 0.18 + 0.25 * v, c: tint(), drift: 0.06 });
        for (let i = 0; i < 10 + v * 14; i++) push({ kind: "line", ...around(0.5), speed: 0.1 + rand() * 0.2, inertia: 0.85,
          w: 1 + rand() * 2.5, life: 0.3 + rand() * life, a: 0.12 + 0.2 * v, c: tint(-8) });
        break;
      }
      case 4: { // TONE: fitas longas que fluem e se enrolam
        const n = 3 + Math.round(v * 7);
        for (let i = 0; i < n; i++) push({ kind: "line", ...around(0.35), speed: 0.07 + rand() * 0.14, inertia: 0.96,
          curl: curl * 2.5, w: (3 + rand() * 12) * (0.5 + s.contour), life: 1 + life * 1.5, a: 0.04 + 0.08 * v, c: tint(), hueDrift: 40 * (rand() - 0.5) });
        break;
      }
      case 6: { // VOZ: fumaça larga e lenta que sobe, respirando
        push({ kind: "bloom", x: X, y: Y, r0: R * 0.3, r1: R * 2.2, life: 0.6 + life, a: 0.08 + 0.12 * v, c: tint(4), drift: 0.03 });
        const n = 4 + Math.round(v * 6);
        for (let i = 0; i < n; i++) push({ kind: "line", ...around(0.6), vx: (rand() - 0.5) * 0.02, vy: -0.05 - rand() * 0.05, speed: 0.05 + rand() * 0.06,
          inertia: 0.975, curl: curl * 0.5, w: 8 + rand() * 16, life: 1.2 + life * 1.2, a: 0.025 + 0.05 * v, c: tint(6), hueDrift: 25 * (rand() - 0.5) });
        break;
      }
      case 8: { // BAIXO: massa grave e lenta que se arrasta perto do chão da tela
        push({ kind: "bloom", x: X, y: Y, r0: R * 0.4, r1: R * (1.6 + s.contour), life: 0.4 + life * 0.7, a: 0.1 + 0.14 * v, c: tint(-4), drift: 0.015 });
        const n = 3 + Math.round(v * 5);
        for (let i = 0; i < n; i++) push({ kind: "line", ...around(0.8), vx: (rand() < 0.5 ? -1 : 1) * (0.05 + rand() * 0.06), vy: 0, speed: 0.04,
          inertia: 0.985, w: 10 + rand() * 18, life: 0.5 + life, a: 0.035 + 0.05 * v, c: tint(-6) });
        break;
      }
      case 7: { // FX: a tela inteira reage — rasgos, zoom e riscos varrendo de lado a lado
        const impact = s.kind === "impacto";
        fx.glitch = Math.max(fx.glitch, (impact ? 0.9 : 0.4) + 0.4 * v);
        fx.zoom = clamp(fx.zoom + (s.kind === "desce" ? -0.012 : 0.02) * v, -0.03, 0.06);
        const n = 14 + Math.round(v * 36);
        const dirX = rand() < 0.5 ? -1 : 1;
        for (let i = 0; i < n; i++) push({ kind: "line", x: rand() * W, y: rand() * H, vx: dirX * (0.5 + rand() * 0.6), vy: (rand() - 0.5) * 0.05,
          speed: 0.2, inertia: 0.985, w: 0.6 + rand() * 1.6, life: 0.25 + rand() * 0.6, a: 0.2 + 0.35 * v, c: tint(20) });
        if (impact) push({ kind: "bloom", x: W / 2, y: H / 2, r0: md * 0.2, r1: md * 1.2, life: 0.9, a: 0.3, c: tint(15), drift: 0 });
        break;
      }
      default: { // CHORD: lavagens de cor enormes, três tons
        for (let j = 0; j < 3; j++) {
          const c = { h: s.color.h + j * (25 + s.sat * 40), s: s.color.s, l: s.color.l };
          push({ kind: "bloom", ...around(1.4), r0: R * 0.5, r1: R * (2.5 + rand() * 1.5), life: 0.8 + life * 1.2, a: 0.2 + 0.18 * v, c, drift: 0.04 });
          for (let i = 0; i < 4; i++) push({ kind: "line", ...around(1), speed: 0.05 + rand() * 0.08, inertia: 0.97,
            w: 6 + rand() * 14, life: 1.5 + life, a: 0.06 + 0.07 * v, c: { ...c, h: c.h + (rand() - 0.5) * 20 } });
        }
      }
    }
    // reverb: um véu de luz por cima de tudo
    if (s.reverb > 0.25) push({ kind: "bloom", x: X, y: Y, r0: R, r1: R * (2 + s.reverb * 3), life: 0.5 + s.reverb * 2.5, a: 0.04 + 0.08 * s.reverb, c: tint(8), drift: 0.01 });
    if (agents.length > 2600) agents.splice(0, agents.length - 2600);
  }

  // cópia do quadro anterior: desenhar a tela nela mesma bloco a bloco faz o
  // navegador copiar a tela inteira a cada chamada (lento); copia uma vez só
  const snap = document.createElement("canvas");
  function snapshot() {
    if (snap.width !== W || snap.height !== H) { snap.width = W; snap.height = H; }
    const x = snap.getContext("2d");
    x.globalCompositeOperation = "copy";
    x.drawImage(paint, 0, 0);
    return snap;
  }
  // glitch: faixas da imagem deslocadas para os lados
  function applyGlitch() {
    if (fx.glitch > 0.05) {
      const src = snapshot();
      const bands = 1 + Math.round(fx.glitch * 5);
      for (let i = 0; i < bands; i++) {
        const h = Math.max(1, H * (0.004 + Math.random() * 0.05 * fx.glitch));
        const y = Math.random() * (H - h);
        const dx = (Math.random() - 0.5) * W * 0.12 * fx.glitch;
        pctx.drawImage(src, 0, y, W, h, dx, y, W, h);
      }
      fx.glitch *= 0.72;
    }
  }

  let lastT = 0;
  function frameAbstract(t) {
    const dt = clamp(t - (lastT || t), 0, 0.05);
    lastT = t;
    const md = Math.min(W, H);
    const mode = settings.mode;


    if (audio.on) fx.zoom = Math.max(fx.zoom, audio.rms * 0.025);

    // realimentação: a imagem anterior volta levemente ampliada e girada → a tela escorre
    if (mode !== "pintura") {
      const avgSweep = tracks.reduce((a, tr) => a + n01(tr.sweep), 0) / tracks.length;
      const z = 1 + 0.002 + fx.zoom;
      pctx.save();
      pctx.globalAlpha = mode === "vivo" ? 0.4 : 0.6;
      pctx.translate(W / 2, H / 2);
      pctx.rotate((avgSweep - 0.3) * 0.006);
      pctx.scale(z, z);
      pctx.translate(-W / 2, -H / 2);
      pctx.drawImage(paint, 0, 0);
      pctx.restore();
      fillBg(pctx, mode === "vivo" ? 0.12 : 0.03);
    } else {
      fillBg(pctx, 0.004); // pintura: apaga quase nada, só o bastante pra nunca virar uma tela branca
    }
    fx.zoom *= 0.88;

    applyGlitch();

    const persist = mode === "vivo" ? 0.16 : mode === "rastro" ? 0.06 : 0.025;
    const turbG = audio.on && audio.rms > 0.01 ? hzT(audio.hz) : 0.4;
    pctx.save();
    pctx.globalCompositeOperation = pal().dark ? "lighter" : "multiply";
    pctx.lineCap = "round";
    const keep = [];
    for (const a of agents) {
      a.age += dt;
      const k = 1 - a.age / a.life;
      if (k <= 0) continue;
      const turb = a.turb * 0.7 + turbG * 0.3;
      if (a.kind === "bloom") {
        const ang = flowAngle(a.x / W, a.y / H, t, turb);
        a.x += Math.cos(ang) * a.drift * md * dt;
        a.y += Math.sin(ang) * a.drift * md * dt;
        const p = a.age / a.life;
        const r = Math.max(1, a.r0 + (a.r1 - a.r0) * (1 - Math.pow(1 - p, 3)));
        if (!isFinite(a.x + a.y + r)) continue; // nunca deixar um número inválido travar o desenho
        // a mancha é redesenhada todo quadro: a intensidade por quadro acompanha
        // o quanto a tela apaga, senão tudo estoura pro branco
        const al = a.a * k * persist * Math.min(1, a.age * 20);
        const g = pctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r);
        g.addColorStop(0, hsla(a.c, al));
        g.addColorStop(0.45, hsla(a.c, al * 0.4));
        g.addColorStop(1, hsla(a.c, 0));
        pctx.fillStyle = g;
        pctx.fillRect(a.x - r, a.y - r, r * 2, r * 2);
      } else {
        let ang = flowAngle(a.x / W, a.y / H, t, turb) + a.curl * a.age;
        let ink = null;
        if (refs.cur) {
          // segue o contorno da obra (pincelada) e pega a tinta dela
          const nx0 = a.x / W + a.ou, ny0 = a.y / H + a.ov;
          const e = refEdge(nx0, ny0);
          if (e) {
            const w = fid().edge * e.mag;
            const d = Math.atan2(Math.sin(e.ang - ang), Math.cos(e.ang - ang));
            // contorno não tem sentido: escolhe o lado mais próximo do fluxo
            ang += (Math.abs(d) > Math.PI / 2 ? d - Math.sign(d) * Math.PI : d) * w;
          }
          const p = refRGB(nx0, ny0);
          if (p) { ink = mixRGB(p, a.rgb || (a.rgb = hslToRgb(a.c)), fid().mix); }
        }
        a.vx = a.vx * a.inertia + Math.cos(ang) * a.speed * (1 - a.inertia);
        a.vy = a.vy * a.inertia + Math.sin(ang) * a.speed * (1 - a.inertia);
        const nx = a.x + a.vx * md * dt, ny = a.y + a.vy * md * dt;
        if (!isFinite(nx + ny)) continue;
        const c = a.hueDrift ? { ...a.c, h: a.c.h + a.hueDrift * a.age } : a.c;
        const al = a.a * Math.pow(k, 0.7) * (mode === "pintura" ? 0.55 : 1) * (refs.cur ? 1.35 : 1);
        if (a.kind === "dot") {
          pctx.fillStyle = ink ? rgba(ink, al) : hsla(c, al);
          const w = a.w * DPR;
          pctx.fillRect(nx - w / 2, ny - w / 2, w, w);
        } else {
          pctx.strokeStyle = ink ? rgba(ink, al) : hsla(c, al);
          pctx.lineWidth = Math.max(0.3, a.w * DPR * Math.sqrt(k));
          pctx.beginPath(); pctx.moveTo(a.x, a.y); pctx.lineTo(nx, ny); pctx.stroke();
        }
        a.x = nx; a.y = ny;
        if (nx < -W * 0.2 || nx > W * 1.2 || ny < -H * 0.2 || ny > H * 1.2) continue;
      }
      keep.push(a);
    }
    agents = keep;
    pctx.restore();
  }

  // ---------- estilo Patch (no espírito do Pure Data + GEM) ----------
  // Formas mínimas e nítidas no preto. Como no PD, cada valor que chega não
  // "pula": vai até o alvo numa rampa linear (o objeto `line`), e pode emendar
  // várias rampas — ex.: o anel do kick abre em 30 ms e fecha no tempo do decay.
  function mkLine(v = 0) { return { a: v, b: v, t0: 0, d: 0, q: [] }; }
  function lineVal(L) {
    const t = now();
    for (;;) {
      const k = L.d > 0 ? (t - L.t0) / L.d : 1;
      if (k < 1) return L.a + (L.b - L.a) * k;
      if (!L.q.length) return L.b;
      const [to, ms] = L.q.shift();
      L.a = L.b; L.t0 += L.d; L.b = to; L.d = ms / 1000;
    }
  }
  function lineGo(L, segs) {
    L.a = lineVal(L);
    const [to, ms] = segs[0];
    L.b = to; L.t0 = now(); L.d = ms / 1000; L.q = segs.slice(1);
  }
  const patch = {
    ring: { r: mkLine(0.05), a: mkLine(0), c: { h: 280, s: 80, l: 60 } },
    lead: { y: mkLine(0.5), a: mkLine(0), c: { h: 290, s: 90, l: 60 } },
    bass: { h: mkLine(0), c: { h: 200, s: 70, l: 50 } },
    squares: [], bars: [], cubes: [], rings: [], hlines: [], rects: [],
  };
  // envelopes de impacto (todos os estilos): kick = soco de zoom; snare = clarão
  const punch = { k: mkLine(0), s: mkLine(0) };
  const PUNCH_ZOOM = { datamosh: 0.07, patch: 0.035, abstrato: 0.025, geometrico: 0.02 };
  function applyPunch() {
    const k = lineVal(punch.k);
    const z = k > 0.002 ? 1 + (PUNCH_ZOOM[settings.style] || 0.02) * k : 1;
    const tf = z === 1 ? "" : `scale(${z.toFixed(4)})`;
    if (paint.style.transform !== tf) paint.style.transform = tf;
  }
  const CUBE_V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  const CUBE_E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

  function patchHit(s, tr) {
    const v = n01(s.vel), md = Math.min(W, H), t = now();
    const life = s.life, c = s.color;
    const cap = (arr, n) => { if (arr.length > n) arr.splice(0, arr.length - n); };
    switch (s.m) {
      case 0: { // KICK: o anel central abre e fecha (line: abre em 30 ms, volta no decay)
        lineGo(patch.ring.r, [[0.1 + 0.28 * v, 30], [0.05, 120 + life * 500]]);
        lineGo(patch.ring.a, [[0.6 + 0.4 * v, 20], [0.12, 150 + life * 600]]);
        patch.ring.c = c;
        for (let i = 0; i < 4 + v * 10; i++) {
          const a = Math.random() * Math.PI * 2, sp = 0.2 + Math.random() * 0.5;
          patch.squares.push({ x: 0.5, y: 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0, size: 3 + Math.random() * 6, c, born: t, life: 0.4 + life * 0.5 });
        }
        break;
      }
      case 1: { // SNARE/CLAP: quadradinhos espirram pra cima e caem (gravidade)
        const n = 12 + Math.round(v * (20 + s.shape * 40));
        const x0 = s.x, y0 = Math.min(0.85, s.y + 0.1);
        for (let i = 0; i < n; i++) {
          const hue = [140, 280, 185][(Math.random() * 3) | 0];
          patch.squares.push({ x: x0 + (Math.random() - 0.5) * 0.08, y: y0, vx: (Math.random() - 0.5) * 0.6, vy: -(0.4 + Math.random() * 0.9) * (0.5 + v),
            g: 1.3, size: 4 + Math.random() * 12 * (0.4 + v), c: refs.cur ? c : { h: hue + (Math.random() - 0.5) * 20, s: 75, l: 60 }, born: t, life: 0.8 + life * 0.6 });
        }
        break;
      }
      case 2: // HI-HAT: barras brancas finas e altas que piscam
        for (let i = 0; i < 1 + Math.round(v * 2); i++) {
          const L = mkLine(0);
          lineGo(L, [[0.25 + 0.6 * v, 25], [0, 90 + life * 200]]);
          patch.bars.push({ x: Math.random(), w: 2 + Math.random() * 10 * v, h: L, c: { h: c.h, s: 10, l: 92 }, born: t, life: 0.15 + life * 0.25 });
        }
        break;
      case 3: { // PERC: retângulo cheio que gira e some
        const L = mkLine(0);
        lineGo(L, [[0.04 + 0.1 * v, 40], [0, 200 + life * 400]]);
        patch.rects.push({ x: s.x, y: s.y, s: L, rot: Math.random() * Math.PI, spin: (n01(tr.sweep) - 0.3) * 6, c, born: t, life: 0.3 + life * 0.5 });
        break;
      }
      case 4: // LEAD/TONE: a linha neon desliza até a altura da nota (line 150 ms)
        lineGo(patch.lead.y, [[s.y, 150]]);
        lineGo(patch.lead.a, [[0.5 + 0.5 * v, 20], [0, 250 + life * 700]]);
        patch.lead.c = c;
        patch.hlines.push({ y: s.y + (Math.random() - 0.5) * 0.04, a: 0.35 * v, th: 1 + 3 * v, c, born: t, life: 0.25 + life * 0.4 });
        break;
      case 5: { // CHORD: cubo em arame girando (rotateXYZ), tamanho pela velocity
        const L = mkLine(0);
        lineGo(L, [[0.08 + 0.14 * v, 120], [0.06, 400 + life * 800]]);
        const spin = 0.5 + n01(tr.sweep) * 2.5;
        patch.cubes.push({ x: s.x, y: s.y, s: L, rx: Math.random() * 6, ry: Math.random() * 6, rz: 0, sx: spin * (Math.random() - 0.5) * 2, sy: spin, sz: spin * 0.3,
          c, born: t, life: 1 + life * 1.5 });
        cap(patch.cubes, 8);
        break;
      }
      case 6: // VOZ: círculos concêntricos que abrem devagar
        for (let i = 0; i < 3; i++) {
          const L = mkLine(0.01 + i * 0.02);
          lineGo(L, [[0.12 + 0.18 * v + i * 0.05, 600 + life * 900]]);
          patch.rings.push({ x: s.x, y: s.y, r: L, c, born: t, life: 0.7 + life * 1.2, th: 1.5 });
        }
        break;
      case 8: // BAIXO: barra no chão que sobe e desce
        lineGo(patch.bass.h, [[0.04 + 0.12 * v, 30], [0.01, 150 + life * 500]]);
        patch.bass.c = c;
        break;
      default: { // FX: rasgos e linhas de varredura na tela toda
        fx.glitch = Math.max(fx.glitch, 0.5 + 0.5 * v);
        for (let i = 0; i < 6 + v * 14; i++) patch.hlines.push({ y: Math.random(), a: 0.25 + 0.5 * v, th: 1 + Math.random() * 3, c, born: t, life: 0.15 + Math.random() * 0.4 });
      }
    }
    cap(patch.squares, 900); cap(patch.bars, 60); cap(patch.rects, 40); cap(patch.rings, 40); cap(patch.hlines, 80);
  }

  function framePatch(t, dt) {
    const mode = settings.mode, md = Math.min(W, H), ctx = pctx;
    fillBg(ctx, mode === "vivo" ? 1 : mode === "rastro" ? 0.16 : 0.015);
    applyGlitch();
    ctx.save();
    ctx.globalCompositeOperation = pal().dark ? "lighter" : "multiply";
    const alive = (o) => t - o.born < o.life;
    // no rastro/pintura tudo é redesenhado por cima do quadro anterior: formas grandes
    // somariam luz até estourar, então entram mais fracas (as pequenas deixam rastro)
    const big = mode === "vivo" ? 1 : mode === "rastro" ? 0.22 : 0.05;
    const small = mode === "vivo" ? 1 : mode === "rastro" ? 0.6 : 0.3;
    const fade = (o) => clamp(1 - (t - o.born) / o.life, 0, 1);

    // anel do kick (sempre lá, respirando com o line)
    const rr = lineVal(patch.ring.r) * md, ra = lineVal(patch.ring.a) * big;
    if (ra > 0.01) {
      ctx.lineWidth = 2.5 * DPR;
      ctx.strokeStyle = hsla(patch.ring.c, ra * 0.3, 10);
      ctx.beginPath(); ctx.arc(W / 2, H / 2, rr + 4 * DPR, 0, Math.PI * 2); ctx.lineWidth = 9 * DPR; ctx.stroke();
      ctx.strokeStyle = hsla(patch.ring.c, ra, 15);
      ctx.lineWidth = 2.5 * DPR;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, rr, 0, Math.PI * 2); ctx.stroke();
    }
    // linha do lead
    const la = lineVal(patch.lead.a) * big;
    if (la > 0.01) {
      const y = lineVal(patch.lead.y) * H;
      ctx.fillStyle = hsla(patch.lead.c, la * 0.25, 10); ctx.fillRect(0, y - 5 * DPR, W, 10 * DPR);
      ctx.fillStyle = hsla(patch.lead.c, la, 20); ctx.fillRect(0, y - 1.5 * DPR, W, 3 * DPR);
    }
    // barra do baixo
    const bh = lineVal(patch.bass.h) * H;
    if (bh > 1) { ctx.fillStyle = hsla(patch.bass.c, 0.55 * big); ctx.fillRect(0, H - bh, W, bh); }

    patch.hlines = patch.hlines.filter(alive);
    for (const o of patch.hlines) { ctx.fillStyle = hsla(o.c, o.a * fade(o) * big, 15); ctx.fillRect(0, o.y * H, W, o.th * DPR); }
    patch.bars = patch.bars.filter(alive);
    for (const o of patch.bars) {
      const h = lineVal(o.h) * H;
      ctx.fillStyle = hsla(o.c, 0.9 * fade(o) * big);
      ctx.fillRect(o.x * W - (o.w * DPR) / 2, H / 2 - h / 2, o.w * DPR, h);
    }
    patch.rects = patch.rects.filter(alive);
    for (const o of patch.rects) {
      const sz = lineVal(o.s) * md;
      ctx.save(); ctx.translate(o.x * W, o.y * H); ctx.rotate(o.rot + o.spin * (t - o.born));
      ctx.fillStyle = hsla(o.c, 0.8 * fade(o) * big); ctx.fillRect(-sz / 2, -sz / 2, sz, sz); ctx.restore();
    }
    patch.rings = patch.rings.filter(alive);
    ctx.lineWidth = 1.5 * DPR;
    for (const o of patch.rings) {
      ctx.strokeStyle = hsla(o.c, 0.8 * fade(o) * small, 10);
      ctx.beginPath(); ctx.arc(o.x * W, o.y * H, lineVal(o.r) * md, 0, Math.PI * 2); ctx.stroke();
    }
    // cubos em arame (rotação 3D + perspectiva)
    patch.cubes = patch.cubes.filter(alive);
    for (const o of patch.cubes) {
      o.rx += o.sx * dt; o.ry += o.sy * dt; o.rz += o.sz * dt;
      const size = lineVal(o.s) * md, cx = o.x * W, cy = o.y * H;
      const [sx, cxr, sy, cyr, sz, czr] = [Math.sin(o.rx), Math.cos(o.rx), Math.sin(o.ry), Math.cos(o.ry), Math.sin(o.rz), Math.cos(o.rz)];
      const P = CUBE_V.map(([x, y, z]) => {
        let y1 = y * cxr - z * sx, z1 = y * sx + z * cxr;          // X
        let x2 = x * cyr + z1 * sy, z2 = -x * sy + z1 * cyr;       // Y
        let x3 = x2 * czr - y1 * sz, y3 = x2 * sz + y1 * czr;      // Z
        const p = 4 / (4 + z2);
        return [cx + x3 * size * p, cy + y3 * size * p];
      });
      ctx.strokeStyle = hsla(o.c, 0.9 * fade(o) * small, 20);
      ctx.lineWidth = 1.4 * DPR;
      ctx.beginPath();
      for (const [a, b] of CUBE_E) { ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); }
      ctx.stroke();
    }
    // quadradinhos com gravidade
    patch.squares = patch.squares.filter(alive);
    for (const o of patch.squares) {
      o.vy += o.g * dt; o.x += o.vx * dt * (H / W); o.y += o.vy * dt;
      const sz = o.size * DPR;
      ctx.fillStyle = hsla(o.c, 0.9 * fade(o) * small, 5);
      ctx.fillRect(o.x * W - sz / 2, o.y * H - sz / 2, sz, sz);
    }
    ctx.restore();
  }

  // ---------- estilo Datamosh ----------
  // Uma obra do banco vira o "quadro-chave" e se move em blocos guiados pelo som.
  // O que dá impacto é o CONTRASTE: entre as batidas a obra fica parada, nítida
  // e um pouco escura; cada batida é um gesto curto e claro que logo se recompõe.
  //   kick  → a tela acende, dá um soco de zoom e os blocos explodem pra fora
  //   snare → clarão + blocos grandes com a cor invertida
  //   baixo → derrete só o terço de baixo · lead → arrasta uma faixa na altura da nota
  //   voz   → gira o miolo · chord → a obra "sangra" de volta · drop → obra nova entra no meio do movimento
  //   hi-hat quase não mexe (é o que mais toca; mexendo sempre, vira bagunça)
  const mosh = { cols: 16, rows: 9, vx: null, vy: null, base: null, lastHat: 0, lastKick: -99 };
  function moshInit() {
    const n = mosh.cols * mosh.rows;
    if (!mosh.vx || mosh.vx.length !== n) { mosh.vx = new Float32Array(n); mosh.vy = new Float32Array(n); }
  }
  function moshKeyframe(alpha) {
    const r = refs.cur;
    if (!r || !r.small) return false;
    const A = W / H, B = r.w / r.h;
    let dw = W, dh = H;
    if (A > B) dh = W / B; else dw = H * B;
    pctx.save();
    pctx.globalCompositeOperation = "source-over";
    pctx.globalAlpha = alpha;
    pctx.imageSmoothingEnabled = false; // pixels grandes, cara de compressão
    pctx.drawImage(pal().dark ? r.smallLit : r.small, (W - dw) / 2, (H - dh) / 2, dw, dh);
    pctx.restore();
    return true;
  }
  // soma um campo de movimento; `where` limita a região (devolve 0..1 de peso)
  function moshField(fn, where = () => 1) {
    moshInit();
    for (let r = 0; r < mosh.rows; r++) for (let c = 0; c < mosh.cols; c++) {
      const x = (c + 0.5) / mosh.cols, y = (r + 0.5) / mosh.rows, w = where(x, y);
      if (w <= 0) continue;
      const k = r * mosh.cols + c, [vx, vy] = fn(x, y);
      mosh.vx[k] += vx * w; mosh.vy[k] += vy * w;
    }
  }
  function invertBlocks(n, color) {
    const bw = W / mosh.cols, bh = H / mosh.rows;
    pctx.save();
    pctx.globalCompositeOperation = "difference";
    pctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const cw = 2 + ((Math.random() * 5) | 0), ch = 1 + ((Math.random() * 2) | 0);
      const c0 = (Math.random() * (mosh.cols - cw + 1)) | 0, r0 = (Math.random() * (mosh.rows - ch + 1)) | 0;
      pctx.fillRect(c0 * bw, r0 * bh, cw * bw, ch * bh);
    }
    pctx.restore();
  }
  function moshHit(s, tr) {
    const v = n01(s.vel), U = Math.min(W, H) / 100; // U = 1% da tela
    switch (s.m) {
      case 0: { // KICK: explosão radial forte e curta
        const sp = (2.5 + 6 * v) * U;
        moshField((x, y) => { const dx = x - 0.5, dy = (y - 0.5) * (H / W), d = Math.hypot(dx, dy) + 0.04; return [(dx / d) * sp, (dy / d) * sp]; });
        mosh.lastKick = now();
        break;
      }
      case 1: // SNARE/CLAP: clarão + blocos invertidos grandes
        invertBlocks(2 + Math.round(v * 4), "#fff");
        lineGo(punch.s, [[0.35 + 0.4 * v, 10], [0, 160]]);
        break;
      case 2: // HI-HAT: só os fortes, no máximo 4 por segundo, e pouquinho
        if (v > 0.7 && now() - mosh.lastHat > 0.25) {
          mosh.lastHat = now();
          moshInit();
          const k = (Math.random() * mosh.vx.length) | 0;
          mosh.vx[k] += (Math.random() - 0.5) * 3 * U;
        }
        break;
      case 8: { // BAIXO: derrete o terço de baixo
        const sp = (1 + 3 * v) * U;
        moshField(() => [0, sp * (0.6 + Math.random() * 0.8)], (x, y) => (y > 0.62 ? (y - 0.62) / 0.38 + 0.3 : 0));
        break;
      }
      case 4: { // LEAD: arrasta uma faixa na altura da nota
        const yy = s.y, dir = Math.random() < 0.5 ? -1 : 1, sp = (2 + 4 * v) * U;
        moshField(() => [dir * sp, 0], (x, y) => Math.max(0, 1 - Math.abs(y - yy) / 0.12));
        break;
      }
      case 6: { // VOZ: gira o miolo
        const sp = (2 + 3 * v) * U;
        moshField((x, y) => [-(y - 0.5) * sp * 4, (x - 0.5) * sp * 4], (x, y) => Math.max(0, 1 - Math.hypot(x - 0.5, (y - 0.5) * (H / W)) / 0.3));
        break;
      }
      case 5: moshKeyframe(0.25 + 0.2 * v); break; // CHORD: a obra sangra de volta
      case 7: // EFEITOS: no drop, tudo explode e uma obra nova entra no meio do movimento
        if (s.kind === "impacto") {
          moshField((x, y) => { const dx = x - 0.5, dy = y - 0.5, d = Math.hypot(dx, dy) + 0.04; return [(dx / d) * 9 * U, (dy / d) * 9 * U]; });
          lineGo(punch.s, [[0.9, 10], [0, 400]]);
          if (!usesArt()) nextRef();
        } else {
          fx.glitch = Math.max(fx.glitch, 0.3 + 0.4 * v);
        }
        break;
      default: break; // PERC e outros: nada (menos é mais)
    }
  }
  function frameMosh(t, dt) {
    moshInit();
    // obra nova: entra misturada, carregando o movimento que já existia (o "mosh")
    if (refs.cur && refs.cur !== mosh.base) {
      moshKeyframe(mosh.base && mosh.base !== "esperando" ? 0.6 : 1);
      mosh.base = refs.cur;
    }
    if (!refs.cur && !mosh.base) { fillBg(pctx, 1); newArtRef(); mosh.base = "esperando"; }
    const mode = settings.mode;
    // cura: a obra volta rápido no ao vivo (é o que faz a próxima batida aparecer); na pintura nunca
    const heal = (mode === "vivo" ? 0.07 : mode === "rastro" ? 0.02 : 0) * dt * 60;
    if (heal && mosh.base && mosh.base !== "esperando") moshKeyframe(Math.min(1, heal));
    const bw = W / mosh.cols, bh = H / mosh.rows;
    const src = snapshot();
    // movimento curto: some em ~0,2 s no ao vivo
    const decay = Math.pow(mode === "vivo" ? 0.8 : mode === "rastro" ? 0.88 : 0.93, dt * 60);
    for (let r = 0; r < mosh.rows; r++) for (let c = 0; c < mosh.cols; c++) {
      const k = r * mosh.cols + c;
      const vx = mosh.vx[k], vy = mosh.vy[k];
      if (Math.abs(vx) + Math.abs(vy) > 0.3) {
        const x = c * bw, y = r * bh;
        // puxa o bloco de onde ele "vem" (sem sair da tela: o Safari não desenha fora)
        const sx = clamp(x - vx, 0, W - bw), sy = clamp(y - vy, 0, H - bh);
        pctx.drawImage(src, sx, sy, bw, bh, x, y, bw, bh);
      }
      mosh.vx[k] = vx * decay; mosh.vy[k] = vy * decay;
    }
    applyGlitch();
    // respiração: em repouso a obra fica mais escura; o kick acende (só se a música tem kick)
    if (mode !== "pintura") {
      const k = lineVal(punch.k), hasKick = t - mosh.lastKick < 3;
      const dim = (hasKick ? 0.42 : 0.12) * (1 - k);
      if (dim > 0.01) { lctx.fillStyle = `rgba(0,0,0,${dim.toFixed(3)})`; lctx.fillRect(0, 0, W, H); }
    }
    const sF = lineVal(punch.s);
    if (sF > 0.01) { lctx.fillStyle = `rgba(255,255,255,${(sF * 0.5).toFixed(3)})`; lctx.fillRect(0, 0, W, H); }
  }

  // ---------- renderização ----------
  function fillBg(ctx, alpha = 1) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = show ? "#000" : pal().bg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function renderShapes(ctx, list, t, { onlyUnstamped = false, trail = false } = {}) {
    ctx.save();
    // no rastro desenha toda hora por cima do que já está lá: sem somar luz
    ctx.globalCompositeOperation = trail ? "source-over" : pal().dark ? "lighter" : "multiply";
    for (const s of list) {
      const k = 1 - (t - s.born) / s.life;
      if (k <= 0) continue;
      if (onlyUnstamped && s.stamped) continue;
      drawShape(ctx, s, Math.pow(k, 1.3) * (trail ? 0.22 : 1));
    }
    ctx.restore();
  }

  let lastDomText = "", frameErr = 0;
  // o laço de desenho nunca pode morrer: se algo der erro num quadro, registra e segue
  function frame() {
    requestAnimationFrame(frame);
    try { frameBody(); } catch (e) {
      if (frameErr++ < 3) { log("erro no desenho: " + (e && e.message)); console.error(e); }
    }
  }
  function frameBody() {
    const t = now();
    tickMusic();
    drawTimeline();
    analyseAudio();
    drawBands();
    tickDemo(t);

    shapes = shapes.filter((s) => t - s.born < s.life || (settings.style === "geometrico" && settings.mode === "pintura" && !s.stamped));

    // energia de cada trilha → "mais alto agora"
    let dom = null, domE = 0;
    tracks.forEach((tr) => (tr.energy = 0));
    for (const s of shapes) {
      const k = clamp(1 - (t - s.born) / s.life, 0, 1);
      const e = n01(s.vel) * (s.r / 0.17) * k;
      tracks[s.tr].energy = Math.max(tracks[s.tr].energy, e);
      if (e > domE) { domE = e; dom = s; }
    }

    lctx.clearRect(0, 0, W, H);
    const dtF = clamp(t - (frameBody.last || t), 0, 0.05);
    frameBody.last = t;
    echoQueue.sort((a, b) => a.at - b.at);
    while (echoQueue.length && echoQueue[0].at <= t) {
      const e = echoQueue.shift();
      if (e.vel > 8) spawn(e.tr, e.note, e.vel, "eco");
    }
    applyPunch();
    if (settings.style === "abstrato") {
      frameAbstract(t);
    } else if (settings.style === "patch") {
      framePatch(t, dtF);
    } else if (settings.style === "datamosh") {
      frameMosh(t, dtF);
    } else if (settings.mode === "vivo") {
      renderShapes(lctx, shapes, t);
    } else if (settings.mode === "rastro") {
      fillBg(pctx, 0.06);
      renderShapes(pctx, shapes, t, { trail: true });
    } else { // pintura: carimba cada forma uma vez, no auge
      pctx.save();
      pctx.globalCompositeOperation = pal().dark ? "screen" : "multiply";
      for (const s of shapes) {
        if (!s.stamped && t - s.born >= 0.05) {
          drawShape(pctx, s, 0.9);
          s.stamped = true;
        }
      }
      pctx.restore();
      // brilho rápido por cima enquanto soa
      lctx.save();
      lctx.globalCompositeOperation = pal().dark ? "lighter" : "multiply";
      for (const s of shapes) {
        const k = 1 - (t - s.born) / Math.min(s.life, 0.6);
        if (k > 0) drawShape(lctx, s, k * 0.5, { scale: 1 + (1 - k) * 0.25, echo: true });
      }
      lctx.restore();
    }
    if (!show && settings.style === "geometrico" && dom && domE > 0.02) drawAura(lctx, dom, clamp(1 - (t - dom.born) / dom.life, 0, 1));

    // HUD
    const txt = dom && domE > 0.02
      ? `T${dom.tr + 1} ${MACHINES[dom.m]} · vel ${dom.vel} · ${dom.hz < 1000 ? Math.round(dom.hz) + " Hz" : (dom.hz / 1000).toFixed(1) + " kHz"} (${noteName(69 + 12 * Math.log2(dom.hz / 440))})`
      : "—";
    if (txt !== lastDomText) { $("hud-dom").textContent = txt; lastDomText = txt; }
    updatePads(dom);

  }

  // linha do tempo da análise (no ⚙): uma linha por instrumento e a agulha da música
  let tlTick = 0;
  function drawTimeline() {
    const cv = $("timeline");
    if (!cv || $("sheet").hidden || !music.timeline || ++tlTick % 6) return;
    const rows = ["kick", "bass", "snare", "hat", "chord", "lead", "vocal", "fx"];
    const w = cv.clientWidth * DPR, h = cv.clientHeight * DPR;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const x = cv.getContext("2d");
    x.clearRect(0, 0, w, h);
    const rh = h / rows.length, lab = 62 * DPR, dur = music.duration || 1;
    x.font = `${10 * DPR}px system-ui, sans-serif`;
    x.textBaseline = "middle";
    rows.forEach((r, k) => {
      x.fillStyle = "rgba(255,255,255,.55)";
      x.fillText(VOICE_NAME[r], 0, rh * (k + 0.5));
      x.fillStyle = "rgba(255,255,255,.06)";
      x.fillRect(lab, rh * k + 1, w - lab, rh - 2);
    });
    const colors = ["#ff5a3c", "#9b6bff", "#ffb02e", "#e8e44a", "#3fb6ff", "#3fd68a", "#ff7ac8", "#ffffff"];
    for (const e of music.timeline) {
      const k = rows.indexOf(e.v);
      if (k < 0) continue;
      x.fillStyle = colors[k];
      x.fillRect(lab + (e.t / dur) * (w - lab), rh * k + 2, Math.max(1, DPR), rh - 4);
    }
    const ct = music.el ? music.el.currentTime : 0;
    x.fillStyle = "#ff6a2b";
    x.fillRect(lab + (ct / dur) * (w - lab) - DPR, 0, 2 * DPR, h);
  }

  // ---------- tamanho do palco ----------
  function resize() {
    const rect = stage.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const nw = Math.max(1, Math.round(rect.width * DPR));
    const nh = Math.max(1, Math.round(rect.height * DPR));
    if (nw === W && nh === H) return;
    let keep = null;
    if (W && H) {
      keep = document.createElement("canvas");
      keep.width = W; keep.height = H;
      keep.getContext("2d").drawImage(paint, 0, 0);
    }
    paint.width = live.width = W = nw;
    paint.height = live.height = H = nh;
    fillBg(pctx);
    if (keep) pctx.drawImage(keep, 0, 0, W, H);
  }

  function clearCanvas() {
    shapes = [];
    agents = [];
    echoQueue = [];
    gridStep = [0, 0, 0, 0, 0, 0];
    ["squares", "bars", "cubes", "rings", "hlines", "rects"].forEach((k) => (patch[k] = []));
    if (mosh.vx) { mosh.vx.fill(0); mosh.vy.fill(0); }
    mosh.base = null; // no datamosh, limpar traz a obra de volta inteira
    fillBg(pctx);
    lctx.clearRect(0, 0, W, H);
  }

  // ---------- salvar imagem ----------
  function saveImage() {
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const o = out.getContext("2d");
    o.drawImage(paint, 0, 0);
    if (settings.style === "geometrico" && settings.mode === "vivo") renderShapes(o, shapes, now());
    out.toBlob((blob) => {
      if (!blob) return toast("Não consegui gerar a imagem.");
      const url = URL.createObjectURL(blob);
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      const name = `cycles-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      // miniatura na galeria (só nesta sessão)
      const g = $("gallery");
      const link = document.createElement("a");
      link.href = url; link.download = name; link.title = name;
      const img = new Image(); img.src = url; img.alt = name;
      link.appendChild(img);
      g.prepend(link);
      g.hidden = false;
      toast("Imagem salva: " + name);
    }, "image/png");
  }

  // ---------- MIDI ----------
  let midi = null;
  const clock = { running: false, ticks: 0, step: 0, times: [], bpm: 0 };
  let learning = null;
  const monitorLines = [];

  async function connectMidi() {
    if (!navigator.requestMIDIAccess) {
      toast("Este navegador não tem Web MIDI. Use Chrome ou Edge (computador ou Android).");
      setPill("st-midi", "Sem Web MIDI", "warn");
      return;
    }
    try {
      midi = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      toast("Acesso ao MIDI negado: " + (err.message || err));
      return;
    }
    midi.onstatechange = refreshInputs;
    refreshInputs();
  }

  function refreshInputs() {
    if (!midi) return;
    const inputs = [...midi.inputs.values()];
    const sel = $("sel-input");
    sel.innerHTML = '<option value="">— nenhuma —</option>' +
      inputs.map((i) => `<option value="${esc(i.id)}">${esc(i.name || "Entrada MIDI")}</option>`).join("");
    let chosen = inputs.find((i) => i.id === settings.inputId) ||
      inputs.find((i) => /cycles/i.test(i.name || "")) ||
      inputs.find((i) => /elektron/i.test(i.name || "")) ||
      inputs[0];
    inputs.forEach((i) => (i.onmidimessage = null));
    if (chosen) {
      chosen.onmidimessage = onMidi;
      sel.value = chosen.id;
      settings.inputId = chosen.id;
      save();
      setPill("st-midi", "MIDI: " + (chosen.name || "conectado"), "on");
      $("btn-midi").textContent = "MIDI ✓";
    } else {
      setPill("st-midi", "Nenhum aparelho MIDI", "warn");
      toast("Nenhuma entrada MIDI. Ligue o Cycles por USB e confira se o MIDI está ativo nele.");
    }
  }

  function selectInput(id) {
    if (!midi) return;
    [...midi.inputs.values()].forEach((i) => (i.onmidimessage = null));
    const inp = id && midi.inputs.get(id);
    settings.inputId = id || "";
    save();
    if (inp) {
      inp.onmidimessage = onMidi;
      setPill("st-midi", "MIDI: " + (inp.name || "conectado"), "on");
    } else setPill("st-midi", "MIDI sem entrada", "warn");
  }

  function onMidi(e) {
    const d = e.data;
    const st = d[0];
    if (st >= 0xf0) return onRealtime(st);
    const type = st & 0xf0;
    const ch = (st & 0x0f) + 1;
    let tr = settings.channels.indexOf(ch);
    const mapped = tr >= 0;
    if (!mapped) tr = (ch - 1) % 6;

    if (type === 0x90 && d[2] > 0) {
      lastMidiNote = now();
      if (demo.on) stopDemo();
      spawn(tr, d[1], d[2]);
      log(`ch${ch} nota ${noteName(d[1])} (${d[1]}) vel ${d[2]} → T${tr + 1}${mapped ? "" : " (canal sem trilha)"}`);
    } else if (type === 0xb0) {
      const num = d[1], val = d[2];
      if (learning) {
        settings.cc[learning] = num;
        save();
        toast(`${labelOf(learning)} = CC ${num}`);
        learning = null;
        renderCcGrid();
      }
      const param = Object.keys(settings.cc).find((k) => settings.cc[k] === num);
      if (param) setParam(tr, param, val);
      log(`ch${ch} CC ${num} = ${val}${param ? " → T" + (tr + 1) + " " + labelOf(param) : ""}`);
    } else if (type === 0xc0) {
      log(`ch${ch} program change ${d[1]} (pattern)`);
      if (settings.refAuto !== false) nextRef();
    }
  }

  function setParam(tr, param, val) {
    const t = tracks[tr];
    if (param === "machine") t.machine = val < 6 ? val : Math.min(5, Math.floor(val / (128 / 6)));
    else t[param] = val;
    renderPads();
  }

  function onRealtime(st) {
    const t = now();
    if (st === 0xf8) {
      clock.ticks++;
      if (clock.ticks % 6 === 0) {
        clock.step++;
        if (clock.step % 256 === 0 && settings.refAuto !== false) nextRef(); // a cada 16 compassos
      }
      clock.times.push(t);
      if (clock.times.length > 49) clock.times.shift();
      if (clock.times.length >= 25 && clock.ticks % 24 === 0) {
        const n = clock.times.length - 1;
        const bpm = 60 / (((clock.times[n] - clock.times[0]) / n) * 24);
        if (isFinite(bpm) && bpm > 20 && bpm < 400) {
          clock.bpm = bpm;
          const el = $("st-bpm");
          el.hidden = false;
          el.textContent = bpm.toFixed(1) + " BPM";
        }
      }
    } else if (st === 0xfa) {
      clock.running = true; clock.ticks = -1; clock.step = 0; clock.times = [];
      if (settings.clearOnPlay) clearCanvas();
      log("▶ play");
    } else if (st === 0xfb) {
      clock.running = true; log("▶ continue");
    } else if (st === 0xfc) {
      clock.running = false; log("■ stop");
    }
  }

  function log(line) {
    monitorLines.unshift(line);
    if (monitorLines.length > 40) monitorLines.pop();
    if (!$("sheet").hidden) $("monitor").textContent = monitorLines.join("\n");
  }

  // ---------- demo (sem aparelho) ----------
  const demo = { on: false, next: 0, step: 0 };
  const SCALE = [0, 3, 5, 7, 10, 12];
  function toggleDemo() { demo.on ? stopDemo() : startDemo(); }
  function startDemo() {
    demo.on = true; demo.next = now(); demo.step = 0;
    $("btn-demo").classList.add("on");
    const el = $("st-bpm"); el.hidden = false; el.textContent = "Demo · 120 BPM";
  }
  function stopDemo() {
    demo.on = false;
    $("btn-demo").classList.remove("on");
    if (!clock.bpm) $("st-bpm").hidden = true;
  }
  function tickDemo(t) {
    if (!demo.on) return;
    while (t >= demo.next) {
      const s = demo.step % 16, bar = Math.floor(demo.step / 16);
      const ph = demo.step / 64;
      // knobs "se mexendo" para mostrar a variação
      tracks[4].decay = 40 + 60 * (0.5 + 0.5 * Math.sin(ph * 2));
      tracks[4].color = 64 + 60 * Math.sin(ph * 3);
      tracks[2].shape = 64 + 60 * Math.sin(ph * 1.3);
      tracks[1].pan = 64 + 50 * Math.sin(ph * 4);
      tracks[3].pan = 64 - 50 * Math.sin(ph * 2.5);
      tracks[5].delay = 50 + 50 * Math.sin(ph);
      const was = clock.step; clock.step = demo.step;
      const run = clock.running; clock.running = true;
      if (s % 4 === 0 || (s === 14 && bar % 2)) spawn(0, 36, s % 4 === 0 ? 120 : 70);
      if (s === 4 || s === 12) spawn(1, 50, 110);
      if ((s === 7 || s === 15) && Math.random() < 0.5) spawn(1, 50, 35 + Math.random() * 20 | 0);
      if (s % 2 === 0) spawn(2, 84, 45 + (Math.random() * 45) | 0);
      if (Math.random() < 0.22) spawn(3, 62 + (Math.random() * 12 | 0), 60 + (Math.random() * 40) | 0);
      if (s === 2 || s === 10 || (s === 6 && bar % 2)) spawn(4, 48 + SCALE[(Math.random() * 6) | 0] + 12 * (bar % 2), 80 + (Math.random() * 35) | 0);
      if (s === 0 && bar % 2 === 0) spawn(5, 55 + SCALE[bar % 6], 95);
      clock.step = was; clock.running = run;
      demo.step++;
      if (demo.step % 128 === 0) nextRef();
      demo.next += 0.125;
    }
  }

  // ---------- pads ----------
  function renderPads() {
    const box = $("pads");
    if (!box.children.length) {
      box.innerHTML = tracks.slice(0, 6).map((_, i) =>
        `<button class="pad" type="button" data-i="${i}" style="--c:var(${TRACK_COLORS[i]})"><b></b><small></small><i class="lvl"></i></button>`).join("");
      box.querySelectorAll(".pad").forEach((el) => {
        el.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          const i = +el.dataset.i;
          spawn(i, tracks[i].lastNote || 60, 90 + ((Math.random() * 30) | 0), "pad");
        });
      });
    }
    [...box.children].forEach((el, i) => {
      const tr = tracks[i];
      el.querySelector("b").textContent = `T${i + 1} ${MACHINES[tr.machine]}`;
      el.querySelector("small").textContent = tr.lastVel ? `vel ${tr.lastVel} · ${noteName(tr.lastNote)}` : `canal ${settings.channels[i]}`;
    });
  }
  function flashPad(i, vel) {
    const el = $("pads").children[i];
    if (!el) return;
    el.style.setProperty("--flash", (0.15 + 0.45 * n01(vel)).toFixed(2));
    el.querySelector("small").textContent = `vel ${vel} · ${noteName(tracks[i].lastNote)}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.style.setProperty("--flash", 0), 70);
  }
  let padTick = 0;
  function updatePads(dom) {
    if (++padTick % 4) return;
    [...$("pads").children].forEach((el, i) => {
      el.style.setProperty("--lvl", Math.round(clamp(tracks[i].energy, 0, 1) * 100) + "%");
      el.classList.toggle("dom", !!dom && dom.tr === i);
    });
  }

  // ---------- ajustes (painel) ----------
  const labelOf = (k) => (PARAMS.find((p) => p[0] === k) || [k, k])[1];
  function renderChanGrid() {
    $("chan-grid").innerHTML = tracks.slice(0, 6).map((_, i) =>
      `<label>T${i + 1}<input type="number" min="1" max="16" value="${settings.channels[i]}" data-i="${i}" /></label>`).join("");
    $("chan-grid").querySelectorAll("input").forEach((inp) =>
      inp.addEventListener("change", () => {
        settings.channels[+inp.dataset.i] = clamp(parseInt(inp.value, 10) || 1, 1, 16);
        inp.value = settings.channels[+inp.dataset.i];
        save(); renderPads();
      }));
  }
  function renderCcGrid() {
    $("cc-grid").innerHTML = PARAMS.map(([k, label, what]) =>
      `<span>${label}<small>${what}</small></span>
       <input type="number" min="0" max="127" value="${settings.cc[k]}" data-k="${k}" aria-label="CC de ${label}" />
       <button class="btn small${learning === k ? " learning" : ""}" type="button" data-learn="${k}">${learning === k ? "Mexa o knob…" : "Aprender"}</button>`).join("");
    $("cc-grid").querySelectorAll("input").forEach((inp) =>
      inp.addEventListener("change", () => {
        settings.cc[inp.dataset.k] = clamp(parseInt(inp.value, 10) || 0, 0, 127);
        save();
      }));
    $("cc-grid").querySelectorAll("[data-learn]").forEach((b) =>
      b.addEventListener("click", () => {
        learning = learning === b.dataset.learn ? null : b.dataset.learn;
        if (learning && !midi) connectMidi();
        renderCcGrid();
      }));
  }
  function openSheet() {
    renderChanGrid(); renderCcGrid();
    $("chk-clear-play").checked = settings.clearOnPlay;
    $("chk-onset").checked = settings.onset;
    $("monitor").textContent = monitorLines.length ? monitorLines.join("\n") : "Nada recebido ainda.";
    $("sheet").hidden = false;
  }
  function closeSheet() { $("sheet").hidden = true; learning = null; }

  // ---------- interface ----------
  function setPill(id, text, cls) {
    const el = $(id);
    el.textContent = text;
    el.className = "pill" + (cls ? " " + cls : "");
  }
  let toastT = 0;
  function toast(msg) {
    if (show) return hint(msg);
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => (el.hidden = true), 3800);
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function setMode(m) {
    settings.mode = m; save();
    document.querySelectorAll("#seg-mode button").forEach((b) => b.classList.toggle("on", b.dataset.v === m));
    if (m === "vivo") fillBg(pctx);
    if (m === "pintura") shapes.forEach((s) => (s.stamped = true)); // não recarimba o que já passou
  }

  // ---------- modo palco ----------
  let wakeLock = null, hintT = 0, idleT = 0;
  const SHORTCUTS = "F tela cheia (Esc sai) · 1–6 trilhas · R próxima obra · N nova arte aleatória · G estilo · M modo · L composição · P paleta\nC limpar · S salvar imagem · D demo · A áudio · Espaço música · ? atalhos";

  function enterShow() {
    if (show) return;
    show = true;
    closeSheet();
    document.body.classList.add("show");
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    else if (el.webkitRequestFullscreen) try { el.webkitRequestFullscreen(); } catch { /* iPad antigo */ }
    if (navigator.wakeLock) navigator.wakeLock.request("screen").then((l) => (wakeLock = l)).catch(() => {});
    restyle();
    const canFS = !!(el.requestFullscreen || el.webkitRequestFullscreen);
    if (!canFS && !navigator.standalone && !matchMedia("(display-mode: standalone)").matches && !store.get("dica-ios")) {
      store.set("dica-ios", 1);
      hint("Tela cheia · toque duas vezes pra sair\nNo iPhone, pra sumir com as barras do Safari: Compartilhar → Adicionar à Tela de Início, e abra pelo ícone.", 7000);
    } else hint("Tela cheia · toque duas vezes (ou Esc) pra sair · ? atalhos");
    poke();
  }
  function leaveShow() {
    if (!show) return;
    show = false;
    document.body.classList.remove("show", "idle");
    $("stage-hint").hidden = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    restyle();
  }
  // troca o fundo/cores sem apagar o que já foi pintado (só no "ao vivo")
  function restyle() {
    shapes.forEach((s) => (s.color = pal().color(s.ft, tracks[s.tr], s.sat)));
    if (settings.mode === "vivo") fillBg(pctx);
  }
  // aviso discreto no canto — só aparece quando você aperta algo
  function hint(msg, ms = 1800) {
    const el = $("stage-hint");
    el.textContent = msg;
    el.hidden = false;
    el.classList.remove("fade");
    clearTimeout(hintT);
    hintT = setTimeout(() => el.classList.add("fade"), ms);
  }
  // esconde o cursor quando o mouse para
  function poke() {
    document.body.classList.remove("idle");
    clearTimeout(idleT);
    if (show) idleT = setTimeout(() => document.body.classList.add("idle"), 1200);
  }
  function setStyle(v) {
    settings.style = $("sel-style").value = v;
    save();
    clearCanvas();
    mosh.base = null;
  }
  function cycle(list, cur) { return list[(list.indexOf(cur) + 1) % list.length]; }
  const MODE_NAMES = { vivo: "Ao vivo", rastro: "Rastro", pintura: "Pintura" };

  function bind() {
    $("btn-show").addEventListener("click", enterShow);
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && show) leaveShow(); });
    document.addEventListener("pointermove", poke);
    stage.addEventListener("dblclick", () => (show ? leaveShow() : enterShow()));
    // segurar o dedo na tela também sai da tela cheia (no celular não tem Esc)
    let pressT = 0;
    stage.addEventListener("pointerdown", () => { clearTimeout(pressT); if (show) pressT = setTimeout(leaveShow, 900); });
    ["pointerup", "pointercancel", "pointermove"].forEach((ev) => stage.addEventListener(ev, (e) => {
      if (ev !== "pointermove" || Math.abs(e.movementX) + Math.abs(e.movementY) > 6) clearTimeout(pressT);
    }));
    document.addEventListener("webkitfullscreenchange", () => { if (!document.webkitFullscreenElement && show) leaveShow(); });
    $("chk-panel").checked = settings.showPanel;
    $("chk-panel").addEventListener("change", (e) => { settings.showPanel = e.target.checked; save(); applyPanel(); });
    $("btn-midi").addEventListener("click", connectMidi);
    $("btn-audio").addEventListener("click", toggleAudio);
    $("btn-music").addEventListener("click", toggleMusic);
    const wake = () => { if (audio.ctx && audio.ctx.state !== "running") audio.ctx.resume().catch(() => {}); };
    document.addEventListener("pointerdown", wake, true);
    document.addEventListener("keydown", wake, true);
    $("btn-music-pick").addEventListener("click", pickMusic);
    $("inp-music").addEventListener("change", (e) => { if (e.target.files[0]) loadMusic(e.target.files[0]); e.target.value = ""; });
    $("btn-demo").addEventListener("click", toggleDemo);
    $("btn-settings").addEventListener("click", openSheet);
    $("sheet-close").addEventListener("click", closeSheet);
    $("sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") closeSheet(); });
    $("btn-clear").addEventListener("click", clearCanvas);
    $("btn-save").addEventListener("click", saveImage);
    $("sel-input").addEventListener("change", (e) => selectInput(e.target.value));
    $("chk-clear-play").addEventListener("change", (e) => { settings.clearOnPlay = e.target.checked; save(); });
    $("chk-onset").addEventListener("change", (e) => { settings.onset = e.target.checked; save(); });
    $("btn-cc-reset").addEventListener("click", () => { settings.cc = { ...DEFAULT_CC }; save(); renderCcGrid(); });
    document.querySelectorAll("#seg-mode button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.v)));
    $("sel-ref").addEventListener("change", (e) => chooseRefSet(e.target.value));
    $("sel-fid").value = settings.refFid;
    $("sel-fid").addEventListener("change", (e) => { settings.refFid = e.target.value; save(); });
    $("chk-ref-auto").checked = settings.refAuto !== false;
    $("chk-ref-auto").addEventListener("change", (e) => { settings.refAuto = e.target.checked; save(); });
    $("btn-new-art").addEventListener("click", () => newArtRef(false));
    $("inp-ref").addEventListener("change", (e) => { if (e.target.files.length) addUserImages([...e.target.files]); e.target.value = ""; });
    const lay = $("sel-layout"), palSel = $("sel-palette"), sty = $("sel-style");
    sty.value = settings.style;
    sty.addEventListener("change", () => setStyle(sty.value));
    lay.value = settings.layout; palSel.value = settings.palette;
    lay.addEventListener("change", () => { settings.layout = lay.value; gridStep = [0, 0, 0, 0, 0, 0]; save(); });
    palSel.addEventListener("change", () => {
      settings.palette = palSel.value; save();
      restyle();
    });
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input,select,textarea")) return;
      if (e.key >= "1" && e.key <= "6") spawn(+e.key - 1, tracks[+e.key - 1].lastNote || 60, 100, "pad");
      const k = e.key.toLowerCase();
      if (k === "c") { clearCanvas(); if (show) hint("Limpo", 900); }
      else if (k === "s") saveImage();
      else if (k === "f" || k === "enter") show ? leaveShow() : enterShow();
      else if (k === "m") { setMode(cycle(["vivo", "rastro", "pintura"], settings.mode)); hint("Modo: " + MODE_NAMES[settings.mode], 1200); }
      else if (k === "l") {
        settings.layout = lay.value = cycle(["livre", "faixas", "radial", "grade"], settings.layout);
        gridStep = [0, 0, 0, 0, 0, 0]; save();
        hint("Composição: " + lay.selectedOptions[0].textContent, 1200);
      } else if (k === "p") {
        const list = show ? ["espectro", "neon", "boogie"] : ["espectro", "neon", "boogie", "papel"];
        settings.palette = palSel.value = cycle(list, settings.palette);
        save(); restyle();
        hint("Paleta: " + palSel.selectedOptions[0].textContent, 1200);
      } else if (k === "g") { setStyle(cycle(["abstrato", "patch", "datamosh", "geometrico"], settings.style)); hint("Estilo: " + sty.selectedOptions[0].textContent, 1200); }
      else if (k === "d") { toggleDemo(); hint(demo.on ? "Demo ligado" : "Demo desligado", 1200); }
      else if (k === "a") toggleAudio();
      else if (k === " " || k === "spacebar") { e.preventDefault(); toggleMusic(); }
      else if (k === "n") newArtRef(false);
      else if (k === "r") { if (refs.list.length) nextRef(false); else hint("Sem referência escolhida", 1200); }
      else if (k === "?" || k === "h") hint(SHORTCUTS, 5000);
      else if (k === "escape") { if (show) leaveShow(); else closeSheet(); }
    });
    new ResizeObserver(resize).observe(stage);
  }

  // ---------- início ----------
  bind();
  applyPanel();
  loadManifest();
  resize();
  setMode(settings.mode);
  renderPads();
  // se o navegador já deu permissão antes, reconecta sozinho
  if (navigator.permissions && navigator.requestMIDIAccess) {
    navigator.permissions.query({ name: "midi" }).then((p) => { if (p.state === "granted") connectMidi(); }).catch(() => {});
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw-cycles.js").catch(() => {});
  requestAnimationFrame(frame);
})();
