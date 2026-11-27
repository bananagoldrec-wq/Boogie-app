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
  const APP_VERSION = 28;
  // quanto a imagem se mexe (câmera, zoom do kick, empurrões): o padrão é suave
  const MOTION = { suave: 0.4, medio: 0.7, intenso: 1 };
  const motionK = () => MOTION[settings.motion] ?? 0.4;

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
      style: "3d",
      motion: "suave",
      sync: 0,
      showPanel: false,
      ref: "tudo",
      refFid: "media",
    },
    load()
  );
  settings.cc = Object.assign({ ...DEFAULT_CC }, settings.cc);
  // versão 12: o estilo 3D chega e vira o padrão (uma vez só; depois vale a escolha)
  settings.style = "3d"; // o app agora é só a experiência 3D

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
  const live = $("live");
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
      an.smoothingTimeConstant = 0.15; // pouca suavização: precisa ver o ataque e o decaimento de cada batida
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
  const music = { el: null, src: null, url: "", name: "", timeline: null, plan: null, idx: 0, lastT: 0, analysing: false, progress: 0, token: 0 };
  const VOICE_TRACK = { kick: 0, bass: 8, snare: 1, clap: 3, hat: 2, lead: 4, chord: 5, vocal: 6, fx: 7, accent: 7 };
  const VOICE_NAME = { kick: "kick", bass: "baixo", snare: "snare", clap: "clap", hat: "hi-hat", chord: "chords", lead: "lead", vocal: "vocal", fx: "efeitos", accent: "acentos" };

  // analisa a faixa inteira (em segundo plano) e troca a detecção ao vivo pela linha do tempo
  async function analyseFile(file) {
    const token = ++music.token;
    music.timeline = null;
    music.plan = null;
    setAct(0);
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
      music.plan = buildPlan();
      music.lastBar = null;
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
  // o tempo da música "que está saindo da caixa agora": desconta o atraso de saída
  // do áudio (Bluetooth chega a 0,2 s) e soma o ajuste fino de sincronia do ⚙
  function musicTime() {
    const lat = audio.ctx ? (audio.ctx.outputLatency || 0) + (audio.ctx.baseLatency || 0) : 0;
    return music.el.currentTime - lat + (settings.sync || 0) / 1000;
  }
  function tickMusic() {
    if (!music.timeline || !music.el || music.el.paused) return;
    const ct = musicTime();
    // roteiro: o ato do bloco atual; a forma muda a cada 4 compassos
    if (music.plan) {
      const b = Math.max(0, Math.floor(ct / music.plan.blockLen));
      const act = music.plan.acts[Math.min(music.plan.acts.length - 1, b)];
      if (act !== story.act) setAct(act);
      const bar = music.bpm ? Math.floor(ct / (240 / music.bpm)) : Math.floor(ct / 8);
      if (bar !== music.lastBar) {
        if (music.lastBar != null && bar > 0 && bar % 4 === 0) storyShape();
        music.lastBar = bar;
      }
    }
    if (ct < music.lastT - 0.3) music.idx = 0; // deu a volta (loop) ou voltou
    const ev = music.timeline;
    while (music.idx < ev.length && ev[music.idx].t <= ct) {
      const e = ev[music.idx++];
      if (ct - e.t < 0.25) {
        spawn(VOICE_TRACK[e.v], e.note, e.vel, "musica", { kind: e.v === "accent" ? "acento" : e.kind });
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
    let lowE = 0, lowPk = 0, lowPkI = 1, clickE = 0; // grave (30–160 Hz), seu pico, e o "click" (2–6 kHz)
    let snE = 0, snPk = 0, snN = 0, snLog = 0, hiE = 0; // faixa da caixa/clap (900–5000 Hz), se é ruído, e o agudo (6–12 kHz)
    for (let i = 1; i < fd.length; i++) {
      const hz = i * binHz;
      if (hz < 25 || hz > 12000) continue;
      const p = Math.pow(10, fd[i] / 10);
      total += p;
      if (p > peak) { peak = p; peakI = i; }
      const k = hz < 250 ? 0 : hz < 2000 ? 1 : 2;
      b[k] += p;
      if (p > bp[k]) { bp[k] = p; bpi[k] = i; }
      if (hz >= 30 && hz < 160) lowE += p;
      if (hz >= 30 && hz < 220 && p > lowPk) { lowPk = p; lowPkI = i; }
      if (hz >= 2000 && hz < 6000) clickE += p;
      if (hz >= 900 && hz < 5000) { snE += p; snN++; snLog += Math.log(p + 1e-20); if (p > snPk) snPk = p; }
      if (hz >= 6000 && hz < 12000) hiE += p;
    }
    // tom do grave com interpolação entre as faixas do espectro (sem isso a medida
    // anda em degraus de ~23 Hz e o mesmo kick parece cair de tom ora sim, ora não)
    let lowHz = lowPkI * binHz;
    if (lowPkI > 1 && lowPkI < fd.length - 1) {
      const a = fd[lowPkI - 1], c0 = fd[lowPkI], c = fd[lowPkI + 1], den = a - 2 * c0 + c;
      if (den < 0) lowHz = (lowPkI + clamp((0.5 * (a - c)) / den, -0.5, 0.5)) * binHz;
    }
    audio.hz = peakI * binHz;
    audio.tonal = total ? peak / total : 0;
    const max = Math.max(b[0], b[1], b[2], 1e-12);
    audio.bands = b.map((v) => v / max);

    // batidas pelo áudio (quando não chega MIDI): cada faixa de frequência tem
    // seu próprio detector — grave vira KICK, médio vira SNARE/PERC/TONE, agudo vira METAL
    const t = now();
    const playing = music.el && !music.el.paused;
    // com o botão Áudio ligado, sempre escuta as batidas (o som do Cycles pelo USB pode vir baixo: piso pequeno)
    if (!(settings.onset || playing || audio.stream) || (playing && music.timeline) || t - lastMidiNote < 3 || rms < 0.002) {
      audio.bandSlow = audio.bandSlow || [0, 0, 0];
      return;
    }
    const e = b.map(Math.sqrt);
    const slow = audio.bandSlow || (audio.bandSlow = e.slice());
    audio.clickSlow = (audio.clickSlow ?? clickE) * 0.95 + clickE * 0.05;

    // KICK × BAIXO ao vivo: uma batida grave fica "em análise" por ~75 ms.
    // Kick: a nota despenca logo depois do ataque. Baixo: a nota fica parada.
    // Só o kick vira o círculo.
    if (audio.sDbMax != null) audio.sDbMax -= 0.004;
    if (audio.kDbMax != null) audio.kDbMax -= 0.004; // o teto desce bem devagar (~0,25 dB/s): baixar o volume encolhe o círculo de verdade
    const pend = audio.lowPend;
    if (pend) {
      const age = t - pend.t0;
      if (age < 0.03) pend.peak = Math.max(pend.peak, lowE);
      if (pend.f0 == null && age >= 0.012) pend.f0 = lowHz;
      if (age >= 0.075) {
        audio.lowPend = null;
        const decay = lowE / (pend.peak + 1e-12);
        const glide = pend.f0 && lowHz ? pend.f0 / lowHz : 1;
        const isKick = classifyLow({ glide, click: pend.click, decay });
        // FORÇA contínua em decibéis, relativa ao kick mais forte dos últimos ~20 s
        // (ganho automático lento): 30 dB de faixa útil, cada pequena mudança de volume conta.
        const db = 10 * Math.log10(pend.peak + 1e-12);
        audio.kDbMax = Math.max(db, audio.kDbMax ?? db);
        const v = clamp((db - (audio.kDbMax - 30)) / 30, 0.01, 1);
        const vel = 1 + 126 * v;
        spawn(isKick ? 0 : 8, pend.note, vel, "audio", { exactVel: vel });
        log(`áudio: grave → ${isKick ? "KICK (círculo)" : "baixo"} · força ${Math.round(v * 100)}% · tom ${glide.toFixed(2)} · estalo ${pend.click.toFixed(1)}`);
      }
    }
    const last = audio.bandLast || (audio.bandLast = [0, 0, 0]);
    const TH = [1.22, 1.4, 1.5], REF = [0.2, 0.12, 0.09]; // grave mais sensível: kick baixo também conta
    const hit = [false, false, false];
    for (let i = 0; i < 3; i++) {
      const ratio = slow[i] > 0 ? e[i] / slow[i] : 0;
      if (ratio > TH[i] && t - last[i] > REF[i]) {
        hit[i] = true;
        last[i] = t;
        const vel = clamp(Math.round(35 + (ratio - 1) * 110 + rms * 160), 20, 127);
        const note = 69 + 12 * Math.log2(Math.max(20, bpi[i] * binHz) / 440);
        if (i === 0) {
          // grave: decide kick ou baixo daqui a ~75 ms
          if (!audio.lowPend) audio.lowPend = { t0: t, peak: lowE, f0: null, click: clickE / (audio.clickSlow + 1e-12), vel, note };
          slow[i] = slow[i] * 0.94 + e[i] * 0.06;
          continue;
        }
        if (i === 1) { slow[i] = slow[i] * 0.94 + e[i] * 0.06; continue; } // médio: caixa/clap têm detector próprio (abaixo)
        const tr = i === 2 ? 2 : audio.tonal > 0.1 ? 4 : bpi[1] * binHz < 900 ? 3 : 1;
        spawn(tr, note, vel, "audio");
      }
      slow[i] = slow[i] * 0.94 + e[i] * 0.06;
    }
    // SNARE/CLAP: detector próprio em 900–5000 Hz (o kick não atrapalha), só se ali
    // for RUÍDO (caixa e clap são ruído; nota de synth e kick têm pico definido) e
    // se pesar mais no médio que no agudo (o hi-hat mora acima de 6 kHz).
    // Força contínua em dB, como o kick.
    {
      const se = Math.sqrt(snE);
      audio.snSlow = (audio.snSlow ?? se);
      const ratio = audio.snSlow > 0 ? se / audio.snSlow : 0;
      const flat = snN ? Math.exp(snLog / snN) / (snE / snN + 1e-20) : 0; // 1 = ruído puro, ~0 = nota
      const mid = snE / (snE + hiE + 1e-20); // caixa/clap pesam no médio; hi-hat mora acima de 6 kHz
      const okNoise = flat > 0.2, okMid = mid > 0.22; // um pouco mais permissivo (caixas com corpo forte, como a do Cycles)
      if (ratio > 1.3 && (!okNoise || !okMid) && t - (audio.snRej ?? -9) > 0.25) {
        audio.snRej = t; // registra no monitor por que uma batida no médio NÃO virou linha (diagnóstico)
        log(`áudio: médio ignorado · ruído ${flat.toFixed(2)}${okNoise ? "" : " (baixo)"} · médio ${mid.toFixed(2)}${okMid ? "" : " (baixo)"}`);
      }
      if (ratio > 1.3 && okNoise && okMid && t - (audio.snLast ?? -9) > 0.09) {
        audio.snLast = t;
        const db = 10 * Math.log10(snE + 1e-12);
        audio.sDbMax = Math.max(db, audio.sDbMax ?? db);
        const v = clamp((db - (audio.sDbMax - 30)) / 30, 0.01, 1), sv = 1 + 126 * v;
        spawn(1, 50, sv, "audio", { exactVel: sv });
        log(`áudio: médio → SNARE/CLAP (linha) · força ${Math.round(v * 100)}% · ruído ${flat.toFixed(2)}`);
      }
      audio.snSlow = audio.snSlow * 0.93 + se * 0.07;
    }
    // grave + médio juntos e com tom definido → um acorde (mancha de cor) de vez em quando
    if (hit[0] && hit[1] && audio.tonal > 0.05 && Math.random() < 0.5) {
      spawn(5, 69 + 12 * Math.log2(Math.max(40, audio.hz) / 440), 80, "audio");
    }
  }

  // Separa kick × baixo APRENDENDO com o som que está tocando: guarda as últimas
  // batidas graves e divide em dois grupos pela "cara de kick" (queda de tom,
  // estalo, some rápido). Se só existe um grupo (só kick tocando, ou kick e baixo
  // idênticos), vale kick — o círculo nunca some por excesso de rigor.
  const lowHist = [];
  function classifyLow(f) {
    const lg = Math.log(Math.max(0.5, f.glide)), lc = Math.log(Math.max(0.05, f.click)), ld = Math.log(Math.max(0.01, f.decay));
    lowHist.push([lg, lc, ld]);
    if (lowHist.length > 48) lowHist.shift();
    if (f.glide > 1.3) return true; // queda de tom clara: kick com certeza
    if (lowHist.length < 8) return true;
    // desvio com piso: batidas quase iguais (só kick) não podem virar "dois grupos" por ruído
    const FLOOR = [0.15, 0.7, 0.4];
    const stat = (k) => {
      const v = lowHist.map((x) => x[k]), m = v.reduce((a, b) => a + b, 0) / v.length;
      return [m, Math.max(FLOOR[k], Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length))];
    };
    const [mg, sg] = stat(0), [mc, sc] = stat(1), [md, sd] = stat(2);
    const score = (x) => 1.0 * (x[0] - mg) / sg + 0.7 * (x[1] - mc) / sc - 0.5 * (x[2] - md) / sd;
    const sc0 = lowHist.map(score).sort((a, b) => a - b);
    let lo = sc0[Math.floor(sc0.length * 0.25)], hi = sc0[Math.floor(sc0.length * 0.75)];
    for (let it = 0; it < 10; it++) {
      const A = [], B = [];
      sc0.forEach((v) => (Math.abs(v - lo) <= Math.abs(v - hi) ? A : B).push(v));
      if (A.length) lo = A.reduce((a, b) => a + b, 0) / A.length;
      if (B.length) hi = B.reduce((a, b) => a + b, 0) / B.length;
    }
    const cut = (lo + hi) / 2, nLow = sc0.filter((v) => v < cut).length;
    // um grupo só (ou um "grupo" minúsculo de ruído): tudo é kick
    if (hi - lo < 2.0 || nLow < sc0.length * 0.2 || nLow > sc0.length * 0.8) return true;
    return score([lg, lc, ld]) > cut;
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
  let lastMidiNote = -99;

  function spawn(trIndex, note, vel, source = "midi", extra = {}) {
    const tr = tracks[trIndex];
    if (!tr) return;
    vel = clamp(extra.exactVel ?? (Math.round(vel) || 64), 1, 127); // força fracionária: sem degraus
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

    const { x, y } = place(trIndex, tr, ft);

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
    if (sh.m === 0) kickRings.push({ born: t, v: n01(vel) }); // kick = círculo 2D nascendo
    if (sh.m === 1 || sh.m === 3) snareLines.push({ born: t, v: n01(vel) }); // snare/clap = linha horizontal
    // TELA ZERADA: por enquanto só o kick tem imagem (o círculo). Cada instrumento
    // novo entra aqui, um de cada vez, com um significado definido.
    if (shapes.length > 600) shapes.splice(0, shapes.length - 600);
    flashPad(trIndex, vel);
    $("empty").hidden = true;
  }

  // posição normalizada (0..1): o pan define o x, a frequência define a altura
  function place(i, tr, ft) {
    return {
      x: clamp(0.5 + ((tr.pan - 64) / 64) * 0.3 + gauss() * 0.3, 0.04, 0.96),
      y: clamp(0.92 - ft * 0.84 + gauss() * 0.1, 0.05, 0.95),
    };
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

  // ---------- rampas (como o objeto `line` do Pure Data) ----------
  // um valor vai até o alvo em linha reta no tempo pedido, e pode emendar rampas
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
  const punch = { s: mkLine(0) }; // clarão branco por cima (drop)

  // ---------- estilo 3D (WebGL; carrega three.js embutido só quando usado) ----------
  const gl3 = { loading: null, ok: false, tex: undefined };
  function load3D() {
    if (gl3.loading) return gl3.loading;
    const add = (src) => new Promise((ok, no) => {
      const s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = () => no(new Error("não carregou " + src));
      document.head.appendChild(s);
    });
    gl3.loading = (window.THREE ? Promise.resolve() : add("js/vendor/three-r128.min.js"))
      .then(() => (window.Cycles3D ? null : add("js/cycles-3d.js?v=" + APP_VERSION)))
      .then(() => { window.Cycles3D.init($("gl")); gl3.ok = true; window.Cycles3D.resize(W, H); window.Cycles3D.setAct(story.act); });
    return gl3.loading;
  }
  function start3D() {
    load3D().catch((e) => {
      log("3D: " + (e && e.message));
      const em = $("empty");
      em.hidden = false;
      em.querySelector("h2").textContent = "Este aparelho não roda 3D (WebGL)";
      em.querySelector("p").textContent = "Abra no Chrome, no Edge ou no Safari atualizado.";
    });
  }

  // ---------- história ----------
  // A apresentação conta uma história em atos, que avança com a música:
  //   0 Gênese → 1 Despertar → 2 Terra → 3 Travessia → 4 Tempestade (clímax) → 5 Dissolução → (recomeça)
  // Com música de arquivo, a análise vira um roteiro: blocos de 8 compassos; os mais
  // intensos são Tempestade, o fim é Dissolução e o resto anda pra frente em ordem.
  // Ao vivo (Cycles/microfone), cada 16 compassos ou troca de pattern é um ato novo.
  const ACT_NAMES = ["Gênese", "Despertar", "Terra", "Travessia", "Tempestade", "Dissolução"];
  const story = { act: 0, lastAct: now(), lastShape: now() };
  function setAct(i, manual) {
    i = ((i % ACT_NAMES.length) + ACT_NAMES.length) % ACT_NAMES.length;
    const changed = i !== story.act;
    story.act = i;
    story.lastAct = story.lastShape = now();
    if (gl3.ok) window.Cycles3D.setAct(i);
    if (manual) hintOrToast("Ato: " + ACT_NAMES[i]);
    if (changed) log("ato: " + ACT_NAMES[i]);
  }
  const nextAct = (manual) => setAct(story.act + 1, manual);
  function storyShape() {
    if (!gl3.ok) return;
    window.Cycles3D.nextShape();
    story.lastShape = now();
  }
  // roteiro da música: um ato por bloco de 8 compassos (ou 16 s sem BPM)
  function buildPlan() {
    const tl = music.timeline, dur = music.duration || 0;
    if (!tl || !dur) return null;
    const blockLen = music.bpm ? (240 / music.bpm) * 8 : 16;
    const n = Math.max(1, Math.ceil(dur / blockLen));
    const energy = new Array(n).fill(0);
    const W8 = { kick: 1, snare: 1, clap: 1, hat: 0.3, bass: 0.6, fx: 1.5, accent: 1.2, chord: 0.4, lead: 0.4, vocal: 0.4 };
    for (const e of tl) { const b = Math.min(n - 1, Math.floor(e.t / blockLen)); energy[b] += (W8[e.v] || 0.3) * (e.vel / 127); }
    // intensidade de cada bloco entre o mais calmo (0) e o mais intenso (1) desta música
    const lo = Math.min(...energy), hi = Math.max(...energy), span = hi - lo || 1;
    const level = energy.map((e) => (e - lo) / span);
    const climax = level.map((l, b) => n > 1 && b > 0 && l >= 0.75);
    // fim calmo vira Dissolução (até ~15% finais da música)
    const outroMax = Math.max(1, Math.round(n * 0.15));
    const outro = new Array(n).fill(false);
    for (let b = n - 1; b > 0 && n - b <= outroMax && level[b] < 0.6; b--) outro[b] = true;
    const acts = new Array(n);
    const calm = [];
    for (let b = 0; b < n; b++) if (!climax[b] && !outro[b]) calm.push(b);
    // os blocos calmos andam pra frente na história: Gênese → Despertar → Terra → Travessia
    calm.forEach((b, k) => (acts[b] = Math.min(3, Math.floor((k / Math.max(1, calm.length)) * 4))));
    for (let b = 0; b < n; b++) {
      if (climax[b]) acts[b] = 4;
      else if (outro[b]) acts[b] = 5;
    }
    acts[0] = 0; // toda história começa na Gênese
    log("roteiro: " + acts.map((a) => ACT_NAMES[a]).join(" → "));
    return { blockLen, acts };
  }
  function frame3D(dt) {
    if (!gl3.ok) return;
    const t = now();
    const playing = music.el && !music.el.paused && music.plan;
    // ao vivo sem pulsação conhecida: um ato a cada ~40 s; forma nova a cada ~16 s
    if (!playing && !clock.running && t - story.lastAct > 40) nextAct();
    else if (t - story.lastShape > 16) storyShape();
    if (refs.cur !== gl3.tex) {
      gl3.tex = refs.cur;
      window.Cycles3D.setTexture(refs.cur ? (pal().dark ? refs.cur.smallLit : refs.cur.small) : null);
    }
    window.Cycles3D.frame(dt, settings.mode, motionK());
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

    shapes = shapes.filter((s) => t - s.born < s.life);

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
    drawKickRings(t);
    drawSnareLines(t);

    // clarão do drop por cima
    const sF = lineVal(punch.s);
    if (sF > 0.01) { lctx.fillStyle = `rgba(255,255,255,${(sF * 0.5).toFixed(3)})`; lctx.fillRect(0, 0, W, H); }

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
    if (!$("sheet").hidden && ++portsTick % 30 === 0) renderPorts();
    const cv = $("timeline");
    if (!cv || $("sheet").hidden || !music.timeline || ++tlTick % 6) return;
    const rows = ["kick", "bass", "snare", "clap", "hat", "accent", "chord", "lead", "vocal", "fx"];
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
    const colors = ["#ff5a3c", "#9b6bff", "#ffb02e", "#ff8a3d", "#e8e44a", "#ffffff", "#3fb6ff", "#3fd68a", "#ff7ac8", "#bbbbbb"];
    for (const e of music.timeline) {
      const k = rows.indexOf(e.v);
      if (k < 0) continue;
      x.fillStyle = colors[k];
      x.fillRect(lab + (e.t / dur) * (w - lab), rh * k + 2, Math.max(1, DPR), rh - 4);
    }
    const ct = music.el ? musicTime() : 0;
    x.fillStyle = "#ff6a2b";
    x.fillRect(lab + (ct / dur) * (w - lab) - DPR, 0, 2 * DPR, h);
  }

  // ---------- tamanho do palco ----------
  function resize() {
    const rect = stage.getBoundingClientRect();
    // resolução: no máximo 1,5× e ~2 milhões de pixels (no projetor não se nota; no celular pesa muito)
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    const px = rect.width * rect.height * DPR * DPR;
    if (px > 2.0e6) DPR *= Math.sqrt(2.0e6 / px);
    const nw = Math.max(1, Math.round(rect.width * DPR));
    const nh = Math.max(1, Math.round(rect.height * DPR));
    if (nw === W && nh === H) return;
    live.width = W = nw;
    live.height = H = nh;
    if (gl3.ok) window.Cycles3D.resize(W, H);
  }

  // ---------- kick: um círculo simples, 2D, que nasce no centro e abre ----------
  let kickRings = [];
  // ---------- snare/clap: uma linha horizontal que nasce no centro e abre pros lados ----------
  // FORÇA = COMPRIMENTO (contínuo): fraquinha é um risco curto, forte corta a tela inteira.
  let snareLines = [];
  function drawSnareLines(t) {
    const DUR = 0.5;
    snareLines = snareLines.filter((k) => t - k.born < DUR);
    if (snareLines.length > 12) snareLines.splice(0, snareLines.length - 12);
    for (const k of snareLines) {
      const p = (t - k.born) / DUR;
      const e = 1 - Math.pow(1 - p, 3);
      const half = (W / 2) * (0.02 + 0.98 * k.v) * e;
      lctx.beginPath();
      lctx.moveTo(W / 2 - half, H / 2);
      lctx.lineTo(W / 2 + half, H / 2);
      lctx.lineWidth = Math.max(1, 2.5 * DPR * (1 - p * 0.5));
      lctx.strokeStyle = `rgba(255,255,255,${(0.95 * Math.pow(1 - p, 1.6)).toFixed(3)})`;
      lctx.stroke();
    }
  }

  function drawKickRings(t) {
    const DUR = 0.65, md = Math.min(W, H);
    kickRings = kickRings.filter((k) => t - k.born < DUR);
    if (kickRings.length > 12) kickRings.splice(0, kickRings.length - 12);
    for (const k of kickRings) {
      const p = (t - k.born) / DUR;
      const e = 1 - Math.pow(1 - p, 3);                       // nasce rápido, desacelera
      // FORÇA DO KICK = TAMANHO: fraquinho abre ~3% da tela, forte até ~48%.
      // Espessura e brilho são iguais pra qualquer força: só o tamanho fala.
      const rMax = 0.03 + 0.45 * k.v; // linear: cada nuance de força muda o tamanho
      const r = md * (0.01 + rMax * e);
      lctx.beginPath();
      lctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      lctx.lineWidth = Math.max(1, 2.5 * DPR * (1 - p * 0.5));
      lctx.strokeStyle = `rgba(255,255,255,${(0.95 * Math.pow(1 - p, 1.6)).toFixed(3)})`;
      lctx.stroke();
    }
  }

  function clearCanvas() {
    kickRings = [];
    snareLines = [];
    shapes = [];
    if (gl3.ok) window.Cycles3D.clear();
    lctx.clearRect(0, 0, W, H);
  }

  // ---------- salvar imagem ----------
  function saveImage() {
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const o = out.getContext("2d");
    o.fillStyle = "#000";
    o.fillRect(0, 0, W, H);
    o.drawImage(live, 0, 0, W, H); // o círculo do kick fica por cima
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
  // Escuta TODAS as entradas ao mesmo tempo (padrão): o Cycles pode aparecer com
  // outro nome, atrás de uma interface ou de uma porta virtual. Cada porta é aberta
  // explicitamente: no Windows um aparelho MIDI só pode estar aberto em UM programa
  // por vez — se o Ableton estiver com o Cycles, a porta falha e o app avisa.
  let midi = null;
  const clock = { running: false, ticks: 0, step: 0, times: [], bpm: 0 };
  let learning = null;
  const monitorLines = [];
  const ports = new Map(); // id → { input, status: "ok" | "ocupada" | "desligada", last: 0, count: 0 }
  const isWindows = /Windows/i.test(navigator.userAgent);

  async function connectMidi() {
    if (!navigator.requestMIDIAccess) {
      toast("Este navegador não tem MIDI. Use o Chrome ou o Edge no computador (no Safari/iPhone não existe).");
      setPill("st-midi", "Sem MIDI neste navegador", "warn");
      return;
    }
    try {
      midi = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      setPill("st-midi", "MIDI bloqueado", "warn");
      toast("O navegador bloqueou o MIDI. Clique no cadeado ao lado do endereço → MIDI → Permitir, e recarregue.");
      log("acesso ao MIDI negado: " + (err.message || err));
      return;
    }
    midi.onstatechange = () => refreshInputs();
    await refreshInputs(true);
  }

  async function refreshInputs(first) {
    if (!midi) return;
    const inputs = [...midi.inputs.values()];
    const sel = $("sel-input");
    const prev = settings.inputId || "todas";
    sel.innerHTML = '<option value="todas">Todas as entradas (recomendado)</option>' +
      inputs.map((i) => `<option value="${esc(i.id)}">${esc(i.name || "Entrada MIDI")}</option>`).join("");
    sel.value = inputs.some((i) => i.id === prev) ? prev : "todas";
    settings.inputId = sel.value;
    save();
    // fecha o que não é pra escutar, abre o que é
    for (const i of inputs) {
      const want = sel.value === "todas" || sel.value === i.id;
      const p = ports.get(i.id) || { input: i, status: "desligada", last: 0, count: 0 };
      p.input = i;
      ports.set(i.id, p);
      if (!want) { i.onmidimessage = null; p.status = "desligada"; continue; }
      i.onmidimessage = (e) => { p.last = now(); p.count++; if (p.status !== "ok") p.status = "ok"; onMidi(e, i); };
      try {
        await i.open();
        p.status = i.connection === "open" ? "ok" : "ocupada";
      } catch (err) {
        p.status = "ocupada";
        log(`porta "${i.name}" não abriu: ${err.name || ""} ${err.message || err}`);
      }
    }
    for (const id of [...ports.keys()]) if (!inputs.some((i) => i.id === id)) ports.delete(id);
    renderPorts();
    const open = [...ports.values()].filter((p) => p.status === "ok");
    const busy = [...ports.values()].filter((p) => p.status === "ocupada");
    $("btn-midi").textContent = open.length ? "MIDI ✓" : "Conectar MIDI";
    if (!inputs.length) {
      setPill("st-midi", "Nenhum aparelho MIDI", "warn");
      if (first) toast("Nenhuma entrada MIDI. Ligue o Cycles por USB (cabo de dados) e confira o MIDI dele.");
    } else if (!open.length && busy.length) {
      setPill("st-midi", "MIDI ocupado por outro programa", "warn");
      toast(isWindows
        ? "O Cycles está ocupado por outro programa (Ableton?). No Windows só um programa por vez abre o aparelho — veja o ⚙ → Entrada MIDI."
        : "A porta MIDI está ocupada por outro programa. Feche-o ou veja o ⚙ → Entrada MIDI.");
    } else {
      const cyc = open.find((p) => /cycles|elektron/i.test(p.input.name || ""));
      setPill("st-midi", cyc ? "MIDI: " + cyc.input.name : `MIDI: ${open.length} entrada(s)`, "on");
      if (first && !cyc) toast("Escutando todas as entradas MIDI. Dê play no Cycles e veja no ⚙ qual porta recebe.");
    }
  }

  function selectInput(id) {
    settings.inputId = id || "todas";
    save();
    refreshInputs();
  }

  // lista das portas no ⚙, com o estado de cada uma (e se está recebendo agora)
  let portsTick = 0;
  function renderPorts() {
    const box = $("midi-ports");
    if (!box) return;
    if (!midi) { box.innerHTML = `<p class="muted">Toque em <b>Conectar MIDI</b>.</p>`; return; }
    if (!ports.size) { box.innerHTML = `<p class="muted">Nenhuma entrada MIDI encontrada.</p>`; return; }
    const t = now();
    box.innerHTML = [...ports.values()].map((p) => {
      const rec = t - p.last < 1.5;
      const st = p.status === "ocupada" ? `<b class="bad">ocupada por outro programa</b>`
        : p.status === "desligada" ? `<span class="muted">não escutando</span>`
        : rec ? `<b class="good">recebendo ●</b>` : p.count ? `ok · ${p.count} mensagens` : `aberta · esperando`;
      return `<div class="port"><span>${esc(p.input.name || "Entrada MIDI")}</span>${st}</div>`;
    }).join("") + ([...ports.values()].some((p) => p.status === "ocupada") ? `
      <p class="muted">${isWindows
        ? `No Windows, um aparelho MIDI só pode estar aberto em <b>um programa por vez</b>. Pra usar com o Ableton aberto:
           (1) no Ableton, <i>Preferências → Link, Tempo & MIDI</i>, desligue <b>Track/Sync/Remote</b> da entrada do Cycles; ou
           (2) instale o <b>loopMIDI</b> (gratuito), crie uma porta, e no Ableton mande o MIDI do Cycles pra ela (uma faixa MIDI com
           entrada = Cycles, monitor = In, saída = loopMIDI) — o app escuta a porta do loopMIDI. Ou feche o Ableton e recarregue.`
        : `Feche o outro programa que está usando a porta e recarregue a página.`}</p>` : "");
  }

  function onMidi(e, port) {
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
      nextAct(); // pattern novo = ato novo
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
        if (clock.step % 256 === 0) nextAct(); else if (clock.step % 64 === 0) storyShape(); // ato a cada 16 compassos, forma a cada 4
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
    renderPorts();
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
  }

  // ---------- modo palco ----------
  let wakeLock = null, hintT = 0, idleT = 0;
  const SHORTCUTS = "F tela cheia (Esc sai) · X próximo ato · R próxima obra · N nova arte aleatória · M modo · 1–6 trilhas\nC limpar · S salvar imagem · D demo · A áudio · Espaço música · ? atalhos";

  function enterShow() {
    if (show) return;
    show = true;
    closeSheet();
    document.body.classList.add("show");
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    else if (el.webkitRequestFullscreen) try { el.webkitRequestFullscreen(); } catch { /* iPad antigo */ }
    if (navigator.wakeLock) navigator.wakeLock.request("screen").then((l) => (wakeLock = l)).catch(() => {});
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
    const syncEl = $("rng-sync"), syncLbl = $("sync-val");
    const showSync = () => (syncLbl.textContent = (settings.sync > 0 ? "+" : "") + settings.sync + " ms");
    syncEl.value = settings.sync; showSync();
    syncEl.addEventListener("input", () => { settings.sync = +syncEl.value; save(); showSync(); });
    $("sel-motion").value = settings.motion;
    $("sel-motion").addEventListener("change", (e) => { settings.motion = e.target.value; save(); });
    $("chk-panel").checked = settings.showPanel;
    $("chk-panel").addEventListener("change", (e) => { settings.showPanel = e.target.checked; save(); applyPanel(); });
    $("btn-midi").addEventListener("click", connectMidi);
    $("btn-install").addEventListener("click", installApp);
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
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input,select,textarea")) return;
      if (e.key >= "1" && e.key <= "6") spawn(+e.key - 1, tracks[+e.key - 1].lastNote || 60, 100, "pad");
      const k = e.key.toLowerCase();
      if (k === "c") { clearCanvas(); if (show) hint("Limpo", 900); }
      else if (k === "s") saveImage();
      else if (k === "f" || k === "enter") show ? leaveShow() : enterShow();
      else if (k === "m") { setMode(cycle(["vivo", "rastro", "pintura"], settings.mode)); hint("Modo: " + MODE_NAMES[settings.mode], 1200); }
      else if (k === "d") { toggleDemo(); hint(demo.on ? "Demo ligado" : "Demo desligado", 1200); }
      else if (k === "a") toggleAudio();
      else if (k === " " || k === "spacebar") { e.preventDefault(); toggleMusic(); }
      else if (k === "n") newArtRef(false);
      else if (k === "x") nextAct(true);
      else if (k === "r") { if (refs.list.length) nextRef(false); else hint("Sem referência escolhida", 1200); }
      else if (k === "?" || k === "h") hint(SHORTCUTS, 5000);
      else if (k === "escape") { if (show) leaveShow(); else closeSheet(); }
    });
    new ResizeObserver(resize).observe(stage);
  }

  // ---------- versão pra computador: instalar como programa e funcionar sem internet ----------
  let installEvt = null;
  const installed = () => matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || navigator.standalone;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvt = e;
    if (!installed()) $("btn-install").hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    $("btn-install").hidden = true;
    toast("Instalado! Abra o Cycles Visual pelo menu Iniciar / Aplicativos / Dock.");
  });
  async function installApp() {
    if (!installEvt) {
      toast("Use o Chrome ou o Edge no computador: menu ⋮ → Instalar Cycles Visual.");
      return;
    }
    installEvt.prompt();
    const r = await installEvt.userChoice.catch(() => null);
    if (r && r.outcome === "accepted") $("btn-install").hidden = true;
    installEvt = null;
  }
  function offlineStatus(text, ok) {
    const el = $("offline-status");
    el.textContent = text;
    el.classList.toggle("ok", !!ok);
  }
  async function setupOffline() {
    if (!("serviceWorker" in navigator)) return offlineStatus("Este navegador não guarda o app pra usar sem internet.");
    try {
      // versões antigas registravam o ajudante pro site todo; agora é só pro Cycles
      for (const r of await navigator.serviceWorker.getRegistrations()) {
        const w = r.active || r.waiting || r.installing;
        if (w && /sw-cycles\.js/.test(w.scriptURL) && !/cycles\.html$/.test(r.scope)) await r.unregister();
      }
      await navigator.serviceWorker.register("sw-cycles.js", { scope: "./cycles.html" });
      offlineStatus("Guardando o app neste aparelho…");
      const reg = await navigator.serviceWorker.ready;
      navigator.serviceWorker.addEventListener("message", (e) => {
        if (e.data && e.data.type === "status") {
          offlineStatus(e.data.files >= 40 ? `Pronto pra usar sem internet ✓ (${e.data.files} arquivos guardados)` : `Guardando… (${e.data.files} arquivos)`, e.data.files >= 40);
        }
      });
      const ask = () => (navigator.serviceWorker.controller || reg.active) && (navigator.serviceWorker.controller || reg.active).postMessage("status");
      ask(); setTimeout(ask, 4000); setTimeout(ask, 12000);
    } catch (e) {
      offlineStatus("Não deu pra guardar o app (" + (e.message || e) + ").");
    }
  }

  // ---------- início ----------
  bind();
  applyPanel();
  $("ver").textContent = "versão " + APP_VERSION;
  $("gl").hidden = true; // tela zerada: a cena 3D fica desligada
  loadManifest();
  resize();
  setMode(settings.mode);
  renderPads();
  // se o navegador já deu permissão antes, reconecta sozinho
  if (navigator.permissions && navigator.requestMIDIAccess) {
    navigator.permissions.query({ name: "midi" }).then((p) => { if (p.state === "granted") connectMidi(); }).catch(() => {});
  }
  setupOffline();
  requestAnimationFrame(frame);
})();
