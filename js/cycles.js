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
  const MACHINES = ["KICK", "SNARE", "METAL", "PERC", "TONE", "CHORD"];
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
    },
    load()
  );
  settings.cc = Object.assign({ ...DEFAULT_CC }, settings.cc);

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
  const pal = () => PALETTES[settings.palette] || PALETTES.espectro;
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

  async function toggleAudio() {
    if (audio.on) {
      audio.stream.getTracks().forEach((t) => t.stop());
      audio.ctx.close();
      audio.on = false;
      $("bands").hidden = true;
      setPill("st-audio", "Áudio desligado", "");
      $("btn-audio").classList.remove("on");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0.5;
      src.connect(an);
      Object.assign(audio, {
        on: true, ctx, an, stream,
        td: new Float32Array(an.fftSize), fd: new Float32Array(an.frequencyBinCount),
      });
      $("bands").hidden = false;
      setPill("st-audio", "Áudio ligado", "on");
      $("btn-audio").classList.add("on");
      toast("Áudio ligado: ligue a saída do Cycles na entrada de linha (ou deixe o microfone ouvir).");
    } catch (err) {
      toast("Não deu pra abrir o áudio: " + (err.message || err));
    }
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
    const b = [0, 0, 0];
    for (let i = 1; i < fd.length; i++) {
      const hz = i * binHz;
      if (hz < 25 || hz > 12000) continue;
      const p = Math.pow(10, fd[i] / 10);
      total += p;
      if (p > peak) { peak = p; peakI = i; }
      b[hz < 250 ? 0 : hz < 2000 ? 1 : 2] += p;
    }
    audio.hz = peakI * binHz;
    audio.tonal = total ? peak / total : 0;
    const max = Math.max(b[0], b[1], b[2], 1e-12);
    audio.bands = b.map((v) => v / max);

    // batidas pelo áudio, quando não chega MIDI
    const t = now();
    if (settings.onset && t - lastMidiNote > 3 && t - audio.lastOnset > 0.09 &&
        rms > 0.02 && rms > audio.slow * 1.8) {
      audio.lastOnset = t;
      const top = audio.bands.indexOf(1);
      let tr = top === 0 ? 0 : top === 2 ? 2 : (audio.hz < 900 ? 3 : 1);
      if (audio.tonal > 0.12 && top !== 0) tr = 4;
      spawn(tr, null, clamp(Math.round(rms * 380), 20, 127), "audio");
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

  function spawn(trIndex, note, vel, source = "midi") {
    const tr = tracks[trIndex];
    const t = now();
    if (note == null) note = audio.on && audio.hz ? 69 + 12 * Math.log2(audio.hz / 440) : 60;
    tr.lastVel = vel;
    tr.lastNote = note;

    const effNote = note + (tr.pitch - 64) / 2.5;
    let hz = noteHz(effNote);
    if (audio.on && audio.rms > 0.01 && audio.hz) hz = audio.hz;
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
      seed: (Math.random() * 1e9) | 0,
      stamped: false,
    });
    if (shapes.length > 600) shapes.splice(0, shapes.length - 600);
    flashPad(trIndex, vel);
    $("empty").hidden = true;
  }

  // posição normalizada (0..1) conforme a composição escolhida
  function place(i, tr, ft) {
    const aspect = W / H || 1;
    switch (settings.layout) {
      case "faixas":
        return { x: (i + 0.5) / 6 + gauss() * 0.03, y: 0.92 - ft * 0.84 + gauss() * 0.06 };
      case "radial": {
        const ang = (i / 6) * Math.PI * 2 - Math.PI / 2 + gauss() * 0.3;
        const rad = 0.05 + ft * 0.4 + gauss() * 0.03;
        const sx = aspect > 1 ? 1 / aspect : 1, sy = aspect > 1 ? 1 : aspect;
        return { x: 0.5 + Math.cos(ang) * rad * sx, y: 0.5 + Math.sin(ang) * rad * sy };
      }
      case "grade": {
        const col = (clock.running ? clock.step : gridStep[i]++) % 16;
        const cellPx = Math.min(W / 16, H / 6) * 0.48;
        return { x: (col + 0.5) / 16, y: (i + 0.5) / 6, cell: cellPx / Math.min(W, H) };
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
    if (pal().dark && s.reverb > 0.05) {
      ctx.shadowColor = hsla(c, Math.min(1, a * 1.2), 10);
      ctx.shadowBlur = s.reverb * R * 0.9 * DPR;
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

  // ---------- renderização ----------
  function fillBg(ctx, alpha = 1) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pal().bg;
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

  let lastDomText = "";
  function frame() {
    const t = now();
    analyseAudio();
    drawBands();
    tickDemo(t);

    shapes = shapes.filter((s) => t - s.born < s.life || (settings.mode === "pintura" && !s.stamped));

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
    if (settings.mode === "vivo") {
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
    if (dom && domE > 0.02) drawAura(lctx, dom, clamp(1 - (t - dom.born) / dom.life, 0, 1));

    // HUD
    const txt = dom && domE > 0.02
      ? `T${dom.tr + 1} ${MACHINES[dom.m]} · vel ${dom.vel} · ${dom.hz < 1000 ? Math.round(dom.hz) + " Hz" : (dom.hz / 1000).toFixed(1) + " kHz"} (${noteName(69 + 12 * Math.log2(dom.hz / 440))})`
      : "—";
    if (txt !== lastDomText) { $("hud-dom").textContent = txt; lastDomText = txt; }
    updatePads(dom);

    requestAnimationFrame(frame);
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
    gridStep = [0, 0, 0, 0, 0, 0];
    fillBg(pctx);
    lctx.clearRect(0, 0, W, H);
  }

  // ---------- salvar imagem ----------
  function saveImage() {
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const o = out.getContext("2d");
    o.drawImage(paint, 0, 0);
    if (settings.mode === "vivo") renderShapes(o, shapes, now());
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
      if (clock.ticks % 6 === 0) clock.step++;
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
      demo.next += 0.125;
    }
  }

  // ---------- pads ----------
  function renderPads() {
    const box = $("pads");
    if (!box.children.length) {
      box.innerHTML = tracks.map((_, i) =>
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
    $("chan-grid").innerHTML = tracks.map((_, i) =>
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

  function bind() {
    $("btn-midi").addEventListener("click", connectMidi);
    $("btn-audio").addEventListener("click", toggleAudio);
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
    const lay = $("sel-layout"), palSel = $("sel-palette");
    lay.value = settings.layout; palSel.value = settings.palette;
    lay.addEventListener("change", () => { settings.layout = lay.value; gridStep = [0, 0, 0, 0, 0, 0]; save(); });
    palSel.addEventListener("change", () => {
      settings.palette = palSel.value; save();
      shapes.forEach((s) => (s.color = pal().color(s.ft, tracks[s.tr], s.sat)));
      fillBg(pctx);
    });
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input,select,textarea")) return;
      if (e.key >= "1" && e.key <= "6") spawn(+e.key - 1, tracks[+e.key - 1].lastNote || 60, 100, "pad");
      else if (e.key === "c") clearCanvas();
      else if (e.key === "s") saveImage();
      else if (e.key === "Escape") closeSheet();
    });
    new ResizeObserver(resize).observe(stage);
  }

  // ---------- início ----------
  bind();
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
