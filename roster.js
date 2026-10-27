'use strict';

/* Players shared by every game, and the history of finished games used for
   the global statistics. Each game keeps its own copy of {id, name, color}
   for its players, kept in sync with this roster by id. */

const ROSTER_KEY = 'roster-v1';
const HISTORY_KEY = 'history-v1';

const GAMES = {
  'dix-mille': { name: 'Dix-mille', icon: '⚄', color: '#1b5e3b' },
  yams: { name: 'Yams', icon: '⚅', color: '#1e63b5' },
  scoppa: { name: 'Scoppa', icon: '♠', color: '#b3261e' },
  flechettes: { name: 'Fléchettes', icon: '◎', color: '#6a1b9a' },
};

let roster = loadJSON(ROSTER_KEY) || [];

const saveRoster = () => saveJSON(ROSTER_KEY, roster);
const rosterById = (id) => roster.find((p) => p.id === id);
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

function newRosterPlayer(name) {
  let n = roster.length + 1;
  while (!name && roster.some((p) => sameName(p.name, `Joueur ${n}`))) n++;
  const p = { id: uid(), name: name || `Joueur ${n}`, color: freeColor(roster) };
  roster.push(p);
  saveRoster();
  return p;
}

// The first `count` roster players (created if needed), for a new game.
function defaultRosterPlayers(count = 2) {
  while (roster.length < count) newRosterPlayer();
  return roster.slice(0, count);
}

/* Links a game's saved players to the roster: a player already in the roster
   (same id) takes its name and color; one with the name of a roster player
   becomes that player (its id is replaced everywhere in the saved state);
   any other joins the roster. Returns the (possibly rewritten) state. */
function linkToRoster(state, playersOf) {
  const remaps = [];
  for (const p of playersOf(state)) {
    if (rosterById(p.id)) continue;
    const twin = roster.find((r) => sameName(r.name, p.name));
    if (twin && !playersOf(state).some((o) => o.id === twin.id)) remaps.push([p.id, twin.id]);
    else roster.push({ id: p.id, name: p.name, color: p.color });
  }
  saveRoster();
  if (remaps.length) {
    let json = JSON.stringify(state);
    for (const [from, to] of remaps) json = json.split(from).join(to);
    state = JSON.parse(json);
  }
  for (const p of playersOf(state)) {
    const r = rosterById(p.id);
    if (r) { p.name = r.name; p.color = r.color; }
  }
  return state;
}

// Copies names and colors edited inside a game back to the roster.
function pushToRoster(players) {
  let changed = false;
  for (const p of players) {
    const r = rosterById(p.id);
    if (r && (r.name !== p.name || r.color !== p.color)) {
      r.name = p.name.trim() ? p.name : r.name;
      r.color = p.color;
      changed = true;
    }
  }
  if (changed) saveRoster();
}

/* Chips of the roster players not yet in the game, to add them in one tap,
   followed by a button creating a new player. */
function renderRosterPicker(box, inGame, onPick, onNew) {
  box.textContent = '';
  const ids = new Set(inGame.map((p) => p.id));
  const others = roster.filter((p) => !ids.has(p.id));
  if (others.length) {
    const label = document.createElement('span');
    label.className = 'picker-label';
    label.textContent = 'Ajouter :';
    box.append(label);
  }
  for (const p of others) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip roster-chip';
    b.style.setProperty('--pc', p.color);
    b.textContent = p.name;
    b.addEventListener('click', () => onPick(p));
    box.append(b);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'chip roster-new';
  add.textContent = '+ Nouveau joueur';
  add.addEventListener('click', onNew);
  box.append(add);
}

/* ---------- History of finished games ---------- */

const loadHistory = () => loadJSON(HISTORY_KEY) || [];
const saveHistory = (h) => saveJSON(HISTORY_KEY, h);

/* rec: { gameId, game, players: [{ id, name, color, score, turns }],
          winners: [ids], lowWins } — inserted or updated by gameId. */
function recordGame(rec) {
  const h = loadHistory();
  const i = h.findIndex((r) => r.gameId === rec.gameId);
  const endedAt = i >= 0 ? h[i].endedAt : Date.now();
  const full = { ...rec, endedAt };
  if (i >= 0) {
    if (JSON.stringify(h[i]) === JSON.stringify(full)) return;
    h[i] = full;
  } else h.push(full);
  saveHistory(h);
}

function unrecordGame(gameId) {
  const h = loadHistory();
  const next = h.filter((r) => r.gameId !== gameId);
  if (next.length !== h.length) saveHistory(next);
}
