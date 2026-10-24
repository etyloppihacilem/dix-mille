'use strict';

/* Yams score sheet: one column per player, one row per combination. */

const STORAGE_KEY = 'yams-state-v1';
const BONUS_THRESHOLD = 63;
const BONUS = 35;
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// face: upper section row; fixed: combination worth a fixed amount;
// calc: computed total, not editable.
const ROWS = [
  ...FACES.map((glyph, i) => ({ key: String(i + 1), label: i === 0 ? 'As' : String(i + 1), die: glyph, face: i + 1 })),
  { key: 'upper', label: 'Total haut', calc: true },
  { key: 'bonus', label: `Bonus (${BONUS_THRESHOLD})`, calc: true },
  { key: 'brelan', label: 'Brelan', hint: 'total des dés' },
  { key: 'carre', label: 'Carré', hint: 'total des dés' },
  { key: 'full', label: 'Full', fixed: 25 },
  { key: 'petite', label: 'Petite suite', fixed: 30 },
  { key: 'grande', label: 'Grande suite', fixed: 40 },
  { key: 'yams', label: 'Yams', fixed: 50 },
  { key: 'chance', label: 'Chance', hint: 'total des dés' },
  { key: 'lower', label: 'Total bas', calc: true },
  { key: 'total', label: 'Total', calc: true },
];
const PLAY_ROWS = ROWS.filter((r) => !r.calc);
const rowByKey = (k) => ROWS.find((r) => r.key === k);

/* ---------- State ---------- */

function defaultState() {
  const players = [1, 2].map((n, i) => ({ id: uid(), name: `Joueur ${n}`, color: COLORS[i * 5] }));
  return {
    players,
    cells: {},     // { playerId: { rowKey: points } }
    turnId: players[0].id,
    sel: null,     // { pid, row } cell being filled
    input: '',
    history: [],
    redo: [],
  };
}

function loadState() {
  const s = loadJSON(STORAGE_KEY);
  if (s && Array.isArray(s.players)) return { ...defaultState(), ...s, input: '', sel: null };
  return defaultState();
}

let state = loadState();
let editing = false;

function save() {
  const { input, sel, ...rest } = state;
  saveJSON(STORAGE_KEY, rest);
}

const byId = (id) => state.players.find((p) => p.id === id);
const indexOf = (id) => state.players.findIndex((p) => p.id === id);
const cell = (pid, row) => state.cells[pid]?.[row] ?? null;

function ensureIds() {
  if (!state.players.length) { state.turnId = null; state.sel = null; return; }
  if (!byId(state.turnId)) state.turnId = state.players[0].id;
  if (state.sel && !byId(state.sel.pid)) state.sel = null;
}

function nextId(id) {
  return state.players[(indexOf(id) + 1) % state.players.length].id;
}

/* ---------- Totals ---------- */

function sum(pid, rows) {
  return rows.reduce((t, r) => t + (cell(pid, r.key) ?? 0), 0);
}

function totals(pid) {
  const upperRows = ROWS.filter((r) => r.face);
  const upper = sum(pid, upperRows);
  const upperDone = upperRows.every((r) => cell(pid, r.key) != null);
  const bonus = upper >= BONUS_THRESHOLD ? BONUS : 0;
  const lower = sum(pid, ROWS.filter((r) => !r.face && !r.calc));
  return { upper, upperDone, bonus, lower, total: upper + bonus + lower };
}

const isComplete = (pid) => PLAY_ROWS.every((r) => cell(pid, r.key) != null);

/* ---------- History ---------- */

function capture() {
  return { cells: JSON.parse(JSON.stringify(state.cells)), turnId: state.turnId };
}

function restore(h) {
  state.cells = h.cells;
  state.turnId = h.turnId;
  state.sel = null;
  state.input = '';
  ensureIds();
}

function snapshot() {
  state.history.push(capture());
  if (state.history.length > 300) state.history.shift();
  state.redo = [];
}

function undo() {
  const h = state.history.pop();
  if (!h) { toast('Rien à annuler'); return; }
  sfx.undo();
  state.redo.push(capture());
  restore(h);
  toast('Annulé');
}

function redo() {
  const h = state.redo.pop();
  if (!h) return;
  sfx.redo();
  state.history.push(capture());
  restore(h);
  toast('Rétabli');
}

/* ---------- Actions ---------- */

function selectCell(pid, row) {
  if (editing) return;
  const same = state.sel && state.sel.pid === pid && state.sel.row === row;
  state.sel = same ? null : { pid, row };
  state.input = '';
  render();
}

// Writes `value` (null clears the cell) into the selected cell.
function commit(value) {
  if (!state.sel) { toast('Touche d’abord une case'); return; }
  const { pid, row } = state.sel;
  const wasEmpty = cell(pid, row) == null;
  const wasDone = state.players.every((p) => isComplete(p.id));
  snapshot();
  state.cells[pid] = state.cells[pid] || {};
  if (value == null) delete state.cells[pid][row];
  else state.cells[pid][row] = value;
  if (wasEmpty && value != null) {
    // A new box filled: that player's turn is over.
    state.turnId = nextId(pid);
    if (value === 0) sfx.zero(); else sfx.add();
  } else {
    sfx.set();
  }
  state.sel = null;
  state.input = '';

  if (!wasDone && state.players.every((p) => isComplete(p.id))) {
    const best = Math.max(...state.players.map((p) => totals(p.id).total));
    const winners = state.players.filter((p) => totals(p.id).total === best).map((p) => p.name);
    sfx.win();
    toast(`🏆 ${winners.join(' et ')} : ${fmt(best)}`, 4000);
  }
  save();
  render();
}

function press(k) {
  if (editing || !state.players.length) return;
  switch (k) {
    case 'back':
      sfx.key();
      state.input = state.input.slice(0, -1);
      break;
    case 'cross':
      commit(0);
      return;
    case 'undo':
      undo();
      break;
    case 'ok':
      if (!state.sel) { toast('Touche d’abord une case'); return; }
      if (state.input === '') { toast('Tape une valeur ou ✗ pour barrer'); return; }
      commit(parseInt(state.input, 10));
      return;
    default:
      if (/^\d$/.test(k)) {
        if (!state.sel) { toast('Touche d’abord une case'); return; }
        sfx.key();
        const s = (state.input + k).replace(/^0+(?=\d)/, '');
        if (s.length <= 3) state.input = s;
      }
  }
  save();
  render();
}

function addPlayer() {
  const p = { id: uid(), name: `Joueur ${state.players.length + 1}`, color: freeColor(state.players) };
  state.players.push(p);
  ensureIds();
  save();
  render();
  focusName(p.id);
}

function removePlayer(id) {
  if (state.turnId === id && state.players.length > 1) state.turnId = nextId(id);
  state.players.splice(indexOf(id), 1);
  delete state.cells[id];
  ensureIds();
  save();
  render();
}

function newGame() {
  if (!confirm('Effacer toutes les feuilles de score ?')) return;
  state.cells = {};
  state.history = [];
  state.redo = [];
  state.sel = null;
  state.input = '';
  state.turnId = state.players[0]?.id ?? null;
  save();
  render();
  toast('Nouvelle partie');
}

function setEditing(on) {
  editing = on;
  leaveEditor();
  state.sel = null;
  state.input = '';
  if (!on) {
    for (const p of state.players) p.name = p.name.trim() || 'Joueur';
    save();
  }
  render();
}

/* ---------- Rendering ---------- */

const gridEl = $('#grid');
const listEl = $('#players');

function render() {
  document.body.classList.toggle('editing', editing);
  $('#playPanel').hidden = editing;
  $('#editPanel').hidden = !editing;
  gridEl.hidden = editing;
  listEl.hidden = !editing;
  $('#editBtn').textContent = editing ? 'Terminé' : 'Joueurs';
  if (editing) renderPlayerEditor(listEl, state.players, { onChange: save, onRemove: removePlayer, rerender: render });
  else renderGrid();
  renderEntry();
}

function renderGrid() {
  gridEl.textContent = '';
  if (!state.players.length) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = 'Personne pour l’instant : touche « Joueurs » pour commencer.';
    gridEl.append(d);
    return;
  }
  const all = Object.fromEntries(state.players.map((p) => [p.id, totals(p.id)]));
  const best = Math.max(...state.players.map((p) => all[p.id].total));

  const table = document.createElement('table');
  table.className = 'sheet';
  const head = table.createTHead().insertRow();
  head.append(document.createElement('th'));
  for (const p of state.players) {
    const th = document.createElement('th');
    th.className = 'pcol' + (p.id === state.turnId ? ' turn' : '');
    th.style.setProperty('--pc', p.color);
    th.textContent = (best > 0 && all[p.id].total === best ? '👑 ' : '') + p.name;
    head.append(th);
  }

  const body = table.createTBody();
  for (const r of ROWS) {
    const tr = body.insertRow();
    tr.className = r.calc ? 'calc' : '';
    if (r.key === 'total') tr.classList.add('grand');
    if (r.key === 'brelan' || r.key === 'upper') tr.classList.add('sep');
    const label = document.createElement('th');
    if (r.die) {
      const die = document.createElement('span');
      die.className = 'die';
      die.textContent = r.die;
      label.append(die, ' ');
    }
    label.append(r.label);
    tr.append(label);
    for (const p of state.players) {
      const td = tr.insertCell();
      td.style.setProperty('--pc', p.color);
      if (p.id === state.turnId) td.classList.add('turn');
      const t = all[p.id];
      if (r.calc) {
        if (r.key === 'bonus') {
          if (t.bonus) td.textContent = t.bonus;
          else if (t.upperDone) td.textContent = '0';
          else { td.textContent = `−${BONUS_THRESHOLD - t.upper}`; td.classList.add('hint'); }
        } else {
          td.textContent = fmt(t[r.key]);
        }
        continue;
      }
      const v = cell(p.id, r.key);
      const selected = state.sel && state.sel.pid === p.id && state.sel.row === r.key;
      td.className += ' box' + (v === 0 ? ' crossed' : '') + (selected ? ' selected' : '');
      if (selected && state.input) td.textContent = state.input;
      else td.textContent = v == null ? '' : v === 0 ? '✗' : v;
      if (selected) td.classList.add('caret');
      td.addEventListener('click', () => selectCell(p.id, r.key));
    }
  }
  gridEl.append(table);

  const sel = gridEl.querySelector('td.selected') || gridEl.querySelector('th.turn');
  if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function quickValues(r) {
  if (r.face) return [1, 2, 3, 4, 5].map((n) => n * r.face);
  if (r.fixed) return [r.fixed];
  return [];
}

function renderEntry() {
  const quick = $('#quick');
  quick.textContent = '';
  $('#redoBtn').hidden = !state.redo.length;

  if (!state.players.length) {
    $('#entryDot').style.background = '';
    $('#entryName').textContent = '';
    $('#entryCalc').textContent = 'Ajoute des joueurs';
    return;
  }
  if (!state.sel) {
    const p = byId(state.turnId);
    if (state.players.every((pl) => isComplete(pl.id))) {
      const best = Math.max(...state.players.map((pl) => totals(pl.id).total));
      const winners = state.players.filter((pl) => totals(pl.id).total === best);
      $('#entryDot').style.background = winners[0].color;
      $('#entryName').textContent = 'Partie terminée';
      $('#entryCalc').textContent = `🏆 ${winners.map((w) => w.name).join(' et ')} : ${fmt(best)}`;
      return;
    }
    $('#entryDot').style.background = p.color;
    $('#entryName').textContent = `Au tour de ${p.name}`;
    $('#entryCalc').textContent = 'Touche une case';
    return;
  }

  const p = byId(state.sel.pid);
  const r = rowByKey(state.sel.row);
  const current = cell(p.id, r.key);
  $('#entryDot').style.background = p.color;
  $('#entryName').textContent = `${p.name} · ${r.label}${r.hint ? ` (${r.hint})` : ''}`;
  $('#entryCalc').textContent = state.input
    ? `${state.input} pts`
    : current == null ? '…' : `Actuel : ${current === 0 ? '✗' : current}`;

  const chip = (text, value, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip ' + cls;
    b.textContent = text;
    b.addEventListener('click', () => commit(value));
    quick.append(b);
  };
  chip('✗ Barrer', 0, 'cross');
  for (const v of quickValues(r)) chip(String(v), v);
  if (current != null) chip('Vider', null, 'clear');
}

/* ---------- Wiring ---------- */

$('#keypad').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (b) press(b.dataset.k);
});
$('#redoBtn').addEventListener('click', () => { redo(); save(); render(); });
$('#editBtn').addEventListener('click', () => setEditing(!editing));
$('#doneBtn').addEventListener('click', () => setEditing(false));
$('#addPlayerBtn').addEventListener('click', addPlayer);
$('#newGameBtn').addEventListener('click', newGame);

document.addEventListener('keydown', (e) => {
  if (editing || e.target.tagName === 'INPUT') return;
  if (/^[0-9]$/.test(e.key)) press(e.key);
  else if (e.key === 'Backspace') press('back');
  else if (e.key === 'Enter') press('ok');
  else if (e.key === 'Escape') { state.sel = null; state.input = ''; render(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'z') press('undo');
  else return;
  e.preventDefault();
});

ensureIds();
render();
initChrome();
