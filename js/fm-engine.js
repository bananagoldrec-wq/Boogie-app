/* CYCLES VISUAL — UNIVERSAL FM VISUAL ENGINE 2.0
   Um motor só, compartilhado por todas as cenas (window.CyclesFM):
   - estado das 6 pistas do Model:Cycles (máquina, parâmetros, mute, nota, LFO);
   - MIDI: os números de CC são os OFICIAIS (manual Model:Cycles OS 1.13, Apêndice A);
   - interpolação suave dos parâmetros (5 estados de referência 0/32/64/96/127);
   - LFO visual por pista (7 formas de onda do manual, speed × multiplier, fade, start
     phase, reset, depth, destino de som ou destino visual) — roda sempre, entre os disparos;
   - delay e reverb visuais (réplicas em perspectiva, expansão espacial);
   - perfis de mapeamento por cena (o que cada knob faz em cada obra);
   - presets de comportamento visual.
   As cenas leem daqui (params por pista/máquina) e recebem os eventos já com contexto.
   Nada aqui inventa mensagem MIDI: o que o Cycles não transmite é dito em LIMITS.          */
(function (root) {
  "use strict";
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const now = () => performance.now() / 1000;

  // ---------- máquinas FM (qualquer pista pode usar qualquer máquina) ----------
  const MACHINES = ["KICK", "SNARE", "METAL", "PERC", "TONE", "CHORD"];
  // tipo de evento visual de cada máquina (as cenas já conhecem kick/snare/hat/bass/chord; perc é novo)
  const ROLE = ["kick", "snare", "hat", "perc", "bass", "chord"];
  const MACHINE_OF_ROLE = { kick: 0, snare: 1, hat: 2, perc: 3, bass: 4, chord: 5 };

  // ---------- CCs oficiais (Model:Cycles OS 1.13 — Apêndice A) ----------
  const TRACK_CC = {
    3: "note", 94: "mute", 95: "level", 10: "pan", 65: "pitch", 80: "decay",
    16: "color", 17: "shape", 18: "sweep", 19: "contour", 12: "delaySend", 13: "reverbSend",
    7: "volDist", 15: "swing", 14: "chance", 70: "machine", // A.1 TRACK
    66: "punch", 67: "gate",                                 // A.2 PLAYBACK
    102: "lfoSpeed", 103: "lfoMult", 104: "lfoFade", 105: "lfoDest", 106: "lfoWave",
    107: "lfoPhase", 108: "lfoReset", 109: "lfoDepth", 110: "lfoDepthLSB", // A.3 LFO
  };
  const FX_CC = { 85: "delayTime", 86: "delayFeedback", 87: "reverbSize", 88: "reverbTone" }; // A.4 FX
  // discretos (sem interpolação)
  const DISCRETE = new Set(["machine", "mute", "punch", "gate", "lfoDest", "lfoWave", "lfoReset", "lfoMult", "note"]);
  // destinos do LFO (Apêndice B) — índice pelo valor do CC 105 (o manual não publica a tabela de valores)
  const LFO_DEST = ["pitch", "fineTune", "decay", "color", "shape", "sweep", "contour", "delaySend", "reverbSend", "volDist", "pan", "punch", "gate"];
  // formas de onda (10.6.1): Triangle, Sine, Square, Sawtooth, Envelope, Ramp, Random
  const LFO_WAVES = ["TRI", "SIN", "SQR", "SAW", "ENV", "RMP", "RND"];
  // multiplicadores (10.6.2): ×1…×2K presos ao andamento; os mesmos "livres" (120 BPM fixo)
  const MULTS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
  // destinos visuais extras do LFO (escolhidos no painel): o que cada cena faz com eles é dela
  const VIS_DEST = ["som", "posição", "rotação", "escala", "geometria", "perspectiva", "cor", "gravidade", "magnetismo", "articulação", "fragmentação"];

  // valores iniciais (0–127, como chegam no MIDI); 0 nos 4 da máquina = "estado original"
  const DEFAULT = {
    note: 60, mute: 0, level: 100, pan: 64, pitch: 64, decay: 64, color: 0, shape: 0, sweep: 0, contour: 0,
    delaySend: 0, reverbSend: 0, volDist: 60, swing: 0, chance: 127, machine: 0, punch: 0, gate: 0,
    lfoSpeed: 64, lfoMult: 0, lfoFade: 64, lfoDest: 3, lfoWave: 0, lfoPhase: 0, lfoReset: 0, lfoDepth: 64, lfoDepthLSB: 0,
  };
  const FX_DEFAULT = { delayTime: 32, delayFeedback: 40, reverbSize: 64, reverbTone: 64 };

  // ---------- perfis de mapeamento por cena (o que aparece no painel) ----------
  const PROFILES = {
    2: { name: "Endless Climb", color: "identidade arquitetônica e cromática", shape: "geometria, inclinação e configuração das escadas", sweep: "trajetória, perspectiva e deslocamento", contour: "articulação do corpo, elasticidade e impacto dos passos", dist: "deformação e ruptura das escadas (penhascos)", decay: "tempo de existência dos degraus", pitch: "altura do degrau / escala", pan: "posição lateral", level: "presença da pista", punch: "força do impacto", gate: "sustentação da forma" },
    3: { name: "Bauhaus Orbital · Attraction & Repulsion", color: "famílias geométricas das partículas", shape: "esfera → cubo → disco → poliedro → símbolo", sweep: "inclinação, excentricidade e trajetória das órbitas", contour: "elasticidade das forças magnéticas", dist: "ruptura das órbitas e deformação", decay: "duração das partículas", pitch: "raio da órbita / escala", pan: "região do espaço", level: "presença da pista", punch: "força do impacto", gate: "sustentação" },
    4: { name: "Infinite Microcosmos", color: "diversidade de objetos e paletas", shape: "geometria → animais → pessoas → objetos → símbolos", sweep: "direção e trajetória dos objetos", contour: "fluidez das transformações", dist: "torção, fragmentação e deformação do espaço", decay: "tempo de vida das microestruturas", pitch: "profundidade / escala", pan: "posição lateral", level: "presença da pista", punch: "força do impacto", gate: "sustentação" },
    5: { name: "Impossible City", color: "famílias arquitetônicas e materiais cromáticos", shape: "edifício → ponte → escada → torre → portal", sweep: "deslocamento, expansão e reorganização", contour: "elasticidade e articulação das construções", dist: "rachaduras, colapsos e geometrias impossíveis", decay: "duração antes da desconstrução", pitch: "altura das construções", pan: "lado da avenida", level: "presença da pista", punch: "força do impacto", gate: "sustentação" },
    6: { name: "Magnetic Ballet", color: "identidade das peças", shape: "esfera → cubo → cilindro → escultura", sweep: "trajetória e direção das forças", contour: "elasticidade, tensão e conexões", dist: "assimetria, fragmentação e ruptura dos grupos", decay: "duração das conexões e partículas", pitch: "altura / escala", pan: "região do espaço", level: "presença da pista", punch: "força do impacto", gate: "sustentação" },
  };
  // o que o MIDI do Model:Cycles transmite e o que não (manual OS 1.13: 9.4.2 MOUT, 12.3)
  const LIMITS = [
    "Notas: com MOUT ligado, cada pista manda só NOTA, VELOCITY e TRIG LENGTH (note off). Parameter locks NÃO são transmitidos.",
    "Knobs de parâmetro e de FX mandam CC só quando girados, com MOUT ligado e MIDI > FILTER > ENCS = I+E.",
    "Mute manda MIDI (CC 94). Troca de pattern manda Program Change só com PCH OUT ligado. Clock e transporte só com CLK OUT.",
    "Retrig, micro timing, swing, chance, trig conditions e FILL chegam só como o RESULTADO nas notas (quando e se a nota sai); a condição em si não é transmitida.",
    "Control All e Parameter Revert: o manual não diz se mandam CC; o app reage ao CC que chegar.",
    "Valores do CC 70 (máquina), 103 (multiplicador) e 105 (destino do LFO): o manual lista os nomes mas não a tabela de valores; o app usa a ordem do manual.",
  ];

  // ---------- estado ----------
  const T = Array.from({ length: 6 }, (_, i) => newTrack(i));
  function newTrack(i) {
    const raw = { ...DEFAULT, machine: i };
    const tgt = {}, cur = {};
    for (const k in raw) { tgt[k] = raw[k]; cur[k] = raw[k]; }
    return {
      i, raw, tgt, cur, machineSrc: "padrão",
      lastNote: null, lastVel: 0, noteOnT: -9, noteOffT: -9, gateOpen: false, length: null,
      events: 0, lastCC: null, lastCCT: -9, ccSeen: 0,
      lfo: { phase: 0, t0: 0, trigT: -9, value: 0, out: 0, rnd: 0, lastCycle: 0, vis: 0, visDest: 0 },
    };
  }
  const FX = { ...FX_DEFAULT };
  let bpm = 120, bpmT = -9, scene = 0;
  const listeners = new Set();       // quem recebe os eventos (a cena aberta)
  const pending = [];                // réplicas de delay/reverb agendadas
  let lastFrame = now();
  const stats = { midiIn: 0, ccIn: 0, notesIn: 0, events: 0, replicas: 0, dropped: 0 };

  // ---------- normalização (0–127 → valores que as cenas usam) ----------
  const n01 = (v) => clamp(v / 127, 0, 1);
  const bip = (v) => clamp((v - 64) / 63.5, -1, 1);
  // 5 estados de referência (0, 32, 64, 96, 127) com interpolação entre eles
  function anchors(v01, states) {
    const x = clamp(v01, 0, 1) * 4, i = Math.min(3, Math.floor(x)), k = x - i;
    const a = states[i], b = states[i + 1];
    if (typeof a === "number") return a + (b - a) * k;
    return a.map((q, j) => q + (b[j] - q) * k);
  }
  // índice discreto (0–4) de um parâmetro, para quando a cena precisa de estados separados
  const step5 = (v01) => clamp(Math.round(clamp(v01, 0, 1) * 4), 0, 4);

  // ---------- MIDI ----------
  function cc(tr, num, val) {
    stats.midiIn++; stats.ccIn++;
    if (FX_CC[num]) { FX[FX_CC[num]] = val; return true; }
    const key = TRACK_CC[num];
    if (!key || tr < 0 || tr > 5) return false;
    const t = T[tr];
    t.lastCC = { num, key, val }; t.lastCCT = now(); t.ccSeen++;
    if (key === "machine") { setMachine(tr, val <= 5 ? val : Math.min(5, Math.floor(val / (128 / 6))), "MIDI"); return true; }
    if (key === "mute") { t.raw.mute = t.tgt.mute = t.cur.mute = val >= 64 ? 1 : 0; return true; }
    t.raw[key] = val;
    t.tgt[key] = val;
    if (DISCRETE.has(key)) t.cur[key] = val;
    return true;
  }
  function setParam(tr, key, val) { // teste manual / presets: o mesmo caminho do MIDI
    if (key in FX) { FX[key] = clamp(val, 0, 127); return; }
    const t = T[tr]; if (!t || !(key in t.raw)) return;
    if (key === "machine") return setMachine(tr, val, "manual");
    t.raw[key] = val; t.tgt[key] = val; if (DISCRETE.has(key)) t.cur[key] = val;
  }
  function setMachine(tr, m, src) {
    const t = T[tr]; if (!t) return;
    m = clamp(m | 0, 0, 5);
    t.raw.machine = t.tgt.machine = t.cur.machine = m; t.machineSrc = src;
    emitMeta({ kind: "machine", track: tr, machine: m });
  }
  // nota: a velocity, a pista e o tempo (o resto vem do estado da pista)
  function noteOn(tr, note, vel, src = "midi") {
    stats.midiIn++; stats.notesIn++;
    const t = T[tr]; if (!t) return null;
    const tm = now();
    t.lastNote = note; t.lastVel = vel; t.noteOnT = tm; t.gateOpen = true; t.length = null; t.events++;
    // LFO: reinicia no disparo com RESET ligado, e sempre na forma ENVELOPE (10.6.1)
    const L = t.lfo;
    if (t.raw.lfoReset >= 64 || LFO_WAVES[clamp(t.raw.lfoWave | 0, 0, 6)] === "ENV") { L.phase = n01(t.raw.lfoPhase); L.lastCycle = 0; }
    L.trigT = tm; // (o FADE conta a partir do disparo)
    if (t.raw.mute) { stats.dropped++; return null; } // pista muda: nada novo acontece (o que já existe termina)
    return emitHit(tr, vel / 127, 0, src);
  }
  function noteOff(tr) { const t = T[tr]; if (!t || !t.gateOpen) return; t.gateOpen = false; t.noteOffT = now(); t.length = t.noteOffT - t.noteOnT; }
  function setBpm(b) { if (b > 30 && b < 300) { bpm = b; bpmT = now(); } }
  const beat = () => 60 / bpm;

  // contexto de um evento: tudo o que a cena precisa pra reagir (já com LFO aplicado)
  function context(tr, v, replica) {
    const t = T[tr], P = params(tr);
    const role = ROLE[t.raw.machine];
    return {
      track: tr, machine: t.raw.machine, machineName: MACHINES[t.raw.machine], role, v, note: t.lastNote,
      color: P.color, shape: P.shape, sweep: P.sweep, contour: P.contour, decay: P.decay, pitch: P.pitch, pan: P.pan,
      level: P.level, dist: P.dist, volume: P.volume, punch: P.punch, gate: P.gate, swing: P.swing, chance: P.chance,
      delay: P.delaySend, reverb: P.reverbSend, space: P.reverbSend * n01(FX.reverbSize), vis: P.vis,
      replica, depth: replica ? Math.min(1, replica * 0.22) : 0, length: t.length,
    };
  }
  function emitHit(tr, v01, replica, src) {
    const t = T[tr];
    const P = params(tr);
    // presença da pista (track level) e velocity: a intensidade do acontecimento
    const v = clamp(v01 * (0.35 + 0.65 * P.level) * (P.punch ? 1.15 : 1), 0, 1);
    const ctx = context(tr, v, replica);
    ctx.src = src;
    stats.events++;
    for (const fn of listeners) { try { fn(ctx); } catch (e) { console.error(e); } }
    if (!replica) scheduleEchoes(tr, v, src);
    return ctx;
  }
  // DELAY: réplicas no tempo (DELAY TIME em 128 avos do compasso, FEEDBACK = quantas e quão fortes)
  // REVERB: réplicas que se afastam pro fundo (expansão do espaço), espalhadas no tamanho da sala
  function scheduleEchoes(tr, v, src) {
    const t = T[tr], P = params(tr), tm = now();
    const whole = 4 * beat();
    if (P.delaySend > 0.02) {
      const dt = clamp((FX.delayTime / 128) * whole, 0.03, 2), fb = n01(FX.delayFeedback);
      const n = clamp(1 + Math.round(fb * 6), 1, 7);
      let g = v * P.delaySend;
      for (let k = 1; k <= n && g > 0.04; k++) {
        const swingOff = k % 2 ? P.swing * dt * 0.33 : 0; // swing visual: as réplicas ímpares atrasam
        // CHANCE visual: o Cycles já decide se a NOTA sai; aqui ela decide se cada RÉPLICA sai
        if (P.chance >= 0.999 || Math.random() < P.chance) pending.push({ at: tm + k * dt + swingOff, tr, v: g, replica: k, kind: "delay", src });
        g *= 0.35 + 0.6 * fb;
      }
    }
    if (P.reverbSend > 0.02) {
      const size = n01(FX.reverbSize), n = 2 + Math.round(size * 3);
      for (let k = 1; k <= n; k++) if (P.chance >= 0.999 || Math.random() < P.chance) pending.push({ at: tm + k * (0.05 + size * 0.18), tr, v: v * P.reverbSend * (1 - k / (n + 1)) * 0.7, replica: k + 1, kind: "reverb", src });
    }
    if (pending.length > 400) pending.splice(0, pending.length - 400); // nunca acumula
  }
  const metaListeners = new Set();
  function emitMeta(m) { for (const fn of metaListeners) { try { fn(m); } catch (e) { console.error(e); } } }
  function program(n) { stats.midiIn++; emitMeta({ kind: "program", program: n }); }

  // ---------- quadro: interpolação, LFO, réplicas agendadas ----------
  function tick() {
    const tm = now(), dt = clamp(tm - lastFrame, 0, 0.1); lastFrame = tm;
    const k = 1 - Math.exp(-dt / 0.07); // ~70 ms pra chegar no valor novo: suave, mas rápido
    for (const t of T) {
      for (const key in t.tgt) if (!DISCRETE.has(key)) t.cur[key] += (t.tgt[key] - t.cur[key]) * k;
      lfoTick(t, tm, dt);
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      const e = pending[i];
      if (e.at > tm) continue;
      pending.splice(i, 1);
      if (T[e.tr].raw.mute) continue;
      stats.replicas++;
      const ctx = emitHitReplica(e);
      if (ctx) ctx.echo = e.kind;
    }
  }
  function emitHitReplica(e) {
    const ctx = context(e.tr, e.v, e.replica);
    ctx.src = e.src; ctx.echo = e.kind;
    if (e.kind === "reverb") ctx.depth = Math.min(1, 0.25 + e.replica * 0.18); // some no ponto de fuga
    for (const fn of listeners) { try { fn(ctx); } catch (err) { console.error(err); } }
    return ctx;
  }
  function lfoTick(t, tm, dt) {
    const L = t.lfo, R = t.raw;
    const speed = R.lfoSpeed - 64;                                   // −64…63 (10.3.6)
    const mi = clamp(R.lfoMult | 0, 0, 23), mult = MULTS[mi % 12], free = mi >= 12;
    const tempo = free ? 120 : bpm;
    // tabela 10.6: ciclo (em semibreves) = 128 / (SPEED × MUL)
    const cyc = Math.abs(speed) > 0.01 ? (128 / (Math.abs(speed) * mult)) * (240 / tempo) : Infinity;
    const wave = LFO_WAVES[clamp(R.lfoWave | 0, 0, 6)];
    if (wave === "ENV") {
      const a = tm - L.trigT;
      L.phase = cyc === Infinity ? 1 : Math.min(1, a / cyc);
    } else if (cyc !== Infinity) {
      const prev = L.phase;
      L.phase = (((L.phase + (Math.sign(speed) * dt) / cyc) % 1) + 1) % 1;
      if ((speed > 0 && L.phase < prev) || (speed < 0 && L.phase > prev)) L.rnd = Math.random() * 2 - 1; // RND: valor novo a cada ciclo
    }
    const p = L.phase; // (ENVELOPE chega em 1 e para: um disparo só)
    let w;
    switch (wave) {
      case "TRI": w = p < 0.5 ? p * 4 - 1 : 3 - p * 4; break;
      case "SIN": w = Math.sin(p * Math.PI * 2); break;
      case "SQR": w = p < 0.5 ? 1 : -1; break;
      case "SAW": w = 1 - p * 2; break;                  // desce
      case "ENV": w = L.trigT < 0 || p >= 1 ? 0 : Math.exp(-4 * p); break; // um disparo, queda exponencial
      case "RMP": w = p * 2 - 1; break;                  // sobe
      default: w = L.rnd;                                // RND: amostra e segura
    }
    // FADE (10.7.2): positivo = some depois do disparo; negativo = aparece aos poucos
    const fade = R.lfoFade - 64, since = tm - L.trigT;
    let fk = 1;
    if (Math.abs(fade) > 0.5 && L.trigT > 0) {
      const tau = (Math.abs(fade) / 16) * (cyc === Infinity ? 1 : Math.min(cyc, 8));
      fk = fade > 0 ? Math.exp(-since / Math.max(0.05, tau)) : 1 - Math.exp(-since / Math.max(0.05, tau));
    }
    const depth = clamp((R.lfoDepth - 64 + R.lfoDepthLSB / 128) / 64, -1, 1); // −64…63 (10.6.4)
    L.value = w; L.out = w * depth * fk;
  }

  // parâmetros da pista prontos pra cena: 0–1 (ou −1…1), já com o LFO somado no destino
  const VIS_KEYS = ["pos", "rot", "scale", "geom", "persp", "hue", "gravity", "magnet", "artic", "frag"];
  function params(tr) {
    const t = T[tr]; if (!t) return null;
    const c = t.cur, L = t.lfo;
    const dest = LFO_DEST[clamp(t.raw.lfoDest | 0, 0, LFO_DEST.length - 1)];
    const mod = (key, base, scale = 1) => (L.visDest === 0 && dest === key ? base + L.out * scale : base);
    const P = {
      machine: t.raw.machine, role: ROLE[t.raw.machine],
      color: clamp(mod("color", n01(c.color)), 0, 1), shape: clamp(mod("shape", n01(c.shape)), 0, 1),
      sweep: clamp(mod("sweep", n01(c.sweep)), 0, 1), contour: clamp(mod("contour", n01(c.contour)), 0, 1),
      decay: clamp(mod("decay", n01(c.decay)), 0, 1), pitch: clamp(mod("pitch", bip(c.pitch), 2), -1, 1),
      pan: clamp(mod("pan", bip(c.pan), 2), -1, 1), level: n01(c.level),
      // VOLUME + DIST (10.3.7): até 60 é volume; acima disso, distorção
      volume: clamp(mod("volDist", n01(c.volDist)), 0, 1) / (60 / 127),
      dist: clamp((mod("volDist", n01(c.volDist)) * 127 - 60) / 67, 0, 1),
      delaySend: clamp(mod("delaySend", n01(c.delaySend)), 0, 1), reverbSend: clamp(mod("reverbSend", n01(c.reverbSend)), 0, 1),
      punch: c.punch >= 64 || (dest === "punch" && L.out > 0.5) ? 1 : 0, gate: c.gate >= 64 ? 1 : 0,
      swing: n01(c.swing), chance: n01(c.chance), mute: t.raw.mute,
      lfo: L.out, lfoWave: LFO_WAVES[clamp(t.raw.lfoWave | 0, 0, 6)], lfoDest: dest,
      vis: {},
    };
    P.volume = Math.min(1, P.volume);
    for (let i = 0; i < VIS_KEYS.length; i++) P.vis[VIS_KEYS[i]] = L.visDest === i + 1 ? L.out : 0;
    return P;
  }
  // a pista que está fazendo um papel (a mais recente com aquela máquina)
  function trackOfRole(role) {
    const m = MACHINE_OF_ROLE[role];
    let best = -1, bt = -1e9;
    for (const t of T) if (t.raw.machine === m && t.noteOnT > bt) { bt = t.noteOnT; best = t.i; }
    if (best < 0) for (const t of T) if (t.raw.machine === m) return t.i;
    return best;
  }
  function role(roleName) { const tr = trackOfRole(roleName); return tr >= 0 ? params(tr) : null; }
  // evento que não veio de uma nota MIDI (ouvido de áudio, música analisada): usa os knobs da pista
  // que tem a máquina daquele papel (ou neutros, se nenhuma pista tem)
  function contextForRole(roleName, v, src) {
    const tr = trackOfRole(roleName);
    const ctx = tr >= 0 ? context(tr, v, 0) : { ...NEUTRAL, track: -1, machine: MACHINE_OF_ROLE[roleName] ?? 0, machineName: MACHINES[MACHINE_OF_ROLE[roleName] ?? 0], role: roleName, v, replica: 0, depth: 0, space: 0, delay: 0, reverb: 0, length: null };
    ctx.role = roleName; ctx.src = src;
    return ctx;
  }
  const NEUTRAL = { color: 0, shape: 0, sweep: 0, contour: 0, decay: 0.5, pitch: 0, pan: 0, level: 0.8, volume: 0.9, dist: 0, delaySend: 0, reverbSend: 0, punch: 0, gate: 0, swing: 0, chance: 1, lfo: 0, vis: { pos: 0, rot: 0, scale: 0, geom: 0, persp: 0, hue: 0, gravity: 0, magnet: 0, artic: 0, frag: 0 } };
  const roleOr = (r) => role(r) || NEUTRAL;
  // soma dos LFOs com destino VISUAL de todas as pistas (posição, rotação, escala, geometria…)
  const VIS0 = { pos: 0, rot: 0, scale: 0, geom: 0, persp: 0, hue: 0, gravity: 0, magnet: 0, artic: 0, frag: 0 };
  const visOut = { ...VIS0 };
  function visAll() {
    for (const k in visOut) visOut[k] = 0;
    for (const t of T) if (t.lfo.visDest > 0) { const k = VIS_KEYS[t.lfo.visDest - 1]; visOut[k] = clamp(visOut[k] + t.lfo.out, -1, 1); }
    return visOut;
  }

  // ---------- presets ----------
  const PKEY = "cycles-fm-presets";
  function snapshot() { return { tracks: T.map((t) => ({ raw: { ...t.raw }, visDest: t.lfo.visDest })), fx: { ...FX } }; }
  function restore(s) {
    if (!s || !Array.isArray(s.tracks)) return false;
    s.tracks.slice(0, 6).forEach((p, i) => {
      for (const k in p.raw) if (k in T[i].raw && Number.isFinite(+p.raw[k])) setParam(i, k, +p.raw[k]);
      T[i].lfo.visDest = clamp(p.visDest | 0, 0, VIS_DEST.length - 1);
    });
    if (s.fx) for (const k in s.fx) if (k in FX && Number.isFinite(+s.fx[k])) FX[k] = clamp(+s.fx[k], 0, 127);
    return true;
  }
  function presets() { try { return JSON.parse(localStorage.getItem(PKEY) || "{}") || {}; } catch { return {}; } }
  function savePreset(name) { const all = presets(); all[name] = snapshot(); try { localStorage.setItem(PKEY, JSON.stringify(all)); } catch { return false; } return true; }
  function loadPreset(name) { return restore(presets()[name]); }
  function deletePreset(name) { const all = presets(); delete all[name]; try { localStorage.setItem(PKEY, JSON.stringify(all)); } catch { /* idem */ } }
  function resetAll() { T.forEach((t, i) => { const fresh = newTrack(i); fresh.raw.machine = t.raw.machine; for (const k in fresh.raw) setParam(i, k, fresh.raw[k]); t.lfo.visDest = 0; }); Object.assign(FX, FX_DEFAULT); }

  root.CyclesFM = {
    MACHINES, ROLE, MACHINE_OF_ROLE, TRACK_CC, FX_CC, LFO_DEST, LFO_WAVES, MULTS, VIS_DEST, PROFILES, LIMITS, DEFAULT,
    tracks: T, fx: FX, stats,
    cc, noteOn, noteOff, setParam, setMachine, program, setBpm, tick,
    params, role: roleOr, trackOfRole, contextForRole, visAll, anchors, step5, n01, bip, NEUTRAL,
    onHit: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    onMeta: (fn) => { metaListeners.add(fn); return () => metaListeners.delete(fn); },
    setScene: (n) => { scene = n; }, scene: () => scene, bpm: () => bpm,
    setVisDest: (tr, i) => { if (T[tr]) T[tr].lfo.visDest = clamp(i | 0, 0, VIS_DEST.length - 1); },
    snapshot, restore, presets, savePreset, loadPreset, deletePreset, resetAll,
    pendingCount: () => pending.length,
  };
})(typeof window !== "undefined" ? window : globalThis);
