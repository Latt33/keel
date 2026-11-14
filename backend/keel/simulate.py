"""One new virtual patient, lived twice. Used by the "How we know" page to show the
story patient is not a special case: anyone can roll fresh patients and see what happens."""

from __future__ import annotations

import numpy as np

from .interventions import RELAPSE_PHQ
from .loop import Loop
from .sim import make_patient, relapse_day

DAYS = 180


def _week_mean(x: list[float]) -> list[float]:
    a = np.array(x)
    out = [float(a[max(0, i - 6):i + 1].mean()) for i in range(len(a))]
    return [round(v, 2) for v in out]


def pair(seed: int) -> dict:
    seed = 500_000 + abs(int(seed)) % 1_000_000          # outside every seed range used elsewhere
    out = {"seed": seed}
    for pol in ("none", "keel"):
        L = Loop(make_patient(1, seed, horizon=DAYS), pol)
        log = L.run(DAYS)
        x = [r["phq"] for r in log]
        out[pol] = {"phq7": _week_mean(x), "relapse": relapse_day(np.array(x)),
                    "alerts": L.alerts, "boosters": L.world.booster_days,
                    "days_relapsed": int(sum(v >= RELAPSE_PHQ for v in x))}
    n, k = out["none"]["relapse"], out["keel"]["relapse"]
    dn, dk = out["none"]["days_relapsed"], out["keel"]["days_relapsed"]
    out["outcome"] = ("kept_well" if n is not None and k is None else
                      "well_anyway" if n is None and k is None else
                      "shorter" if n is not None and k is not None and dk < dn / 2 else
                      "relapsed_both" if n is not None and k is not None else "keel_worse")
    return out
