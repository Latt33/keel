"""Two weeks ahead, like a weather forecast.

1. Body signal. Each passive stream (sleep regularity, day/night rhythm, sleep efficiency,
   night waking, steps, HRV) is turned into a personal z-score against the baseline
   recorded in the last two weeks of the TMS course. A weighted sum converts the drift
   into PHQ-9 points: "where the body says mood is heading".
2. Ensemble. 300 futures: mood relaxes toward that heading (the same slow response
   the clinic sees after TMS), the heading keeps its recent trend plus random walk.
   The spread of the ensemble is the forecast band; the share of futures that cross
   the relapse line within 14 days is the risk.

Weights are fit on the simulated cohort (``scripts/calibrate_forecast.py``). With real
wearable data (PSYCHE-D, Oura) this is the piece that gets refit.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .interventions import RELAPSE_PHQ
from .sim import A_SLOW, PASSIVE

ADVERSE_SIGN = np.array([-1, -1, -1, +1, -1, -1], dtype=float)   # + means "higher is worse"
SD_FLOOR = np.array([3.0, 0.02, 1.5, 5.0, 900.0, 3.0])
HORIZON = 14
N_PATHS = 300
SMOOTH = 0.35

_W_PATH = Path(__file__).with_name("forecast_weights.json")
DEFAULT_W = np.array([1.2, 1.0, 0.8, 0.8, 0.6, 0.6])
WEIGHTS = np.array(json.loads(_W_PATH.read_text())["w"]) if _W_PATH.exists() else DEFAULT_W
RW_SD = 0.8      # PHQ points per sqrt(day) of unexplained setpoint wander


class Baseline:
    def __init__(self, samples: list[dict]):
        X = np.array([[s[k] for k in PASSIVE] for s in samples])
        self.mean = X.mean(axis=0)
        self.sd = np.maximum(X.std(axis=0), SD_FLOOR)

    def adverse_z(self, passive: dict) -> np.ndarray:
        x = np.array([passive[k] for k in PASSIVE])
        return ADVERSE_SIGN * (x - self.mean) / self.sd


class Tracker:
    """Online state for one person: smoothed body signal and mood estimate."""

    def __init__(self, baseline: Baseline, well_phq: float):
        self.baseline = baseline
        self.well_phq = well_phq
        self.zs = np.zeros(len(PASSIVE))
        self.body_hist: list[float] = []
        self.body_nosteps: list[float] = []
        self.mood: float | None = None
        self.contrib = np.zeros(len(PASSIVE))

    def update(self, passive: dict, checkin_phq: float | None) -> float:
        z = self.baseline.adverse_z(passive)
        self.zs = self.zs + SMOOTH * (z - self.zs)
        self.contrib = WEIGHTS * self.zs
        body = self.well_phq + float(np.clip(self.contrib.sum(), -4, 22))
        self.body_hist.append(body)
        steps_i = PASSIVE.index("steps")
        self.body_nosteps.append(self.well_phq + float(self.contrib.sum() - self.contrib[steps_i]))
        if checkin_phq is not None:
            self.mood = checkin_phq if self.mood is None else self.mood + 0.5 * (checkin_phq - self.mood)
        return body

    def forecast(self, rng: np.random.Generator) -> dict:
        body = self.body_hist[-1]
        recent = np.array(self.body_hist[-10:])
        slope = 0.0
        if len(recent) >= 5:
            slope = float(np.clip(np.polyfit(np.arange(len(recent)), recent, 1)[0], -0.8, 0.8))
        s = np.full(N_PATHS, self.mood if self.mood is not None else body)
        m = np.full(N_PATHS, body)
        paths = np.zeros((N_PATHS, HORIZON))
        for h in range(HORIZON):
            m = m + slope * (0.85 ** h) + RW_SD * rng.normal(size=N_PATHS)
            s = s + A_SLOW * (m - s) + 0.35 * rng.normal(size=N_PATHS)
            paths[:, h] = s
        q = np.percentile(paths, [10, 50, 90], axis=0)
        risk = float((paths.max(axis=1) >= RELAPSE_PHQ).mean())
        return {"risk": risk, "p10": q[0].tolist(), "p50": q[1].tolist(), "p90": q[2].tolist(), "body": body,
                "slope": slope}
