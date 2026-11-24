import { rank, conventional, normalise, clampPoints, toSliders, impact, POINT_BUDGET } from './rank.js';

const $ = (id) => document.getElementById(id);
const INDUSTRIES = [['barber', 'Barbershop'], ['plumbing', 'Plumbing']];
let data, original, needs, budget, messages, asked, picked, edits, budgetEdited, ticket = 0;

function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
}

function slider(label, value, max, show, onInput) {
  const out = el('span', { textContent: show(value) });
  const input = el('input', { type: 'range', min: 0, max, step: 1, value, ariaLabel: label });
  input.oninput = () => { const v = onInput(Number(input.value)); input.value = v; out.textContent = show(v); };
  return el('div', { className: 'slider' }, el('span', { textContent: label }), input, out);
}

const labels = () => Object.fromEntries(data.categories.map((c) => [c.id, c.label]));

const stars = (p) => `${p.rating.toFixed(1)}★ (${p.reviews}) · £${p.price}`;

function row(p, i, ...extra) {
  return el('li', {}, el('div', { className: 'head' }, el('b', { textContent: `${i + 1}. ${p.name}`, title: p.bio }), ...extra),
    el('div', { className: 'meta', textContent: stars(p) }));
}

function drawLines(base, rows) {
  const NS = 'http://www.w3.org/2000/svg';
  const y = (i) => ((i + 0.5) / base.length) * 100;
  $('lines').replaceChildren(...rows.map((r, to) => {
    const from = base.findIndex((p) => p.id === r.provider.id);
    const line = document.createElementNS(NS, 'line');
    for (const [k, v] of Object.entries({ x1: 0, y1: y(from), x2: 100, y2: y(to) })) line.setAttribute(k, v);
    line.setAttribute('class', to < from ? 'up' : to > from ? 'down' : 'same');
    return line;
  }));
}

function drawRankings() {
  const base = conventional(data.providers);
  $('byRating').replaceChildren(...base.map((p, i) => row(p, i)));
  drawImpact();
  if (!Object.keys(normalise(needs)).length) {
    $('byFit').replaceChildren(el('li', { className: 'empty', textContent: 'Tell us what you need to see your own ranking.' }));
    $('lines').replaceChildren();
    $('why').replaceChildren();
    return;
  }
  const rows = rank(data.providers, needs, budget, labels());
  $('byFit').replaceChildren(...rows.map((r, i) => {
    const moved = base.findIndex((p) => p.id === r.provider.id) - i;
    const arrow = el('span', { className: moved > 0 ? 'up' : moved < 0 ? 'down' : 'same', textContent: moved > 0 ? `▲ ${moved}` : moved < 0 ? `▼ ${-moved}` : '=' });
    const pct = Math.round(r.mutual * 100);
    const li = row(r.provider, i, arrow, el('span', { textContent: r.provider.disclosed ? `${pct}% fit` : 'fit unknown' }));
    if (i === 0 && r.mutual > 0) li.className = 'top';
    const fill = el('i');
    fill.style.width = `${pct}%`;
    li.append(el('div', { className: 'bar' }, fill));
    return li;
  }));
  drawLines(base, rows);
  const none = el('p', { className: 'notice', textContent: 'No provider has prioritised this. Showing the usual order.' });
  $('why').replaceChildren(...(rows.some((r) => r.mutual > 0) ? [] : [none]), ...rows.map((r, i) => el('section', {},
    el('h3', { textContent: `${i + 1}. ${r.provider.name}` }),
    el('div', { className: 'meta', textContent: r.provider.bio }),
    el('ul', {}, ...r.notes.map((t) => el('li', { className: 'note', textContent: t })),
      ...r.reasons.map((t) => el('li', { textContent: t })),
      ...r.tradeoffs.map((t) => el('li', { className: 'trade', textContent: t }))))));
}

function drawNeeds() {
  $('needs').replaceChildren(...data.categories.map((c) => slider(c.label, needs[c.id] ?? 0, 10, String, (v) => {
    needs[c.id] = v; edits[c.id] = v; drawRankings(); return v;
  })));
  $('budget').value = budget ?? '';
}

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n] ?? 'th'}`;

function drawImpact() {
  const out = impact(data.providers, picked, needs, budget);
  if (!out) {
    $('impact').replaceChildren(el('p', { className: 'meta', textContent: 'Enter a customer request in Client view first.' }));
    return;
  }
  const shared = data.providers.find((p) => p.id === picked).disclosed;
  const box = (n, text, cls) => el('div', { className: cls }, el('b', { textContent: ordinal(n) }), text);
  const wants = Object.entries(normalise(needs)).sort((a, b) => b[1] - a[1]).map(([k]) => labels()[k]).join(', ');
  $('impact').replaceChildren(el('p', { className: 'meta', textContent: `This customer wants: ${wants}` }),
    el('div', { className: 'big' }, box(out.hidden, 'not sharing', shared ? '' : 'now'), ...(shared ? [box(out.now, 'with these points', 'now')] : [])));
}

function drawProvider() {
  $('picker').replaceChildren(...data.providers.map((p) => el('option', { value: p.id, textContent: p.name, selected: p.id === picked })));
  const p = data.providers.find((x) => x.id === picked);
  const left = POINT_BUDGET - Object.values(p.points).reduce((a, b) => a + b, 0);
  const redraw = (focus) => { drawProvider(); drawRankings(); if (focus) document.querySelector(`[data-step="${focus}"]:not(:disabled)`)?.focus(); };
  const box = el('input', { type: 'checkbox', checked: p.disclosed, onchange: () => { p.disclosed = box.checked; redraw(); } });
  const reset = el('button', { textContent: 'Reset', onclick: () => {
    Object.assign(p, structuredClone(original.find((x) => x.id === p.id))); redraw(); } });
  const steps = data.categories.map((c) => {
    const n = p.points[c.id] ?? 0;
    const step = (d, sign) => {
      const key = `${c.id}${sign}`;
      const b = el('button', { textContent: sign, ariaLabel: `${d > 0 ? 'Add a point to' : 'Remove a point from'} ${c.label}`, disabled: d > 0 ? left === 0 : n === 0,
        onclick: () => { p.points = clampPoints(p.points, c.id, n + d); redraw(key); } });
      b.dataset.step = key;
      return b;
    };
    const dots = el('div', { className: 'dots' }, ...Array.from({ length: POINT_BUDGET }, (_, i) => el('i', { className: i < n ? 'f' : '' })));
    return el('div', { className: 'step' }, el('span', { textContent: c.label }), step(-1, '−'), dots, step(1, '+'), el('span', { textContent: String(n) }));
  });
  $('points').replaceChildren(el('div', { className: 'row' }, el('label', {}, box, ' Share my preferences'),
    ...(p.disclosed ? [el('span', { className: 'left', textContent: `${left} points left` })] : []), reset), ...(p.disclosed ? steps : []));
  drawImpact();
}

function show(view) {
  for (const [id, btn] of [['client', 'showClient'], ['provider', 'showProvider']]) {
    $(id).hidden = id !== view;
    $(btn).className = id === view ? 'on' : '';
  }
}

function setBusy(on) {
  document.querySelectorAll('#ask button, #follow button').forEach((b) => { b.disabled = on; });
}

async function consult() {
  const mine = ++ticket;
  setBusy(true);
  $('status').textContent = 'Reading your needs…';
  try {
    const res = await fetch('/api/extract', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ industry: data.id, messages, follow_ups_asked: asked }) });
    if (mine !== ticket) return;
    if (!res.ok) throw new Error(String(res.status));
    const out = await res.json();
    if (mine !== ticket) return;
    needs = toSliders(out.needs, edits);
    if (!budgetEdited) budget = out.budget;
    $('status').textContent = '';
    $('understood').hidden = false;
    $('summary').textContent = out.summary;
    $('source').textContent = out.source === 'saved' ? 'saved example' : 'live AI';
    $('follow').hidden = !out.follow_up;
    $('question').textContent = out.follow_up ?? '';
    $('reply').value = '';
    drawNeeds();
    drawRankings();
  } catch {
    if (mine !== ticket) return;
    $('status').textContent = 'AI unavailable. Set your needs with the sliders.';
    $('adjust').open = true;
    if (messages.length > 1) {
      messages.splice(-2);
      asked--;
      $('status').textContent = 'AI unavailable. Try your answer again, or use the sliders.';
    } else $('follow').hidden = true;
  } finally {
    if (mine === ticket) setBusy(false);
  }
}

function resetCustomer() {
  ticket++;
  needs = {}; budget = null; messages = []; asked = 0; edits = {}; budgetEdited = false;
  setBusy(false);
  $('text').value = ''; $('status').textContent = '';
  $('understood').hidden = true; $('follow').hidden = true;
}

function start(text) {
  resetCustomer();
  $('text').value = text;
  messages = [{ role: 'user', content: text }];
  drawNeeds(); drawRankings();
  consult();
}

async function load(id) {
  const mine = ++ticket;
  const res = await fetch(`/api/data/${id}`);
  if (!res.ok) { if (mine === ticket) { $('status').textContent = 'Could not load that industry.'; setBusy(false); } return; }
  const next = await res.json();
  if (mine !== ticket) return;
  data = next;
  original = structuredClone(data.providers);
  picked = 'C';
  resetCustomer();
  $('tabs').replaceChildren(...INDUSTRIES.map(([key, name]) => el('button', { textContent: name, className: key === id ? 'on' : '', onclick: () => load(key) })));
  $('samples').replaceChildren(...data.samples.map((s) => el('button', { textContent: s.label, onclick: () => start(s.text) })));
  drawNeeds(); drawRankings(); drawProvider();

}

$('ask').onsubmit = (e) => { e.preventDefault(); const t = $('text').value.trim(); if (t) start(t); };
$('follow').onsubmit = (e) => {
  e.preventDefault();
  const reply = $('reply').value.trim();
  if (!reply) return;
  messages.push({ role: 'assistant', content: $('question').textContent }, { role: 'user', content: reply });
  asked++;
  consult();
};
$('skip').onclick = () => { $('follow').hidden = true; };
$('budget').oninput = () => { const v = $('budget').valueAsNumber; budget = v > 0 ? v : null; budgetEdited = true; drawRankings(); };
$('picker').onchange = () => { picked = $('picker').value; drawProvider(); };
$('showClient').onclick = () => show('client');
$('showProvider').onclick = () => show('provider');
load('barber');
