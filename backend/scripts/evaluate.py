"""Cohort evaluation: does the loop keep virtual post-TMS patients well?

Every virtual patient lives the same 180 days (same life events, same noise) under each
policy, so differences come from the policy alone. Writes keel/results.json, which the
frontend shows as the closing numbers of the story.

Run: python -m scripts.evaluate [n_patients]
"""
from __future__ import annotations

import json
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np

from keel.interventions import PHQ_SCALE, RELAPSE_PHQ
from keel.loop import Loop
from keel.sim import make_patient, relapse_day

DAYS = 180
POLICIES = ["none", "fixed", "keel_plan", "keel"]


def run_one(i: int) -> dict:
    out = {}
    for pol in POLICIES:
        p = make_patient(i, 20_000 + i, horizon=DAYS)
        L = Loop(p, pol)
        log = L.run(DAYS)
        x = np.array([r["phq"] for r in log])
        rec = {"relapse": relapse_day(x), "days_relapsed": int((x >= RELAPSE_PHQ).sum()),
               "boosters": len(L.world.booster_days), "alerts": L.alerts}
        if pol == "none":
            risk = np.array([r["risk"] for r in log])
            mood = np.array([r["mood"] if r["mood"] is not None else np.nan for r in log])
            rec["risk"], rec["phq"], rec["mood"] = risk.tolist(), x.tolist(), mood.tolist()
        if pol == "keel":
            truth = p.W.sum(axis=0) * PHQ_SCALE
            prior = learner_prior()
            rec["learn_err_prior"] = float(np.abs(prior - truth).mean())
            rec["learn_err_final"] = float(np.abs(L.post.mean - truth).mean())
            top3 = set(np.argsort(-truth)[:3])
            rec["top2_prior"] = len(set(np.argsort(-prior)[:2]) & top3) / 2
            rec["top2_final"] = len(set(np.argsort(-L.post.mean)[:2]) & top3) / 2
        out[pol] = rec
    return out


def learner_prior():
    from keel.interventions import POP_RELIEF_PHQ
    return POP_RELIEF_PHQ


def auc(score, label):
    score, label = np.asarray(score), np.asarray(label, bool)
    pos, neg = score[label], score[~label]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    order = np.argsort(np.concatenate([pos, neg]))
    ranks = np.empty(len(order)); ranks[order] = np.arange(1, len(order) + 1)
    return float((ranks[: len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def main(n: int = 300) -> dict:
    with Pool() as pool:
        rows = pool.map(run_one, range(n))
    res: dict = {"n_patients": n, "days": DAYS, "policies": {}}
    for pol in POLICIES:
        rd = np.array([r[pol]["relapse"] if r[pol]["relapse"] is not None else 10_000 for r in rows])
        res["policies"][pol] = {
            "relapse_free_90": round(float((rd > 90).mean()), 3),
            "relapse_free_180": round(float((rd > 180).mean()), 3),
            "days_relapsed_mean": round(float(np.mean([r[pol]["days_relapsed"] for r in rows])), 1),
            "boosters_per_patient": round(float(np.mean([r[pol]["boosters"] for r in rows])), 2),
        }
    # forecast quality, measured on the untreated arm (pure observation)
    S, Y, Sm, lead_k, lead_m = [], [], [], [], []
    for r in rows:
        x, risk, mood = np.array(r["none"]["phq"]), np.array(r["none"]["risk"]), np.array(r["none"]["mood"])
        rd = r["none"]["relapse"]
        for t in range(14, DAYS - 14):
            if x[t] >= RELAPSE_PHQ:
                continue
            S.append(risk[t]); Sm.append(np.nan_to_num(mood[t])); Y.append(bool((x[t + 1:t + 15] >= RELAPSE_PHQ).any()))
    S_, Y_, Sm_ = np.array(S), np.array(Y), np.array(Sm)
    # thresholds giving the same 10 % false-alarm rate on days that do not precede a relapse
    thr_k = float(np.quantile(S_[~Y_], 0.90))
    thr_m = float(np.quantile(Sm_[~Y_], 0.90))
    for r in rows:
        x, risk, mood = np.array(r["none"]["phq"]), np.array(r["none"]["risk"]), np.nan_to_num(np.array(r["none"]["mood"]))
        rd = r["none"]["relapse"]
        if rd is not None and rd > 14:
            k = np.flatnonzero(risk[14:rd + 1] >= thr_k)
            m = np.flatnonzero(mood[14:rd + 1] >= thr_m)
            lead_k.append(rd - 14 - k[0] if k.size else 0)
            lead_m.append(rd - 14 - m[0] if m.size else 0)
    res["forecast"] = {
        "auc_14d_keel": round(auc(S, Y), 3),
        "auc_14d_checkin_only": round(auc(Sm, Y), 3),
        "median_warning_days_keel": float(np.median(lead_k)) if lead_k else None,
        "median_warning_days_checkin_only": float(np.median(lead_m)) if lead_m else None,
        "false_alarm_rate_matched": 0.10,
    }
    res["learning"] = {
        "mean_abs_error_prior": round(float(np.mean([r["keel"]["learn_err_prior"] for r in rows])), 3),
        "mean_abs_error_day180": round(float(np.mean([r["keel"]["learn_err_final"] for r in rows])), 3),
        "top2_in_true_top3_population_guess": round(float(np.mean([r["keel"]["top2_prior"] for r in rows])), 3),
        "top2_in_true_top3_day180": round(float(np.mean([r["keel"]["top2_final"] for r in rows])), 3),
    }
    Path("keel/results.json").write_text(json.dumps(res, indent=2))
    print(json.dumps(res, indent=2))
    return res


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 300)
