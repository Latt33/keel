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
CHECKPOINTS = list(range(0, DAYS + 1, 15))


def run_one(i: int) -> dict:
    out = {}
    for pol in POLICIES:
        p = make_patient(i, 20_000 + i, horizon=DAYS)
        L = Loop(p, pol)
        learn_curve = []
        if pol == "keel":
            truth = p.W.sum(axis=0) * PHQ_SCALE
            top3 = set(np.argsort(-truth)[:3])
            for t in range(DAYS):
                if t in CHECKPOINTS:
                    learn_curve.append((float(np.abs(L.post.mean - truth).mean()), len(set(np.argsort(-L.post.mean)[:2]) & top3) / 2))
                L.step(full=False)
            learn_curve.append((float(np.abs(L.post.mean - truth).mean()), len(set(np.argsort(-L.post.mean)[:2]) & top3) / 2))
            log = L.log
        else:
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
            rec["learn_curve"] = learn_curve
        out[pol] = rec
    return out


def calibration_curve(n: int = 600, days: int = 365) -> dict:
    """Untreated cohort over a year, against the rTMS durability meta-analysis."""
    from keel.interventions import N_K
    from keel.sim import World
    rds = []
    for i in range(n):
        w = World(make_patient(i, 70_000 + i, horizon=days))
        x = np.array([w.step(np.zeros(N_K))["phq"] for _ in range(days)])
        r = relapse_day(x)
        rds.append(10_000 if r is None else r)
    rd = np.array(rds)
    return {"days": list(range(0, days + 1, 5)), "model": [round(float((rd > d).mean()), 4) for d in range(0, days + 1, 5)],
            "published": [{"day": 0, "value": 1.0}, {"day": 91, "value": 0.665}, {"day": 182, "value": 0.529}, {"day": 365, "value": 0.463}],
            "source": "Senova et al., Brain Stimulation 2019 (rTMS durability meta-analysis)"}


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
    # ---- evidence for the "How we tested it" page --------------------------------------
    ev: dict = {"days": list(range(DAYS + 1))}
    ev["survival"] = {}
    for pol in POLICIES:
        rd = np.array([r[pol]["relapse"] if r[pol]["relapse"] is not None else 10_000 for r in rows])
        ev["survival"][pol] = [round(float((rd > d).mean()), 4) for d in range(DAYS + 1)]
    def roc(score, label):
        score, label = np.asarray(score), np.asarray(label, bool)
        pts = []
        for q in np.linspace(0, 1, 41):
            thr = np.quantile(score, q)
            pred = score >= thr
            pts.append([round(float((pred & ~label).sum() / max(1, (~label).sum())), 4), round(float((pred & label).sum() / max(1, label.sum())), 4)])
        return sorted(pts)
    ev["roc"] = {"keel": roc(S_, Y_), "checkin_only": roc(Sm_, Y_)}
    ev["lead_days"] = {"keel": [int(v) for v in lead_k], "checkin_only": [int(v) for v in lead_m]}
    lc = np.array([r["keel"]["learn_curve"] for r in rows])          # [patients, checkpoints, 2]
    ev["learning_curve"] = {"days": CHECKPOINTS, "abs_error": lc[:, :, 0].mean(axis=0).round(3).tolist(),
                            "top2_in_top3": lc[:, :, 1].mean(axis=0).round(3).tolist()}
    ev["calibration"] = calibration_curve()
    oc = {"kept_well": 0, "shorter": 0, "well_anyway": 0, "relapsed_both": 0}
    for r in rows:
        n, k = r["none"], r["keel"]
        if n["relapse"] is None and k["relapse"] is None:
            oc["well_anyway"] += 1
        elif n["relapse"] is not None and k["relapse"] is None:
            oc["kept_well"] += 1
        elif n["relapse"] is not None and k["days_relapsed"] < n["days_relapsed"] / 2:
            oc["shorter"] += 1
        else:
            oc["relapsed_both"] += 1
    ev["outcomes"] = oc
    res["evidence"] = ev
    Path("keel/results.json").write_text(json.dumps(res, indent=2))
    print(json.dumps(res, indent=2))
    return res


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 300)
