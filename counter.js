'use strict';

/* Running-total score sheet (dix-mille, fléchettes). Configured by window.GAME:
   storageKey, target (winning score), targetChoices (optional list the
   players can pick from), defaultName, maxDigits, countdown.
   With countdown, `target` is the starting score and each volley is taken
   off it: the first to land exactly on 0 wins, going below 0 is a bust. */

const GAME = {
  storageKey: 'dix-mille-state-v1',
  target: 10000,
  targetChoices: null,
  defaultName: 'Joueur',
  maxDigits: 6,
  countdown: false,
  maxVolley: 180,
  ...window.GAME,
};
const CD = GAME.countdown;

/* ---------- State ---------- */

function defaultState() {
  const players = defaultRosterPlayers().map((r) => ({
    id: r.id, name: r.name, color: r.color, score: CD ? GAME.target : 0, last: null,
  }));
  return {
    gameId: uid(),     // identifies the game in the global history
    finished: false,   // dix-mille: the players ended the game (🏁 Fin)
    players,
    turnId: players[0].id,     // whose turn it is in the normal rotation
    selectedId: players[0].id, // player whose value is being typed
    mode: 'add',               // 'add' = ajouter au score, 'set' = corriger le score
    input: '',
    negative: false,
    target: GAME.target,
    history: [],
    redo: [],
    log: [],          // one entry per validation: { pid, v, kind: 'add' | 'set' }
  };
}

function loadState() {
  let s = loadJSON(GAME.storageKey);
  if (!s || !Array.isArray(s.players)) return defaultState();
  s = linkToRoster(s, (st) => st.players);
  return { ...defaultState(), ...s, input: '', negative: false, mode: 'add' };
}

let state = loadState();
let editing = false;

const target = () => (GAME.targetChoices ? state.target : GAME.target);
const startScore = () => (CD ? target() : 0);
const hasWon = (p) => (CD ? p.score === 0 : p.score >= target());
// Best score so far: the highest one, or the lowest remaining in countdown.
const leadScore = () => (CD ? Math.min(...state.players.map((p) => p.score)) : Math.max(...state.players.map((p) => p.score)));

function save() {
  const { input, negative, ...rest } = state;
  saveJSON(GAME.storageKey, rest);
  pushToRoster(state.players);
  syncRecord();
}

// Keeps the global history in step: a finished game is recorded (and
// updated if corrected afterwards), an unfinished one is removed.
function syncRecord() {
  const done = CD ? state.players.some((p) => p.score === 0) : state.finished;
  if (!done || !state.players.length) { unrecordGame(state.gameId); return; }
  const turns = {};
  for (const e of state.log) if (e.kind === 'add') turns[e.pid] = (turns[e.pid] || 0) + 1;
  const lead = leadScore();
  recordGame({
    gameId: state.gameId,
    game: GAME.game,
    lowWins: CD,
    players: state.players.map((p) => ({ id: p.id, name: p.name, color: p.color, score: p.score, turns: turns[p.id] || 0 })),
    winners: state.players.filter((p) => p.score === lead).map((p) => p.id),
  });
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
  // Each history step matches the log entry its validation added.
  state.redo.push({ ...capture(), entry: state.log.pop() });
  restore(h);
  toast('Annulé');
}

function redo() {
  const h = state.redo.pop();
  if (!h) return;
  state.history.push(capture());
  restore(h);
  if (h.entry) state.log.push(h.entry);
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
    state.log.push({ pid: p.id, v: p.score, kind: 'set' });
    p.last = null;
    state.mode = 'add';
    sfx.set();
    state.selectedId = state.turnId;
    toast(`Score de ${p.name} corrigé`);
  } else if (CD) {
    const v = Math.abs(inputValue());
    if (v > GAME.maxVolley) { toast(`${GAME.maxVolley} maximum par volée`); return; }
    snapshot();
    const left = p.score - v;
    if (left < 0) {
      // Bust: the volley does not count.
      p.last = 'bust';
      state.log.push({ pid: p.id, v, kind: 'add', bust: true });
      sfx.zero();
      toast(`${p.name} dépasse : volée annulée`);
    } else {
      p.score = left;
      p.last = -v;
      state.log.push({ pid: p.id, v, kind: 'add' });
      if (left === 0) {
        sfx.win();
        toast(`🎯 ${p.name} termine pile à 0 !`, 3000);
        setTimeout(showStats, 900);
      } else if (v === 0) sfx.zero();
      else sfx.add();
    }
    state.turnId = nextId(p.id);
    state.selectedId = state.turnId;
  } else {
    snapshot();
    const v = inputValue();
    const before = p.score;
    p.score += v;
    p.last = v;
    state.log.push({ pid: p.id, v, kind: 'add' });
    if (before < target() && p.score >= target()) { sfx.win(); toast(`${p.name} atteint ${fmt(target())} !`, 2500); }
    else if (v === 0) sfx.zero();
    else sfx.add();
    state.turnId = nextId(p.id);
    state.selectedId = state.turnId;
  }
  clearInput();
  scrollToSelected = true;
}

// The first to pass the target may hand their turn to the next player, who
// can carry on: only the players know when the game is over, so ending it
// is left to them (🏁 Fin button) once someone has reached the target.
const targetReached = () => state.players.some(hasWon);

/* ---------- Statistics ---------- */

function showStats() {
  if (CD) { showCountdownStats(); return; }
  const T = target();
  const per = state.players.map((p) => ({ p, turns: 0, sum: 0, best: null, zeros: 0, reachedAt: null, score: 0, points: [[0, 0]] }));
  const byPid = Object.fromEntries(per.map((x) => [x.p.id, x]));
  for (const e of state.log) {
    const s = byPid[e.pid];
    if (!s) continue;
    if (e.kind === 'set') {
      s.score = e.v;
      s.points[s.points.length - 1] = [s.turns, e.v];
    } else {
      s.turns++;
      s.score += e.v;
      s.sum += e.v;
      s.best = Math.max(s.best ?? e.v, e.v);
      if (e.v === 0) s.zeros++;
      s.points.push([s.turns, s.score]);
    }
    if (s.reachedAt == null && s.score >= T) s.reachedAt = s.turns;
  }
  const rounds = Math.max(0, ...per.map((x) => x.turns));
  const best = Math.max(...state.players.map((p) => p.score));
  const leaders = state.players.filter((p) => p.score === best).map((p) => p.name).join(' et ');
  const over = state.players.some((p) => p.score >= T);
  const dash = '—';
  openStats({
    title: over ? 'Fin de partie' : 'Statistiques',
    headline: `${over ? '🏆' : '👑'} ${leaders} : ${fmt(best)} points · ${rounds} tour${rounds > 1 ? 's' : ''}`,
    series: per.map((x) => ({ name: x.p.name, color: x.p.color, points: x.points })),
    chart: { target: T, xName: 'tour', xTitle: 'Tour' },
    chartNote: state.log.length ? null : 'La progression n’est enregistrée que pour les parties commencées après cette mise à jour.',
    tables: [{
      title: 'Résumé',
      players: state.players,
      rows: [
        ['Score', ...state.players.map((p) => fmt(p.score))],
        ['Tours joués', ...per.map((x) => x.turns)],
        [`Tour du ${fmt(T)}`, ...per.map((x) => x.reachedAt ?? dash)],
        ['Moyenne par tour', ...per.map((x) => (x.turns ? fmt(Math.round(x.sum / x.turns)) : dash))],
        ['Meilleur tour', ...per.map((x) => (x.best != null ? fmt(x.best) : dash))],
        ['Tours à 0', ...per.map((x) => (x.turns ? `${x.zeros} (${Math.round((100 * x.zeros) / x.turns)} %)` : dash))],
      ],
    }],
    onNewGame: newGame,
  });
}

function showCountdownStats() {
  const start = startScore();
  const per = state.players.map((p) => ({ p, turns: 0, sum: 0, scored: 0, best: null, busts: 0, tons: 0, doneAt: null, score: start, points: [[0, start]] }));
  const byPid = Object.fromEntries(per.map((x) => [x.p.id, x]));
  for (const e of state.log) {
    const s = byPid[e.pid];
    if (!s) continue;
    if (e.kind === 'set') {
      s.score = e.v;
      s.points[s.points.length - 1] = [s.turns, e.v];
      continue;
    }
    s.turns++;
    if (e.bust) s.busts++;
    else {
      s.score -= e.v;
      s.sum += e.v;
      s.scored++;
      s.best = Math.max(s.best ?? e.v, e.v);
      if (e.v >= 100) s.tons++;
    }
    s.points.push([s.turns, s.score]);
    if (s.doneAt == null && s.score === 0) s.doneAt = s.turns;
  }
  const winners = state.players.filter(hasWon);
  const lead = leadScore();
  const leaders = state.players.filter((p) => p.score === lead).map((p) => p.name).join(' et ');
  const dash = '—';
  const doneAt = winners.length ? byPid[winners[0].id].doneAt : null;
  openStats({
    title: winners.length ? 'Fin de partie' : 'Statistiques',
    headline: winners.length
      ? `🎯 ${winners.map((w) => w.name).join(' et ')} termine${doneAt ? ` en ${doneAt} volée${doneAt > 1 ? 's' : ''}` : ''}`
      : `👑 ${leaders} : plus que ${fmt(lead)}`,
    series: per.map((x) => ({ name: x.p.name, color: x.p.color, points: x.points })),
    chart: { xName: 'volée', xTitle: 'Volée', yName: 'Score restant' },
    tables: [{
      title: 'Résumé',
      players: state.players,
      rows: [
        ['Reste', ...state.players.map((p) => fmt(p.score))],
        ['Volées', ...per.map((x) => x.turns)],
        ['Moyenne par volée', ...per.map((x) => (x.scored ? Math.round(x.sum / x.scored) : dash))],
        ['Meilleure volée', ...per.map((x) => x.best ?? dash)],
        ['Volées de 100 et plus', ...per.map((x) => x.tons)],
        ['Volées dépassées', ...per.map((x) => x.busts)],
      ],
    }],
    onNewGame: newGame,
  });
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

function addPlayer(r, focus) {
  state.players.push({ id: r.id, name: r.name, color: r.color, score: startScore(), last: null });
  ensureIds();
  save();
  render();
  if (focus) focusName(r.id);
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
  if (!confirm(CD ? `Remettre tout le monde à ${startScore()} ?` : 'Remettre tous les scores à 0 ?')) return;
  for (const p of state.players) { p.score = startScore(); p.last = null; }
  state.gameId = uid();
  state.finished = false;
  state.history = [];
  state.redo = [];
  state.log = [];
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
    renderPlayerEditor(listEl, state.players, {
      onChange: save, onRemove: removePlayer, rerender: render,
      removeText: (p) => `Retirer ${p.name} de cette partie ?`,
    });
    renderRosterPicker($('#rosterPicker'), state.players, (r) => addPlayer(r), () => addPlayer(newRosterPlayer(), true));
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
    b.addEventListener('click', () => {
      state.target = t;
      // Countdown: a game not started yet begins from the new score.
      if (CD && !state.log.length) for (const p of state.players) p.score = t;
      save();
      renderTargetChoices();
    });
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
  const best = leadScore();
  const someonePlayed = CD ? state.log.length > 0 : best > 0;
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
    name.textContent = (p.score === best && someonePlayed ? '👑 ' : '') + p.name;

    const score = document.createElement('div');
    score.className = 'score' + (hasWon(p) ? ' win' : '');
    const total = document.createElement('span');
    total.className = 'total';
    total.textContent = fmt(p.score);
    const last = document.createElement('span');
    last.className = 'last';
    last.textContent = p.last == null ? ' ' : p.last === 'bust' ? 'dépassé' : (p.last >= 0 ? '+' : '−') + fmt(Math.abs(p.last));
    score.append(total, last);
    score.addEventListener('click', (e) => { e.stopPropagation(); selectPlayer(p.id, 'set'); });

    const box = document.createElement('div');
    box.className = 'add-box';
    if (selected) {
      box.classList.add('caret');
      const digits = state.input ? fmt(parseInt(state.input, 10)) : '';
      if (state.mode === 'set') box.textContent = '= ' + (state.negative ? '−' : '') + digits;
      else box.textContent = (CD || state.negative ? '− ' : '+ ') + digits;
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
  $('#endStatsBtn').hidden = !targetReached();
  $('#endStatsBtn').textContent = CD || state.finished ? '📊 Stats' : '🏁 Fin';
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
    if (CD) {
      const left = p.score - Math.abs(v);
      $('#entryCalc').textContent = `${fmt(p.score)} − ${fmt(Math.abs(v))} = ${left < 0 ? 'dépassé' : fmt(left)}`;
      return;
    }
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
$('#newGameBtn').addEventListener('click', newGame);
$('#statsBtn').addEventListener('click', showStats);
$('#endStatsBtn').addEventListener('click', () => {
  // Dix-mille: the players decide when the game is over.
  if (!CD && !state.finished) { state.finished = true; save(); render(); }
  showStats();
});

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
