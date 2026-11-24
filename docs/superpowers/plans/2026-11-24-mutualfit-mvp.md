# MutualFit MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demo that providers with identical ratings rank differently by mutual fit, with explanations and live provider points.

**Architecture:** FastAPI serves a plain page and one AI endpoint that turns conversation into category weights. A pure browser module ranks and explains. Industry data is JSON shared by both.

**Tech Stack:** Python 3.12, FastAPI, openai client, plain HTML/JS modules, `node --test`, pytest.

**Spec:** docs/superpowers/specs/2026-11-24-mutualfit-mvp-design.md

## Global Constraints
- Model `deepseek-ai/DeepSeek-V4.1-Flash-1017-fast`; base URL `https://api.tokenfactory.eu-south1.nebius.com/v1/`; `NEBIUS_API_KEY` from `.env`, server-side only. Verified: `response_format={"type":"json_object"}` works, 0.8-1.5s.
- `max_tokens=1500`, timeout 8s, no retries. At most two follow-ups.
- Fallbacks are labelled "saved example". Footer: "Synthetic data. Whether the points budget encourages truthful disclosure is untested."
- User and AI text enters the page through `textContent`, never `innerHTML`.

## Review Focus
- AI returns unknown, negative or non-numeric weights: dropped, no crash (Task 2).
- AI returns no usable needs ("hello"): ask for more detail, no invented ranking (Tasks 1, 2).
- AI down with custom text: 503 and manual sliders still rank (Tasks 2, 3).
- Provider exceeds 10 points: sliders clamp to the remainder (Task 4).
- Switching industry while a request is pending: stale response ignored (Task 3).

## Files
`static/rank.js` scoring and reasons; `static/app.js`, `index.html`, `style.css` UI; `data/barber.json`, `data/plumbing.json`; `server.py` API; `tests/rank.test.mjs`, `tests/test_server.py`; `requirements.txt`, `README.md`.

Data shape: `{id, label, categories:[{id,label}], providers:[{id,name,bio,rating,reviews,price,disclosed,points}], samples:[{text, result}]}`; `result` is the extract response below.

---
### Task 1: Ranking and barber data
**Produces:** `fit(provider, needs) -> {customerFit, providerFit, mutual}`; `rank(providers, needs, budget) -> [{provider, base, bonus, score, mutual, reasons, tradeoffs}]` (descending); `conventional(providers) -> providers`; `normalise(needs) -> needs`. `needs` is `{categoryId: weight}`; formulas are in the spec. Reasons and tradeoffs are strings; pass category labels as a fourth `rank` argument `{id: label}`.

Barber data (all 4.9; points):

| id | reviews | price | points |
|---|---|---|---|
| A | 812 | 25 | fades 5, beard 3, follows_brief 2 |
| B | 430 | 55 | long_styles 4, transformations 3, creative_freedom 3 |
| C | 96 | 40 | textured 5, treatments 2, unhurried 2, follows_brief 1 |
| D | 1240 | 30 | undisclosed, points `{}` |

Categories: fades, beard, long_styles, textured, transformations, treatments, follows_brief, creative_freedom, unhurried.

- [ ] Write failing tests in `tests/rank.test.mjs`:
  - `conventional` order is D, A, B, C
  - needs `{textured:.5, follows_brief:.2, unhurried:.3}`, budget 45: first is C
  - D: `bonus === 0` and reasons include "Fit unknown: preferences not disclosed"
  - for every provider `score >= base`
  - C at budget 30: bonus is half its budget-45 bonus, and tradeoffs mention £40
  - C with points spread 2,1,1,1,1,1,1,1,1 scores below its specialist score
  - empty needs: all bonuses 0 and no NaN
  - A's tradeoffs include "0 points on Curly & textured"
- [ ] Run `node --test tests/rank.test.mjs`; expect FAIL (no module)
- [ ] Implement `rank.js` and data; add `static/package.json` with `{"type":"module"}`
- [ ] Rerun; expect PASS. Commit.

### Task 2: AI extraction
**Produces:** `clean(raw: dict, category_ids: list[str]) -> dict`; `POST /api/extract` taking `{industry, messages:[{role,content}], follow_ups_asked}` and returning `{needs, budget, summary, follow_up, source}`, where source is `live` or `saved`; `GET /api/data/{industry}`; `/` serves the page.

- [ ] Write failing pytest tests, AI client stubbed:
  - `clean` drops unknown ids, negatives, strings; weights sum to 1
  - no usable needs: `needs == {}` and follow_up is a non-empty question
  - `follow_ups_asked=2`: follow_up is None
  - AI raises, text equals a sample: 200, `source == "saved"`
  - AI raises, other text: 503; unknown industry: 404
- [ ] Run `.venv/bin/pytest tests -q`; expect FAIL
- [ ] Implement `server.py`. Only accept user/assistant roles from the client. Prompt lists category ids and labels, asks for 0-10 weights stated or clearly implied by the customer, budget, one-sentence summary, and a follow_up only if it would change weights.
- [ ] Tests PASS; one live curl returns `source: live`. Commit.

### Task 3: Screen (Stage 1 complete)
**Consumes:** Tasks 1 and 2.
- [ ] Build the spec's screen: sample buttons, text box, summary, need sliders and budget, two ranking columns, reasons and trade-offs, rank movement arrows, source label. Before any needs, the fit column prompts for input.
- [ ] On 503 show "AI unavailable. Set your needs with the sliders." Tag requests with a counter; ignore stale ones.
- [ ] In a browser: curly sample puts C first and D first by rating; custom text works; with no key, sample shows "saved example" and custom text shows the error. Commit.

### Task 4: Provider points (Stage 2)
- [ ] Provider picker, disclose toggle, 0-10 sliders, points remaining; a slider clamps so total <= 10. Disclosing is pre-set for A-C, off for D. Reset button.
- [ ] In a browser: moving C's textured points to fades drops C; hiding C gives bonus 0; total cannot exceed 10. Commit.

### Task 5: Follow-ups (Stage 3)
- [ ] Show follow_up with a reply box; append question and answer to `messages`, increment count, re-extract, re-rank; include a Skip button.
- [ ] In a browser: one answer updates needs; no third question appears. Commit.

### Task 6: Plumbing (Stage 4)
Categories: small_repairs, maintenance, installations, renovations, complex_faults, urgent, fixed_price, diagnostic.

| id | reviews | price | points |
|---|---|---|---|
| A | 640 | 70 | small_repairs 5, maintenance 3, fixed_price 2 |
| B | 380 | 150 | renovations 5, installations 4, fixed_price 1 |
| C | 88 | 110 | complex_faults 6, diagnostic 4 |
| D | 1105 | 85 | undisclosed |

- [ ] Add failing test: needs `{complex_faults:.6, diagnostic:.4}`, budget 120 ranks C first
- [ ] Add data, samples (recurring leak, bathroom refit) and industry tabs; test PASS
- [ ] In a browser: recurring-leak sample puts C first; tabs reset state. README with run command `.venv/bin/uvicorn server:app`. Commit.
