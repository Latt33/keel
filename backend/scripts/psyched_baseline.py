"""Real-data check on PSYCHE-D (Makhmutova et al. 2021, Zenodo 5085146, CC BY-NC 4.0).

Question that matters for Keel: among people who are currently NOT depressed
(PHQ-9 < 10), can 2 weeks of consumer-wearable sleep and step features tell who will
have worsened to PHQ-9 >= 10 three months later?

Grouped 5-fold CV by participant (no person in both train and test).
Run: python -m scripts.psyched_baseline ../data/anon_processed_df_parquet
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

path = sys.argv[1] if len(sys.argv) > 1 else "../data/anon_processed_df_parquet"
df = pd.read_parquet(path)
df["pid"] = [str(i).split("_")[0] for i in df.index]
df = df[df["phq9_score_start"] < 10].copy()
y = (df["phq9_score_end"] >= 10).astype(int).values
groups = df["pid"].values

wear = [c for c in df.columns if c.startswith(("steps", "sleep"))]
sets = {"wearable only": wear, "PHQ-9 now only": ["phq9_score_start"], "wearable + PHQ-9 now": wear + ["phq9_score_start"]}
res = {"n_samples": int(len(df)), "n_participants": int(df["pid"].nunique()), "positive_rate": round(float(y.mean()), 3), "auc": {}}
oof_store = {}
for name, cols in sets.items():
    oof = np.zeros(len(df))
    for tr, te in GroupKFold(5).split(df, y, groups):
        m = HistGradientBoostingClassifier(max_iter=250, learning_rate=0.05, max_leaf_nodes=15, random_state=0)
        m.fit(df.iloc[tr][cols], y[tr])
        oof[te] = m.predict_proba(df.iloc[te][cols])[:, 1]
    res["auc"][name] = round(float(roc_auc_score(y, oof)), 3)
    print(name, res["auc"][name])

# which wearable signals carry it (permutation importance, one held-out fold)
tr, te = next(GroupKFold(5).split(df, y, groups))
m = HistGradientBoostingClassifier(max_iter=250, learning_rate=0.05, max_leaf_nodes=15, random_state=0).fit(df.iloc[tr][wear], y[tr])
pi = permutation_importance(m, df.iloc[te][wear], y[te], scoring="roc_auc", n_repeats=5, random_state=0)
top = sorted(zip(wear, pi.importances_mean), key=lambda r: -r[1])[:8]
res["top_wearable_features"] = [{"feature": f, "auc_drop": round(float(v), 4)} for f, v in top]
print(json.dumps(res, indent=2))
Path(__file__).resolve().parents[1].joinpath("keel", "psyched_results.json").write_text(json.dumps(res, indent=2))
