'use strict';

/* Players shared by every game, and the history of finished games used for
   the global statistics. Each game keeps its own copy of {id, name, color}
   for its players, kept in sync with this roster by id. A guest player
   ({guest: true}) plays like the others but stays out of the global stats. */

const ROSTER_KEY = 'roster-v1';
const HISTORY_KEY = 'history-v1';

const GAMES = {
  'dix-mille': { name: 'Dix-mille', icon: '⚄', color: '#1b5e3b' },
  yams: { name: 'Yams', icon: '⚅', color: '#1e63b5' },
  scoppa: { name: 'Scoppa', icon: '♠', color: '#b3261e' },
  flechettes: { name: 'Fléchettes', icon: '◎', color: '#6a1b9a' },
};

// Games played outside the app and entered by hand are recorded as
// { game: 'autre', title, mode: 'winner' | 'points' }.
const gameKey = (g) => (g.game === 'autre' ? `autre:${g.title}` : g.game);
function gameInfo(g) {
  if (g.game === 'autre') return { name: g.title, icon: (g.title || '?').charAt(0).toUpperCase(), color: '#546e7a' };
  return GAMES[g.game] || { name: g.game, icon: '•', color: '#888' };
}

let roster = loadJSON(ROSTER_KEY) || [];

const saveRoster = () => saveJSON(ROSTER_KEY, roster);
const rosterById = (id) => roster.find((p) => p.id === id);
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

function newRosterPlayer(name, guest = false) {
  let n = roster.length + 1;
  while (!name && roster.some((p) => sameName(p.name, `Joueur ${n}`))) n++;
  const p = { id: uid(), name: name || `Joueur ${n}`, color: freeColor(roster) };
  if (guest) p.guest = true;
  roster.push(p);
  saveRoster();
  return p;
}

// The first `count` regular players (created if needed), for a new game.
function defaultRosterPlayers(count = 2) {
  while (roster.filter((p) => !p.guest).length < count) newRosterPlayer();
  return roster.filter((p) => !p.guest).slice(0, count);
}

function newGuest() {
  const name = prompt('Nom de l’invité (il ne compte pas dans les statistiques globales) :');
  return name && name.trim() ? newRosterPlayer(name.trim(), true) : null;
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
   followed by buttons creating a new player or a guest. */
function renderRosterPicker(box, inGame, onPick, onNew, onGuest) {
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
    b.className = 'chip roster-chip' + (p.guest ? ' guest' : '');
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
  if (onGuest) {
    const guest = document.createElement('button');
    guest.type = 'button';
    guest.className = 'chip roster-new';
    guest.textContent = '+ Invité';
    guest.addEventListener('click', onGuest);
    box.append(guest);
  }
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
  // Guests are remembered as such, even if they leave the roster later.
  const players = rec.players.map((p) => (rosterById(p.id)?.guest ? { ...p, guest: true } : p));
  const full = { ...rec, players, endedAt };
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

/* ---------- Backup ---------- */

// Everything the app keeps on this phone.
const BACKUP_KEYS = [
  ROSTER_KEY, HISTORY_KEY,
  'dix-mille-state-v1', 'yams-state-v1', 'scoppa-state-v1', 'flechettes-state-v1',
  'dix-mille-sound', 'dix-mille-wake', 'joueurs-period', 'autre-draft-v1',
];
const BACKUP_APP = 'feuilles-de-score';

function backupData() {
  const data = {};
  for (const k of BACKUP_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v != null) data[k] = v;
    } catch (e) { /* ignore */ }
  }
  return { app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), data };
}

// Replaces everything by the backup; returns false if the file is not one.
function restoreBackup(backup) {
  if (!backup || backup.app !== BACKUP_APP || typeof backup.data !== 'object') return false;
  for (const k of BACKUP_KEYS) {
    try {
      if (typeof backup.data[k] === 'string') localStorage.setItem(k, backup.data[k]);
      else localStorage.removeItem(k);
    } catch (e) { /* ignore */ }
  }
  return true;
}

/* ---------- Sharing players between phones (QR code) ---------- */

const PROFILE_PREFIX = 'FDS1:';

// Text of the QR code carrying these players.
function encodeProfiles(players) {
  return PROFILE_PREFIX + JSON.stringify(players.map((p) => ({ i: p.id, n: p.name, c: p.color, ...(p.guest ? { g: 1 } : {}) })));
}

// Players read from a QR code, or null if it is not one of ours.
function decodeProfiles(text) {
  if (!text || !text.startsWith(PROFILE_PREFIX)) return null;
  try {
    const list = JSON.parse(text.slice(PROFILE_PREFIX.length));
    if (!Array.isArray(list)) return null;
    const ok = list.filter((p) => p && typeof p.i === 'string' && typeof p.n === 'string' && /^#[0-9a-f]{6}$/i.test(p.c));
    return ok.map((p) => ({ id: p.i, name: p.n.slice(0, 20), color: p.c, ...(p.g ? { guest: true } : {}) }));
  } catch (e) {
    return null;
  }
}

// Replaces a player id everywhere on this phone (games in progress, history).
function remapPlayerId(from, to) {
  for (const k of BACKUP_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v && v.includes(from)) localStorage.setItem(k, v.split(from).join(to));
    } catch (e) { /* ignore */ }
  }
  roster = loadJSON(ROSTER_KEY) || [];
}

/* Adds players received from another phone. A player already known by id is
   updated; one with the same name as a local player takes that player's
   place (same person: the local id is replaced by the received one, so both
   phones now share it). Returns a summary for the user. */
function receiveProfiles(players) {
  const added = [], updated = [], merged = [];
  for (const p of players) {
    const known = rosterById(p.id);
    if (known) {
      Object.assign(known, { name: p.name, color: p.color });
      if (p.guest) known.guest = true; else delete known.guest;
      updated.push(p.name);
      continue;
    }
    const twin = roster.find((r) => sameName(r.name, p.name));
    if (twin) {
      saveRoster();
      remapPlayerId(twin.id, p.id);
      Object.assign(rosterById(p.id), { name: p.name, color: p.color });
      merged.push(p.name);
      continue;
    }
    roster.push({ ...p });
    added.push(p.name);
  }
  saveRoster();
  return { added, updated, merged };
}
