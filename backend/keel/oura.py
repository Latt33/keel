"""Bring a real Oura ring into the loop.

Reads either Oura API v2 JSON (``sleep`` and ``daily_activity`` collections, as saved from
``/v2/usercollection/...``) or a CSV export, and turns each day into the six passive
signals Keel uses:

==================  ===================================================================
sleep_regularity    100 - 12 x SD of mid-sleep time (h) - 4 x SD of sleep length (h),
                    over the last 7 nights. A rough stand-in for the Sleep Regularity Index.
rhythm_strength     relative amplitude (M10 - L5) / (M10 + L5) from ``class_5_min`` when
                    present; otherwise left at the personal baseline (no information).
sleep_efficiency    ``efficiency`` (%)
night_wake_min      ``awake_time`` / 60
steps               ``steps``
hrv_ms              ``average_hrv``
==================  ===================================================================

``replay`` then runs the same baseline + forecast as the virtual ring: the first 14 days are
the person's normal, every later day gets a body signal (in PHQ points above their normal) and
a two-week risk. Without check-ins the forecast leans on the ring alone, so read it as
"how far from your own normal", not as a clinical risk.
"""

from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path

import numpy as np

from .forecast import Baseline, Tracker
from .sim import PASSIVE

BASELINE_DAYS = 14


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _ts(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None


def _records(path: Path) -> list[dict]:
    if path.suffix.lower() == ".json":
        obj = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(obj, dict):
            if "data" in obj:
                return obj["data"]
            out = []                       # {"sleep": {...}, "daily_activity": {...}} bundles
            for v in obj.values():
                if isinstance(v, dict) and "data" in v:
                    out += v["data"]
                elif isinstance(v, list):
                    out += v
            return out
        return obj
    if path.suffix.lower() == ".csv":
        with path.open(newline="", encoding="utf-8-sig") as f:
            return [{k.strip().lower().replace(" ", "_"): v for k, v in row.items()} for row in csv.DictReader(f)]
    return []


def _pick(r: dict, *names):
    for n in names:
        if n in r and r[n] not in (None, ""):
            return r[n]
    return None


def relative_amplitude(class_5_min: str) -> float | None:
    """Oura activity class per 5 min (0 non-wear, 1 rest, 2 inactive, 3 low, 4 medium, 5 high)."""
    if not class_5_min or len(class_5_min) < 200:
        return None
    x = np.array([int(c) for c in class_5_min if c.isdigit()], dtype=float)
    x[x == 0] = np.nan
    hourly = np.array([np.nanmean(x[i:i + 12]) if np.isfinite(x[i:i + 12]).any() else np.nan for i in range(0, len(x), 12)])
    if np.isnan(hourly).sum() > 6 or len(hourly) < 20:
        return None
    h = np.nan_to_num(hourly, nan=np.nanmean(hourly))
    roll = lambda k: np.array([h[(np.arange(i, i + k)) % len(h)].mean() for i in range(len(h))])
    m10, l5 = roll(10).max(), roll(5).min()
    return float((m10 - l5) / (m10 + l5)) if m10 + l5 > 0 else None


def load_days(paths: list[Path]) -> list[dict]:
    """Merge all files into one record per calendar day."""
    days: dict[str, dict] = {}
    for p in paths:
        for r in _records(p):
            day = _pick(r, "day", "date", "summary_date")
            if not day:
                continue
            day = str(day)[:10]
            d = days.setdefault(day, {"day": day})
            kind = r.get("type")
            s, e = _ts(_pick(r, "bedtime_start", "bedtime_start_time")), _ts(_pick(r, "bedtime_end", "bedtime_end_time"))
            if s and e and kind not in ("rest", "deleted"):
                length = (e - s).total_seconds() / 3600
                if length > d.get("len_h", 0):          # keep the main sleep of the day
                    mid = s + (e - s) / 2
                    d["mid_h"] = (mid.hour + mid.minute / 60 + 12) % 24     # noon-anchored so midnight is continuous
                    d["len_h"] = length
                    eff = _num(_pick(r, "efficiency", "sleep_efficiency"))
                    if eff is not None:
                        d["sleep_efficiency"] = eff
                    aw = _num(_pick(r, "awake_time", "awake_duration"))
                    if aw is not None:
                        d["night_wake_min"] = aw / 60
                    hrv = _num(_pick(r, "average_hrv", "hrv"))
                    if hrv is not None:
                        d["hrv_ms"] = hrv
            st = _num(_pick(r, "steps"))
            if st is not None:
                d["steps"] = st
            ra = relative_amplitude(_pick(r, "class_5_min") or "")
            if ra is not None:
                d["rhythm_strength"] = ra
    return [days[k] for k in sorted(days)]


def to_passive(days: list[dict]) -> list[dict]:
    """Fill the six signals per day; missing values carry forward (or the median)."""
    out, last = [], {}
    med = {k: float(np.nanmedian([d.get(k, np.nan) for d in days])) if any(k in d for d in days) else None for k in PASSIVE}
    for i, d in enumerate(days):
        win = [x for x in days[max(0, i - 6):i + 1] if "mid_h" in x]
        if len(win) >= 3:
            sri = 100 - 12 * np.std([x["mid_h"] for x in win]) - 4 * np.std([x["len_h"] for x in win])
            d["sleep_regularity"] = float(np.clip(sri, 20, 100))
        p = {}
        for k in PASSIVE:
            v = d.get(k, last.get(k, med.get(k)))
            p[k] = v
            if k in d:
                last[k] = d[k]
        out.append({"day": d["day"], "passive": p, "observed": [k for k in PASSIVE if k in d]})
    return out


def replay(paths: list[Path], well_phq: float = 5.0, seed: int = 0) -> dict:
    days = to_passive(load_days(paths))
    usable = [d for d in days if all(d["passive"][k] is not None for k in ("sleep_efficiency", "steps", "hrv_ms"))]
    if len(usable) < BASELINE_DAYS + 7:
        raise ValueError(f"need at least {BASELINE_DAYS + 7} days with sleep, steps and HRV; found {len(usable)}")
    # signals the ring never reported stay at baseline: fill them with a constant
    for d in usable:
        for k in PASSIVE:
            if d["passive"][k] is None:
                d["passive"][k] = {"rhythm_strength": 0.85, "sleep_regularity": 80.0, "night_wake_min": 25.0}.get(k, 0.0)
    base = Baseline([d["passive"] for d in usable[:BASELINE_DAYS]])
    tr = Tracker(base, well_phq)
    rng = np.random.default_rng(seed)
    rows = []
    for d in usable:
        body = tr.update(d["passive"], None)
        fc = tr.forecast(rng)
        rows.append({"day": d["day"], "body": round(body, 2), "risk": round(fc["risk"], 3),
                     "contrib": dict(zip(PASSIVE, np.round(tr.contrib, 3).tolist())),
                     "passive": {k: round(float(v), 3) for k, v in d["passive"].items()}, "observed": d["observed"]})
    return {"baseline": dict(zip(PASSIVE, np.round(base.mean, 3).tolist())), "days": rows,
            "baseline_days": [r["day"] for r in rows[:BASELINE_DAYS]]}
