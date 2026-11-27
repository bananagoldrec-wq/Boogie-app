/* PROJETO 2 — OUVIDO: decide, quadro a quadro, o que é KICK, BAIXO, HI-HAT, CAIXA e CHORD.
   Recebe a energia (dB) de 5 faixas filtradas, medida no cycles.js a cada quadro:
     sub (<90 Hz) · low (90–260 Hz) · harm (300–1000 Hz) · mid (1–5 kHz) · hi (>7 kHz)
   mais o tempo do Cycles (clock MIDI), quando chega. Aqui dentro não há DOM nem áudio:
   dá pra testar fora do navegador com os quadros gravados (mesmo código, mesmo resultado).
   Uso: const o = CyclesOuvido.create(); const evs = o.step(quadro);  // [{ type, v }]          */
(function (root) {
  "use strict";
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const KEYS = ["sub", "low", "harm", "mid", "hi"];
  const DEC = 0.045; // quando o som diz se a batida grave era kick (s depois do início)
  const CHD = 0.06;  // quando o som diz se era acorde

  function create() {
    const band = () => ({ now: null, h: [], hl: [], ref: -140, last: -9, rise: 0, rise1: 0, over: 0 });
    const E = { t: null };
    function reset() {
      for (const k of KEYS) E[k] = band();
      Object.assign(E, { t: null, bass: null, hat: null, snare: null, chord: null, kickT: -9, kickOn: -9, kickishT: -9, bassOn: -9, kickHold: -9, lowOn: -9, lowRise: 0, lowEv: null, votes: [], lows: [], kickPh: null });
    }
    reset();

    // f = { t, lv: { sub, low, harm, mid, hi } (dB),
    //       flat(): planura do espectro de 1 a 5 kHz (1 = ruído) · tonal(): planura de 250 Hz a 2 kHz (perto de 0 = tom),
    //       clock: { P (s por tempo), qT (hora de um tempo), synced (veio o play) } | null }
    function step(f) {
      const t = f.t, out = [];
      const emit = (type, v) => out.push({ type, v });
      const gap = E.t == null || t - E.t > 0.25; // voltou de uma pausa: reaprende antes de detectar
      const dt = gap ? 0 : clamp(t - E.t, 0, 0.1);
      E.t = t;
      for (const k of KEYS) {
        const B = E[k];
        if (gap) { B.h = []; B.hl = []; B.now = null; }
        if (B.now != null) { B.h.push(B.now); B.hl.push((k === "sub" || k === "low") && t < E.kickHold ? -140 : B.now); }
        if (B.h.length > 3) B.h.shift();
        if (B.hl.length > 7) B.hl.shift();
        B.now = f.lv[k];
        B.ref = Math.max(B.now, B.ref - 1.5 * dt);
        B.rise = B.h.length ? B.now - Math.min(...B.h) : 0;
        B.rise1 = B.h.length ? B.now - B.h[B.h.length - 1] : 0;
        B.over = B.hl.length ? B.now - Math.max(...B.hl) : 0;
      }
      const S = E.sub, L = E.low, Hm = E.harm, M = E.mid, Hi = E.hi;
      const FLOOR = -85; // abaixo disso é silêncio/ruído da linha
      const mixRef = Math.max(S.ref, L.ref, M.ref); // o mais forte da música agora
      const vel = (B, range) => clamp((B.now - (B.ref - range)) / range, 0.05, 1);
      const noisy = () => (typeof f.flat === "function" ? f.flat() : f.flat || 0);
      const loudEnough = (B, d) => B.now > FLOOR && B.now > B.ref - d;

      // ---------- O TEMPO DO CYCLES (clock MIDI) ----------
      // Com o clock, o kick é a batida grave que cai no lugar do kick dentro do tempo.
      // Esse lugar é APRENDIDO dos próprios kicks (vale com ou sem o play: clock pego no meio
      // tem a fase dos tempos errada, mas fixa). Antes de aprender, com o play: até ~110 ms
      // depois do tempo (o som chega um pouco depois do clock).
      const C = f.clock;
      const P = C && C.P > 0 && C.qT != null ? C.P : 0;
      const beatOff = (x) => { const r = (((x - C.qT) % P) + P) % P; return r > P * 0.75 ? r - P : r; };
      const near = (a, b) => { const d = (((a - b) % P) + P) % P; return Math.min(d, P - d); };
      if (!P) { E.votes.length = 0; E.lows.length = 0; }
      // votos: cada batida grave que SOA como kick vota no seu lugar dentro do tempo;
      // o lugar do kick é onde caem mais votos (pelo menos 3, a ±25 ms)
      const vote = (ph) => {
        E.votes.push(ph);
        if (E.votes.length > 16) E.votes.shift(); // ~4 compassos: se a fase mudar (outra entrada de clock), reaprende logo
        let best = null, bn = 0;
        for (const a of E.votes) {
          let n = 0, sx = 0;
          for (const b of E.votes) if (near(a, b) < 0.025) { n++; sx += ((((b - a + P / 2) % P) + P) % P) - P / 2; }
          if (n > bn) { bn = n; best = a + sx / n; }
        }
        E.kickPh = bn >= 3 ? best : null;
      };

      // ---------- KICK ----------
      // início de uma batida grave FORTE: salto no sub (<90 Hz) ou no grave (90–260 Hz) chegando
      // perto do pico recente. (Um pico pequeno logo antes — vazamento do chimbal, cauda do baixo —
      // não conta e não "gasta" o início: era ele que fazia o kick de verdade ser ignorado.)
      const lowRise = Math.max(S.rise, L.rise), lowLvl = Math.max(S.now - S.ref, L.now - L.ref);
      const lowStart = lowRise > 5 && Math.max(S.now, L.now) > FLOOR && lowLvl > -20 &&
        (t - E.lowOn > 0.08 || lowRise > E.lowRise + 10);
      // rede de segurança (kick que quase não desce de tom): batida grave forte que se repete no mesmo
      // lugar do tempo em quase todo tempo (6 dos últimos 8) e mais forte que as outras graves também é kick
      if (lowStart && P) {
        const ph = beatOff(t);
        E.lows.push({ t, ph, lv: lowLvl });
        while (E.lows.length && t - E.lows[0].t > 8 * P) E.lows.shift();
        const onBeat = ph > -0.04 && ph < 0.11;
        if (lowLvl > -6 && (onBeat || !C.synced)) {
          let n = 0, lvIn = 0, nOut = 0, lvOut = 0;
          for (const x of E.lows) if (near(x.ph, ph) < 0.025) { n++; lvIn += x.lv; } else { nOut++; lvOut += x.lv; }
          // com o play: em cima do tempo. Sem o play (fase desconhecida): só se há outras batidas
          // graves pra comparar e essa é claramente a mais forte
          const louder = nOut ? lvIn / n > lvOut / nOut + 3 : C.synced;
          if (n >= 6 && louder && (C.synced || nOut >= 4)) { E.kickishT = t; vote(ph); }
        }
      }
      // o lugar do kick só vale enquanto há kick tocando (um som de kick nos últimos 4 s):
      // com só o baixo no tempo (kick parado), o baixo não faz a pessoa andar
      const kickLive = t - E.kickishT < 4;
      const grid = P && kickLive ? (E.kickPh != null ? "aprendido" : C.synced ? "play" : null) : null;
      const onGrid = (x) => grid === "aprendido" ? near(beatOff(x), E.kickPh) < 0.035
        : grid === "play" ? beatOff(x) > -0.04 && beatOff(x) < 0.11 : false;
      const kick = (ev, v) => {
        E.kickT = t; E.kickOn = ev ? ev.t0 : t;
        E.kickHold = t + 0.05; S.hl = S.hl.map(() => -140); L.hl = L.hl.map(() => -140);
        if (ev) ev.kicked = true;
        emit("kick", v);
        if (E.bass && Math.abs(E.bass.t0 - E.kickOn) < 0.06) E.bass = null; // o "baixo" que começou junto era o kick
      };
      if (lowStart) {
        E.lowOn = t; E.lowRise = lowRise;
        E.lowEv = { t0: t, pkS: S.now, pkL: L.now, R0: L.now - S.now, R1: 99, kicked: false, done: false };
        // com o tempo do Cycles: batida grave no lugar do kick = kick, NA HORA
        if (grid && onGrid(t) && t - E.kickT > 0.11) kick(E.lowEv, clamp(Math.max(vel(S, 24), vel(L, 24)), 0.05, 1));
      }
      // ~40 ms depois, o som diz se era kick: o kick desce de tom (do grave pro sub-grave)
      // e some rápido; a nota de baixo fica no mesmo tom
      const ev = E.lowEv;
      if (ev && !ev.done) {
        const a = t - ev.t0;
        if (a <= 0.03) {
          if (L.now > ev.pkL) { ev.pkL = L.now; ev.R0 = L.now - S.now; }
          ev.pkS = Math.max(ev.pkS, S.now);
        } else ev.R1 = Math.min(ev.R1, L.now - S.now);
        if (a >= DEC) {
          ev.done = true;
          ev.glide = ev.R0 - ev.R1;  // quanto a energia passou do grave pro sub-grave (dB)
          ev.drop = ev.pkL - L.now;   // quanto o grave já caiu
          // som de kick: desce de tom E chega no pico do grave (o kick é a batida grave mais forte);
          // a nota de baixo logo depois do kick também "desce" (a cauda do kick some), mas fica abaixo
          // do pico. Ou: no pico do grave e curtíssimo (kick sem queda de tom).
          ev.kickish = (ev.glide > 6 && ev.pkL - L.ref > -6) || (ev.pkL - L.ref > -2 && ev.drop > 8);
          if (ev.kickish) { E.kickishT = t; if (P) vote(beatOff(ev.t0)); }
          // sem o tempo: kick um pouco depois. Fora do lugar do kick (kick sincopado), só com o som de
          // kick bem claro: desce muito de tom, chega no pico do sub-grave e cai rápido (um sub-baixo
          // que pulsa também "desce", mas fica abaixo do pico)
          const clear = ev.glide > 9 && ev.pkS - S.ref > -6 && ev.drop > 4;
          if (!ev.kicked && t - E.kickT > 0.11 && (grid ? ev.kickish && clear && !onGrid(ev.t0) : ev.kickish)) {
            const v = clamp(Math.max(ev.pkS - (S.ref - 24), ev.pkL - (L.ref - 24)) / 24, 0.05, 1);
            kick(ev, v);
          }
        }
      }
      // ---------- BAIXO ----------
      // salto no grave (ou no sub fora do lugar do kick); decide depois que o som disse se era kick.
      // Um grave que só PULSA (cauda longa de kick, pad, duas notas batendo) não é nota nova:
      // a nota salta de uma vez E passa do mais alto recente, ou traz o ataque dos harmônicos.
      const bassAt = (B) => {
        if (E.bass || Math.abs(t - E.kickOn) < 0.06) return;
        E.bass = { t0: t, v: vel(B, 24), harm: Hm.now - Math.max(L.now, S.now), ev: t - E.lowOn < 0.03 ? E.lowEv : null };
      };
      if (L.rise > 5 && L.rise1 > 3 && (Math.max(L.over, S.over) > 1.5 || Hm.rise1 > 3) && L.now > FLOOR && L.now > L.ref - 20 && t - L.last > 0.07) {
        L.last = t; bassAt(L);
      }
      if (S.rise > 5 && S.rise1 > 3 && S.over > 1.5 && loudEnough(S, 20) && t - S.last > 0.07 && !(grid && onGrid(t))) {
        S.last = t; bassAt(S);
      }
      if (E.bass && t - E.bass.t0 >= 0.035 && (!E.bass.ev || E.bass.ev.done || E.bass.ev !== E.lowEv || t - E.bass.t0 > 0.1)) {
        const B = E.bass; E.bass = null;
        const kickNear = Math.abs(E.kickOn - B.t0) < 0.06 || (B.ev && (B.ev.kicked || B.ev.kickish));
        const chord = B.harm > -3; // energia de 300–1000 Hz igual ou maior que a do grave = acorde, não baixo
        if (!kickNear && !chord) { emit("bass", B.v); E.bassOn = B.t0; }
      }
      if (Hi.rise > 5 && Hi.now > FLOOR && Hi.now > Hi.ref - 26 && t - Hi.last > 0.045) {
        Hi.last = t;
        if (!E.hat) E.hat = { t0: t, peak: Hi.now, v: vel(Hi, 24) };
      }
      if (E.hat && t - E.hat.t0 >= 0.01) {
        const H = E.hat; E.hat = null;
        if ((H.peak - Hi.now) / ((t - H.t0) * 1000) < 1.3 && H.peak > mixRef - 50) emit("hat", H.v);
      }
      if (M.rise > 6 && M.now > FLOOR && M.now > M.ref - 18 && M.now > Hi.now - 6 && t - M.last > 0.09) {
        M.last = t;
        if (!E.snare) E.snare = { t0: t, peak: M.now, v: vel(M, 24), harm: Hm.now };
      }
      if (E.snare) {
        E.snare.peak = Math.max(E.snare.peak, M.now);
        if (t - E.snare.t0 >= 0.03) {
          const Cn = E.snare; E.snare = null;
          // tem cauda, pesa na música, o médio pesa tanto quanto 300–1000 Hz, e 30 ms depois do golpe
          // AINDA é ruído (a esteira/o clap): o chimbal (mesmo aberto) é metálico/agudo e o acorde é tom
          if (M.now > Cn.peak - 12 && Cn.peak > mixRef - 35 && Cn.peak > Cn.harm - 10 && noisy() > 0.4) emit("snare", Cn.v);
        }
      }
      // ---------- CHORD ----------
      // salto em 300–1000 Hz que fica soando e é TOM (espectro com picos de 250 Hz a 2 kHz)
      const tonal = () => (typeof f.tonal === "function" ? f.tonal() : f.tonal || 1);
      if (Hm.rise > 6 && Hm.rise1 > 2 && Hm.now > FLOOR && Hm.now > Hm.ref - 24 && t - Hm.last > 0.12) {
        Hm.last = t;
        if (!E.chord) E.chord = { t0: t, peak: Hm.now, v: vel(Hm, 24) };
      }
      if (E.chord) {
        const Q = E.chord;
        Q.peak = Math.max(Q.peak, Hm.now);
        // uma nota de baixo começando junto (harmônicos em 300–1000 Hz) decide primeiro
        const bassPend = E.bass && Math.abs(E.bass.t0 - Q.t0) < 0.05 && t - Q.t0 < 0.12;
        if (t - Q.t0 >= CHD && !bassPend) {
          E.chord = null;
          // fica soando (cai menos de 5 dB em 60 ms), é TOM (não ruído), chega no pico da faixa,
          // pesa na música, o médio (1–5 kHz) fica abaixo (não é caixa/chimbal), o grave não domina
          // (não é harmônico de baixo nem cauda de kick) e não foi uma nota de baixo
          const sustain = Hm.now - Q.peak > -5, tom = tonal() < 0.15;
          const strong = Q.peak - Hm.ref > -3 && Q.peak - mixRef > -18;
          const notMid = M.now - Hm.now < -3, notLow = Math.max(L.now, S.now) - Hm.now < 20;
          const bassNote = Math.abs(E.bassOn - Q.t0) < 0.05;
          if (sustain && tom && strong && notMid && notLow && !bassNote) emit("chord", Q.v);
        }
      }
      return out;
    }
    return { step, reset, newPlay: () => { E.votes = []; E.lows = []; E.kickPh = null; }, state: E };
  }
  root.CyclesOuvido = { create };
})(typeof window !== "undefined" ? window : globalThis);
