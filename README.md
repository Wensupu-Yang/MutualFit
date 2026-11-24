# MutualFit

Two-sided service matching: AI reads the customer's needs, a visible formula ranks providers by mutual fit. Synthetic data only.

    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    echo 'NEBIUS_API_KEY=...' > .env
    .venv/bin/uvicorn server:app      # http://localhost:8000

Tests: `node --test tests/rank.test.mjs` and `.venv/bin/python -m pytest tests -q`
