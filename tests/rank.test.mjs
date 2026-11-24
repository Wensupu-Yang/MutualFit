import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rank, conventional, normalise, fit, clampPoints, toSliders, impact } from '../static/rank.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
const barber = load('barber');
const labels = Object.fromEntries(barber.categories.map((c) => [c.id, c.label]));
const CURLY = { textured: 0.6, listens: 0.4 };
const run = (needs = CURLY, budget = 45, providers = barber.providers) => rank(providers, needs, budget, labels);
const get = (rows, id) => rows.find((r) => r.provider.id === id);

test('conventional order follows rating then reviews', () => {
  assert.deepEqual(conventional(barber.providers).map((p) => p.id), ['D', 'A', 'B', 'C']);
});
test('curly customer gets C first', () => {
  assert.equal(run()[0].provider.id, 'C');
});
test('undisclosed provider gets no bonus and says fit is unknown', () => {
  const d = get(run(), 'D');
  assert.equal(d.bonus, 0);
  assert.ok(d.notes.includes('Fit unknown: preferences not disclosed'));
});
test('disclosure never lowers a provider score', () => {
  for (const r of run()) assert.ok(r.score >= r.base);
});
test('over budget halves the bonus and is explained', () => {
  const over = get(run(CURLY, 30), 'C');
  assert.equal(over.bonus, get(run(), 'C').bonus / 2);
  assert.ok(over.tradeoffs.some((t) => t.includes('£40')));
});
test('spreading points evenly scores below specialising', () => {
  const points = Object.fromEntries(barber.categories.map((c, i) => [c.id, i < 4 ? 2 : 1]));
  const spread = barber.providers.map((p) => (p.id === 'C' ? { ...p, points } : p));
  assert.ok(get(run(CURLY, 45, spread), 'C').score < get(run(), 'C').score);
});
for (const name of ['barber', 'plumbing']) {
  test(`${name}: 5 to 7 categories, ratings vary between 4.8 and 5`, () => {
    const d = load(name);
    assert.ok(d.categories.length >= 5 && d.categories.length <= 7);
    const ratings = d.providers.map((p) => p.rating);
    assert.ok(ratings.every((x) => x >= 4.8 && x <= 5));
    assert.ok(new Set(ratings).size >= 3);
  });
}
test('impact gives rank as set, and rank if the provider did not share', () => {
  assert.deepEqual(impact(barber.providers, 'C', CURLY, 45), { now: 1, hidden: 4 });
  assert.equal(impact(barber.providers, 'C', {}, null), null);
});
test('empty needs give no bonus and no NaN', () => {
  for (const r of run({})) { assert.equal(r.bonus, 0); assert.ok(Number.isFinite(r.score)); }
});
test('provider side is explained when it put 0 points on the top need', () => {
  assert.ok(get(run(), 'A').tradeoffs.some((t) => t.includes('0 points on Curly & textured')));
});
test('fit matches the documented formula', () => {
  const f = fit(barber.providers.find((p) => p.id === 'C'), CURLY);
  assert.ok(Math.abs(f.customerFit - 0.8) < 1e-9);
  assert.ok(Math.abs(f.providerFit - 0.8) < 1e-9);
  assert.ok(Math.abs(f.mutual - 0.8) < 1e-9);
});
test('normalise makes weights sum to 1 and drops zeros', () => {
  assert.deepEqual(normalise({ a: 3, b: 1, c: 0 }), { a: 0.75, b: 0.25 });
});
test('clampPoints caps a slider at the points left in the 10-point budget', () => {
  assert.deepEqual(clampPoints({ a: 5, b: 3 }, 'b', 9), { a: 5, b: 5 });
  assert.deepEqual(clampPoints({ a: 5, b: 3 }, 'b', 0), { a: 5 });
});
test('recurring leak customer gets plumber C first', () => {
  const p = load('plumbing');
  const l = Object.fromEntries(p.categories.map((c) => [c.id, c.label]));
  assert.equal(rank(p.providers, { complex_faults: 1 }, 120, l)[0].provider.id, 'C');
});
for (const name of ['barber', 'plumbing']) {
  test(`${name}: points total 10 or 0, and every id exists`, () => {
    const d = load(name);
    const ids = d.categories.map((c) => c.id);
    for (const p of d.providers) {
      const total = Object.values(p.points).reduce((a, b) => a + b, 0);
      assert.equal(total, p.disclosed ? 10 : 0);
      assert.ok(Object.keys(p.points).every((k) => ids.includes(k)));
    }
    for (const s of d.samples) assert.ok(Object.keys(s.result.needs).every((k) => ids.includes(k)));
  });
}

test('zero provider-side points is a trade-off, not a reason', () => {
  const b = get(run(), 'B');
  assert.deepEqual(b.reasons, []);
  assert.ok(b.tradeoffs.some((t) => t.startsWith("Provider's side: 0 of")));
});
test('over-budget trade-off says the bonus is halved', () => {
  assert.ok(get(run(CURLY, 30), 'C').tradeoffs.some((t) => t.includes('fit bonus halved')));
});
for (const name of ['barber', 'plumbing']) {
  test(`${name}: some provider covers every category`, () => {
    const d = load(name);
    for (const c of d.categories) assert.ok(d.providers.some((p) => p.points[c.id] > 0), c.id);
  });
}
test('toSliders scales AI needs to 10 and keeps the customer edits', () => {
  assert.deepEqual(toSliders({ a: 0.5, b: 0.25, c: 0.01 }, { b: 9, d: 0 }), { a: 10, b: 9, c: 1, d: 0 });
  assert.deepEqual(toSliders({}, {}), {});
});
