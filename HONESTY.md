# HONESTY.md

Everything that is simulated, assumed, hand-tuned or reused, so nobody has to guess.

## Team

| Member | GitHub | Main contributions |
|---|---|---|
| Atte Laakso | Latt33 | Concept, model design, evaluation, story |
| _add teammates_ | | |

Built with heavy AI assistance (Claude) for code and copy, directed and reviewed by the team.

## What is real and runs end to end

* The closed loop itself: forecast, planner, Bayesian learner and escalation run live on every
  check-in in the phone view (`POST /api/live/checkin`) and update the clinic logic.
* The evaluation harness: 300 virtual patients × 4 policies × 180 days, reproducible with a seed.
* The PSYCHE-D analysis: a real public dataset, real cross-validated AUCs (README).
* Tests: `npm test` (model calibration, learner recovery, Pareto front, API loop).

## What is simulated or assumed

| What | Where | Why | What the real version needs |
|---|---|---|---|
| Every patient, including Aino, is a virtual patient | `backend/keel/sim.py` | No post-TMS home data exists in the open | Pilot with the TMS clinic: ring + check-ins from discharge |
| Relapse rates of the untreated cohort are fit to Senova et al. 2019 (rTMS durability meta-analysis) | `sim.py` constants, `tests/test_model.py` | Anchor the simulator to published numbers | Clinic’s own follow-up data |
| Ring signals are generated from the hidden symptom state; that they move *before* mood is an assumption based on Tonon et al. 2026 (actigraphy and relapse) | `sim.py` `passive_from`, `A_FAST` vs `A_SLOW` | Make the early-warning mechanism explicit and testable | Real Oura / Fitbit data; refit `forecast_weights.json` |
| Forecast weights (ring → PHQ points) are fit on the simulator, R² 0.92. Optimistic | `scripts/calibrate_forecast.py` | No real paired data | Refit on real data; PSYCHE-D shows the population floor (AUC 0.60) |
| Check-in: 21 domains in the structure of the Beck Depression Inventory (4 statements, scored 0–3), 3 a day on a 7-day rotation. The wording is our own, not the copyrighted BDI-II text, and is not validated. Answers map onto 5 latent dimensions on a PHQ-9-equivalent scale | `backend/keel/items.py` | Low burden, neutral wording | Licensed BDI-II items and a validation study |
| Effects of the six doses (0.5–1.4 PHQ points each, population prior) are hand-set, not taken from trials | `interventions.py` | Plausible, modest sizes | Literature priors per dose; the learner then personalises |
| Booster effect (5 sessions restore 80 % of lost TMS benefit plus a fading acute effect) is hand-set | `sim.py` `BOOST_*` | Rescue maintenance is supported in the literature but effect sizes vary | Clinic protocol and outcome data |
| Aino is seed 520, chosen because both of her worlds show the typical pattern clearly (relapse at day 60–95 without support, one early warning with Keel). Cohort numbers come from all 300 patients | `story.py`, `/tmp` search script described here | A clear demo story | n/a |
| Clinic list: fictional names, simulated lives, snapshot days picked for a realistic mix (2 urgent, 3 to check, 9 steady) | `clinic.py` `ROSTER` | Demo | Real roster |
| The house scene turns the model’s state into a daily routine (sleep, night waking, getting up late, going outside, sofa, clinic days). The routine rules are ours and illustrative; only the state behind them comes from the model | `frontend/src/house/HouseScene.tsx` | Show what the loop actually estimates, her day, without implying we can see inside her brain | – |
| The landing-page brain is a schematic of 5 symptom dimensions on 5 regions, shown only as an image of the treatment. Nothing is imaged | `frontend/src/brain/mapping.ts` | A recognisable picture of TMS | Clinic EEG/TMS-EEG could seed the personal baseline (future) |
| No login, no persistence; clinic actions live in memory | `clinic.py`, `live.py` | Hackathon scope | Auth, audit log, GDPR-grade storage |
| Clinic message on the phone ("Liisa from the clinic") is a template | `PhonePage.tsx` | Show the human end of the loop | Nurse-written message |
| Crisis line shown on the phone: MIELI 09 2525 0111 and 112 | `PhonePage.tsx` | Safety path always visible | Verify number and hours before any real use |

## Pre-existing material

| Item | Source | Licence |
|---|---|---|
| Idea of a mechanistic "digital shadow" + optimiser + clinician-in-the-loop, and the 3D brain approach | Our earlier hackathon project StimIQ (github.com/Latt33/StimIQ). No code copied; everything here was written during Junction 2026 | own work |
| `frontend/public/brain.glb` | "Brain" by maheshshinde777, Sketchfab (unused textures removed) | CC BY 4.0 |
| PSYCHE-D dataset (not committed) | Zenodo 5085146 | CC BY-NC 4.0 |
| Font | Geist via Fontsource (visual style modelled on neuralink.com; their Untitled Sans is commercial and not included) | SIL OFL |

## Design decision: the patient does not see a relapse risk

Telling someone in remission that relapse is likely can itself cause distress (labeling and nocebo
concerns in the depression-screening literature; "emotional burden" was a key concern of remitted
patients in Coenen et al., JMIR mHealth 2025). Our forecast is tuned to a 10 % false-alarm rate, so some
warnings will be wrong. So:

* The care team sees the risk, the forecast band and the reasons (clinic view).
* The patient sees her week against her own usual and what tomorrow's plan adds, in neutral words.
  The clinic contact is framed as a routine check-in.
* A two-week outlook can be switched on with the clinician; it has no relapse line and neutral colours.
* The crisis line is always visible.

This should be tested with patients and clinicians before any real use.

## Self-harm item

One weekly item asks about thoughts of self-harm (as in the BDI). Any answer above "I haven't had thoughts of harming myself" immediately shows crisis numbers on the phone and asks the clinic to call the same day. This path does not depend on the model. In the demo the "clinic call" is a message in the presenter panel only.

## Explainability (whitepaper, `docs/paper/keel.pdf`)

* Reasons on the clinic list are exact additive (Shapley) attributions of the linear body-signal model against the person's own baseline.
* The global SHAP figure explains a gradient-boosted surrogate trained on simulated patient-days. It shows the simulator's associations; on real data it is a hypothesis. Activity exposures get positive SHAP values because the planner prescribes more when risk is already high (confounding by indication), not because activities cause relapse.
* The PSYCHE-D SHAP figure is real data.
* Konsta Kiirikki's e-mail in the paper is assumed to follow the firstname.lastname@aalto.fi pattern; check it.
* The paper's code link (github.com/Latt33/keel) assumes the repo will be published there.

## Known limitations

* All outcome numbers in the app are simulation results. They show the mechanism works under stated
  assumptions, not that it works in patients.
* The forecast’s real-world accuracy is unknown; PSYCHE-D suggests population wearable models are weak,
  which is why Keel relies on personal baselines and daily check-ins.
* Learning is slow by design: dose effects are small next to day-to-day noise. After 6 months the
  learner ranks doses well (83 % top-2 in true top-3), but individual estimates stay uncertain.
* Not a medical device. Any clinical use would need clinical validation and CE marking (MDR class IIa
  or higher for decision support of this kind).
