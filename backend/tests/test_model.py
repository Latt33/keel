import numpy as np
import pytest

from keel import learner, planner
from keel.interventions import N_K, PHQ_SCALE, POP_RELIEF_PHQ
from keel.loop import Loop
from keel.sim import World, make_patient, relapse_day


def _no_support_survival(n=250, days=180):
    out = []
    for i in range(n):
        w = World(make_patient(i, 70_000 + i, horizon=days))
        x = [w.step(np.zeros(N_K))["phq"] for _ in range(days)]
        r = relapse_day(np.array(x))
        out.append(10_000 if r is None else r)
    return np.array(out)


def test_untreated_cohort_matches_rtms_durability_meta_analysis():
    rd = _no_support_survival()
    # Senova et al. 2019: 66.5 % at 3 months, 52.9 % at 6 months
    assert abs((rd > 90).mean() - 0.665) < 0.07
    assert abs((rd > 180).mean() - 0.529) < 0.07


def test_relapse_day_uses_7_day_mean():
    x = np.r_[np.full(20, 5.0), np.full(10, 20.0)]
    assert relapse_day(x) == 24   # 5 of 7 days at 20 pushes the mean over 15
    assert relapse_day(np.full(30, 14.9)) is None


def test_learner_starts_at_population_prior():
    post = learner.fit(np.zeros((0, N_K)), np.zeros(0))
    assert np.allclose(post.mean, POP_RELIEF_PHQ)


def test_learner_recovers_a_strong_personal_effect():
    rng = np.random.default_rng(1)
    T = 150
    done = (rng.random((T, N_K)) < 0.5).astype(float)
    true = np.array([0.0, 2.5, 0.0, 0.0, 0.0, 0.0])
    y = 9 - learner.exposure(done) @ true + rng.normal(0, 0.8, T)
    post = learner.fit(done, y)
    assert post.mean[1] > 1.8 and post.mean[0] < 0.8
    assert post.sd[1] < learner.PRIOR_SD[1] / 2


def test_pareto_front_is_non_dominated_and_sorted():
    pts = planner.pareto(POP_RELIEF_PHQ, 0.8)["front"]
    mins = [p["minutes"] for p in pts]
    rel = [p["relief"] for p in pts]
    assert mins == sorted(mins) and rel == sorted(rel)


def test_plan_grows_with_risk():
    beta = POP_RELIEF_PHQ
    low = planner.choose(beta, 0.0, 0.8).sum()
    high = planner.choose(beta, 0.9, 0.8).sum()
    assert 1 <= low <= 2 and high > low


@pytest.mark.parametrize("seed", [3, 11])
def test_full_loop_runs_and_logs(seed):
    L = Loop(make_patient(0, seed, horizon=60), "keel")
    log = L.run(60, full=True)
    assert len(log) == 60
    assert {"fan", "plan", "risk", "learned"} <= set(log[-1])
    assert 0.0 <= log[-1]["risk"] <= 1.0


def test_keel_reduces_time_in_relapse_on_same_patients():
    days, n = 150, 40
    tot = {}
    for pol in ("none", "keel"):
        s = 0
        for i in range(n):
            log = Loop(make_patient(i, 40_000 + i, horizon=days), pol).run(days)
            s += sum(r["phq"] >= 15 for r in log)
        tot[pol] = s
    assert tot["keel"] < 0.6 * tot["none"]
