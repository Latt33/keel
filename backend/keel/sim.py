"""Virtual post-TMS patient: the ground-truth world the product is tested against.

Mechanism (all per patient, daily steps, home day 0 = day after the last TMS session)

* ``B``     TMS benefit in [0, 1]. Starts at 1 and decays toward a personal floor ``f``
            with time constant ``tau``. A 5-session booster block pushes it back up and
            adds an acute antidepressant effect that fades over ~50 days.
* ``base``  where symptoms are heading without any home support:
            ``well + (depressed - well) * (1 - B) + stress * load``.
* ``slow``  symptoms follow ``base`` slowly (time constant ~14 d).
* ``E``     exposure to each daily dose actually done (fast filter, ~3 d).
* ``s``     observed symptom state = ``slow - W @ E`` (+ noise). ``W`` is the hidden,
            person-specific response to each dose; some people do not respond at all.
* passive   sleep / rhythm / activity / HRV respond to ``base`` quickly (~3 d), so they
            move *before* mood does. This encodes the actigraphy-relapse finding
            (Tonon et al., JAMA Psychiatry 2026) as an assumption, not a result.

Calibration: with no home support the relapse-free fraction is fit to the rTMS
durability meta-analysis (Senova et al., Brain Stimulation 2019): 66.5 % at 3 months,
52.9 % at 6 months, 46.3 % at 12 months. See ``tests/test_sim.py``.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .interventions import N_DIMS, N_K, POP_EFFECT, RELAPSE_PHQ, phq

A_SLOW = 0.07     # symptom response to the underlying setpoint (/day)
A_FAST = 0.30     # passive signals follow the setpoint (/day)
A_DOSE = 0.60     # a dose's effect fades over ~1-2 days

# --- calibrated cohort distributions (see scripts/calibrate.py) --------------
FLOOR_A, FLOOR_B = 2.0, 2.0          # Beta for the durable part of TMS benefit
TAU_MEDIAN, TAU_SIGMA = 20.0, 0.9    # LogNormal decay time of the rest (days)
EVENT_RATE = 1 / 110                 # life events per day
EVENT_MEAN = 0.35                    # item units added to the setpoint
EVENT_TAU = 21.0
BOOST_SIZE = 0.7                     # acute relief of a 5-session booster, item units per symptom
BOOST_TAU = 50.0                     # days

PASSIVE = ["sleep_regularity", "rhythm_strength", "sleep_efficiency", "night_wake_min", "steps", "hrv_ms"]
PASSIVE_LABEL = {
    "sleep_regularity": "Sleep regularity",
    "rhythm_strength": "Day/night rhythm",
    "sleep_efficiency": "Sleep efficiency",
    "night_wake_min": "Awake at night",
    "steps": "Steps",
    "hrv_ms": "Heart rate variability",
}
PASSIVE_UNIT = {"sleep_regularity": "/100", "rhythm_strength": "", "sleep_efficiency": "%",
                "night_wake_min": "min", "steps": "", "hrv_ms": "ms"}


@dataclass
class Patient:
    pid: int
    well: np.ndarray            # [dims] remission setpoint
    depressed: np.ndarray       # [dims] setpoint with no TMS benefit left
    floor: float                # durable fraction of TMS benefit
    tau: float                  # decay time of the rest
    W: np.ndarray               # [dims, k] hidden personal dose response
    adherence: float            # base probability of doing a planned dose
    checkin_rate: float         # probability of answering the daily check-in
    passive_base: dict          # personal healthy baseline of each passive signal
    load: np.ndarray            # [dims] how stress lands on each symptom
    seed: int = 0
    noise: dict = field(default_factory=dict, repr=False)


def make_patient(pid: int, seed: int, horizon: int = 365) -> Patient:
    rng = np.random.default_rng(seed)
    well = np.clip(rng.normal(0.6, 0.15, N_DIMS), 0.2, 1.0)
    depressed = np.clip(rng.normal(2.35, 0.3, N_DIMS), 1.5, 3.0)
    floor = rng.beta(FLOOR_A, FLOOR_B)
    tau = float(np.exp(rng.normal(np.log(TAU_MEDIAN), TAU_SIGMA)))
    mult = np.exp(rng.normal(0.0, 0.55, N_K))
    mult[rng.random(N_K) < 0.2] = 0.0                 # non-responders to that dose
    W = POP_EFFECT * mult[None, :]
    patient = Patient(
        pid=pid, well=well, depressed=depressed, floor=floor, tau=tau, W=W,
        adherence=float(rng.beta(7, 2.2)), checkin_rate=float(rng.beta(9, 1.5)),
        passive_base={
            "sleep_regularity": rng.normal(82, 4), "rhythm_strength": rng.normal(0.88, 0.03),
            "sleep_efficiency": rng.normal(90, 2), "night_wake_min": rng.normal(22, 5),
            "steps": rng.normal(7800, 1500), "hrv_ms": rng.normal(48, 8),
        },
        load=np.clip(rng.normal([1.0, 0.7, 0.9, 0.8, 1.2], 0.2), 0.2, 1.6),
        seed=seed,
    )
    # exogenous randomness, shared across every policy (common random numbers)
    n = horizon + 60
    events = np.zeros(n)
    for t in np.flatnonzero(rng.random(n) < EVENT_RATE):
        events[t] = rng.exponential(EVENT_MEAN)
    patient.noise = {
        "ou": rng.normal(0, 1, n), "events": events,
        "sym": rng.normal(0, 1, (n, N_DIMS)), "obs": rng.normal(0, 1, (n, N_DIMS)),
        "passive": rng.normal(0, 1, (n, len(PASSIVE))), "adh": rng.random((n, N_K)),
        "checkin": rng.random(n),
    }
    return patient


def passive_from(p: Patient, fast_dev: np.ndarray, z: np.ndarray, dose_today: np.ndarray) -> dict:
    """Passive signals from the fast setpoint deviation (item units above remission)."""
    d = np.maximum(fast_dev, 0)
    b = p.passive_base
    mood, interest, sleep, energy, anxiety = d
    return {
        "sleep_regularity": float(np.clip(b["sleep_regularity"] - 10 * sleep - 3 * mood + 3.5 * z[0], 20, 100)),
        "rhythm_strength": float(np.clip(b["rhythm_strength"] - 0.07 * (energy + interest) / 2 - 0.03 * sleep + 0.02 * z[1], 0.3, 0.99)),
        "sleep_efficiency": float(np.clip(b["sleep_efficiency"] - 3.0 * sleep + 1.6 * z[2], 50, 99)),
        "night_wake_min": float(np.clip(b["night_wake_min"] + 14 * sleep + 2 * anxiety + 6 * z[3], 0, 240)),
        "steps": float(max(300, b["steps"] * np.exp(-0.28 * energy - 0.08 * interest) * (1 + 0.12 * z[4]) + 2800 * dose_today[1])),
        "hrv_ms": float(max(10, b["hrv_ms"] - 5 * anxiety - 2 * sleep + 3.5 * z[5])),
    }


class World:
    """Steps one patient forward day by day under some policy."""

    def __init__(self, p: Patient):
        self.p = p
        self.t = 0
        self.B = 1.0
        self.stress = np.zeros(N_DIMS)
        self.event = 0.0
        self.slow = p.well.copy()
        self.fast = p.well.copy()
        self.E = np.zeros(N_K)
        self.booster_days: list[int] = []
        self.pending_booster: int | None = None
        self.done_override: np.ndarray | None = None
        self.boost = 0.0          # acute antidepressant effect of a booster block (item units)

    def base(self) -> np.ndarray:
        p = self.p
        return (p.well + (p.depressed - p.well) * (1 - self.B) + (self.stress + self.event) * p.load
                - self.boost)

    def schedule_booster(self, start_day: int) -> None:
        self.pending_booster = start_day

    def step(self, plan: np.ndarray, checkin_override: np.ndarray | None = None) -> dict:
        """Advance one day. ``plan`` is a 0/1 vector over interventions."""
        p, t, nz = self.p, self.t, self.p.noise
        # TMS benefit decays toward the durable floor; booster block restores it
        self.B = p.floor + (self.B - p.floor) * np.exp(-1.0 / p.tau)
        in_booster = False
        if self.pending_booster is not None and t >= self.pending_booster:
            k = t - self.pending_booster
            in_booster = k < 5
            if k == 4:
                self.B = self.B + 0.8 * (1 - self.B)
                self.boost = BOOST_SIZE
                self.booster_days.append(self.pending_booster)
                self.pending_booster = None
        self.boost *= np.exp(-1.0 / BOOST_TAU)
        # stress: slow OU wobble + decaying life events
        self.stress = self.stress * 0.9 + 0.035 * nz["ou"][t]
        self.event = self.event * np.exp(-1 / EVENT_TAU) + nz["events"][t]

        base = self.base()
        done = (np.asarray(plan) > 0) & (nz["adh"][t] < p.adherence * (1 - 0.08 * max(0, plan.sum() - 2)))
        done = done.astype(float)
        if self.done_override is not None:
            done = np.asarray(self.done_override, dtype=float)
        self.E = self.E + A_DOSE * (done - self.E)
        relief = p.W @ self.E
        self.slow = self.slow + A_SLOW * (base - self.slow) + 0.03 * nz["sym"][t]
        self.fast = self.fast + A_FAST * (base - self.fast)
        s = np.clip(self.slow - relief, 0, 3)
        passive = passive_from(p, self.fast - relief - p.well, nz["passive"][t], done)
        answered = nz["checkin"][t] < p.checkin_rate
        obs = np.clip(s + 0.22 * nz["obs"][t], 0, 3) if answered else None
        if checkin_override is not None:
            obs, answered = np.clip(checkin_override, 0, 3), True
        self.t += 1
        return {
            "day": t, "s": s, "mu_phq": float(phq(np.clip(self.fast - relief, 0, 3))), "phq": float(phq(s)), "B": float(self.B), "base_phq": float(phq(np.clip(base, 0, 3))),
            "done": done, "passive": passive, "checkin": obs, "answered": bool(answered),
            "in_booster": in_booster, "life_event": float(nz["events"][t]),
        }


def relapse_day(phq_series: np.ndarray, thr: float = RELAPSE_PHQ, window: int = 7) -> int | None:
    """First day the trailing 7-day mean of true PHQ reaches the relapse line."""
    x = np.asarray(phq_series, dtype=float)
    if len(x) < window:
        return None
    m = np.convolve(x, np.ones(window) / window, mode="valid")
    idx = np.flatnonzero(m >= thr)
    return int(idx[0] + window - 1) if idx.size else None
