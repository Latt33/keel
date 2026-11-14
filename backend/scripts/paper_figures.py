"""Figures and numbers for the Keel whitepaper (docs/paper/).

1. Explainability on the digital shadow: a gradient-boosted surrogate of 14-day relapse risk,
   trained on simulated patient-days, explained with TreeSHAP (global + Aino at her alert day).
2. Explainability on real data: TreeSHAP on the PSYCHE-D wearable model.
3. Evaluation figures from keel/results.json (calibration, survival, forecast, learning).
4. Aino's two worlds.

Run: python -m scripts.paper_figures [path/to/anon_processed_df_parquet]
"""
from __future__ import annotations

import json
import sys
from multiprocessing import Pool
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import shap
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

from keel.interventions import DIMS, KEYS, RELAPSE_PHQ
from keel.learner import exposure
from keel.loop import Loop
from keel.sim import PASSIVE, PASSIVE_LABEL, make_patient
from keel.story import STORY_SEED, build

ROOT = Path(__file__).resolve().parents[2]
FIG = ROOT / "docs" / "paper" / "figures"
FIG.mkdir(parents=True, exist_ok=True)
OUT: dict = {}
plt.rcParams.update({"font.size": 9, "axes.spines.top": False, "axes.spines.right": False, "figure.dpi": 150})
INK, CALM, STORM, AMBER, BLUE = "#111111", "#2e8c73", "#d1493c", "#c98a1b", "#3b7fc4"

DOSE_NAME = {"light": "morning light", "walk": "brisk walk", "anchor": "fixed wake time", "social": "social contact",
             "breathe": "slow breathing + music", "pleasant": "planned enjoyable activity"}
FEATURES = ([f"ring: {PASSIVE_LABEL[k].lower()} (worse than own normal)" for k in PASSIVE] +
            [f"check-in: {d}" for d in DIMS] +
            ["check-in trend (7 d)", "body-signal trend (7 d)"] +
            [f"dose: {DOSE_NAME[k]}" for k in KEYS] +
            ["days since discharge"])
HORIZON = 14


def patient_days(args):
    pid, seed, policy = args
    L = Loop(make_patient(pid, seed, horizon=180), policy)
    log = L.run(180, full=True)
    phq = np.array([r["phq"] for r in log])
    E = exposure(np.array([[1.0 if k in r["done"] else 0.0 for k in KEYS] for r in log]))
    last_ck = np.full(len(DIMS), np.nan)
    rows, ys, meta = [], [], []
    mood_hist = []
    for t, r in enumerate(log):
        if r["checkin_dims"] is not None:
            last_ck = np.array(r["checkin_dims"])
        mood_hist.append(r["mood"] if r["mood"] is not None else np.nan)
        if t < 14 or t + HORIZON >= len(log) or phq[t] >= RELAPSE_PHQ or np.isnan(last_ck).any():
            continue
        mtrend = mood_hist[t] - mood_hist[t - 7] if not np.isnan(mood_hist[t - 7]) else 0.0
        btrend = r["body"] - log[t - 7]["body"]
        x = list(r["zs"]) + list(last_ck) + [mtrend, btrend] + list(E[t]) + [t]
        rows.append(x)
        ys.append(int((phq[t + 1:t + 1 + HORIZON] >= RELAPSE_PHQ).any()))
        meta.append((pid, t))
    return rows, ys, meta


def surrogate_shap():
    jobs = [(i, 30_000 + i, pol) for i in range(220) for pol in ("none", "keel_plan")]
    with Pool() as pool:
        res = pool.map(patient_days, jobs)
    X = np.array([x for r in res for x in r[0]], dtype=float)
    y = np.array([v for r in res for v in r[1]])
    pid = np.array([m[0] for r in res for m in r[2]])
    test = pid % 5 == 0
    m = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=31, random_state=0)
    m.fit(X[~test], y[~test])
    auc = roc_auc_score(y[test], m.predict_proba(X[test])[:, 1])
    OUT["surrogate"] = {"n_patient_days": int(len(y)), "n_patients": 220, "positive_rate": round(float(y.mean()), 3),
                        "auc_heldout_patients": round(float(auc), 3)}
    expl = shap.TreeExplainer(m)
    rng = np.random.default_rng(0)
    idx = rng.choice(np.flatnonzero(test), size=min(3000, int(test.sum())), replace=False)
    sv = expl(X[idx])
    sv.feature_names = FEATURES
    imp = np.abs(sv.values).mean(axis=0)
    order = np.argsort(-imp)
    OUT["surrogate"]["mean_abs_shap"] = {FEATURES[i]: round(float(imp[i]), 4) for i in order}
    plt.figure()
    shap.plots.beeswarm(sv, max_display=14, show=False, color=plt.get_cmap("coolwarm"))
    fig = plt.gcf(); fig.set_size_inches(7.2, 4.6)
    ax0 = fig.axes[0]
    ax0.tick_params(axis="y", labelsize=8); ax0.tick_params(axis="x", labelsize=8)
    ax0.set_xlabel("SHAP value (log-odds of relapse within 14 days)", fontsize=8)
    cb = fig.axes[-1]; cb.set_ylabel("feature value", fontsize=8, labelpad=-6); cb.tick_params(labelsize=7)
    plt.savefig(FIG / "shap_global.pdf", bbox_inches="tight", pad_inches=0.05); plt.close()

    # Aino at her alert day, explained with the same surrogate
    rows, _, meta = patient_days((0, STORY_SEED, "keel"))
    alert = build()["events"]["alert"]
    j = min(range(len(meta)), key=lambda k: abs(meta[k][1] - (alert - 1)))
    sa = expl(np.array([rows[j]]))
    sa.feature_names = FEATURES
    waterfall(sa.values[0], float(sa.base_values[0]), rows[j])
    top = np.argsort(-np.abs(sa.values[0]))[:5]
    OUT["aino_shap"] = {"day": int(meta[j][1]), "base_logodds": round(float(sa.base_values[0]), 3),
                        "top": [{"feature": FEATURES[i], "value": round(float(rows[j][i]), 3), "shap": round(float(sa.values[0][i]), 3)} for i in top]}


def waterfall(vals, base, x, n=9):
    order = list(np.argsort(-np.abs(vals))[:n])
    rest = float(np.sum(vals) - np.sum(vals[order]))
    labels = [f"{FEATURES[i]}  = {x[i]:.2f}" for i in order] + [f"{len(vals) - n} other features"]
    contrib = [float(vals[i]) for i in order] + [rest]
    fig, ax = plt.subplots(figsize=(7.2, 3.6))
    cum = base
    for r, (lab, c) in enumerate(zip(labels, contrib)):
        y = len(labels) - 1 - r
        ax.barh(y, c, left=cum, color=STORM if c > 0 else BLUE, height=0.62)
        end = cum + c
        ax.text(max(cum, end) + 0.06, y, f"{c:+.2f}", va="center", ha="left", fontsize=7, color="#333")
        cum = end
    ax.vlines([base, cum], -0.6, len(labels) - 0.45, colors=["#999", "#333"], lw=0.7, linestyles=":")
    ax.set_yticks(range(len(labels))); ax.set_yticklabels(labels[::-1], fontsize=7.5)
    ax.set_xlim(min(base, cum) - 0.6, max(base, cum) + 1.0)
    ax.text(base, len(labels) - 0.3, f"average patient-day\n{base:.2f}", ha="center", va="bottom", fontsize=7, color="#666")
    ax.text(cum, len(labels) - 0.3, f"Aino at alert\n{cum:.2f}", ha="center", va="bottom", fontsize=7, color="#333")
    ax.set_ylim(-0.6, len(labels) + 0.9)
    ax.set_xlabel("log-odds of relapse within 14 days", fontsize=8); ax.tick_params(axis="x", labelsize=8)
    fig.savefig(FIG / "shap_aino.pdf", bbox_inches="tight", pad_inches=0.05); plt.close(fig)


def psyched_shap(path: str):
    import pandas as pd
    from sklearn.model_selection import GroupKFold
    df = pd.read_parquet(path)
    df["pid"] = [str(i).split("_")[0] for i in df.index]
    df = df[df["phq9_score_start"] < 10]
    y = (df["phq9_score_end"] >= 10).astype(int).values
    wear = [c for c in df.columns if c.startswith(("steps", "sleep"))]
    tr, te = next(GroupKFold(5).split(df, y, df["pid"].values))
    m = HistGradientBoostingClassifier(max_iter=250, learning_rate=0.05, max_leaf_nodes=15, random_state=0).fit(df.iloc[tr][wear], y[tr])
    Xte = df.iloc[te][wear].sample(n=min(2000, len(te)), random_state=0)
    sv = shap.TreeExplainer(m)(Xte)
    imp = np.abs(sv.values).mean(axis=0)
    top = np.argsort(-imp)[:10][::-1]
    fig, ax = plt.subplots(figsize=(6.4, 3.2))
    ax.barh([wear[i] for i in top], imp[top], color=BLUE)
    ax.set_xlabel("mean |SHAP value| (log-odds)")
    fig.tight_layout(); fig.savefig(FIG / "shap_psyched.pdf"); plt.close(fig)
    OUT["psyched_shap_top"] = [{"feature": wear[i], "mean_abs_shap": round(float(imp[i]), 4)} for i in np.argsort(-imp)[:8]]


def evaluation_figures():
    r = json.loads((ROOT / "backend" / "keel" / "results.json").read_text())
    e = r["evidence"]
    # calibration
    c = e["calibration"]
    fig, ax = plt.subplots(figsize=(3.5, 2.6))
    ax.plot(c["days"], c["model"], color=INK, lw=1.6, label="virtual cohort, no support")
    ax.scatter([p["day"] for p in c["published"][1:]], [p["value"] for p in c["published"][1:]], color=STORM, zorder=3, label="Senova et al. 2019")
    ax.set_xlabel("days since end of acute rTMS"); ax.set_ylabel("still in response"); ax.set_ylim(0.3, 1.02); ax.legend(frameon=False, fontsize=7)
    fig.tight_layout(); fig.savefig(FIG / "calibration.pdf"); plt.close(fig)
    # survival
    fig, ax = plt.subplots(figsize=(3.5, 2.6))
    for k, col, lab, ls in [("none", STORM, "usual care", "-"), ("fixed", AMBER, "fixed plan", "-"), ("keel_plan", BLUE, "Keel plan only", "--"), ("keel", CALM, "Keel (full loop)", "-")]:
        ax.plot(e["days"], e["survival"][k], color=col, lw=1.6, ls=ls, label=f"{lab} ({r['policies'][k]['relapse_free_180']:.0%})")
    ax.set_xlabel("days since discharge"); ax.set_ylabel("relapse-free"); ax.set_ylim(0.45, 1.02); ax.legend(frameon=False, fontsize=7)
    fig.tight_layout(); fig.savefig(FIG / "survival.pdf"); plt.close(fig)
    # forecast: ROC + lead
    fig, axs = plt.subplots(1, 2, figsize=(7.2, 2.6))
    for k, col, lab in [("keel", CALM, f"ring + check-ins (AUC {r['forecast']['auc_14d_keel']:.2f})"), ("checkin_only", INK, f"check-ins only (AUC {r['forecast']['auc_14d_checkin_only']:.2f})")]:
        pts = np.array(e["roc"][k]); axs[0].plot(pts[:, 0], pts[:, 1], color=col, lw=1.6, label=lab)
    axs[0].plot([0, 1], [0, 1], color="#999", lw=0.8, ls=":"); axs[0].set_xlabel("false-alarm rate"); axs[0].set_ylabel("sensitivity"); axs[0].legend(frameon=False, fontsize=7)
    bins = np.arange(0, 66, 6)
    axs[1].hist(np.clip(e["lead_days"]["checkin_only"], 0, 60), bins=bins, color="#bbb", label="check-ins only")
    axs[1].hist(np.clip(e["lead_days"]["keel"], 0, 60), bins=bins, color=CALM, alpha=0.75, label="ring + check-ins")
    axs[1].set_xlabel("warning before relapse (days, 60 = 60+)"); axs[1].set_ylabel("patients"); axs[1].legend(frameon=False, fontsize=7)
    fig.tight_layout(); fig.savefig(FIG / "forecast.pdf"); plt.close(fig)
    # learning
    lc = e["learning_curve"]
    fig, ax = plt.subplots(figsize=(3.5, 2.6))
    ax.plot(lc["days"], lc["top2_in_top3"], color=CALM, lw=1.6, marker="o", ms=3)
    ax.axhline(lc["top2_in_top3"][0], color=INK, ls="--", lw=0.8)
    ax.text(lc["days"][-1], lc["top2_in_top3"][0] + 0.008, "population prior", ha="right", va="bottom", fontsize=7)
    ax.set_xlabel("days since discharge"); ax.set_ylabel("top-2 doses in true top-3")
    fig.tight_layout(); fig.savefig(FIG / "learning.pdf"); plt.close(fig)


def aino_figure():
    st = build()
    ev = st["events"]
    k, n = st["keel"], st["none"]
    t = np.array([r["day"] for r in k])
    fig, ax = plt.subplots(figsize=(7.2, 2.9))
    tms = st["tms"]
    ax.plot([d["day"] for d in tms] + [0], [d["phq"] for d in tms] + [k[0]["phq"]], color="#888", lw=1.2)
    ax.axvspan(-42, 0, color="#cdb98c", alpha=0.2, lw=0)
    found = ev["found_without"] or 90
    ax.plot(t[:found + 1], [n[i]["phq"] for i in range(found + 1)], color=STORM, lw=1.3, label="same life, usual care")
    ax.plot(t, [r["phq"] for r in k], color=INK, lw=1.5, label="with Keel (true state)")
    body = np.array([r["body"] for r in k]); sm = body.copy()
    for i in range(1, len(sm)): sm[i] = sm[i - 1] + 0.3 * (body[i] - sm[i - 1])
    ax.plot(t[3:], sm[3:], color=BLUE, lw=1.2, ls="--", label="body signal from ring")
    a = ev["alert"]
    fan = k[a]["fan"]
    h = np.arange(a + 1, a + 1 + len(fan["p50"]))
    ax.fill_between(h, fan["p10"], fan["p90"], color=STORM, alpha=0.2, lw=0, label="14-day ensemble at alert")
    ax.axhline(RELAPSE_PHQ, color=STORM, ls=":", lw=0.9)
    for b in ev["booster"][:1]:
        ax.axvspan(b, b + 5, color="#cdb98c", alpha=0.45, lw=0)
    for d in ev["life_event"]:
        if d < 120: ax.axvline(d, color=AMBER, lw=0.8, ls="--")
    ax.axvline(a, color=STORM, lw=0.8)
    top = ax.get_xaxis_transform()
    ax.text(-21, 1.02, "acute rTMS", transform=top, ha="center", va="bottom", fontsize=7, color="#8a7a4f")
    le = [d for d in ev["life_event"] if d < 120]
    for i, d in enumerate(le):
        if i and d - le[i - 1] < 5: continue
        ax.text(d - 1 if i == 0 else d + 2, 1.02, "life event", transform=top, ha="right" if i == 0 else "left", va="bottom", fontsize=7, color=AMBER)
    ax.text(a + 1, 1.02, "alert", transform=top, ha="left", va="bottom", fontsize=7, color=STORM)
    if ev["booster"]:
        ax.text(ev["booster"][0] + 2.5, 1.09, "booster", transform=top, ha="center", va="bottom", fontsize=7, color="#8a7a4f")
    ax.text(178, RELAPSE_PHQ + 0.4, "relapse threshold", ha="right", va="bottom", fontsize=7, color=STORM)
    ax.set_xlim(-42, 179); ax.set_ylim(0, 24); ax.set_xlabel("days since end of acute rTMS"); ax.set_ylabel("PHQ-9-equivalent score")
    ax.legend(frameon=False, fontsize=7, ncol=4, loc="upper center", bbox_to_anchor=(0.5, -0.2))
    fig.set_size_inches(7.2, 3.3)
    fig.tight_layout(); fig.savefig(FIG / "aino.pdf"); plt.close(fig)
    OUT["aino"] = {k2: ev[k2] for k2 in ("life_event", "alert", "booster", "relapse_without", "found_without", "max_phq_keel")}


if __name__ == "__main__":
    evaluation_figures()
    aino_figure()
    surrogate_shap()
    if len(sys.argv) > 1:
        psyched_shap(sys.argv[1])
    (FIG / "numbers.json").write_text(json.dumps(OUT, indent=2))
    print(json.dumps(OUT, indent=2))
