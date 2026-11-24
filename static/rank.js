// Pure ranking. Formulas: docs/superpowers/specs/2026-11-24-mutualfit-mvp-design.md
export function normalise(needs) {
  const entries = Object.entries(needs).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  return Object.fromEntries(entries.map(([k, w]) => [k, w / total]));
}

const base = (p) => p.rating * 10 + Math.log10(Math.max(1, p.reviews));

export function conventional(providers) {
  return [...providers].sort((a, b) => base(b) - base(a));
}

export function fit(provider, needs) {
  const n = normalise(needs);
  let customerFit = 0;
  let providerFit = 0;
  for (const [id, weight] of Object.entries(n)) {
    const pts = provider.points[id] ?? 0;
    customerFit += weight * Math.min(1, pts / 4);
    providerFit += pts / 10;
  }
  return { customerFit, providerFit, mutual: Math.sqrt(customerFit * providerFit) };
}

function explain(provider, needs, overBudget, budget, labels, f) {
  const reasons = [];
  const tradeoffs = [];
  if (!provider.disclosed) {
    reasons.push('Fit unknown: preferences not disclosed');
  } else {
    const ordered = Object.entries(needs).sort((a, b) => b[1] - a[1]);
    for (const [id, weight] of ordered) {
      const pts = provider.points[id] ?? 0;
      const label = labels[id] ?? id;
      if (pts > 0) reasons.push(`${label}: ${Math.round(weight * 100)}% of your needs, ${pts} of their 10 points`);
      else tradeoffs.push(`They put 0 points on ${label}`);
    }
    if (ordered.length) {
      const share = Math.round(f.providerFit * 10);
      reasons.push(`Provider's side: ${share} of their 10 points are on what you need`);
    }
  }
  if (overBudget) tradeoffs.push(`£${provider.price} is over your £${budget} budget`);
  return { reasons, tradeoffs };
}

export function rank(providers, needs, budget = null, labels = {}) {
  const n = normalise(needs);
  return providers.map((provider) => {
    const f = provider.disclosed ? fit(provider, n) : { customerFit: 0, providerFit: 0, mutual: 0 };
    const overBudget = budget != null && provider.price > budget;
    const bonus = 30 * f.mutual * (overBudget ? 0.5 : 1);
    const b = base(provider);
    return { provider, base: b, bonus, score: b + bonus, mutual: f.mutual, ...explain(provider, n, overBudget, budget, labels, f) };
  }).sort((x, y) => y.score - x.score);
}

export const POINT_BUDGET = 10;

export function clampPoints(points, id, value) {
  const others = Object.entries(points).reduce((s, [k, v]) => (k === id ? s : s + v), 0);
  const next = { ...points, [id]: Math.max(0, Math.min(value, POINT_BUDGET - others)) };
  if (next[id] === 0) delete next[id];
  return next;
}
