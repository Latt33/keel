# Keel

**Staying well after TMS.** A closed loop for the months after a course of transcranial magnetic
stimulation: it senses how someone is doing at home, forecasts relapse two weeks ahead, suggests a
small personal plan each day, learns what actually helps that person, and tells the clinic who needs a
booster before a crisis.

Junction 2026 · Aalto NBE challenge "Help people stay well at home after depression treatment".

![Aino's story, warning chapter](docs/screens/06-warning.png)

A 90-second walkthrough is in `docs/demo.mp4`; all chapters are in `docs/screens/`.

## Run it

Needs Python 3.11+ and Node 20+.

```powershell
# once
python -m pip install -r backend/requirements.txt
npm install
cd frontend; npm install; cd ..

# every time: API on :8000 and the app on :5173
npm run dev
```

Open http://localhost:5173. For a single-port demo (no Vite): `npm run build` then `npm run serve`
and open http://localhost:8000.

Three views, meant to be shown in this order:

1. **Aino’s story** – one virtual patient lived twice: with Keel and without. Press **Next** (or the
   right arrow key) to step through her six months. The brain, the chart and the panels all follow.
2. **Aino’s phone** – her model, live, paused two days into her hard week. Answer the check-in as
   her and watch the forecast, tomorrow’s plan, the learned effects and the clinic react.
3. **The clinic** – everyone discharged after TMS, ranked by who needs a call this week, with the
   reasons and a one-click booster booking.

## How it works

| Step | What happens | Code |
|---|---|---|
| Sense | 60-second check-in (5 PHQ-style questions) + ring signals: sleep regularity, day/night rhythm, sleep efficiency, night waking, steps, HRV | `keel/sim.py` (virtual ring), `frontend/src/phone` |
| Personal normal | Baseline recorded in the last two weeks of the TMS course; everything after is a z-score against *her* normal | `keel/forecast.py` `Baseline` |
| Forecast | Body signal converted to PHQ points, then a 300-member ensemble of the next 14 days. Share of futures crossing the relapse line = risk | `keel/forecast.py` `Tracker` |
| Plan | All 63 combinations of six small doses scored on relief vs minutes of effort (Pareto front). Thompson sampling picks today’s plan; the plan grows when risk rises | `keel/planner.py` |
| Learn | Bayesian regression on her own days: what each dose does for her, with a slow baseline so illness drift is not credited to a dose | `keel/learner.py` |
| Escalate | Three high-risk days in a row put her on the clinic list with the reasons; a 5-session booster is suggested | `keel/loop.py` |

## Evaluation (`python -m scripts.evaluate 300`)

300 virtual patients, 180 days, each living the same life (same stress, same noise) under four policies.
The untreated arm is calibrated to the rTMS durability meta-analysis (Senova et al. 2019: 66.5 % /
52.9 % relapse-free at 3 / 6 months; model: 67 % / 56 %).

| Policy | Relapse-free at 6 months | Days spent relapsed | Booster blocks per person |
|---|---|---|---|
| Usual care (nothing until the visit) | 56 % | 41.8 | 0 |
| Same healthy-habits plan for everyone | 66 % | 29.2 | 0 |
| Keel plan only (no clinic escalation) | 70 % | 24.3 | 0 |
| **Keel** | **89 %** | **2.4** | 0.69 |

* Forecast: AUC 0.94 for "crosses the relapse line within 14 days" vs 0.91 for check-ins alone. At the
  same 10 % false-alarm rate the median warning is 23 days before relapse vs 16 days.
* Learning: after 6 months Keel’s two favourite doses for a person are in that person’s true top three
  83 % of the time, against 59 % for the population guess.
* Most of the gain comes from **timing boosters** (rescue maintenance), not from the habits plan. This
  matches the clinical literature, where rescue maintenance rTMS outperforms fixed schedules.

### Real-data check (`python -m scripts.psyched_baseline ../data/anon_processed_df_parquet`)

PSYCHE-D (Makhmutova et al. 2021, Zenodo 5085146, CC BY-NC 4.0): 7 291 three-month windows from
3 069 people who were *not* depressed at the start (PHQ-9 < 10). Predicting PHQ-9 ≥ 10 three months
later, grouped cross-validation by person:

| Inputs | AUC |
|---|---|
| Fitbit sleep and steps only | 0.60 |
| PHQ-9 now only | 0.79 |
| Both | 0.78 |

A population model on two weeks of consumer wearable data says little three months ahead. That is why
Keel compares each person with **their own** baseline, forecasts **two weeks** rather than three months,
and always combines the ring with a daily check-in. The simulator’s 0.94 AUC is an upper bound under
its assumptions; the PSYCHE-D number is the floor to beat with real post-TMS data. The data file is
not committed (license); download it with the command in `data/README.md`.

## Repo

```
backend/keel/      sim (virtual patient) · forecast · learner · planner · loop · story · clinic · live · api
backend/scripts/   evaluate.py · calibrate_forecast.py · psyched_baseline.py
backend/tests/     model and API tests (pytest)
frontend/src/      story/ (chapters, chart, panels) · brain/ (3D scene + region mapping) · phone/ · clinic/
```

Credits: brain model "Brain" by maheshshinde777 on Sketchfab, CC BY 4.0. Fonts: Newsreader and
Schibsted Grotesk (SIL OFL). See HONESTY.md for everything simulated, assumed or reused.

## Real ring data (Oura)

Put an Oura API v2 export (`sleep` and `daily_activity` JSON, e.g. saved from
`https://api.ouraring.com/v2/usercollection/sleep?start_date=...&end_date=...`) or a CSV export in
`data/oura/`. A fourth tab, **Your ring**, appears: the first 14 days become that person’s normal and
every later day shows the drift from it and the two-week outlook. `python -m scripts.oura_replay`
prints the same in the terminal. At least 21 days with sleep, steps and HRV are needed.
