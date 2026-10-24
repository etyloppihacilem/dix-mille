'use strict';

/* Scoppa score sheet: points are entered manche by manche. Four points go to
   a single team (or nobody on a tie), scopes are counted per team. */

const STORAGE_KEY = 'scoppa-state-v1';
const TARGETS = [11, 16, 21, 31];
const POINTS = [
  { key: 'cartes', label: 'Cartes', hint: 'le plus de cartes' },
  { key: 'deniers', label: 'Deniers', hint: 'le plus de deniers' },
  { key: 'settebello', label: '7 de deniers', hint: 'le settebellu' },
  { key: 'primiera', label: 'Primiera', hint: 'la meilleure prime' },
];

/* ---------- State ---------- */

const emptyManche = () => ({ points: {}, scopes: {} });

function defaultState() {
  const players = [1, 2].map((n, i) => ({ id: uid(), name: `Équipe ${n}`, color: COLORS[i * 5] }));
  return {
    players,
    target: 21,
    manches: [],          // validated manches, oldest first
    current: emptyManche(),
    editIndex: null,      // index of the validated manche being modified
    history: [],
    redo: [],
  };
}

function loadState() {
  const s = loadJSON(STORAGE_KEY);
  if (!s || !Array.isArray(s.players)) return defaultState();
  const state = { ...defaultState(), ...s };
  if (!Array.isArray(s.manches)) {
    // Older version kept a plain running total: carry it over as a manche.
    const carry = {};
    for (const p of s.players) if (p.score) carry[p.id] = p.score;
    state.manches = Object.keys(carry).length ? [{ ...emptyManche(), carry }] : [];
    state.players = s.players.map(({ id, name, color }) => ({ id, name, color }));
    state.history = [];
    state.redo = [];
  }
  return state;
}

let state = loadState();
let editing = false;

const save = () => saveJSON(STORAGE_KEY, state);
const byId = (id) => state.players.find((p) => p.id === id);

function mancheScore(m, pid) {
  let n = (m.carry?.[pid] ?? 0) + (m.scopes[pid] ?? 0);
  for (const pt of POINTS) if (m.points[pt.key] === pid) n++;
  return n;
}

const total = (pid) => state.manches.reduce((t, m) => t + mancheScore(m, pid), 0);
const isEmpty = (m) => !Object.values(m.points).some(Boolean) && !Object.values(m.scopes).some(Boolean);

// The team strictly ahead once at least one team reached the target.
function winner() {
  const totals = state.players.map((p) => [p, total(p.id)]).sort((a, b) => b[1] - a[1]);
  if (!totals.length || totals[0][1] < state.target) return null;
  if (totals.length > 1 && totals[1][1] === totals[0][1]) return null;
  return totals[0][0];
}

/* ---------- History ---------- */

function capture() {
  return JSON.parse(JSON.stringify({ manches: state.manches, current: state.current, editIndex: state.editIndex }));
}

function change(fn) {
  state.history.push(capture());
  if (state.history.length > 300) state.history.shift();
  state.redo = [];
  fn();
  save();
  render();
}

function undo() {
  const h = state.history.pop();
  if (!h) { toast('Rien à annuler'); return; }
  sfx.undo();
  state.redo.push(capture());
  Object.assign(state, h);
  save();
  render();
}

function redo() {
  const h = state.redo.pop();
  if (!h) return;
  sfx.redo();
  state.history.push(capture());
  Object.assign(state, h);
  save();
  render();
}

/* ---------- Actions ---------- */

function togglePoint(key, pid) {
  sfx.key();
  change(() => {
    state.current.points[key] = state.current.points[key] === pid ? null : pid;
  });
}

function addScope(pid, d) {
  const n = Math.max(0, (state.current.scopes[pid] ?? 0) + d);
  if (n === (state.current.scopes[pid] ?? 0)) return;
  sfx.key();
  change(() => { state.current.scopes[pid] = n; });
}

function validateManche() {
  if (isEmpty(state.current)) { toast('Aucun point dans cette manche'); return; }
  const before = winner();
  change(() => {
    if (state.editIndex != null) {
      state.manches[state.editIndex] = { ...state.manches[state.editIndex], ...state.current };
      toast(`Manche ${state.editIndex + 1} modifiée`);
    } else {
      state.manches.push(state.current);
    }
    state.current = emptyManche();
    state.editIndex = null;
  });
  const w = winner();
  if (w && w !== before) { sfx.win(); toast(`🏆 ${w.name} gagne avec ${total(w.id)} points !`, 3500); }
  else sfx.add();
  $('#sheet').scrollTop = 0;
}

function editManche(i) {
  if (!isEmpty(state.current) && state.editIndex == null &&
      !confirm('Abandonner les points saisis pour la manche en cours ?')) return;
  change(() => {
    const m = state.manches[i];
    state.current = { points: { ...m.points }, scopes: { ...m.scopes } };
    state.editIndex = i;
  });
  $('#sheet').scrollTop = 0;
}

function cancelEdit() {
  change(() => { state.current = emptyManche(); state.editIndex = null; });
}

function deleteManche(i) {
  if (!confirm(`Supprimer la manche ${i + 1} ?`)) return;
  change(() => {
    state.manches.splice(i, 1);
    if (state.editIndex === i) { state.current = emptyManche(); state.editIndex = null; }
    else if (state.editIndex > i) state.editIndex--;
  });
}

function addPlayer() {
  const p = { id: uid(), name: `Équipe ${state.players.length + 1}`, color: freeColor(state.players) };
  state.players.push(p);
  save();
  render();
  focusName(p.id);
}

function removePlayer(id) {
  state.players = state.players.filter((p) => p.id !== id);
  save();
  render();
}

function newGame() {
  if (!confirm('Effacer toutes les manches ?')) return;
  state.manches = [];
  state.current = emptyManche();
  state.editIndex = null;
  state.history = [];
  state.redo = [];
  save();
  render();
  toast('Nouvelle partie');
}

function setEditing(on) {
  editing = on;
  leaveEditor();
  if (!on) {
    for (const p of state.players) p.name = p.name.trim() || 'Équipe';
    save();
  }
  render();
}

/* ---------- Rendering ---------- */

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function render() {
  document.body.classList.toggle('editing', editing);
  $('#playPanel').hidden = editing;
  $('#editPanel').hidden = !editing;
  $('#sheet').hidden = editing;
  $('#players').hidden = !editing;
  $('#board').hidden = editing;
  $('#editBtn').textContent = editing ? 'Terminé' : 'Équipes';
  if (editing) {
    renderPlayerEditor($('#players'), state.players, { onChange: save, onRemove: removePlayer, rerender: render });
    renderTargets();
  } else {
    renderBoard();
    renderSheet();
  }
  $('#redoBtn').hidden = !state.redo.length;
  $('#validateBtn').textContent = state.editIndex != null ? `Enregistrer la manche ${state.editIndex + 1}` : 'Valider la manche';
}

function renderTargets() {
  const box = $('#targetChoices');
  box.textContent = '';
  for (const t of TARGETS) {
    const b = el('button', 'chip' + (t === state.target ? ' on' : ''), t);
    b.type = 'button';
    b.addEventListener('click', () => { state.target = t; save(); renderTargets(); });
    box.append(b);
  }
}

function renderBoard() {
  const board = $('#board');
  board.textContent = '';
  const w = winner();
  const best = Math.max(0, ...state.players.map((p) => total(p.id)));
  for (const p of state.players) {
    const t = total(p.id);
    const card = el('div', 'team' + (p === w ? ' won' : ''));
    card.style.setProperty('--pc', p.color);
    const name = el('div', 'team-name', (best > 0 && t === best ? '👑 ' : '') + p.name);
    const score = el('div', 'team-score', t);
    card.append(name, score);
    board.append(card);
  }
  const count = `${state.manches.length} manche${state.manches.length > 1 ? 's' : ''}`;
  const info = el('div', 'board-info' + (w ? ' won' : ''), w
    ? `🏆 ${w.name} gagne · ${count}`
    : `Partie en ${state.target} · ${count}`);
  board.append(info);
}

function renderSheet() {
  const sheet = $('#sheet');
  sheet.textContent = '';
  if (!state.players.length) {
    sheet.append(el('div', 'empty', 'Personne pour l’instant : touche « Équipes » pour commencer.'));
    return;
  }
  const m = state.current;
  const teams = state.players;
  const cols = `minmax(96px, 1.2fr) repeat(${teams.length}, minmax(64px, 1fr))`;

  const card = el('section', 'manche' + (state.editIndex != null ? ' editing-manche' : ''));
  const head = el('div', 'manche-head');
  head.append(el('h2', '', state.editIndex != null
    ? `Modifier la manche ${state.editIndex + 1}`
    : `Manche ${state.manches.length + 1}`));
  if (state.editIndex != null) {
    const cancel = el('button', 'link-btn', 'Annuler');
    cancel.type = 'button';
    cancel.addEventListener('click', cancelEdit);
    head.append(cancel);
  }
  card.append(head);

  const grid = el('div', 'manche-grid');
  grid.style.gridTemplateColumns = cols;
  grid.append(el('div'));
  for (const p of teams) {
    const th = el('div', 'col-head', p.name);
    th.style.setProperty('--pc', p.color);
    grid.append(th);
  }

  for (const pt of POINTS) {
    const label = el('div', 'pt-label');
    label.append(el('strong', '', pt.label), el('span', '', pt.hint));
    grid.append(label);
    for (const p of teams) {
      const on = m.points[pt.key] === p.id;
      const b = el('button', 'pt-btn' + (on ? ' on' : ''), on ? '+1' : '');
      b.type = 'button';
      b.style.setProperty('--pc', p.color);
      b.setAttribute('aria-label', `${pt.label} pour ${p.name}`);
      b.setAttribute('aria-pressed', on);
      b.addEventListener('click', () => togglePoint(pt.key, p.id));
      grid.append(b);
    }
  }

  const scopeLabel = el('div', 'pt-label');
  scopeLabel.append(el('strong', '', 'Scopes'), el('span', '', '1 point chacune'));
  grid.append(scopeLabel);
  for (const p of teams) {
    const n = m.scopes[p.id] ?? 0;
    const step = el('div', 'stepper' + (n ? ' on' : ''));
    step.style.setProperty('--pc', p.color);
    const minus = el('button', '', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', `Retirer une scopa à ${p.name}`);
    minus.addEventListener('click', () => addScope(p.id, -1));
    const plus = el('button', '', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', `Ajouter une scopa à ${p.name}`);
    plus.addEventListener('click', () => addScope(p.id, 1));
    step.append(minus, el('span', 'count', n), plus);
    grid.append(step);
  }

  grid.append(el('div', 'pt-label total-label', 'Total manche'));
  for (const p of teams) {
    const t = el('div', 'manche-total', `+${mancheScore(m, p.id)}`);
    t.style.setProperty('--pc', p.color);
    grid.append(t);
  }
  card.append(grid);
  sheet.append(card);

  if (state.manches.length) {
    const list = el('section', 'past');
    list.append(el('h3', '', 'Manches jouées'));
    for (let i = state.manches.length - 1; i >= 0; i--) {
      const pm = state.manches[i];
      const row = el('div', 'past-row' + (i === state.editIndex ? ' current' : ''));
      row.append(el('span', 'past-num', pm.carry ? 'Report' : `M${i + 1}`));
      const scores = el('span', 'past-scores');
      for (const p of teams) {
        const s = el('span', 'past-score', mancheScore(pm, p.id));
        s.style.setProperty('--pc', p.color);
        scores.append(s);
      }
      row.append(scores);
      if (!pm.carry) {
        const edit = el('button', 'past-btn', '✎');
        edit.type = 'button';
        edit.setAttribute('aria-label', `Modifier la manche ${i + 1}`);
        edit.addEventListener('click', () => editManche(i));
        row.append(edit);
      }
      const del = el('button', 'past-btn del', '✕');
      del.type = 'button';
      del.setAttribute('aria-label', `Supprimer la manche ${i + 1}`);
      del.addEventListener('click', () => deleteManche(i));
      row.append(del);
      list.append(row);
    }
    sheet.append(list);
  }
}

/* ---------- Wiring ---------- */

$('#validateBtn').addEventListener('click', validateManche);
$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);
$('#editBtn').addEventListener('click', () => setEditing(!editing));
$('#doneBtn').addEventListener('click', () => setEditing(false));
$('#addPlayerBtn').addEventListener('click', addPlayer);
$('#newGameBtn').addEventListener('click', newGame);

document.addEventListener('keydown', (e) => {
  if (editing || e.target.tagName === 'INPUT') return;
  if (e.key === 'Enter') validateManche();
  else if ((e.ctrlKey || e.metaKey) && e.key === 'z') undo();
  else return;
  e.preventDefault();
});

render();
initChrome();
