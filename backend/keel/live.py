"""Aino's phone, live: the loop runs on whatever the person in front of the demo enters.

The session is Aino's own Keel world replayed up to a few days before her warning
signs started, so the passive signals (her ring) keep coming from her virtual life
while the check-in and the "did you do it" ticks come from the user.
"""

from __future__ import annotations

import threading

import numpy as np

from . import items as item_bank
from . import planner
from .interventions import DIMS, KEYS, N_K, PHQ_SCALE, phq
from .loop import Loop
from .sim import PASSIVE, make_patient
from .story import STORY_SEED

START_DAY = 55
_lock = threading.Lock()
_state: dict = {}


def _new() -> Loop:
    L = Loop(make_patient(0, STORY_SEED, horizon=180), "keel")
    L.run(START_DAY, full=True)
    return L


def reset() -> dict:
    with _lock:
        _state["loop"] = _new()
        _state["plan"] = _state["loop"].plan_today()
        _state["history"] = []
        _state["safety"] = False
        # start every item from where her last days put her, so unasked dimensions carry forward
        s0 = _state["loop"].log[-1]["s"]
        _state["items"] = {k: round(float(s0[item_bank.DIMS.index(d)]) * 2) / 2 if d else 0.0
                           for k, (_, d, _) in item_bank.BY_KEY.items()}
    return snapshot()


def _loop() -> Loop:
    if "loop" not in _state:
        reset()
    return _state["loop"]


def snapshot() -> dict:
    L = _loop()
    last = L.log[-1]
    adh = L.adherence_estimate()
    pf = planner.pareto(L.post.mean, adh)
    plan = _state["plan"]
    why = []
    for k in np.flatnonzero(plan):
        sd, m = L.post.sd[k], L.post.mean[k]
        why.append({"key": KEYS[k], "relief": round(float(m), 2), "sd": round(float(sd), 2)})
    recent = L.log[-30:]
    return {
        "day": L.world.t, "tier": planner.tier(L.risk), "risk": round(L.risk, 3),
        "plan": [KEYS[k] for k in np.flatnonzero(plan)], "why": why,
        "fan": last["fan"], "body": round(last["body"], 2), "mood": None if last["mood"] is None else round(last["mood"], 2),
        "well_phq": round(L.well_phq, 2),
        "trend": [{"day": r["day"], "mood": None if r["mood"] is None else round(r["mood"], 2), "body": round(r["body"], 2),
                   "checkin": None if r["checkin"] is None else round(r["checkin"], 2)} for r in recent],
        "learned": {"mean": L.post.mean.round(2).tolist(), "sd": L.post.sd.round(2).tolist()},
        "pareto": pf,
        "contrib": last["contrib"],
        "passive": last["passive"],
        "week": {k: round(float(np.mean([r["passive"][k] for r in L.log[-7:]])), 3) for k in PASSIVE},
        "baseline": {k: round(float(L.baseline.mean[i]), 3) for i, k in enumerate(PASSIVE)},
        "alert": bool(L.alerts), "booster_pending": L.world.pending_booster, "streak": L.risk_streak,
        "history": _state.get("history", []),
        "questions": item_bank.questions_for(L.world.t),
        "path": _path(L),
        "safety": _state.get("safety", False),
    }


def _path(L: Loop) -> list[dict]:
    """Every day since discharge, for the patient's path view (no risk in here on purpose)."""
    answered = {h["day"]: h.get("answers") for h in _state.get("history", [])}
    base = L.baseline.mean
    idx = {k: i for i, k in enumerate(PASSIVE)}
    out = []
    for r in L.log:
        rel = {k: round(float(r["passive"][k] / base[idx[k]]), 3) for k in ("sleep_regularity", "rhythm_strength", "steps")}
        out.append({"day": r["day"], "checkin": r["checkin"] is not None, "done": r["done"], "booster": r["in_booster"],
                    "alert": r["alert"], "answers": answered.get(r["day"]), "rel": rel})
    return out


def checkin(answers: dict[str, float], done: list[str]) -> dict:
    """answers: today's items {key: 0..3} (see items.py). done: dose keys the person did."""
    with _lock:
        L = _loop()
        before = round(L.risk, 3)
        plan = _state["plan"]
        for k, v in answers.items():
            if k in item_bank.BY_KEY:
                _state["items"][k] = float(np.clip(v, 0, 3))
        if answers.get("safety", 0) >= 1:
            _state["safety"] = True            # crisis path on the phone + same-day clinic contact
        dims = item_bank.dims_from_items({k: v for k, v in _state["items"].items() if item_bank.BY_KEY[k][1]})
        done_vec = np.array([1.0 if k in done else 0.0 for k in KEYS])
        L.world.done_override = done_vec
        rec = L.step(checkin_override=dims, plan=plan, full=True)
        L.world.done_override = None
        _state["plan"] = L.plan_today()
        _state["history"].append({"day": rec["day"], "phq": round(float(phq(dims)), 1), "answers": answers,
                                  "risk_before": before, "risk_after": round(L.risk, 3), "done": done})
    out = snapshot()
    out["changed"] = {"risk_before": before, "risk_after": round(L.risk, 3)}
    return out


META = {"dims": DIMS, "phq_scale": PHQ_SCALE, "passive": PASSIVE, "n_k": N_K}
