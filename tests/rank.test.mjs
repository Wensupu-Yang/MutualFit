import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rank, conventional, normalise, fit } from '../static/rank.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
const barber = load('barber');
const labels = Object.fromEntries(barber.categories.map((c) => [c.id, c.label]));
const CURLY = { textured: 0.5, follows_brief: 0.2, unhurried: 0.3 };
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
  assert.ok(d.reasons.includes('Fit unknown: preferences not disclosed'));
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
  const points = Object.fromEntries(barber.categories.map((c, i) => [c.id, i ? 1 : 2]));
  const spread = barber.providers.map((p) => (p.id === 'C' ? { ...p, points } : p));
  assert.ok(get(run(CURLY, 45, spread), 'C').score < get(run(), 'C').score);
});
test('empty needs give no bonus and no NaN', () => {
  for (const r of run({})) { assert.equal(r.bonus, 0); assert.ok(Number.isFinite(r.score)); }
});
test('provider side is explained when it put 0 points on the top need', () => {
  assert.ok(get(run(), 'A').tradeoffs.some((t) => t.includes('0 points on Curly & textured')));
});
test('fit matches the documented formula', () => {
  const f = fit(barber.providers.find((p) => p.id === 'C'), CURLY);
  assert.ok(Math.abs(f.customerFit - 0.7) < 1e-9);
  assert.ok(Math.abs(f.providerFit - 0.8) < 1e-9);
  assert.ok(Math.abs(f.mutual - Math.sqrt(0.56)) < 1e-9);
});
test('normalise makes weights sum to 1 and drops zeros', () => {
  assert.deepEqual(normalise({ a: 3, b: 1, c: 0 }), { a: 0.75, b: 0.25 });
});
