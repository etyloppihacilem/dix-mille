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
let gameFilter = 'all'; // gameKey of the only game shown, or 'all'
try { gameFilter = localStorage.getItem('joueurs-game') || 'all'; } catch (e) { /* ignore */ }

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
  return loadHistory()
    .filter((g) => g.endedAt >= start && g.endedAt < end && (gameFilter === 'all' || gameKey(g) === gameFilter))
    .sort((a, b) => a.endedAt - b.endedAt);
}

// Every game ever recorded: the app's games first, then the others by name.
function allKinds() {
  const kinds = new Map();
  for (const g of loadHistory()) if (!kinds.has(gameKey(g))) kinds.set(gameKey(g), gameInfo(g));
  const order = Object.keys(GAMES);
  return [...kinds.entries()].sort(([a, ia], [b, ib]) => {
    const oa = order.indexOf(a), ob = order.indexOf(b);
    if (oa >= 0 || ob >= 0) return (oa < 0 ? 99 : oa) - (ob < 0 ? 99 : ob);
    return ia.name.localeCompare(ib.name, 'fr');
  });
}

function renderGameFilter(box) {
  const kinds = allKinds();
  if (gameFilter !== 'all' && !kinds.some(([k]) => k === gameFilter)) gameFilter = 'all';
  if (kinds.length < 2) return;
  const row = el('div', 'chips game-filter');
  const pick = (key, label) => {
    const b = el('button', 'chip' + (gameFilter === key ? ' on' : ''), label);
    b.type = 'button';
    b.addEventListener('click', () => {
      gameFilter = key;
      try { localStorage.setItem('joueurs-game', key); } catch (e) { /* ignore */ }
      renderStats();
    });
    row.append(b);
  };
  pick('all', 'Tous les jeux');
  for (const [k, info] of kinds) pick(k, GAMES[k] ? `${info.icon} ${info.name}` : info.name);
  box.append(row);
  // Keep the selected game in view in the scrolling row.
  const on = row.querySelector('.on');
  if (on) requestAnimationFrame(() => on.scrollIntoView({ block: 'nearest', inline: 'center' }));
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
  renderGameFilter(box);

  const list = games();
  if (!list.length) {
    box.append(el('p', 'empty', !loadHistory().length
      ? 'Aucune partie terminée pour l’instant. Les parties s’enregistrent ici à la fin de chaque jeu.'
      : gameFilter !== 'all' ? 'Aucune partie de ce jeu sur cette période.' : 'Aucune partie terminée sur cette période.'));
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
      const bg = (s.byGame[gameKey(g)] = s.byGame[gameKey(g)] || { played: 0, wins: 0 });
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

  const hl = highlights(list, players);
  if (hl.length) {
    const hs = section('Faits marquants');
    const grid = el('div', 'highlights');
    for (const h of hl) {
      const card = el('div', 'highlight');
      card.append(el('span', 'highlight-icon', h.icon), el('span', 'highlight-title', h.title), el('span', 'highlight-text', h.text));
      if (h.sub) card.append(el('span', 'highlight-sub', h.sub));
      grid.append(card);
    }
    hs.append(grid);
    box.append(hs);
  }

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

  // The app's games first, then the ones entered by hand, by name.
  const kinds = new Map();
  for (const g of list) if (!kinds.has(gameKey(g))) kinds.set(gameKey(g), gameInfo(g));
  const order = Object.keys(GAMES);
  const played = [...kinds.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return kinds.get(a).name.localeCompare(kinds.get(b).name, 'fr');
  });
  if (played.length > 1) {
    const byGame = section('Par jeu (victoires / parties)');
    byGame.append(statsTable({
      players,
      rows: played.map((k) => [order.includes(k) ? `${kinds.get(k).icon} ${kinds.get(k).name}` : kinds.get(k).name,
        ...players.map((s) => (s.byGame[k] ? `${s.byGame[k].wins} / ${s.byGame[k].played}` : '—'))]),
    }));
    box.append(byGame);
  }

  if (players.length > 1) {
    const duels = section('Duels');
    duels.append(statsTable({
      players,
      rows: players.map((a) => [a.name, ...players.map((b) => {
        if (a.id === b.id) return '·';
        const d = duel(list, a.id, b.id);
        return d.together ? `${d.a}–${d.b}` : '—';
      })]),
    }));
    duels.append(el('p', 'stats-note', 'Victoires–défaites du joueur de la ligne face à celui de la colonne, dans les parties qu’ils ont jouées ensemble.'));
    box.append(duels);
  }

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

  // Ranking index after each game, from each player's first game on.
  const perf = section('Indice au fil des parties');
  const acc = new Map(players.map((s) => [s.id, { w: 0, e: 0 }]));
  const iseries = players.map((s) => ({ name: s.name, color: s.color, points: [] }));
  list.forEach((g, n) => {
    for (const p of g.players) {
      const a = acc.get(p.id);
      if (!a) continue;
      a.e += 1 / sides(g);
      if (g.winners.includes(p.id)) a.w++;
    }
    players.forEach((s, i) => {
      const a = acc.get(s.id);
      if (a.e) iseries[i].points.push([n + 1, (a.w + 1) / (a.e + 1)]);
    });
  });
  if (iseries.length > 1) perf.append(legend(iseries));
  perf.append(lineChart(iseries, { xTitle: 'Partie', label: 'Indice de chaque joueur', target: 1, targetLabel: 'moyenne', format: (v) => dec(v, 2) }));
  perf.append(el('p', 'stats-note', 'Au-dessus de la ligne « moyenne », le joueur gagne plus souvent que le hasard ne le voudrait.'));
  box.append(perf);

  const act = activity(list);
  if (act.length > 1) {
    const as = section('Activité');
    as.append(columnChart(act));
    as.append(el('p', 'stats-note', 'Parties terminées par période · touche une colonne pour le détail.'));
    box.append(as);
  }

  if (played.length > 1) {
    const gs = section('Parties par jeu');
    gs.append(barList(played
      .map((k) => ({ label: kinds.get(k).name, value: list.filter((g) => gameKey(g) === k).length, color: kinds.get(k).color }))
      .sort((a, b) => b.value - a.value)));
    box.append(gs);
  }

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

/* ---------- Highlights ---------- */

const dateLabel = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }).replace(/^1 /, '1er ');
const dayOf = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

// Wins of a over b and of b over a, in the games they both played.
function duel(list, a, b) {
  const r = { a: 0, b: 0, together: 0 };
  for (const g of list) {
    const ids = g.players.map((p) => p.id);
    if (!ids.includes(a) || !ids.includes(b)) continue;
    const ta = g.players.find((p) => p.id === a).team;
    if (ta && ta === g.players.find((p) => p.id === b).team) continue; // teammates
    r.together++;
    const wa = g.winners.includes(a), wb = g.winners.includes(b);
    if (wa && !wb) r.a++;
    if (wb && !wa) r.b++;
  }
  return r;
}

function highlights(list, players) {
  const out = [];
  const by = (arr, f) => arr.reduce((best, x) => (best == null || f(x) > f(best) ? x : best), null);

  // Win streaks, over the games each player took part in.
  const st = players.map((s) => {
    let best = 0, run = 0;
    for (const g of list) {
      if (!g.players.some((p) => p.id === s.id)) continue;
      run = g.winners.includes(s.id) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return { s, best, current: run };
  });
  const longest = by(st, (x) => x.best);
  if (longest && longest.best >= 2) out.push({ icon: '🔥', title: 'Plus longue série', text: `${longest.s.name} : ${longest.best} victoires d’affilée` });
  const ongoing = by(st, (x) => x.current);
  if (ongoing && ongoing.current >= 2 && (ongoing !== longest || ongoing.current !== longest.best)) {
    out.push({ icon: '⚡', title: 'Série en cours', text: `${ongoing.s.name} : ${ongoing.current} victoires de suite` });
  } else if (ongoing && ongoing.current >= 2) {
    out[out.length - 1].sub = 'et ça continue !';
  }

  // Best day for one player.
  const days = new Map();
  for (const g of list) {
    for (const id of g.winners) {
      if (!players.some((s) => s.id === id)) continue;
      const k = `${dayOf(g.endedAt)}|${id}`;
      const d = days.get(k) || { id, n: 0, at: g.endedAt };
      d.n++;
      days.set(k, d);
    }
  }
  const bestDay = by([...days.values()], (d) => d.n);
  if (bestDay && bestDay.n >= 2) {
    out.push({ icon: '🌟', title: 'Plus belle journée', text: `${players.find((s) => s.id === bestDay.id).name} : ${bestDay.n} victoires`, sub: `le ${dateLabel(bestDay.at)}` });
  }

  // The rivalry with the most games played together (closest record first).
  const pairs = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const d = duel(list, players[i].id, players[j].id);
      pairs.push({ p: players[i], q: players[j], wp: d.a, wq: d.b, together: d.together });
    }
  }
  const rival = by(pairs, (r) => r.together * 100 - Math.abs(r.wp - r.wq));
  if (rival && rival.together >= 2) {
    const [lead, wl, other, wo] = rival.wp >= rival.wq ? [rival.p, rival.wp, rival.q, rival.wq] : [rival.q, rival.wq, rival.p, rival.wp];
    out.push({ icon: '⚔️', title: 'Grande rivalité', text: `${lead.name} ${wl} – ${wo} ${other.name}`, sub: `sur ${rival.together} parties ensemble` });
  }

  // Closest game on points.
  let closest = null;
  for (const g of list) {
    if (g.mode === 'winner') continue;
    const sidesScores = [];
    const seen = new Set();
    for (const p of g.players) {
      const k = p.team || p.id;
      if (seen.has(k)) continue;
      seen.add(k);
      sidesScores.push({ name: p.team || who(p).name, score: p.score });
    }
    if (sidesScores.length < 2) continue;
    sidesScores.sort((a, b) => (g.lowWins ? a.score - b.score : b.score - a.score));
    const [x, y] = sidesScores;
    const rel = Math.abs(x.score - y.score) / Math.max(Math.abs(x.score), Math.abs(y.score), 1);
    if (!closest || rel < closest.rel) closest = { rel, g, x, y };
  }
  if (closest && closest.rel < 0.1) {
    out.push({ icon: '🤏', title: 'Partie la plus serrée', text: `${closest.x.name} ${fmt(closest.x.score)} – ${fmt(closest.y.score)} ${closest.y.name}`, sub: `${gameInfo(closest.g).name}, le ${dateLabel(closest.g.endedAt)}` });
  }

  // Specialist: best win rate on one game (3 games at least).
  const spec = [];
  for (const s of players) {
    for (const [k, v] of Object.entries(s.byGame)) if (v.played >= 3) spec.push({ s, k, ...v, rate: v.wins / v.played });
  }
  const top = by(spec, (x) => x.rate * 1000 + x.played);
  if (top && top.rate > 0.5) {
    const g = list.find((x) => gameKey(x) === top.k);
    out.push({ icon: '🎓', title: 'Spécialiste', text: `${top.s.name} · ${gameInfo(g).name}`, sub: `${top.wins} victoires sur ${top.played}` });
  }

  if (players.length > 1) {
    const busy = by(players, (s) => s.played);
    out.push({ icon: '🏃', title: 'Le plus assidu', text: `${busy.name} : ${busy.played} parties` });
  }
  const counts = new Map();
  for (const g of list) counts.set(gameKey(g), (counts.get(gameKey(g)) || 0) + 1);
  const fav = by([...counts.entries()], (e) => e[1]);
  if (fav && counts.size > 1) {
    out.push({ icon: '❤️', title: 'Jeu le plus joué', text: `${gameInfo(list.find((g) => gameKey(g) === fav[0])).name} : ${fav[1]} parties` });
  }
  const perDay = new Map();
  for (const g of list) {
    const d = perDay.get(dayOf(g.endedAt)) || { n: 0, at: g.endedAt };
    d.n++;
    perDay.set(dayOf(g.endedAt), d);
  }
  const busiest = by([...perDay.values()], (d) => d.n);
  if (busiest && busiest.n >= 3 && perDay.size > 1) {
    out.push({ icon: '📅', title: 'Journée la plus chargée', text: `${busiest.n} parties`, sub: `le ${dateLabel(busiest.at)}` });
  }
  return out;
}

// Games per day, week or month depending on the span, gaps included.
function activity(list) {
  if (!list.length) return [];
  const first = list[0].endedAt;
  const last = list[list.length - 1].endedAt;
  const spanDays = (last - first) / (24 * 3600e3);
  const unit = spanDays <= 21 ? 'day' : spanDays <= 150 ? 'week' : 'month';
  const start = (ts) => {
    const d = new Date(ts);
    if (unit === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (unit === 'week') day.setDate(day.getDate() - ((day.getDay() + 6) % 7)); // Monday
    return day;
  };
  const step = (d) => {
    const n = new Date(d);
    if (unit === 'month') n.setMonth(n.getMonth() + 1);
    else n.setDate(n.getDate() + (unit === 'week' ? 7 : 1));
    return n;
  };
  const items = [];
  for (let d = start(first); d.getTime() <= last; d = step(d)) {
    const end = step(d).getTime();
    const n = list.filter((g) => g.endedAt >= d.getTime() && g.endedAt < end).length;
    const label = unit === 'month'
      ? d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
      : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' });
    const what = unit === 'month' ? d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      : unit === 'week' ? `semaine du ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
        : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    items.push({ label, value: n, title: `${what} : ${n} partie${n > 1 ? 's' : ''}` });
  }
  return items;
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
  const info = gameInfo(g);
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
    // A game with a single winner (entered by hand) has no points to show.
    parts.push(`${g.winners.includes(p.id) ? '🏆 ' : ''}${names}${g.mode === 'winner' ? '' : ` ${fmt(p.score)}`}`);
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

// The players and all their finished games, as one QR code or a series of
// QR codes shown in turn (the other phone collects them in any order).
async function showQr(players, everything = false) {
  const body = sheet(everything ? 'Synchronisation globale' : players.length === 1 ? players[0].name : 'Joueurs');
  const { bundle, games } = buildBundle(players.map((p) => p.id), everything);
  const frames = await bundleFrames(bundle);
  const svgs = frames.map((text) => {
    const qr = qrcode(0, 'L');
    qr.addData(text, 'Byte');
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  });
  const box = el('div', 'qr-box');
  body.append(box);
  const info = el('p', 'qr-progress');
  body.append(info);
  let i = 0, paused = false;
  const show = () => {
    box.innerHTML = svgs[i];
    info.textContent = frames.length > 1 ? `QR code ${i + 1} / ${frames.length}${paused ? ' · en pause (touche pour reprendre)' : ''}` : '';
  };
  show();
  if (frames.length > 1) {
    const timer = setInterval(() => {
      if (!document.body.contains(box)) { clearInterval(timer); return; }
      if (!paused) { i = (i + 1) % frames.length; show(); }
    }, 900);
    box.addEventListener('click', () => { paused = !paused; show(); });
  }
  const who = players.map((p) => p.name).join(', ');
  body.append(el('p', 'stats-note', `${who} · ${games} partie${games > 1 ? 's' : ''} terminée${games > 1 ? 's' : ''}. `
    + 'Sur l’autre téléphone : ★ Joueurs & statistiques → « Scanner un QR code », puis vise l’écran'
    + (frames.length > 1 ? ' jusqu’à ce que tous les QR codes soient lus (ils défilent tout seuls).' : '.')
    + ' Les parties déjà présentes là-bas ne sont pas dupliquées.'));
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
  const collector = frameCollector();
  while (scan.stream === media) {
    try {
      const text = await scan.reader.detect();
      const frame = text && parseFrame(text);
      if (frame) {
        const before = collector.received();
        collector.add(frame);
        if (collector.received() !== before) sfx.key();
        status.textContent = `QR codes lus : ${collector.received()} / ${collector.total()}`;
        if (collector.complete()) {
          stopScanner();
          let bundle;
          try { bundle = await collector.bundle(); } catch (e) { status.textContent = e.message; return; }
          closeStats();
          receiveBundle(bundle);
          return;
        }
      } else if (text) {
        // QR codes of the previous version: players only.
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

function receiveBundle(bundle) {
  sfx.add();
  const { players, games, fresh } = previewBundle(bundle);
  const twins = bundle.m.map((i) => bundle.p[i]).filter(([id, name]) => !rosterById(id) && roster.some((r) => sameName(r.name, name)));
  const note = twins.length ? `\n\n${twins.map((p) => p[1]).join(', ')} existe déjà ici : ce sera le même joueur.` : '';
  const what = fresh ? `${fresh} nouvelle${fresh > 1 ? 's' : ''} partie${fresh > 1 ? 's' : ''}` : 'aucune nouvelle partie';
  const dup = games - fresh ? ` (${games - fresh} déjà enregistrée${games - fresh > 1 ? 's' : ''}, ignorée${games - fresh > 1 ? 's' : ''})` : '';
  if (!confirm(`Recevoir ${players.join(', ')} avec ${what}${dup} ?${note}`)) return;
  const r = importBundle(bundle);
  const parts = [];
  if (r.added.length) parts.push(`${r.added.length} joueur${r.added.length > 1 ? 's' : ''} ajouté${r.added.length > 1 ? 's' : ''}`);
  if (r.merged.length) parts.push(`${r.merged.length} fusionné${r.merged.length > 1 ? 's' : ''}`);
  parts.push(`${r.games} partie${r.games > 1 ? 's' : ''} importée${r.games > 1 ? 's' : ''}`);
  toast(parts.join(', '), 3000);
  renderRoster();
  renderStats();
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
  if (!roster.length && !loadHistory().length) { toast('Rien à synchroniser pour l’instant'); return; }
  showQr(roster, true);
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
