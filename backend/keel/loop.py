"""The closed loop: sense -> forecast -> plan -> learn -> escalate, run against a virtual patient.

Policies compared everywhere in the project:

* ``none``      the patient goes home and nothing happens until a scheduled visit.
* ``fixed``     everybody gets the same sensible plan every day (light + walk).
* ``keel_plan`` Keel's personal, learning plan, but no clinician escalation.
* ``keel``      the full loop: personal plan + early warning that books a booster.
"""

from __future__ import annotations

import numpy as np

from . import learner, planner
from .forecast import Baseline, Tracker
from .interventions import KEYS, N_K, phq
from .sim import PASSIVE, Patient, World, passive_from

ALERT_RISK = 0.5
ALERT_DAYS = 3
BOOK_DELAY = 3
COOLDOWN = 45
FIXED_PLAN = np.array([1, 1, 0, 0, 0, 0], dtype=float)


def baseline_for(p: Patient) -> tuple[Baseline, list[dict], float]:
    nz = p.noise["passive"]
    samples = [passive_from(p, np.zeros(5), nz[-(i + 1)], np.zeros(N_K)) for i in range(14)]
    well_phq = float(phq(p.well) + 0.6 * p.noise["obs"][-1, 0])
    return Baseline(samples), samples, well_phq


class Loop:
    def __init__(self, p: Patient, policy: str = "keel", seed: int = 0):
        self.p, self.policy = p, policy
        self.world = World(p)
        self.rng = np.random.default_rng(seed + 7919 * p.pid)
        self.baseline, self.baseline_samples, self.well_phq = baseline_for(p)
        self.tracker = Tracker(self.baseline, self.well_phq)
        self.done: list[np.ndarray] = []
        self.planned: list[np.ndarray] = []
        self.checkins: list[float] = []
        self.risk = 0.0
        self.risk_streak = 0
        self.post = learner.fit(np.zeros((0, N_K)), np.zeros(0))
        self.last_booster_end = -10_000
        self.alerts: list[int] = []
        self.log: list[dict] = []

    # ---- policy -----------------------------------------------------------------
    def adherence_estimate(self) -> float:
        if not self.planned:
            return 0.75
        P, D = np.array(self.planned), np.array(self.done)
        n = P.sum()
        return float((D.sum() + 3 * 0.75) / (n + 3))

    def plan_today(self) -> np.ndarray:
        if self.policy == "none":
            return np.zeros(N_K)
        if self.policy == "fixed":
            return FIXED_PLAN.copy()
        beta = learner.sample(self.post, self.rng)
        return planner.choose(beta, self.risk, self.adherence_estimate())

    # ---- one day ----------------------------------------------------------------
    def step(self, checkin_override: np.ndarray | None = None, plan: np.ndarray | None = None, full: bool = True) -> dict:
        t = self.world.t
        plan = self.plan_today() if plan is None else plan
        o = self.world.step(plan, checkin_override)
        ck = float(phq(o["checkin"])) if o["checkin"] is not None else None
        self.planned.append(plan)
        self.done.append(o["done"])
        self.checkins.append(np.nan if ck is None else ck)
        body = self.tracker.update(o["passive"], ck)
        if self.policy.startswith("keel"):
            self.post = learner.fit(np.array(self.done), np.array(self.checkins))
        fc = self.tracker.forecast(self.rng)
        self.risk = fc["risk"]
        alert = False
        self.risk_streak = self.risk_streak + 1 if self.risk >= ALERT_RISK else 0
        if (self.policy == "keel" and self.risk_streak >= ALERT_DAYS and self.world.pending_booster is None
                and t - self.last_booster_end > COOLDOWN):
            alert = True
            self.alerts.append(t)
            self.world.schedule_booster(t + BOOK_DELAY)
            self.last_booster_end = t + BOOK_DELAY + 5
        rec = {"day": t, "phq": o["phq"], "checkin": ck, "body": body, "mood": self.tracker.mood,
               "risk": self.risk, "alert": alert, "in_booster": o["in_booster"]}
        if full:
            rec.update({
                "s": o["s"].round(3).tolist(), "B": o["B"], "base_phq": o["base_phq"],
                "plan": [KEYS[k] for k in np.flatnonzero(plan)], "done": [KEYS[k] for k in np.flatnonzero(o["done"])],
                "passive": {k: round(v, 3) for k, v in o["passive"].items()},
                "contrib": dict(zip(PASSIVE, np.round(self.tracker.contrib, 3).tolist())),
                "fan": {k: [round(x, 2) for x in fc[k]] for k in ("p10", "p50", "p90")},
                "life_event": o["life_event"], "booster_pending": self.world.pending_booster,
                "learned": {"mean": self.post.mean.round(3).tolist(), "sd": self.post.sd.round(3).tolist()},
            })
        self.log.append(rec)
        return rec

    def run(self, days: int, full: bool = False) -> list[dict]:
        for _ in range(days):
            self.step(full=full)
        return self.log
