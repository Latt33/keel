"""Fit the passive-signal -> PHQ heading weights on the simulated cohort (no-support arm).

Writes keel/forecast_weights.json. Run: python -m scripts.calibrate_forecast
"""
import json
from pathlib import Path

import numpy as np

from keel.loop import Loop
from keel.sim import PASSIVE, make_patient

X, y = [], []
for i in range(200):
    p = make_patient(i, 90_000 + i, horizon=240)
    L = Loop(p, "none")
    for t in range(240):
        o = L.world.step(np.zeros(6))
        L.tracker.update(o["passive"], None)
        X.append(L.tracker.zs.copy()); y.append(o["mu_phq"] - L.well_phq)
X, y = np.array(X), np.array(y)
from scipy.optimize import nnls
w, _ = nnls(X, y)
pred = X @ w
r2 = 1 - ((y - pred) ** 2).sum() / ((y - y.mean()) ** 2).sum()
rw = float(np.std(np.diff(y - pred)))
print("weights", dict(zip(PASSIVE, w.round(3))), "R2", round(r2, 3), "resid diff sd", round(rw, 3))
Path("keel/forecast_weights.json").write_text(json.dumps({"w": w.round(4).tolist(), "r2": round(r2, 3), "features": PASSIVE}))
