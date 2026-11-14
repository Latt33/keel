## The problem

TMS helps people whose depression medication could not fix, but the benefit fades. About half of those who recover relapse within a year, and the slide happens at home, between clinic visits, where nobody is looking. Clinics either book fixed maintenance sessions for everyone, which costs time for people who don't need them, or wait until someone is back in crisis.

## What we built

**Keel** is a closed loop for the months after a TMS course:

- **Sense:** a smart ring (sleep, day/night rhythm, activity, heart rate variability) plus three neutral questions a day, structured like the Beck Depression Inventory. Under a minute.
- **Forecast:** a digital twin of the disease in this one person turns both streams into a two-week relapse forecast (a 300-member ensemble).
- **Plan and learn:** each day it suggests one or two small actions (morning light, a walk, reaching out to someone) and learns, with Bayesian updating on the person's own days, which ones actually help them.
- **Act early:** when the forecast stays high, the nurse's call list shows who to call and why, with one-click booster booking.

The patient never sees a risk number: they see their own path and what has been helping them. The nurse sees the forecast and its reasons.

The demo follows **Aino**, a simulated patient, through the same six months twice: with Keel and without. In a hard week her ring moves before she says anything; Keel warns her nurse a month before a relapse and a short booster keeps her well. Without Keel, the relapse is found at her three-month visit.

## Why it works better

- **Personal, not population.** Every signal is compared with the person's own baseline, recorded in their last two weeks of TMS.
- **The body speaks first.** Ring signals are converted to the same units as the questionnaire, so a drift in sleep and rhythm shows up before mood does.
- **Boosters by forecast, not by calendar.** 0.7 booster blocks per person in six months instead of six fixed ones.
- **Explained.** Each warning comes with the signals that drove it (SHAP), so the nurse knows what to ask about.

## Results

Across 300 simulated patients over 180 days, calibrated to the rTMS durability meta-analysis (Senova et al. 2019), each living the same life under four kinds of care:

| Care | Relapse-free at 6 months | Days relapsed |
|---|---|---|
| Usual care | 56 % | 41.8 |
| Same habits plan for all | 66 % | 29.2 |
| **Keel** | **89 %** | **2.4** |

Warnings come a median **23 days** before relapse (16 with check-ins alone, same false-alarm rate; AUC 0.94 vs 0.91). On real wearable data (PSYCHE-D, 3 069 people) we show where a ring alone falls short (AUC 0.60), which is why Keel always pairs it with a check-in and the person's own baseline. All assumptions are listed in the repo's HONESTY.md.

## Beyond depression

We model the disease, not the whole human: a small mechanism of one condition, a personal baseline, a forecast and a learner. Swap the mechanism and the same loop can monitor and optimise care for Parkinson's (medication and DBS timing), Alzheimer's (carer alerts, daily structure) or type 2 diabetes (insulin dosing, habits). It grows out of our earlier StimIQ digital shadow for deep brain stimulation.

## Built with

Python, NumPy, FastAPI, scikit-learn and SHAP for the model; React, Three.js and Tailwind for the app; LaTeX for the whitepaper. Deployed as one Docker container on Render.

**Team:** Atte Laakso, Konsta Kiirikki, Nikolas Juhava, Qilun Li (Aalto University School of Science)
