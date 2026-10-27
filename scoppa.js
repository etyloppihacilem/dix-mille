'use strict';

/* Scoppa score sheet: points are entered manche by manche. Four points go to
   a single team (or nobody on a tie), scopes are counted per team. */

const STORAGE_KEY = 'scoppa-state-v1';
const TARGETS = [11, 16, 21, 31];
const POINTS = [
  { key: 'cartes', label: 'Carte', hint: 'le plus de cartes' },
  { key: 'deniers', label: 'Denari', hint: '' },
  { key: 'settebello', label: 'Settebello', hint: '' },
  { key: 'primiera', label: 'Primiera', hint: 'la meilleure primiera' },
];

/* ---------- State ---------- */

const emptyManche = () => ({ points: {}, scopes: {} });

// Teams are made of roster players; a team's name and color follow its members.
function refreshTeams(st) {
  for (const t of st.players) {
    t.members = (t.members || []).filter((id) => rosterById(id));
    if (!t.members.length) continue;
    t.name = t.members.map((id) => rosterById(id).name).join(' & ');
    t.color = rosterById(t.members[0]).color;
  }
}

function defaultState() {
  const players = defaultRosterPlayers().map((r) => ({ id: uid(), members: [r.id], name: r.name, color: r.color }));
  return {
    gameId: gameUid(), // identifies the game in the global history
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
  // Teams saved before the shared roster: a team named after a player
  // becomes that player's team.
  for (const t of state.players) {
    if (Array.isArray(t.members)) continue;
    t.members = [];
    if (/^Équipe \d+$/.test(t.name)) continue;
    const r = roster.find((p) => sameName(p.name, t.name)) || newRosterPlayer(t.name);
    t.members.push(r.id);
  }
  refreshTeams(state);
  return state;
}

let state = loadState();
let editing = false;

function save() {
  saveJSON(STORAGE_KEY, state);
  syncRecord();
}

// A won game is recorded in the global history for every member of every
// team; it is removed again if an undo takes the win back.
function syncRecord() {
  const w = winner();
  const teams = state.players.filter((t) => t.members.length);
  if (!w || !teams.length) { unrecordGame(state.gameId); return; }
  recordGame({
    gameId: state.gameId,
    game: 'scoppa',
    players: teams.flatMap((t) => t.members.map((id) => ({
      id, name: rosterById(id).name, color: rosterById(id).color, score: total(t.id), team: t.name, turns: state.manches.length,
    }))),
    winners: w.members,
  });
}
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

/* ---------- Statistics ---------- */

function showStats() {
  const teams = state.players;
  const played = state.manches.filter((m) => !m.carry);
  const series = teams.map((p) => {
    let t = 0;
    return {
      name: p.name,
      color: p.color,
      points: [[0, 0], ...state.manches.map((m, i) => [i + 1, (t += mancheScore(m, p.id))])],
    };
  });
  const count = (pid, key) => played.filter((m) => m.points[key] === pid).length;
  const scopes = (pid) => played.reduce((t, m) => t + (m.scopes[pid] ?? 0), 0);
  const bestManche = (pid) => Math.max(0, ...played.map((m) => mancheScore(m, pid)));
  // Manches where the team scored strictly more than every other team.
  const won = (pid) => played.filter((m) => teams.every((o) => o.id === pid || mancheScore(m, o.id) < mancheScore(m, pid))).length;

  const w = winner();
  const best = Math.max(0, ...teams.map((p) => total(p.id)));
  const leaders = teams.filter((p) => total(p.id) === best).map((p) => p.name).join(' et ');
  const n = state.manches.length;
  openStats({
    title: w ? 'Fin de partie' : 'Statistiques',
    headline: `${w ? `🏆 ${w.name}` : `👑 ${leaders}`} : ${best} points · ${n} manche${n > 1 ? 's' : ''}`,
    series,
    chart: { target: state.target, xName: 'manche', xTitle: 'Manche' },
    tables: [{
      title: 'Résumé',
      players: teams,
      rows: [
        ['Total', ...teams.map((p) => total(p.id))],
        ['Manches gagnées', ...teams.map((p) => won(p.id))],
        ['Meilleure manche', ...teams.map((p) => bestManche(p.id))],
        ...POINTS.map((pt) => [pt.label, ...teams.map((p) => count(p.id, pt.key))]),
        ['Scope', ...teams.map((p) => scopes(p.id))],
      ],
    }],
    onNewGame: newGame,
  });
}

/* ---------- Actions ---------- */

/* ---------- Primiera calculator ---------- */

// Best card of each suit: 7 = 21, 6 = 18, 1 = 16, 5 = 15 … 2 = 12, heads = 10.
const PRIM_CARDS = [['7', 21], ['6', 18], ['1', 16], ['5', 15], ['4', 14], ['3', 13], ['2', 12], ['Tête', 10]];
const SUITS = ['Denari', 'Coppe', 'Spade', 'Bastoni'];
let primTeam = null;

const primOf = (pid) => {
  state.current.prim = state.current.prim || {};
  return (state.current.prim[pid] = state.current.prim[pid] || [null, null, null, null]);
};
const primComplete = (pid) => primOf(pid).every((v) => v != null);
const primTotal = (pid) => primOf(pid).reduce((t, v) => t + (v ?? 0), 0);

// A team missing a suit has no primiera; the best complete total wins, a tie gives it to nobody.
function primWinner() {
  const ranked = state.players.filter((p) => primComplete(p.id)).sort((a, b) => primTotal(b.id) - primTotal(a.id));
  if (!ranked.length) return { winner: null, why: 'Choisis la meilleure carte de chaque couleur.' };
  if (ranked.length > 1 && primTotal(ranked[0].id) === primTotal(ranked[1].id)) {
    return { winner: null, why: `Égalité à ${primTotal(ranked[0].id)} : personne ne marque.` };
  }
  return { winner: ranked[0], why: `${ranked[0].name} : ${primTotal(ranked[0].id)} points` };
}

function openPrimiera() {
  primTeam = primTeam && byId(primTeam) ? primTeam : state.players[0]?.id;
  renderPrimiera();
}

function renderPrimiera() {
  closeStats();
  const overlay = el('div', 'stats-overlay');
  overlay.id = 'statsOverlay';
  const sheet = el('div', 'stats-sheet prim-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Calcul de la primiera');

  const head = el('div', 'stats-head');
  const close = el('button', 'icon-btn', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Fermer');
  close.addEventListener('click', closeStats);
  head.append(el('h2', '', 'Primiera'), close);
  sheet.append(head, el('p', 'stats-note', 'Pour chaque couleur, touche la meilleure carte de l’équipe.'));

  const tabs = el('div', 'prim-tabs');
  for (const p of state.players) {
    const t = el('button', 'prim-tab' + (p.id === primTeam ? ' on' : ''));
    t.type = 'button';
    t.style.setProperty('--pc', p.color);
    t.append(el('span', 'prim-tab-name', p.name), el('strong', '', primComplete(p.id) ? primTotal(p.id) : `${primTotal(p.id)}…`));
    t.addEventListener('click', () => { primTeam = p.id; renderPrimiera(); });
    tabs.append(t);
  }
  sheet.append(tabs);

  const cards = primOf(primTeam);
  SUITS.forEach((suit, i) => {
    const row = el('div', 'prim-row');
    row.append(el('span', 'prim-suit', suit));
    for (const [label, value] of PRIM_CARDS) {
      const b = el('button', 'prim-card' + (cards[i] === value ? ' on' : ''));
      b.type = 'button';
      b.append(el('span', 'prim-card-label' + (label.length > 1 ? ' long' : ''), label), el('span', 'prim-card-value', value));
      b.setAttribute('aria-label', `${suit} : ${label}, ${value} points`);
      b.addEventListener('click', () => {
        sfx.key();
        cards[i] = cards[i] === value ? null : value;
        save();
        renderPrimiera();
      });
      row.append(b);
    }
    sheet.append(row);
  });

  const { winner, why } = primWinner();
  sheet.append(el('p', 'stats-headline prim-result', why));

  const actions = el('div', 'stats-actions');
  const apply = el('button', 'wide-btn primary', winner ? `Donner la primiera à ${winner.name}` : 'Personne ne marque la primiera');
  apply.type = 'button';
  apply.disabled = !state.players.some((p) => primComplete(p.id));
  apply.addEventListener('click', () => {
    closeStats();
    sfx.key();
    change(() => { state.current.points.primiera = winner ? winner.id : null; });
  });
  const reset = el('button', 'wide-btn', 'Effacer les cartes');
  reset.type = 'button';
  reset.addEventListener('click', () => { state.current.prim = {}; save(); renderPrimiera(); });
  actions.append(apply, reset);
  sheet.append(actions);

  overlay.append(sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeStats(); });
  document.body.append(overlay);
}

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
  if (w && w !== before) {
    sfx.win();
    toast(`🏆 ${w.name} gagne avec ${total(w.id)} points !`, 3500);
    setTimeout(showStats, 900);
  }
  else sfx.add();
  $('#sheet').scrollTop = 0;
}

function editManche(i) {
  if (!isEmpty(state.current) && state.editIndex == null &&
      !confirm('Abandonner les points saisis pour la manche en cours ?')) return;
  change(() => {
    const m = state.manches[i];
    state.current = { points: { ...m.points }, scopes: { ...m.scopes }, prim: JSON.parse(JSON.stringify(m.prim || {})) };
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

function addTeam() {
  state.players.push({ id: uid(), members: [], name: `Équipe ${state.players.length + 1}`, color: freeColor(state.players) });
  save();
  render();
}

function removeTeam(t) {
  if (!confirm(`Retirer l’équipe ${t.name} de la partie ?`)) return;
  state.players = state.players.filter((p) => p !== t);
  save();
  render();
}

// A player belongs to one team at most: tapping moves them to this team,
// tapping again takes them out.
function toggleMember(team, pid) {
  const was = team.members.includes(pid);
  for (const t of state.players) t.members = t.members.filter((id) => id !== pid);
  if (!was) team.members.push(pid);
  refreshTeams(state);
  save();
  render();
}

function newPlayer() {
  const name = prompt('Nom du nouveau joueur :');
  if (name == null) return;
  newRosterPlayer(name.trim());
  render();
}

function renderTeamEditor(box) {
  box.textContent = '';
  state.players.forEach((t, i) => {
    const card = el('section', 'team-edit');
    card.style.setProperty('--pc', t.color);
    const head = el('div', 'team-edit-head');
    head.append(el('span', 'dot'), el('strong', '', t.members.length ? t.name : `Équipe ${i + 1}`));
    const del = el('button', 'del-btn', '✕');
    del.type = 'button';
    del.setAttribute('aria-label', `Retirer l’équipe ${t.name}`);
    del.addEventListener('click', () => removeTeam(t));
    head.append(del);
    card.append(head);
    const chips = el('div', 'chips');
    for (const r of roster) {
      const other = state.players.find((o) => o !== t && o.members.includes(r.id));
      const b = el('button', 'chip roster-chip' + (t.members.includes(r.id) ? ' on' : '') + (other ? ' taken' : '') + (r.guest ? ' guest' : ''), r.name);
      b.type = 'button';
      b.style.setProperty('--pc', r.color);
      b.addEventListener('click', () => toggleMember(t, r.id));
      chips.append(b);
    }
    if (!t.members.length) chips.append(el('span', 'picker-label', 'Touche les joueurs de cette équipe'));
    card.append(chips);
    box.append(card);
  });
  const add = el('div', 'chips roster-picker');
  const nt = el('button', 'chip roster-new', '+ Équipe');
  nt.type = 'button';
  nt.addEventListener('click', addTeam);
  const np = el('button', 'chip roster-new', '+ Nouveau joueur');
  np.type = 'button';
  np.addEventListener('click', newPlayer);
  const ng = el('button', 'chip roster-new', '+ Invité');
  ng.type = 'button';
  ng.addEventListener('click', () => { if (newGuest()) render(); });
  add.append(nt, np, ng);
  box.append(add);
}

function newGame() {
  if (!confirm('Effacer toutes les manches ?')) return;
  state.manches = [];
  state.gameId = gameUid();
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
  if (!on) save();
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
    renderTeamEditor($('#players'));
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
  board.classList.toggle('compact', state.players.length > 3);
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
  if (w) {
    const stats = el('button', 'link-btn stats-link', '📊 Stats');
    stats.type = 'button';
    stats.addEventListener('click', showStats);
    info.append(' · ', stats);
  }
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
  // Beyond 2 teams the labels no longer fit beside the buttons: each label
  // then takes its own line above the row of buttons.
  const many = teams.length > 2;
  const cols = many
    ? `repeat(${teams.length}, minmax(0, 1fr))`
    : `minmax(96px, 1.2fr) repeat(${teams.length}, minmax(64px, 1fr))`;

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

  const grid = el('div', 'manche-grid' + (many ? ' many' : ''));
  grid.style.gridTemplateColumns = cols;
  if (!many) grid.append(el('div'));
  for (const p of teams) {
    const th = el('div', 'col-head', p.name);
    th.style.setProperty('--pc', p.color);
    grid.append(th);
  }

  for (const pt of POINTS) {
    const label = el('div', 'pt-label');
    label.append(el('strong', '', pt.label), el('span', '', pt.hint));
    if (pt.key === 'primiera') {
      const calc = el('button', 'calc-btn', '🧮 Calculer');
      calc.type = 'button';
      calc.addEventListener('click', openPrimiera);
      label.append(calc);
    }
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
  scopeLabel.append(el('strong', '', 'Scope'), el('span', '', '1 point chacune'));
  grid.append(scopeLabel);
  for (const p of teams) {
    const n = m.scopes[p.id] ?? 0;
    const step = el('div', 'stepper' + (n ? ' on' : ''));
    step.style.setProperty('--pc', p.color);
    const minus = el('button', 'minus', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', `Retirer une scopa à ${p.name}`);
    minus.addEventListener('click', () => addScope(p.id, -1));
    const plus = el('button', 'plus', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', `Ajouter une scopa à ${p.name}`);
    plus.addEventListener('click', () => addScope(p.id, 1));
    if (many) step.append(plus, el('span', 'count', n), minus);
    else step.append(minus, el('span', 'count', n), plus);
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
$('#newGameBtn').addEventListener('click', newGame);
$('#statsBtn').addEventListener('click', showStats);

document.addEventListener('keydown', (e) => {
  if (editing || e.target.tagName === 'INPUT') return;
  if (e.key === 'Enter') validateManche();
  else if ((e.ctrlKey || e.metaKey) && e.key === 'z') undo();
  else return;
  e.preventDefault();
});

render();
initChrome();
