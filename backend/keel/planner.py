"""Today's plan: pick a small set of doses that trades relief against effort.

Every subset of the six doses is scored on two objectives, expected relief (PHQ points,
higher is better) and minutes of effort (lower is better). The non-dominated set is the
Pareto front. Day to day, Keel picks from it with Thompson sampling, which is what makes
the loop learn: it mostly does what it believes works, and sometimes tries what it is
unsure about.
"""

from __future__ import annotations

import itertools

import numpy as np

from .interventions import KEYS, MINUTES, N_K

SUBSETS = np.array([s for s in itertools.product([0, 1], repeat=N_K)], dtype=float)  # [64, k]
SUBSET_MIN = SUBSETS @ MINUTES
SUBSET_N = SUBSETS.sum(axis=1)

TIERS = {
    # risk tier: (max doses per day, value of one minute of effort in PHQ points)
    "steady": (2, 0.040),
    "watch": (3, 0.020),
    "act": (4, 0.008),
}


def tier(risk: float) -> str:
    return "act" if risk >= 0.5 else "watch" if risk >= 0.15 else "steady"


def adherence_factor(n: np.ndarray, adh: float) -> np.ndarray:
    return adh * (1 - 0.08 * np.maximum(0, n - 2))


def choose(beta: np.ndarray, risk: float, adh: float) -> np.ndarray:
    cap, lam = TIERS[tier(risk)]
    value = adherence_factor(SUBSET_N, adh) * (SUBSETS @ beta) - lam * SUBSET_MIN
    value[SUBSET_N > cap] = -np.inf
    value[SUBSET_N == 0] -= 0.5           # always suggest at least one thing
    return SUBSETS[int(np.argmax(value))].copy()


def pareto(beta_mean: np.ndarray, adh: float) -> dict:
    relief = adherence_factor(SUBSET_N, adh) * (SUBSETS @ beta_mean)
    mins = SUBSET_MIN
    keep = []
    for i in range(len(SUBSETS)):
        dominated = np.any((relief >= relief[i]) & (mins <= mins[i]) & ((relief > relief[i]) | (mins < mins[i])))
        if not dominated and SUBSET_N[i] > 0:
            keep.append(i)
    keep.sort(key=lambda i: mins[i])
    pts = [{"doses": [KEYS[k] for k in np.flatnonzero(SUBSETS[i])], "relief": round(float(relief[i]), 2),
            "minutes": int(mins[i])} for i in keep]
    all_pts = [{"relief": round(float(relief[i]), 2), "minutes": int(mins[i])} for i in range(1, len(SUBSETS))]
    return {"front": pts, "all": all_pts}
