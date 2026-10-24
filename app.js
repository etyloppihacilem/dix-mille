'use strict';

const STORAGE_KEY = 'dix-mille-state-v1';
const MAX_DIGITS = 6;
const WIN_SCORE = 10000;
const COLORS = [
  '#e53935', '#fb8c00', '#fdd835', '#43a047', '#00897b',
  '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#6d4c41',
  '#546e7a', '#000000',
];

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => n.toLocaleString('fr-FR');
const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------- State ---------- */

function defaultState() {
  const players = ['Joueur 1', 'Joueur 2'].map((name, i) => ({
    id: uid(), name, color: COLORS[i * 5], score: 0, last: null,
  }));
  return {
    players,
    turnId: players[0].id,     // whose turn it is in the normal rotation
    selectedId: players[0].id, // player whose value is being typed
    mode: 'add',               // 'add' = ajouter au score, 'set' = corriger le score
    input: '',
    negative: false,
    history: [],
  };
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.players)) return { ...defaultState(), ...s, input: '', negative: false, mode: 'add' };
  } catch (e) { /* ignore */ }
  return defaultState();
}

let state = loadState();
let editing = false;
let paletteFor = null;

function save() {
  try {
    const { input, negative, ...rest } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch (e) { /* ignore */ }
}

const byId = (id) => state.players.find((p) => p.id === id);
const indexOf = (id) => state.players.findIndex((p) => p.id === id);

function ensureIds() {
  if (!state.players.length) { state.turnId = state.selectedId = null; return; }
  if (!byId(state.turnId)) state.turnId = state.players[0].id;
  if (!byId(state.selectedId)) state.selectedId = state.turnId;
}

function nextId(id) {
  const i = indexOf(id);
  return state.players[(i + 1) % state.players.length].id;
}

function snapshot() {
  state.history.push({
    scores: state.players.map((p) => [p.id, p.score, p.last]),
    turnId: state.turnId,
  });
  if (state.history.length > 300) state.history.shift();
}

function undo() {
  const h = state.history.pop();
  if (!h) { toast('Rien à annuler'); return; }
  for (const [id, score, last] of h.scores) {
    const p = byId(id);
    if (p) { p.score = score; p.last = last; }
  }
  state.turnId = h.turnId;
  ensureIds();
  state.selectedId = state.turnId;
  state.mode = 'add';
  clearInput();
  toast('Annulé');
}

function clearInput() { state.input = ''; state.negative = false; }

function inputValue() {
  const v = parseInt(state.input || '0', 10);
  return state.negative ? -v : v;
}

/* ---------- Actions ---------- */

function press(k) {
  if (editing || !state.players.length) return;
  switch (k) {
    case 'back':
      if (state.input) state.input = state.input.slice(0, -1);
      else state.negative = false;
      break;
    case 'sign':
      state.negative = !state.negative;
      break;
    case 'undo':
      undo();
      break;
    case 'ok':
      validate();
      break;
    default:
      if (/^\d+$/.test(k)) {
        let s = state.input + k;
        s = s.replace(/^0+(?=\d)/, '');
        if (s.length <= MAX_DIGITS) state.input = s;
      }
  }
  save();
  render();
}

function validate() {
  const p = byId(state.selectedId);
  if (!p) return;
  if (state.mode === 'set') {
    if (state.input === '') { toast('Tape le nouveau score'); return; }
    snapshot();
    p.score = inputValue();
    p.last = null;
    state.mode = 'add';
    state.selectedId = state.turnId;
    toast(`Score de ${p.name} corrigé`);
  } else {
    snapshot();
    const v = inputValue();
    p.score += v;
    p.last = v;
    state.turnId = nextId(p.id);
    state.selectedId = state.turnId;
  }
  clearInput();
  scrollToSelected = true;
  beep();
}

/* ---------- Beep ---------- */

let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  } catch (e) { /* no audio available */ }
}

function selectPlayer(id, mode) {
  if (state.selectedId !== id || state.mode !== mode) clearInput();
  state.selectedId = id;
  state.mode = mode;
  if (mode === 'add') state.turnId = id;
  save();
  render();
}

function toggleMode() {
  if (!state.selectedId) return;
  if (state.mode === 'set') {
    state.mode = 'add';
    state.selectedId = state.turnId;
  } else {
    state.mode = 'set';
  }
  clearInput();
  save();
  render();
}

function addPlayer() {
  const used = new Set(state.players.map((p) => p.color));
  const color = COLORS.find((c) => !used.has(c)) || COLORS[state.players.length % COLORS.length];
  const p = { id: uid(), name: `Joueur ${state.players.length + 1}`, color, score: 0, last: null };
  state.players.push(p);
  ensureIds();
  save();
  render();
  const input = document.querySelector(`.player[data-id="${p.id}"] .name-input`);
  if (input) { input.focus(); input.select(); }
}

function removePlayer(id) {
  const p = byId(id);
  if (!p) return;
  if (!confirm(`Supprimer ${p.name} ?`)) return;
  if (state.turnId === id && state.players.length > 1) state.turnId = nextId(id);
  state.players.splice(indexOf(id), 1);
  ensureIds();
  state.selectedId = state.turnId;
  save();
  render();
}

function newGame() {
  if (!confirm('Remettre tous les scores à 0 ?')) return;
  for (const p of state.players) { p.score = 0; p.last = null; }
  state.history = [];
  state.turnId = state.selectedId = state.players[0]?.id ?? null;
  state.mode = 'add';
  clearInput();
  save();
  render();
  toast('Nouvelle partie');
}

function setEditing(on) {
  editing = on;
  paletteFor = null;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (!on) {
    for (const p of state.players) p.name = p.name.trim() || 'Joueur';
    state.mode = 'add';
    state.selectedId = state.turnId;
    clearInput();
    save();
  }
  render();
}

/* ---------- Rendering ---------- */

const listEl = $('#players');
let scrollToSelected = true;

function render() {
  document.body.classList.toggle('editing', editing);
  $('#playPanel').hidden = editing;
  $('#editPanel').hidden = !editing;
  $('#editBtn').textContent = editing ? 'Terminé' : 'Joueurs';
  renderList();
  renderEntry();
}

function renderList() {
  listEl.textContent = '';
  if (!state.players.length) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = 'Aucun joueur. Ajoute des joueurs pour commencer.';
    listEl.append(d);
    return;
  }
  const best = Math.max(...state.players.map((p) => p.score));
  for (const p of state.players) {
    const row = document.createElement('div');
    row.className = 'player';
    row.dataset.id = p.id;
    row.style.setProperty('--pc', p.color);

    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.textContent = '⋮⋮';
    handle.setAttribute('aria-label', 'Déplacer');
    handle.addEventListener('pointerdown', (e) => startDrag(e, row));
    handle.addEventListener('click', (e) => e.stopPropagation());
    row.append(handle);

    if (editing) {
      const dot = document.createElement('button');
      dot.className = 'dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Couleur');
      dot.addEventListener('click', () => {
        paletteFor = paletteFor === p.id ? null : p.id;
        renderList();
      });
      const name = document.createElement('input');
      name.className = 'name-input';
      name.value = p.name;
      name.maxLength = 20;
      name.enterKeyHint = 'done';
      name.autocomplete = 'off';
      name.addEventListener('input', () => { p.name = name.value; save(); });
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
      const del = document.createElement('button');
      del.className = 'del-btn';
      del.type = 'button';
      del.textContent = '✕';
      del.setAttribute('aria-label', `Supprimer ${p.name}`);
      del.addEventListener('click', () => removePlayer(p.id));
      row.append(dot, name, del);
      listEl.append(row);
      if (paletteFor === p.id) listEl.append(renderPalette(p));
      continue;
    }

    const selected = p.id === state.selectedId;
    row.classList.toggle('selected', selected);
    row.classList.toggle('turn', p.id === state.turnId);
    row.classList.toggle('setting', selected && state.mode === 'set');

    const dot = document.createElement('span');
    dot.className = 'dot';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = (p.score === best && best > 0 ? '👑 ' : '') + p.name;

    const score = document.createElement('div');
    score.className = 'score' + (p.score >= WIN_SCORE ? ' win' : '');
    const total = document.createElement('span');
    total.className = 'total';
    total.textContent = fmt(p.score);
    const last = document.createElement('span');
    last.className = 'last';
    last.textContent = p.last == null ? ' ' : (p.last >= 0 ? '+' : '') + fmt(p.last);
    score.append(total, last);
    score.addEventListener('click', (e) => { e.stopPropagation(); selectPlayer(p.id, 'set'); });

    const box = document.createElement('div');
    box.className = 'add-box';
    if (selected) {
      box.classList.add('caret');
      box.textContent = (state.mode === 'set' ? '= ' : (state.negative ? '− ' : '+ ')) +
        (state.input ? fmt(parseInt(state.input, 10)) : '');
      if (state.mode === 'set' && state.negative) box.textContent = '= −' + (state.input ? fmt(parseInt(state.input, 10)) : '');
    } else {
      box.textContent = '+';
    }

    row.append(dot, name, score, box);
    row.addEventListener('click', () => selectPlayer(p.id, 'add'));
    listEl.append(row);
  }

  if (scrollToSelected && !editing) {
    scrollToSelected = false;
    const sel = listEl.querySelector('.player.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
}

function renderPalette(p) {
  const pal = document.createElement('div');
  pal.className = 'palette';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = c;
    b.setAttribute('aria-label', c);
    if (c === p.color) b.classList.add('current');
    b.addEventListener('click', () => {
      p.color = c;
      paletteFor = null;
      save();
      renderList();
    });
    pal.append(b);
  }
  return pal;
}

function renderEntry() {
  const p = byId(state.selectedId);
  const modeBtn = $('#modeBtn');
  modeBtn.classList.toggle('on', state.mode === 'set');
  modeBtn.textContent = state.mode === 'set' ? 'Annuler' : 'Corriger';
  if (!p) {
    $('#entryDot').style.background = '';
    $('#entryName').textContent = '';
    $('#entryCalc').textContent = 'Ajoute des joueurs';
    return;
  }
  $('#entryDot').style.background = p.color;
  const v = inputValue();
  if (state.mode === 'set') {
    $('#entryName').textContent = `Corriger le score de ${p.name}`;
    $('#entryCalc').textContent = `${fmt(p.score)} → ${state.input === '' ? '…' : fmt(v)}`;
  } else {
    $('#entryName').textContent = p.name;
    const sign = v < 0 || state.negative ? '−' : '+';
    $('#entryCalc').textContent = `${fmt(p.score)} ${sign} ${fmt(Math.abs(v))} = ${fmt(p.score + v)}`;
  }
}

/* ---------- Drag to reorder ---------- */

function startDrag(e, row) {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget;
  handle.setPointerCapture(e.pointerId);
  paletteFor = null;
  listEl.querySelectorAll('.palette').forEach((el) => el.remove());
  row.classList.add('dragging');
  let lastY = e.clientY;
  let scrollTimer = null;

  const place = (y) => {
    const rows = [...listEl.querySelectorAll('.player:not(.dragging)')];
    let before = null;
    for (const r of rows) {
      const rect = r.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) { before = r; break; }
    }
    if (before === row.nextSibling) return;
    // Move the siblings rather than the dragged row itself: detaching the
    // row would make it lose the pointer capture.
    const toMove = [];
    if (before && (before.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      for (let s = before; s !== row; s = s.nextSibling) toMove.push(s);
      const anchor = row.nextSibling;
      for (const m of toMove) listEl.insertBefore(m, anchor);
    } else {
      for (let s = row.nextSibling; s && s !== before; s = s.nextSibling) toMove.push(s);
      for (const m of toMove) listEl.insertBefore(m, row);
    }
  };

  const autoScroll = () => {
    const rect = listEl.getBoundingClientRect();
    const edge = 40;
    let d = 0;
    if (lastY < rect.top + edge) d = -8;
    else if (lastY > rect.bottom - edge) d = 8;
    if (d) { listEl.scrollTop += d; place(lastY); }
  };
  scrollTimer = setInterval(autoScroll, 16);

  const move = (ev) => { lastY = ev.clientY; place(lastY); };
  const end = () => {
    clearInterval(scrollTimer);
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    row.classList.remove('dragging');
    const order = [...listEl.querySelectorAll('.player')].map((r) => r.dataset.id);
    state.players.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    save();
    render();
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

/* ---------- Toast ---------- */

let toastTimer = null;
function toast(msg, ms = 1400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- Screen wake lock ---------- */

let wakeLock = null;
let wantWake = true;
try { wantWake = localStorage.getItem('dix-mille-wake') !== '0'; } catch (e) { /* ignore */ }

async function requestWake() {
  if (!wantWake || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return updateWakeBtn();
  if (wakeLock) return updateWakeBtn();
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; updateWakeBtn(); });
  } catch (e) {
    wakeLock = null;
  }
  updateWakeBtn();
}

function updateWakeBtn() {
  const btn = $('#wakeBtn');
  if (!('wakeLock' in navigator)) {
    btn.hidden = true;
    return;
  }
  btn.classList.toggle('on', !!wakeLock);
  btn.title = wakeLock ? 'Écran maintenu allumé' : 'Mise en veille autorisée';
}

$('#wakeBtn').addEventListener('click', async () => {
  wantWake = !wantWake;
  try { localStorage.setItem('dix-mille-wake', wantWake ? '1' : '0'); } catch (e) { /* ignore */ }
  if (wantWake) {
    await requestWake();
    toast(wakeLock ? 'Écran maintenu allumé' : 'Impossible de bloquer la veille');
  } else {
    if (wakeLock) await wakeLock.release();
    wakeLock = null;
    updateWakeBtn();
    toast('Mise en veille autorisée');
  }
});

document.addEventListener('visibilitychange', requestWake);
// Some browsers only grant the lock after a user gesture.
document.addEventListener('pointerdown', () => { if (wantWake && !wakeLock) requestWake(); }, { passive: true });

/* ---------- Fullscreen ---------- */

const root = document.documentElement;
const fsSupported = !!(root.requestFullscreen || root.webkitRequestFullscreen);
const isStandalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
  navigator.standalone === true;
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;

function updateFsBtn() {
  const btn = $('#fsBtn');
  // Already running as an installed app without the API: nothing to offer.
  btn.hidden = !fsSupported && isStandalone();
  btn.classList.toggle('on', !!fsElement());
  btn.title = fsElement() ? 'Quitter le plein écran' : 'Plein écran';
}

$('#fsBtn').addEventListener('click', async () => {
  if (!fsSupported) {
    // iPhone Safari has no Fullscreen API: installing on the home screen is the way.
    toast('Partager ⎙ puis « Sur l’écran d’accueil »', 4000);
    return;
  }
  try {
    if (fsElement()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else await (root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: 'hide' });
  } catch (e) {
    toast('Plein écran indisponible');
  }
});
document.addEventListener('fullscreenchange', updateFsBtn);
document.addEventListener('webkitfullscreenchange', updateFsBtn);
updateFsBtn();

/* ---------- Wiring ---------- */

$('#keypad').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (b) press(b.dataset.k);
});
// Avoid the 300ms delay / double-tap zoom on keys.
$('#keypad').addEventListener('dblclick', (e) => e.preventDefault());

$('#modeBtn').addEventListener('click', toggleMode);
$('#editBtn').addEventListener('click', () => setEditing(!editing));
$('#doneBtn').addEventListener('click', () => setEditing(false));
$('#addPlayerBtn').addEventListener('click', addPlayer);
$('#newGameBtn').addEventListener('click', newGame);

// Physical keyboard support (handy on desktop).
document.addEventListener('keydown', (e) => {
  if (editing || e.target.tagName === 'INPUT') return;
  if (/^[0-9]$/.test(e.key)) press(e.key);
  else if (e.key === 'Backspace') press('back');
  else if (e.key === 'Enter') press('ok');
  else if (e.key === '-') press('sign');
  else if ((e.ctrlKey || e.metaKey) && e.key === 'z') press('undo');
  else return;
  e.preventDefault();
});

ensureIds();
render();
requestWake();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
