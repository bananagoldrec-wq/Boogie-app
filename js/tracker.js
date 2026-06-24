'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'rotina-tracker-v1';

const DAYS     = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const START_HOUR = 5;
const END_HOUR   = 23;

const CATEGORIES = [
  { id: 'exercise', label: '💪 Exercício',   color: '#34C759' },
  { id: 'food',     label: '🍎 Alimentação', color: '#FF9500' },
  { id: 'work',     label: '💼 Trabalho',    color: '#007AFF' },
  { id: 'study',    label: '📚 Estudo',      color: '#AF52DE' },
  { id: 'rest',     label: '😌 Descanso',    color: '#8E8E93' },
  { id: 'family',   label: '❤️ Família',     color: '#FF2D55' },
  { id: 'goal',     label: '🎯 Meta',        color: '#00C7BE' },
  { id: 'other',    label: '✏️ Outro',       color: '#FF6B35' },
];

// ── State ────────────────────────────────────────────────────────────────────

let state = loadState();
let currentWeekStart = getMonday(new Date());
let editingCell = null;
let selectedCategory = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { activities: {}, smoking: null };
  } catch {
    return { activities: {}, smoking: null };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function getMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function weekKey() {
  return currentWeekStart.toISOString().slice(0, 10);
}

function actKey(dayIdx, hour) {
  return `${weekKey()}-${DAY_KEYS[dayIdx]}-${hour}`;
}

// ── Activity CRUD ─────────────────────────────────────────────────────────────

function getActivity(dayIdx, hour) {
  return state.activities[actKey(dayIdx, hour)] || null;
}

function setActivity(dayIdx, hour, activity) {
  const k = actKey(dayIdx, hour);
  if (!activity) {
    delete state.activities[k];
  } else {
    state.activities[k] = activity;
  }
  saveState();
}

// ── Grid ─────────────────────────────────────────────────────────────────────

function buildGrid() {
  const grid = document.getElementById('week-grid');
  grid.innerHTML = '';

  const now          = new Date();
  const todayMonday  = getMonday(new Date());
  const isThisWeek   = currentWeekStart.getTime() === todayMonday.getTime();
  const todayDayIdx  = now.getDay() === 0 ? 6 : now.getDay() - 1;

  // Corner
  grid.appendChild(mk('div', 'corner'));

  // Day headers
  DAYS.forEach((name, i) => {
    const date    = new Date(currentWeekStart);
    date.setDate(date.getDate() + i);
    const isToday = isThisWeek && i === todayDayIdx;

    const hdr  = mk('div', `day-header${isToday ? ' is-today' : ''}`);
    const dName = mk('span', 'dh-name'); dName.textContent = name;
    const dDate = mk('span', 'dh-date'); dDate.textContent = date.getDate();
    hdr.appendChild(dName);
    hdr.appendChild(dDate);
    grid.appendChild(hdr);
  });

  // Hour rows
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const lbl = mk('div', 'time-label');
    lbl.textContent = `${String(h).padStart(2, '0')}h`;
    grid.appendChild(lbl);

    DAYS.forEach((_, dayIdx) => {
      const isToday = isThisWeek && dayIdx === todayDayIdx;
      const cell = mk('div', `cell${isToday ? ' today-col' : ''}`);
      cell.dataset.day  = dayIdx;
      cell.dataset.hour = h;

      const act = getActivity(dayIdx, h);
      if (act) renderChip(cell, act);

      cell.addEventListener('click', () => openModal(dayIdx, h));
      grid.appendChild(cell);
    });
  }

  if (isThisWeek) placeTimeLine(todayDayIdx);
}

function renderChip(cell, act) {
  const cat   = CATEGORIES.find(c => c.id === act.category);
  const color = cat ? cat.color : '#8E8E93';

  const chip  = mk('div', 'chip');
  chip.style.background   = hexAlpha(color, 0.13);
  chip.style.borderLeft   = `3px solid ${color}`;

  const span = mk('span', 'chip-text');
  span.textContent = act.text;
  chip.appendChild(span);
  cell.appendChild(chip);
}

function placeTimeLine(todayDayIdx) {
  const now = new Date();
  const h   = now.getHours();
  if (h < START_HOUR || h > END_HOUR) return;

  const cell = document.querySelector(`.cell[data-day="${todayDayIdx}"][data-hour="${h}"]`);
  if (!cell) return;

  const line = mk('div', 'time-line');
  line.style.top = `${(now.getMinutes() / 60) * 100}%`;
  cell.appendChild(line);
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Activity modal ────────────────────────────────────────────────────────────

function openModal(dayIdx, hour) {
  editingCell = { dayIdx, hour };
  const act  = getActivity(dayIdx, hour);

  const date = new Date(currentWeekStart);
  date.setDate(date.getDate() + dayIdx);

  document.getElementById('modal-label').textContent =
    `${DAYS[dayIdx]} ${date.getDate()}/${date.getMonth() + 1} — ${String(hour).padStart(2, '0')}h`;

  const input = document.getElementById('act-input');
  input.value = act ? act.text : '';

  selectedCategory = act ? act.category : null;
  refreshCategoryUI();

  document.getElementById('btn-delete').hidden = !act;
  document.getElementById('modal').hidden = false;
  setTimeout(() => input.focus(), 100);
}

function closeModal() {
  document.getElementById('modal').hidden = true;
  editingCell = null;
}

function saveFromModal() {
  if (!editingCell) return;
  const text = document.getElementById('act-input').value.trim();
  setActivity(
    editingCell.dayIdx,
    editingCell.hour,
    text ? { text, category: selectedCategory || 'other' } : null
  );
  closeModal();
  buildGrid();
}

// ── Categories ────────────────────────────────────────────────────────────────

function buildCategoryGrid() {
  const grid = document.getElementById('cat-grid');
  CATEGORIES.forEach(cat => {
    const btn  = mk('button', 'cat-btn');
    btn.type   = 'button';
    btn.dataset.id = cat.id;

    const dot = mk('span', 'cat-dot');
    dot.style.background = cat.color;

    const lbl = mk('span', 'cat-lbl');
    lbl.textContent = cat.label;

    btn.appendChild(dot);
    btn.appendChild(lbl);
    btn.addEventListener('click', () => {
      selectedCategory = cat.id;
      refreshCategoryUI();
    });
    grid.appendChild(btn);
  });
}

function refreshCategoryUI() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    const active = btn.dataset.id === selectedCategory;
    btn.classList.toggle('active', active);

    const cat = CATEGORIES.find(c => c.id === btn.dataset.id);
    btn.style.borderColor  = active && cat ? cat.color : '';
    btn.style.background   = active && cat ? hexAlpha(cat.color, 0.1) : '';
  });
}

// ── Smoking counter ───────────────────────────────────────────────────────────

function refreshSmokingCounter() {
  const valEl = document.getElementById('smoke-value');
  const lblEl = document.getElementById('smoke-lbl');

  if (!state.smoking?.quitDate) {
    valEl.textContent = 'Definir meta';
    lblEl.textContent = 'toque para configurar';
    return;
  }

  const quit   = new Date(state.smoking.quitDate);
  const diffMs = Date.now() - quit.getTime();

  if (diffMs < 0) {
    const days = Math.floor(Math.abs(diffMs) / 86400000);
    valEl.textContent = `em ${days}d`;
    lblEl.textContent = 'você para de fumar';
    return;
  }

  const totalMins = Math.floor(diffMs / 60000);
  const days  = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins  = totalMins % 60;

  valEl.textContent = days > 0 ? `${days}d ${hours}h`
                    : hours > 0 ? `${hours}h ${mins}m`
                    : `${mins}m`;
  lblEl.textContent = 'sem cigarro 🎉';
}

// ── Week navigation ───────────────────────────────────────────────────────────

function shiftWeek(delta) {
  currentWeekStart = new Date(currentWeekStart);
  currentWeekStart.setDate(currentWeekStart.getDate() + delta * 7);
  updateWeekLabel();
  buildGrid();
}

function updateWeekLabel() {
  const todayMonday = getMonday(new Date());
  const lbl = document.getElementById('week-label');
  if (currentWeekStart.getTime() === todayMonday.getTime()) {
    lbl.textContent = 'Esta semana';
    return;
  }
  const end = new Date(currentWeekStart);
  end.setDate(end.getDate() + 6);
  const fmt = d => `${d.getDate()}/${d.getMonth() + 1}`;
  lbl.textContent = `${fmt(currentWeekStart)}–${fmt(end)}`;
}

// ── Scroll to current hour ────────────────────────────────────────────────────

function scrollToCurrentHour() {
  const h = new Date().getHours();
  if (h < START_HOUR || h > END_HOUR) return;

  const wrapper  = document.getElementById('grid-wrapper');
  const rowIndex = h - START_HOUR;
  const ROW_H    = 62;
  wrapper.scrollTop = Math.max(0, rowIndex * ROW_H - wrapper.clientHeight / 3);
}

// ── DOM helper ────────────────────────────────────────────────────────────────

function mk(tag, cls) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  return el;
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  buildCategoryGrid();
  updateWeekLabel();
  buildGrid();
  refreshSmokingCounter();
  setInterval(refreshSmokingCounter, 30000);

  // Week nav
  document.getElementById('btn-prev').addEventListener('click', () => shiftWeek(-1));
  document.getElementById('btn-next').addEventListener('click', () => shiftWeek(1));

  // Activity modal
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target.id === 'modal') closeModal();
  });
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-save').addEventListener('click', saveFromModal);
  document.getElementById('btn-delete').addEventListener('click', () => {
    setActivity(editingCell.dayIdx, editingCell.hour, null);
    closeModal();
    buildGrid();
  });
  document.getElementById('act-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveFromModal();
  });

  // Smoking modal
  document.getElementById('smoke-banner').addEventListener('click', () => {
    if (state.smoking?.quitDate) {
      const d     = new Date(state.smoking.quitDate);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16);
      document.getElementById('quit-input').value = local;
    }
    document.getElementById('smoke-modal').hidden = false;
  });

  document.getElementById('smoke-modal').addEventListener('click', e => {
    if (e.target.id === 'smoke-modal')
      document.getElementById('smoke-modal').hidden = true;
  });

  document.getElementById('btn-save-quit').addEventListener('click', () => {
    const val = document.getElementById('quit-input').value;
    if (val) {
      state.smoking = { quitDate: new Date(val).toISOString() };
      saveState();
      refreshSmokingCounter();
    }
    document.getElementById('smoke-modal').hidden = true;
  });

  document.getElementById('btn-cancel-quit').addEventListener('click', () => {
    document.getElementById('smoke-modal').hidden = true;
  });

  requestAnimationFrame(() => setTimeout(scrollToCurrentHour, 60));
}

document.addEventListener('DOMContentLoaded', init);
