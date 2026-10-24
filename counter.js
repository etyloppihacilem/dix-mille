'use strict';

/* Running-total score sheet (dix-mille, scoppa…). Configured by window.GAME:
   storageKey, target (winning score), targetChoices (optional list the
   players can pick from), defaultName, maxDigits. */

const GAME = {
  storageKey: 'dix-mille-state-v1',
  target: 10000,
  targetChoices: null,
  defaultName: 'Joueur',
  maxDigits: 6,
  ...window.GAME,
};

/* ---------- State ---------- */

function defaultState() {
  const players = [1, 2].map((n, i) => ({
    id: uid(), name: `${GAME.defaultName} ${n}`, color: COLORS[i * 5], score: 0, last: null,
  }));
  return {
    players,
    turnId: players[0].id,     // whose turn it is in the normal rotation
    selectedId: players[0].id, // player whose value is being typed
    mode: 'add',               // 'add' = ajouter au score, 'set' = corriger le score
    input: '',
    negative: false,
    target: GAME.target,
    history: [],
    redo: [],
  };
}

function loadState() {
  const s = loadJSON(GAME.storageKey);
  if (s && Array.isArray(s.players)) return { ...defaultState(), ...s, input: '', negative: false, mode: 'add' };
  return defaultState();
}

let state = loadState();
let editing = false;

const target = () => (GAME.targetChoices ? state.target : GAME.target);

function save() {
  const { input, negative, ...rest } = state;
  saveJSON(GAME.storageKey, rest);
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

function capture() {
  return {
    scores: state.players.map((p) => [p.id, p.score, p.last]),
    turnId: state.turnId,
  };
}

function restore(h) {
  for (const [id, score, last] of h.scores) {
    const p = byId(id);
    if (p) { p.score = score; p.last = last; }
  }
  state.turnId = h.turnId;
  ensureIds();
  state.selectedId = state.turnId;
  state.mode = 'add';
  clearInput();
}

function snapshot() {
  state.history.push(capture());
  if (state.history.length > 300) state.history.shift();
  state.redo = [];
}

function undo() {
  const h = state.history.pop();
  if (!h) { toast('Rien à annuler'); return; }
  state.redo.push(capture());
  restore(h);
  toast('Annulé');
}

function redo() {
  const h = state.redo.pop();
  if (!h) return;
  state.history.push(capture());
  restore(h);
  toast('Rétabli');
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
      sfx.key();
      if (state.input) state.input = state.input.slice(0, -1);
      else state.negative = false;
      break;
    case 'sign':
      sfx.key();
      state.negative = !state.negative;
      break;
    case 'undo':
      if (state.history.length) sfx.undo();
      undo();
      break;
    case 'ok':
      validate();
      break;
    default:
      if (/^\d+$/.test(k)) {
        sfx.key();
        let s = state.input + k;
        s = s.replace(/^0+(?=\d)/, '');
        if (s.length <= GAME.maxDigits) state.input = s;
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
    sfx.set();
    state.selectedId = state.turnId;
    toast(`Score de ${p.name} corrigé`);
  } else {
    snapshot();
    const v = inputValue();
    const before = p.score;
    p.score += v;
    p.last = v;
    if (before < target() && p.score >= target()) { sfx.win(); toast(`${p.name} atteint ${fmt(target())} !`, 2500); }
    else if (v === 0) sfx.zero();
    else sfx.add();
    state.turnId = nextId(p.id);
    state.selectedId = state.turnId;
  }
  clearInput();
  scrollToSelected = true;
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
  const p = {
    id: uid(), name: `${GAME.defaultName} ${state.players.length + 1}`,
    color: freeColor(state.players), score: 0, last: null,
  };
  state.players.push(p);
  ensureIds();
  save();
  render();
  focusName(p.id);
}

function removePlayer(id) {
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
  state.redo = [];
  state.turnId = state.selectedId = state.players[0]?.id ?? null;
  state.mode = 'add';
  clearInput();
  save();
  render();
  toast('Nouvelle partie');
}

function setEditing(on) {
  editing = on;
  leaveEditor();
  if (!on) {
    for (const p of state.players) p.name = p.name.trim() || GAME.defaultName;
    state.mode = 'add';
    state.selectedId = state.turnId;
    clearInput();
    save();
  }
  render();
}

/* ---------- Rendering ---------- */

const listEl = $('#players');
const editLabel = $('#editBtn').textContent;
let scrollToSelected = true;

function render() {
  document.body.classList.toggle('editing', editing);
  $('#playPanel').hidden = editing;
  $('#editPanel').hidden = !editing;
  $('#editBtn').textContent = editing ? 'Terminé' : editLabel;
  if (editing) {
    renderPlayerEditor(listEl, state.players, { onChange: save, onRemove: removePlayer, rerender: render });
    renderTargetChoices();
  } else {
    renderList();
  }
  renderEntry();
}

function renderTargetChoices() {
  const box = $('#targetChoices');
  if (!box || !GAME.targetChoices) return;
  box.textContent = '';
  for (const t of GAME.targetChoices) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (t === state.target ? ' on' : '');
    b.textContent = fmt(t);
    b.addEventListener('click', () => { state.target = t; save(); renderTargetChoices(); });
    box.append(b);
  }
}

function renderList() {
  listEl.textContent = '';
  if (!state.players.length) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = `Personne pour l’instant : touche « ${editLabel} » pour commencer.`;
    listEl.append(d);
    return;
  }
  const best = Math.max(...state.players.map((p) => p.score));
  for (const p of state.players) {
    const row = document.createElement('div');
    row.className = 'player';
    row.dataset.id = p.id;
    row.style.setProperty('--pc', p.color);
    row.append(makeHandle(row, listEl, (ids) => { sortByIds(state.players, ids); save(); render(); }));

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
    score.className = 'score' + (p.score >= target() ? ' win' : '');
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
      const digits = state.input ? fmt(parseInt(state.input, 10)) : '';
      if (state.mode === 'set') box.textContent = '= ' + (state.negative ? '−' : '') + digits;
      else box.textContent = (state.negative ? '− ' : '+ ') + digits;
    } else {
      box.textContent = '+';
    }

    row.append(dot, name, score, box);
    row.addEventListener('click', () => selectPlayer(p.id, 'add'));
    listEl.append(row);
  }

  if (scrollToSelected) {
    scrollToSelected = false;
    const sel = listEl.querySelector('.player.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
}

function renderEntry() {
  const p = byId(state.selectedId);
  const modeBtn = $('#modeBtn');
  modeBtn.classList.toggle('on', state.mode === 'set');
  $('#redoBtn').hidden = !state.redo.length;
  modeBtn.textContent = state.mode === 'set' ? 'Retour' : 'Corriger';
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

/* ---------- Wiring ---------- */

$('#keypad').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (b) press(b.dataset.k);
});

$('#modeBtn').addEventListener('click', toggleMode);
$('#redoBtn').addEventListener('click', () => {
  if (!state.redo.length) return;
  sfx.redo();
  redo();
  save();
  render();
});
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
initChrome();
