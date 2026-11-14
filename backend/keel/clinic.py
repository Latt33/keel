"""Clinic view: everyone discharged after TMS, ranked by who needs a call this week."""

from __future__ import annotations

from functools import lru_cache

import numpy as np

from . import planner
from .interventions import KEYS, LABELS
from .loop import Loop
from .sim import PASSIVE, PASSIVE_LABEL, make_patient
from .story import STORY_SEED

# (name, age, seed, days since TMS) -- fictional people, simulated lives
ROSTER = [
    ("Aino K.", 34, STORY_SEED, 59),
    ("Mikael R.", 52, 1128, 44), ("Sara L.", 29, 3011, 120), ("Jukka H.", 61, 3012, 33),
    ("Leena V.", 45, 3013, 100), ("Omar A.", 38, 3014, 75), ("Hanna P.", 27, 3015, 21),
    ("Ville M.", 49, 3016, 98), ("Emilia S.", 33, 3017, 166), ("Tuomas N.", 56, 3018, 61),
    ("Noora J.", 41, 3019, 12), ("Daniel E.", 36, 3020, 133), ("Riikka T.", 58, 3021, 87),
    ("Petri O.", 44, 1137, 141),
]

_actions: dict[str, str] = {}


def _reasons(L: Loop) -> list[dict]:
    last = L.log[-1]
    out = []
    contrib = last["contrib"]
    for k in sorted(contrib, key=lambda k: -contrib[k])[:3]:
        if contrib[k] < 0.6:
            continue
        i = PASSIVE.index(k)
        base = L.baseline.mean[i]
        now = float(np.mean([r["passive"][k] for r in L.log[-7:]]))
        pct = (now - base) / base * 100
        out.append({"kind": "body", "signal": k, "label": PASSIVE_LABEL[k], "pct": round(pct),
                    "text": f"{PASSIVE_LABEL[k]} {'+' if pct > 0 else '−'}{abs(round(pct))}%"})
    moods = [r["checkin"] for r in L.log[-14:] if r["checkin"] is not None]
    if len(moods) >= 4:
        d = np.mean(moods[-4:]) - np.mean(moods[:4])
        if d >= 2:
            out.append({"kind": "mood", "text": f"Check-ins +{d:.0f} points in 2 weeks"})
    missed = sum(r["checkin"] is None for r in L.log[-7:])
    if missed >= 3:
        out.append({"kind": "engagement", "text": f"Skipped {missed} of 7 check-ins"})
    return out


@lru_cache(maxsize=1)
def _build() -> dict:
    people = {}
    for idx, (name, age, seed, day) in enumerate(ROSTER):
        p = make_patient(idx, seed, horizon=180)
        L = Loop(p, "keel")
        L.run(day, full=True)
        people[str(idx)] = {"name": name, "age": age, "loop": L}
    return people


def _status(L: Loop) -> str:
    if L.risk_streak >= 2 or L.world.pending_booster is not None or (L.log and L.log[-1]["alert"]):
        return "act"
    if L.risk >= 0.15:
        return "watch"
    moods = [r["mood"] for r in L.log[-10:] if r["mood"] is not None]
    if moods and moods[-1] - L.well_phq >= 6:
        return "watch"
    return "steady"


def summary(pid: str, person: dict) -> dict:
    L: Loop = person["loop"]
    st = _status(L)
    return {
        "id": pid, "name": person["name"], "age": person["age"], "day": L.world.t, "risk": round(L.risk, 3),
        "status": st, "action": _actions.get(pid),
        "spark": [{"mood": None if r["mood"] is None else round(r["mood"], 1), "body": round(r["body"], 1)} for r in L.log[-30:]],
        "reasons": _reasons(L) if st != "steady" else [],
        "mood": None if L.tracker.mood is None else round(L.tracker.mood, 1),
        "well_phq": round(L.well_phq, 1),
        "suggest": "Book booster" if st == "act" else "Short call" if st == "watch" else None,
    }


def roster() -> list[dict]:
    people = _build()
    rows = [summary(pid, p) for pid, p in people.items()]
    order = {"act": 0, "watch": 1, "steady": 2}
    rows.sort(key=lambda r: (order[r["status"]], -r["risk"]))
    return rows


def detail(pid: str) -> dict:
    person = _build()[pid]
    L: Loop = person["loop"]
    last = L.log[-1]
    planned = np.array(L.planned[-28:])
    done = np.array(L.done[-28:])
    signals = []
    for i, k in enumerate(PASSIVE):
        series = [round(r["passive"][k], 3) for r in L.log[-60:]]
        signals.append({"key": k, "label": PASSIVE_LABEL[k], "baseline": round(float(L.baseline.mean[i]), 3), "series": series})
    return {
        **summary(pid, person),
        "series": [{"day": r["day"], "mood": None if r["mood"] is None else round(r["mood"], 2), "body": round(r["body"], 2),
                    "checkin": None if r["checkin"] is None else round(r["checkin"], 2), "booster": r["in_booster"]} for r in L.log[-60:]],
        "fan": last["fan"],
        "learned": [{"key": KEYS[k], "label": LABELS[KEYS[k]], "mean": round(float(L.post.mean[k]), 2), "sd": round(float(L.post.sd[k]), 2)} for k in range(len(KEYS))],
        "plan": last["plan"],
        "adherence": round(float(done.sum() / max(1, planned.sum())), 2),
        "checkin_rate": round(float(np.mean([r["checkin"] is not None for r in L.log[-28:]])), 2),
        "signals": signals,
        "boosters": L.world.booster_days,
        "tier": planner.tier(L.risk),
    }


def act(pid: str, action: str) -> dict:
    _actions[pid] = action
    return {"id": pid, "action": action}
