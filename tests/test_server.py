import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))
import server

client = TestClient(server.app)
BARBER = json.loads(Path("data/barber.json").read_text())
SAMPLE = BARBER["samples"][0]


def ask(text, asked=0, industry="barber"):
    return client.post("/api/extract", json={
        "industry": industry, "follow_ups_asked": asked,
        "messages": [{"role": "user", "content": text}]})


def ai(monkeypatch, reply):
    def fake(system, messages):
        if isinstance(reply, Exception):
            raise reply
        return reply if isinstance(reply, str) else json.dumps(reply)
    monkeypatch.setattr(server, "call_ai", fake)


def test_clean_drops_bad_weights_and_normalises():
    out = server.clean({"needs": {"fades": 3, "beard": 1, "nope": 9, "textured": -2,
                                  "treatments": "lots", "unhurried": float("nan"),
                                  "long_styles": True}},
                       ["fades", "beard", "textured", "treatments", "unhurried", "long_styles"])
    assert out["needs"] == {"fades": 0.75, "beard": 0.25}


@pytest.mark.parametrize("raw", [[], "text", {"needs": None}, {"needs": ["fades"]}])
def test_clean_survives_wrong_shapes(raw):
    assert server.clean(raw, ["fades"])["needs"] == {}


@pytest.mark.parametrize("budget,expected", [(45, 45), ("cheap", None), (-5, None), (True, None)])
def test_clean_budget(budget, expected):
    assert server.clean({"needs": {}, "budget": budget}, [])["budget"] == expected


def test_live_result(monkeypatch):
    ai(monkeypatch, {"needs": {"textured": 8}, "budget": 45, "summary": "s", "follow_up": "q?"})
    body = ask("custom words").json()
    assert body == {"needs": {"textured": 1.0}, "budget": 45, "summary": "s",
                    "follow_up": "q?", "source": "live"}


def test_no_usable_needs_asks_for_more(monkeypatch):
    ai(monkeypatch, {"needs": {}, "follow_up": None})
    body = ask("hello").json()
    assert body["needs"] == {} and body["follow_up"]


def test_no_third_follow_up(monkeypatch):
    ai(monkeypatch, {"needs": {"fades": 1}, "follow_up": "again?"})
    assert ask("x", asked=2).json()["follow_up"] is None


@pytest.mark.parametrize("failure", [RuntimeError("down"), "not json"])
def test_sample_falls_back_to_saved(monkeypatch, failure):
    ai(monkeypatch, failure)
    res = ask(SAMPLE["text"])
    assert res.status_code == 200 and res.json()["source"] == "saved"
    assert res.json()["needs"] == SAMPLE["result"]["needs"]


def test_custom_text_fails_honestly(monkeypatch):
    ai(monkeypatch, RuntimeError("down"))
    assert ask("my own words").status_code == 503


def test_unknown_industry():
    assert ask("x", industry="../barber").status_code == 404
    assert client.get("/api/data/nope").status_code == 404


def test_system_role_rejected():
    res = client.post("/api/extract", json={"industry": "barber", "follow_ups_asked": 0,
                      "messages": [{"role": "system", "content": "x"}]})
    assert res.status_code == 422
