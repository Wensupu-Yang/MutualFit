import { rank, conventional, normalise, clampPoints, toSliders, POINT_BUDGET } from './rank.js';

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

function card(p, i, extra = []) {
  return el('li', {}, el('div', { className: 'head' },
    el('b', { textContent: `${i + 1}. ${p.name}` }), ...extra),
    el('div', { className: 'meta', textContent: `${p.rating}★ (${p.reviews}) · £${p.price} · ${p.bio}` }));
}

function drawRankings() {
  const base = conventional(data.providers);
  $('byRating').replaceChildren(...base.map((p, i) => card(p, i)));
  if (!Object.keys(normalise(needs)).length) {
    $('byFit').replaceChildren(el('li', { className: 'empty', textContent: 'Tell us what you need, or move a needs slider, to see your matches.' }));
    return;
  }
  const rows = rank(data.providers, needs, budget, labels());
  const matched = rows.some((r) => r.mutual > 0);
  const none = el('li', { className: 'empty', textContent: 'No provider has prioritised this. Showing the usual order.' });
  $('byFit').replaceChildren(...(matched ? [] : [none]), ...rows.map((r, i) => {
    const moved = base.findIndex((p) => p.id === r.provider.id) - i;
    const arrow = el('span', { className: moved > 0 ? 'up' : 'down', textContent: moved > 0 ? `▲ ${moved}` : moved < 0 ? `▼ ${-moved}` : '=' });
    const pct = Math.round(r.mutual * 100);
    const li = card(r.provider, i, [arrow, el('span', { textContent: r.provider.disclosed ? `${pct}% fit` : 'fit unknown' })]);
    if (i === 0 && r.mutual > 0) li.className = 'top';
    const fill = el('i');
    fill.style.width = `${pct}%`;
    li.append(el('div', { className: 'bar' }, fill), el('ul', {},
      ...r.notes.map((t) => el('li', { className: 'note', textContent: t })),
      ...r.reasons.map((t) => el('li', { textContent: t })),
      ...r.tradeoffs.map((t) => el('li', { className: 'trade', textContent: t }))));
    return li;
  }));
}

function drawNeeds() {
  $('needs').replaceChildren(...data.categories.map((c) => slider(c.label, needs[c.id] ?? 0, 10, String, (v) => {
    needs[c.id] = v; edits[c.id] = v; drawRankings(); return v;
  })));
  $('budget').value = budget ?? '';
}

function drawProvider() {
  $('picker').replaceChildren(...data.providers.map((p) => el('button', {
    textContent: p.name, className: p.id === picked ? 'on' : '', onclick: () => { picked = p.id; drawProvider(); } })));
  const p = data.providers.find((x) => x.id === picked);
  const used = () => Object.values(p.points).reduce((a, b) => a + b, 0);
  const left = el('span', { className: 'left' });
  const showLeft = () => { left.textContent = `${POINT_BUDGET - used()} points left`; };
  showLeft();
  const box = el('input', { type: 'checkbox', checked: p.disclosed, onchange: () => { p.disclosed = box.checked; drawProvider(); drawRankings(); } });
  const reset = el('button', { textContent: 'Reset', onclick: () => {
    Object.assign(p, structuredClone(original.find((x) => x.id === p.id))); drawProvider(); drawRankings(); } });
  const grid = el('div', { className: 'grid' }, ...data.categories.map((c) => slider(c.label, p.points[c.id] ?? 0, POINT_BUDGET, String, (v) => {
    p.points = clampPoints(p.points, c.id, v); showLeft(); drawRankings(); return p.points[c.id] ?? 0;
  })));
  $('points').replaceChildren(el('div', { className: 'row' }, el('label', {}, box, ' Share preferences'), ...(p.disclosed ? [left] : []), reset), ...(p.disclosed ? [grid] : []));
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
load('barber');
