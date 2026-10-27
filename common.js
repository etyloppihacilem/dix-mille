'use strict';

/* Shared helpers for every score sheet: sound, wake lock, fullscreen,
   toast and the player editor (name, color, order). */

const COLORS = [
  '#e53935', '#fb8c00', '#fdd835', '#43a047', '#00897b',
  '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#6d4c41',
  '#546e7a', '#000000',
];

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => n.toLocaleString('fr-FR');
const uid = () => Math.random().toString(36).slice(2, 10);

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}

function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

function freeColor(players) {
  const used = new Set(players.map((p) => p.color));
  return COLORS.find((c) => !used.has(c)) || COLORS[players.length % COLORS.length];
}

/* ---------- Toast ---------- */

let toastTimer = null;
function toast(msg, ms = 1400) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- Sound effects ---------- */

let audioCtx = null;
let audioOut = null;
let soundOn = true;
try { soundOn = localStorage.getItem('dix-mille-sound') !== '0'; } catch (e) { /* ignore */ }

// Plays a sequence of soft notes: [frequency, start offset (s), duration (s)].
function tones(notes, volume = 0.8, type = 'sine') {
  if (!soundOn) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Limiter so overlapping notes stay loud without clipping.
      audioOut = audioCtx.createDynamicsCompressor();
      audioOut.threshold.value = -3;
      audioOut.knee.value = 0;
      audioOut.ratio.value = 20;
      audioOut.attack.value = 0.001;
      audioOut.release.value = 0.05;
      audioOut.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    for (const [freq, at, dur] of notes) {
      const t = now + at;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(audioOut);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  } catch (e) { /* no audio available */ }
}

const sfx = {
  key: () => tones([[1400, 0, 0.03]], 0.3, 'triangle'),
  add: () => tones([[660, 0, 0.09], [880, 0.07, 0.14]]),
  zero: () => tones([[392, 0, 0.1], [330, 0.08, 0.16]], 0.75),
  set: () => tones([[587, 0, 0.14]], 0.75),
  redo: () => tones([[587, 0, 0.08], [880, 0.06, 0.12]], 0.65),
  undo: () => tones([[880, 0, 0.08], [587, 0.06, 0.12]], 0.65),
  win: () => tones([[523, 0, 0.12], [659, 0.09, 0.12], [784, 0.18, 0.12], [1047, 0.27, 0.3]], 0.8),
};

function initSoundBtn() {
  const btn = $('#soundBtn');
  if (!btn) return;
  const update = () => {
    btn.classList.toggle('off', !soundOn);
    btn.title = soundOn ? 'Couper le son' : 'Activer le son';
  };
  btn.addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem('dix-mille-sound', soundOn ? '1' : '0'); } catch (e) { /* ignore */ }
    update();
    if (soundOn) sfx.add();
  });
  update();
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
  if (!btn) return;
  if (!('wakeLock' in navigator)) {
    btn.hidden = true;
    return;
  }
  btn.classList.toggle('on', !!wakeLock);
  btn.title = wakeLock ? 'Écran maintenu allumé' : 'Mise en veille autorisée';
}

function initWakeLock() {
  const btn = $('#wakeBtn');
  if (btn) {
    btn.addEventListener('click', async () => {
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
  }
  document.addEventListener('visibilitychange', requestWake);
  // Some browsers only grant the lock after a user gesture.
  document.addEventListener('pointerdown', () => { if (wantWake && !wakeLock) requestWake(); }, { passive: true });
  requestWake();
}

/* ---------- Fullscreen ---------- */

const docRoot = document.documentElement;
const fsSupported = !!(docRoot.requestFullscreen || docRoot.webkitRequestFullscreen);
const isStandalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
  navigator.standalone === true;
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;

function initFullscreen() {
  const btn = $('#fsBtn');
  if (!btn) return;
  const update = () => {
    // Already running as an installed app without the API: nothing to offer.
    btn.hidden = !fsSupported && isStandalone();
    btn.classList.toggle('on', !!fsElement());
    btn.title = fsElement() ? 'Quitter le plein écran' : 'Plein écran';
  };
  btn.addEventListener('click', async () => {
    if (!fsSupported) {
      // iPhone Safari has no Fullscreen API: installing on the home screen is the way.
      toast('Partager ⎙ puis « Sur l’écran d’accueil »', 4000);
      return;
    }
    try {
      if (fsElement()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else await (docRoot.requestFullscreen || docRoot.webkitRequestFullscreen).call(docRoot, { navigationUI: 'hide' });
    } catch (e) {
      toast('Plein écran indisponible');
    }
  });
  document.addEventListener('fullscreenchange', update);
  document.addEventListener('webkitfullscreenchange', update);
  update();
}

/* ---------- Drag to reorder ---------- */

// Drags `row` (a child of `listEl` matching `.player`) with the pointer that
// started on its handle; `onDone(ids)` receives the new order of data-id.
function startDragSort(e, row, listEl, onDone) {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget;
  handle.setPointerCapture(e.pointerId);
  listEl.querySelectorAll('.palette').forEach((el) => el.remove());
  row.classList.add('dragging');
  let lastY = e.clientY;

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
  const scrollTimer = setInterval(autoScroll, 16);

  const move = (ev) => { lastY = ev.clientY; place(lastY); };
  const end = () => {
    clearInterval(scrollTimer);
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    row.classList.remove('dragging');
    onDone([...listEl.querySelectorAll('.player')].map((r) => r.dataset.id));
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

function sortByIds(players, ids) {
  players.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

function makeHandle(row, listEl, onDone) {
  const handle = document.createElement('div');
  handle.className = 'handle';
  handle.textContent = '⋮⋮';
  handle.setAttribute('aria-label', 'Déplacer');
  handle.addEventListener('pointerdown', (e) => startDragSort(e, row, listEl, onDone));
  handle.addEventListener('click', (e) => e.stopPropagation());
  return handle;
}

/* ---------- Player editor ---------- */

// Renders editable rows (handle, color, name, delete) for `players` into
// `listEl`. `opts.onChange()` persists, `opts.onRemove(id)` deletes,
// `opts.rerender()` redraws the whole page after a reorder,
// `opts.removeText(p)` words the confirmation of a removal.
let paletteFor = null;
function renderPlayerEditor(listEl, players, opts) {
  listEl.textContent = '';
  const redraw = () => renderPlayerEditor(listEl, players, opts);
  for (const p of players) {
    const row = document.createElement('div');
    row.className = 'player';
    row.dataset.id = p.id;
    row.style.setProperty('--pc', p.color);
    row.append(makeHandle(row, listEl, (ids) => {
      paletteFor = null;
      sortByIds(players, ids);
      opts.onChange();
      opts.rerender();
    }));

    const dot = document.createElement('button');
    dot.className = 'dot';
    dot.type = 'button';
    dot.setAttribute('aria-label', 'Couleur');
    dot.addEventListener('click', () => {
      paletteFor = paletteFor === p.id ? null : p.id;
      redraw();
    });
    const name = document.createElement('input');
    name.className = 'name-input';
    name.value = p.name;
    name.maxLength = 20;
    name.enterKeyHint = 'done';
    name.autocomplete = 'off';
    name.addEventListener('input', () => { p.name = name.value; opts.onChange(); });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
    const del = document.createElement('button');
    del.className = 'del-btn';
    del.type = 'button';
    del.textContent = '✕';
    del.setAttribute('aria-label', `Retirer ${p.name}`);
    del.addEventListener('click', () => {
      if (confirm(opts.removeText ? opts.removeText(p) : `Supprimer ${p.name} ?`)) opts.onRemove(p.id);
    });
    row.append(dot, name, del);
    listEl.append(row);

    if (paletteFor === p.id) {
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
          opts.onChange();
          redraw();
        });
        pal.append(b);
      }
      listEl.append(pal);
    }
  }
}

function focusName(id) {
  const input = document.querySelector(`.player[data-id="${id}"] .name-input`);
  if (input) { input.focus(); input.select(); }
}

function leaveEditor() {
  paletteFor = null;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

/* ---------- Page setup ---------- */

function initChrome() {
  initSoundBtn();
  initWakeLock();
  initFullscreen();
  // Avoid the double-tap zoom on keypads.
  document.querySelectorAll('.keypad').forEach((k) => k.addEventListener('dblclick', (e) => e.preventDefault()));
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}
