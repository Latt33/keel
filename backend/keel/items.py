"""Daily check-in items.

Structure follows the Beck Depression Inventory: 21 symptom domains, each answered by
picking the one of four statements that fits best, scored 0-3 from "as usual" to most
severe. The wording below is our own, not the copyrighted BDI text (a licensed BDI-II
could be dropped in item by item). Every item starts from a neutral "about as usual"
statement and the others describe a change, so no item presumes a bad day.

Three items a day on a 7-day rotation covers all 21 domains every week: under a minute
a day instead of a 21-item questionnaire. Each item feeds one of the model's five
symptom dimensions; the self-harm item feeds none and only triggers the safety path.
"""

from __future__ import annotations

import numpy as np

from .interventions import DIMS

__all__ = ["ITEMS", "BY_KEY", "ROTATION", "DIMS", "questions_for", "dims_from_items", "public"]

# key, domain shown to the patient, model dimension (None = safety only), 4 statements
ITEMS = [
    ("sadness", "Mood", "mood", ["I feel about as usual.", "I feel down at times.", "I feel down most of the time.", "I feel down all the time and it is hard to bear."]),
    ("future", "The future", "mood", ["I feel about the same about the future as usual.", "I feel less hopeful about the future than usual.", "I don’t expect things to work out for me.", "The future feels hopeless."]),
    ("failure", "Looking back", "mood", ["I see myself about as usual.", "I feel I have let myself down more than I should.", "I keep going over my failures.", "I feel like a complete failure."]),
    ("enjoyment", "Enjoyment", "interest", ["I enjoy things about as much as usual.", "I enjoy things less than I used to.", "I get very little enjoyment from things.", "I can’t enjoy anything."]),
    ("guilt", "Guilt", "mood", ["I don’t feel more guilty than usual.", "I feel guilty about some things.", "I feel guilty most of the time.", "I feel guilty all of the time."]),
    ("punishment", "Deserving", "mood", ["I don’t feel I deserve to be punished.", "I feel I may deserve punishment.", "I expect bad things to happen to me because of what I am.", "I feel I am being punished."]),
    ("self_view", "How I see myself", "mood", ["I feel about myself as usual.", "I have lost some confidence in myself.", "I am disappointed in myself.", "I dislike myself."]),
    ("self_criticism", "Being hard on myself", "mood", ["I am no harder on myself than usual.", "I am more critical of myself than usual.", "I blame myself for most things that go wrong.", "I blame myself for everything bad that happens."]),
    ("safety", "Thoughts of harming myself", None, ["I haven’t had thoughts of harming myself.", "I have had thoughts of harming myself, but I wouldn’t act on them.", "I would like to end my life.", "I would end my life if I had the chance."]),
    ("tearfulness", "Tears", "mood", ["I cry about as much as usual.", "I cry more than I used to.", "I cry over small things.", "I feel like crying but can’t."]),
    ("restlessness", "Restlessness", "anxiety", ["I feel about as settled as usual.", "I am more restless or on edge than usual.", "I am so restless it is hard to stay still.", "I have to keep moving or doing something."]),
    ("others", "Other people", "interest", ["I am as interested in other people as usual.", "I am less interested in other people than before.", "I have lost most of my interest in other people.", "It is hard to be interested in anyone."]),
    ("decisions", "Decisions", "interest", ["I make decisions about as well as usual.", "Decisions take more effort than usual.", "I find it much harder to make decisions.", "I can’t make decisions."]),
    ("worth", "Feeling useful", "mood", ["I feel as worthwhile as usual.", "I feel less useful than I used to.", "I feel less worthwhile than other people.", "I feel completely worthless."]),
    ("energy", "Energy", "energy", ["My energy is about as usual.", "I have less energy than usual.", "I don’t have enough energy to do very much.", "I don’t have enough energy to do anything."]),
    ("sleep", "Sleep", "sleep", ["I slept about as usual.", "I slept somewhat more or less than usual.", "I slept a lot more or less than usual.", "I hardly slept, or slept most of the day."]),
    ("irritability", "Irritability", "anxiety", ["I am about as irritable as usual.", "I am more irritable than usual.", "I am much more irritable than usual.", "I am irritable all the time."]),
    ("appetite", "Appetite", "energy", ["My appetite is about as usual.", "My appetite is somewhat more or less than usual.", "My appetite is much more or less than usual.", "I have no appetite at all, or want to eat all the time."]),
    ("concentration", "Concentration", "interest", ["I can concentrate about as well as usual.", "I can’t concentrate as well as usual.", "It is hard to keep my mind on anything for long.", "I can’t concentrate on anything."]),
    ("tiredness", "Tiredness", "energy", ["I am no more tired than usual.", "I get tired more easily than usual.", "I am too tired to do many things I used to do.", "I am too tired to do most things."]),
    ("intimacy", "Interest in intimacy", "interest", ["My interest in intimacy is about as usual.", "I am less interested in intimacy than before.", "I am much less interested in intimacy now.", "I have lost interest in intimacy completely."]),
]
BY_KEY = {k: (label, dim, st) for k, label, dim, st in ITEMS}

# 7-day rotation, 3 items a day, each day touching different parts of the picture
ROTATION = [
    ["sadness", "sleep", "enjoyment"],
    ["energy", "future", "restlessness"],
    ["others", "tiredness", "self_view"],
    ["concentration", "guilt", "appetite"],
    ["irritability", "failure", "decisions"],
    ["tearfulness", "worth", "self_criticism"],
    ["safety", "punishment", "intimacy"],
]
assert sorted(sum(ROTATION, [])) == sorted(BY_KEY), "rotation must cover all 21 items once a week"


def questions_for(day: int) -> list[str]:
    return ROTATION[(day + 1) % 7]


def dims_from_items(answers: dict[str, float]) -> np.ndarray:
    """Mean of the latest answers per model dimension (items without a dimension are skipped)."""
    out = np.zeros(len(DIMS))
    for i, d in enumerate(DIMS):
        vals = [v for k, v in answers.items() if BY_KEY[k][1] == d]
        out[i] = float(np.mean(vals)) if vals else 0.0
    return out


def public() -> list[dict]:
    return [{"key": k, "domain": label, "dim": dim, "statements": st} for k, label, dim, st in ITEMS]
