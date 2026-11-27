/* PROJETO 2 — Escada sem fim.
   Usa os MESMOS sons da Sessão 1 (MIDI, Áudio, Música ou Demo): o motor da Sessão 1
   reconhece kick, baixo, hi-hat e caixa e avisa aqui pelo evento "cycles:hit".
   A Sessão 1 continua exatamente como era; esta aba só troca o desenho. */
import { createEndlessClimb } from './endless-climb.js';

const visual = createEndlessClimb(
  document.getElementById('canvas')
);

// KICK: a pessoa anda (um passo por kick)      → visual.hit('kick', força)
// BASS: a escada sobe (um degrau por nota)      → visual.hit('bass', força)
// HI-HAT: chuva                                 → visual.hit('hat', força)
// SNARE: muda a cor do fundo                    → visual.hit('snare', força)
// Reiniciar                                     → visual.reset()

let proj = 1;
window.addEventListener('cycles:hit', (e) => {
  if (proj !== 2) return;
  if (e.detail.bpm) visual.setBpm(e.detail.bpm); // passo no andamento do Cycles
  visual.hit(e.detail.type, e.detail.amount);
});

// ---------- abas: Sessão 1 · Projeto 2 ----------
const canvas = document.getElementById('canvas');
const tabs = document.querySelectorAll('#seg-proj button');

function setProject(n, save = true) {
  proj = n === 2 ? 2 : 1;
  document.body.classList.toggle('proj-2', proj === 2);
  canvas.hidden = proj !== 2;
  tabs.forEach((b) => {
    const on = +b.dataset.p === proj;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (save) try { localStorage.setItem('cv-proj', String(proj)); } catch { /* sem armazenamento: tudo bem */ }
}

tabs.forEach((b) => b.addEventListener('click', () => setProject(+b.dataset.p)));
document.getElementById('btn-reset2').addEventListener('click', () => visual.reset());

document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,select,textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'p') setProject(proj === 1 ? 2 : 1);   // troca de aba (funciona em tela cheia)
  else if (k === 'c' && proj === 2) visual.reset(); // no Projeto 2, "limpar" = reiniciar
});

let saved = 1;
try { saved = +localStorage.getItem('cv-proj') || 1; } catch { /* idem */ }
setProject(saved, false);

window.CyclesProjeto2 = visual; // pra testar pelo console
