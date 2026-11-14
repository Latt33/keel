"""FastAPI app. Run: uvicorn keel.api:app --reload --port 8000"""

from __future__ import annotations

from pathlib import Path

from fastapi import Header, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import clinic, items, live, oura, simulate, story

app = FastAPI(title="Keel", version="0.1")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class CheckIn(BaseModel):
    answers: dict[str, float] = Field(..., min_length=1, max_length=21)
    done: list[str] = []


class Action(BaseModel):
    action: str


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/story")
def get_story():
    return story.build()


@app.get("/api/items")
def get_items():
    return {"items": items.public(), "rotation": items.ROTATION}


def _session(x_keel_session: str | None) -> None:
    """Each browser tab gets its own copy of Aino's phone, so visitors don't move each other's patient."""
    live.session_id.set((x_keel_session or "default")[:64])


@app.get("/api/live")
def get_live(x_keel_session: str | None = Header(default=None)):
    _session(x_keel_session)
    return live.snapshot()


@app.post("/api/live/checkin")
def post_checkin(body: CheckIn, x_keel_session: str | None = Header(default=None)):
    _session(x_keel_session)
    return live.checkin(body.answers, body.done)


@app.post("/api/live/reset")
def post_reset(x_keel_session: str | None = Header(default=None)):
    _session(x_keel_session)
    return live.reset()


@app.get("/api/clinic")
def get_clinic():
    return clinic.roster()


@app.get("/api/clinic/{pid}")
def get_clinic_detail(pid: str):
    try:
        return clinic.detail(pid)
    except KeyError:
        raise HTTPException(404, "unknown patient")


@app.post("/api/clinic/{pid}/action")
def post_action(pid: str, body: Action):
    return clinic.act(pid, body.action)


@app.get("/api/evidence")
def get_evidence():
    import json
    here = Path(__file__).parent
    res = json.loads((here / "results.json").read_text())
    psy = here / "psyched_results.json"
    return {**res, "real_data": json.loads(psy.read_text()) if psy.exists() else None}


@app.get("/api/simulate")
def get_simulate(seed: int):
    """A fresh virtual patient (not from the evaluation cohort), lived with and without Keel."""
    return simulate.pair(seed)


_OURA = Path(__file__).resolve().parents[2] / "data" / "oura"


@app.get("/api/oura")
def get_oura():
    files = sorted([*_OURA.glob("*.json"), *_OURA.glob("*.csv")]) if _OURA.exists() else []
    if not files:
        raise HTTPException(404, "No Oura export in data/oura yet")
    try:
        return oura.replay(files)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.on_event("startup")
def warm():
    story.build()
    clinic.roster()
    live.reset()


# serve the built frontend if present (single-command demo)
_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="ui")
