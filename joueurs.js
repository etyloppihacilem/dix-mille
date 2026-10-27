'use strict';

/* Global page: the shared roster and statistics over every finished game,
   for the last 24 hours, the last 7 days or all time. */

const PERIODS = [
  { key: 'day', label: '24 h', ms: 24 * 3600e3 },
  { key: 'week', label: '7 jours', ms: 7 * 24 * 3600e3 },
  { key: 'all', label: 'Tout', ms: Infinity },
];
let period = 'all';
try { period = localStorage.getItem('joueurs-period') || 'all'; } catch (e) { /* ignore */ }

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// Name and color of a player in a record: the roster's if they still exist.
const who = (p) => {
  const r = rosterById(p.id);
  return r ? { id: p.id, name: r.name, color: r.color } : { id: p.id, name: p.name, color: p.color };
};

function games() {
  const ms = PERIODS.find((p) => p.key === period).ms;
  const since = Date.now() - ms;
  return loadHistory().filter((g) => g.endedAt >= since).sort((a, b) => a.endedAt - b.endedAt);
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
      try { localStorage.setItem('joueurs-period', period); } catch (e) { /* ignore */ }
      renderStats();
    });
    tabs.append(b);
  }
  box.append(tabs);

  const list = games();
  if (!list.length) {
    box.append(el('p', 'empty', period === 'all'
      ? 'Aucune partie terminée pour l’instant. Les parties s’enregistrent ici à la fin de chaque jeu.'
      : 'Aucune partie terminée sur cette période.'));
    return;
  }

  // Per player totals.
  const per = new Map();
  const get = (p) => {
    const w = who(p);
    if (!per.has(w.id)) per.set(w.id, { ...w, played: 0, wins: 0, byGame: {} });
    return per.get(w.id);
  };
  for (const g of list) {
    for (const p of g.players) {
      const s = get(p);
      const won = g.winners.includes(p.id);
      s.played++;
      if (won) s.wins++;
      const bg = (s.byGame[g.game] = s.byGame[g.game] || { played: 0, wins: 0 });
      bg.played++;
      if (won) bg.wins++;
    }
  }
  const players = [...per.values()].sort((a, b) => b.wins - a.wins || b.wins / b.played - a.wins / a.played);
  const pct = (s) => `${Math.round((100 * s.wins) / s.played)} %`;

  const head = el('p', 'stats-headline', `${list.length} partie${list.length > 1 ? 's' : ''} · 🏆 ${players[0].name} en tête avec ${players[0].wins} victoire${players[0].wins > 1 ? 's' : ''}`);
  box.append(head);

  const rank = section('Classement');
  rank.append(statsTable({
    players,
    rows: [
      ['Victoires', ...players.map((s) => s.wins)],
      ['Parties', ...players.map((s) => s.played)],
      ['% de victoires', ...players.map(pct)],
    ],
  }));
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
  chart.append(lineChart(series, { xTitle: 'Partie', label: 'Victoires cumulées' }));
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
  });
}

$('#newPlayerBtn').addEventListener('click', () => {
  const p = newRosterPlayer();
  renderRoster();
  focusName(p.id);
});
// Names typed in the roster show up in the statistics once editing is done.
$('#players').addEventListener('focusout', () => renderStats());

renderRoster();
renderStats();
initChrome();
