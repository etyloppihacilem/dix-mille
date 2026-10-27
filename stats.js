'use strict';

/* End-of-game statistics: a progression line chart (hand-written SVG, no
   library) and summary tables, shown in a full-screen sheet. */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// Pure black would vanish on the dark surface: draw it with the text color.
const markColor = (c) => (/^#0{3}(0{3})?$/i.test(c) ? 'var(--text)' : c);

function niceStep(range, count) {
  const raw = Math.max(range, 1) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

const compact = (n) => (Math.abs(n) >= 1000 ? `${fmt(Math.round(n / 100) / 10)} k` : fmt(n));

// Value of a series at turn x: its last point at or before x.
function valueAt(points, x) {
  let v = null;
  for (const [px, py] of points) if (px <= x) v = py;
  return v;
}

/* series: [{ name, color, points: [[x, y], …] }] (x = turn number, from 0)
   opts: { target, xName } */
function lineChart(series, opts = {}) {
  const W = 340, H = 210;
  const m = { l: 38, r: 10, t: 14, b: 26 };
  const all = series.flatMap((s) => s.points);
  const xMax = Math.max(1, ...all.map((p) => p[0]));
  const yMaxData = Math.max(0, ...all.map((p) => p[1]), opts.target ?? 0);
  const yMinData = Math.min(0, ...all.map((p) => p[1]));
  // Counts (wins…) get whole-number ticks.
  const yStep = opts.integer ? Math.max(1, Math.ceil(niceStep(yMaxData - yMinData, 4))) : niceStep(yMaxData - yMinData, 4);
  const yMin = Math.floor(yMinData / yStep) * yStep;
  const yMax = Math.ceil(yMaxData / yStep) * yStep || yStep;
  const X = (x) => m.l + (x / xMax) * (W - m.l - m.r);
  const Y = (y) => H - m.b - ((y - yMin) / (yMax - yMin)) * (H - m.t - m.b);

  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.label || 'Progression des scores' });
  wrap.append(svg);

  // Grid and y ticks.
  for (let y = yMin; y <= yMax + 1e-9; y += yStep) {
    svg.append(svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(y), y2: Y(y), class: 'grid' }));
    const t = svgEl('text', { x: m.l - 6, y: Y(y) + 3.5, class: 'tick', 'text-anchor': 'end' });
    t.textContent = compact(y);
    svg.append(t);
  }
  // X ticks: whole turns.
  const xStep = Math.max(1, Math.ceil(niceStep(xMax, 6)));
  for (let x = 0; x <= xMax; x += xStep) {
    const t = svgEl('text', { x: X(x), y: H - m.b + 15, class: 'tick', 'text-anchor': 'middle' });
    t.textContent = x;
    svg.append(t);
  }

  if (opts.target) {
    svg.append(svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(opts.target), y2: Y(opts.target), class: 'target' }));
    const t = svgEl('text', { x: m.l + 4, y: Y(opts.target) - 4, class: 'tick target-label', 'text-anchor': 'start' });
    t.textContent = `objectif ${fmt(opts.target)}`;
    svg.append(t);
  }

  for (const s of series) {
    const c = markColor(s.color);
    if (s.points.length > 1) {
      const d = s.points.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('');
      svg.append(svgEl('path', { d, class: 'line', style: `stroke: ${c}` }));
    }
    const [lx, ly] = s.points[s.points.length - 1] || [0, 0];
    svg.append(svgEl('circle', { cx: X(lx), cy: Y(ly), r: 4, class: 'dot', style: `fill: ${c}` }));
  }

  // Hover / touch: crosshair on the nearest turn and a tooltip with every value.
  const rule = svgEl('line', { y1: m.t, y2: H - m.b, class: 'rule', visibility: 'hidden' });
  const marks = series.map((s) => svgEl('circle', { r: 4.5, class: 'dot', style: `fill: ${markColor(s.color)}`, visibility: 'hidden' }));
  svg.append(rule, ...marks);
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  wrap.append(tip);

  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    const x = Math.max(0, Math.min(xMax, Math.round(((vx - m.l) / (W - m.l - m.r)) * xMax)));
    rule.setAttribute('x1', X(x));
    rule.setAttribute('x2', X(x));
    rule.setAttribute('visibility', 'visible');
    const rows = [];
    series.forEach((s, i) => {
      const v = valueAt(s.points, x);
      if (v == null) { marks[i].setAttribute('visibility', 'hidden'); return; }
      marks[i].setAttribute('cx', X(x));
      marks[i].setAttribute('cy', Y(v));
      marks[i].setAttribute('visibility', 'visible');
      rows.push([s, v]);
    });
    rows.sort((a, b) => b[1] - a[1]);
    tip.textContent = '';
    const head = document.createElement('div');
    head.className = 'chart-tip-head';
    head.textContent = `${opts.xTitle || 'Tour'} ${x}`;
    tip.append(head);
    for (const [s, v] of rows) {
      const row = document.createElement('div');
      row.className = 'chart-tip-row';
      const key = document.createElement('span');
      key.className = 'key';
      key.style.background = markColor(s.color);
      const name = document.createElement('span');
      name.textContent = s.name;
      const val = document.createElement('strong');
      val.textContent = fmt(v);
      row.append(key, name, val);
      tip.append(row);
    }
    tip.hidden = false;
    const px = (X(x) / W) * r.width;
    const left = px > r.width / 2 ? px - tip.offsetWidth - 10 : px + 10;
    tip.style.left = `${Math.max(0, left)}px`;
  };
  const hide = () => {
    rule.setAttribute('visibility', 'hidden');
    marks.forEach((d) => d.setAttribute('visibility', 'hidden'));
    tip.hidden = true;
  };
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  return wrap;
}

function legend(series) {
  const box = document.createElement('div');
  box.className = 'legend';
  for (const s of series) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const key = document.createElement('span');
    key.className = 'key';
    key.style.background = markColor(s.color);
    item.append(key, s.name);
    box.append(item);
  }
  return box;
}

/* table: { title, players: [{ name, color }], rows: [[label, ...values]] } */
function statsTable(table) {
  const wrap = document.createElement('div');
  wrap.className = 'stats-table-wrap';
  const t = document.createElement('table');
  t.className = 'stats-table';
  const head = t.createTHead().insertRow();
  head.append(document.createElement('th'));
  for (const p of table.players) {
    const th = document.createElement('th');
    th.style.setProperty('--pc', markColor(p.color));
    th.textContent = p.name;
    head.append(th);
  }
  const body = t.createTBody();
  for (const [label, ...values] of table.rows) {
    const tr = body.insertRow();
    const th = document.createElement('th');
    th.textContent = label;
    tr.append(th);
    for (const v of values) tr.insertCell().textContent = v;
  }
  wrap.append(t);
  return wrap;
}

/* opts: { title, headline, series, chart: { target, xName, xTitle },
           chartNote, tables: [...], onNewGame } */
function openStats(opts) {
  closeStats();
  const overlay = document.createElement('div');
  overlay.className = 'stats-overlay';
  overlay.id = 'statsOverlay';
  const sheet = document.createElement('div');
  sheet.className = 'stats-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', opts.title);

  const head = document.createElement('div');
  head.className = 'stats-head';
  const h = document.createElement('h2');
  h.textContent = opts.title;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-btn';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Fermer');
  close.addEventListener('click', closeStats);
  head.append(h, close);
  sheet.append(head);

  if (opts.headline) {
    const p = document.createElement('p');
    p.className = 'stats-headline';
    p.textContent = opts.headline;
    sheet.append(p);
  }

  const section = (title) => {
    const h3 = document.createElement('h3');
    h3.textContent = title;
    sheet.append(h3);
  };

  section('Progression');
  if (opts.series && opts.series.some((s) => s.points.length > 1)) {
    if (opts.series.length > 1) sheet.append(legend(opts.series));
    sheet.append(lineChart(opts.series, opts.chart));
    const hint = document.createElement('p');
    hint.className = 'stats-note';
    const unit = opts.chart?.xName || 'tour';
    hint.textContent = `${opts.chart?.yName || 'Score cumulé'} à chaque ${unit} (axe horizontal) · touche le graphique pour le détail.`;
    sheet.append(hint);
  } else {
    const p = document.createElement('p');
    p.className = 'stats-note';
    p.textContent = opts.chartNote || 'Pas encore assez de tours pour tracer la progression.';
    sheet.append(p);
  }

  for (const table of opts.tables || []) {
    section(table.title);
    sheet.append(statsTable(table));
  }

  const actions = document.createElement('div');
  actions.className = 'stats-actions';
  if (opts.onNewGame) {
    const ng = document.createElement('button');
    ng.type = 'button';
    ng.className = 'wide-btn danger';
    ng.textContent = 'Nouvelle partie';
    ng.addEventListener('click', () => { closeStats(); opts.onNewGame(); });
    actions.append(ng);
  }
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'wide-btn primary';
  back.textContent = 'Revenir à la partie';
  back.addEventListener('click', closeStats);
  actions.append(back);
  sheet.append(actions);

  overlay.append(sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeStats(); });
  document.body.append(overlay);
}

function closeStats() {
  const o = document.getElementById('statsOverlay');
  if (o) o.remove();
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeStats(); });
