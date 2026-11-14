"""Run Keel's baseline + forecast over a real Oura export.

Put Oura API v2 JSON (sleep + daily_activity) or a CSV export in ../data/oura/, then:
    python -m scripts.oura_replay            (prints a summary)
The app shows the same thing under "Your ring" when that folder has data.
"""
import sys
from pathlib import Path

from keel.oura import replay

folder = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "data" / "oura"
files = sorted([*folder.glob("*.json"), *folder.glob("*.csv")])
if not files:
    sys.exit(f"No .json or .csv files in {folder}")
res = replay(files)
d = res["days"]
print(f"{len(d)} days, baseline {res['baseline_days'][0]} .. {res['baseline_days'][-1]}")
for r in d[-14:]:
    top = max(r["contrib"], key=r["contrib"].get)
    print(f"{r['day']}  body {r['body']:5.1f}  risk {r['risk']:.2f}  biggest drift: {top}")
