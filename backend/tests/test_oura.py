import json
from datetime import date, datetime, timedelta

import numpy as np

from keel import oura


def _fake_export(tmp_path, n=50, drift_from=35):
    rng = np.random.default_rng(0)
    sleep, act = [], []
    for i in range(n):
        d = date(2026, 9, 1) + timedelta(days=i)
        bad = max(0, i - drift_from) / 10
        start = datetime(d.year, d.month, d.day, 23, 0) - timedelta(days=1) + timedelta(hours=rng.normal(0, 0.3 + bad))
        end = start + timedelta(hours=7.5 + rng.normal(0, 0.3 + 0.5 * bad))
        sleep.append({"day": d.isoformat(), "type": "long_sleep", "bedtime_start": start.isoformat(), "bedtime_end": end.isoformat(),
                      "efficiency": 90 - 4 * bad + rng.normal(0, 1.5), "awake_time": 1500 + 900 * bad, "average_hrv": 50 - 6 * bad + rng.normal(0, 3)})
        act.append({"day": d.isoformat(), "steps": int(8000 * np.exp(-0.3 * bad) + rng.normal(0, 800))})
    p = tmp_path / "oura.json"
    p.write_text(json.dumps({"sleep": {"data": sleep}, "daily_activity": {"data": act}}))
    return p


def test_replay_flags_drift_away_from_own_normal(tmp_path):
    res = oura.replay([_fake_export(tmp_path)])
    days = res["days"]
    assert len(days) == 50
    early = np.mean([d["body"] for d in days[15:30]])
    late = np.mean([d["body"] for d in days[-5:]])
    assert late > early + 3
    assert max(d["risk"] for d in days[-5:]) > max(d["risk"] for d in days[15:30])


def test_relative_amplitude_from_activity_classes():
    day = "1" * 84 + "4" * 120 + "2" * 84       # 7 h rest, 10 h active, 7 h inactive
    ra = oura.relative_amplitude(day)
    assert ra is not None and ra > 0.4
