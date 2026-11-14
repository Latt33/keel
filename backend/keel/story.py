"""The demo story: one virtual patient, Aino, lived twice.

Same person, same life, same bad week at work. In one world she goes home after TMS
and nothing happens until her 3-month visit. In the other she goes home with Keel.
The patient is a seeded draw from the simulated cohort, picked because both worlds
show the typical pattern clearly (see HONESTY.md). The cohort numbers shown at the end
of the story come from all 300 patients, not from her.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import numpy as np

from .interventions import DETAILS, DIMS, INTERVENTIONS, LABELS, PHQ_SCALE, RELAPSE_PHQ, phq
from .loop import Loop
from .sim import PASSIVE, PASSIVE_LABEL, PASSIVE_UNIT, make_patient, passive_from, relapse_day

STORY_SEED = 520
DAYS = 180
TMS_DAYS = 42
VISITS = [90, 180]                     # scheduled follow-up visits in usual care

PROFILE = {
    "name": "Aino", "age": 34, "city": "Espoo",
    "history": "Third depressive episode. Two antidepressants did not help enough.",
    "tms": "30 sessions of left-DLPFC rTMS over 6 weeks.",
}


def _r(x, n=2):
    return None if x is None else round(float(x), n)


def _tms_phase(p) -> list[dict]:
    """The clinic weeks: symptoms fall from the depressed setpoint to remission."""
    rng = np.random.default_rng(STORY_SEED)
    out = []
    session = 0
    for d in range(-TMS_DAYS, 0):
        frac = 1 / (1 + np.exp((d + 22) / 4.5))
        s = np.clip(p.well + (p.depressed - p.well) * frac + rng.normal(0, 0.05, 5), 0, 3)
        passive = passive_from(p, s - p.well, rng.normal(0, 1, len(PASSIVE)), np.zeros(6))
        weekday = (d + TMS_DAYS) % 7 < 5
        if weekday:
            session += 1
        out.append({"day": d, "phq": _r(phq(s), 1), "s": s.round(3).tolist(), "session": bool(weekday),
                    "session_no": session if weekday else None,
                    "passive": {k: round(v, 3) for k, v in passive.items()},
                    "checkin": _r(phq(s) + rng.normal(0, 0.8), 1) if (d + TMS_DAYS) % 7 == 4 else None})
    return out


def _slim(rec: dict) -> dict:
    keep = ("day", "phq", "checkin", "body", "mood", "risk", "alert", "in_booster", "s", "plan", "done",
            "passive", "contrib", "fan", "learned", "life_event")
    out = {k: rec.get(k) for k in keep}
    for k in ("phq", "checkin", "body", "mood", "risk"):
        out[k] = _r(out[k], 2)
    out["life_event"] = _r(out["life_event"], 2)
    return out


@lru_cache(maxsize=1)
def build() -> dict:
    p = make_patient(0, STORY_SEED, horizon=DAYS)
    keel = Loop(p, "keel")
    keel.run(DAYS, full=True)
    p2 = make_patient(0, STORY_SEED, horizon=DAYS)
    none = Loop(p2, "none")
    none.run(DAYS, full=True)

    x_none = np.array([r["phq"] for r in none.log])
    x_keel = np.array([r["phq"] for r in keel.log])
    rd_none = relapse_day(x_none)
    found = next((v for v in VISITS if rd_none is not None and v >= rd_none), None)
    alert = keel.alerts[0] if keel.alerts else None
    booster = [r["day"] for r in keel.log if r["in_booster"]]
    life = [t for t in range(DAYS) if p.noise["events"][t] > 0.25]
    watch = next((r["day"] for r in keel.log if r["day"] > 14 and r["risk"] >= 0.15), None)
    body_rise = next((r["day"] for r in keel.log[14:] if r["body"] - keel.well_phq >= 3), None)
    mood_rise = next((r["day"] for r in none.log[14:] if (r["mood"] or 0) - keel.well_phq >= 3), None)

    truth = (p.W.sum(axis=0) * PHQ_SCALE).round(2).tolist()
    results_path = Path(__file__).with_name("results.json")
    psy_path = Path(__file__).with_name("psyched_results.json")
    return {
        "profile": PROFILE,
        "dims": DIMS,
        "relapse_phq": RELAPSE_PHQ,
        "well_phq": round(keel.well_phq, 2),
        "interventions": [{"key": k, "label": LABELS[k], "minutes": m, "detail": DETAILS[k]} for k, _, m, _ in INTERVENTIONS],
        "passive": [{"key": k, "label": PASSIVE_LABEL[k], "unit": PASSIVE_UNIT[k],
                     "baseline": round(float(keel.baseline.mean[i]), 3)} for i, k in enumerate(PASSIVE)],
        "tms": _tms_phase(p),
        "keel": [_slim(r) for r in keel.log],
        "none": [{"day": r["day"], "phq": _r(r["phq"]), "s": r["s"], "passive": r["passive"],
                  "mood": _r(r["mood"]), "checkin": _r(r["checkin"])} for r in none.log],
        "events": {
            "life_event": life, "body_rise": body_rise, "mood_rise_without": mood_rise, "watch": watch,
            "alert": alert, "booster": booster, "relapse_without": rd_none, "found_without": found,
            "visits": VISITS, "max_phq_keel": round(float(x_keel.max()), 1),
        },
        "truth_relief": truth,
        "cohort": json.loads(results_path.read_text()) if results_path.exists() else None,
        "real_data": json.loads(psy_path.read_text()) if psy_path.exists() else None,
    }
