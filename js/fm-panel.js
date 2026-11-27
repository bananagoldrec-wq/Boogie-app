/* CYCLES VISUAL — PAINEL DO MOTOR FM (botão "FM" ou tecla M)
   Mostra, ao vivo: máquina de cada pista, valores MIDI recebidos (nota, velocity, duração,
   último CC), valores dos parâmetros (o que chegou e o valor já suavizado), o destino visual
   de cada parâmetro na cena aberta, a intensidade do LFO, BPM, FPS e objetos ativos.
   Teste manual sem o Model:Cycles: knobs na tela (mesmo caminho do MIDI), botão de disparo
   por pista e um padrão house interno. Presets de comportamento visual: salvar, carregar,
   apagar, exportar e importar (JSON).
   Só trabalha enquanto está aberto (nenhum laço rodando com ele fechado).                  */
(function () {
  "use strict";
  const FM = window.CyclesFM;
  if (!FM) return;
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs = {}, kids = []) => {
    const el = document.createElement(tag);
    for (const k in attrs) { if (k === "class") el.className = attrs[k]; else if (k === "text") el.textContent = attrs[k]; else if (k.startsWith("on")) el.addEventListener(k.slice(2), attrs[k]); else el.setAttribute(k, attrs[k]); }
    for (const c of [].concat(kids)) if (c != null) el.append(c);
    return el;
  };

  // ---------- estilo (só do painel) ----------
  document.head.append(h("style", { text: `
.fmp{position:fixed;top:0;right:0;bottom:0;width:min(470px,100%);z-index:25;background:var(--case,#cfccc3);color:var(--ink,#2b2b2e);
  border-left:1px solid var(--case-edge,#a9a59b);overflow-y:auto;padding:12px 14px 40px;font:13px/1.35 system-ui,sans-serif;box-shadow:-8px 0 24px rgba(0,0,0,.18)}
.fmp[hidden]{display:none}
body.show .fmp{display:none!important}
.fmp h3{margin:0;font-size:16px;letter-spacing:.06em;text-transform:uppercase}
.fmp h4{margin:14px 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2,#615e57)}
.fmp .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.fmp .sp{flex:1}
.fmp .lcd{background:var(--lcd,#bccbff);color:var(--lcd-ink,#2a3a9e);border-radius:6px;padding:6px 8px;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap}
.fmp .stat{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.fmp .stat div{background:var(--lcd,#bccbff);color:var(--lcd-ink,#2a3a9e);border-radius:6px;padding:4px 6px;font:11px ui-monospace,monospace}
.fmp .stat b{display:block;font-size:15px}
.fmp .trk{border:1px solid var(--case-edge,#a9a59b);border-radius:10px;padding:8px;margin:8px 0;background:var(--case-2,#c2beb4)}
.fmp .trk.hit{outline:2px solid var(--lit,#ff2b2b)}
.fmp .trk.muted{opacity:.6}
.fmp .trk summary{cursor:pointer;color:var(--ink-2,#615e57);font-size:12px;margin-top:4px}
.fmp .p{display:grid;grid-template-columns:76px 1fr 34px;gap:2px 6px;align-items:center;margin:3px 0}
.fmp .p label{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.fmp .p label small{font-weight:400;color:var(--ink-2,#615e57)}
.fmp .p input[type=range]{width:100%;accent-color:var(--lit,#ff2b2b)}
.fmp .p output{font:11px ui-monospace,monospace;text-align:right}
.fmp .p .dst{grid-column:2/4;font-size:11px;color:var(--ink-2,#615e57);margin-top:-3px}
.fmp .meter{height:4px;background:rgba(0,0,0,.12);border-radius:2px;grid-column:2/3;overflow:hidden}
.fmp .meter i{display:block;height:100%;background:var(--lcd-ink,#2a3a9e);width:0}
.fmp select,.fmp input[type=text],.fmp input[type=number]{background:#fff8;border:1px solid var(--case-edge,#a9a59b);border-radius:6px;padding:3px 5px;font:12px system-ui;color:inherit}
.fmp button{font:600 12px system-ui;border:1px solid var(--case-edge,#a9a59b);border-radius:7px;padding:4px 9px;background:#3a3a3e;color:#fff;cursor:pointer}
.fmp button.on{background:var(--lit,#ff2b2b)}
.fmp button.light{background:#fff8;color:inherit}
.fmp .pre{display:flex;gap:6px;align-items:center;margin:3px 0}
.fmp .pre span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fmp .lim{font-size:11.5px;color:var(--ink-2,#615e57);margin:4px 0 0 16px;padding:0}
` }));

  // ---------- parâmetros mostrados (chave, rótulo, CC oficial, chave do perfil da cena) ----------
  const MAIN = [["color", "Color", 16, "color"], ["shape", "Shape", 17, "shape"], ["sweep", "Sweep", 18, "sweep"], ["contour", "Contour", 19, "contour"]];
  const MORE = [["decay", "Decay", 80, "decay"], ["volDist", "Vol+Dist", 7, "dist"], ["pitch", "Pitch", 65, "pitch"], ["level", "Level", 95, "level"], ["pan", "Pan", 10, "pan"],
    ["delaySend", "Delay", 12, null], ["reverbSend", "Reverb", 13, null], ["swing", "Swing", 15, null], ["chance", "Chance", 14, null], ["punch", "Punch", 66, "punch"], ["gate", "Gate", 67, "gate"]];
  const LFO = [["lfoSpeed", "Speed", 102], ["lfoFade", "Fade", 104], ["lfoPhase", "Start", 107], ["lfoDepth", "Depth", 109]];
  const FXP = [["delayTime", "Delay time", 85], ["delayFeedback", "Feedback", 86], ["reverbSize", "Rev size", 87], ["reverbTone", "Rev tone", 88]];
  const SPECIAL_DST = { delaySend: "réplicas em perspectiva (delay)", reverbSend: "expansão espacial e réplicas no ponto de fuga (reverb)", swing: "atraso das réplicas ímpares", chance: "(o Cycles já decide se a nota sai)" };

  // ---------- montagem ----------
  const panel = h("aside", { class: "fmp", hidden: "", "aria-label": "Motor FM" });
  document.body.append(panel);
  const ui = { tracks: [] };
  const fmt = (k, v) => (k === "pan" || k === "pitch" || k.startsWith("lfoSpeed") || k === "lfoFade" || k === "lfoDepth" ? String(Math.round(v) - 64) : String(Math.round(v)));

  function param(tr, [key, label, cc, prof], isFx) {
    const inp = h("input", { type: "range", min: 0, max: 127, step: 1 });
    const out = h("output");
    const meter = h("div", { class: "meter" }, h("i"));
    const dst = prof !== undefined ? h("div", { class: "dst" }) : null;
    inp.addEventListener("input", () => { FM.setParam(tr, key, +inp.value); out.textContent = fmt(key, +inp.value); });
    const row = h("div", { class: "p" }, [h("label", {}, [label + " ", h("small", { text: "CC" + cc })]), inp, out, isFx ? null : meter, isFx ? null : h("span"), dst]);
    return { key, prof, inp, out, meter: meter.firstChild, dst, row, isFx };
  }
  function select(opts, onchange) { const s = h("select", {}, opts.map((o, i) => h("option", { value: i, text: o }))); s.addEventListener("change", () => onchange(+s.value)); return s; }

  function build() {
    panel.innerHTML = "";
    // cabeçalho e estado geral
    panel.append(h("div", { class: "row" }, [h("h3", { text: "Motor FM" }), h("span", { class: "sp" }), h("button", { class: "light", text: "Fechar (M)", onclick: toggle })]));
    ui.stat = {};
    const stat = h("div", { class: "stat" }, ["BPM", "FPS", "Objetos", "Réplicas"].map((k) => { const b = h("b", { text: "—" }); ui.stat[k] = b; return h("div", {}, [k, b]); }));
    panel.append(stat);
    ui.midi = h("div", { class: "lcd", style: "margin-top:6px" });
    panel.append(ui.midi);
    // perfil da cena
    panel.append(h("h4", { text: "Cena aberta — o que cada knob faz" }));
    ui.prof = h("div", { class: "lcd" });
    panel.append(ui.prof);
    // teste manual
    panel.append(h("h4", { text: "Teste manual (sem o Model:Cycles)" }));
    ui.patBtn = h("button", { text: "Tocar padrão house", onclick: togglePattern });
    ui.patBpm = h("input", { type: "number", min: 60, max: 200, value: 124, style: "width:64px" });
    panel.append(h("div", { class: "row" }, [ui.patBtn, ui.patBpm, h("span", { text: "BPM" }), h("span", { class: "sp" }), h("span", { style: "font-size:11px;color:var(--ink-2)", text: "teclas 1–6 disparam as pistas" })]));
    // pistas
    panel.append(h("h4", { text: "Pistas" }));
    ui.tracks = FM.tracks.map((t, tr) => {
      const mach = select(FM.MACHINES, (m) => FM.setMachine(tr, m, "manual"));
      const mute = h("button", { class: "light", text: "Mute", onclick: () => FM.setParam(tr, "mute", t.raw.mute ? 0 : 127) });
      const pad = h("button", { text: "▶", title: "Disparar esta pista", onclick: () => trigger(tr, 100) });
      const info = h("div", { class: "lcd", style: "margin:6px 0" });
      const main = MAIN.map((p) => param(tr, p));
      const more = MORE.map((p) => param(tr, p));
      // LFO
      const wave = select(FM.LFO_WAVES, (v) => FM.setParam(tr, "lfoWave", v));
      const mult = select(FM.MULTS.map((m) => "×" + (m >= 1024 ? m / 1024 + "K" : m)).concat(FM.MULTS.map((m) => "×" + (m >= 1024 ? m / 1024 + "K" : m) + " livre")), (v) => FM.setParam(tr, "lfoMult", v));
      const dest = select(FM.LFO_DEST, (v) => FM.setParam(tr, "lfoDest", v));
      const vis = select(FM.VIS_DEST.map((d, i) => (i ? "visual: " + d : "destino de som (CC105)")), (v) => FM.setVisDest(tr, v));
      const rst = h("button", { class: "light", text: "Reset", onclick: () => FM.setParam(tr, "lfoReset", t.raw.lfoReset >= 64 ? 0 : 127) });
      const lfo = LFO.map((p) => param(tr, p));
      const lfoMeter = h("div", { class: "meter", style: "height:8px" }, h("i"));
      const card = h("div", { class: "trk" }, [
        h("div", { class: "row" }, [h("b", { text: "T" + (tr + 1) }), mach, h("span", { class: "sp" }), mute, pad]),
        info, ...main.map((p) => p.row),
        h("details", {}, [h("summary", { text: "mais parâmetros e LFO" }), ...more.map((p) => p.row),
          h("h4", { text: "LFO visual" }),
          h("div", { class: "row" }, [wave, mult, rst]), h("div", { class: "row", style: "margin-top:4px" }, [dest, vis]),
          ...lfo.map((p) => p.row), h("div", { class: "row" }, [h("span", { text: "saída", style: "font-size:11px" }), h("div", { class: "sp" }, lfoMeter)]),
        ]),
      ]);
      panel.append(card);
      return { card, mach, mute, info, params: [...main, ...more, ...lfo], wave, mult, dest, vis, rst, lfoMeter: lfoMeter.firstChild, lastEv: 0 };
    });
    // FX
    panel.append(h("h4", { text: "Delay e reverb (FX do Cycles)" }));
    ui.fx = FXP.map((p) => { const r = param(-1, p, true); r.inp.oninput = () => { FM.setParam(0, p[0], +r.inp.value); r.out.textContent = r.inp.value; }; panel.append(r.row); return r; });
    // presets
    panel.append(h("h4", { text: "Presets de comportamento visual" }));
    ui.pName = h("input", { type: "text", placeholder: "nome do preset", style: "flex:1" });
    panel.append(h("div", { class: "row" }, [ui.pName, h("button", { text: "Salvar", onclick: savePreset })]));
    ui.pList = h("div");
    panel.append(ui.pList);
    const imp = h("input", { type: "file", accept: ".json,application/json", hidden: "" });
    imp.addEventListener("change", importPresets);
    panel.append(h("div", { class: "row", style: "margin-top:6px" }, [
      h("button", { class: "light", text: "Exportar", onclick: exportPresets }),
      h("button", { class: "light", text: "Importar", onclick: () => imp.click() }), imp,
      h("span", { class: "sp" }),
      h("button", { class: "light", text: "Zerar knobs", onclick: () => { FM.resetAll(); syncInputs(true); } }),
    ]));
    // limites reais do MIDI
    panel.append(h("h4", { text: "O que o MIDI do Model:Cycles transmite" }));
    panel.append(h("ul", { class: "lim" }, FM.LIMITS.map((l) => h("li", { text: l }))));
    listPresets();
    syncInputs(true);
  }

  // ---------- atualização ao vivo (só com o painel aberto) ----------
  let open = false, timer = 0, raf = 0, frames = 0, fpsT = 0, fps = 0;
  function rafCount(t) { if (!open) return; frames++; if (t - fpsT >= 1000) { fps = (frames * 1000) / (t - fpsT); frames = 0; fpsT = t; } raf = requestAnimationFrame(rafCount); }
  function syncInputs(force) {
    ui.tracks.forEach((u, tr) => {
      const t = FM.tracks[tr];
      if (force || document.activeElement !== u.mach) u.mach.value = t.raw.machine;
      for (const p of u.params) if (force || document.activeElement !== p.inp) { p.inp.value = t.raw[p.key]; p.out.textContent = fmt(p.key, t.raw[p.key]); }
      if (force || document.activeElement !== u.wave) u.wave.value = t.raw.lfoWave;
      if (force || document.activeElement !== u.mult) u.mult.value = Math.min(23, t.raw.lfoMult | 0);
      if (force || document.activeElement !== u.dest) u.dest.value = Math.min(FM.LFO_DEST.length - 1, t.raw.lfoDest | 0);
      if (force || document.activeElement !== u.vis) u.vis.value = t.lfo.visDest;
    });
    for (const r of ui.fx) if (force || document.activeElement !== r.inp) { r.inp.value = FM.fx[r.key]; r.out.textContent = String(FM.fx[r.key]); }
  }
  function refresh() {
    const sc = window.CyclesCena && window.CyclesCena(), st = sc && sc.state ? sc.state() : null;
    ui.stat.BPM.textContent = FM.bpm() ? FM.bpm().toFixed(1) : "—";
    ui.stat.FPS.textContent = fps ? fps.toFixed(0) : "—";
    ui.stat.Objetos.textContent = st && st.objects != null ? st.objects : "—";
    ui.stat["Réplicas"].textContent = FM.pendingCount();
    const s = FM.stats;
    ui.midi.textContent = `Recebido: ${s.notesIn} notas · ${s.ccIn} CC · ${s.events} eventos · ${s.replicas} réplicas`;
    const prof = FM.PROFILES[FM.scene()];
    ui.prof.textContent = prof ? `${prof.name}\nCOLOR   ${prof.color}\nSHAPE   ${prof.shape}\nSWEEP   ${prof.sweep}\nCONTOUR ${prof.contour}\nDIST    ${prof.dist}\nDECAY   ${prof.decay}` : "—";
    syncInputs(false);
    const tm = performance.now() / 1000;
    ui.tracks.forEach((u, tr) => {
      const t = FM.tracks[tr], P = FM.params(tr), role = FM.ROLE[t.raw.machine];
      u.card.classList.toggle("muted", !!t.raw.mute);
      u.mute.classList.toggle("on", !!t.raw.mute);
      u.rst.classList.toggle("on", t.raw.lfoReset >= 64);
      if (t.events !== u.lastEv) { u.lastEv = t.events; u.card.classList.add("hit"); clearTimeout(u.ht); u.ht = setTimeout(() => u.card.classList.remove("hit"), 90); }
      const cc = t.lastCC ? `CC${t.lastCC.num} ${t.lastCC.key} = ${t.lastCC.val} (há ${(tm - t.lastCCT).toFixed(1)} s)` : "nenhum CC";
      u.info.textContent = `${FM.MACHINES[t.raw.machine]} → "${role}" · máquina: ${t.machineSrc}\nnota ${t.lastNote ?? "—"} · vel ${t.lastVel || "—"} · duração ${t.length != null ? t.length.toFixed(2) + " s" : "—"} · ${t.events} eventos\núltimo ${cc}`;
      for (const p of u.params) {
        // barra = valor que a cena está usando agora (suavizado, com o LFO de som aplicado)
        const live = p.key === "volDist" ? (P.dist > 0 ? 0.47 + P.dist * 0.53 : P.volume * 0.47) : p.key in P ? (p.key === "pan" || p.key === "pitch" ? (P[p.key] + 1) / 2 : P[p.key]) : t.cur[p.key] / 127;
        if (p.meter) p.meter.style.width = Math.round(Math.max(0, Math.min(1, +live || 0)) * 100) + "%";
        if (p.dst) p.dst.textContent = p.prof ? "→ " + ((prof && prof[p.prof]) || "—") : SPECIAL_DST[p.key] ? "→ " + SPECIAL_DST[p.key] : "";
      }
      u.lfoMeter.style.width = Math.round(Math.abs(t.lfo.out) * 100) + "%";
    });
  }
  function toggle() {
    open = !open;
    panel.hidden = !open;
    if (open) { if (!ui.stat) build(); refresh(); timer = setInterval(refresh, 150); fpsT = performance.now(); frames = 0; raf = requestAnimationFrame(rafCount); }
    else { clearInterval(timer); cancelAnimationFrame(raf); }
    const b = document.getElementById("btn-fm"); if (b) b.classList.toggle("on", open);
  }

  // ---------- disparo manual e padrão interno ----------
  const offs = new Set();
  function trigger(tr, vel, len = 0.12) {
    const t = FM.tracks[tr];
    FM.noteOn(tr, t.lastNote ?? 60, vel, "manual");
    const em = document.getElementById("empty"); if (em && !em.hidden) em.hidden = true; // já tem imagem: sai o aviso
    const id = setTimeout(() => { offs.delete(id); FM.noteOff(tr); }, len * 1000);
    offs.add(id);
  }
  // house 4/4: kick em todos os tempos, caixa no 2 e 4, hats no contratempo, perc sincopada,
  // baixo em semicolcheias soltas, acorde a cada compasso (passos de semicolcheia)
  const PAT = [
    [0, 4, 8, 12], [4, 12], [2, 6, 10, 14], [3, 7, 11, 13], [0, 3, 6, 10, 14], [0],
  ];
  let pat = null;
  function togglePattern() {
    if (pat) { clearInterval(pat.id); pat = null; ui.patBtn.classList.remove("on"); ui.patBtn.textContent = "Tocar padrão house"; return; }
    const bpm = Math.max(60, Math.min(200, +ui.patBpm.value || 124));
    FM.setBpm(bpm);
    const step = 60 / bpm / 4;
    let i = 0, next = performance.now() / 1000;
    pat = { id: setInterval(() => {
      const now = performance.now() / 1000;
      while (next <= now + 0.005) {
        const s = i % 16, bar = (i / 16) | 0;
        PAT.forEach((steps, tr) => { if (steps.includes(s) && !(tr === 5 && bar % 2)) trigger(tr, tr === 0 ? 120 : tr === 2 ? 70 + ((Math.random() * 30) | 0) : 100, tr === 5 ? step * 12 : tr === 4 ? step * 2 : step); });
        FM.setBpm(bpm);
        i++; next += step;
      }
    }, 8) };
    ui.patBtn.classList.add("on"); ui.patBtn.textContent = "Parar padrão";
  }

  // ---------- presets ----------
  function listPresets() {
    const all = FM.presets(), names = Object.keys(all).sort();
    ui.pList.innerHTML = "";
    if (!names.length) { ui.pList.append(h("div", { style: "font-size:12px;color:var(--ink-2)", text: "Nenhum preset salvo ainda." })); return; }
    for (const n of names) ui.pList.append(h("div", { class: "pre" }, [h("span", { text: n }),
      h("button", { text: "Carregar", onclick: () => { FM.loadPreset(n); syncInputs(true); } }),
      h("button", { class: "light", text: "Apagar", onclick: () => { if (confirm(`Apagar o preset "${n}"?`)) { FM.deletePreset(n); listPresets(); } } })]));
  }
  function savePreset() {
    const n = (ui.pName.value || "").trim() || "Preset " + new Date().toLocaleString();
    FM.savePreset(n); ui.pName.value = ""; listPresets();
  }
  function exportPresets() {
    const blob = new Blob([JSON.stringify({ app: "cycles-visual-fm", version: 1, current: FM.snapshot(), presets: FM.presets() }, null, 2)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: "cycles-visual-presets.json" });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importPresets(e) {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    f.text().then((txt) => {
      const data = JSON.parse(txt), list = data && data.presets;
      if (!list || typeof list !== "object") throw new Error("arquivo sem presets");
      for (const n of Object.keys(list)) { if (FM.restore(list[n])) FM.savePreset(n); }
      if (data.current) FM.restore(data.current);
      listPresets(); syncInputs(true);
    }).catch((err) => alert("Não deu pra importar: " + err.message));
  }

  // ---------- botão e tecla ----------
  const actions = document.querySelector(".bar .actions");
  if (actions) {
    const b = h("button", { id: "btn-fm", class: "btn", type: "button", title: "Motor FM: knobs por pista, LFO, teste manual e presets (tecla M)", text: "FM", onclick: toggle });
    actions.insertBefore(b, document.getElementById("btn-settings"));
  }
  document.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input,select,textarea")) return;
    if (e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey && !e.altKey) toggle();
    else if (e.key === "Escape" && open) toggle();
  });
  window.CyclesFMPanel = { toggle, isOpen: () => open, refresh: () => open && refresh(), pattern: () => !!pat, togglePattern };
})();
