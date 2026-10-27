'use strict';

/* Result of a game played outside the app, entered by hand for the global
   statistics: a single winner (1 / 0 / 0…) or points for each player. */

const DRAFT_KEY = 'autre-draft-v1';

const draft = {
  title: '',
  mode: 'winner',   // 'winner' | 'points'
  low: false,       // points: the lowest score wins
  players: [],      // roster ids, in order
  scores: {},       // id -> typed text
  winner: null,
  ...loadJSON(DRAFT_KEY),
};
draft.players = draft.players.filter((id) => rosterById(id));
if (!draft.players.length) draft.players = defaultRosterPlayers().map((p) => p.id);

const saveDraft = () => saveJSON(DRAFT_KEY, draft);

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function chip(text, on, onClick, cls = '') {
  const b = el('button', `chip ${cls}${on ? ' on' : ''}`, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

// Names of the games already entered, most recent first.
function knownTitles() {
  const seen = [];
  for (const g of loadHistory().filter((x) => x.game === 'autre').sort((a, b) => b.endedAt - a.endedAt)) {
    if (!seen.some((t) => sameName(t, g.title))) seen.push(g.title);
  }
  return seen;
}

const value = (id) => {
  const v = parseInt(draft.scores[id], 10);
  return Number.isNaN(v) ? null : v;
};

// Why the game cannot be saved yet, or null.
function problem() {
  if (!draft.title.trim()) return 'Donne le nom du jeu';
  if (draft.players.length < 2) return 'Choisis au moins deux joueurs';
  if (draft.mode === 'winner' && !draft.players.includes(draft.winner)) return 'Touche le gagnant';
  if (draft.mode === 'points' && draft.players.some((id) => value(id) == null)) return 'Entre les points de chacun';
  return null;
}

function render() {
  renderTitles();
  renderMode();
  renderPlayers();
  renderResult();
  renderSaved();
}

function renderTitles() {
  const box = $('#titles');
  box.textContent = '';
  for (const t of knownTitles().slice(0, 12)) {
    box.append(chip(t, sameName(t, draft.title), () => {
      draft.title = t;
      $('#title').value = t;
      saveDraft();
      render();
    }));
  }
}

function renderMode() {
  const box = $('#mode');
  box.textContent = '';
  box.append(
    chip('Un seul vainqueur', draft.mode === 'winner', () => { draft.mode = 'winner'; saveDraft(); render(); }),
    chip('Aux points', draft.mode === 'points', () => { draft.mode = 'points'; saveDraft(); render(); }),
  );
  const low = $('#lowRow');
  low.hidden = draft.mode !== 'points';
  low.textContent = '';
  low.append(
    chip('Le plus de points gagne', !draft.low, () => { draft.low = false; saveDraft(); render(); }),
    chip('Le moins de points gagne', draft.low, () => { draft.low = true; saveDraft(); render(); }),
  );
}

function renderPlayers() {
  const box = $('#who');
  box.textContent = '';
  for (const p of roster) {
    const on = draft.players.includes(p.id);
    const b = chip(p.name, on, () => {
      if (on) draft.players = draft.players.filter((id) => id !== p.id);
      else draft.players.push(p.id);
      saveDraft();
      render();
    }, 'roster-chip' + (p.guest ? ' guest' : ''));
    b.style.setProperty('--pc', p.color);
    box.append(b);
  }
  const add = (text, make) => box.append(chip(text, false, () => {
    const p = make();
    if (!p) return;
    draft.players.push(p.id);
    saveDraft();
    render();
  }, 'roster-new'));
  add('+ Nouveau joueur', () => {
    const name = prompt('Nom du nouveau joueur :');
    return name && name.trim() ? newRosterPlayer(name.trim()) : null;
  });
  add('+ Invité', newGuest);
}

function renderResult() {
  const box = $('#result');
  box.textContent = '';
  for (const id of draft.players) {
    const p = rosterById(id);
    const row = el('div', 'player result-row');
    row.style.setProperty('--pc', p.color);
    row.append(el('span', 'dot'), el('div', 'name', p.name));
    if (draft.mode === 'winner') {
      const won = draft.winner === id;
      row.classList.toggle('selected', won);
      const b = el('button', 'mini-btn win-btn' + (won ? ' on' : ''), won ? '🏆 Gagnant' : 'Gagnant ?');
      b.type = 'button';
      b.addEventListener('click', () => {
        draft.winner = won ? null : id;
        sfx.key();
        saveDraft();
        render();
      });
      row.append(b);
    } else {
      // Phone number pads often lack a minus key: ± toggles the sign.
      const sign = el('button', 'mini-btn', '±');
      sign.type = 'button';
      sign.setAttribute('aria-label', `Changer le signe des points de ${p.name}`);
      sign.addEventListener('click', () => {
        const v = String(draft.scores[id] || '');
        draft.scores[id] = v.startsWith('-') ? v.slice(1) : `-${v}`;
        saveDraft();
        renderResult();
      });
      const input = el('input', 'name-input score-input');
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.placeholder = 'points';
      input.value = draft.scores[id] ?? '';
      input.setAttribute('aria-label', `Points de ${p.name}`);
      input.addEventListener('input', () => {
        draft.scores[id] = input.value.replace(/[^\d-]/g, '');
        saveDraft();
        renderSave();
      });
      row.append(sign, input);
    }
    box.append(row);
  }
  renderSave();
}

function renderSave() {
  const why = problem();
  const btn = $('#saveBtn');
  btn.disabled = !!why;
  btn.textContent = why || `Enregistrer la partie de ${draft.title.trim()}`;
}

function save() {
  if (problem()) return;
  const players = draft.players.map((id) => {
    const p = rosterById(id);
    const score = draft.mode === 'winner' ? (id === draft.winner ? 1 : 0) : value(id);
    return { id, name: p.name, color: p.color, score };
  });
  let winners;
  if (draft.mode === 'winner') winners = [draft.winner];
  else {
    const best = draft.low ? Math.min(...players.map((p) => p.score)) : Math.max(...players.map((p) => p.score));
    winners = players.filter((p) => p.score === best).map((p) => p.id);
  }
  const title = draft.title.trim();
  recordGame({ gameId: uid(), game: 'autre', title, mode: draft.mode, lowWins: draft.mode === 'points' && draft.low, players, winners });
  sfx.win();
  toast(`Partie de ${title} enregistrée : 🏆 ${winners.map((id) => rosterById(id).name).join(' et ')}`, 3000);
  // Same game and players for the next one, fresh results.
  draft.scores = {};
  draft.winner = null;
  saveDraft();
  render();
}

function renderSaved() {
  const box = $('#saved');
  box.textContent = '';
  const list = loadHistory().filter((g) => g.game === 'autre').sort((a, b) => b.endedAt - a.endedAt).slice(0, 20);
  $('#savedSection').hidden = !list.length;
  for (const g of list) {
    const row = el('div', 'past-game');
    const icon = el('span', 'past-game-icon', gameInfo(g).icon);
    icon.style.background = gameInfo(g).color;
    const body = el('div', 'past-game-body');
    const date = new Date(g.endedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    body.append(el('div', 'past-game-title', `${g.title} · ${date}`));
    const order = [...g.players].sort((a, b) => (g.lowWins ? a.score - b.score : b.score - a.score));
    body.append(el('div', 'past-game-scores', order.map((p) => {
      const name = rosterById(p.id)?.name || p.name;
      return `${g.winners.includes(p.id) ? '🏆 ' : ''}${name}${g.mode === 'winner' ? '' : ` ${fmt(p.score)}`}`;
    }).join(' · ')));
    const del = el('button', 'past-btn del', '✕');
    del.type = 'button';
    del.setAttribute('aria-label', 'Supprimer cette partie');
    del.addEventListener('click', () => {
      if (!confirm('Supprimer cette partie des statistiques ?')) return;
      unrecordGame(g.gameId);
      render();
    });
    row.append(icon, body, del);
    box.append(row);
  }
}

$('#title').value = draft.title;
$('#title').addEventListener('input', (e) => {
  draft.title = e.target.value;
  saveDraft();
  renderSave();
});
$('#title').addEventListener('change', renderTitles);
$('#saveBtn').addEventListener('click', save);

render();
initChrome();
