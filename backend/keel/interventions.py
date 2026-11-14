"""The daily "doses" Keel can prescribe, and the symptom dimensions they act on.

Symptom state lives on five PHQ-style item scales (0 = none, 3 = nearly every day).
The PHQ-9-equivalent total used everywhere in the UI is ``PHQ_SCALE * sum(dims)``,
so 0..15 internal units map onto the familiar 0..27 PHQ-9 range.
"""

from __future__ import annotations

import numpy as np

DIMS = ["mood", "interest", "sleep", "energy", "anxiety"]
N_DIMS = len(DIMS)
PHQ_SCALE = 27.0 / 15.0

RELAPSE_PHQ = 15.0        # moderately severe on the PHQ-9 scale
REMISSION_PHQ = 5.0

# key, label for the patient, minutes of effort, population-mean effect per dim
# (internal item units of relief when done every day; mood, interest, sleep, energy, anxiety)
INTERVENTIONS = [
    ("light",    "Morning light",          20, [0.20, 0.05, 0.30, 0.20, 0.00]),
    ("walk",     "Brisk walk",             30, [0.20, 0.05, 0.10, 0.30, 0.15]),
    ("anchor",   "Same wake-up time",       5, [0.05, 0.00, 0.35, 0.15, 0.00]),
    ("social",   "Reach out to someone",   15, [0.25, 0.20, 0.00, 0.00, 0.10]),
    ("breathe",  "Slow breathing + music", 10, [0.05, 0.00, 0.10, 0.00, 0.30]),
    ("pleasant", "One thing you enjoy",    30, [0.25, 0.35, 0.00, 0.05, 0.05]),
]
KEYS = [i[0] for i in INTERVENTIONS]
LABELS = {i[0]: i[1] for i in INTERVENTIONS}
MINUTES = np.array([i[2] for i in INTERVENTIONS], dtype=float)
EFFECT_SCALE = 0.6   # keeps single-dose effects modest (about 0.5 to 1.4 PHQ-9 points)
POP_EFFECT = EFFECT_SCALE * np.array([i[3] for i in INTERVENTIONS], dtype=float).T   # [dims, k]
N_K = len(INTERVENTIONS)

# Population-mean relief of each intervention in PHQ-9 points (used as learner prior).
POP_RELIEF_PHQ = POP_EFFECT.sum(axis=0) * PHQ_SCALE

DETAILS = {
    "light": "20 min outside before 10:00, or a 10 000 lux lamp at breakfast.",
    "walk": "30 min at a pace where talking is a little hard.",
    "anchor": "Get up at the same time as yesterday, weekends too.",
    "social": "A call, a message that asks a question, or coffee.",
    "breathe": "10 min of 6 breaths/min with your calm playlist.",
    "pleasant": "Something small you used to enjoy. Plan it, then do it.",
}


def phq(dims: np.ndarray) -> np.ndarray:
    """Internal 5-dim state (last axis) -> PHQ-9-equivalent total."""
    return np.asarray(dims).sum(axis=-1) * PHQ_SCALE
