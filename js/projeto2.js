/* CENAS DO CYCLES VISUAL — Projeto 2 (Escada sem fim) · 3 (Bauhaus Orbital) ·
   4 (Infinite Microcosmos) · 5 (031 Impossible City) · 6 (032 Magnetic Ballet) ·
   7 (BENO — Festa Lá em Cima).
   Todas usam os MESMOS sons (MIDI de cada trilha, Áudio, Música ou Demo): o motor
   (js/cycles.js) reconhece kick, baixo, hi-hat, caixa e chord e avisa aqui pelo evento
   "cycles:hit" com a força já entre 0 e 1.
   Só UMA cena existe por vez: ao trocar de aba, a anterior é encerrada com destroy()
   (o laço de animação dela é cancelado) e a nova é criada do zero. */
import { createEndlessClimb } from './endless-climb.js';
import { createBauhausOrbital } from './bauhaus-orbital-024.js';
import { createInfiniteMicrocosmos } from './infinite-microcosmos-030.js';
import { createImpossibleCity, createMagneticBallet } from './bauhaus-scenes.js';
import { createBenoRhythmic } from './beno-rhythmic.js';

// cada cena: o canvas dela, como criar, e (se tiver) os controles de velocidade e perspectiva
const SCENES = {
  2: { canvas: 'canvas', make: createEndlessClimb, name: 'Escada sem fim' },
  3: { canvas: 'canvas3', make: createBauhausOrbital, name: 'Bauhaus Orbital' },
  4: { canvas: 'canvas4', make: createInfiniteMicrocosmos, name: 'Infinite Microcosmos',
    speed: [0.2, 3, 0.1, 1], persp: [150, 900, 10, 340], fmt: (v) => String(Math.round(v)) },
  5: { canvas: 'canvas5', make: createImpossibleCity, name: '031 · Impossible City',
    speed: [0.2, 3, 0.1, 1], persp: [0.5, 2.5, 0.05, 1], fmt: (v) => (+v).toFixed(2) + '×' },
  6: { canvas: 'canvas6', make: createMagneticBallet, name: '032 · Magnetic Ballet',
    speed: [0.2, 3, 0.1, 1], persp: [0.5, 2.5, 0.05, 1], fmt: (v) => (+v).toFixed(2) + '×' },
  // a 1ª faixa desta instalação é a INTENSIDADE (0–200%), não a velocidade
  7: { canvas: 'canvas7', make: createBenoRhythmic, name: 'BENO — Festa Lá em Cima',
    speed: [0, 2, 0.05, 1], speedLabel: 'Intensidade', speedFn: 'setIntensity', speedFmt: (v) => Math.round(v * 100) + '%',
    persp: [0.5, 2.5, 0.05, 1], fmt: (v) => (+v).toFixed(2) + '×', text: true },
};
const FIRST = 2, LAST = 7;
let proj = 0, current = null;
const scene = () => current;

// ---------- eventos dos instrumentos → hit() da cena aberta ----------
const lights = {};
document.querySelectorAll('#p2-lights span').forEach((el) => { lights[el.dataset.k] = el; });
const src = document.getElementById('p2-src');
const FM = window.CyclesFM;
function flash(type, source, grid) {
  const L = lights[type];
  if (L) { L.classList.add('on'); clearTimeout(L._t); L._t = setTimeout(() => L.classList.remove('on'), 90); }
  src.textContent = source === 'audio' ? (grid ? 'áudio + clock' : 'pelo áudio') : source === 'musica' ? 'pela música' : source === 'pad' ? 'teclas' : source === 'manual' ? 'teste manual' : 'pelo MIDI';
}
// MIDI, Demo, teclas e teste manual → motor FM → a cena aberta recebe o papel da MÁQUINA da pista,
// a força (0–1) e o contexto (knobs da pista com LFO, réplica de delay/reverb, duração da nota)
if (FM) FM.onHit((ctx) => {
  const V = current;
  if (!V) return;
  if (FM.bpm() && V.setBpm) V.setBpm(FM.bpm());
  V.hit(ctx.role, ctx.v, ctx);
  if (!ctx.replica) flash(ctx.role, ctx.src);
});
// troca de pattern (program change, se o Cycles mandar): a cena reorganiza a composição (sem reiniciar)
if (FM) FM.onMeta((m) => {
  if (m.kind === 'program' && current && current.pattern) current.pattern(m.program);
  else if ((m.kind === 'beat' || m.kind === 'transport') && current && current.clock) current.clock(m); // compassos do MIDI Clock
});
// ouvido de áudio e música analisada (sem pista): o papel vem do som, os knobs da pista daquela máquina
window.addEventListener('cycles:hit', (e) => {
  const V = current;
  if (!V) return;
  if (e.detail.bpm && V.setBpm) V.setBpm(e.detail.bpm); // movimento no andamento do Cycles
  const ctx = FM ? FM.contextForRole(e.detail.type, e.detail.amount, e.detail.source) : undefined;
  V.hit(e.detail.type, e.detail.amount, ctx);             // força normalizada (0–1)
  flash(e.detail.type, e.detail.source, e.detail.grid);
});

// ---------- luzes: de onde vem cada papel ----------
// "T3 MIDI" = a trilha 3 está mandando notas: o papel segue o MIDI dela (exato).
// "T3 · áudio" = essa trilha não manda notas: o papel vem do ouvido próprio.
// Clique na luz pra trocar a trilha daquele papel.
const NAMES = { kick: 'Kick', bass: 'Baixo', hat: 'Hi-hat', snare: 'Caixa', chord: 'Chord', perc: 'Perc' };
Object.keys(lights).forEach((k) => {
  const L = lights[k];
  L.innerHTML = `${NAMES[k] || k}<small></small>`;
  L.title = 'Clique pra trocar a trilha do Cycles que faz isso';
  L.addEventListener('click', () => {
    const api = window.CyclesP2;
    if (!api) return;
    const roles = api.chosen ? api.chosen() : api.roles();
    const taken = Object.keys(roles).filter((o) => o !== k).map((o) => roles[o]);
    const opts = [0, 1, 2, 3, 4, 5].filter((i) => !taken.includes(i)).concat(-1);
    const cur = opts.indexOf(roles[k]);
    api.setRole(k, opts[(cur + 1) % opts.length]);
    refreshLights();
  });
});
function refreshLights() {
  const api = window.CyclesP2;
  if (!api) return;
  const roles = { ...api.roles() }, live = api.live(), ouvido = api.audioOn(), auto = api.auto ? api.auto() : {};
  if (FM) roles.perc = FM.trackOfRole('perc'); // PERC não é papel do ⚙: é a pista com a máquina PERC
  Object.keys(lights).forEach((k) => {
    const tr = roles[k], sm = lights[k].querySelector('small');
    const midi = tr >= 0 && live[tr];
    // "auto": o ritmo do MIDI mostrou que esse som está nessa trilha (kick nos 4 tempos, caixa no 2 e 4)
    const txt = (midi ? `T${tr + 1} MIDI` : ouvido ? (tr >= 0 ? `T${tr + 1} · áudio` : 'áudio') : tr >= 0 ? `T${tr + 1}` : '—') + (auto[k] ? ' auto' : '');
    if (sm.textContent !== txt) sm.textContent = txt;
    lights[k].classList.toggle('miss', !midi && !ouvido);
  });
}
setInterval(refreshLights, 300);
refreshLights();

// ---------- controles: velocidade e perspectiva (por cena, guardados neste aparelho) ----------
const ctlName = document.getElementById('scn-name');
const ctlSpeedLbl = document.getElementById('scn-speed-lbl');
const speedFn = (n) => SCENES[n].speedFn || 'setSpeed';
const speedFmt = (n) => SCENES[n].speedFmt || ((v) => (+v).toFixed(1) + '×');
const ctlSpeed = document.getElementById('scn-speed'), ctlPersp = document.getElementById('scn-persp');
const outSpeed = document.querySelector('output[for="scn-speed"]'), outPersp = document.querySelector('output[for="scn-persp"]');
const key = (n, what) => `cv-${what}-${n}`;
function readSaved(n, what, def) {
  try { const v = localStorage.getItem(key(n, what)) ?? (n === 4 ? localStorage.getItem(`cv-p4-${what}`) : null); if (v != null && Number.isFinite(+v)) return +v; } catch { /* sem armazenamento */ }
  return def;
}
function applyControls(n) {
  const cfg = SCENES[n];
  document.body.classList.toggle('has-ctl', !!cfg.speed);
  if (!cfg.speed || !current) return;
  if (ctlName) ctlName.textContent = cfg.name;
  if (ctlSpeedLbl) ctlSpeedLbl.textContent = cfg.speedLabel || 'Velocidade';
  refreshText();
  const set = (el, out, range, what, fn, fmt) => {
    const [min, max, step, def] = range;
    el.min = min; el.max = max; el.step = step;
    el.value = clamp(readSaved(n, what, def), min, max);
    fn(+el.value); out.textContent = fmt(+el.value);
  };
  set(ctlSpeed, outSpeed, cfg.speed, 'speed', (v) => current[speedFn(n)](v), speedFmt(n));
  set(ctlPersp, outPersp, cfg.persp, 'persp', (v) => current.setPerspective(v), cfg.fmt);
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
if (ctlSpeed) ctlSpeed.addEventListener('input', () => {
  if (!current || !current[speedFn(proj)]) return;
  current[speedFn(proj)](+ctlSpeed.value); outSpeed.textContent = speedFmt(proj)(+ctlSpeed.value);
  try { localStorage.setItem(key(proj, 'speed'), ctlSpeed.value); } catch { /* idem */ }
});
if (ctlPersp) ctlPersp.addEventListener('input', () => {
  if (!current || !current.setPerspective) return;
  current.setPerspective(+ctlPersp.value); outPersp.textContent = SCENES[proj].fmt(+ctlPersp.value);
  try { localStorage.setItem(key(proj, 'persp'), ctlPersp.value); } catch { /* idem */ }
});

// ---------- texto da instalação BENO (Auto: troca com a música · BENO · FESTA LÁ EM CIMA) ----------
const textBtns = document.querySelectorAll('#scn-text button');
function refreshText() {
  const m = current && current.getText ? current.getText() : null;
  textBtns.forEach((b) => { const on = b.dataset.t === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
}
textBtns.forEach((b) => b.addEventListener('click', () => {
  if (!current || !current.setText) return;
  current.setText(b.dataset.t);
  try { localStorage.setItem('cv-beno-text', b.dataset.t); } catch { /* idem */ }
  refreshText();
}));

// ---------- abas ----------
const tabs = document.querySelectorAll('#seg-proj button');
function setProject(n, save = true) {
  n = SCENES[n] ? n : FIRST;
  if (n !== proj) {
    if (current) { try { current.destroy(); } catch (e) { console.error(e); } current = null; } // cancela o laço da cena anterior
    for (const k of Object.keys(SCENES)) { const c = document.getElementById(SCENES[k].canvas); if (c) c.hidden = +k !== n; }
    proj = n;
    document.body.classList.add('proj-2'); // rodapé dos projetos (luzes, reiniciar)
    document.body.dataset.scene = String(n);
    current = SCENES[n].make(document.getElementById(SCENES[n].canvas));
    if (FM) FM.setScene(n);
    if (SCENES[n].text && current.setText) { let tx = 'auto'; try { tx = localStorage.getItem('cv-beno-text') || 'auto'; } catch { /* idem */ } current.setText(tx); }
  }
  applyControls(n);
  tabs.forEach((b) => {
    const on = +b.dataset.p === proj;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (save) try { localStorage.setItem('cv-proj', String(proj)); } catch { /* sem armazenamento: tudo bem */ }
}

tabs.forEach((b) => b.addEventListener('click', () => setProject(+b.dataset.p)));
document.getElementById('btn-reset2').addEventListener('click', () => { if (current) current.reset(); });

document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,select,textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'p') setProject(proj >= LAST ? FIRST : proj + 1); // troca de cena (funciona em tela cheia)
  else if (k === 'c' && current) current.reset();             // "limpar" = começar de novo
  else if (k === 't' && current && current.nextText) {         // BENO: Auto → BENO → FESTA LÁ EM CIMA
    const m = current.nextText(); try { localStorage.setItem('cv-beno-text', m); } catch { /* idem */ } refreshText();
  }
});

let saved = FIRST;
try { saved = +localStorage.getItem('cv-proj') || FIRST; } catch { /* idem */ }
setProject(saved, false); // a Sessão 1 saiu: quem estava nela abre no Projeto 2

// pra testar pelo console: a cena aberta (as outras não existem enquanto estão fechadas)
window.CyclesCena = () => current;
for (const n of Object.keys(SCENES)) Object.defineProperty(window, 'CyclesProjeto' + n, { get: () => (proj === +n ? current : null), configurable: true });
