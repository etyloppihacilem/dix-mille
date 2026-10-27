'use strict';

/* Global page: the shared roster and statistics over every finished game,
   for the last 24 hours, the last 7 days, a calendar month or year (browsable
   backwards) or all time. */

const PERIODS = [
  { key: 'day', label: '24 h' },
  { key: 'week', label: '7 jours' },
  { key: 'month', label: 'Mois' },
  { key: 'year', label: 'Année' },
  { key: 'all', label: 'Tout' },
];
let period = 'all';
try { period = localStorage.getItem('joueurs-period') || 'all'; } catch (e) { /* ignore */ }
if (!PERIODS.some((p) => p.key === period)) period = 'all';
let offset = 0; // months or years back from the current one

// [start, end) timestamps of the selected period.
function range() {
  const now = new Date();
  const y = now.getFullYear();
  switch (period) {
    case 'day': return [Date.now() - 24 * 3600e3, Infinity];
    case 'week': return [Date.now() - 7 * 24 * 3600e3, Infinity];
    case 'month': return [new Date(y, now.getMonth() - offset, 1).getTime(), new Date(y, now.getMonth() - offset + 1, 1).getTime()];
    case 'year': return [new Date(y - offset, 0, 1).getTime(), new Date(y - offset + 1, 0, 1).getTime()];
    default: return [-Infinity, Infinity];
  }
}

function rangeLabel() {
  const [start] = range();
  if (period === 'year') return String(new Date(start).getFullYear());
  const m = new Date(start).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return m.charAt(0).toUpperCase() + m.slice(1);
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// Name and color of a player in a record: the roster's if they still exist.
const who = (p) => {
  const r = rosterById(p.id);
  return r
    ? { id: p.id, name: r.name, color: r.color, guest: !!r.guest }
    : { id: p.id, name: p.name, color: p.color, guest: !!p.guest };
};

// Sides of a game: one per player, or one per team at the scoppa.
const sides = (g) => new Set(g.players.map((p) => p.team || p.id)).size;

function games() {
  const [start, end] = range();
  return loadHistory().filter((g) => g.endedAt >= start && g.endedAt < end).sort((a, b) => a.endedAt - b.endedAt);
}

function when(ts) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 3600e3);
  if (d.toDateString() === today.toDateString()) return `Aujourd’hui ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Hier ${time}`;
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${time}`;
}

function section(title) {
  const s = el('section', 'g-section');
  s.append(el('h2', '', title));
  return s;
}

/* ---------- Statistics ---------- */

function renderStats() {
  const box = $('#globalStats');
  box.textContent = '';

  const tabs = el('div', 'chips period-tabs');
  for (const p of PERIODS) {
    const b = el('button', 'chip' + (p.key === period ? ' on' : ''), p.label);
    b.type = 'button';
    b.addEventListener('click', () => {
      period = p.key;
      offset = 0;
      try { localStorage.setItem('joueurs-period', period); } catch (e) { /* ignore */ }
      renderStats();
    });
    tabs.append(b);
  }
  box.append(tabs);

  if (period === 'month' || period === 'year') {
    // Browse previous months / years, back to the oldest recorded game.
    const oldest = Math.min(...loadHistory().map((g) => g.endedAt));
    const nav = el('div', 'period-nav');
    const prev = el('button', 'icon-btn', '‹');
    prev.type = 'button';
    prev.setAttribute('aria-label', period === 'month' ? 'Mois précédent' : 'Année précédente');
    prev.disabled = !(range()[0] > oldest);
    prev.addEventListener('click', () => { offset++; renderStats(); });
    const next = el('button', 'icon-btn', '›');
    next.type = 'button';
    next.setAttribute('aria-label', period === 'month' ? 'Mois suivant' : 'Année suivante');
    next.disabled = offset === 0;
    next.addEventListener('click', () => { offset--; renderStats(); });
    nav.append(prev, el('strong', '', rangeLabel()), next);
    box.append(nav);
  }

  const list = games();
  if (!list.length) {
    box.append(el('p', 'empty', period === 'all'
      ? 'Aucune partie terminée pour l’instant. Les parties s’enregistrent ici à la fin de chaque jeu.'
      : 'Aucune partie terminée sur cette période.'));
    return;
  }

  // Per player totals (guests play but are not ranked).
  const per = new Map();
  const get = (p) => {
    const w = who(p);
    if (!per.has(w.id)) per.set(w.id, { ...w, played: 0, wins: 0, expected: 0, byGame: {} });
    return per.get(w.id);
  };
  for (const g of list) {
    for (const p of g.players) {
      if (who(p).guest) continue;
      const s = get(p);
      const won = g.winners.includes(p.id);
      s.played++;
      // Wins expected if every side had the same chance.
      s.expected += 1 / sides(g);
      if (won) s.wins++;
      const bg = (s.byGame[g.game] = s.byGame[g.game] || { played: 0, wins: 0 });
      bg.played++;
      if (won) bg.wins++;
    }
  }
  /* Ranking index: wins divided by the wins expected at random (which
     depends on how many sides each game had), with one average game added
     to both so that a player with few games is not ranked on luck alone.
     1 = average, 1.5 = half as many wins again as expected. */
  for (const s of per.values()) s.index = (s.wins + 1) / (s.expected + 1);
  const players = [...per.values()].sort((a, b) => b.index - a.index || b.wins - a.wins);
  const n = list.length;
  if (!players.length) {
    box.append(el('p', 'empty', `${n} partie${n > 1 ? 's' : ''}, mais seulement entre invités.`));
    return;
  }
  const pct = (s) => `${Math.round((100 * s.wins) / s.played)} %`;
  const dec = (v, d) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

  box.append(el('p', 'stats-headline', `${n} partie${n > 1 ? 's' : ''} · 🏆 ${players[0].name} en tête (indice ${dec(players[0].index, 2)})`));

  const rank = section('Classement');
  rank.append(statsTable({
    players: players.map((s, i) => ({ ...s, name: `${i + 1}. ${s.name}` })),
    rows: [
      ['Indice', ...players.map((s) => dec(s.index, 2))],
      ['Victoires', ...players.map((s) => s.wins)],
      ['Parties', ...players.map((s) => s.played)],
      ['% de victoires', ...players.map(pct)],
      ['Victoires attendues', ...players.map((s) => dec(s.expected, 1))],
    ],
  }));
  rank.append(el('p', 'stats-note', 'Indice = victoires ÷ victoires attendues au hasard, selon le nombre d’adversaires de chaque partie, en comptant une partie moyenne de plus pour ne pas favoriser ceux qui ont peu joué. 1 = dans la moyenne. Les invités ne sont pas classés.'));
  box.append(rank);

  const played = Object.keys(GAMES).filter((k) => list.some((g) => g.game === k));
  const byGame = section('Par jeu (victoires / parties)');
  byGame.append(statsTable({
    players,
    rows: played.map((k) => [`${GAMES[k].icon} ${GAMES[k].name}`, ...players.map((s) => (s.byGame[k] ? `${s.byGame[k].wins} / ${s.byGame[k].played}` : '—'))]),
  }));
  box.append(byGame);

  // Cumulative wins, game after game.
  const chart = section('Victoires au fil des parties');
  const series = players.map((s) => ({ name: s.name, color: s.color, points: [[0, 0]] }));
  const idx = new Map(players.map((s, i) => [s.id, i]));
  const counts = players.map(() => 0);
  list.forEach((g, n) => {
    for (const id of g.winners) if (idx.has(id)) counts[idx.get(id)]++;
    series.forEach((s, i) => s.points.push([n + 1, counts[i]]));
  });
  if (series.length > 1) chart.append(legend(series));
  chart.append(lineChart(series, { xTitle: 'Partie', label: 'Victoires cumulées', integer: true }));
  chart.append(el('p', 'stats-note', 'Victoires cumulées après chaque partie · touche le graphique pour le détail.'));
  box.append(chart);

  const recs = records(list);
  if (recs.length) {
    const rs = section('Records');
    const ul = el('div', 'records');
    for (const [label, value] of recs) {
      const row = el('div', 'record-row');
      row.append(el('span', '', label), el('strong', '', value));
      ul.append(row);
    }
    rs.append(ul);
    box.append(rs);
  }

  const recent = section('Dernières parties');
  for (const g of [...list].reverse().slice(0, 30)) recent.append(gameRow(g));
  box.append(recent);
}

function records(list) {
  const out = [];
  const best = (game, pick, fmtValue) => {
    let top = null;
    for (const g of list.filter((x) => x.game === game)) {
      for (const p of g.players) {
        if (who(p).guest) continue;
        const v = pick(g, p);
        if (v != null && (!top || v.cmp > top.cmp)) top = { ...v, p: who(p), at: g.endedAt };
      }
    }
    return top && `${top.p.name} · ${fmtValue(top.value)}`;
  };
  const yams = best('yams', (g, p) => ({ value: p.score, cmp: p.score }), (v) => `${v} pts`);
  if (yams) out.push(['⚅ Meilleure grille de yams', yams]);
  const dix = best('dix-mille', (g, p) => ({ value: p.score, cmp: p.score }), (v) => `${fmt(v)} pts`);
  if (dix) out.push(['⚄ Plus gros score au dix-mille', dix]);
  const darts = best('flechettes', (g, p) => (g.winners.includes(p.id) && p.turns ? { value: p.turns, cmp: -p.turns } : null),
    (v) => `${v} volée${v > 1 ? 's' : ''}`);
  if (darts) out.push(['◎ Fléchettes : fin la plus rapide', darts]);
  const scoppa = best('scoppa', (g, p) => {
    if (!g.winners.includes(p.id)) return null;
    const lose = Math.max(...g.players.filter((o) => !g.winners.includes(o.id)).map((o) => o.score), 0);
    return { value: p.score - lose, cmp: p.score - lose };
  }, (v) => `+${v} d’écart`);
  if (scoppa) out.push(['♠ Plus large victoire à la scoppa', scoppa]);
  return out;
}

function gameRow(g) {
  const row = el('div', 'past-game');
  const info = GAMES[g.game] || { name: g.game, icon: '•', color: '#888' };
  const icon = el('span', 'past-game-icon', info.icon);
  icon.style.background = info.color;
  const body = el('div', 'past-game-body');
  body.append(el('div', 'past-game-title', `${info.name} · ${when(g.endedAt)}`));
  // Players by result; teammates (scoppa) share a line.
  const order = [...g.players].sort((a, b) => (g.lowWins ? a.score - b.score : b.score - a.score));
  const seen = new Set();
  const parts = [];
  for (const p of order) {
    if (seen.has(p.team || p.id)) continue;
    seen.add(p.team || p.id);
    const mates = p.team ? order.filter((o) => o.team === p.team) : [p];
    const names = mates.map((m) => who(m).name).join(' & ');
    parts.push(`${g.winners.includes(p.id) ? '🏆 ' : ''}${names} ${fmt(p.score)}`);
  }
  body.append(el('div', 'past-game-scores', parts.join(' · ')));
  const del = el('button', 'past-btn del', '✕');
  del.type = 'button';
  del.setAttribute('aria-label', 'Retirer cette partie des statistiques');
  del.addEventListener('click', () => {
    if (!confirm('Retirer cette partie des statistiques ?')) return;
    unrecordGame(g.gameId);
    renderStats();
  });
  row.append(icon, body, del);
  return row;
}

/* ---------- Roster ---------- */

function renderRoster() {
  renderPlayerEditor($('#players'), roster, {
    onChange: saveRoster,
    onRemove: (id) => {
      roster = roster.filter((p) => p.id !== id);
      saveRoster();
      renderRoster();
      renderStats();
    },
    rerender: () => { renderRoster(); renderStats(); },
    removeText: (p) => `Supprimer ${p.name} de la liste des joueurs ? Ses parties restent dans l’historique.`,
    extra: (p) => {
      const box = el('div', 'roster-extra');
      const guest = el('button', 'mini-btn' + (p.guest ? ' on' : ''), 'Invité');
      guest.type = 'button';
      guest.title = 'Un invité joue normalement mais ne compte pas dans les statistiques globales';
      guest.setAttribute('aria-pressed', !!p.guest);
      guest.addEventListener('click', () => {
        if (p.guest) delete p.guest; else p.guest = true;
        saveRoster();
        renderRoster();
        renderStats();
      });
      const qr = el('button', 'mini-btn', 'QR');
      qr.type = 'button';
      qr.setAttribute('aria-label', `QR code de ${p.name}`);
      qr.addEventListener('click', () => showQr([p]));
      box.append(guest, qr);
      return box;
    },
  });
}

/* ---------- Sharing players between phones ---------- */

function sheet(title) {
  closeStats();
  const overlay = el('div', 'stats-overlay');
  overlay.id = 'statsOverlay';
  const body = el('div', 'stats-sheet');
  body.setAttribute('role', 'dialog');
  body.setAttribute('aria-label', title);
  const head = el('div', 'stats-head');
  const close = el('button', 'icon-btn', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Fermer');
  close.addEventListener('click', closeStats);
  head.append(el('h2', '', title), close);
  body.append(head);
  overlay.append(body);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeStats(); });
  document.body.append(overlay);
  return body;
}

function showQr(players) {
  const body = sheet(players.length === 1 ? players[0].name : 'Tous les joueurs');
  const qr = qrcode(0, 'M');
  qr.addData(encodeProfiles(players), 'Byte');
  qr.make();
  const box = el('div', 'qr-box');
  box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  body.append(box);
  body.append(el('p', 'stats-note', `${players.map((p) => p.name).join(', ')}. Sur l’autre téléphone : ★ Joueurs & statistiques → « Scanner un QR code », puis vise ce code.`));
}

const scan = { stream: null, reader: null };

async function openScanner() {
  const body = sheet('Scanner un QR code');
  body.classList.add('scan-sheet');
  const view = el('div', 'scan-view');
  const video = el('video');
  video.setAttribute('playsinline', '');
  video.muted = true;
  const mark = el('span', 'scan-mark');
  view.append(video, mark);
  const status = el('p', 'stats-note', 'Vise le QR code affiché sur l’autre téléphone.');
  body.append(view, status);
  // Closing the sheet (✕, outside tap, Échap) releases the camera.
  new MutationObserver((_, obs) => {
    if (!document.body.contains(body)) { stopScanner(); obs.disconnect(); }
  }).observe(document.body, { childList: true });

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.textContent = 'La caméra n’est pas disponible sur ce navigateur.';
    return;
  }
  let media;
  try {
    media = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (e) {
    status.textContent = `Caméra refusée ou indisponible : ${e.message}`;
    return;
  }
  if (!document.body.contains(body)) { media.getTracks().forEach((t) => t.stop()); return; }
  scan.stream = media;
  video.srcObject = media;
  await video.play().catch(() => {});
  scan.reader = window.CameraScan.create(video, mark);
  await scan.reader.prepare();
  while (scan.stream === media) {
    try {
      const text = await scan.reader.detect();
      if (text) {
        const players = decodeProfiles(text);
        if (players && players.length) { stopScanner(); closeStats(); receive(players); return; }
        status.textContent = 'Ce QR code ne contient pas de joueurs.';
      }
    } catch (e) { /* image illisible */ }
    await new Promise((r) => setTimeout(r, scan.reader.delay()));
  }
}

function stopScanner() {
  if (scan.stream) scan.stream.getTracks().forEach((t) => t.stop());
  scan.stream = null;
}

function receive(players) {
  sfx.add();
  const twins = players.filter((p) => !rosterById(p.id) && roster.some((r) => sameName(r.name, p.name)));
  const names = players.map((p) => p.name).join(', ');
  const note = twins.length ? `\n\n${twins.map((p) => p.name).join(', ')} existe déjà ici : ce sera le même joueur (ses parties sont conservées).` : '';
  if (!confirm(`Recevoir ${players.length > 1 ? 'ces joueurs' : 'ce joueur'} : ${names} ?${note}`)) return;
  const { added, updated, merged } = receiveProfiles(players);
  const parts = [];
  if (added.length) parts.push(`${added.length} ajouté${added.length > 1 ? 's' : ''}`);
  if (updated.length) parts.push(`${updated.length} mis à jour`);
  if (merged.length) parts.push(`${merged.length} fusionné${merged.length > 1 ? 's' : ''}`);
  toast(parts.join(', ') || 'Rien de nouveau', 2500);
  renderRoster();
  renderStats();
}

/* ---------- Backup file ---------- */

async function exportBackup() {
  const json = JSON.stringify(backupData(), null, 1);
  const name = `feuilles-de-score-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  // Phones: the share sheet saves the file (Fichiers, Drive, e-mail…).
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Sauvegarde des scores' }); return; } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = el('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let backup = null;
    try { backup = JSON.parse(reader.result); } catch (e) { /* not JSON */ }
    if (!backup || backup.app !== BACKUP_APP) { toast('Ce fichier n’est pas une sauvegarde des scores', 3000); return; }
    const date = backup.exportedAt ? new Date(backup.exportedAt).toLocaleString('fr-FR') : 'date inconnue';
    if (!confirm(`Remplacer toutes les données de ce téléphone (joueurs, parties en cours, historique) par la sauvegarde du ${date} ?`)) return;
    restoreBackup(backup);
    location.reload();
  };
  reader.readAsText(file);
}

$('#newPlayerBtn').addEventListener('click', () => {
  const p = newRosterPlayer();
  renderRoster();
  focusName(p.id);
});
$('#newGuestBtn').addEventListener('click', () => {
  if (newGuest()) { renderRoster(); renderStats(); }
});
$('#scanBtn').addEventListener('click', openScanner);
$('#qrAllBtn').addEventListener('click', () => {
  if (!roster.length) { toast('Aucun joueur à partager'); return; }
  showQr(roster);
});
$('#exportBtn').addEventListener('click', exportBackup);
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', (e) => {
  if (e.target.files[0]) importBackup(e.target.files[0]);
  e.target.value = '';
});
// Names typed in the roster show up in the statistics once editing is done.
$('#players').addEventListener('focusout', () => renderStats());

renderRoster();
renderStats();
initChrome();
