'use strict';

/* Sending players with their finished games from one phone to another by QR
   codes, without duplicating a game already known.

   Bundle (before compression), every repeated string stored once:
     { v: 2,
       p: [[id, name, 'rrggbb', guest 0|1], …],   players met in the games
       m: [index in p, …],                         players being shared
       k: ['yams', 'autre:Tarot', …],              kinds of games
       s: ['Alice & Chloé', …],                    scoppa team names
       g: [[gameId, kind, minutes since 1970, flags,
            [[player, score, turns, team], …], [winner, …]], …] }
   flags: 1 = lowest score wins, 2 = single winner, 4 = points (other games).
   The JSON is deflated, base64url-encoded and cut into frames
     FDS2|transfer|index|count|z|data
   (z = 1 when deflated) shown one after the other as QR codes. */

const FRAME_PREFIX = 'FDS2|';
const FRAME_SIZE = 480; // characters of data per QR code: dense enough, still easy to read on a screen

/* ---------- Building a bundle ---------- */

function buildBundle(sharedIds) {
  const shared = new Set(sharedIds);
  const games = loadHistory().filter((g) => g.players.some((p) => shared.has(p.id)));
  const p = [], pIdx = new Map();
  const k = [], kIdx = new Map();
  const s = [], sIdx = new Map();
  const idx = (list, map, key, value) => {
    if (!map.has(key)) { map.set(key, list.length); list.push(value); }
    return map.get(key);
  };
  const player = (q) => {
    const r = rosterById(q.id);
    const name = r ? r.name : q.name;
    const color = (r ? r.color : q.color) || '#888888';
    const guest = r ? !!r.guest : !!q.guest;
    return idx(p, pIdx, q.id, [q.id, name, color.replace('#', ''), guest ? 1 : 0]);
  };
  for (const id of sharedIds) player({ id });
  const g = games.map((game) => {
    const flags = (game.lowWins ? 1 : 0) | (game.mode === 'winner' ? 2 : 0) | (game.mode === 'points' ? 4 : 0);
    const entries = game.players.map((q) => {
      const e = [player(q), q.score];
      if (q.turns || q.team) e.push(q.turns || 0);
      if (q.team) e.push(idx(s, sIdx, q.team, q.team));
      return e;
    });
    const winners = game.winners.map((id) => pIdx.get(id)).filter((i) => i != null);
    return [game.gameId, idx(k, kIdx, gameKey(game), gameKey(game)), Math.round(game.endedAt / 60000), flags, entries, winners];
  });
  return { bundle: { v: 2, p, m: sharedIds.map((id) => pIdx.get(id)), k, s, g }, games: games.length };
}

/* ---------- Bytes, compression, frames ---------- */

const toBase64Url = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text) => {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipeBytes(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// QR code texts carrying the bundle.
async function bundleFrames(bundle) {
  let bytes = new TextEncoder().encode(JSON.stringify(bundle));
  let z = 0;
  if (window.CompressionStream) {
    try { bytes = await pipeBytes(bytes, new CompressionStream('deflate-raw')); z = 1; } catch (e) { /* sent as is */ }
  }
  const data = toBase64Url(bytes);
  const count = Math.max(1, Math.ceil(data.length / FRAME_SIZE));
  const transfer = Math.random().toString(36).slice(2, 6);
  return Array.from({ length: count }, (_, i) => `${FRAME_PREFIX}${transfer}|${i}|${count}|${z}|${data.slice(i * FRAME_SIZE, (i + 1) * FRAME_SIZE)}`);
}

function parseFrame(text) {
  if (!text || !text.startsWith(FRAME_PREFIX)) return null;
  const [, transfer, i, count, z, data] = text.split('|');
  const index = Number(i), total = Number(count);
  if (!transfer || !Number.isInteger(index) || !Number.isInteger(total) || index < 0 || index >= total || data == null) return null;
  return { transfer, index, total, z: z === '1', data };
}

// Collects frames read in any order; `complete()` once they all arrived.
function frameCollector() {
  let transfer = null, parts = [], z = false;
  return {
    add(frame) {
      if (frame.transfer !== transfer) { transfer = frame.transfer; parts = new Array(frame.total).fill(null); z = frame.z; }
      parts[frame.index] = frame.data;
    },
    received: () => parts.filter((x) => x != null).length,
    total: () => parts.length,
    complete: () => parts.length > 0 && parts.every((x) => x != null),
    async bundle() {
      let bytes = fromBase64Url(parts.join(''));
      if (z) {
        if (!window.DecompressionStream) throw new Error('Navigateur trop ancien pour lire cet envoi');
        bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'));
      }
      const bundle = JSON.parse(new TextDecoder().decode(bytes));
      if (!bundle || bundle.v !== 2 || !Array.isArray(bundle.p) || !Array.isArray(bundle.g)) throw new Error('Envoi illisible');
      return bundle;
    },
  };
}

/* ---------- Reading a bundle ---------- */

// What the bundle would bring, before importing it.
function previewBundle(bundle) {
  const known = new Set(loadHistory().map((g) => g.gameId));
  const fresh = bundle.g.filter((g) => !known.has(g[0])).length;
  return { players: bundle.m.map((i) => bundle.p[i][1]), games: bundle.g.length, fresh };
}

/* Imports the shared players (as profiles: same id on both phones, a
   namesake here becoming that player) and every game not already known.
   The other players of those games are matched by name with this phone's
   players, otherwise kept in the games under their own name. */
function importBundle(bundle) {
  const players = bundle.p.map(([id, name, color, guest]) => ({ id, name: String(name).slice(0, 20), color: `#${color}`, ...(guest ? { guest: true } : {}) }));
  const shared = bundle.m.map((i) => players[i]).filter(Boolean);
  const profiles = receiveProfiles(shared);

  const sharedIds = new Set(shared.map((q) => q.id));
  const local = players.map((q) => {
    if (sharedIds.has(q.id) || rosterById(q.id)) return q;
    const twin = roster.find((r) => sameName(r.name, q.name));
    return twin ? { ...q, id: twin.id, name: twin.name, color: twin.color } : q;
  });

  const history = loadHistory();
  const known = new Set(history.map((g) => g.gameId));
  let added = 0;
  for (const [gameId, kind, minutes, flags, entries, winners] of bundle.g) {
    if (known.has(gameId)) continue;
    const key = bundle.k[kind] || '';
    const rec = {
      gameId,
      game: key.startsWith('autre:') ? 'autre' : key,
      endedAt: minutes * 60000,
      players: entries.map(([pi, score, turns, team]) => ({
        id: local[pi].id, name: local[pi].name, color: local[pi].color, score,
        ...(turns ? { turns } : {}),
        ...(team != null ? { team: bundle.s[team] } : {}),
        ...(local[pi].guest ? { guest: true } : {}),
      })),
      winners: winners.map((pi) => local[pi].id),
    };
    if (key.startsWith('autre:')) rec.title = key.slice(6);
    if (flags & 1) rec.lowWins = true;
    if (flags & 2) rec.mode = 'winner';
    if (flags & 4) rec.mode = 'points';
    history.push(rec);
    known.add(gameId);
    added++;
  }
  saveHistory(history);
  return { ...profiles, games: added, already: bundle.g.length - added };
}
