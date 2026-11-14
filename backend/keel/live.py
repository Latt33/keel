"""Aino's phone, live: the loop runs on whatever the person in front of the demo enters.

The session is Aino's own Keel world replayed up to a few days before her warning
signs started, so the passive signals (her ring) keep coming from her virtual life
while the check-in and the "did you do it" ticks come from the user.
"""

from __future__ import annotations

import threading

import numpy as np

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
        "alert": bool(L.alerts), "booster_pending": L.world.pending_booster, "streak": L.risk_streak,
        "history": _state.get("history", []),
    }


def checkin(answers: list[float], done: list[str]) -> dict:
    """answers: 5 sliders 0..3 (mood, interest, sleep, energy, anxiety). done: dose keys ticked."""
    with _lock:
        L = _loop()
        before = round(L.risk, 3)
        plan = _state["plan"]
        done_vec = np.array([1.0 if k in done else 0.0 for k in KEYS])
        L.world.done_override = done_vec
        rec = L.step(checkin_override=np.clip(np.array(answers, dtype=float), 0, 3), plan=plan, full=True)
        L.world.done_override = None
        _state["plan"] = L.plan_today()
        _state["history"].append({"day": rec["day"], "phq": round(float(phq(np.array(answers))), 1),
                                  "risk_before": before, "risk_after": round(L.risk, 3), "done": done})
    out = snapshot()
    out["changed"] = {"risk_before": before, "risk_after": round(L.risk, 3)}
    return out


META = {"dims": DIMS, "phq_scale": PHQ_SCALE, "passive": PASSIVE, "n_k": N_K}
