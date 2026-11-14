"""Per-person Bayesian model of "what actually helps me".

Model, fit on the person's own daily check-ins:

    phq_t = baseline(t) - sum_k beta_k * E_k(t) + noise

* ``baseline(t)`` is a slow piecewise-linear curve (knots every 14 days), so the
  natural drift of the illness is not mistaken for a dose effect.
* ``E_k(t)`` is the recent exposure to dose k (doses actually done, filtered with a
  ~1-2 day memory).
* ``beta_k`` is the PHQ-9 points of relief this person gets from doing dose k daily.

Conjugate Gaussian prior centred on the population effect, so day 1 is sensible and
every new check-in narrows the person's own estimate. Exact, fast, no training run.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .interventions import N_K, POP_RELIEF_PHQ
from .sim import A_DOSE

NOISE_SD = 1.3            # PHQ points, check-in noise + model error
BODY_SD = 0.7             # PHQ points, passive body signal
KNOT_DAYS = 14
WINDOW = 150
PRIOR_SD = 0.8 * POP_RELIEF_PHQ + 0.4


@dataclass
class Posterior:
    mean: np.ndarray          # [k] relief in PHQ points
    sd: np.ndarray            # [k]
    cov: np.ndarray           # [k, k]
    n_obs: int


def exposure(done: np.ndarray) -> np.ndarray:
    """[T, k] doses done -> [T, k] exposure the day they are measured (after that day's dose)."""
    E = np.zeros_like(done, dtype=float)
    e = np.zeros(done.shape[1])
    for t in range(done.shape[0]):
        e = e + A_DOSE * (done[t] - e)
        E[t] = e
    return E


def _hat_basis(days: np.ndarray, t_end: int) -> np.ndarray:
    knots = np.arange(0, max(t_end, 1) + KNOT_DAYS, KNOT_DAYS, dtype=float)
    H = np.zeros((len(days), len(knots)))
    for j, k in enumerate(knots):
        H[:, j] = np.clip(1 - np.abs(days - k) / KNOT_DAYS, 0, None)
    return H


def fit(done: np.ndarray, checkin_phq: np.ndarray, body_phq: np.ndarray | None = None) -> Posterior:
    """Shared dose effects, fit jointly on two daily signals.

    ``checkin_phq`` [T] (NaN when skipped) is what the person reports. ``body_phq`` [T] is
    the passive body signal in PHQ points (steps removed, since walking moves steps
    directly). Each signal gets its own slow baseline; the dose effects are shared.
    """
    T = done.shape[0]
    prior_m = POP_RELIEF_PHQ.copy()
    prior_P = np.diag(1 / PRIOR_SD**2)
    if T < 3:
        cov = np.linalg.inv(prior_P)
        return Posterior(prior_m, np.sqrt(np.diag(cov)), cov, 0)
    E = exposure(done)
    lo = max(0, T - WINDOW)
    days = np.arange(lo, T) - lo
    H = _hat_basis(days, T - lo)
    nb = H.shape[1]
    blocks, ys, sds, means = [], [], [], []
    signals = [(checkin_phq, NOISE_SD)]
    if body_phq is not None:
        signals.append((body_phq, BODY_SD))
    for j, (sig, sd) in enumerate(signals):
        y = np.asarray(sig[lo:T], dtype=float)
        ok = ~np.isnan(y)
        if ok.sum() < 3:
            continue
        Hb = np.zeros((T - lo, nb * len(signals)))
        Hb[:, j * nb:(j + 1) * nb] = H
        blocks.append(np.hstack([-E[lo:T], Hb])[ok] / sd)
        ys.append(y[ok] / sd)
        means.append(np.nanmean(y))
    if not blocks:
        cov = np.linalg.inv(prior_P)
        return Posterior(prior_m, np.sqrt(np.diag(cov)), cov, 0)
    X, yv = np.vstack(blocks), np.concatenate(ys)
    nbt = nb * len(signals)
    m0 = np.concatenate([prior_m, np.repeat([np.mean(means)], nbt)])
    P0 = np.zeros((N_K + nbt, N_K + nbt))
    P0[:N_K, :N_K] = prior_P
    D = np.diff(np.eye(nb), axis=0)
    for j in range(len(signals)):
        sl = slice(N_K + j * nb, N_K + (j + 1) * nb)
        P0[sl, sl] = np.eye(nb) / 8.0**2 + D.T @ D / 2.5**2
    P = X.T @ X + P0
    cov_full = np.linalg.inv(P)
    mean = cov_full @ (X.T @ yv + P0 @ m0)
    cov = cov_full[:N_K, :N_K]
    return Posterior(mean[:N_K], np.sqrt(np.diag(cov)), cov, int(len(yv)))


def sample(post: Posterior, rng: np.random.Generator) -> np.ndarray:
    return rng.multivariate_normal(post.mean, post.cov)
